-- Every Creative Lab asset belongs to one portfolio product. The product key is
-- indexed for app-switch queries and historical assets are backfilled from the
-- existing metadata marker that was already written by the creative workflow.

alter table public.media_assets
  add column if not exists product_id uuid references public.products(id) on delete set null;

create index if not exists media_assets_product_id_created_at_idx
  on public.media_assets (product_id, created_at desc);

update public.media_assets as asset
set
  product_id = product.id,
  workspace_id = coalesce(asset.workspace_id, product.workspace_id)
from public.products as product
where asset.product_id is null
  and asset.metadata ->> 'productAppId' = product.id::text;
