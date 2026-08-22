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
  target_workspace_id uuid;
begin
  perform public.assert_app_store_connect_admin(target_product_id);

  select p.workspace_id into target_workspace_id
  from public.products p
  where p.id = target_product_id;

  if target_workspace_id is null then
    raise exception 'Portfolio app was not found for App Store Connect.';
  end if;

  insert into public.app_store_connect_connections (
    product_id, workspace_id, app_store_app_id, issuer_id, key_id, key_type,
    vendor_number, encrypted_private_key, metrics, status, last_error, last_synced_at, updated_at
  ) values (
    target_product_id, target_workspace_id, trim(target_app_store_app_id), nullif(trim(target_issuer_id), ''), trim(target_key_id),
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
