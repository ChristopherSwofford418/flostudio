-- Protect Flo Studio tokens from browser-side credit, tier, and entitlement escalation.
-- Render charges and automatic failure refunds are settled only by the server using service_role.

alter table public.token_transactions
  add column if not exists related_transaction_id uuid references public.token_transactions(id) on delete restrict;

create index if not exists token_transactions_user_created_idx
  on public.token_transactions(user_id, created_at desc);
create index if not exists token_transactions_related_idx
  on public.token_transactions(related_transaction_id)
  where related_transaction_id is not null;

-- Existing first-run bootstrap is intentionally constrained to the documented free allowance.
drop policy if exists "Users select own token balance" on public.user_tokens;
create policy "Users select own token balance"
  on public.user_tokens for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users initialize own token balance" on public.user_tokens;
create policy "Users initialize own token balance"
  on public.user_tokens for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and balance = 50
    and tier = 'free'
    and unlimited = false
  );

drop policy if exists "Users update own token balance" on public.user_tokens;
drop policy if exists "Users debit own token balance" on public.user_tokens;

drop policy if exists "Users select own token ledger" on public.token_transactions;
create policy "Users select own token ledger"
  on public.token_transactions for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users add own token ledger entries" on public.token_transactions;
drop policy if exists "Users record own token debits" on public.token_transactions;

-- Serialize a provider render debit and return the balance that should be displayed to the user.
create or replace function public.begin_render_token_charge(
  target_user_id uuid,
  target_cost integer,
  target_action text
)
returns table (transaction_id uuid, balance integer, unlimited boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  token_row public.user_tokens;
  charge_id uuid;
  clean_action text;
begin
  if target_user_id is null then
    raise exception 'A token charge requires an authenticated user';
  end if;
  if target_cost not in (10, 30, 60, 100) then
    raise exception 'The requested render token cost is not supported';
  end if;

  insert into public.user_tokens (user_id, balance, tier, unlimited)
  values (target_user_id, 50, 'free', false)
  on conflict (user_id) do nothing;

  select * into token_row
  from public.user_tokens
  where user_id = target_user_id
  for update;

  if token_row.unlimited then
    return query select null::uuid, token_row.balance, true;
    return;
  end if;
  if token_row.balance < target_cost then
    raise exception 'INSUFFICIENT_TOKENS: Need % tokens for this render, but only % remain.', target_cost, token_row.balance;
  end if;

  clean_action := left(coalesce(nullif(trim(target_action), ''), 'AI render'), 120);
  update public.user_tokens
  set balance = token_row.balance - target_cost,
      updated_at = timezone('utc', now())
  where user_id = target_user_id;

  insert into public.token_transactions (user_id, amount, action_type, description)
  values (target_user_id, -target_cost, 'render_charge', clean_action)
  returning id into charge_id;

  return query select charge_id, token_row.balance - target_cost, false;
end;
$$;

-- A refund may only be applied to a real prior server-created render debit and cannot exceed it.
create or replace function public.refund_render_token_charge(
  target_user_id uuid,
  target_transaction_id uuid,
  target_amount integer,
  target_reason text default null
)
returns table (balance integer, unlimited boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  debit public.token_transactions;
  token_row public.user_tokens;
  already_refunded integer;
  clean_reason text;
begin
  if target_transaction_id is null or target_amount <= 0 then
    raise exception 'A valid render debit and refund amount are required';
  end if;

  select * into debit
  from public.token_transactions
  where id = target_transaction_id
    and user_id = target_user_id
    and action_type = 'render_charge'
    and amount < 0
  for update;
  if debit.id is null then
    raise exception 'The render charge cannot be refunded';
  end if;

  select coalesce(sum(amount), 0)::integer into already_refunded
  from public.token_transactions
  where related_transaction_id = debit.id
    and action_type = 'render_refund';
  if already_refunded + target_amount > abs(debit.amount) then
    raise exception 'The requested refund exceeds the original render charge';
  end if;

  select * into token_row
  from public.user_tokens
  where user_id = debit.user_id
  for update;
  if not found then
    raise exception 'The associated token balance no longer exists';
  end if;
  if token_row.unlimited then
    return query select token_row.balance, true;
    return;
  end if;

  clean_reason := left(coalesce(nullif(trim(target_reason), ''), 'Provider failed before output delivery'), 240);
  update public.user_tokens
  set balance = token_row.balance + target_amount,
      updated_at = timezone('utc', now())
  where user_id = debit.user_id;

  insert into public.token_transactions (user_id, amount, action_type, description, related_transaction_id)
  values (debit.user_id, target_amount, 'render_refund', clean_reason, debit.id);

  return query select token_row.balance + target_amount, false;
end;
$$;

revoke all on function public.begin_render_token_charge(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.refund_render_token_charge(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.begin_render_token_charge(uuid, integer, text) to service_role;
grant execute on function public.refund_render_token_charge(uuid, uuid, integer, text) to service_role;

notify pgrst, 'reload schema';
