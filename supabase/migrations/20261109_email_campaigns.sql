-- Additive email foundation. NO provider calls, cron jobs, plaintext credentials, or enabled sending.
-- Credential/account writes require a server service role after a real user-JWT admin check.
begin;
create unique index if not exists email_products_workspace_id_uidx on public.products(workspace_id, id);

create table public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  product_id uuid not null,
  name text not null default 'Daily app email',
  daily_limit integer not null default 100 check (daily_limit between 1 and 100),
  timezone text not null default 'UTC',
  send_hour integer not null default 9 check (send_hour between 0 and 23),
  send_minute integer not null default 0 check (send_minute between 0 and 59),
  state text not null default 'draft' check (state in ('draft','paused','approved')),
  sending_enabled boolean not null default false,
  recipient_cooldown_days integer not null default 30 check (recipient_cooldown_days between 30 and 3650),
  sender_name text not null default '', postal_address text not null default '',
  ad_link text not null default '', audience text not null default '', language text not null default 'en',
  approved_by uuid references auth.users(id), approved_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, product_id), unique (workspace_id, product_id, id),
  foreign key (workspace_id, product_id) references public.products(workspace_id, id),
  check (state <> 'approved' or (approved_by is not null and approved_at is not null))
);
create table public.email_contacts (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, product_id uuid not null,
  email text not null check (email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and length(email) <= 254),
  organization text not null default '',
  status text not null default 'candidate' check (status in ('candidate','opted_in','unsubscribed')),
  consent_evidence jsonb not null default '{}' check (jsonb_typeof(consent_evidence) = 'object'),
  consent_recorded_by uuid references auth.users(id), consent_recorded_at timestamptz,
  source_url text check (source_url is null or source_url ~ '^https?://'),
  source_evidence jsonb not null default '{}' check (jsonb_typeof(source_evidence) = 'object'),
  last_contacted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, product_id, email), unique (workspace_id, product_id, id),
  unique (workspace_id, product_id, id, email),
  foreign key (workspace_id, product_id) references public.products(workspace_id, id),
  check (status <> 'opted_in' or (
    consent_recorded_by is not null and consent_recorded_at is not null
    and coalesce(jsonb_typeof(consent_evidence->'method') = 'string', false) and nullif(btrim(consent_evidence->>'method'),'') is not null
    and jsonb_typeof(consent_evidence->'reference') = 'string' and nullif(btrim(consent_evidence->>'reference'),'') is not null
    and jsonb_typeof(consent_evidence->'recorded_at') = 'string' and nullif(btrim(consent_evidence->>'recorded_at'),'') is not null))
);
create table public.email_drafts (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, product_id uuid not null,
  campaign_id uuid not null, contact_id uuid not null,
  subject text not null default '' check (length(subject) <= 998 and subject !~ E'[\r\n]'), body text not null default '',
  status text not null default 'draft' check (status in ('draft','approved')),
  approved_by uuid references auth.users(id), approved_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, product_id, campaign_id, contact_id, id),
  foreign key (workspace_id, product_id, campaign_id) references public.email_campaigns(workspace_id, product_id, id),
  foreign key (workspace_id, product_id, contact_id) references public.email_contacts(workspace_id, product_id, id),
  check (status <> 'approved' or (approved_by is not null and approved_at is not null and btrim(subject) <> '' and btrim(body) <> ''))
);
create table public.email_gmail_accounts (
  account_key text primary key check (account_key ~ '^[0-9a-f]{64}$'),
  daily_budget integer not null default 400 check (daily_budget between 1 and 2000),
  sending_enabled boolean not null default false, created_at timestamptz not null default now()
);
create table public.workspace_gmail_connections (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  account_key text not null references public.email_gmail_accounts(account_key), email text not null,
  configured boolean not null default false,
  sending_enabled boolean not null default false,
  daily_budget integer not null default 400 check (daily_budget between 1 and 2000),
  encrypted_credentials jsonb,
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (not configured or encrypted_credentials is not null),
  check (encrypted_credentials is null or (
    jsonb_typeof(encrypted_credentials) = 'object' and coalesce(encrypted_credentials->>'algorithm' = 'aes-256-gcm', false)
    and coalesce(encrypted_credentials->>'version' = '1', false)
    and nullif(encrypted_credentials->>'ciphertext','') is not null
    and nullif(encrypted_credentials->>'iv','') is not null and nullif(encrypted_credentials->>'tag','') is not null))
);
create table public.email_oauth_states (
  state_hash text primary key check (state_hash ~ '^[0-9a-f]{64}$'),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id), expires_at timestamptz not null, consumed_at timestamptz,
  created_at timestamptz not null default now(), check (expires_at > created_at and expires_at <= created_at + interval '15 minutes')
);
create table public.email_suppressions (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  reason text not null default 'unsubscribed', created_at timestamptz not null default now(),
  primary key (workspace_id, email)
);
create table public.email_unsubscribe_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  expires_at timestamptz, created_at timestamptz not null default now()
);
create table public.email_send_queue (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, product_id uuid not null,
  campaign_id uuid not null, contact_id uuid not null, draft_id uuid not null, email text not null,
  scheduled_day date not null,
  status text not null default 'prepared' check (status in ('prepared','claimed','sent','unknown','failed','suppressed')),
  claim_token uuid, claimed_at timestamptz, finished_at timestamptz, provider_message_id text,
  subject_snapshot text, body_snapshot text, sender_snapshot jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (campaign_id, contact_id, scheduled_day), unique (workspace_id, email, scheduled_day),
  foreign key (workspace_id, product_id, campaign_id) references public.email_campaigns(workspace_id, product_id, id),
  foreign key (workspace_id, product_id, contact_id, email) references public.email_contacts(workspace_id, product_id, id, email),
  foreign key (workspace_id, product_id, campaign_id, contact_id, draft_id) references public.email_drafts(workspace_id, product_id, campaign_id, contact_id, id),
  check (status not in ('claimed','sent','unknown','failed') or (claim_token is not null and claimed_at is not null))
);
create table public.email_quota_reservations (
  queue_id uuid primary key references public.email_send_queue(id) on delete restrict,
  account_key text not null references public.email_gmail_accounts(account_key), reserved_at timestamptz not null default now()
);
create index email_quota_account_time_idx on public.email_quota_reservations(account_key, reserved_at);
create index email_queue_recipient_time_idx on public.email_send_queue(workspace_id, email, claimed_at);
create index email_queue_campaign_day_idx on public.email_send_queue(campaign_id, scheduled_day);
create table public.email_cron_runs (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, product_id uuid not null, campaign_id uuid not null,
  scheduled_day date not null, claimed_at timestamptz not null default now(),
  unique (campaign_id, scheduled_day),
  foreign key (workspace_id, product_id, campaign_id) references public.email_campaigns(workspace_id, product_id, id)
);

