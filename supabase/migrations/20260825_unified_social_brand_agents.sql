-- FloStudio unified social publishing and app-aware brand-agent foundation.
-- This migration is strictly additive: existing products, imports, native channel records,
-- campaign posts, assets, and publishing workflows remain unchanged.

create table if not exists public.unified_social_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  provider text not null default 'ayrshare' check (provider = 'ayrshare'),
  provider_profile_id text,
  provider_ref_id text,
  encrypted_profile_key jsonb not null,
  profile_title text not null,
  status text not null default 'created' check (status in ('created', 'connection_pending', 'connected', 'needs_reauthorization', 'error')),
  connected_platforms text[] not null default '{}',
  account_snapshot jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table if not exists public.app_brand_agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  product_id uuid not null references public.products(id) on delete cascade,
  agent_name text,
  brand_voice text,
  primary_audience text,
  value_propositions text[] not null default '{}',
  proof_points text[] not null default '{}',
  approved_topics text[] not null default '{}',
  prohibited_claims text[] not null default '{}',
  default_hashtags text[] not null default '{}',
  source_snapshot jsonb not null default '{}'::jsonb,
  learned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create table if not exists public.app_channel_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  product_id uuid not null references public.products(id) on delete cascade,
  unified_social_profile_id uuid references public.unified_social_profiles(id) on delete set null,
  platform text not null check (platform in ('bluesky', 'facebook', 'gmb', 'instagram', 'linkedin', 'pinterest', 'reddit', 'snapchat', 'telegram', 'threads', 'tiktok', 'twitter', 'youtube')),
  provider_account_id text,
  provider_account_name text,
  provider_handle text,
  enabled boolean not null default false,
  approval_mode text not null default 'review' check (approval_mode in ('review', 'scheduled_draft', 'approved_rule')),
  tone text,
  audience text,
  default_cta text,
  preferred_formats text[] not null default '{}',
  hashtag_rules jsonb not null default '{}'::jsonb,
  schedule_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_id, platform)
);

create table if not exists public.ai_social_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  product_id uuid not null references public.products(id) on delete cascade,
  brand_agent_id uuid references public.app_brand_agents(id) on delete set null,
  channel_profile_id uuid references public.app_channel_profiles(id) on delete set null,
  platform text not null,
  media_kind text not null check (media_kind in ('image', 'video', 'text')),
  media_url text,
  media_asset_id text,
  purpose text,
  hook text,
  caption text not null,
  hashtags text[] not null default '{}',
  call_to_action text,
  platform_notes text,
  prompt_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'ready_for_review', 'approved', 'scheduled', 'published', 'rejected')),
  scheduled_at timestamptz,
  provider_post_id text,
  provider_post_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_brand_agents_product_idx on public.app_brand_agents(product_id, user_id);
create index if not exists app_channel_profiles_product_idx on public.app_channel_profiles(product_id, user_id, platform);
create index if not exists ai_social_drafts_product_idx on public.ai_social_drafts(product_id, user_id, created_at desc);

alter table public.unified_social_profiles enable row level security;
alter table public.app_brand_agents enable row level security;
alter table public.app_channel_profiles enable row level security;
alter table public.ai_social_drafts enable row level security;

drop policy if exists "Users can view own unified social profiles" on public.unified_social_profiles;
create policy "Users can view own unified social profiles" on public.unified_social_profiles for select using (auth.uid() = user_id);

drop policy if exists "Users can view own app brand agents" on public.app_brand_agents;
create policy "Users can view own app brand agents" on public.app_brand_agents for select using (auth.uid() = user_id);

drop policy if exists "Users can view own app channel profiles" on public.app_channel_profiles;
create policy "Users can view own app channel profiles" on public.app_channel_profiles for select using (auth.uid() = user_id);

drop policy if exists "Users can view own AI social drafts" on public.ai_social_drafts;
create policy "Users can view own AI social drafts" on public.ai_social_drafts for select using (auth.uid() = user_id);
