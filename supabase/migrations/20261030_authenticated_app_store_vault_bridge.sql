-- The Vercel route retains the signed-in user's JWT and invokes these SECURITY DEFINER
-- functions only after assert_app_store_connect_admin(product_id) succeeds. This removes
-- the route's dependence on a duplicated Supabase service-role secret while keeping
-- ciphertext inaccessible from direct tables/browser storage.

revoke all on function public.save_app_store_connect_connection(uuid, text, text, text, text, text, jsonb, jsonb, text, text) from anon;
revoke all on function public.get_app_store_connect_connection(uuid) from anon;

grant execute on function public.save_app_store_connect_connection(uuid, text, text, text, text, text, jsonb, jsonb, text, text) to authenticated;
grant execute on function public.get_app_store_connect_connection(uuid) to authenticated;

comment on function public.get_app_store_connect_connection(uuid) is 'Server route use only: caller must first pass assert_app_store_connect_admin; encrypted ciphertext is never returned to browser code.';
comment on function public.save_app_store_connect_connection(uuid, text, text, text, text, text, jsonb, jsonb, text, text) is 'Server route use only: caller must first pass assert_app_store_connect_admin; encrypted ciphertext is never returned to browser code.';