-- Mutations take the same workspace lock as dispatch/suppression. Concurrent row edits may
-- deadlock and abort safely; retry the database mutation, never the external send.
create function public.email_guard_mutation() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('email-workspace:' || new.workspace_id::text, 0));
  if tg_op = 'UPDATE' and (new.workspace_id <> old.workspace_id or new.product_id <> old.product_id or new.id <> old.id) then
    raise exception 'Email identity/scope is immutable';
  end if;
  new.updated_at := now();
  if tg_table_name = 'email_campaigns' then
    if not exists (select 1 from pg_timezone_names where name = new.timezone) then raise exception 'Invalid IANA timezone'; end if;
    if tg_op = 'UPDATE' and (to_jsonb(new) - array['state','sending_enabled','approved_by','approved_at','created_at','updated_at'])
      is distinct from (to_jsonb(old) - array['state','sending_enabled','approved_by','approved_at','created_at','updated_at']) then
      new.state := 'draft';
      update public.email_drafts set status = 'draft' where campaign_id = new.id and status = 'approved';
    end if;
    if new.state = 'approved' then
      if tg_op = 'INSERT' or old.state <> 'approved' then
        if auth.uid() is null or not public.is_workspace_admin(new.workspace_id) then raise exception 'Human admin approval required'; end if;
        new.approved_by := auth.uid(); new.approved_at := now();
      else new.approved_by := old.approved_by; new.approved_at := old.approved_at;
      end if;
      if btrim(new.sender_name) = '' or new.sender_name ~ E'[\r\n]' or btrim(new.postal_address) = '' or new.ad_link !~ '^https://' then
        raise exception 'Sender name, postal address and HTTPS ad link required';
      end if;
      new.sending_enabled := true;
    else new.approved_by := null; new.approved_at := null; new.sending_enabled := false;
    end if;
  elsif tg_table_name = 'email_contacts' then
    if tg_op = 'UPDATE' and new.email <> old.email then raise exception 'Recipient identity is immutable'; end if;
    if new.status = 'opted_in' and (tg_op = 'INSERT' or old.status <> 'opted_in' or new.consent_evidence is distinct from old.consent_evidence) then
      if auth.uid() is null or not public.is_workspace_admin(new.workspace_id) then raise exception 'Manual admin consent recording required'; end if;
      if nullif(new.consent_evidence->>'recorded_at','') is null then raise exception 'Consent timestamp required'; end if;
      if (new.consent_evidence->>'recorded_at')::timestamptz > now() then raise exception 'Consent evidence cannot be in future'; end if;
      new.consent_recorded_by := auth.uid(); new.consent_recorded_at := now();
    elsif tg_op = 'UPDATE' then
      new.consent_recorded_by := old.consent_recorded_by; new.consent_recorded_at := old.consent_recorded_at;
    else new.consent_recorded_by := null; new.consent_recorded_at := null;
    end if;
    if new.status = 'opted_in' and exists (select 1 from public.email_suppressions where workspace_id = new.workspace_id and email = new.email) then
      raise exception 'Workspace suppression prevents opt-in';
    end if;
    if new.status = 'unsubscribed' then
      insert into public.email_suppressions(workspace_id,email) values(new.workspace_id,new.email) on conflict do nothing;
    end if;
  else
    if tg_op = 'UPDATE' and (new.campaign_id <> old.campaign_id or new.contact_id <> old.contact_id) then raise exception 'Draft scope is immutable'; end if;
    if tg_op = 'UPDATE' and (new.subject is distinct from old.subject or new.body is distinct from old.body) then new.status := 'draft'; end if;
    if new.status = 'draft' then
      update public.email_send_queue set status = 'suppressed', updated_at = now() where draft_id = new.id and status = 'prepared';
    end if;
    if new.status = 'approved' then
      if tg_op = 'INSERT' or old.status <> 'approved' then
        if auth.uid() is null or not public.is_workspace_admin(new.workspace_id) then raise exception 'Human draft approval required'; end if;
        new.approved_by := auth.uid(); new.approved_at := now();
      else new.approved_by := old.approved_by; new.approved_at := old.approved_at;
      end if;
    else new.approved_by := null; new.approved_at := null;
    end if;
  end if;
  return new;
