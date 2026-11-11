-- Research only. No sending, opt-in inference, campaign/draft/queue writes or external calls.
-- Existing vault and email lifecycle functions/ACLs remain untouched.
begin;

create table public.email_research_settings (
  workspace_id uuid not null references public.workspaces(id),
  product_id uuid not null,
  enabled boolean not null default false,
  daily_target integer not null default 80 check (daily_target between 1 and 100),
  daily_request_limit integer not null default 8 check (daily_request_limit between 1 and 10),
  timezone text not null default 'America/New_York',
  start_hour integer not null default 6 check (start_hour between 0 and 23),
  query text not null default '' check (length(query) <= 500),
  settings_revision uuid not null default gen_random_uuid(),
  enabled_by uuid references auth.users(id), enabled_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (workspace_id, product_id),
  foreign key (workspace_id, product_id) references public.products(workspace_id, id),
  check ((enabled and enabled_by is not null and enabled_at is not null)
    or (not enabled and enabled_by is null and enabled_at is null))
);
create table public.email_research_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null, product_id uuid not null,
  settings_revision uuid not null, settings_snapshot jsonb not null check (jsonb_typeof(settings_snapshot) = 'object'),
  scheduled_day date not null,
  request_number integer not null check (request_number between 1 and 10),
  claim_order bigint generated always as identity unique,
  claim_token_hash text not null check (claim_token_hash ~ '^[0-9a-f]{64}$'),
  state text not null default 'claimed' check (state in ('claimed','completed','failed','expired')),
  batch_limit integer not null check (batch_limit between 1 and 10),
  claimed_at timestamptz not null default now(), expires_at timestamptz not null,
  credential_accessed_at timestamptz, finished_at timestamptz,
  verified_count integer not null default 0 check (verified_count between 0 and 10),
  inserted_count integer not null default 0 check (inserted_count between 0 and verified_count),
  skipped_count integer not null default 0 check (skipped_count between 0 and 10),
  error_code text check (error_code in ('EMAIL_RESEARCH_PROVIDER_FAILED','EMAIL_RESEARCH_PROVIDER_UNAVAILABLE',
    'EMAIL_RESEARCH_CREDENTIAL_UNAVAILABLE','EMAIL_RESEARCH_INVALID_RESPONSE',
    'EMAIL_RESEARCH_SETTINGS_STALE','EMAIL_RESEARCH_EXPIRED')),
  unique (workspace_id, product_id, scheduled_day, request_number),
  unique (workspace_id, product_id, settings_revision, scheduled_day, request_number),
  foreign key (workspace_id, product_id) references public.email_research_settings(workspace_id, product_id),
  foreign key (workspace_id, product_id) references public.products(workspace_id, id),
  check (expires_at = claimed_at + interval '15 minutes'),
  check (verified_count <= batch_limit and inserted_count + skipped_count <= batch_limit),
  check ((state = 'claimed' and finished_at is null and error_code is null
      and verified_count = 0 and inserted_count = 0 and skipped_count = 0)
    or (state = 'completed' and finished_at is not null and error_code is null)
    or (state in ('failed','expired') and finished_at is not null and error_code is not null
      and verified_count = 0 and inserted_count = 0))
);
create index email_research_app_day_idx on public.email_research_runs(workspace_id, product_id, scheduled_day);
create index email_research_workspace_time_idx on public.email_research_runs(workspace_id, claimed_at);
create index email_research_live_idx on public.email_research_runs(expires_at) where state = 'claimed';

-- Actor is the real enabling user, not service_role/auth.uid() during unattended execution.
create function public.email_research_admin(p_workspace_id uuid, p_actor uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_actor is not null and (
    exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.owner_user_id = p_actor)
    or exists (select 1 from public.workspace_members m where m.workspace_id = p_workspace_id
      and m.user_id = p_actor and m.role = 'admin'))
$$;

