-- Performance-only follow-up for 20261031_launch_readiness_scope_hardening.
-- Cache auth.uid() once per policy query and cover the remaining identified foreign keys.

drop policy if exists media_assets_select_app_scope on public.media_assets;
drop policy if exists media_assets_insert_app_scope on public.media_assets;
drop policy if exists media_assets_update_app_scope on public.media_assets;
drop policy if exists media_assets_delete_app_scope on public.media_assets;

create policy media_assets_select_app_scope on public.media_assets
  for select to authenticated
  using (
    (select auth.uid()) = user_id and product_id is not null and exists (
      select 1 from public.products as product
      where product.id = media_assets.product_id
        and product.workspace_id = media_assets.workspace_id
        and product.user_id = (select auth.uid())
    )
  );
create policy media_assets_insert_app_scope on public.media_assets
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id and product_id is not null and exists (
      select 1 from public.products as product
      where product.id = media_assets.product_id
        and product.workspace_id = media_assets.workspace_id
        and product.user_id = (select auth.uid())
    )
  );
create policy media_assets_update_app_scope on public.media_assets
  for update to authenticated
  using (
    (select auth.uid()) = user_id and product_id is not null and exists (
      select 1 from public.products as product
      where product.id = media_assets.product_id
        and product.workspace_id = media_assets.workspace_id
        and product.user_id = (select auth.uid())
    )
  ) with check (
    (select auth.uid()) = user_id and product_id is not null and exists (
      select 1 from public.products as product
      where product.id = media_assets.product_id
        and product.workspace_id = media_assets.workspace_id
        and product.user_id = (select auth.uid())
    )
  );
create policy media_assets_delete_app_scope on public.media_assets
  for delete to authenticated
  using (
    (select auth.uid()) = user_id and product_id is not null and exists (
      select 1 from public.products as product
      where product.id = media_assets.product_id
        and product.workspace_id = media_assets.workspace_id
        and product.user_id = (select auth.uid())
    )
  );

drop policy if exists seo_destinations_app_scope on public.seo_destinations;
drop policy if exists seo_articles_app_scope on public.seo_articles;
drop policy if exists seo_action_tasks_app_scope on public.seo_action_tasks;

create policy seo_destinations_app_scope on public.seo_destinations
  for all to authenticated
  using ((select auth.uid()) = user_id and exists (select 1 from public.products as product where product.id = seo_destinations.product_id and product.workspace_id = seo_destinations.workspace_id and product.user_id = (select auth.uid())))
  with check ((select auth.uid()) = user_id and exists (select 1 from public.products as product where product.id = seo_destinations.product_id and product.workspace_id = seo_destinations.workspace_id and product.user_id = (select auth.uid())));
create policy seo_articles_app_scope on public.seo_articles
  for all to authenticated
  using ((select auth.uid()) = user_id and exists (select 1 from public.products as product where product.id = seo_articles.product_id and product.workspace_id = seo_articles.workspace_id and product.user_id = (select auth.uid())))
  with check ((select auth.uid()) = user_id and exists (select 1 from public.products as product where product.id = seo_articles.product_id and product.workspace_id = seo_articles.workspace_id and product.user_id = (select auth.uid())));
create policy seo_action_tasks_app_scope on public.seo_action_tasks
  for all to authenticated
  using ((select auth.uid()) = user_id and exists (select 1 from public.products as product where product.id = seo_action_tasks.product_id and product.workspace_id = seo_action_tasks.workspace_id and product.user_id = (select auth.uid())))
  with check ((select auth.uid()) = user_id and exists (select 1 from public.products as product where product.id = seo_action_tasks.product_id and product.workspace_id = seo_action_tasks.workspace_id and product.user_id = (select auth.uid())));

create index if not exists campaign_runbook_deletions_product_id_idx on public.campaign_runbook_deletions(product_id);
create index if not exists campaign_runbook_deletions_user_id_idx on public.campaign_runbook_deletions(user_id);
create index if not exists workspace_typesafe_provider_credentials_created_by_idx on public.workspace_typesafe_provider_credentials(created_by);
