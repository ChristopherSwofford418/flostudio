-- Security and isolation hardening for the existing Flo Studio production database.
-- This migration is additive: it preserves the server-side vault paths and current app workflows.

-- 1. Remove anonymous execution from every privileged workspace, credential, and App Store RPC.
-- Authenticated access remains only where the existing server routes still pass an authenticated user JWT.
-- Server routes authorize the human caller first, then use service_role to read or mutate ciphertext.
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
  if target_product.id is null
    or (auth.role() <> 'service_role' and not public.is_workspace_admin(target_product.workspace_id)) then
    raise exception 'App Store Connect access is not authorized for this portfolio app';
  end if;
  return target_product;
end;
$$;

create or replace function public.save_workspace_openai_provider_credential(
  target_workspace_id uuid,
  target_encrypted_api_key jsonb,
  target_key_last4 text,
  target_created_by uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_workspace_id is null
    or (auth.role() <> 'service_role' and not public.is_workspace_admin(target_workspace_id)) then
    raise exception 'Provider credential access is not authorized for this workspace';
  end if;
  if target_encrypted_api_key is null or nullif(trim(target_key_last4), '') is null or target_created_by is null then
    raise exception 'A valid encrypted provider credential is required';
  end if;
  insert into public.workspace_openai_provider_credentials (workspace_id, encrypted_api_key, key_last4, created_by, updated_at)
  values (target_workspace_id, target_encrypted_api_key, right(trim(target_key_last4), 12), target_created_by, timezone('utc', now()))
  on conflict (workspace_id) do update set
    encrypted_api_key = excluded.encrypted_api_key,
    key_last4 = excluded.key_last4,
    created_by = excluded.created_by,
    updated_at = excluded.updated_at;
end;
$$;

create or replace function public.get_workspace_openai_provider_credential(target_workspace_id uuid)
returns table (encrypted_api_key jsonb)
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_workspace_id is null
    or (auth.role() <> 'service_role' and not public.is_workspace_admin(target_workspace_id)) then
    raise exception 'Provider credential access is not authorized for this workspace';
  end if;
  return query select c.encrypted_api_key
  from public.workspace_openai_provider_credentials c
  where c.workspace_id = target_workspace_id;
end;
$$;

create or replace function public.get_workspace_openai_provider_status(target_workspace_id uuid)
returns table (configured boolean, key_last4 text, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_workspace_id is null
    or (auth.role() <> 'service_role' and not public.is_workspace_admin(target_workspace_id)) then
    raise exception 'Provider credential access is not authorized for this workspace';
  end if;
  return query select true, c.key_last4, c.updated_at
  from public.workspace_openai_provider_credentials c
  where c.workspace_id = target_workspace_id;
end;
$$;

create or replace function public.clear_workspace_openai_provider_credential(target_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_workspace_id is null
    or (auth.role() <> 'service_role' and not public.is_workspace_admin(target_workspace_id)) then
    raise exception 'Provider credential access is not authorized for this workspace';
  end if;
  delete from public.workspace_openai_provider_credentials where workspace_id = target_workspace_id;
end;
$$;

revoke all on function public.assert_app_store_connect_admin(uuid) from anon;
revoke all on function public.claim_workspace_invitation() from anon;
revoke all on function public.clear_workspace_openai_provider_credential(uuid) from anon;
revoke all on function public.get_app_store_connect_connection(uuid) from anon;
revoke all on function public.get_app_store_connect_status(uuid) from anon;
revoke all on function public.get_workspace_openai_provider_credential(uuid) from anon;
revoke all on function public.get_workspace_openai_provider_status(uuid) from anon;
revoke all on function public.get_workspace_role(uuid) from anon;
revoke all on function public.is_workspace_admin(uuid) from anon;
revoke all on function public.save_app_store_connect_connection(uuid, text, text, text, text, text, jsonb, jsonb, text, text) from anon;
revoke all on function public.save_workspace_openai_provider_credential(uuid, jsonb, text) from anon;

-- The browser never needs direct vault access. API routes first verify membership with a
-- signed-in JWT, then use service_role for the encrypted value or mutation.
revoke all on function public.save_app_store_connect_connection(uuid, text, text, text, text, text, jsonb, jsonb, text, text) from authenticated;
revoke all on function public.get_app_store_connect_connection(uuid) from authenticated;
revoke all on function public.save_workspace_openai_provider_credential(uuid, jsonb, text) from authenticated;
revoke all on function public.get_workspace_openai_provider_credential(uuid) from authenticated;
revoke all on function public.get_workspace_openai_provider_status(uuid) from authenticated;
revoke all on function public.clear_workspace_openai_provider_credential(uuid) from authenticated;
grant execute on function public.save_app_store_connect_connection(uuid, text, text, text, text, text, jsonb, jsonb, text, text) to service_role;
grant execute on function public.get_app_store_connect_connection(uuid) to service_role;
revoke all on function public.save_workspace_openai_provider_credential(uuid, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.save_workspace_openai_provider_credential(uuid, jsonb, text, uuid) to service_role;
grant execute on function public.get_workspace_openai_provider_credential(uuid) to service_role;
grant execute on function public.get_workspace_openai_provider_status(uuid) to service_role;
grant execute on function public.clear_workspace_openai_provider_credential(uuid) to service_role;

-- 2. Credential and OAuth-state rows are server-owned. Explicit deny policies document the
-- intended posture for the Supabase advisor while service_role retains its normal RLS bypass.
revoke all on table public.social_credentials from anon, authenticated;
revoke all on table public.social_oauth_states from anon, authenticated;

drop policy if exists "No direct App Store credential access" on public.app_store_connect_connections;
create policy "No direct App Store credential access"
  on public.app_store_connect_connections as restrictive for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "No direct workspace provider credential access" on public.workspace_openai_provider_credentials;
create policy "No direct workspace provider credential access"
  on public.workspace_openai_provider_credentials as restrictive for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "No direct social credential access" on public.social_credentials;
create policy "No direct social credential access"
  on public.social_credentials as restrictive for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "No direct social OAuth state access" on public.social_oauth_states;
create policy "No direct social OAuth state access"
  on public.social_oauth_states as restrictive for all
  to anon, authenticated
  using (false)
  with check (false);

-- 3. Correct four historical tenant checks that compared a subquery column to itself.
-- These policies now require the referenced record to match the outer row's workspace.
drop policy if exists "Users manage their own marketing experiments" on public.marketing_experiments;
create policy "Users manage their own marketing experiments"
  on public.marketing_experiments for all
  to authenticated
  using (
    (select auth.uid()) = public.marketing_experiments.user_id
    and exists (
      select 1
      from public.products p
      where p.id = public.marketing_experiments.product_id
        and p.user_id = (select auth.uid())
        and p.workspace_id = public.marketing_experiments.workspace_id
    )
  )
  with check (
    (select auth.uid()) = public.marketing_experiments.user_id
    and exists (
      select 1
      from public.products p
      where p.id = public.marketing_experiments.product_id
        and p.user_id = (select auth.uid())
        and p.workspace_id = public.marketing_experiments.workspace_id
    )
  );

drop policy if exists "Users manage their own experiment variants" on public.experiment_variants;
create policy "Users manage their own experiment variants"
  on public.experiment_variants for all
  to authenticated
  using (
    (select auth.uid()) = public.experiment_variants.user_id
    and exists (
      select 1
      from public.marketing_experiments e
      where e.id = public.experiment_variants.experiment_id
        and e.user_id = (select auth.uid())
        and e.workspace_id = public.experiment_variants.workspace_id
    )
  )
  with check (
    (select auth.uid()) = public.experiment_variants.user_id
    and exists (
      select 1
      from public.marketing_experiments e
      where e.id = public.experiment_variants.experiment_id
        and e.user_id = (select auth.uid())
        and e.workspace_id = public.experiment_variants.workspace_id
    )
  );

drop policy if exists "Users manage their own shortform research examples" on public.shortform_research_examples;
create policy "Users manage their own shortform research examples"
  on public.shortform_research_examples for all
  to authenticated
  using (
    (select auth.uid()) = public.shortform_research_examples.user_id
    and exists (
      select 1
      from public.products p
      where p.id = public.shortform_research_examples.product_id
        and p.user_id = (select auth.uid())
        and p.workspace_id = public.shortform_research_examples.workspace_id
    )
  )
  with check (
    (select auth.uid()) = public.shortform_research_examples.user_id
    and exists (
      select 1
      from public.products p
      where p.id = public.shortform_research_examples.product_id
        and p.user_id = (select auth.uid())
        and p.workspace_id = public.shortform_research_examples.workspace_id
    )
  );

drop policy if exists "Users manage their own search visibility evidence" on public.search_visibility_evidence;
create policy "Users manage their own search visibility evidence"
  on public.search_visibility_evidence for all
  to authenticated
  using (
    (select auth.uid()) = public.search_visibility_evidence.user_id
    and exists (
      select 1
      from public.products p
      where p.id = public.search_visibility_evidence.product_id
        and p.user_id = (select auth.uid())
        and p.workspace_id = public.search_visibility_evidence.workspace_id
    )
  )
  with check (
    (select auth.uid()) = public.search_visibility_evidence.user_id
    and exists (
      select 1
      from public.products p
      where p.id = public.search_visibility_evidence.product_id
        and p.user_id = (select auth.uid())
        and p.workspace_id = public.search_visibility_evidence.workspace_id
    )
  );

-- 4. Cover the highest-value foreign-key lookup paths used by the app and its RLS checks.
create index if not exists campaigns_brand_idx on public.campaigns(brand_id);
create index if not exists campaigns_product_idx on public.campaigns(product_id);
create index if not exists campaigns_selected_concept_idx on public.campaigns(selected_concept_id) where selected_concept_id is not null;
create index if not exists campaign_concepts_user_idx on public.campaign_concepts(user_id);
create index if not exists creative_memory_events_product_idx on public.creative_memory_events(product_id);
create index if not exists media_assets_concept_idx on public.media_assets(concept_id) where concept_id is not null;
create index if not exists media_assets_reference_asset_idx on public.media_assets(reference_asset_id) where reference_asset_id is not null;
create index if not exists media_assets_render_job_idx on public.media_assets(render_job_id) where render_job_id is not null;
create index if not exists render_jobs_campaign_idx on public.render_jobs(campaign_id) where campaign_id is not null;
create index if not exists render_jobs_concept_idx on public.render_jobs(concept_id) where concept_id is not null;
create index if not exists render_jobs_media_asset_idx on public.render_jobs(media_asset_id) where media_asset_id is not null;
create index if not exists token_transactions_user_created_idx on public.token_transactions(user_id, created_at desc);
create index if not exists connected_accounts_workspace_idx on public.connected_accounts(workspace_id) where workspace_id is not null;
create index if not exists social_publish_attempts_user_created_idx on public.social_publish_attempts(user_id, created_at desc);
create index if not exists social_publish_attempts_campaign_post_idx on public.social_publish_attempts(campaign_post_id);
create index if not exists social_publish_attempts_connected_account_idx on public.social_publish_attempts(connected_account_id) where connected_account_id is not null;

-- Keep PostgREST's RPC schema cache aligned with the changed privilege grants.
notify pgrst, 'reload schema';