-- Lock owner, enabling membership and product until transaction end. Removed admins,
-- ownership changes and archival cannot race a successful credential access or finish.
-- Caller already holds the global and email-workspace advisory locks.
create function public.email_research_lock_scope(p_workspace_id uuid, p_product_id uuid, p_actor uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_facts jsonb;
begin
  perform 1 from public.workspaces w where w.id = p_workspace_id for share;
  perform 1 from public.workspace_members m where m.workspace_id = p_workspace_id and m.user_id = p_actor for share;
  select p.source_facts into v_facts from public.products p
    where p.workspace_id = p_workspace_id and p.id = p_product_id for share;
  return found and coalesce(v_facts->>'archived','false') = 'false'
    and public.email_research_admin(p_workspace_id,p_actor);
end $$;

create function public.email_research_settings_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'EMAIL_RESEARCH_HISTORY_IMMUTABLE'; end if;
  if tg_op = 'UPDATE' and (new.workspace_id <> old.workspace_id or new.product_id <> old.product_id
      or new.created_at <> old.created_at or new.settings_revision = old.settings_revision) then
    raise exception 'EMAIL_RESEARCH_SETTINGS_INVALID';
  end if;
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'EMAIL_RESEARCH_SETTINGS_INVALID';
  end if;
  if new.enabled and not public.email_research_admin(new.workspace_id,new.enabled_by) then
    raise exception 'EMAIL_RESEARCH_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger email_research_settings_guard before insert or update or delete on public.email_research_settings
  for each row execute function public.email_research_settings_guard();

create function public.email_research_run_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'EMAIL_RESEARCH_HISTORY_IMMUTABLE'; end if;
  if old.state <> 'claimed' or (to_jsonb(new) - array['state','credential_accessed_at','finished_at','verified_count','inserted_count','skipped_count','error_code'])
      is distinct from (to_jsonb(old) - array['state','credential_accessed_at','finished_at','verified_count','inserted_count','skipped_count','error_code'])
    or (old.credential_accessed_at is not null and new.credential_accessed_at is distinct from old.credential_accessed_at)
    or (new.state = 'claimed' and (new.credential_accessed_at is null or old.credential_accessed_at is not null)) then
    raise exception 'EMAIL_RESEARCH_HISTORY_IMMUTABLE';
  end if;
  return new;
end $$;
create trigger email_research_run_guard before update or delete on public.email_research_runs
  for each row execute function public.email_research_run_guard();

create function public.save_email_research_settings(
  p_workspace_id uuid, p_product_id uuid, p_enabled boolean, p_daily_target integer,
  p_daily_request_limit integer, p_timezone text, p_start_hour integer, p_query text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_settings public.email_research_settings;
begin
  if auth.uid() is null or not public.is_workspace_admin(p_workspace_id) then
    raise exception 'EMAIL_RESEARCH_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('email-research-global',0));
  perform pg_advisory_xact_lock(hashtextextended('email-workspace:' || p_workspace_id::text,0));
  perform 1 from public.workspaces w where w.id = p_workspace_id for share;
  perform 1 from public.workspace_members m where m.workspace_id = p_workspace_id and m.user_id = auth.uid() for share;
  if not public.email_research_admin(p_workspace_id,auth.uid()) then
    raise exception 'EMAIL_RESEARCH_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  perform 1 from public.products p where p.workspace_id = p_workspace_id and p.id = p_product_id for share;
  if not found then raise exception 'EMAIL_RESEARCH_PRODUCT_NOT_FOUND'; end if;
  if p_enabled is null or p_daily_target is null or p_daily_target not between 1 and 100
    or p_daily_request_limit is null or p_daily_request_limit not between 1 and 10
    or p_timezone is null or not exists (select 1 from pg_timezone_names where name = p_timezone)
    or p_start_hour is null or p_start_hour not between 0 and 23 or p_query is null or length(p_query) > 500 then
    raise exception 'EMAIL_RESEARCH_SETTINGS_INVALID';
  end if;
  if p_enabled and not public.email_research_lock_scope(p_workspace_id,p_product_id,auth.uid()) then
    raise exception 'EMAIL_RESEARCH_APP_UNAVAILABLE';
  end if;
  insert into public.email_research_settings(workspace_id,product_id,enabled,daily_target,daily_request_limit,timezone,start_hour,query,enabled_by,enabled_at)
    values(p_workspace_id,p_product_id,p_enabled,p_daily_target,p_daily_request_limit,p_timezone,p_start_hour,btrim(p_query),
      case when p_enabled then auth.uid() end,case when p_enabled then now() end)
    on conflict (workspace_id,product_id) do update set enabled = excluded.enabled,daily_target = excluded.daily_target,
      daily_request_limit = excluded.daily_request_limit,timezone = excluded.timezone,start_hour = excluded.start_hour,query = excluded.query,
      enabled_by = excluded.enabled_by,enabled_at = excluded.enabled_at,settings_revision = gen_random_uuid(),updated_at = now()
    returning * into v_settings;
  return to_jsonb(v_settings);
end $$;

create function public.email_claim_research_batch(p_workspace_limit integer default 200)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_settings public.email_research_settings; v_run public.email_research_runs;
  v_day date; v_requests integer; v_used integer; v_reserved integer; v_remaining integer;
  v_rolling_requests integer; v_rolling_inserted integer;
  v_token uuid; v_product jsonb;
begin
  if p_workspace_limit is null or p_workspace_limit not between 1 and 200 then
    raise exception 'EMAIL_RESEARCH_LIMIT_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('email-research-global',0));
  update public.email_research_runs set state = 'expired',finished_at = now(),error_code = 'EMAIL_RESEARCH_EXPIRED'
    where state = 'claimed' and expires_at <= now();
  -- Every run is a permanent paid-request reservation, regardless of outcome/revision.
  -- UTC-day + rolling-24h prevents timezone edits or midnight bursts bypassing the cap.
  for v_settings in
    select s.* from public.email_research_settings s join public.products p
      on p.workspace_id = s.workspace_id and p.id = s.product_id
    where s.enabled and coalesce(p.source_facts->>'archived','false') = 'false'
      and public.email_research_admin(s.workspace_id,s.enabled_by)
      and exists (select 1 from public.workspace_openai_provider_credentials c where c.workspace_id = s.workspace_id)
      and extract(hour from now() at time zone s.timezone) >= s.start_hour
      and (select count(*) from public.email_research_runs r where r.workspace_id = s.workspace_id
        and r.claimed_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC') < p_workspace_limit
      and (select count(*) from public.email_research_runs r where r.workspace_id = s.workspace_id
        and r.claimed_at > now() - interval '24 hours') < p_workspace_limit
    order by coalesce((select max(r.claim_order) from public.email_research_runs r
      where r.workspace_id = s.workspace_id and r.product_id = s.product_id),0),s.workspace_id,s.product_id
  loop
    perform pg_advisory_xact_lock(hashtextextended('email-workspace:' || v_settings.workspace_id::text,0));
    if not public.email_research_lock_scope(v_settings.workspace_id,v_settings.product_id,v_settings.enabled_by) then continue; end if;
    select s.* into v_settings from public.email_research_settings s
      where s.workspace_id = v_settings.workspace_id and s.product_id = v_settings.product_id for update;
    if not v_settings.enabled then continue; end if;
    v_day := (now() at time zone v_settings.timezone)::date;
    select count(*)::integer,coalesce(sum(r.inserted_count),0)::integer,
      coalesce(sum(case when r.state = 'claimed' and r.expires_at > now()
        and r.settings_revision = v_settings.settings_revision then r.batch_limit else 0 end),0)::integer
      into v_requests,v_used,v_reserved from public.email_research_runs r
      where r.workspace_id = v_settings.workspace_id and r.product_id = v_settings.product_id and r.scheduled_day = v_day;
    select count(*)::integer,coalesce(sum(r.inserted_count),0)::integer
      into v_rolling_requests,v_rolling_inserted from public.email_research_runs r
      where r.workspace_id = v_settings.workspace_id and r.product_id = v_settings.product_id
        and r.claimed_at > now() - interval '24 hours';
    select coalesce(sum(r.batch_limit),0)::integer into v_reserved from public.email_research_runs r
      where r.workspace_id = v_settings.workspace_id and r.product_id = v_settings.product_id
        and r.state = 'claimed' and r.expires_at > now() and r.settings_revision = v_settings.settings_revision;
    v_remaining := greatest(0,v_settings.daily_target - greatest(v_used,v_rolling_inserted) - v_reserved);
    if greatest(v_requests,v_rolling_requests) >= v_settings.daily_request_limit or v_remaining = 0 then continue; end if;
    select jsonb_build_object('id',p.id,'name',p.name,'description',p.description,'audience',p.audience) into v_product
      from public.products p where p.workspace_id = v_settings.workspace_id and p.id = v_settings.product_id;
    v_token := gen_random_uuid();
    insert into public.email_research_runs(workspace_id,product_id,settings_revision,settings_snapshot,scheduled_day,request_number,
      claim_token_hash,batch_limit,claimed_at,expires_at)
      values(v_settings.workspace_id,v_settings.product_id,v_settings.settings_revision,to_jsonb(v_settings),v_day,v_requests + 1,
        encode(sha256(convert_to(v_token::text,'UTF8')),'hex'),least(10,v_remaining),now(),now() + interval '15 minutes')
      returning * into v_run;
    return jsonb_build_object('allowed',true,'run_id',v_run.id,'claim_token',v_token,'workspace_id',v_run.workspace_id,'product_id',v_run.product_id,
      'target_remaining',v_remaining,'batch_limit',v_run.batch_limit,'query',v_settings.query,'timezone',v_settings.timezone,
      'scheduled_day',v_day,'request_number',v_run.request_number,'product',v_product);
  end loop;
  return null;
end $$;

-- Only this RPC touches the existing vault. No workspace parameter or client ACL.
create function public.get_email_research_credential(p_run_id uuid, p_claim_token uuid)
returns table (encrypted_api_key jsonb) language plpgsql security definer set search_path = '' as $$
declare v_run public.email_research_runs; v_settings public.email_research_settings; v_envelope jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('email-research-global',0));
  select r.* into v_run from public.email_research_runs r where r.id = p_run_id;
  if v_run.id is null or p_claim_token is null
    or v_run.claim_token_hash is distinct from encode(sha256(convert_to(p_claim_token::text,'UTF8')),'hex')
    or v_run.state <> 'claimed' or v_run.expires_at <= now() or v_run.credential_accessed_at is not null then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('email-workspace:' || v_run.workspace_id::text,0));
  select s.* into v_settings from public.email_research_settings s
    where s.workspace_id = v_run.workspace_id and s.product_id = v_run.product_id for update;
  if not v_settings.enabled or v_settings.settings_revision is distinct from v_run.settings_revision
    or not public.email_research_lock_scope(v_run.workspace_id,v_run.product_id,v_settings.enabled_by) then return; end if;
  select c.encrypted_api_key into v_envelope from public.workspace_openai_provider_credentials c
    where c.workspace_id = v_run.workspace_id for share;
  if v_envelope is null then return; end if;
  update public.email_research_runs set credential_accessed_at = now() where id = v_run.id;
  return query select v_envelope;
end $$;

-- Structural evidence gate, NOT consent/deliverability or independent website verification.
-- Return an allowlisted canonical object only; never retain arbitrary provider JSON.
create function public.email_research_candidate(p_candidate jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare v_email text; v_domain text; v_role text; v_url text; v_host text; v_org text;
  v_email_excerpt text; v_business_excerpt text; v_evidence jsonb;
begin
  if jsonb_typeof(p_candidate) is distinct from 'object' then return null; end if;
  v_evidence := p_candidate->'source_evidence';
  if jsonb_typeof(v_evidence) is distinct from 'object' or v_evidence->>'kind' is distinct from 'public_business_role_email'
    or jsonb_typeof(p_candidate->'email') is distinct from 'string'
    or jsonb_typeof(p_candidate->'organization') is distinct from 'string'
    or jsonb_typeof(p_candidate->'source_url') is distinct from 'string'
    or jsonb_typeof(v_evidence->'business_domain') is distinct from 'string'
    or jsonb_typeof(v_evidence->'role') is distinct from 'string'
    or jsonb_typeof(v_evidence->'email_excerpt') is distinct from 'string'
    or jsonb_typeof(v_evidence->'business_excerpt') is distinct from 'string' then return null; end if;
  v_email := lower(btrim(p_candidate->>'email')); v_org := btrim(p_candidate->>'organization');
  v_url := btrim(p_candidate->>'source_url'); v_domain := lower(btrim(v_evidence->>'business_domain'));
  v_role := lower(btrim(v_evidence->>'role')); v_email_excerpt := btrim(v_evidence->>'email_excerpt');
  v_business_excerpt := btrim(v_evidence->>'business_excerpt');
  if length(v_email) > 254 or length(v_org) not between 1 and 200
    or length(v_url) > 2000 or length(v_domain) > 253
    or length(v_email_excerpt) not between 10 and 1000 or length(v_business_excerpt) not between 10 and 1000
    or v_email !~ '^[a-z]+@[a-z0-9][a-z0-9.-]*\.[a-z]{2,63}$'
    or v_domain !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,63}$'
    or v_domain ~ '\.(local|internal|localhost|invalid|test|example|onion)$'
    or v_domain in ('example.com','example.org','example.net')
    or v_domain = any(array['gmail.com','googlemail.com','yahoo.com','ymail.com','outlook.com','hotmail.com','live.com',
      'msn.com','aol.com','icloud.com','me.com','mac.com','proton.me','protonmail.com','pm.me','mail.com','gmx.com','gmx.net','yandex.com','yandex.ru'])
    or v_role <> all(array['info','hello','contact','sales','support','office','admin','team','enquiries','inquiries','bookings','booking',
      'service','services','business','partnerships','marketing','press','media','events','reservations'])
    or v_email <> v_role || '@' || v_domain
    or position(v_email in lower(v_email_excerpt)) = 0 or v_url !~ '^https://'
    or v_url ~ '[[:space:][:cntrl:]]' then return null; end if;
  v_host := lower(substring(v_url from '^https://([^/?#]+)'));
  if v_host is null or v_host !~ '^[a-z0-9][a-z0-9.-]*\.[a-z]{2,63}(:443)?$'
    or regexp_replace(regexp_replace(v_host,':443$',''),'^www\.','') <> v_domain then return null; end if;
  return jsonb_build_object('email',v_email,'organization',v_org,'source_url',v_url,'source_evidence',jsonb_build_object(
    'kind','public_business_role_email','business_domain',v_domain,'role',v_role,
    'email_excerpt',v_email_excerpt,'business_excerpt',v_business_excerpt));
end $$;

create function public.email_finish_research_batch(p_run_id uuid, p_claim_token uuid,
  p_candidates jsonb default '[]'::jsonb, p_error_code text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_run public.email_research_runs; v_settings public.email_research_settings;
  v_code text; v_candidate jsonb; v_raw jsonb; v_seen text[] := array[]::text[];
  v_verified integer := 0; v_inserted integer := 0; v_skipped integer := 0; v_actual integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('email-research-global',0));
  select r.* into v_run from public.email_research_runs r where r.id = p_run_id;
  if v_run.id is null or p_claim_token is null
    or v_run.claim_token_hash is distinct from encode(sha256(convert_to(p_claim_token::text,'UTF8')),'hex')
    or v_run.state <> 'claimed' then
    return jsonb_build_object('allowed',false,'completed',false,'code','EMAIL_RESEARCH_CLAIM_INVALID',
      'verified_count',0,'inserted_count',0,'skipped_count',0);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('email-workspace:' || v_run.workspace_id::text,0));
  select s.* into v_settings from public.email_research_settings s
    where s.workspace_id = v_run.workspace_id and s.product_id = v_run.product_id for update;
  if v_run.expires_at <= now() then v_code := 'EMAIL_RESEARCH_EXPIRED';
  elsif not v_settings.enabled or v_settings.settings_revision is distinct from v_run.settings_revision
    or not public.email_research_lock_scope(v_run.workspace_id,v_run.product_id,v_settings.enabled_by) then
    v_code := 'EMAIL_RESEARCH_SETTINGS_STALE';
  elsif p_error_code is not null then
    v_code := case when p_error_code in ('EMAIL_RESEARCH_PROVIDER_FAILED','EMAIL_RESEARCH_PROVIDER_UNAVAILABLE',
      'EMAIL_RESEARCH_CREDENTIAL_UNAVAILABLE','EMAIL_RESEARCH_INVALID_RESPONSE') then p_error_code else 'EMAIL_RESEARCH_PROVIDER_FAILED' end;
  elsif jsonb_typeof(p_candidates) is distinct from 'array' then v_code := 'EMAIL_RESEARCH_INVALID_RESPONSE';
  elsif jsonb_array_length(p_candidates) > v_run.batch_limit or octet_length(p_candidates::text) > 65536 then
    v_code := 'EMAIL_RESEARCH_INVALID_RESPONSE';
  end if;
  if v_code is null then
    for v_raw in select value from jsonb_array_elements(p_candidates)
    loop
      v_candidate := public.email_research_candidate(v_raw);
      if v_candidate is null or (v_candidate->>'email') = any(v_seen) then continue; end if;
      v_seen := array_append(v_seen,v_candidate->>'email'); v_verified := v_verified + 1;
      if exists (select 1 from public.email_suppressions s where s.workspace_id = v_run.workspace_id and s.email = v_candidate->>'email')
        or exists (select 1 from public.email_send_queue q where q.workspace_id = v_run.workspace_id and q.email = v_candidate->>'email'
          and (q.claimed_at is not null or q.claim_token is not null or q.status in ('claimed','sent','unknown','failed')
            or exists (select 1 from public.email_quota_reservations quota where quota.queue_id = q.id))) then continue; end if;
      insert into public.email_contacts(workspace_id,product_id,email,organization,status,consent_evidence,
        consent_recorded_by,consent_recorded_at,source_url,source_evidence)
        values(v_run.workspace_id,v_run.product_id,v_candidate->>'email',v_candidate->>'organization','candidate','{}'::jsonb,
          null,null,v_candidate->>'source_url',(v_candidate->'source_evidence') || jsonb_build_object(
            'research_run_id',v_run.id,'researched_at',now(),'scheduled_day',v_run.scheduled_day,'settings_revision',v_run.settings_revision))
        on conflict (workspace_id,product_id,email) do nothing;
      get diagnostics v_actual = row_count;
      v_inserted := v_inserted + v_actual;
    end loop;
    v_skipped := jsonb_array_length(p_candidates) - v_inserted;
  end if;
  update public.email_research_runs set state = case when v_code = 'EMAIL_RESEARCH_EXPIRED' then 'expired'
    when v_code is not null then 'failed' else 'completed' end,finished_at = now(),error_code = v_code,
    verified_count = v_verified,inserted_count = v_inserted,skipped_count = v_skipped where id = v_run.id;
  return jsonb_build_object('allowed',v_code is null,'completed',v_code is null,'code',coalesce(v_code,'EMAIL_RESEARCH_COMPLETED'),
    'verified_count',v_verified,'inserted_count',v_inserted,'skipped_count',v_skipped);