end $$;
create trigger email_campaign_guard before insert or update on public.email_campaigns for each row execute function public.email_guard_mutation();
create trigger email_contact_guard before insert or update on public.email_contacts for each row execute function public.email_guard_mutation();
create trigger email_draft_guard before insert or update on public.email_drafts for each row execute function public.email_guard_mutation();

create function public.email_suppress_pending() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('email-workspace:' || new.workspace_id::text, 0));
  update public.email_send_queue set status = 'suppressed', updated_at = now()
    where workspace_id = new.workspace_id and email = new.email and status = 'prepared';
  return new;
end $$;
create trigger email_suppression_guard after insert on public.email_suppressions for each row execute function public.email_suppress_pending();

create function public.email_guard_connection() returns trigger language plpgsql security definer set search_path = '' as $$
declare budget integer;
begin
  select daily_budget into budget from public.email_gmail_accounts where account_key = new.account_key for update;
  if new.daily_budget > budget then raise exception 'Connection budget cannot exceed shared account budget'; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger email_connection_guard before insert or update on public.workspace_gmail_connections for each row execute function public.email_guard_connection();

create function public.email_prepare_queue(p_campaign_id uuid, p_contact_id uuid, p_draft_id uuid, p_scheduled_day date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.email_campaigns; r public.email_contacts; d public.email_drafts; result uuid;
begin
  select * into c from public.email_campaigns where id = p_campaign_id;
  if c.id is null then raise exception 'Campaign not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('email-workspace:' || c.workspace_id::text, 0));
  select * into c from public.email_campaigns where id = p_campaign_id;
  select * into r from public.email_contacts where id = p_contact_id and workspace_id = c.workspace_id and product_id = c.product_id;
  select * into d from public.email_drafts where id = p_draft_id and campaign_id = c.id and contact_id = r.id and workspace_id = c.workspace_id and product_id = c.product_id;
  if c.state <> 'approved' or r.id is null or r.status <> 'opted_in' or d.id is null or d.status <> 'approved'
    or p_scheduled_day is null or p_scheduled_day <> (now() at time zone c.timezone)::date
    or exists (select 1 from public.products where id = c.product_id and workspace_id = c.workspace_id and source_facts->>'archived' = 'true')
    or exists (select 1 from public.email_suppressions where workspace_id = c.workspace_id and email = r.email) then
    raise exception 'Approved campaign/draft, current local date and unsuppressed opt-in required';
  end if;
  insert into public.email_send_queue(workspace_id,product_id,campaign_id,contact_id,draft_id,email,scheduled_day)
    values(c.workspace_id,c.product_id,c.id,r.id,d.id,r.email,p_scheduled_day) on conflict do nothing returning id into result;
  if result is null then select id into result from public.email_send_queue where campaign_id = c.id and contact_id = r.id and scheduled_day = p_scheduled_day; end if;
  return result;
end $$;

-- One transaction reserves BOTH app-local-day and Gmail rolling-24h capacity, and
-- recipient cooldown across all apps. Failed/unknown reservations are deliberately not refunded.
create function public.email_claim_send(p_queue_id uuid) returns public.email_send_queue
language plpgsql security definer set search_path = '' as $$
declare q public.email_send_queue; c public.email_campaigns; r public.email_contacts; d public.email_drafts;
  conn public.workspace_gmail_connections; account public.email_gmail_accounts; local_now timestamp; budget integer;
begin
  select * into q from public.email_send_queue where id = p_queue_id;
  if q.id is null then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended('email-workspace:' || q.workspace_id::text, 0));
  select * into q from public.email_send_queue where id = p_queue_id for update;
  if q.status <> 'prepared' then return null; end if;
  select * into c from public.email_campaigns where id = q.campaign_id;
  select * into r from public.email_contacts where id = q.contact_id;
  select * into d from public.email_drafts where id = q.draft_id;
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
  if exists (select 1 from public.email_send_queue previous where previous.workspace_id = q.workspace_id and previous.email = q.email
      and (previous.status in ('claimed','unknown') or previous.claimed_at > now() - make_interval(days => c.recipient_cooldown_days))) then return null; end if;
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

