-- Public short-form research library. Stores attributed source links and original adaptation notes only.
-- No credentials, downloaded media, provider actions, schedules, or publication state are stored here.

create table if not exists public.shortform_research_examples (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  platform text not null check (platform in ('TikTok', 'Instagram', 'Instagram Reels', 'YouTube Shorts', 'YouTube', 'Other')),
  source_url text not null,
  source_creator text,
  format_pattern text not null,
  observed_evidence text not null default 'Not displayed',
  original_adaptation text not null,
  research_status text not null default 'source_linked' check (research_status in ('source_linked', 'needs_review', 'archived')),
  researched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, source_url)
);

create index if not exists shortform_research_examples_workspace_product_idx
  on public.shortform_research_examples (workspace_id, product_id, researched_at desc);

alter table public.shortform_research_examples enable row level security;

drop policy if exists "Users manage their own shortform research examples" on public.shortform_research_examples;
create policy "Users manage their own shortform research examples"
  on public.shortform_research_examples for all
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
