-- Application-native review drafts only. No publishing, account connections or external calls.
-- Depends on 20261111_email_daily_campaigns.sql for its audited listing/content validators.
begin;

create table public.facebook_daily_settings (
  workspace_id uuid not null references public.workspaces(id),
  product_id uuid not null,
  enabled boolean not null default false,
  timezone text not null default 'America/New_York' check (timezone = 'America/New_York'),
  start_hour integer not null default 3 check (start_hour between 0 and 23),
  settings_revision uuid not null default gen_random_uuid(),
  enabled_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (workspace_id, product_id),
  foreign key (workspace_id, product_id) references public.products(workspace_id, id),
  check ((enabled and enabled_by is not null) or (not enabled and enabled_by is null))
);
create table public.facebook_draft_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null, product_id uuid not null,
  apple_app_id numeric not null check (apple_app_id > 0 and apple_app_id = trunc(apple_app_id)),
  file_path text not null,
  source_url text default null check (source_url is null or source_url ~ '^https://files[.]manuscdn[.]com/user_upload_by_module/session_file/310519663911058939/[A-Za-z0-9_-]+[.]png$'),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  sort_order integer not null default 0,
  title text not null default '' check (length(title) <= 200),
  caption text not null default '' check (length(caption) <= 2000),
  hashtags text not null default '' check (length(hashtags) <= 500),
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), active boolean not null default true,
  unique (workspace_id, product_id, id),
  unique (workspace_id, product_id, sha256),
  foreign key (workspace_id, product_id) references public.products(workspace_id, id)
);
create index facebook_draft_assets_rotation_idx on public.facebook_draft_assets(workspace_id, product_id, sort_order, id) where active;
create table public.facebook_daily_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null, product_id uuid not null,
  scheduled_day date not null,
  body text not null check (length(body) between 1 and 4000 and btrim(body) <> ''),
  hashtags text not null default '' check (length(hashtags) <= 500),
  app_store_url text not null,
  status text not null default 'draft' check (status = 'draft'),
  asset_id uuid, image_path text,
  source text not null default 'approved_asset_template' check (source = 'approved_asset_template'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, product_id, scheduled_day),
  foreign key (workspace_id, product_id) references public.products(workspace_id, id),
  foreign key (workspace_id, product_id, asset_id) references public.facebook_draft_assets(workspace_id, product_id, id),
  check ((asset_id is null) = (image_path is null))
);
create index facebook_daily_drafts_calendar_idx on public.facebook_daily_drafts(workspace_id, scheduled_day, product_id);

-- Never infer ownership from a forged membership role='owner'.
create function public.facebook_daily_actor_role(p_workspace_id uuid, p_actor uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case when p_actor is null then null
    when exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.owner_user_id = p_actor) then 'owner'
    else (select m.role from public.workspace_members m where m.workspace_id = p_workspace_id and m.user_id = p_actor
      and m.role in ('admin','member') limit 1) end
$$;
create function public.facebook_daily_lock_actor(p_workspace_id uuid, p_actor uuid)
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.workspaces w where w.id = p_workspace_id for share;
  perform 1 from public.workspace_members m where m.workspace_id = p_workspace_id and m.user_id = p_actor for share;
  return public.facebook_daily_actor_role(p_workspace_id,p_actor);
end $$;

-- Only literal normalized scope/hash paths or public Supabase marketing-assets URLs.
-- No query, fragment, userinfo, port, escape, traversal, signed URL or other bucket is accepted.
create function public.facebook_daily_asset_path_valid(p_workspace_id uuid, p_product_id uuid, p_path text, p_sha256 text)
returns boolean language sql immutable security definer set search_path = '' as $$
  select coalesce(p_sha256 ~ '^[0-9a-f]{64}$' and p_path is not null and (
    p_path = '/facebook-assets/' || p_workspace_id::text || '/' || p_product_id::text || '/' || p_sha256 || '.png'
    or p_path ~ ('^https://[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.supabase\.co/storage/v1/object/public/marketing-assets/facebook-assets/'
      || p_workspace_id::text || '/' || p_product_id::text || '/' || p_sha256 || '\.png$')),false)
$$;
create function public.facebook_daily_app_store_url(p_facts jsonb, p_product_url text)
returns text language sql immutable security definer set search_path = '' as $$
  select 'https://apps.apple.com/app/id' || public.email_daily_campaign_expected_app_id(p_facts,p_product_url)
