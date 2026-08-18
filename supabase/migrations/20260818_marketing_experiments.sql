-- FloStudio: Research-backed creative and ASO experiment ledger.
-- Stores human-defined hypotheses and real observations only. No synthetic performance data.

create table if not exists public.marketing_experiments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  title text not null,
  channel text not null check (channel in ('store_listing', 'paid_social', 'organic_social', 'seo', 'email', 'landing_page')),
  objective text not null check (objective in ('conversion_rate', 'install_volume', 'engagement', 'retention', 'revenue', 'learning')),
  primary_metric text not null,
  hypothesis text not null,
  status text not null default 'planned' check (status in ('planned', 'ready', 'running', 'paused', 'completed', 'archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.experiment_variants (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.marketing_experiments(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  media_asset_id uuid references public.media_assets(id) on delete set null,
  concept_id uuid references public.campaign_concepts(id) on delete set null,
  label text not null,
  change_summary text not null,
  hypothesis text,
  is_control boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'ready', 'live', 'winner', 'loser', 'inconclusive')),
  metrics jsonb not null default '{}'::jsonb,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketing_experiments_workspace_product_idx on public.marketing_experiments(workspace_id, product_id, created_at desc);
create index if not exists experiment_variants_experiment_idx on public.experiment_variants(experiment_id, created_at asc);

alter table public.marketing_experiments enable row level security;
alter table public.experiment_variants enable row level security;

drop policy if exists "Users manage their own marketing experiments" on public.marketing_experiments;
create policy "Users manage their own marketing experiments"
  on public.marketing_experiments for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage their own experiment variants" on public.experiment_variants;
create policy "Users manage their own experiment variants"
  on public.experiment_variants for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
