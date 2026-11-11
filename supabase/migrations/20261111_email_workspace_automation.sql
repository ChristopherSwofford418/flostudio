-- Prepared only: applying this migration never enables automation or delivery.
-- Human workspace bulk control of RESEARCH + REUSABLE DAILY DRAFT SETTINGS only.
begin;

-- One statement/one MVCC snapshot. Private helper returns allowlisted aggregates,
-- never recipient identities, copy, product metadata, query text or mailbox secrets.
create function public.email_workspace_automation_snapshot(p_workspace_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with mailbox as (
    select c.configured,c.sending_enabled,c.updated_at,c.delivery_pause_reason,
      a.sending_enabled as account_enabled,a.delivery_pause_reason as account_pause
    from public.workspace_gmail_connections c
    left join public.email_gmail_accounts a on a.account_key = c.account_key
    where c.workspace_id = p_workspace_id
  ), active as (
    select p.id,p.name,
      coalesce(r.enabled,false) as research_enabled,coalesce(r.daily_target,80) as research_target,
      coalesce(r.daily_request_limit,8) as research_request_limit,
      coalesce(r.timezone,'America/New_York') as research_timezone,coalesce(r.start_hour,6) as research_start_hour,
      coalesce(r.query,'') as research_query,r.settings_revision as research_revision,
      r.enabled_by as research_actor,r.enabled_at as research_enabled_at,
      public.email_research_admin(p_workspace_id,r.enabled_by) as research_actor_current,
      coalesce(d.enabled,false) as drafts_enabled,coalesce(d.timezone,'America/New_York') as draft_timezone,
      coalesce(d.start_hour,7) as draft_start_hour,d.settings_revision as draft_revision,d.enabled_by as draft_actor,
      coalesce(public.email_daily_campaign_actor_role(p_workspace_id,d.enabled_by),'') in ('owner','admin') as draft_actor_current,
      coalesce(c.sending_enabled,false) as delivery_enabled,c.state as delivery_state,
      coalesce(btrim(c.sender_name) <> '' and c.sender_name !~ E'[\r\n]' and btrim(c.postal_address) <> '',false) as sender_complete,
      exists (select 1 from public.email_daily_campaigns h where h.workspace_id = p_workspace_id
        and h.product_id = p.id and h.scheduled_day = (now() at time zone coalesce(d.timezone,'America/New_York'))::date) as today_created,
      (select count(*)::integer from public.email_contacts x where x.workspace_id = p_workspace_id and x.product_id = p.id
        and x.status = 'opted_in' and x.consent_recorded_by is not null and x.consent_recorded_at is not null
        and jsonb_typeof(x.consent_evidence->'method') = 'string' and btrim(x.consent_evidence->>'method') <> ''
        and jsonb_typeof(x.consent_evidence->'reference') = 'string' and length(btrim(x.consent_evidence->>'reference')) >= 20
        and jsonb_typeof(x.consent_evidence->'recorded_at') = 'string' and btrim(x.consent_evidence->>'recorded_at') <> '') as opted_in_count
    from public.products p
    left join public.email_research_settings r on r.workspace_id = p.workspace_id and r.product_id = p.id
    left join public.email_daily_campaign_settings d on d.workspace_id = p.workspace_id and d.product_id = p.id
    left join public.email_campaigns c on c.workspace_id = p.workspace_id and c.product_id = p.id
    where p.workspace_id = p_workspace_id and coalesce(p.source_facts->>'archived','false') = 'false'
  ), shown as (select * from active order by id limit 200)
  select jsonb_build_object(
    'workspace_id',p_workspace_id,
    -- Exact complete ordered app/settings set, including missing-record defaults.
    -- Do NOT bind contacts, draft content/creation, runs, budgets or local day:
    -- this review is not recipient approval and cannot reset/authorize paid calls.
    'reviewRevision',md5(jsonb_build_object('workspace_id',p_workspace_id,
      'apps',coalesce((select jsonb_agg(jsonb_build_array(id,name,
        research_enabled,research_target,research_request_limit,research_timezone,research_start_hour,research_query,
        research_revision,research_actor,research_enabled_at,research_actor_current,
        drafts_enabled,draft_timezone,draft_start_hour,draft_revision,draft_actor,draft_actor_current,
        delivery_enabled,delivery_state,sender_complete) order by id) from active),'[]'::jsonb),
      'mailbox',coalesce((select to_jsonb(m) from mailbox m),'null'::jsonb))::text),
    'apps',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,
      'researchEnabled',research_enabled,'draftsEnabled',drafts_enabled,
      'researchTarget',research_target,'researchRequestLimit',research_request_limit,
      'researchTimezone',research_timezone,'researchStartHour',research_start_hour,
      'draftTimezone',draft_timezone,'draftStartHour',draft_start_hour,
      'todayDraftCreated',today_created,'deliveryEnabled',delivery_enabled,
      'senderDetailsComplete',sender_complete,'optedInCount',opted_in_count) order by id) from shown),'[]'::jsonb),
    'totals',(select jsonb_build_object('activeApps',count(*),
      'researchEnabled',count(*) filter (where research_enabled),'draftsEnabled',count(*) filter (where drafts_enabled),
      'todayDrafts',count(*) filter (where today_created),'deliveryEnabled',count(*) filter (where delivery_enabled),
      'optedInContacts',coalesce(sum(opted_in_count),0),
      'researchRequestCeiling',least(200,coalesce(sum(research_request_limit),0))) from active),
    'truncated',(select count(*) > 200 from active))
