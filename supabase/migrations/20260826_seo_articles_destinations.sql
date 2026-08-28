create extension if not exists pgcrypto;

create table if not exists public.seo_destinations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  website_url text not null default '',
  blog_base_path text not null default '/blog',
  destination_type text not null default 'manual_export' check (destination_type in ('manual_export','wordpress','webflow','shopify','webhook','custom_cms')),
  publish_mode text not null default 'review_only' check (publish_mode in ('review_only','approved_push')),
  status text not null default 'needs_setup' check (status in ('needs_setup','ready_for_review','connected')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create table if not exists public.seo_articles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  destination_id uuid references public.seo_destinations(id) on delete set null,
  title text not null default '',
  slug text not null default '',
  excerpt text not null default '',
  meta_title text not null default '',
  meta_description text not null default '',
  focus_keyword text not null default '',
  content_markdown text not null default '',
  internal_links jsonb not null default '[]'::jsonb,
  faqs jsonb not null default '[]'::jsonb,
  source_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','ready_for_review','approved','queued','pushed')),
  push_mode text not null default 'review_only' check (push_mode in ('review_only','approved_push')),
  pushed_url text,
  pushed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists seo_destinations_product_idx on public.seo_destinations(user_id, product_id);
create index if not exists seo_articles_product_status_idx on public.seo_articles(user_id, product_id, status, created_at desc);

alter table public.seo_destinations enable row level security;
alter table public.seo_articles enable row level security;

drop policy if exists seo_destinations_owner_select on public.seo_destinations;
create policy seo_destinations_owner_select on public.seo_destinations for select using (auth.uid() = user_id);
drop policy if exists seo_destinations_owner_insert on public.seo_destinations;
create policy seo_destinations_owner_insert on public.seo_destinations for insert with check (auth.uid() = user_id);
drop policy if exists seo_destinations_owner_update on public.seo_destinations;
create policy seo_destinations_owner_update on public.seo_destinations for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists seo_articles_owner_select on public.seo_articles;
create policy seo_articles_owner_select on public.seo_articles for select using (auth.uid() = user_id);
drop policy if exists seo_articles_owner_insert on public.seo_articles;
create policy seo_articles_owner_insert on public.seo_articles for insert with check (auth.uid() = user_id);
drop policy if exists seo_articles_owner_update on public.seo_articles;
create policy seo_articles_owner_update on public.seo_articles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
