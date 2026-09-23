-- Flo Momentum System
-- Additive, evidence-backed Campaign Runbooks. This migration never creates progress from
-- tokens, routes, local storage, generation requests, or social publishing state.

alter table public.campaign_posts
  add column if not exists concept_id uuid references public.campaign_concepts(id) on delete set null;

create unique index if not exists campaign_posts_campaign_concept_platform_unique
  on public.campaign_posts(campaign_id, concept_id, platform)
  where concept_id is not null;

create table if not exists public.campaign_runbooks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  campaign_id uuid not null unique references public.campaigns(id) on delete cascade,
  outcome_statement text,
  chosen_focus text,
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'archived')),
  stage_overrides jsonb not null default '{}'::jsonb,
  first_major_win_at timestamptz,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_runbook_checkpoints (
  id uuid primary key default gen_random_uuid(),
  runbook_id uuid not null references public.campaign_runbooks(id) on delete cascade,
  stage_key text not null check (stage_key in ('product_truth', 'creative_thesis', 'creative_family', 'human_review', 'controlled_experiment', 'verified_learning', 'reusable_runbook')),
  status text not null check (status in ('locked', 'available', 'in_progress', 'complete', 'paused', 'not_applicable')),
  evidence_type text,
  evidence_id uuid,
  evidence_summary text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(runbook_id, stage_key)
);

create table if not exists public.campaign_runbook_reflections (
  id uuid primary key default gen_random_uuid(),
  runbook_id uuid not null references public.campaign_runbooks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('decision', 'review', 'learning', 'pause', 'archive')),
  prompt text not null,
  response text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_review_decisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  runbook_id uuid references public.campaign_runbooks(id) on delete set null,
  target_type text not null check (target_type in ('campaign_post', 'media_asset')),
  campaign_post_id uuid references public.campaign_posts(id) on delete cascade,
  media_asset_id uuid references public.media_assets(id) on delete cascade,
  decision text not null check (decision in ('approved', 'needs_revision', 'rejected', 'on_hold')),
  reason text,
  created_at timestamptz not null default now(),
  check (
    (target_type = 'campaign_post' and campaign_post_id is not null and media_asset_id is null)
    or
    (target_type = 'media_asset' and media_asset_id is not null and campaign_post_id is null)
  )
);

create table if not exists public.experiment_learning_statements (
  id uuid primary key default gen_random_uuid(),
  runbook_id uuid not null references public.campaign_runbooks(id) on delete cascade,
  experiment_id uuid not null references public.marketing_experiments(id) on delete cascade,
  experiment_variant_id uuid references public.experiment_variants(id) on delete set null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  what_changed text not null,
  evidence_summary text not null,
  next_action text not null,
  promoted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(runbook_id, experiment_id)
);

create index if not exists campaign_runbooks_workspace_product_status_idx
  on public.campaign_runbooks(workspace_id, product_id, status, created_at desc);
create index if not exists campaign_runbook_checkpoints_runbook_idx
  on public.campaign_runbook_checkpoints(runbook_id, stage_key);
create index if not exists campaign_runbook_reflections_runbook_idx
  on public.campaign_runbook_reflections(runbook_id, created_at desc);
create index if not exists campaign_review_decisions_campaign_target_idx
  on public.campaign_review_decisions(workspace_id, product_id, campaign_id, target_type, created_at desc);
create index if not exists experiment_learning_statements_runbook_idx
  on public.experiment_learning_statements(runbook_id, created_at desc);

create or replace function public.set_campaign_runbook_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists campaign_runbooks_set_updated_at on public.campaign_runbooks;
create trigger campaign_runbooks_set_updated_at
before update on public.campaign_runbooks
for each row execute function public.set_campaign_runbook_updated_at();

drop trigger if exists campaign_runbook_checkpoints_set_updated_at on public.campaign_runbook_checkpoints;
create trigger campaign_runbook_checkpoints_set_updated_at
before update on public.campaign_runbook_checkpoints
for each row execute function public.set_campaign_runbook_updated_at();

drop trigger if exists experiment_learning_statements_set_updated_at on public.experiment_learning_statements;
create trigger experiment_learning_statements_set_updated_at
before update on public.experiment_learning_statements
for each row execute function public.set_campaign_runbook_updated_at();

alter table public.campaign_runbooks enable row level security;
alter table public.campaign_runbook_checkpoints enable row level security;
alter table public.campaign_runbook_reflections enable row level security;
alter table public.campaign_review_decisions enable row level security;
alter table public.experiment_learning_statements enable row level security;

drop policy if exists "Users manage their own campaign runbooks" on public.campaign_runbooks;
create policy "Users manage their own campaign runbooks"
  on public.campaign_runbooks for all
  using (
    auth.uid() = public.campaign_runbooks.user_id
    and exists (
      select 1 from public.campaigns c
      join public.products p on p.id = c.product_id
      where c.id = public.campaign_runbooks.campaign_id
        and c.user_id = auth.uid()
        and c.workspace_id = public.campaign_runbooks.workspace_id
        and c.product_id = public.campaign_runbooks.product_id
        and p.user_id = auth.uid()
        and p.workspace_id = public.campaign_runbooks.workspace_id
    )
  )
  with check (
    auth.uid() = public.campaign_runbooks.user_id
    and exists (
      select 1 from public.campaigns c
      join public.products p on p.id = c.product_id
      where c.id = public.campaign_runbooks.campaign_id
        and c.user_id = auth.uid()
        and c.workspace_id = public.campaign_runbooks.workspace_id
        and c.product_id = public.campaign_runbooks.product_id
        and p.user_id = auth.uid()
        and p.workspace_id = public.campaign_runbooks.workspace_id
    )
  );
