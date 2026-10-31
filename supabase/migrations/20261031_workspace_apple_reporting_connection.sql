-- One workspace-level Apple Team reporting key, separate from existing per-app App Store Connect connections.
-- It is for read-only Sales and Trends / already-generated Analytics Reports retrieval and never replaces app-specific vault entries.

create table if not exists public.workspace_app_store_reporting_connections (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  issuer_id text not null,
  key_id text not null,
  vendor_number text not null,
  encrypted_private_key jsonb not null,
  status text not null default 'connected' check (status in ('connected', 'error', 'revoked')),
  last_error text,
  last_synced_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.app_store_reporting_metrics (
  product_id uuid primary key references public.products(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  metrics jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('available', 'pending', 'unavailable', 'error')),
  last_error text,
  last_synced_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists app_store_reporting_metrics_workspace_updated_idx
  on public.app_store_reporting_metrics (workspace_id, updated_at desc);

alter table public.workspace_app_store_reporting_connections enable row level security;
alter table public.app_store_reporting_metrics enable row level security;

revoke all on table public.workspace_app_store_reporting_connections from anon, authenticated;
revoke all on table public.app_store_reporting_metrics from anon;
grant select, insert, update on table public.app_store_reporting_metrics to authenticated;

-- Reporting snapshots contain no credential material; owners can read their own selected-app snapshot only.
create policy app_store_reporting_metrics_select_app_scope on public.app_store_reporting_metrics
  for select to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.products as product
      where product.id = app_store_reporting_metrics.product_id
        and product.workspace_id = app_store_reporting_metrics.workspace_id
        and product.user_id = auth.uid()
    )
  );

create policy app_store_reporting_metrics_insert_app_scope on public.app_store_reporting_metrics
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.products as product
      where product.id = app_store_reporting_metrics.product_id
        and product.workspace_id = app_store_reporting_metrics.workspace_id
        and product.user_id = auth.uid()
    )
  );

create policy app_store_reporting_metrics_update_app_scope on public.app_store_reporting_metrics
  for update to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.products as product
      where product.id = app_store_reporting_metrics.product_id
        and product.workspace_id = app_store_reporting_metrics.workspace_id
        and product.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.products as product
      where product.id = app_store_reporting_metrics.product_id
        and product.workspace_id = app_store_reporting_metrics.workspace_id
        and product.user_id = auth.uid()
    )
  );

create or replace function public.assert_workspace_app_store_reporting_admin(target_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_workspace_id is null or not public.is_workspace_admin(target_workspace_id) then
    raise exception 'Apple reporting access is not authorized for this workspace';
  end if;
end;
$$;

create or replace function public.save_workspace_app_store_reporting_connection(
  target_workspace_id uuid,
  target_user_id uuid,
  target_issuer_id text,
  target_key_id text,
  target_vendor_number text,
  target_encrypted_private_key jsonb,
  target_status text,
  target_error text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_workspace_app_store_reporting_admin(target_workspace_id);
  if target_user_id <> auth.uid() then
    raise exception 'Apple reporting connection owner does not match the signed-in user';
  end if;

  insert into public.workspace_app_store_reporting_connections (
    workspace_id, user_id, issuer_id, key_id, vendor_number, encrypted_private_key, status, last_error, last_synced_at, updated_at
  ) values (
    target_workspace_id, target_user_id, trim(target_issuer_id), trim(target_key_id), trim(target_vendor_number), target_encrypted_private_key,
    case when target_status in ('connected', 'error', 'revoked') then target_status else 'error' end,
    nullif(trim(target_error), ''), timezone('utc', now()), timezone('utc', now())
  ) on conflict (workspace_id) do update set
    user_id = excluded.user_id,
    issuer_id = excluded.issuer_id,
    key_id = excluded.key_id,
    vendor_number = excluded.vendor_number,
    encrypted_private_key = excluded.encrypted_private_key,
    status = excluded.status,
    last_error = excluded.last_error,
    last_synced_at = excluded.last_synced_at,
    updated_at = excluded.updated_at;
end;
$$;

create or replace function public.get_workspace_app_store_reporting_connection(target_workspace_id uuid)
returns table (
  workspace_id uuid,
  user_id uuid,
  issuer_id text,
  key_id text,
  vendor_number text,
  encrypted_private_key jsonb,
  status text,
  last_error text,
  last_synced_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_workspace_app_store_reporting_admin(target_workspace_id);
  return query
    select c.workspace_id, c.user_id, c.issuer_id, c.key_id, c.vendor_number, c.encrypted_private_key, c.status, c.last_error, c.last_synced_at, c.updated_at
    from public.workspace_app_store_reporting_connections as c
    where c.workspace_id = target_workspace_id;
end;
$$;

create or replace function public.get_workspace_app_store_reporting_status(target_workspace_id uuid)
returns table (
  workspace_id uuid,
  key_id text,
  vendor_number text,
  status text,
  last_error text,
  last_synced_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_workspace_app_store_reporting_admin(target_workspace_id);
  return query
    select c.workspace_id, c.key_id, c.vendor_number, c.status, c.last_error, c.last_synced_at, c.updated_at
    from public.workspace_app_store_reporting_connections as c
    where c.workspace_id = target_workspace_id;
end;
$$;

create or replace function public.get_workspace_app_store_reporting_vendor_hint(target_workspace_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_vendor_number text;
begin
  perform public.assert_workspace_app_store_reporting_admin(target_workspace_id);
  select c.vendor_number into saved_vendor_number
  from public.app_store_connect_connections as c
  where c.workspace_id = target_workspace_id
    and nullif(trim(c.vendor_number), '') is not null
  order by c.updated_at desc
  limit 1;
  return saved_vendor_number;
end;
$$;

revoke all on function public.assert_workspace_app_store_reporting_admin(uuid) from public;
revoke all on function public.save_workspace_app_store_reporting_connection(uuid, uuid, text, text, text, jsonb, text, text) from public;
revoke all on function public.get_workspace_app_store_reporting_connection(uuid) from public;
revoke all on function public.get_workspace_app_store_reporting_status(uuid) from public;
revoke all on function public.get_workspace_app_store_reporting_vendor_hint(uuid) from public;

grant execute on function public.assert_workspace_app_store_reporting_admin(uuid) to authenticated;
grant execute on function public.save_workspace_app_store_reporting_connection(uuid, uuid, text, text, text, jsonb, text, text) to authenticated;
grant execute on function public.get_workspace_app_store_reporting_connection(uuid) to authenticated;
grant execute on function public.get_workspace_app_store_reporting_status(uuid) to authenticated;
grant execute on function public.get_workspace_app_store_reporting_vendor_hint(uuid) to authenticated;

comment on table public.workspace_app_store_reporting_connections is 'One server-encrypted Apple Team reporting key per workspace. Ciphertext is never exposed by browser UI.';
comment on table public.app_store_reporting_metrics is 'Read-only Apple reporting snapshots scoped to exactly one owned app. Values are stored only after Apple returns them.';
notify pgrst, 'reload schema';
