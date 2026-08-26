-- FloStudio SEO action queue
-- Additive only: preserves all existing product, App Store, creative, and review records.

create table if not exists public.seo_action_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  action_type text not null check (action_type in ('website_brief', 'app_store_metadata', 'creative_brief', 'measurement_plan')),
  title text not null,
  description text not null default '',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'ready' check (status in ('ready', 'in_review', 'completed', 'archived')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists seo_action_tasks_scope_idx
  on public.seo_action_tasks(workspace_id, product_id, status, created_at desc);

alter table public.seo_action_tasks enable row level security;

create policy "Users manage their own SEO action tasks"
  on public.seo_action_tasks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
