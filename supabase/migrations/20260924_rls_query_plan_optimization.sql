-- Final performance pass: cover two nullable foreign keys with full indexes and
-- evaluate auth.uid() once per RLS query without changing any authorization predicate.

create index if not exists creative_experiment_matrices_product_full_idx
  on public.creative_experiment_matrices(product_id);
create index if not exists seo_destinations_product_full_idx
  on public.seo_destinations(product_id);

do $$
declare
  policy_record record;
  using_expression text;
  check_expression text;
begin
  for policy_record in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') like '%auth.uid()%' or coalesce(with_check, '') like '%auth.uid()%')
  loop
    using_expression := case
      when policy_record.qual is null then null
      else replace(policy_record.qual, 'auth.uid()', '(select auth.uid())')
    end;
    check_expression := case
      when policy_record.with_check is null then null
      else replace(policy_record.with_check, 'auth.uid()', '(select auth.uid())')
    end;

    if using_expression is not null and check_expression is not null then
      execute format('alter policy %I on %I.%I using (%s) with check (%s)', policy_record.policyname, policy_record.schemaname, policy_record.tablename, using_expression, check_expression);
    elsif using_expression is not null then
      execute format('alter policy %I on %I.%I using (%s)', policy_record.policyname, policy_record.schemaname, policy_record.tablename, using_expression);
    elsif check_expression is not null then
      execute format('alter policy %I on %I.%I with check (%s)', policy_record.policyname, policy_record.schemaname, policy_record.tablename, check_expression);
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