create function public.email_finish_send(p_queue_id uuid, p_claim_token uuid, p_outcome text, p_provider_message_id text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare q public.email_send_queue;
begin
  if p_outcome is null or p_outcome not in ('sent','unknown','failed') then raise exception 'Explicit sent/unknown/failed outcome required'; end if;
  if p_outcome = 'sent' and nullif(btrim(p_provider_message_id),'') is null then raise exception 'Provider acceptance id required for sent'; end if;
  select * into q from public.email_send_queue where id = p_queue_id;
  if q.id is null then raise exception 'Queue not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('email-workspace:' || q.workspace_id::text, 0));
  select * into q from public.email_send_queue where id = p_queue_id for update;
  if p_claim_token is null or q.claim_token is distinct from p_claim_token then raise exception 'Invalid claim token'; end if;
  if q.status = p_outcome then return; end if;
  if q.status <> 'claimed' then raise exception 'Terminal outcomes cannot be retried or overwritten'; end if;
  update public.email_send_queue set status = p_outcome, provider_message_id = p_provider_message_id, finished_at = now(), updated_at = now() where id = q.id;
  if p_outcome = 'sent' then update public.email_contacts set last_contacted_at = now() where id = q.contact_id; end if;
end $$;

create function public.email_claim_daily_run(p_campaign_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare c public.email_campaigns; local_now timestamp; result uuid;
begin
  select * into c from public.email_campaigns where id = p_campaign_id;
  if c.id is null then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended('email-workspace:' || c.workspace_id::text, 0));
  select * into c from public.email_campaigns where id = p_campaign_id;
  local_now := now() at time zone c.timezone;
  if c.state <> 'approved' or not c.sending_enabled or local_now::time < make_time(c.send_hour,c.send_minute,0)
    or exists (select 1 from public.products where id = c.product_id and workspace_id = c.workspace_id and source_facts->>'archived' = 'true')
    or not exists (select 1 from public.workspace_gmail_connections conn join public.email_gmail_accounts account using(account_key)
      where conn.workspace_id = c.workspace_id and conn.configured and conn.sending_enabled and account.sending_enabled) then return null; end if;
  insert into public.email_cron_runs(workspace_id,product_id,campaign_id,scheduled_day)
    values(c.workspace_id,c.product_id,c.id,local_now::date) on conflict do nothing returning id into result;
  return result;
end $$;

create function public.email_unsubscribe(p_token_hash text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare token public.email_unsubscribe_tokens;
begin
  select * into token from public.email_unsubscribe_tokens where token_hash = p_token_hash and (expires_at is null or expires_at > now());
  if token.token_hash is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('email-workspace:' || token.workspace_id::text, 0));
  insert into public.email_suppressions(workspace_id,email) values(token.workspace_id,token.email) on conflict do nothing;
  update public.email_contacts set status = 'unsubscribed' where workspace_id = token.workspace_id and email = token.email and status <> 'unsubscribed';
  update public.email_send_queue set status = 'suppressed', updated_at = now() where workspace_id = token.workspace_id and email = token.email and status = 'prepared';
  return true;
end $$;
create function public.email_consume_oauth_state(p_state_hash text, p_user_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  update public.email_oauth_states set consumed_at = now() where state_hash = p_state_hash and created_by = p_user_id
    and consumed_at is null and expires_at > now() returning workspace_id into result;
  return result;
end $$;

create function public.email_pause_workspace(p_workspace_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('email-workspace:' || p_workspace_id::text, 0));
  update public.email_campaigns set state = 'paused', sending_enabled = false where workspace_id = p_workspace_id;
  update public.email_send_queue set status = 'suppressed', updated_at = now() where workspace_id = p_workspace_id and status = 'prepared';
end $$;

-- Members can read workspace email records; only admins mutate editable records.
-- Secret tables have NO client policies or privileges. Queue/quota/run writes go ONLY via RPC.
do $$
declare t text;
begin
  foreach t in array array['email_campaigns','email_contacts','email_drafts','email_send_queue','email_suppressions','email_cron_runs'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role',t);
    execute format('grant select on public.%I to authenticated, service_role',t);
    execute format('create policy email_member_read on public.%I for select to authenticated using (public.get_workspace_role(workspace_id) in (''owner'',''admin'',''member''))',t);
  end loop;
  foreach t in array array['email_campaigns','email_contacts','email_drafts'] loop
    execute format('grant insert, update on public.%I to authenticated',t);
    execute format('create policy email_admin_insert on public.%I for insert to authenticated with check (public.is_workspace_admin(workspace_id))',t);
    execute format('create policy email_admin_update on public.%I for update to authenticated using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id))',t);
  end loop;
  foreach t in array array['email_gmail_accounts','workspace_gmail_connections','email_oauth_states','email_unsubscribe_tokens','email_quota_reservations'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role',t);
    if t = 'email_quota_reservations' then execute format('grant select on public.%I to service_role',t);
    else execute format('grant select, insert, update, delete on public.%I to service_role',t);
    end if;
  end loop;
end $$;
grant insert on public.email_suppressions to authenticated;
create policy email_admin_suppress on public.email_suppressions for insert to authenticated with check (public.is_workspace_admin(workspace_id));
revoke all on function public.email_guard_mutation() from public, anon, authenticated, service_role;
revoke all on function public.email_suppress_pending() from public, anon, authenticated, service_role;
revoke all on function public.email_guard_connection() from public, anon, authenticated, service_role;
revoke all on function public.email_prepare_queue(uuid,uuid,uuid,date) from public, anon, authenticated;
revoke all on function public.email_claim_send(uuid) from public, anon, authenticated;
revoke all on function public.email_finish_send(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.email_claim_daily_run(uuid) from public, anon, authenticated;
revoke all on function public.email_unsubscribe(text) from public, anon, authenticated;
revoke all on function public.email_consume_oauth_state(text,uuid) from public, anon, authenticated;
revoke all on function public.email_pause_workspace(uuid) from public, anon, authenticated;
grant execute on function public.email_prepare_queue(uuid,uuid,uuid,date), public.email_claim_send(uuid),
  public.email_finish_send(uuid,uuid,text,text), public.email_claim_daily_run(uuid), public.email_unsubscribe(text),
  public.email_consume_oauth_state(text,uuid), public.email_pause_workspace(uuid) to service_role;
comment on table public.workspace_gmail_connections is 'Service-only AES-256-GCM ciphertext. Server-only root key; no credential RPC granted to authenticated.';
comment on table public.email_contacts is 'Candidates are research only; opt-in evidence is manually recorded by an authenticated admin, not provider verified.';
comment on table public.email_quota_reservations is 'Conservative rolling-24h account usage; includes uncertain/failed attempts. Do not auto-refund or delete.';
notify pgrst, 'reload schema';
commit;
