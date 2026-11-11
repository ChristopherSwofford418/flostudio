-- Reusable app-level DRAFT library only. No recipients, consent, approvals, sending or external calls.
-- This migration is deliberately separate from the existing delivery campaign/draft tables.
begin;

create table public.email_daily_campaign_settings (
  workspace_id uuid not null references public.workspaces(id),
  product_id uuid not null,
  enabled boolean not null default false,
  timezone text not null default 'America/New_York',
  start_hour integer not null default 7 check (start_hour between 0 and 23),
  settings_revision uuid not null default gen_random_uuid(),
  enabled_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (workspace_id, product_id),
  foreign key (workspace_id, product_id) references public.products(workspace_id, id),
  check ((enabled and enabled_by is not null) or (not enabled and enabled_by is null))
);
create table public.email_daily_campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null, product_id uuid not null,
  scheduled_day date not null,
  name text not null check (length(name) between 1 and 200 and btrim(name) <> '' and name !~ '[[:cntrl:]]'),
  subject text not null check (length(subject) between 1 and 180 and btrim(subject) <> '' and subject !~ '[[:cntrl:]]'),
  body text not null check (length(body) between 1 and 6000 and btrim(body) <> ''),
  app_store_url text not null,
  status text not null default 'draft' check (status = 'draft'),
  content_source text not null default 'listing_template' check (content_source = 'listing_template'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, product_id, scheduled_day),
  foreign key (workspace_id, product_id) references public.products(workspace_id, id)
);
create index email_daily_campaigns_recent_idx on public.email_daily_campaigns(workspace_id, product_id, created_at desc, id desc);

-- Ownership is not inferred from a workspace_members owner label.
create function public.email_daily_campaign_actor_role(p_workspace_id uuid, p_actor uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case when p_actor is null then null
    when exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.owner_user_id = p_actor) then 'owner'
    else (select m.role from public.workspace_members m where m.workspace_id = p_workspace_id and m.user_id = p_actor
      and m.role in ('admin','member') limit 1) end
$$;

-- Hold scope rows through commit so revocation/ownership changes cannot race a successful write.
create function public.email_daily_campaign_lock_actor(p_workspace_id uuid, p_actor uuid)
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.workspaces w where w.id = p_workspace_id for share;
  perform 1 from public.workspace_members m where m.workspace_id = p_workspace_id and m.user_id = p_actor for share;
  return public.email_daily_campaign_actor_role(p_workspace_id,p_actor);
end $$;

