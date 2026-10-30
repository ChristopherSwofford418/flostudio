-- Preserve App Store Connect provenance for owner-authorized Creative Lab imports.
-- This is additive: imported media remains isolated to its existing workspace/user/product
-- and does not create posts, review records, schedules, or publishing actions.

alter table public.media_assets
  add column if not exists asc_asset_id text,
  add column if not exists asc_placement_id text;

alter table public.media_assets
  drop constraint if exists media_assets_source_check;

alter table public.media_assets
  add constraint media_assets_source_check
  check (source = any (array['upload'::text, 'ai_image'::text, 'ai_video'::text, 'app_store_connect_import'::text]));

create index if not exists media_assets_product_asc_asset_idx
  on public.media_assets (product_id, asc_asset_id, asc_placement_id)
  where asc_asset_id is not null and asc_placement_id is not null;

create unique index if not exists media_assets_product_asc_placement_unique_idx
  on public.media_assets (product_id, asc_asset_id, asc_placement_id)
  where asc_asset_id is not null and asc_placement_id is not null;

comment on column public.media_assets.asc_asset_id is 'App Store Connect App Asset Library asset identifier for owner-authorized imports.';
comment on column public.media_assets.asc_placement_id is 'App Store Connect approved placement identifier for owner-authorized imports.';
