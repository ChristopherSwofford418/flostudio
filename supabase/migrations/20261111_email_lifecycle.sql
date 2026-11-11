-- Prepared only: applying this migration does not activate campaigns, flags or jobs.
-- No provider calls, account rotation, credential reads or queue/quota history changes.
begin;

alter table public.email_gmail_accounts add column delivery_pause_reason text
  check (delivery_pause_reason is null or delivery_pause_reason in ('provider_rejected','submission_unknown','reconnect_required'));
alter table public.workspace_gmail_connections add column delivery_pause_reason text
  check (delivery_pause_reason is null or delivery_pause_reason in ('provider_rejected','submission_unknown','reconnect_required'));

create or replace function public.email_connection_status(p_workspace_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or coalesce(public.get_workspace_role(p_workspace_id),'') not in ('owner','admin','member') then
    raise exception 'Workspace membership required' using errcode = '42501';
  end if;
  return (select jsonb_build_object(
    'configured',coalesce(c.configured,false), 'email',c.email,
    'expected_email',p.expected_sender_email, 'daily_budget',coalesce(c.daily_budget,400),
    'connection_sending_enabled',coalesce(c.sending_enabled,false),
    'account_sending_enabled',coalesce(a.sending_enabled,false),
    'pause_reason',case when coalesce(a.delivery_pause_reason,c.delivery_pause_reason)
      in ('provider_rejected','submission_unknown','reconnect_required')
      then coalesce(a.delivery_pause_reason,c.delivery_pause_reason) else null end
  ) from public.workspaces w
  left join public.workspace_gmail_connections c on c.workspace_id = w.id
  left join public.email_gmail_accounts a on a.account_key = c.account_key
  left join public.workspace_email_preferences p on p.workspace_id = w.id
  where w.id = p_workspace_id);
end $$;

-- Private implementation: full-set fingerprint; only the public member/admin RPCs can call it.
-- Locks follow dispatch/diagnostics: workspace advisory -> connection -> account row
-- -> account advisory. Readiness also holds campaign/product/preference rows until commit.
create function public.email_lifecycle_readiness(p_workspace_id uuid, p_product_id uuid, p_activation boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.email_campaigns;
  v_product jsonb;
  v_account_key text; v_email text; v_expected text;
  v_configured boolean; v_connection_enabled boolean; v_account_enabled boolean;
  v_connection_budget integer; v_account_budget integer; v_connection_updated timestamptz;
  v_connection_pause text; v_account_pause text; v_pause text;
  v_host text; v_configuration_valid boolean; v_sender_valid boolean;
  v_opted_in integer; v_approved integer; v_eligible integer;
  v_preview jsonb; v_contacts jsonb; v_drafts jsonb; v_history jsonb; v_revision text;
  v_code text := 'EMAIL_READY';
begin
  if auth.uid() is null or coalesce(public.get_workspace_role(p_workspace_id),'') not in ('owner','admin','member') then
    raise exception 'Workspace membership required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('email-workspace:' || p_workspace_id::text, 0));
  perform 1 from public.workspaces w where w.id = p_workspace_id for share;
  -- A membership revocation cannot race a human approval after the role check.
  perform 1 from public.workspace_members m where m.workspace_id = p_workspace_id and m.user_id = auth.uid() for share;
  if coalesce(public.get_workspace_role(p_workspace_id),'') not in ('owner','admin','member') then
    raise exception 'Workspace membership required' using errcode = '42501';
  end if;
  select jsonb_build_object('id',p.id,'workspace_id',p.workspace_id,'source_facts',p.source_facts)
    into v_product from public.products p where p.workspace_id = p_workspace_id and p.id = p_product_id for share;
  if v_product is null then
    return jsonb_build_object('allowed',false,'code','EMAIL_PRODUCT_NOT_FOUND','status','blocked',
      'counts',jsonb_build_object('optedIn',0,'approvedDrafts',0,'eligibleRecipients',0),'eligibleRecipients','[]'::jsonb,
      'deliveryGates','{}'::jsonb,'deliveryPauseReason',null,'reviewRevision',null);
  end if;
  select * into c from public.email_campaigns where workspace_id = p_workspace_id and product_id = p_product_id for update;
  if c.id is null then
    return jsonb_build_object('allowed',false,'code','CAMPAIGN_REQUIRED','status','blocked',
      'counts',jsonb_build_object('optedIn',0,'approvedDrafts',0,'eligibleRecipients',0),'eligibleRecipients','[]'::jsonb,
      'deliveryGates','{}'::jsonb,'deliveryPauseReason',null,'reviewRevision',null);
  end if;
  if p_activation then
    select account_key,email,configured,sending_enabled,daily_budget,updated_at,delivery_pause_reason
      into v_account_key,v_email,v_configured,v_connection_enabled,v_connection_budget,v_connection_updated,v_connection_pause
      from public.workspace_gmail_connections where workspace_id = p_workspace_id for update;
  else
    select account_key,email,configured,sending_enabled,daily_budget,updated_at,delivery_pause_reason
      into v_account_key,v_email,v_configured,v_connection_enabled,v_connection_budget,v_connection_updated,v_connection_pause
      from public.workspace_gmail_connections where workspace_id = p_workspace_id for share;
  end if;
  select sending_enabled,daily_budget,delivery_pause_reason into v_account_enabled,v_account_budget,v_account_pause
    from public.email_gmail_accounts where account_key = v_account_key for update;
  if v_account_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('email-account:' || v_account_key, 0));
  end if;
  select expected_sender_email into v_expected from public.workspace_email_preferences where workspace_id = p_workspace_id for share;
  v_pause := coalesce(v_account_pause,v_connection_pause);
  v_sender_valid := coalesce(v_configured,false) and v_account_budget is not null
    and nullif(btrim(v_expected),'') is not null and v_expected = v_email;
  v_host := lower(substring(c.ad_link from '^https://([^/?#]+)'));
  v_configuration_valid := btrim(c.sender_name) <> '' and c.sender_name !~ E'[\r\n]'
    and btrim(c.postal_address) <> '' and btrim(c.audience) <> '' and btrim(c.language) <> ''
    and length(c.ad_link) <= 2000 and c.ad_link !~ '[[:space:]]'
    and coalesce(v_host ~ '^[a-z0-9][a-z0-9.-]*\.[a-z]{2,63}(:443)?$',false)
    and regexp_replace(v_host,':443$','') !~ '\.(local|internal)$';

  -- Genuine app-specific operator-recorded opt-in, not a public-source candidate.
  -- Evidence is an operator attestation; this RPC does not certify its truth independently.
  with opted as (
    select r.id,r.email,r.organization from public.email_contacts r
    where r.workspace_id = p_workspace_id and r.product_id = p_product_id and r.status = 'opted_in'
      and r.consent_recorded_by is not null and r.consent_recorded_at is not null
      and jsonb_typeof(r.consent_evidence->'method') = 'string' and btrim(r.consent_evidence->>'method') <> ''
      and jsonb_typeof(r.consent_evidence->'reference') = 'string' and length(btrim(r.consent_evidence->>'reference')) >= 20
      and jsonb_typeof(r.consent_evidence->'recorded_at') = 'string' and btrim(r.consent_evidence->>'recorded_at') <> ''
  ), eligible as (
    select r.id,r.email,r.organization,d.id as draft_id,d.subject,d.body,d.created_at
    from opted r join public.email_drafts d on d.contact_id = r.id
      and d.workspace_id = p_workspace_id and d.product_id = p_product_id and d.campaign_id = c.id
    where d.status = 'approved' and d.approved_by is not null and d.approved_at is not null
      and btrim(d.subject) <> '' and btrim(d.body) <> ''
      and not exists (select 1 from public.email_suppressions s where s.workspace_id = p_workspace_id and s.email = r.email)
      and not exists (select 1 from public.email_send_queue q where q.workspace_id = p_workspace_id and q.email = r.email
        and (q.claimed_at is not null or q.claim_token is not null or q.status in ('claimed','sent','unknown','failed')
          or exists (select 1 from public.email_quota_reservations quota where quota.queue_id = q.id)))
      and not exists (select 1 from public.email_send_queue q where q.workspace_id = p_workspace_id and q.product_id = p_product_id
        and q.scheduled_day <> (now() at time zone c.timezone)::date and q.subject_snapshot = d.subject and q.body_snapshot = d.body
        and (q.claimed_at is not null or q.claim_token is not null or q.status in ('claimed','sent','unknown','failed')
          or exists (select 1 from public.email_quota_reservations quota where quota.queue_id = q.id)))
  ), preview as (
    select distinct on (id) id,email,organization,draft_id,subject,body,created_at from eligible order by id,created_at,draft_id
  )
  select (select count(*) from opted),(select count(*) from eligible),(select count(distinct id) from eligible),
    coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'email',p.email,'organization',p.organization,
      'draftId',p.draft_id,'subject',p.subject,'body',p.body) order by p.created_at,p.id)
      from (select * from preview order by created_at,id limit c.daily_limit) p),'[]'::jsonb)
    into v_opted_in,v_approved,v_eligible,v_preview;

  -- Complete app candidate/copy set, not only the bounded preview or updated_at.
  select coalesce(jsonb_agg(jsonb_build_array(r.id,r.email,r.organization,r.status,r.consent_evidence,
    r.consent_recorded_by,r.consent_recorded_at) order by r.id),'[]'::jsonb) into v_contacts
    from public.email_contacts r where r.workspace_id = p_workspace_id and r.product_id = p_product_id;
  select coalesce(jsonb_agg(jsonb_build_array(d.id,d.contact_id,d.subject,d.body,d.status,d.approved_by,d.approved_at)
    order by d.id),'[]'::jsonb) into v_drafts from public.email_drafts d
    where d.workspace_id = p_workspace_id and d.product_id = p_product_id and d.campaign_id = c.id;
  select jsonb_build_object(
    'suppressions',coalesce((select jsonb_agg(s.email order by s.email) from public.email_suppressions s
      where s.workspace_id = p_workspace_id),'[]'::jsonb),
    'attempts',coalesce((select jsonb_agg(jsonb_build_array(q.id,q.email,q.product_id,q.scheduled_day,q.subject_snapshot,q.body_snapshot)
      order by q.id) from public.email_send_queue q where q.workspace_id = p_workspace_id
      and (q.claimed_at is not null or q.claim_token is not null or q.status in ('claimed','sent','unknown','failed')
        or exists (select 1 from public.email_quota_reservations quota where quota.queue_id = q.id))),'[]'::jsonb)
  ) into v_history;
  v_revision := encode(sha256(convert_to(jsonb_build_object(
    'campaign',to_jsonb(c) - array['created_at','updated_at'], 'product',v_product,
    'connection',jsonb_build_array(v_account_key,v_email,v_expected,v_configured,v_connection_enabled,v_connection_budget,v_connection_updated,v_connection_pause),
    'account',jsonb_build_array(v_account_key,v_account_enabled,v_account_budget,v_account_pause),
    'contacts',v_contacts,'drafts',v_drafts,'history',v_history,'localDay',(now() at time zone c.timezone)::date
  )::text,'UTF8')),'hex');

  if coalesce(lower(v_product->'source_facts'->>'archived'),'false') = 'true' then v_code := 'EMAIL_APP_ARCHIVED';
  elsif not coalesce(v_sender_valid,false) then v_code := 'GMAIL_CONNECTION_REQUIRED';
  elsif not coalesce(v_configuration_valid,false) then v_code := 'SENDER_DETAILS_REQUIRED';
  elsif v_eligible < 1 then v_code := 'EMAIL_NO_ELIGIBLE_RECIPIENTS';
  end if;
  return jsonb_build_object('allowed',v_code = 'EMAIL_READY','code',v_code,
    'status',case when v_code = 'EMAIL_READY' then 'ready' else 'blocked' end,
    'counts',jsonb_build_object('optedIn',v_opted_in,'approvedDrafts',v_approved,'eligibleRecipients',v_eligible),
    'eligibleRecipients',v_preview,'reviewRevision',v_revision,'deliveryPauseReason',v_pause,
    'deliveryGates',jsonb_build_object('productActive',coalesce(lower(v_product->'source_facts'->>'archived'),'false') <> 'true',
      'campaignConfigured',coalesce(v_configuration_valid,false),'senderConfigured',coalesce(v_sender_valid,false),
      'connectionEnabled',coalesce(v_connection_enabled,false),'accountEnabled',coalesce(v_account_enabled,false),
      'campaignEnabled',c.sending_enabled));