-- Return scalar listing facts only, never the complete product metadata object.
create function public.email_daily_campaign_listing_facts(p_facts jsonb)
returns jsonb language sql immutable security definer set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'appId',case when jsonb_typeof(p_facts->'appId') in ('string','number') then p_facts->'appId' end,
    'appStoreId',case when jsonb_typeof(p_facts->'appStoreId') in ('string','number') then p_facts->'appStoreId' end,
    'appleAppId',case when jsonb_typeof(p_facts->'appleAppId') in ('string','number') then p_facts->'appleAppId' end,
    'storeMetadata',jsonb_build_object(
      'trackId',case when jsonb_typeof(p_facts#>'{storeMetadata,trackId}') in ('string','number') then p_facts#>'{storeMetadata,trackId}' end,
      'trackUrl',case when jsonb_typeof(p_facts#>'{storeMetadata,trackUrl}') = 'string' then p_facts#>'{storeMetadata,trackUrl}' end,
      'description',case when jsonb_typeof(p_facts#>'{storeMetadata,description}') = 'string' then p_facts#>'{storeMetadata,description}' end),
    'appStoreListing',jsonb_build_object(
      'sourceUrl',case when jsonb_typeof(p_facts#>'{appStoreListing,sourceUrl}') = 'string' then p_facts#>'{appStoreListing,sourceUrl}' end,
      'description',case when jsonb_typeof(p_facts#>'{appStoreListing,description}') = 'string' then p_facts#>'{appStoreListing,description}' end)))
$$;

-- Official metadata may have tracking queries; persisted draft URLs must already be query/fragment-free.
create function public.email_daily_campaign_url_id(p_url text)
returns text language plpgsql immutable security definer set search_path = '' as $$
declare v_path text;
begin
  if p_url is null or length(p_url) > 2000 or p_url ~ '[[:space:][:cntrl:]]' then return null; end if;
  v_path := regexp_replace(p_url,'[?#].*$','');
  if v_path ~* '%(0[0-9a-f]|1[0-9a-f]|7f|2f|5c|3f|23|40)'
    or v_path ~ '%($|[^0-9A-Fa-f]|[0-9A-Fa-f]($|[^0-9A-Fa-f]))' then return null; end if;
  if v_path !~ '^https://apps\.apple\.com/([a-z]{2}/)?app/([A-Za-z0-9._~%+-]+/)?id[1-9][0-9]*/?$' then return null; end if;
  return substring(v_path from '/id([1-9][0-9]*)/?$');
end $$;

-- Numeric ID fields must all agree, including aliases. Require at least one existing official
-- listing URL; URL IDs can resolve identity only when numeric fields are absent. Conflicts fail closed.
create function public.email_daily_campaign_expected_app_id(p_facts jsonb, p_product_url text)
returns text language plpgsql immutable security definer set search_path = '' as $$
declare v_id text; v_expected text; v_url text; v_listing boolean := false; v_source integer := 0;
begin
  foreach v_id in array array[p_facts->>'appId',p_facts->>'appStoreId',p_facts->>'appleAppId',p_facts#>>'{storeMetadata,trackId}'] loop
    if v_id is null or v_id = '' then continue; end if;
    if v_id !~ '^[1-9][0-9]*$' or (v_expected is not null and v_expected <> v_id) then return null; end if;
    v_expected := v_id;
  end loop;
  foreach v_url in array array[p_product_url,p_facts#>>'{storeMetadata,trackUrl}',p_facts#>>'{appStoreListing,sourceUrl}'] loop
    v_source := v_source + 1;
    if v_url is null or v_url = '' then continue; end if;
    v_id := public.email_daily_campaign_url_id(v_url);
    if v_id is null then
      -- Only the product homepage can be ignored; corrupt explicit listing sources fail closed.
      if v_source > 1 or v_url ~* 'apps[.．]apple' then return null; end if;
      continue;
    end if;
    if v_expected is not null and v_expected <> v_id then return null; end if;
    v_expected := v_id; v_listing := true;
  end loop;
  if not v_listing then return null; end if;
  return v_expected;
end $$;

-- Plain text only. Every HTTP(S) token must equal the stored URL (sentence punctuation allowed).
-- Other schemes, protocol-relative/www/bare-domain links and HTML/Markdown link injection fail closed.
create function public.email_daily_campaign_content_valid(p_subject text, p_body text, p_url text)
returns boolean language plpgsql immutable security definer set search_path = '' as $$
declare v_match text[]; v_remaining text;
begin
  if p_subject is null or length(p_subject) not between 1 and 180 or btrim(p_subject) = ''
    or p_subject ~ '[[:cntrl:]]' or p_body is null or length(p_body) not between 1 and 6000
    or btrim(p_body) = '' or translate(p_body,E'\n\r\t','') ~ '[[:cntrl:]]'
    or p_url is null or public.email_daily_campaign_url_id(p_url) is null or p_url ~ '[?#]'
    or position(p_url in p_body) = 0 or p_body ~ '[<>]' or p_body ~ '\][[:space:]]*\(' then return false; end if;
  for v_match in select regexp_matches(p_body,'https?://[^[:space:]<>"''\[\]{}()]+','gi') loop
    if regexp_replace(v_match[1],'[.,;:!?]+$','') <> p_url then return false; end if;
  end loop;
  v_remaining := regexp_replace(p_body,'https?://[^[:space:]<>"''\[\]{}()]+','','gi');
  if v_remaining ~* '([a-z][a-z0-9+.-]*://|(mailto|javascript|data|tel|sms|file|ftp|https?):|//|www\.|[[:alnum:]-]+(\.[[:alnum:]-]+)*\.[a-z]{2,63}([/:?#]|\M))'
    then return false; end if;
  return true;
end $$;

create function public.email_daily_campaign_settings_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'EMAIL_DAILY_CAMPAIGN_HISTORY_IMMUTABLE'; end if;
  if tg_op = 'UPDATE' and (new.workspace_id <> old.workspace_id or new.product_id <> old.product_id
    or new.created_at <> old.created_at or new.settings_revision = old.settings_revision) then
    raise exception 'EMAIL_DAILY_CAMPAIGN_SETTINGS_INVALID';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone and name !~ '^(posix|right)/') then
    raise exception 'EMAIL_DAILY_CAMPAIGN_SETTINGS_INVALID';
  end if;
  if new.enabled and coalesce(public.email_daily_campaign_actor_role(new.workspace_id,new.enabled_by),'') not in ('owner','admin') then
    raise exception 'EMAIL_DAILY_CAMPAIGN_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger email_daily_campaign_settings_guard before insert or update or delete on public.email_daily_campaign_settings
  for each row execute function public.email_daily_campaign_settings_guard();

create function public.email_daily_campaign_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'EMAIL_DAILY_CAMPAIGN_HISTORY_IMMUTABLE'; end if;
  if tg_op = 'UPDATE' and (to_jsonb(new) - array['subject','body','updated_at'])
    is distinct from (to_jsonb(old) - array['subject','body','updated_at']) then
    raise exception 'EMAIL_DAILY_CAMPAIGN_HISTORY_IMMUTABLE';
  end if;
  if not public.email_daily_campaign_content_valid(new.subject,new.body,new.app_store_url) then
    raise exception 'EMAIL_DAILY_CAMPAIGN_CONTENT_INVALID';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger email_daily_campaign_guard before insert or update or delete on public.email_daily_campaigns
  for each row execute function public.email_daily_campaign_guard();

create function public.get_email_daily_campaign_status(p_workspace_id uuid, p_product_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_settings jsonb; v_campaigns jsonb; v_day date;
begin
  if auth.uid() is null or coalesce(public.email_daily_campaign_lock_actor(p_workspace_id,auth.uid()),'') not in ('owner','admin','member') then
    raise exception 'EMAIL_DAILY_CAMPAIGN_MEMBER_REQUIRED' using errcode = '42501';
  end if;
  perform 1 from public.products p where p.workspace_id = p_workspace_id and p.id = p_product_id for share;
  if not found then raise exception 'EMAIL_DAILY_CAMPAIGN_PRODUCT_NOT_FOUND'; end if;
  select to_jsonb(s) into v_settings from public.email_daily_campaign_settings s
    where s.workspace_id = p_workspace_id and s.product_id = p_product_id;
  v_settings := coalesce(v_settings,jsonb_build_object('workspace_id',p_workspace_id,'product_id',p_product_id,
    'enabled',false,'timezone','America/New_York','start_hour',7,'settings_revision',null,'enabled_by',null,'created_at',null,'updated_at',null));
  v_day := (now() at time zone (v_settings->>'timezone'))::date;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc,c.id desc),'[]'::jsonb) into v_campaigns from (
    select d.* from public.email_daily_campaigns d where d.workspace_id = p_workspace_id and d.product_id = p_product_id
      order by d.created_at desc,d.id desc limit 30) c;
  return jsonb_build_object('settings',v_settings,'campaigns',v_campaigns,'today',jsonb_build_object('scheduled_day',v_day,
    'created',exists (select 1 from public.email_daily_campaigns d
      where d.workspace_id = p_workspace_id and d.product_id = p_product_id and d.scheduled_day = v_day)));
end $$;

create function public.save_email_daily_campaign_settings(
  p_workspace_id uuid, p_product_id uuid, p_enabled boolean, p_timezone text, p_start_hour integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_settings public.email_daily_campaign_settings; v_facts jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('email-daily-campaign:' || p_workspace_id::text || ':' || p_product_id::text,0));
  if auth.uid() is null or coalesce(public.email_daily_campaign_lock_actor(p_workspace_id,auth.uid()),'') not in ('owner','admin') then
    raise exception 'EMAIL_DAILY_CAMPAIGN_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  select p.source_facts into v_facts from public.products p
    where p.workspace_id = p_workspace_id and p.id = p_product_id for share;
  if not found then raise exception 'EMAIL_DAILY_CAMPAIGN_PRODUCT_NOT_FOUND'; end if;
  if coalesce(v_facts->>'archived','false') <> 'false' then raise exception 'EMAIL_DAILY_CAMPAIGN_APP_UNAVAILABLE'; end if;
  if p_enabled is null or p_timezone is null
    or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone and name !~ '^(posix|right)/')
    or p_start_hour is null or p_start_hour not between 0 and 23 then
    raise exception 'EMAIL_DAILY_CAMPAIGN_SETTINGS_INVALID';
  end if;
  insert into public.email_daily_campaign_settings(workspace_id,product_id,enabled,timezone,start_hour,enabled_by)
    values(p_workspace_id,p_product_id,p_enabled,p_timezone,p_start_hour,case when p_enabled then auth.uid() end)
    on conflict (workspace_id,product_id) do update set enabled = excluded.enabled,timezone = excluded.timezone,
      start_hour = excluded.start_hour,enabled_by = excluded.enabled_by,settings_revision = gen_random_uuid(),updated_at = now()
    returning * into v_settings;
  return to_jsonb(v_settings);
end $$;

create function public.update_email_daily_campaign(
  p_workspace_id uuid, p_product_id uuid, p_campaign_id uuid, p_subject text, p_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_campaign public.email_daily_campaigns;
begin
  perform pg_advisory_xact_lock(hashtextextended('email-daily-campaign:' || p_workspace_id::text || ':' || p_product_id::text,0));
  if auth.uid() is null or coalesce(public.email_daily_campaign_lock_actor(p_workspace_id,auth.uid()),'') not in ('owner','admin') then
    raise exception 'EMAIL_DAILY_CAMPAIGN_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  select c.* into v_campaign from public.email_daily_campaigns c
    where c.workspace_id = p_workspace_id and c.product_id = p_product_id and c.id = p_campaign_id for update;
  if not found then raise exception 'EMAIL_DAILY_CAMPAIGN_RECORD_NOT_FOUND'; end if;
  if not public.email_daily_campaign_content_valid(p_subject,p_body,v_campaign.app_store_url) then
    raise exception 'EMAIL_DAILY_CAMPAIGN_CONTENT_INVALID';
  end if;
  update public.email_daily_campaigns set subject = p_subject,body = p_body,updated_at = now()
    where id = v_campaign.id returning * into v_campaign;
  return to_jsonb(v_campaign);
end $$;

-- A bounded read-only snapshot, NOT a claim, paid-work reservation or provider authorization.
create function public.email_due_daily_campaigns(p_limit integer default 25)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x.item order by x.workspace_id,x.product_id),'[]'::jsonb) from (
    select s.workspace_id,s.product_id,jsonb_build_object('workspace_id',s.workspace_id,'product_id',s.product_id,
      'scheduled_day',(now() at time zone s.timezone)::date,'settings_revision',s.settings_revision,
      'product',jsonb_build_object('id',p.id,'name',p.name,'product_url',p.product_url,
        'source_facts',public.email_daily_campaign_listing_facts(p.source_facts)),'language','en') as item
    from public.email_daily_campaign_settings s join public.products p on p.workspace_id = s.workspace_id and p.id = s.product_id
    where s.enabled and coalesce(p.source_facts->>'archived','false') = 'false'
      and coalesce(public.email_daily_campaign_actor_role(s.workspace_id,s.enabled_by),'') in ('owner','admin')
      and extract(hour from now() at time zone s.timezone) >= s.start_hour
      and not exists (select 1 from public.email_daily_campaigns c where c.workspace_id = s.workspace_id
        and c.product_id = s.product_id and c.scheduled_day = (now() at time zone s.timezone)::date)
    order by s.workspace_id,s.product_id limit greatest(0,least(coalesce(p_limit,25),100))) x
$$;

create function public.email_save_daily_campaign(
  p_workspace_id uuid, p_product_id uuid, p_scheduled_day date, p_settings_revision uuid,
  p_name text, p_subject text, p_body text, p_app_store_url text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_settings public.email_daily_campaign_settings; v_product record; v_expected text; v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('email-daily-campaign:' || p_workspace_id::text || ':' || p_product_id::text,0));
  select s.* into v_settings from public.email_daily_campaign_settings s
    where s.workspace_id = p_workspace_id and s.product_id = p_product_id for update;
  if not found or not v_settings.enabled or v_settings.settings_revision is distinct from p_settings_revision then
    return jsonb_build_object('created',false,'code','EMAIL_DAILY_CAMPAIGN_SETTINGS_STALE');
  end if;
  if coalesce(public.email_daily_campaign_lock_actor(p_workspace_id,v_settings.enabled_by),'') not in ('owner','admin') then
    return jsonb_build_object('created',false,'code','EMAIL_DAILY_CAMPAIGN_SETTINGS_STALE');
  end if;
  select p.source_facts,p.product_url into v_product from public.products p
    where p.workspace_id = p_workspace_id and p.id = p_product_id for share;
  if not found or coalesce(v_product.source_facts->>'archived','false') <> 'false' then
    return jsonb_build_object('created',false,'code','EMAIL_DAILY_CAMPAIGN_APP_UNAVAILABLE');
  end if;
  if p_scheduled_day is distinct from (now() at time zone v_settings.timezone)::date
    or extract(hour from now() at time zone v_settings.timezone) < v_settings.start_hour then
    return jsonb_build_object('created',false,'code','EMAIL_DAILY_CAMPAIGN_NOT_DUE');
  end if;
  v_expected := public.email_daily_campaign_expected_app_id(v_product.source_facts,v_product.product_url);
  if v_expected is null or public.email_daily_campaign_url_id(p_app_store_url) is distinct from v_expected or p_app_store_url ~ '[?#]' then
    return jsonb_build_object('created',false,'code','EMAIL_DAILY_CAMPAIGN_APP_STORE_INVALID');
  end if;
  if p_name is null or length(p_name) not between 1 and 200 or btrim(p_name) = '' or p_name ~ '[[:cntrl:]]'
    or not public.email_daily_campaign_content_valid(p_subject,p_body,p_app_store_url) then
    return jsonb_build_object('created',false,'code','EMAIL_DAILY_CAMPAIGN_CONTENT_INVALID');
  end if;
  insert into public.email_daily_campaigns(workspace_id,product_id,scheduled_day,name,subject,body,app_store_url)
    values(p_workspace_id,p_product_id,p_scheduled_day,p_name,p_subject,p_body,p_app_store_url)
    on conflict (workspace_id,product_id,scheduled_day) do nothing;
  get diagnostics v_count = row_count;
  return jsonb_build_object('created',v_count = 1,'code',case when v_count = 1
    then 'EMAIL_DAILY_CAMPAIGN_CREATED' else 'EMAIL_DAILY_CAMPAIGN_EXISTS' end);
end $$;

alter table public.email_daily_campaign_settings enable row level security;
alter table public.email_daily_campaigns enable row level security;
revoke all on table public.email_daily_campaign_settings, public.email_daily_campaigns from public, anon, authenticated, service_role;
revoke all on function public.email_daily_campaign_actor_role(uuid,uuid),public.email_daily_campaign_lock_actor(uuid,uuid),
  public.email_daily_campaign_listing_facts(jsonb),public.email_daily_campaign_url_id(text),
  public.email_daily_campaign_expected_app_id(jsonb,text),public.email_daily_campaign_content_valid(text,text,text),
  public.email_daily_campaign_settings_guard(),public.email_daily_campaign_guard() from public, anon, authenticated, service_role;
revoke all on function public.get_email_daily_campaign_status(uuid,uuid),
  public.save_email_daily_campaign_settings(uuid,uuid,boolean,text,integer),public.update_email_daily_campaign(uuid,uuid,uuid,text,text),
  public.email_due_daily_campaigns(integer),public.email_save_daily_campaign(uuid,uuid,date,uuid,text,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_email_daily_campaign_status(uuid,uuid),
  public.save_email_daily_campaign_settings(uuid,uuid,boolean,text,integer),public.update_email_daily_campaign(uuid,uuid,uuid,text,text) to authenticated;
grant execute on function public.email_due_daily_campaigns(integer),
  public.email_save_daily_campaign(uuid,uuid,date,uuid,text,text,text,text) to service_role;
comment on table public.email_daily_campaigns is 'Reusable listing-template drafts only. No recipients, approval or connection to delivery; history and human edits survive daily worker retries.';
comment on function public.email_due_daily_campaigns(integer) is 'Read-only bounded due-app snapshot; no claim, credentials, paid requests or external calls.';
notify pgrst, 'reload schema';
commit;
