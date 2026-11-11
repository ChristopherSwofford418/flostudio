-- Additive follow-up to the already-applied 20261111_facebook_daily_drafts.sql.
-- Keep the application contract fixed at 3 AM America/New_York; preserve draft/asset history.
begin;

-- The existing guard requires a fresh revision on every settings update.
-- Leave already-fixed rows, enabled state, enabler, timezone and creation time untouched.
update public.facebook_daily_settings
  set start_hour = 3, settings_revision = gen_random_uuid()
  where start_hour is distinct from 3;

alter table public.facebook_daily_settings
  add constraint facebook_daily_settings_start_hour_fixed check (start_hour = 3);

create or replace function public.facebook_save_daily_settings(p_workspace_id uuid, p_enabled boolean, p_timezone text, p_start_hour integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_revision uuid := gen_random_uuid(); v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('facebook-daily:' || p_workspace_id::text,0));
  if auth.uid() is null or coalesce(public.facebook_daily_lock_actor(p_workspace_id,auth.uid()),'') not in ('owner','admin') then
    raise exception 'FACEBOOK_DAILY_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_enabled is null or p_timezone is distinct from 'America/New_York' or p_start_hour is distinct from 3 then
    raise exception 'FACEBOOK_DAILY_SETTINGS_INVALID';
  end if;
  perform 1 from public.products p where p.workspace_id = p_workspace_id for share;
  select count(*) into v_count from public.products p where p.workspace_id = p_workspace_id
    and coalesce(p.source_facts->>'archived','false') = 'false';
  if v_count > 100 then raise exception 'FACEBOOK_DAILY_APP_LIMIT_EXCEEDED'; end if;
  insert into public.facebook_daily_settings(workspace_id,product_id,enabled,timezone,start_hour,settings_revision,enabled_by)
    select p_workspace_id,p.id,p_enabled,p_timezone,p_start_hour,v_revision,case when p_enabled then auth.uid() end
    from public.products p where p.workspace_id = p_workspace_id and coalesce(p.source_facts->>'archived','false') = 'false'
    on conflict (workspace_id,product_id) do update set enabled = excluded.enabled,timezone = excluded.timezone,
      start_hour = excluded.start_hour,settings_revision = excluded.settings_revision,enabled_by = excluded.enabled_by;
  return jsonb_build_object('apps_updated',v_count,'settings_revision',v_revision,
    'settings',jsonb_build_object('enabled',p_enabled,'timezone',p_timezone,'start_hour',p_start_hour));
end $$;

-- CREATE OR REPLACE preserves grants; explicitly restate the original narrow ACL.
revoke all on function public.facebook_save_daily_settings(uuid,boolean,text,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.facebook_save_daily_settings(uuid,boolean,text,integer) to authenticated;
notify pgrst, 'reload schema';
commit;
