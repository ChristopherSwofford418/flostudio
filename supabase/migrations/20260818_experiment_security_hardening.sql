-- Ensure experiment records cannot be attached to another tenant's product or workspace.

drop policy if exists "Users manage their own marketing experiments" on public.marketing_experiments;
create policy "Users manage their own marketing experiments"
  on public.marketing_experiments for all
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.products p
      where p.id = product_id and p.user_id = auth.uid() and p.workspace_id = workspace_id
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.products p
      where p.id = product_id and p.user_id = auth.uid() and p.workspace_id = workspace_id
    )
  );

drop policy if exists "Users manage their own experiment variants" on public.experiment_variants;
create policy "Users manage their own experiment variants"
  on public.experiment_variants for all
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.marketing_experiments e
      where e.id = experiment_id and e.user_id = auth.uid() and e.workspace_id = workspace_id
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.marketing_experiments e
      where e.id = experiment_id and e.user_id = auth.uid() and e.workspace_id = workspace_id
    )
  );

alter table public.creative_memory_events drop constraint if exists creative_memory_events_event_type_check;
alter table public.creative_memory_events add constraint creative_memory_events_event_type_check check (
  event_type = any (array[
    'brand_dna_saved', 'product_ingested', 'campaign_created', 'concept_generated',
    'concept_selected', 'post_created', 'asset_rendered', 'asset_attached',
    'post_approved', 'post_rejected', 'post_rewritten', 'campaign_scheduled',
    'outcome_recorded', 'experiment_created', 'variant_created', 'experiment_outcome_recorded'
  ])
);