$$;

create function public.get_email_workspace_automation_status(p_workspace_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  -- This role helper uses the actual workspaces.owner_user_id, never an owner
  -- label forged in workspace_members. It locks/rechecks membership at commit.
  if auth.uid() is null or coalesce(public.email_daily_campaign_lock_actor(p_workspace_id,auth.uid()),'')
      not in ('owner','admin','member') then
    raise exception 'EMAIL_WORKSPACE_AUTOMATION_MEMBER_REQUIRED' using errcode = '42501';
  end if;
  return public.email_workspace_automation_snapshot(p_workspace_id);
end $$;

create function public.set_email_workspace_automation(
  p_workspace_id uuid,p_enabled boolean,p_review_revision text,p_confirm_research_cost boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid(); v_status jsonb; v_products uuid[]; v_locked_products uuid[]; v_product uuid;
  v_research_changed integer := 0; v_drafts_changed integer := 0;
begin
  if v_actor is null or coalesce(public.email_daily_campaign_actor_role(p_workspace_id,v_actor),'') not in ('owner','admin') then
    raise exception 'EMAIL_WORKSPACE_AUTOMATION_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_enabled is null then
    raise exception 'EMAIL_WORKSPACE_AUTOMATION_MODE_INVALID' using errcode = '22023';
  end if;
  if p_review_revision is null or p_review_revision !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('applied',false,'code','EMAIL_WORKSPACE_REVIEW_STALE');
  end if;
  if p_enabled and p_confirm_research_cost is distinct from true then
    return jsonb_build_object('applied',false,'code','EMAIL_WORKSPACE_RESEARCH_CONFIRM_REQUIRED');
  end if;

  -- Match research worker ordering; never take a draft settings row lock before
  -- its per-product advisory (draft save workers take that advisory first).
  perform pg_advisory_xact_lock(hashtextextended('email-research-global',0));
  perform pg_advisory_xact_lock(hashtextextended('email-workspace:' || p_workspace_id::text,0));
  -- Snapshot IDs without scope row locks first. A daily worker holds its
  -- advisory before waiting for workspace/actor SHARE locks; waiting for that
  -- advisory while holding scope SHARE locks could invert an ownership writer.
  select coalesce(array_agg(p.id order by p.id),array[]::uuid[]) into v_products from public.products p
    where p.workspace_id = p_workspace_id and coalesce(p.source_facts->>'archived','false') = 'false';
  if cardinality(v_products) > 200 then
    return jsonb_build_object('applied',false,'code','EMAIL_WORKSPACE_AUTOMATION_LIMIT');
  end if;
  if cardinality(v_products) = 0 then
    return jsonb_build_object('applied',false,'code','EMAIL_WORKSPACE_NO_APPS');
  end if;
  foreach v_product in array v_products loop
    perform pg_advisory_xact_lock(hashtextextended('email-daily-campaign:' || p_workspace_id::text || ':' || v_product::text,0));
  end loop;
  perform 1 from public.workspaces w where w.id = p_workspace_id for share;
  perform 1 from public.workspace_members m where m.workspace_id = p_workspace_id and m.user_id = v_actor for share;
  if coalesce(public.email_daily_campaign_actor_role(p_workspace_id,v_actor),'') not in ('owner','admin') then
    raise exception 'EMAIL_WORKSPACE_AUTOMATION_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  -- Row SHARE locks alone cannot stop FK-compatible inserts or activation of
  -- previously archived products. A short NOWAIT catalog write barrier prevents
  -- those phantoms without waiting on a catalog writer in inverse scope order.
  -- SQLSTATE 55P03 means refresh/retry this DB-only operation, never paid work.
  lock table public.products in share mode nowait;
  perform 1 from public.products p where p.workspace_id = p_workspace_id
    and coalesce(p.source_facts->>'archived','false') = 'false' order by p.id for share;
  select coalesce(array_agg(p.id order by p.id),array[]::uuid[]) into v_locked_products from public.products p
    where p.workspace_id = p_workspace_id and coalesce(p.source_facts->>'archived','false') = 'false';
  if cardinality(v_locked_products) > 200 then
    return jsonb_build_object('applied',false,'code','EMAIL_WORKSPACE_AUTOMATION_LIMIT');
  end if;
  if cardinality(v_locked_products) = 0 then
    return jsonb_build_object('applied',false,'code','EMAIL_WORKSPACE_NO_APPS');
  end if;
  if v_locked_products is distinct from v_products then
    return jsonb_build_object('applied',false,'code','EMAIL_WORKSPACE_REVIEW_STALE');
  end if;
  -- Keep still-authorized enabling admins valid through commit as well. Worker
  -- scope SHARE locks are compatible; no settings rows have been locked yet.
  perform 1 from public.workspace_members m where m.workspace_id = p_workspace_id and (
    m.user_id = v_actor or m.user_id in (
      select r.enabled_by from public.email_research_settings r where r.workspace_id = p_workspace_id and r.product_id = any(v_products)
      union select d.enabled_by from public.email_daily_campaign_settings d where d.workspace_id = p_workspace_id and d.product_id = any(v_products)
    )) order by m.user_id for share;
  if coalesce(public.email_daily_campaign_actor_role(p_workspace_id,v_actor),'') not in ('owner','admin') then
    raise exception 'EMAIL_WORKSPACE_AUTOMATION_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  v_status := public.email_workspace_automation_snapshot(p_workspace_id);
  if p_review_revision is distinct from v_status->>'reviewRevision' then
    return jsonb_build_object('applied',false,'code','EMAIL_WORKSPACE_REVIEW_STALE');
  end if;

  if p_enabled then
    -- Missing rows alone receive defaults. Existing custom query, targets,
    -- limits, schedules, timestamps and revisions are retained when already on
    -- with a current enabling actor (even if that actor is not this caller).
    insert into public.email_research_settings(workspace_id,product_id,enabled,enabled_by,enabled_at)
      select p_workspace_id,x,true,v_actor,now() from unnest(v_products) x
      on conflict (workspace_id,product_id) do update set enabled = true,enabled_by = v_actor,enabled_at = now(),
        settings_revision = gen_random_uuid(),updated_at = now()
      where not email_research_settings.enabled
        or not public.email_research_admin(p_workspace_id,email_research_settings.enabled_by);
    get diagnostics v_research_changed = row_count;
    insert into public.email_daily_campaign_settings(workspace_id,product_id,enabled,enabled_by)
      select p_workspace_id,x,true,v_actor from unnest(v_products) x
      on conflict (workspace_id,product_id) do update set enabled = true,enabled_by = v_actor,
        settings_revision = gen_random_uuid(),updated_at = now()
      where not email_daily_campaign_settings.enabled
        or coalesce(public.email_daily_campaign_actor_role(p_workspace_id,email_daily_campaign_settings.enabled_by),'') not in ('owner','admin');
    get diagnostics v_drafts_changed = row_count;
  else
    -- Pause only existing active-app settings. Do not manufacture disabled rows.
    update public.email_research_settings set enabled = false,enabled_by = null,enabled_at = null,
      settings_revision = gen_random_uuid(),updated_at = now()
      where workspace_id = p_workspace_id and product_id = any(v_products) and enabled;
    get diagnostics v_research_changed = row_count;
    update public.email_daily_campaign_settings set enabled = false,enabled_by = null,
      settings_revision = gen_random_uuid(),updated_at = now()
      where workspace_id = p_workspace_id and product_id = any(v_products) and enabled;
    get diagnostics v_drafts_changed = row_count;
  end if;
  return jsonb_build_object('applied',true,'mode','research_and_drafts',
    'researchChanged',v_research_changed,'draftsChanged',v_drafts_changed,'deliveryChanged',0,
    'status',public.email_workspace_automation_snapshot(p_workspace_id));
end $$;

-- No table grants, policies, worker definitions or pre-existing function ACLs change.
revoke all on function public.email_workspace_automation_snapshot(uuid),
  public.get_email_workspace_automation_status(uuid),public.set_email_workspace_automation(uuid,boolean,text,boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.get_email_workspace_automation_status(uuid),
  public.set_email_workspace_automation(uuid,boolean,text,boolean) to authenticated;
comment on function public.get_email_workspace_automation_status(uuid) is 'Human member aggregate-only active-app automation review. At most 200 displayed; no recipient/copy/credential data or delivery readiness invocation.';
comment on function public.set_email_workspace_automation(uuid,boolean,text,boolean) is 'Atomic human-admin reviewed research + reusable daily drafts control only. Explicit research-cost confirmation on start. NEVER alters delivery, consent or permanent request/send ledgers.';
notify pgrst, 'reload schema';
commit;
