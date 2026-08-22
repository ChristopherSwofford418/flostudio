create table if not exists public.app_store_connect_connections (
  product_id uuid primary key references public.products(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  app_store_app_id text not null,
  issuer_id text,
  key_id text not null,
  key_type text not null default 'team' check (key_type in ('team', 'individual')),
  vendor_number text,
  encrypted_private_key jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'connected', 'error', 'revoked')),
  metrics jsonb not null default '{}'::jsonb,
  last_error text,
  last_synced_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint app_store_connect_team_key_requires_issuer check (key_type = 'individual' or issuer_id is not null)
);

create index if not exists app_store_connect_connections_workspace_idx
  on public.app_store_connect_connections (workspace_id, updated_at desc);

alter table public.app_store_connect_connections enable row level security;
revoke all on table public.app_store_connect_connections from anon, authenticated;

create or replace function public.assert_app_store_connect_admin(target_product_id uuid)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  target_product public.products;
begin
  select * into target_product from public.products where id = target_product_id;
  if target_product.id is null or not public.is_workspace_admin(target_product.workspace_id) then
    raise exception 'App Store Connect access is not authorized for this portfolio app';
  end if;
  return target_product;
end;
$$;

revoke all on function public.assert_app_store_connect_admin(uuid) from public;
grant execute on function public.assert_app_store_connect_admin(uuid) to authenticated;

create or replace function public.save_app_store_connect_connection(
  target_product_id uuid,
  target_app_store_app_id text,
  target_issuer_id text,
  target_key_id text,
  target_key_type text,
  target_vendor_number text,
  target_encrypted_private_key jsonb,
  target_metrics jsonb,
  target_status text,
  target_error text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_product public.products;
begin
  select public.assert_app_store_connect_admin(target_product_id) into target_product;
  insert into public.app_store_connect_connections (
    product_id, workspace_id, app_store_app_id, issuer_id, key_id, key_type,
    vendor_number, encrypted_private_key, metrics, status, last_error, last_synced_at, updated_at
  ) values (
    target_product_id, target_product.workspace_id, trim(target_app_store_app_id), nullif(trim(target_issuer_id), ''), trim(target_key_id),
    case when target_key_type = 'individual' then 'individual' else 'team' end,
    nullif(trim(target_vendor_number), ''), target_encrypted_private_key, coalesce(target_metrics, '{}'::jsonb),
    case when target_status in ('pending', 'connected', 'error', 'revoked') then target_status else 'error' end,
    nullif(trim(target_error), ''), timezone('utc', now()), timezone('utc', now())
  ) on conflict (product_id) do update set
    app_store_app_id = excluded.app_store_app_id,
    issuer_id = excluded.issuer_id,
    key_id = excluded.key_id,
    key_type = excluded.key_type,
    vendor_number = excluded.vendor_number,
    encrypted_private_key = excluded.encrypted_private_key,
    metrics = excluded.metrics,
    status = excluded.status,
    last_error = excluded.last_error,
    last_synced_at = excluded.last_synced_at,
    updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.save_app_store_connect_connection(uuid, text, text, text, text, text, jsonb, jsonb, text, text) from public;
grant execute on function public.save_app_store_connect_connection(uuid, text, text, text, text, text, jsonb, jsonb, text, text) to authenticated;

create or replace function public.get_app_store_connect_status(target_product_id uuid)
returns table (
  product_id uuid,
  app_store_app_id text,
  key_id text,
  key_type text,
  vendor_number text,
  status text,
  metrics jsonb,
  last_error text,
  last_synced_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_app_store_connect_admin(target_product_id);
  return query
    select c.product_id, c.app_store_app_id, c.key_id, c.key_type, c.vendor_number, c.status, c.metrics, c.last_error, c.last_synced_at, c.updated_at
    from public.app_store_connect_connections c
    where c.product_id = target_product_id;
end;
$$;

revoke all on function public.get_app_store_connect_status(uuid) from public;
grant execute on function public.get_app_store_connect_status(uuid) to authenticated;

create or replace function public.get_app_store_connect_connection(target_product_id uuid)
returns table (
  product_id uuid,
  app_store_app_id text,
  issuer_id text,
  key_id text,
  key_type text,
  vendor_number text,
  encrypted_private_key jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_app_store_connect_admin(target_product_id);
  return query
    select c.product_id, c.app_store_app_id, c.issuer_id, c.key_id, c.key_type, c.vendor_number, c.encrypted_private_key
    from public.app_store_connect_connections c
    where c.product_id = target_product_id;
end;
$$;

revoke all on function public.get_app_store_connect_connection(uuid) from public;
grant execute on function public.get_app_store_connect_connection(uuid) to authenticated;

comment on table public.app_store_connect_connections is 'Per-product App Store Connect configuration. Private .p8 material is stored only as server-encrypted ciphertext.';
notify pgrst, 'reload schema';