drop policy if exists "Users manage their own runbook checkpoints" on public.campaign_runbook_checkpoints;
create policy "Users manage their own runbook checkpoints"
  on public.campaign_runbook_checkpoints for all
  using (exists (select 1 from public.campaign_runbooks r where r.id = public.campaign_runbook_checkpoints.runbook_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.campaign_runbooks r where r.id = public.campaign_runbook_checkpoints.runbook_id and r.user_id = auth.uid()));
drop policy if exists "Users manage their own runbook reflections" on public.campaign_runbook_reflections;
create policy "Users manage their own runbook reflections"
  on public.campaign_runbook_reflections for all
  using (auth.uid() = public.campaign_runbook_reflections.user_id and exists (select 1 from public.campaign_runbooks r where r.id = public.campaign_runbook_reflections.runbook_id and r.user_id = auth.uid()))
  with check (auth.uid() = public.campaign_runbook_reflections.user_id and exists (select 1 from public.campaign_runbooks r where r.id = public.campaign_runbook_reflections.runbook_id and r.user_id = auth.uid()));
drop policy if exists "Users manage their own campaign review decisions" on public.campaign_review_decisions;
create policy "Users manage their own campaign review decisions"
  on public.campaign_review_decisions for all
  using (
    auth.uid() = public.campaign_review_decisions.user_id
    and exists (select 1 from public.campaigns c join public.products p on p.id = c.product_id where c.id = public.campaign_review_decisions.campaign_id and c.user_id = auth.uid() and c.workspace_id = public.campaign_review_decisions.workspace_id and c.product_id = public.campaign_review_decisions.product_id and p.user_id = auth.uid() and p.workspace_id = public.campaign_review_decisions.workspace_id)
  )
  with check (
    auth.uid() = public.campaign_review_decisions.user_id
    and exists (select 1 from public.campaigns c join public.products p on p.id = c.product_id where c.id = public.campaign_review_decisions.campaign_id and c.user_id = auth.uid() and c.workspace_id = public.campaign_review_decisions.workspace_id and c.product_id = public.campaign_review_decisions.product_id and p.user_id = auth.uid() and p.workspace_id = public.campaign_review_decisions.workspace_id)
  );
drop policy if exists "Users manage their own experiment learning statements" on public.experiment_learning_statements;
create policy "Users manage their own experiment learning statements"
  on public.experiment_learning_statements for all
  using (
    auth.uid() = public.experiment_learning_statements.user_id
    and exists (select 1 from public.campaign_runbooks r join public.marketing_experiments e on e.id = public.experiment_learning_statements.experiment_id where r.id = public.experiment_learning_statements.runbook_id and r.user_id = auth.uid() and r.workspace_id = public.experiment_learning_statements.workspace_id and r.product_id = public.experiment_learning_statements.product_id and e.user_id = auth.uid() and e.workspace_id = public.experiment_learning_statements.workspace_id and e.product_id = public.experiment_learning_statements.product_id)
  )
  with check (
    auth.uid() = public.experiment_learning_statements.user_id
    and exists (select 1 from public.campaign_runbooks r join public.marketing_experiments e on e.id = public.experiment_learning_statements.experiment_id where r.id = public.experiment_learning_statements.runbook_id and r.user_id = auth.uid() and r.workspace_id = public.experiment_learning_statements.workspace_id and r.product_id = public.experiment_learning_statements.product_id and e.user_id = auth.uid() and e.workspace_id = public.experiment_learning_statements.workspace_id and e.product_id = public.experiment_learning_statements.product_id)
  );
drop policy if exists "Users manage their own campaign learning reuse preferences" on public.campaign_learning_reuse_preferences;
create policy "Users manage their own campaign learning reuse preferences"
  on public.campaign_learning_reuse_preferences for all
  using (
    auth.uid() = public.campaign_learning_reuse_preferences.user_id
    and exists (select 1 from public.products p where p.id = public.campaign_learning_reuse_preferences.target_product_id and p.user_id = auth.uid() and p.workspace_id = public.campaign_learning_reuse_preferences.workspace_id)
    and exists (select 1 from public.experiment_learning_statements s where s.id = public.campaign_learning_reuse_preferences.source_learning_statement_id and s.user_id = auth.uid() and s.workspace_id = public.campaign_learning_reuse_preferences.workspace_id)
  )
  with check (
    auth.uid() = public.campaign_learning_reuse_preferences.user_id
    and exists (select 1 from public.products p where p.id = public.campaign_learning_reuse_preferences.target_product_id and p.user_id = auth.uid() and p.workspace_id = public.campaign_learning_reuse_preferences.workspace_id)
    and exists (select 1 from public.experiment_learning_statements s where s.id = public.campaign_learning_reuse_preferences.source_learning_statement_id and s.user_id = auth.uid() and s.workspace_id = public.campaign_learning_reuse_preferences.workspace_id)
  );