$$;
create function public.facebook_daily_page_url(p_url text)
returns text language sql immutable security definer set search_path = '' as $$
  select case when length(p_url) <= 2000 and p_url ~ '^https://(www\.)?facebook\.com/[A-Za-z0-9._~/-]+$'
    and p_url !~ '(^|/)\.{1,2}(/|$)' then p_url end
$$;
create function public.facebook_daily_content_valid(p_body text, p_hashtags text, p_url text)
returns boolean language sql immutable security definer set search_path = '' as $$
  select coalesce(length(p_body) between 1 and 4000 and length(p_hashtags) <= 500
    and public.email_daily_campaign_content_valid('Facebook draft',p_body,p_url)
    and public.email_daily_campaign_content_valid('Facebook draft',p_body || E'\n' || p_hashtags,p_url),false)
$$;

-- Stable epoch-day rotation; active images must still belong to this listing identity.
create function public.facebook_daily_rotating_asset(p_workspace_id uuid, p_product_id uuid, p_day date, p_apple_app_id numeric)
returns public.facebook_draft_assets language sql stable security definer set search_path = '' as $$
  select a from public.facebook_draft_assets a
  where a.workspace_id = p_workspace_id and a.product_id = p_product_id and a.active and a.apple_app_id = p_apple_app_id
  order by a.sort_order,a.id limit 1 offset (
    select case when count(*) = 0 then 0 else mod(mod((p_day - date '1970-01-01')::bigint,count(*)) + count(*),count(*)) end
    from public.facebook_draft_assets b where b.workspace_id = p_workspace_id and b.product_id = p_product_id
      and b.active and b.apple_app_id = p_apple_app_id)
$$;

create function public.facebook_daily_settings_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'FACEBOOK_DAILY_HISTORY_IMMUTABLE'; end if;
  if tg_op = 'UPDATE' and (new.workspace_id <> old.workspace_id or new.product_id <> old.product_id
    or new.created_at <> old.created_at or new.settings_revision = old.settings_revision) then
    raise exception 'FACEBOOK_DAILY_SETTINGS_INVALID';
  end if;
  if new.enabled and coalesce(public.facebook_daily_actor_role(new.workspace_id,new.enabled_by),'') not in ('owner','admin') then
    raise exception 'FACEBOOK_DAILY_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  new.updated_at := now(); return new;
end $$;
create trigger facebook_daily_settings_guard before insert or update or delete on public.facebook_daily_settings
  for each row execute function public.facebook_daily_settings_guard();
create function public.facebook_daily_asset_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_product record; v_expected text;
begin
  if tg_op = 'DELETE' then raise exception 'FACEBOOK_DAILY_HISTORY_IMMUTABLE'; end if;
  if tg_op = 'UPDATE' and (to_jsonb(new) - array['sort_order','title','caption','hashtags','active'])
    is distinct from (to_jsonb(old) - array['sort_order','title','caption','hashtags','active']) then
    raise exception 'FACEBOOK_DAILY_HISTORY_IMMUTABLE';
  end if;
  -- Privileged owner imports may insert directly without a JWT; never bypass scope/identity.
  if tg_op = 'INSERT' then
    if coalesce(public.facebook_daily_lock_actor(new.workspace_id,new.uploaded_by),'') not in ('owner','admin') then
      raise exception 'FACEBOOK_DAILY_ADMIN_REQUIRED' using errcode = '42501';
    end if;
    select p.source_facts,p.product_url into v_product from public.products p
      where p.workspace_id = new.workspace_id and p.id = new.product_id for share;
    if not found then raise exception 'FACEBOOK_DAILY_PRODUCT_NOT_FOUND'; end if;
    if coalesce(v_product.source_facts->>'archived','false') <> 'false' then raise exception 'FACEBOOK_DAILY_APP_UNAVAILABLE'; end if;
    v_expected := public.email_daily_campaign_expected_app_id(v_product.source_facts,v_product.product_url);
    if v_expected is null or new.apple_app_id is distinct from v_expected::numeric then
      raise exception 'FACEBOOK_DAILY_APP_STORE_INVALID';
    end if;
  end if;
  if not public.facebook_daily_asset_path_valid(new.workspace_id,new.product_id,new.file_path,new.sha256) then
    raise exception 'FACEBOOK_DAILY_ASSET_INVALID';
  end if;
  if translate(new.title || new.caption || new.hashtags,E'\n\r\t','') ~ '[[:cntrl:]]' then
    raise exception 'FACEBOOK_DAILY_ASSET_INVALID';
  end if;
  return new;
