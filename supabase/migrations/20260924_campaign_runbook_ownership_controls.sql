-- Additive Campaign Runbook ownership controls.
-- A deletion marker prevents a deleted runbook from being silently recreated by ordinary reads.
-- It contains no creative, learning, provider, or credential data.

create table if not exists public.campaign_runbook_deletions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  campaign_id uuid not null unique references public.campaigns(id) on delete cascade,
  deleted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.campaign_runbook_deletions enable row level security;

create index if not exists campaign_runbook_deletions_workspace_product_idx
  on public.campaign_runbook_deletions(workspace_id, product_id, deleted_at desc);

-- The marker belongs only to the same owner, app, workspace, and campaign.
drop policy if exists "Users manage their own runbook deletion markers" on public.campaign_runbook_deletions;
create policy "Users manage their own runbook deletion markers"
  on public.campaign_runbook_deletions for all
  to authenticated
  using (
    (select auth.uid()) = public.campaign_runbook_deletions.user_id
    and exists (
      select 1
      from public.campaigns c
      join public.products p on p.id = c.product_id
      where c.id = public.campaign_runbook_deletions.campaign_id
        and c.user_id = (select auth.uid())
        and c.workspace_id = public.campaign_runbook_deletions.workspace_id
        and c.product_id = public.campaign_runbook_deletions.product_id
        and p.user_id = (select auth.uid())
        and p.workspace_id = public.campaign_runbook_deletions.workspace_id
    )
  )
  with check (
    (select auth.uid()) = public.campaign_runbook_deletions.user_id
    and exists (
      select 1
      from public.campaigns c
      join public.products p on p.id = c.product_id
      where c.id = public.campaign_runbook_deletions.campaign_id
        and c.user_id = (select auth.uid())
        and c.workspace_id = public.campaign_runbook_deletions.workspace_id
        and c.product_id = public.campaign_runbook_deletions.product_id
        and p.user_id = (select auth.uid())
        and p.workspace_id = public.campaign_runbook_deletions.workspace_id
    )
  );

-- Retain the existing audit vocabulary and add the two explicit ownership actions.
alter table public.creative_memory_events drop constraint if exists creative_memory_events_event_type_check;
alter table public.creative_memory_events add constraint creative_memory_events_event_type_check check (
  event_type = any (array[
    'brand_dna_saved', 'product_ingested', 'campaign_created', 'concept_generated',
    'concept_selected', 'concept_edited', 'post_created', 'asset_rendered', 'asset_attached',
    'post_approved', 'post_rejected', 'post_rewritten', 'post_published', 'campaign_scheduled',
    'outcome_recorded', 'experiment_created', 'variant_created', 'experiment_outcome_recorded',
    'creative_experiment_matrix_created', 'runbook_created', 'runbook_recreated', 'runbook_deleted',
    'runbook_paused', 'runbook_reopened', 'runbook_archived', 'review_decision_recorded',
    'learning_statement_saved', 'runbook_learning_promoted'
  ])
);

notify pgrst, 'reload schema';
