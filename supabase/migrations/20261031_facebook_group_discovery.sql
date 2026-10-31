-- Public Facebook Group Discovery library.
-- Stores source links and operator-facing research evidence only.
-- It never stores group membership, posts, private data, credentials, outreach, or publication state.

create table if not exists public.facebook_group_discoveries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  group_name text not null check (char_length(trim(group_name)) between 1 and 240),
  group_url text not null check (group_url ~* '^https?://(www\.)?facebook\.com/groups/[a-z0-9._-]+/?$'),
  rank smallint not null check (rank between 1 and 20),
  relevance_summary text not null check (char_length(trim(relevance_summary)) between 1 and 600),
  evidence_basis text not null check (char_length(trim(evidence_basis)) between 1 and 800),
  public_access_note text not null default 'privacy not verified' check (public_access_note in ('publicly visible', 'login may be required', 'privacy not verified')),
  source_url text not null check (source_url ~* '^https?://'),
  research_status text not null default 'source_linked' check (research_status in ('source_linked', 'needs_review', 'archived')),
  researched_at timestamptz not null default now(),
  collected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, group_url),
  unique (product_id, rank)
);

comment on table public.facebook_group_discoveries is
  'Public source-link research for app-specific Facebook group discovery. No credentials, group member data, messages, post content, join actions, outreach, or publishing state.';

create index if not exists facebook_group_discoveries_workspace_product_rank_idx
  on public.facebook_group_discoveries (workspace_id, product_id, rank);
create index if not exists facebook_group_discoveries_user_idx
  on public.facebook_group_discoveries (user_id);

alter table public.facebook_group_discoveries enable row level security;

drop policy if exists facebook_group_discoveries_owner_scope on public.facebook_group_discoveries;
create policy facebook_group_discoveries_owner_scope
  on public.facebook_group_discoveries
  for all to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.products as product
      where product.id = facebook_group_discoveries.product_id
        and product.workspace_id = facebook_group_discoveries.workspace_id
        and product.user_id = (select auth.uid())
    )
  )
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.products as product
      where product.id = facebook_group_discoveries.product_id
        and product.workspace_id = facebook_group_discoveries.workspace_id
        and product.user_id = (select auth.uid())
    )
  );