end $$;
create trigger facebook_daily_asset_guard before insert or update or delete on public.facebook_draft_assets
  for each row execute function public.facebook_daily_asset_guard();
create function public.facebook_daily_draft_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'FACEBOOK_DAILY_HISTORY_IMMUTABLE'; end if;
  if tg_op = 'UPDATE' and (to_jsonb(new) - array['body','hashtags','updated_at'])
    is distinct from (to_jsonb(old) - array['body','hashtags','updated_at']) then
    raise exception 'FACEBOOK_DAILY_HISTORY_IMMUTABLE';
  end if;
  if not public.facebook_daily_content_valid(new.body,new.hashtags,new.app_store_url) then
    raise exception 'FACEBOOK_DAILY_CONTENT_INVALID';
  end if;
  if tg_op = 'INSERT' and new.asset_id is not null and not exists (
    select 1 from public.facebook_draft_assets a where a.workspace_id = new.workspace_id and a.product_id = new.product_id
      and a.id = new.asset_id and a.file_path = new.image_path) then
    raise exception 'FACEBOOK_DAILY_IMAGE_INVALID';
  end if;
  new.updated_at := now(); return new;
end $$;
create trigger facebook_daily_draft_guard before insert or update or delete on public.facebook_daily_drafts
  for each row execute function public.facebook_daily_draft_guard();

