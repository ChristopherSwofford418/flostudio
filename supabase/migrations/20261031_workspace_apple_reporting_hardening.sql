-- Follow-up hardening for workspace Apple reporting.
-- Keep credentials server-only and optimize the app-isolated reporting snapshot path.

revoke execute on function public.assert_workspace_app_store_reporting_admin(uuid) from anon;
revoke execute on function public.save_workspace_app_store_reporting_connection(uuid, uuid, text, text, text, jsonb, text, text) from anon;
revoke execute on function public.get_workspace_app_store_reporting_connection(uuid) from anon;
revoke execute on function public.get_workspace_app_store_reporting_status(uuid) from anon;
revoke execute on function public.get_workspace_app_store_reporting_vendor_hint(uuid) from anon;

create index if not exists workspace_app_store_reporting_connections_user_idx
  on public.workspace_app_store_reporting_connections (user_id);
create index if not exists app_store_reporting_metrics_user_idx
  on public.app_store_reporting_metrics (user_id);

drop policy if exists app_store_reporting_metrics_select_app_scope on public.app_store_reporting_metrics;
drop policy if exists app_store_reporting_metrics_insert_app_scope on public.app_store_reporting_metrics;
drop policy if exists app_store_reporting_metrics_update_app_scope on public.app_store_reporting_metrics;

create policy app_store_reporting_metrics_select_app_scope on public.app_store_reporting_metrics
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.products as product
      where product.id = app_store_reporting_metrics.product_id
        and product.workspace_id = app_store_reporting_metrics.workspace_id
        and product.user_id = (select auth.uid())
    )
  );

create policy app_store_reporting_metrics_insert_app_scope on public.app_store_reporting_metrics
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.products as product
      where product.id = app_store_reporting_metrics.product_id
        and product.workspace_id = app_store_reporting_metrics.workspace_id
        and product.user_id = (select auth.uid())
    )
  );

create policy app_store_reporting_metrics_update_app_scope on public.app_store_reporting_metrics
  for update to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.products as product
      where product.id = app_store_reporting_metrics.product_id
        and product.workspace_id = app_store_reporting_metrics.workspace_id
        and product.user_id = (select auth.uid())
    )
  )
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.products as product
      where product.id = app_store_reporting_metrics.product_id
        and product.workspace_id = app_store_reporting_metrics.workspace_id
        and product.user_id = (select auth.uid())
    )
  );

notify pgrst, 'reload schema';
