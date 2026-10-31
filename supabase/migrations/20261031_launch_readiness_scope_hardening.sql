-- Launch-readiness hardening for FloStudio's app-scoped marketing workflows.
-- Additive: this preserves records and introduces no social, CMS, or App Store publication action.

-- Older unassigned Creative Lab rows remain preserved in storage/database history, but new and
-- mutable library records must now belong to a product owned by the current user in the same workspace.
drop policy if exists media_assets_select_own on public.media_assets;
drop policy if exists media_assets_insert_own on public.media_assets;
drop policy if exists media_assets_update_own on public.media_assets;
drop policy if exists media_assets_delete_own on public.media_assets;

create policy media_assets_select_app_scope on public.media_assets
  for select to authenticated
  using (
    auth.uid() = user_id
    and product_id is not null
    and exists (
      select 1 from public.products as product
      where product.id = media_assets.product_id
        and product.workspace_id = media_assets.workspace_id
        and product.user_id = auth.uid()
    )
  );

create policy media_assets_insert_app_scope on public.media_assets
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and product_id is not null
    and exists (
      select 1 from public.products as product
      where product.id = media_assets.product_id
        and product.workspace_id = media_assets.workspace_id
        and product.user_id = auth.uid()
    )
  );

create policy media_assets_update_app_scope on public.media_assets
  for update to authenticated
  using (
    auth.uid() = user_id
    and product_id is not null
    and exists (
      select 1 from public.products as product
      where product.id = media_assets.product_id
        and product.workspace_id = media_assets.workspace_id
        and product.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and product_id is not null
    and exists (
      select 1 from public.products as product
      where product.id = media_assets.product_id
        and product.workspace_id = media_assets.workspace_id
        and product.user_id = auth.uid()
    )
  );

create policy media_assets_delete_app_scope on public.media_assets
  for delete to authenticated
  using (
    auth.uid() = user_id
    and product_id is not null
    and exists (
      select 1 from public.products as product
      where product.id = media_assets.product_id
        and product.workspace_id = media_assets.workspace_id
        and product.user_id = auth.uid()
    )
  );

-- SEO setup, private articles, and action tasks must use the same app/workspace/user scope.
drop policy if exists seo_destinations_owner_select on public.seo_destinations;
drop policy if exists seo_destinations_owner_insert on public.seo_destinations;
drop policy if exists seo_destinations_owner_update on public.seo_destinations;
drop policy if exists "Users manage their own SEO action tasks" on public.seo_action_tasks;
drop policy if exists seo_articles_owner_select on public.seo_articles;
drop policy if exists seo_articles_owner_insert on public.seo_articles;
drop policy if exists seo_articles_owner_update on public.seo_articles;

create policy seo_destinations_app_scope on public.seo_destinations
  for all to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.products as product
      where product.id = seo_destinations.product_id
        and product.workspace_id = seo_destinations.workspace_id
        and product.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.products as product
      where product.id = seo_destinations.product_id
        and product.workspace_id = seo_destinations.workspace_id
        and product.user_id = auth.uid()
    )
  );

create policy seo_articles_app_scope on public.seo_articles
  for all to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.products as product
      where product.id = seo_articles.product_id
        and product.workspace_id = seo_articles.workspace_id
        and product.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.products as product
      where product.id = seo_articles.product_id
        and product.workspace_id = seo_articles.workspace_id
        and product.user_id = auth.uid()
    )
  );

create policy seo_action_tasks_app_scope on public.seo_action_tasks
  for all to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.products as product
      where product.id = seo_action_tasks.product_id
        and product.workspace_id = seo_action_tasks.workspace_id
        and product.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.products as product
      where product.id = seo_action_tasks.product_id
        and product.workspace_id = seo_action_tasks.workspace_id
        and product.user_id = auth.uid()
    )
  );

-- FloStudio has no CMS/webhook publishing worker. Preserve the historical article but normalize
-- any legacy queued/pushed label to an internal reviewed state before restricting future writes.
update public.seo_articles
set status = case when status in ('queued', 'pushed') then 'approved' else status end,
    push_mode = 'review_only'
where status in ('queued', 'pushed') or push_mode <> 'review_only';

update public.seo_destinations
set publish_mode = 'review_only'
where publish_mode <> 'review_only';

alter table public.seo_articles
  drop constraint if exists seo_articles_internal_review_only_status_check;
alter table public.seo_articles
  add constraint seo_articles_internal_review_only_status_check
  check (status in ('draft', 'ready_for_review', 'approved'));

alter table public.seo_articles
  drop constraint if exists seo_articles_internal_review_only_push_mode_check;
alter table public.seo_articles
  add constraint seo_articles_internal_review_only_push_mode_check
  check (push_mode = 'review_only');

alter table public.seo_destinations
  drop constraint if exists seo_destinations_internal_review_only_mode_check;
alter table public.seo_destinations
  add constraint seo_destinations_internal_review_only_mode_check
  check (publish_mode = 'review_only');
