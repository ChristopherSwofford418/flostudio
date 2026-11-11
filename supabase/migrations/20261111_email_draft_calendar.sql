-- Exact-date access to saved app-level drafts only. No generation, delivery, or external calls.
begin;

create function public.get_email_daily_campaign_date_status(
  p_workspace_id uuid, p_product_id uuid, p_scheduled_day date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_settings jsonb;
  v_selected jsonb;
  v_day date;
  v_archived text;
begin
  if auth.uid() is null or coalesce(public.email_daily_campaign_lock_actor(p_workspace_id,auth.uid()),'') not in ('owner','admin','member') then
    raise exception 'EMAIL_DAILY_CAMPAIGN_MEMBER_REQUIRED' using errcode = '42501';
  end if;
  if p_scheduled_day is null or not pg_catalog.isfinite(p_scheduled_day)
    or p_scheduled_day < date '0001-01-01' or p_scheduled_day > date '9999-12-31' then
    raise exception 'EMAIL_DAILY_CAMPAIGN_DATE_INVALID' using errcode = '22023';
  end if;
  select coalesce(p.source_facts->>'archived','false') into v_archived from public.products p
    where p.workspace_id = p_workspace_id and p.id = p_product_id for share;
  if not found then raise exception 'EMAIL_DAILY_CAMPAIGN_PRODUCT_NOT_FOUND'; end if;
  if v_archived <> 'false' then raise exception 'EMAIL_DAILY_CAMPAIGN_APP_UNAVAILABLE'; end if;

  select to_jsonb(s) into v_settings from (
    select s.workspace_id,s.product_id,s.enabled,s.timezone,s.start_hour,s.settings_revision,
      s.enabled_by,s.created_at,s.updated_at
    from public.email_daily_campaign_settings s
    where s.workspace_id = p_workspace_id and s.product_id = p_product_id limit 1
  ) s;
  v_settings := coalesce(v_settings,jsonb_build_object('workspace_id',p_workspace_id,'product_id',p_product_id,
    'enabled',false,'timezone','America/New_York','start_hour',7,'settings_revision',null,'enabled_by',null,'created_at',null,'updated_at',null));
  v_day := (now() at time zone (v_settings->>'timezone'))::date;

  select to_jsonb(c) into v_selected from (
    select d.id,d.workspace_id,d.product_id,d.scheduled_day,d.name,d.subject,d.body,d.app_store_url,
      d.status,d.content_source,d.created_at,d.updated_at
    from public.email_daily_campaigns d
    where d.workspace_id = p_workspace_id and d.product_id = p_product_id
      and d.scheduled_day = p_scheduled_day limit 1
  ) c;
  return jsonb_build_object(
    'settings',v_settings,
    'campaigns',case when v_selected is null then '[]'::jsonb else jsonb_build_array(v_selected) end,
    'today',jsonb_build_object('scheduled_day',v_day,'created',exists (
      select 1 from public.email_daily_campaigns d
      where d.workspace_id = p_workspace_id and d.product_id = p_product_id
        and d.scheduled_day = v_day limit 1)),
    'selectedDay',p_scheduled_day,
    'selected',jsonb_build_object('scheduled_day',p_scheduled_day,'created',v_selected is not null));
end $$;

revoke all on function public.get_email_daily_campaign_date_status(uuid,uuid,date)
  from public, anon, authenticated, service_role;
grant execute on function public.get_email_daily_campaign_date_status(uuid,uuid,date) to authenticated;
comment on function public.get_email_daily_campaign_date_status(uuid,uuid,date) is
  'Authenticated workspace members may read only actual saved drafts for one active app and exact date, including history and future dates. Read-only; no generation, sending, providers, or table grants.';
notify pgrst, 'reload schema';
commit;