create function public.get_facebook_daily_workspace_status(p_workspace_id uuid, p_scheduled_day date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_today date := (now() at time zone 'America/New_York')::date; v_day date; v_count integer; v_apps jsonb;
begin
  if auth.uid() is null or coalesce(public.facebook_daily_lock_actor(p_workspace_id,auth.uid()),'') not in ('owner','admin','member') then
    raise exception 'FACEBOOK_DAILY_MEMBER_REQUIRED' using errcode = '42501';
  end if;
  perform 1 from public.products p where p.workspace_id = p_workspace_id for share;
  select count(*) into v_count from public.products p where p.workspace_id = p_workspace_id
    and coalesce(p.source_facts->>'archived','false') = 'false';
  if v_count > 100 then raise exception 'FACEBOOK_DAILY_APP_LIMIT_EXCEEDED'; end if;
  v_day := coalesce(p_scheduled_day,v_today);
  select coalesce(jsonb_agg(jsonb_build_object('workspace_id',p_workspace_id,'product_id',p.id,'app_name',p.name,
    'app_store_url',public.facebook_daily_app_store_url(p.source_facts,p.product_url),
    'facebook_page_url',public.facebook_daily_page_url(p.source_facts#>>'{socialLinks,facebook}'),
    'settings',jsonb_build_object('enabled',coalesce(s.enabled,false),'timezone','America/New_York','start_hour',coalesce(s.start_hour,3)),
    'assets_count',(select count(*) from public.facebook_draft_assets a where a.workspace_id = p_workspace_id and a.product_id = p.id
      and a.active and a.apple_app_id = public.email_daily_campaign_expected_app_id(p.source_facts,p.product_url)::numeric),
    'draft',(select to_jsonb(d) from public.facebook_daily_drafts d where d.workspace_id = p_workspace_id
      and d.product_id = p.id and d.scheduled_day = v_day)) order by p.name,p.id),'[]'::jsonb) into v_apps
    from public.products p left join public.facebook_daily_settings s on s.workspace_id = p.workspace_id and s.product_id = p.id
    where p.workspace_id = p_workspace_id and coalesce(p.source_facts->>'archived','false') = 'false';
  return jsonb_build_object('workspace_id',p_workspace_id,'scheduled_day',v_day,'today',v_today,'timezone','America/New_York','apps',v_apps,
    'today_counts',jsonb_build_object('apps',v_count,
      'drafts',(select count(*) from public.facebook_daily_drafts d join public.products p on p.workspace_id = d.workspace_id and p.id = d.product_id
        where d.workspace_id = p_workspace_id and d.scheduled_day = v_today and coalesce(p.source_facts->>'archived','false') = 'false'),
      'images',(select count(*) from public.facebook_daily_drafts d join public.products p on p.workspace_id = d.workspace_id and p.id = d.product_id
        where d.workspace_id = p_workspace_id and d.scheduled_day = v_today and d.image_path is not null
          and coalesce(p.source_facts->>'archived','false') = 'false')));
end $$;

-- One atomic workspace Start/Pause. No app can silently be omitted from a >100 app workspace.
create function public.facebook_save_daily_settings(p_workspace_id uuid, p_enabled boolean, p_timezone text, p_start_hour integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_revision uuid := gen_random_uuid(); v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('facebook-daily:' || p_workspace_id::text,0));
  if auth.uid() is null or coalesce(public.facebook_daily_lock_actor(p_workspace_id,auth.uid()),'') not in ('owner','admin') then
    raise exception 'FACEBOOK_DAILY_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_enabled is null or p_timezone is distinct from 'America/New_York' or p_start_hour is null or p_start_hour not between 0 and 23 then
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

-- Registration asserts metadata for an already user-supplied image, never generates/downloads one.
-- A duplicate app/hash returns the original row unchanged, including its uploader and captions.
create function public.register_facebook_draft_asset(p_workspace_id uuid, p_product_id uuid, p_apple_app_id numeric,
  p_file_path text, p_sha256 text, p_sort_order integer, p_title text, p_caption text, p_hashtags text, p_source_url text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_product record; v_expected text; v_asset public.facebook_draft_assets;
begin
  perform pg_advisory_xact_lock(hashtextextended('facebook-daily:' || p_workspace_id::text,0));
  if auth.uid() is null or coalesce(public.facebook_daily_lock_actor(p_workspace_id,auth.uid()),'') not in ('owner','admin') then
    raise exception 'FACEBOOK_DAILY_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  select p.source_facts,p.product_url into v_product from public.products p
    where p.workspace_id = p_workspace_id and p.id = p_product_id for share;
  if not found then raise exception 'FACEBOOK_DAILY_PRODUCT_NOT_FOUND'; end if;
  if coalesce(v_product.source_facts->>'archived','false') <> 'false' then raise exception 'FACEBOOK_DAILY_APP_UNAVAILABLE'; end if;
  v_expected := public.email_daily_campaign_expected_app_id(v_product.source_facts,v_product.product_url);
  if v_expected is null or p_apple_app_id is distinct from v_expected::numeric then raise exception 'FACEBOOK_DAILY_APP_STORE_INVALID'; end if;
  if not public.facebook_daily_asset_path_valid(p_workspace_id,p_product_id,p_file_path,p_sha256)
    or p_sort_order is null or p_title is null or length(p_title) > 200
    or p_caption is null or length(p_caption) > 2000 or p_hashtags is null or length(p_hashtags) > 500
    or (p_source_url is not null and p_source_url !~ '^https://files[.]manuscdn[.]com/user_upload_by_module/session_file/310519663911058939/[A-Za-z0-9_-]+[.]png$')
    or translate(p_title || p_caption || p_hashtags,E'\n\r\t','') ~ '[[:cntrl:]]' then
    raise exception 'FACEBOOK_DAILY_ASSET_INVALID';
  end if;
  insert into public.facebook_draft_assets(workspace_id,product_id,apple_app_id,file_path,sha256,sort_order,title,caption,hashtags,uploaded_by,source_url)
    values(p_workspace_id,p_product_id,p_apple_app_id,p_file_path,p_sha256,p_sort_order,p_title,p_caption,p_hashtags,auth.uid(),p_source_url)
    on conflict (workspace_id,product_id,sha256) do nothing returning * into v_asset;
  if not found then select a.* into v_asset from public.facebook_draft_assets a
    where a.workspace_id = p_workspace_id and a.product_id = p_product_id and a.sha256 = p_sha256; end if;
  return to_jsonb(v_asset) - 'source_url';
end $$;

-- Public approved graphic registry lookup for the bounded application PNG proxy.
-- No membership needed for the graphic itself; database execution is service-only.
create function public.facebook_get_public_image(p_workspace_id uuid, p_product_id uuid, p_sha256 text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('source_url',a.source_url,'sha256',a.sha256,'title',a.title)
  from public.facebook_draft_assets a join public.products p on p.workspace_id = a.workspace_id and p.id = a.product_id
  where a.workspace_id = p_workspace_id and a.product_id = p_product_id and a.sha256 = p_sha256
    and a.active and a.source_url is not null and coalesce(p.source_facts->>'archived','false') = 'false'
    and a.apple_app_id = public.email_daily_campaign_expected_app_id(p.source_facts,p.product_url)::numeric
    and a.file_path = '/facebook-assets/' || p_workspace_id::text || '/' || p_product_id::text || '/' || p_sha256 || '.png'
    and public.facebook_daily_asset_path_valid(p_workspace_id,p_product_id,a.file_path,p_sha256)
    and a.source_url ~ '^https://files[.]manuscdn[.]com/user_upload_by_module/session_file/310519663911058939/[A-Za-z0-9_-]+[.]png$'
  limit 1
$$;

-- Bounded read-only snapshot, not a claim. Missing images do not block content-only drafts.
create function public.facebook_due_daily_drafts(p_limit integer default 25)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x.item order by x.workspace_id,x.product_id),'[]'::jsonb) from (
    select s.workspace_id,s.product_id,jsonb_build_object('workspace_id',s.workspace_id,'product_id',s.product_id,
      'scheduled_day',(now() at time zone 'America/New_York')::date,'settings_revision',s.settings_revision,
      'product',jsonb_build_object('id',p.id,'name',p.name,'source_facts',
        public.email_daily_campaign_listing_facts(p.source_facts) || jsonb_build_object('appStoreUrl',public.facebook_daily_app_store_url(p.source_facts,p.product_url))),
      'asset',case when a.id is null then null else jsonb_build_object('id',a.id,'file_path',a.file_path,
        'title',a.title,'caption',a.caption,'hashtags',a.hashtags) end) as item
    from public.facebook_daily_settings s join public.products p on p.workspace_id = s.workspace_id and p.id = s.product_id
    left join lateral public.facebook_daily_rotating_asset(s.workspace_id,s.product_id,(now() at time zone 'America/New_York')::date,
      public.email_daily_campaign_expected_app_id(p.source_facts,p.product_url)::numeric) a on true
    where s.enabled and coalesce(p.source_facts->>'archived','false') = 'false'
      and coalesce(public.facebook_daily_actor_role(s.workspace_id,s.enabled_by),'') in ('owner','admin')
      and (select count(*) from public.products ap where ap.workspace_id = s.workspace_id
        and coalesce(ap.source_facts->>'archived','false') = 'false') <= 100
      and extract(hour from now() at time zone 'America/New_York') >= s.start_hour
      and not exists (select 1 from public.facebook_daily_drafts d where d.workspace_id = s.workspace_id
        and d.product_id = s.product_id and d.scheduled_day = (now() at time zone 'America/New_York')::date)
    order by s.workspace_id,s.product_id limit greatest(0,least(coalesce(p_limit,25),100))) x
$$;

create function public.facebook_save_daily_draft(p_workspace_id uuid, p_product_id uuid, p_scheduled_day date,
  p_settings_revision uuid, p_body text, p_hashtags text, p_app_store_url text, p_asset_id uuid, p_image_path text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_settings public.facebook_daily_settings; v_product record; v_expected text;
  v_asset public.facebook_draft_assets; v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('facebook-daily:' || p_workspace_id::text,0));
  select s.* into v_settings from public.facebook_daily_settings s
    where s.workspace_id = p_workspace_id and s.product_id = p_product_id for update;
  if not found or not v_settings.enabled or v_settings.settings_revision is distinct from p_settings_revision then
    return jsonb_build_object('created',false,'code','FACEBOOK_DAILY_SETTINGS_STALE');
  end if;
  if coalesce(public.facebook_daily_lock_actor(p_workspace_id,v_settings.enabled_by),'') not in ('owner','admin') then
    return jsonb_build_object('created',false,'code','FACEBOOK_DAILY_SETTINGS_STALE');
  end if;
  perform 1 from public.products p where p.workspace_id = p_workspace_id for share;
  select p.source_facts,p.product_url into v_product from public.products p
    where p.workspace_id = p_workspace_id and p.id = p_product_id;
  if not found or coalesce(v_product.source_facts->>'archived','false') <> 'false' then
    return jsonb_build_object('created',false,'code','FACEBOOK_DAILY_APP_UNAVAILABLE');
  end if;
  if (select count(*) from public.products p where p.workspace_id = p_workspace_id
    and coalesce(p.source_facts->>'archived','false') = 'false') > 100 then
    return jsonb_build_object('created',false,'code','FACEBOOK_DAILY_APP_LIMIT_EXCEEDED');
  end if;
  if p_scheduled_day is distinct from (now() at time zone 'America/New_York')::date
    or extract(hour from now() at time zone 'America/New_York') < v_settings.start_hour then
    return jsonb_build_object('created',false,'code','FACEBOOK_DAILY_NOT_DUE');
  end if;
  -- Return EXISTS before asset reselection so retries preserve edited and image-snapshot history.
  if exists (select 1 from public.facebook_daily_drafts d where d.workspace_id = p_workspace_id
    and d.product_id = p_product_id and d.scheduled_day = p_scheduled_day) then
    return jsonb_build_object('created',false,'code','FACEBOOK_DAILY_EXISTS');
  end if;
  v_expected := public.email_daily_campaign_expected_app_id(v_product.source_facts,v_product.product_url);
  if v_expected is null or public.email_daily_campaign_url_id(p_app_store_url) is distinct from v_expected or p_app_store_url ~ '[?#]' then
    return jsonb_build_object('created',false,'code','FACEBOOK_DAILY_APP_STORE_INVALID');
  end if;
  if not public.facebook_daily_content_valid(p_body,p_hashtags,p_app_store_url) then
    return jsonb_build_object('created',false,'code','FACEBOOK_DAILY_CONTENT_INVALID');
  end if;
  -- Lock the pool through commit; registration and settings share the same workspace lock.
  perform 1 from public.facebook_draft_assets a where a.workspace_id = p_workspace_id and a.product_id = p_product_id for share;
  v_asset := public.facebook_daily_rotating_asset(p_workspace_id,p_product_id,p_scheduled_day,v_expected::numeric);
  if v_asset.id is distinct from p_asset_id or v_asset.file_path is distinct from p_image_path then
    return jsonb_build_object('created',false,'code','FACEBOOK_DAILY_IMAGE_INVALID');
  end if;
  insert into public.facebook_daily_drafts(workspace_id,product_id,scheduled_day,body,hashtags,app_store_url,asset_id,image_path)
    values(p_workspace_id,p_product_id,p_scheduled_day,p_body,p_hashtags,p_app_store_url,p_asset_id,p_image_path)
    on conflict (workspace_id,product_id,scheduled_day) do nothing;
  get diagnostics v_count = row_count;
  return jsonb_build_object('created',v_count = 1,'code',case when v_count = 1 then 'FACEBOOK_DAILY_CREATED' else 'FACEBOOK_DAILY_EXISTS' end);
end $$;

alter table public.facebook_daily_settings enable row level security;
alter table public.facebook_draft_assets enable row level security;
alter table public.facebook_daily_drafts enable row level security;
revoke all on table public.facebook_daily_settings,public.facebook_draft_assets,public.facebook_daily_drafts from public,anon,authenticated,service_role;
revoke all on function public.facebook_daily_actor_role(uuid,uuid),public.facebook_daily_lock_actor(uuid,uuid),
  public.facebook_daily_asset_path_valid(uuid,uuid,text,text),public.facebook_daily_app_store_url(jsonb,text),
  public.facebook_daily_page_url(text),public.facebook_daily_content_valid(text,text,text),
  public.facebook_daily_rotating_asset(uuid,uuid,date,numeric),public.facebook_daily_settings_guard(),
  public.facebook_daily_asset_guard(),public.facebook_daily_draft_guard() from public,anon,authenticated,service_role;
revoke all on function public.get_facebook_daily_workspace_status(uuid,date),
  public.facebook_save_daily_settings(uuid,boolean,text,integer),
  public.register_facebook_draft_asset(uuid,uuid,numeric,text,text,integer,text,text,text,text),
  public.facebook_get_public_image(uuid,uuid,text),public.facebook_due_daily_drafts(integer),public.facebook_save_daily_draft(uuid,uuid,date,uuid,text,text,text,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.get_facebook_daily_workspace_status(uuid,date),
  public.facebook_save_daily_settings(uuid,boolean,text,integer),
  public.register_facebook_draft_asset(uuid,uuid,numeric,text,text,integer,text,text,text,text) to authenticated;
grant execute on function public.facebook_get_public_image(uuid,uuid,text),public.facebook_due_daily_drafts(integer),
  public.facebook_save_daily_draft(uuid,uuid,date,uuid,text,text,text,uuid,text) to service_role;
comment on table public.facebook_daily_drafts is 'Draft-only review calendar. Immutable scope/day/destination/image snapshots; a null image honestly means Image needed. No Facebook publishing.';
comment on function public.facebook_due_daily_drafts(integer) is 'Read-only due-app snapshot. Eastern start-hour gate; no claims, credentials or external calls.';
notify pgrst, 'reload schema';
commit;