end $$;

create function public.email_campaign_readiness(p_workspace_id uuid, p_product_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return public.email_lifecycle_readiness(p_workspace_id,p_product_id,false);
end $$;

create function public.email_activate_campaign(p_workspace_id uuid, p_product_id uuid, p_campaign_id uuid, p_review_revision text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_ready jsonb; v_account_key text;
begin
  if auth.uid() is null or not coalesce(public.is_workspace_admin(p_workspace_id),false) then
    raise exception 'Human workspace admin required' using errcode = '42501';
  end if;
  v_ready := public.email_lifecycle_readiness(p_workspace_id,p_product_id,true);
  if not coalesce(public.is_workspace_admin(p_workspace_id),false) then
    raise exception 'Human workspace admin required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.email_campaigns where id = p_campaign_id
    and workspace_id = p_workspace_id and product_id = p_product_id) then
    return jsonb_build_object('allowed',false,'code','EMAIL_RECORD_NOT_FOUND','status','blocked');
  end if;
  if nullif(p_review_revision,'') is null or p_review_revision is distinct from v_ready->>'reviewRevision' then
    return jsonb_build_object('allowed',false,'code','EMAIL_REVIEW_STALE','status','blocked');
  end if;
  if not coalesce((v_ready->>'allowed')::boolean,false) then
    return jsonb_build_object('allowed',false,'code',v_ready->>'code','status','blocked');
  end if;
  -- No mutations occur before EVERY validation. Any subsequent SQL exception rolls
  -- back campaign, connection and account together; no partial activation can persist.
  select account_key into v_account_key from public.workspace_gmail_connections where workspace_id = p_workspace_id;
  perform set_config('email.lifecycle_campaign',p_campaign_id::text,true);
  update public.email_campaigns set state = 'approved',sending_enabled = true where id = p_campaign_id;
  update public.email_gmail_accounts set sending_enabled = true,delivery_pause_reason = null where account_key = v_account_key;
  update public.workspace_gmail_connections set sending_enabled = true,delivery_pause_reason = null where workspace_id = p_workspace_id;
  perform set_config('email.lifecycle_campaign','',true);
  -- Only the selected campaign/connection is enabled. Peers are never reactivated.
  return jsonb_build_object('allowed',true,'code','EMAIL_CAMPAIGN_ACTIVATED','status','approved');
end $$;

-- Existing authenticated UPDATE grants remain for editing/pausing, not activation.
-- This trigger is deliberately SECURITY INVOKER: a caller cannot spoof the definer's
-- database role with a GUC. Both the definer role AND transaction-local campaign ID
-- are required, even if an authenticated SQL caller manually sets that GUC.
create function public.email_require_lifecycle_activation() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.state = 'approved' or new.sending_enabled then
    if current_user <> pg_get_userbyid((select proowner from pg_proc
        where oid = 'public.email_activate_campaign(uuid,uuid,uuid,text)'::regprocedure))
      or current_setting('email.lifecycle_campaign',true) is distinct from new.id::text then
      raise exception 'Transactional campaign review required' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger email_campaign_lifecycle_guard before insert or update on public.email_campaigns
  for each row execute function public.email_require_lifecycle_activation();

create function public.email_pause_mailbox(p_workspace_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_account_key text; v_workspace uuid; v_workspaces uuid[];
begin
  if p_reason is null or p_reason not in ('provider_rejected','submission_unknown','reconnect_required') then
    raise exception 'Invalid mailbox pause reason' using errcode = '22023';
  end if;
  select account_key into v_account_key from public.workspace_gmail_connections where workspace_id = p_workspace_id;
  if v_account_key is null then return jsonb_build_object('allowed',false,'code','GMAIL_CONNECTION_REQUIRED','status','blocked'); end if;
  select array_agg(workspace_id order by workspace_id) into v_workspaces
    from public.workspace_gmail_connections where account_key = v_account_key;
  -- ALL workspace advisories precede any connection/account row locks. Sorted order
  -- prevents two simultaneous mailbox pauses from locking peer workspaces oppositely.
  foreach v_workspace in array v_workspaces loop
    perform pg_advisory_xact_lock(hashtextextended('email-workspace:' || v_workspace::text, 0));
  end loop;
  perform 1 from public.workspace_gmail_connections where account_key = v_account_key order by workspace_id for update;
  if not exists (select 1 from public.workspace_gmail_connections where workspace_id = p_workspace_id and account_key = v_account_key) then
    raise exception 'Mailbox scope changed; retry protected operation' using errcode = '40001';
  end if;
  perform 1 from public.email_gmail_accounts where account_key = v_account_key for update;
  perform pg_advisory_xact_lock(hashtextextended('email-account:' || v_account_key, 0));
  if exists (select 1 from public.workspace_gmail_connections where account_key = v_account_key and not (workspace_id = any(v_workspaces))) then
    raise exception 'Mailbox scope changed; retry protected operation' using errcode = '40001';
  end if;
  update public.email_gmail_accounts set sending_enabled = false,delivery_pause_reason = p_reason where account_key = v_account_key;
  update public.workspace_gmail_connections set sending_enabled = false,delivery_pause_reason = p_reason where account_key = v_account_key;
  update public.email_campaigns set state = 'paused',sending_enabled = false
    where workspace_id in (select workspace_id from public.workspace_gmail_connections where account_key = v_account_key)
      and state = 'approved';
  return jsonb_build_object('allowed',true,'code','EMAIL_MAILBOX_PAUSED','status','paused');
end $$;

revoke all on function public.email_connection_status(uuid) from public, anon, authenticated, service_role;
revoke all on function public.email_lifecycle_readiness(uuid,uuid,boolean) from public, anon, authenticated, service_role;
revoke all on function public.email_campaign_readiness(uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.email_activate_campaign(uuid,uuid,uuid,text) from public, anon, authenticated, service_role;
revoke all on function public.email_require_lifecycle_activation() from public, anon, authenticated, service_role;
revoke all on function public.email_pause_mailbox(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.email_connection_status(uuid),public.email_campaign_readiness(uuid,uuid),
  public.email_activate_campaign(uuid,uuid,uuid,text) to authenticated;
grant execute on function public.email_pause_mailbox(uuid,text) to service_role;
comment on function public.email_campaign_readiness(uuid,uuid) is 'Human member, app-scoped safe readiness; full-set SHA-256 review fingerprint and bounded recipient/copy preview. No credentials or quota guarantees.';
comment on function public.email_activate_campaign(uuid,uuid,uuid,text) is 'Human admin JWT only. Locked review fingerprint compare, eligibility validation and selected campaign/connection/account enablement in one transaction. Never enables peers.';
comment on function public.email_pause_mailbox(uuid,text) is 'Service-only mailbox-wide pause with fixed reason; pauses every approved peer campaign and connection without changing permanent queue/quota/diagnostic history.';
notify pgrst, 'reload schema';
commit;
