-- FloStudio Growth Loop Foundation
-- Additive only: this migration creates new records alongside existing portfolio,
-- campaign, creative, and experiment data. It does not alter or delete existing rows.

create table if not exists public.creative_experiment_matrices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  experiment_id uuid not null unique references public.marketing_experiments(id) on delete cascade,
  title text not null,
  inputs jsonb not null default '{}'::jsonb,
  status text not null default 'planned' check (status in ('planned', 'ready', 'running', 'paused', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creative_experiment_cells (
  id uuid primary key default gen_random_uuid(),
  matrix_id uuid not null references public.creative_experiment_matrices(id) on delete cascade,
  experiment_variant_id uuid not null unique references public.experiment_variants(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  sequence integer not null,
  hook text not null,
  actor_id text,
  actor_name text,
  voice_id text,
  voice_name text,
  format text not null default '9:16',
  placement text not null default 'paid_social',
  render_state text not null default 'planned' check (render_state in ('planned', 'rendering', 'ready', 'failed')),
  review_state text not null default 'draft' check (review_state in ('draft', 'ready', 'approved', 'rejected')),
  lineage jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (matrix_id, sequence)
);

create table if not exists public.performance_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('meta_ads', 'tiktok_ads', 'google_ads', 'ga4')),
  status text not null default 'setup_required' check (status in ('setup_required', 'ready_to_authorize', 'connected', 'needs_reauthorization', 'error')),
  account_name text,
  account_id text,
  last_verified_at timestamptz,
  last_sync_at timestamptz,
  last_error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id, platform)
);

create table if not exists public.creative_performance_observations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  experiment_variant_id uuid references public.experiment_variants(id) on delete set null,
  performance_connection_id uuid references public.performance_connections(id) on delete set null,
  platform text not null,
  observed_at timestamptz not null,
  source text not null,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists creative_experiment_matrices_product_idx
  on public.creative_experiment_matrices(workspace_id, product_id, created_at desc);
create index if not exists creative_experiment_cells_matrix_idx
  on public.creative_experiment_cells(matrix_id, sequence asc);
create index if not exists performance_connections_workspace_idx
  on public.performance_connections(workspace_id, user_id, platform);
create index if not exists creative_performance_observations_variant_idx
  on public.creative_performance_observations(experiment_variant_id, observed_at desc);

alter table public.creative_experiment_matrices enable row level security;
alter table public.creative_experiment_cells enable row level security;
alter table public.performance_connections enable row level security;
alter table public.creative_performance_observations enable row level security;

create policy "Users manage their own creative experiment matrices"
  on public.creative_experiment_matrices for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their own creative experiment cells"
  on public.creative_experiment_cells for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their own performance connections"
  on public.performance_connections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their own creative performance observations"
  on public.creative_performance_observations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
