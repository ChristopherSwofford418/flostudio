-- Per-app Search and AI Visibility evidence. Records only human-observed results and cited source URLs.
-- It never stores credentials, triggers crawlers, publishes content, or represents generated claims as facts.

create table if not exists public.search_visibility_evidence (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  engine text not null check (engine in ('google', 'bing', 'chatgpt', 'claude', 'gemini', 'perplexity', 'other')),
  prompt_text text not null,
  result_url text,
  cited_urls text[] not null default '{}',
  notes text not null default '',
  evidence_status text not null default 'observed' check (evidence_status in ('observed', 'needs_review', 'archived')),
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists search_visibility_evidence_workspace_product_idx
  on public.search_visibility_evidence (workspace_id, product_id, observed_at desc);

alter table public.search_visibility_evidence enable row level security;

drop policy if exists "Users manage their own search visibility evidence" on public.search_visibility_evidence;
create policy "Users manage their own search visibility evidence"
  on public.search_visibility_evidence for all
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
