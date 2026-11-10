-- Permanent workspace-wide recipient exclusion; no data changes or sending activation.
-- Contract: email_prepare_queue retains its signature/UUID result and idempotence for
-- unclaimed prepared rows, but raises if ANY prior claim evidence or reservation exists.
-- email_claim_send retains its signature/queue result and returns NULL when ineligible.
-- A claim consumes the recipient forever, including failed/unknown/sent outcomes. Neither
-- predicate uses a cooldown, last_contacted_at, reservation age, or any expiration.
-- Existing quota rows are permanent and restrict queue deletion; existing ACLs prohibit
-- clients (including service_role) from updating/deleting queue and quota history directly.
-- Exact subject + body snapshots may serve multiple NEW recipients on one app-local day,
-- but may not be reused on a different local day for that workspace/product. This is an
-- exact-copy safeguard, not semantic novelty detection or automatic approval of new ads.
begin;

-- No index on unbounded message text: compare immutable copy only after narrowing scope.
create index if not exists email_queue_app_copy_day_idx
  on public.email_send_queue(workspace_id, product_id, scheduled_day);

create or replace function public.email_prepare_queue(p_campaign_id uuid, p_contact_id uuid, p_draft_id uuid, p_scheduled_day date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.email_campaigns; r public.email_contacts; d public.email_drafts; result uuid;
begin
  select * into c from public.email_campaigns where id = p_campaign_id;
  if c.id is null then raise exception 'Campaign not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('email-workspace:' || c.workspace_id::text, 0));
  select * into c from public.email_campaigns where id = p_campaign_id;
  if c.id is null then raise exception 'Campaign not found'; end if;
  select * into r from public.email_contacts where id = p_contact_id and workspace_id = c.workspace_id and product_id = c.product_id;
  select * into d from public.email_drafts where id = p_draft_id and campaign_id = c.id and contact_id = r.id and workspace_id = c.workspace_id and product_id = c.product_id;
  if c.state <> 'approved' or r.id is null or r.status <> 'opted_in' or d.id is null or d.status <> 'approved'
    or p_scheduled_day is null or p_scheduled_day <> (now() at time zone c.timezone)::date
    or exists (select 1 from public.products where id = c.product_id and workspace_id = c.workspace_id and source_facts->>'archived' = 'true')
    or exists (select 1 from public.email_suppressions where workspace_id = c.workspace_id and email = r.email) then
    raise exception 'Approved campaign/draft, current local date and unsuppressed opt-in required';
  end if;
  -- Evidence, not outcome or age: even a reservation-only row consumes its address.
  if exists (select 1 from public.email_send_queue previous
      where previous.workspace_id = c.workspace_id and previous.email = r.email
        and (previous.claimed_at is not null or previous.claim_token is not null
          or previous.status in ('claimed','sent','unknown','failed')
          or exists (select 1 from public.email_quota_reservations quota where quota.queue_id = previous.id))) then
    raise exception 'Recipient already consumed by a workspace send attempt';
  end if;
  if exists (select 1 from public.email_send_queue previous
      where previous.workspace_id = c.workspace_id and previous.product_id = c.product_id
        and previous.scheduled_day <> p_scheduled_day
        and previous.subject_snapshot = d.subject and previous.body_snapshot = d.body
        and (previous.claimed_at is not null or previous.claim_token is not null
          or previous.status in ('claimed','sent','unknown','failed')
          or exists (select 1 from public.email_quota_reservations quota where quota.queue_id = previous.id))) then
    raise exception 'Approved ad copy already consumed on another app local day';
  end if;
  insert into public.email_send_queue(workspace_id,product_id,campaign_id,contact_id,draft_id,email,scheduled_day)
    values(c.workspace_id,c.product_id,c.id,r.id,d.id,r.email,p_scheduled_day) on conflict do nothing returning id into result;
  if result is null then select id into result from public.email_send_queue where campaign_id = c.id and contact_id = r.id and scheduled_day = p_scheduled_day; end if;
  return result;
end $$;

-- The workspace advisory lock serializes preparation, mutations, suppression and claims.
-- Row/account locks and BOTH quota checks remain; reservation + snapshots + claim are
-- committed atomically. No claim is retried or released after an uncertain outcome.
create or replace function public.email_claim_send(p_queue_id uuid) returns public.email_send_queue
language plpgsql security definer set search_path = '' as $$
declare q public.email_send_queue; c public.email_campaigns; r public.email_contacts; d public.email_drafts;
  conn public.workspace_gmail_connections; account public.email_gmail_accounts; local_now timestamp; budget integer;
begin
  select * into q from public.email_send_queue where id = p_queue_id;
  if q.id is null then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended('email-workspace:' || q.workspace_id::text, 0));
  select * into q from public.email_send_queue where id = p_queue_id for update;
  if q.id is null or q.status <> 'prepared' then return null; end if;
  select * into c from public.email_campaigns where id = q.campaign_id and workspace_id = q.workspace_id and product_id = q.product_id;
  select * into r from public.email_contacts where id = q.contact_id and workspace_id = q.workspace_id and product_id = q.product_id and email = q.email;
  select * into d from public.email_drafts where id = q.draft_id and workspace_id = q.workspace_id and product_id = q.product_id and campaign_id = q.campaign_id and contact_id = q.contact_id;
  if c.id is null or r.id is null or d.id is null then return null; end if;
  select * into conn from public.workspace_gmail_connections where workspace_id = q.workspace_id for share;
  if not coalesce(conn.configured,false) or not coalesce(conn.sending_enabled,false) then return null; end if;
  select * into account from public.email_gmail_accounts where account_key = conn.account_key for update;
  local_now := now() at time zone c.timezone;
  if c.state <> 'approved' or not c.sending_enabled or not coalesce(account.sending_enabled,false)
    or exists (select 1 from public.products where id = c.product_id and workspace_id = c.workspace_id and source_facts->>'archived' = 'true')
    or q.scheduled_day <> local_now::date or local_now::time < make_time(c.send_hour,c.send_minute,0) then return null; end if;
  if r.status <> 'opted_in' or d.status <> 'approved'
    or exists (select 1 from public.email_suppressions where workspace_id = q.workspace_id and email = q.email) then
    update public.email_send_queue set status = 'suppressed', updated_at = now() where id = q.id;
    return null;
  end if;
  -- Include q itself if it somehow already has claim evidence/reservation while prepared.
  if exists (select 1 from public.email_send_queue previous
      where previous.workspace_id = q.workspace_id and previous.email = q.email
        and (previous.claimed_at is not null or previous.claim_token is not null
          or previous.status in ('claimed','sent','unknown','failed')
          or exists (select 1 from public.email_quota_reservations quota where quota.queue_id = previous.id))) then return null; end if;
  if exists (select 1 from public.email_send_queue previous
      where previous.workspace_id = q.workspace_id and previous.product_id = q.product_id
        and previous.scheduled_day <> q.scheduled_day
        and previous.subject_snapshot = d.subject and previous.body_snapshot = d.body
        and (previous.claimed_at is not null or previous.claim_token is not null
          or previous.status in ('claimed','sent','unknown','failed')
          or exists (select 1 from public.email_quota_reservations quota where quota.queue_id = previous.id))) then return null; end if;
  if (select count(*) from public.email_quota_reservations quota join public.email_send_queue item on item.id = quota.queue_id
      where item.campaign_id = c.id and item.scheduled_day = q.scheduled_day) >= c.daily_limit then return null; end if;
  select least(account.daily_budget, min(connection.daily_budget)) into budget
    from public.workspace_gmail_connections connection where connection.account_key = conn.account_key and connection.configured and connection.sending_enabled;
  if (select count(*) from public.email_quota_reservations where account_key = account.account_key and reserved_at > now() - interval '24 hours') >= budget then return null; end if;
  insert into public.email_quota_reservations(queue_id,account_key) values(q.id,account.account_key);
  update public.email_send_queue set status = 'claimed', claim_token = gen_random_uuid(), claimed_at = now(), updated_at = now(),
    subject_snapshot = d.subject, body_snapshot = d.body,
    sender_snapshot = jsonb_build_object('email',conn.email,'sender_name',c.sender_name,'postal_address',c.postal_address,'ad_link',c.ad_link)
    where id = q.id returning * into q;
  return q;
end $$;

-- CREATE OR REPLACE preserves existing ownership/ACLs; explicitly retain service-only RPCs.
revoke all on function public.email_prepare_queue(uuid,uuid,uuid,date) from public, anon, authenticated;
revoke all on function public.email_claim_send(uuid) from public, anon, authenticated;
grant execute on function public.email_prepare_queue(uuid,uuid,uuid,date), public.email_claim_send(uuid) to service_role;
comment on function public.email_prepare_queue(uuid,uuid,uuid,date) is 'Service-only. Human-approved current-day opt-in queue; permanent workspace recipient exclusion and cross-local-day exact-copy exclusion.';
comment on function public.email_claim_send(uuid) is 'Service-only atomic one-shot claim. Every claim/reservation permanently consumes the workspace recipient; failed/unknown/sent never reopen eligibility.';
notify pgrst, 'reload schema';
commit;
