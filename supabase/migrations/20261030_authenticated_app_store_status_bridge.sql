-- The App Store connection-status RPC returns only metadata (never encrypted key material).
-- It authorizes the selected portfolio product with assert_app_store_connect_admin.

revoke all on function public.get_app_store_connect_status(uuid) from anon;
grant execute on function public.get_app_store_connect_status(uuid) to authenticated;

comment on function public.get_app_store_connect_status(uuid) is 'Returns selected-app connection metadata only after assert_app_store_connect_admin authorization.';
