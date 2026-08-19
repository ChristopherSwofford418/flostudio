-- FloStudio social publishing foundation: public destination metadata is separated
-- from encrypted service-only provider credentials. No raw OAuth token remains
-- browser-readable after this migration.

alter table public.connected_accounts
  drop column if exists access_token,
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null,
  add column if not exists provider_account_id text,
  add column if not exists account_type text,
  add column if not exists provider_page_id text,
  add column if not exists granted_scopes text[] not null default '{}',
  add column if not exists expires_at timestamptz,
  add column if not exists last_verified_at timestamptz,
  add column if not exists last_error_code text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists connected_accounts_owner_destination_key
  on public.connected_accounts (user_id, platform, provider_account_id)
  where provider_account_id is not null;

drop policy if exists "Users can delete their own connected accounts" on public.connected_accounts;
drop policy if exists "Users can insert their own connected accounts" on public.connected_accounts;
drop policy if exists "Users can view their own connected accounts" on public.connected_accounts;
drop policy if exists "Users can view their own connection metadata" on public.connected_accounts;
create policy "Users can view their own connection metadata"
  on public.connected_accounts for select
  using (auth.uid() = user_id);

create table if not exists public.social_oauth_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  platform text not null check (platform in ('facebook', 'instagram', 'linkedin', 'tiktok', 'twitter')),
  state_hash text not null unique,
  code_verifier text,
  provider_payload jsonb not null default '{}'::jsonb,
  status text not null default 'started' check (status in ('started', 'awaiting_selection', 'complete', 'failed', 'expired')),
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.social_oauth_states enable row level security;

create table if not exists public.social_credentials (
  id uuid primary key default gen_random_uuid(),
  connected_account_id uuid not null unique references public.connected_accounts(id) on delete cascade,
  encrypted_payload jsonb not null,
  token_expires_at timestamptz,
  refresh_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.social_credentials enable row level security;

create table if not exists public.social_publish_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  campaign_post_id uuid not null references public.campaign_posts(id) on delete cascade,
  connected_account_id uuid references public.connected_accounts(id) on delete set null,
  platform text not null check (platform in ('facebook', 'instagram', 'linkedin', 'tiktok', 'twitter')),
  status text not null default 'queued' check (status in ('queued', 'publishing', 'published', 'failed', 'needs_reauthorization')),
  request_snapshot jsonb not null default '{}'::jsonb,
  provider_response jsonb not null default '{}'::jsonb,
  provider_post_id text,
  provider_post_url text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.social_publish_attempts enable row level security;
drop policy if exists "Users can view their own social publish attempts" on public.social_publish_attempts;
create policy "Users can view their own social publish attempts"
  on public.social_publish_attempts for select
  using (auth.uid() = user_id);

alter table public.campaign_posts
  add column if not exists published_at timestamptz,
  add column if not exists provider_post_id text,
  add column if not exists provider_post_url text;
