-- Add per-app provider identity support without removing or modifying existing owner-primary profiles.
-- Existing products, unified profiles, app channel policies, drafts, assets, and publication history are preserved.

alter table public.unified_social_profiles
  add column if not exists product_id uuid references public.products(id) on delete cascade,
  add column if not exists profile_scope text not null default 'owner_primary'
    check (profile_scope in ('owner_primary', 'app_isolated'));

-- The original one-profile-per-user constraint supported the owner-primary test path.
-- Replace it with partial unique indexes so an owner profile remains singular while every app can own one isolated profile.
alter table public.unified_social_profiles
  drop constraint if exists unified_social_profiles_user_id_provider_key;

create unique index if not exists unified_social_profiles_owner_provider_unique
  on public.unified_social_profiles(user_id, provider)
  where product_id is null;

create unique index if not exists unified_social_profiles_app_provider_unique
  on public.unified_social_profiles(user_id, provider, product_id)
  where product_id is not null;

create index if not exists unified_social_profiles_product_user_idx
  on public.unified_social_profiles(product_id, user_id, provider)
  where product_id is not null;

-- Preserve the explicit semantic meaning for all pre-existing owner-test records.
update public.unified_social_profiles
set profile_scope = 'owner_primary'
where product_id is null;