end $$;

create function public.get_email_research_status(p_workspace_id uuid, p_product_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_settings jsonb; v_runs jsonb; v_day date; v_requests integer; v_verified integer;
  v_inserted integer; v_skipped integer; v_reserved integer; v_workspace integer; v_rolling integer; v_failed integer;
  v_app_rolling integer; v_inserted_rolling integer;
begin
  if auth.uid() is null or coalesce(public.get_workspace_role(p_workspace_id),'') not in ('owner','admin','member') then
    raise exception 'EMAIL_RESEARCH_MEMBER_REQUIRED' using errcode = '42501';
  end if;
  perform 1 from public.workspaces w where w.id = p_workspace_id for share;
  perform 1 from public.workspace_members m where m.workspace_id = p_workspace_id and m.user_id = auth.uid() for share;
  if coalesce(public.get_workspace_role(p_workspace_id),'') not in ('owner','admin','member') then
    raise exception 'EMAIL_RESEARCH_MEMBER_REQUIRED' using errcode = '42501';
  end if;
  perform 1 from public.products p where p.workspace_id = p_workspace_id and p.id = p_product_id for share;
  if not found then raise exception 'EMAIL_RESEARCH_PRODUCT_NOT_FOUND'; end if;
  select to_jsonb(s) into v_settings from public.email_research_settings s
    where s.workspace_id = p_workspace_id and s.product_id = p_product_id;
  v_settings := coalesce(v_settings,jsonb_build_object('workspace_id',p_workspace_id,'product_id',p_product_id,
    'enabled',false,'daily_target',80,'daily_request_limit',8,'timezone','America/New_York','start_hour',6,'query','',
    'settings_revision',null,'enabled_by',null,'enabled_at',null,'created_at',null,'updated_at',null));
  v_day := (now() at time zone (v_settings->>'timezone'))::date;
  select count(*)::integer,coalesce(sum(r.verified_count),0)::integer,coalesce(sum(r.inserted_count),0)::integer,
    coalesce(sum(r.skipped_count),0)::integer,coalesce(sum(case when r.state = 'claimed' and r.expires_at > now()
      and r.settings_revision::text = v_settings->>'settings_revision' then r.batch_limit else 0 end),0)::integer
    into v_requests,v_verified,v_inserted,v_skipped,v_reserved from public.email_research_runs r
    where r.workspace_id = p_workspace_id and r.product_id = p_product_id and r.scheduled_day = v_day;
  select count(*)::integer into v_failed from public.email_research_runs r
    where r.workspace_id = p_workspace_id and r.product_id = p_product_id and r.scheduled_day = v_day
      and r.state in ('failed','expired');
  select count(*)::integer,coalesce(sum(r.inserted_count),0)::integer into v_app_rolling,v_inserted_rolling
    from public.email_research_runs r where r.workspace_id = p_workspace_id and r.product_id = p_product_id
      and r.claimed_at > now() - interval '24 hours';
  select coalesce(sum(r.batch_limit),0)::integer into v_reserved from public.email_research_runs r
    where r.workspace_id = p_workspace_id and r.product_id = p_product_id and r.state = 'claimed'
      and r.expires_at > now() and r.settings_revision::text = v_settings->>'settings_revision';
  select count(*)::integer into v_workspace from public.email_research_runs r where r.workspace_id = p_workspace_id
    and r.claimed_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
  select count(*)::integer into v_rolling from public.email_research_runs r where r.workspace_id = p_workspace_id
    and r.claimed_at > now() - interval '24 hours';
  select coalesce(jsonb_agg(x.row order by x.claim_order desc),'[]'::jsonb) into v_runs from (
    select r.claim_order,jsonb_build_object('id',r.id,'workspace_id',r.workspace_id,'product_id',r.product_id,
      'settings_revision',r.settings_revision,'scheduled_day',r.scheduled_day,'request_number',r.request_number,
      'state',case when r.state = 'claimed' and r.expires_at <= now() then 'expired' else r.state end,
      'batch_limit',r.batch_limit,'claimed_at',r.claimed_at,'expires_at',r.expires_at,'finished_at',r.finished_at,
      'verified_count',r.verified_count,'inserted_count',r.inserted_count,'skipped_count',r.skipped_count,
      'error_code',case when r.state = 'claimed' and r.expires_at <= now() then 'EMAIL_RESEARCH_EXPIRED' else r.error_code end) as row
      from public.email_research_runs r where r.workspace_id = p_workspace_id and r.product_id = p_product_id
      order by r.claim_order desc limit 20) x;
  return jsonb_build_object('settings',v_settings,'recentRuns',v_runs,'today',jsonb_build_object('scheduled_day',v_day,
    'requests',v_requests,'verified',v_verified,'inserted',v_inserted,'skipped',v_skipped,'reserved',v_reserved,
    'failed',v_failed,'errors',v_failed,'remainingTarget',greatest(0,(v_settings->>'daily_target')::integer - greatest(v_inserted,v_inserted_rolling) - v_reserved),
    'remainingRequests',greatest(0,(v_settings->>'daily_request_limit')::integer - greatest(v_requests,v_app_rolling)),
    'workspace_requests',v_workspace,'workspace_requests_remaining',greatest(0,200 - greatest(v_workspace,v_rolling))));
end $$;

-- New tables are entirely RPC-mediated. Even service_role cannot read claim hashes or
-- mutate/delete reservations directly. Existing email_contacts admin privileges remain.
alter table public.email_research_settings enable row level security;
alter table public.email_research_runs enable row level security;
revoke all on table public.email_research_settings, public.email_research_runs from public, anon, authenticated, service_role;
revoke all on sequence public.email_research_runs_claim_order_seq from public, anon, authenticated, service_role;
revoke all on function public.email_research_admin(uuid,uuid),public.email_research_lock_scope(uuid,uuid,uuid),
  public.email_research_settings_guard(),public.email_research_run_guard(),public.email_research_candidate(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.save_email_research_settings(uuid,uuid,boolean,integer,integer,text,integer,text),
  public.get_email_research_status(uuid,uuid),public.email_claim_research_batch(integer),
  public.get_email_research_credential(uuid,uuid),public.email_finish_research_batch(uuid,uuid,jsonb,text)
  from public, anon, authenticated, service_role;
grant execute on function public.save_email_research_settings(uuid,uuid,boolean,integer,integer,text,integer,text),
  public.get_email_research_status(uuid,uuid) to authenticated;
grant execute on function public.email_claim_research_batch(integer),public.get_email_research_credential(uuid,uuid),
  public.email_finish_research_batch(uuid,uuid,jsonb,text) to service_role;
comment on table public.email_research_settings is 'Explicit human-admin research enablement only; no sending/consent inference. RPC writes only.';
comment on table public.email_research_runs is 'Immutable paid-request reservations. Terminal/zero/expired outcomes never refund or retry a paid call.';
comment on function public.get_email_research_credential(uuid,uuid) is 'Service-only one-shot existing encrypted OpenAI envelope, scoped by a live authorized claim; never browser code.';
notify pgrst, 'reload schema';
commit;
