import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const migration = name => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')
const sql = await migration('20261111_facebook_daily_drafts')
const emailSql = await migration('20261111_email_daily_campaigns')
const fixedScheduleSql = await migration('20261111_facebook_daily_fixed_schedule')

test('Facebook migration is additive, private, draft-only and has precisely six narrow RPCs', () => {
  assert.match(sql, /begin;[\s\S]*commit;/)
  assert.doesNotMatch(sql, /\b(?:drop|truncate)\s|cron\.schedule|net\.http|http_post|vault\.|encrypted_credentials|refresh_token|access_token/i)
  assert.doesNotMatch(sql, /(?:insert into|update|delete from|alter table|from|join) public\.(?:email_[a-z_]+|workspace_gmail_connections|workspace_openai_provider_credentials|facebook_group_[a-z_]+|social_[a-z_]+)\b/i)
  assert.match(sql, /enabled boolean not null default false/)
  assert.match(sql, /start_hour integer not null default 3/)
  assert.match(sql, /timezone = 'America\/New_York'/)
  assert.match(sql, /unique \(workspace_id, product_id, scheduled_day\)/)
  assert.match(sql, /on conflict \(workspace_id,product_id,scheduled_day\) do nothing/)
  assert.match(sql, /foreign key \(workspace_id, product_id, asset_id\)/)
  assert.equal((sql.match(/security definer/g) || []).length, (sql.match(/security definer set search_path = ''/g) || []).length)
  assert.doesNotMatch(sql, /grant\s+(?:select|insert|update|delete|all)[\s\S]*?on\s+(?:table\s+)?public\./i)
  const dueSql = sql.slice(sql.indexOf('create function public.facebook_due_daily_drafts'), sql.indexOf('create function public.facebook_save_daily_draft'))
  assert.doesNotMatch(dueSql, /insert into|for update|claim_token|credential/)
  assert.match(dueSql, /least\(coalesce\(p_limit,25\),100\)/)
})

test('Fixed-schedule follow-up changes only settings normalization, the named constraint and the existing settings RPC', () => {
  const start = sql.indexOf('create function public.facebook_save_daily_settings(')
  const baselineFunction = sql.slice(start, sql.indexOf('end $$;', start) + 'end $$;'.length)
  const replacement = fixedScheduleSql.match(/create or replace function[\s\S]*?end \$\$;/)?.[0]
  assert.equal(replacement, baselineFunction
    .replace('create function', 'create or replace function')
    .replace('p_start_hour is null or p_start_hour not between 0 and 23', 'p_start_hour is distinct from 3'))
  const normalize = text => text.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim()
  assert.equal(normalize(fixedScheduleSql.replace(replacement, 'SETTINGS_RPC;')), normalize(`
    begin;
    update public.facebook_daily_settings
      set start_hour = 3, settings_revision = gen_random_uuid()
      where start_hour is distinct from 3;
    alter table public.facebook_daily_settings
      add constraint facebook_daily_settings_start_hour_fixed check (start_hour = 3);
    SETTINGS_RPC;
    revoke all on function public.facebook_save_daily_settings(uuid,boolean,text,integer)
      from public,anon,authenticated,service_role;
    grant execute on function public.facebook_save_daily_settings(uuid,boolean,text,integer) to authenticated;
    notify pgrst, 'reload schema';
    commit;
  `))
})

// Local PostgreSQL-in-WASM only. Skip solely when both PGlite module locations are absent.
let PGlite
try { ({ PGlite } = await import('@electric-sql/pglite')) }
catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error
  try { ({ PGlite } = await import('/tmp/email-db-validation/node_modules/@electric-sql/pglite/dist/index.js')) }
  catch (fallback) { if (fallback.code !== 'ERR_MODULE_NOT_FOUND') throw fallback }
}

test('Offline Facebook daily database contracts', { skip: !PGlite }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'flostudio-facebook-daily-'))
  let db = new PGlite(dir)
  const owner = '00000000-0000-0000-0000-000000000001'
  const admin = '00000000-0000-0000-0000-000000000002'
  const member = '00000000-0000-0000-0000-000000000003'
  const other = '00000000-0000-0000-0000-000000000004'
  const w = '10000000-0000-0000-0000-000000000001'
  const w2 = '10000000-0000-0000-0000-000000000002'
  const app = '20000000-0000-0000-0000-000000000001'
  const app2 = '20000000-0000-0000-0000-000000000002'
  const foreignApp = '20000000-0000-0000-0000-000000000003'
  const archivedApp = '20000000-0000-0000-0000-000000000004'
  const link = 'https://apps.apple.com/app/id123456789'
  const link2 = 'https://apps.apple.com/app/id987654321'
  const facts = { appId: '123456789', appleAppId: '123456789', appStoreId: 123456789,
    storeMetadata: { trackId: 123456789, trackUrl: `${link}?mt=8`, description: 'Verified listing.', private_note: 'NOT-FOR-WORKER' },
    appStoreListing: { sourceUrl: link, description: 'Verified app listing.', secret: 'NOT-FOR-WORKER' },
    socialLinks: { facebook: 'https://www.facebook.com/syntheticpage' }, private_note: 'NOT-FOR-WORKER' }
  const facts2 = { appId: '987654321', appStoreListing: { sourceUrl: link2, description: 'Another verified app.' } }
  const source = 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663911058939/qntknLRndGHYsEtq.png'
  const q = (text, values = []) => db.query(text, values)
  const scalar = async (text, values = []) => Object.values((await q(text, values)).rows[0])[0]
  const root = () => db.exec('reset role')
  const as = async (id, role = 'authenticated') => {
    await root(); await q("select set_config('request.jwt.claim.sub',$1,false)", [id]); await db.exec(`set role ${role}`)
  }
  const service = () => as('', 'service_role')
  const settings = (enabled = true, hour = 0, workspace = w, timezone = 'America/New_York') =>
    scalar('select facebook_save_daily_settings($1,$2,$3,$4)', [workspace, enabled, timezone, hour])
  const status = (workspace = w, day = null) => scalar('select get_facebook_daily_workspace_status($1,$2)', [workspace, day])
  const due = (limit = 25) => scalar('select facebook_due_daily_drafts($1)', [limit])
  const image = (workspace = w, product = app, hash = 'a'.repeat(64)) =>
    scalar('select facebook_get_public_image($1,$2,$3)', [workspace, product, hash])
  const path = (product = app, hash = 'a'.repeat(64), workspace = w) => `/facebook-assets/${workspace}/${product}/${hash}.png`
  const register = (overrides = {}) => {
    const p = { workspace: w, product: app, appleId: '123456789', hash: 'a'.repeat(64), order: 0,
      title: 'User supplied image', caption: 'Verified image-specific caption.', hashtags: '#SyntheticApp', source, ...overrides }
    return scalar('select register_facebook_draft_asset($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [p.workspace, p.product, p.appleId, p.path ?? path(p.product, p.hash, p.workspace), p.hash, p.order, p.title, p.caption, p.hashtags, p.source])
  }
  const save = (item, overrides = {}) => {
    const url = item.product_id === app2 ? link2 : link
    const p = { workspace: item.workspace_id, product: item.product_id, day: item.scheduled_day, revision: item.settings_revision,
      body: `Verified app copy.\n${url}`, hashtags: '#SyntheticApp', url, asset: item.asset?.id ?? null, image: item.asset?.file_path ?? null, ...overrides }
    return scalar('select facebook_save_daily_draft($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [p.workspace, p.product, p.day, p.revision, p.body, p.hashtags, p.url, p.asset, p.image])
  }
  const preserved = async () => {
    await root()
    return { email: (await q('select to_jsonb(d) as row from email_daily_campaigns d order by id')).rows,
      settings: (await q('select to_jsonb(s) as row from email_daily_campaign_settings s order by product_id')).rows,
      legacy: (await q('select to_jsonb(l) as row from legacy_daily_fixture l order by id')).rows,
      funcs: (await q("select proname,prosrc,proacl::text as acl from pg_proc where pronamespace='public'::regnamespace and proname like '%email_daily%' order by proname")).rows }
  }
  let before, firstAsset, secondAsset, item, noImageItem, draftId, historical
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated,service_role;
      grant execute on function auth.uid() to authenticated,service_role;
      create table public.workspaces(id uuid primary key,owner_user_id uuid references auth.users);
      create table public.products(id uuid primary key,workspace_id uuid references public.workspaces,
        name text default 'Synthetic app',product_url text,source_facts jsonb default '{}',unique(workspace_id,id));
      create table public.workspace_members(workspace_id uuid,user_id uuid,role text);
      create table public.legacy_daily_fixture(id integer primary key,kind text,payload jsonb);
      insert into legacy_daily_fixture values(1,'email_send', '{"approved":true,"sending":false}'),
        (2,'research','{"state":"paused"}'),(3,'legacy_facebook','{"connected":false}');
    `)
    for (const id of [owner, admin, member, other]) await q('insert into auth.users values($1,$2)', [id, `${id.slice(-1)}@example.test`])
    await q('insert into workspaces values($1,$2),($3,$4)', [w, owner, w2, other])
    await q('insert into products(id,workspace_id,product_url,source_facts) values($1,$2,$3,$4),($5,$2,$6,$7),($8,$9,$3,$4),($10,$2,$3,$11)',
      [app, w, link, facts, app2, link2, facts2, foreignApp, w2, archivedApp, { ...facts, archived: true }])
    await q("insert into workspace_members values($1,$2,'admin'),($1,$3,'member'),($4,$3,'owner')", [w, admin, member, w2])
    await db.exec(emailSql) // Required audited internal validators are installed first.
    await as(owner)
    await scalar('select save_email_daily_campaign_settings($1,$2,true,\'UTC\',0)', [w, app])
    await root()
    await q(`insert into email_daily_campaigns(workspace_id,product_id,scheduled_day,name,subject,body,app_store_url)
      values($1,$2,current_date-50,'Historical email','Reviewed email',$3,$4)`, [w, app, `Preserved email copy ${link}`, link])
    before = await preserved()
    await db.exec(sql)

    await t.test('Defaults, complete active-app calendar, scope identity and no legacy mutations', async () => {
      assert.deepEqual(await preserved(), before)
      await as(member)
      const s = await status()
      assert.deepEqual(Object.keys(s).sort(), ['workspace_id', 'scheduled_day', 'today', 'timezone', 'apps', 'today_counts'].sort())
      assert.equal(s.workspace_id, w); assert.equal(s.timezone, 'America/New_York')
      assert.equal(s.today, await scalar("select (now() at time zone 'America/New_York')::date::text"))
      assert.equal(s.scheduled_day, s.today); assert.equal(s.apps.length, 2)
      assert.deepEqual(s.today_counts, { apps: 2, drafts: 0, images: 0 })
      assert.ok(s.apps.every(a => a.workspace_id === w && a.draft === null && a.assets_count === 0))
      assert.deepEqual(s.apps[0].settings, { enabled: false, timezone: 'America/New_York', start_hour: 3 })
      assert.equal(s.apps.find(a => a.product_id === app).facebook_page_url, 'https://www.facebook.com/syntheticpage')
      assert.equal(s.apps.find(a => a.product_id === app2).facebook_page_url, null)
      assert.equal((await status(w, '2100-01-01')).scheduled_day, '2100-01-01')
      await service(); assert.deepEqual(await due(), [])
    })

    await t.test('Exact ACLs, empty search paths, owner/member/admin boundaries and forged ownership', async () => {
      await root()
      const human = ['get_facebook_daily_workspace_status(uuid,date)', 'facebook_save_daily_settings(uuid,boolean,text,integer)',
        'register_facebook_draft_asset(uuid,uuid,numeric,text,text,integer,text,text,text,text)']
      const worker = ['facebook_due_daily_drafts(integer)', 'facebook_save_daily_draft(uuid,uuid,date,uuid,text,text,text,uuid,text)', 'facebook_get_public_image(uuid,uuid,text)']
      const all = (await q("select oid::regprocedure::text as signature,prosecdef,proconfig from pg_proc where pronamespace='public'::regnamespace and (proname like 'facebook_%' or proname in ('get_facebook_daily_workspace_status','register_facebook_draft_asset'))")).rows
      for (const fn of all) {
        assert.equal(fn.prosecdef, true); assert.deepEqual(fn.proconfig, ['search_path=""'])
        for (const role of ['anon', 'authenticated', 'service_role']) assert.equal(
          await scalar("select has_function_privilege($1,$2,'EXECUTE')", [role, fn.signature]),
          human.includes(fn.signature) ? role === 'authenticated' : worker.includes(fn.signature) ? role === 'service_role' : false)
      }
      assert.equal(all.filter(fn => human.includes(fn.signature)).length, 3)
      assert.equal(all.filter(fn => worker.includes(fn.signature)).length, 3)
      for (const table of ['facebook_daily_settings', 'facebook_draft_assets', 'facebook_daily_drafts']) {
        assert.equal(await scalar('select relrowsecurity from pg_class where oid=$1::regclass', [table]), true)
        for (const role of ['anon', 'authenticated', 'service_role']) for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE'])
          assert.equal(await scalar('select has_table_privilege($1,$2,$3)', [role, table, privilege]), false)
      }
      await as(member); await assert.rejects(settings(), /FACEBOOK_DAILY_ADMIN_REQUIRED/)
      await assert.rejects(register(), /FACEBOOK_DAILY_ADMIN_REQUIRED/)
      await assert.rejects(due(), /permission denied/)
      await assert.rejects(image(), /permission denied/)
      await assert.rejects(status(w2), /FACEBOOK_DAILY_MEMBER_REQUIRED/)
      await assert.rejects(settings(true, 0, w2), /FACEBOOK_DAILY_ADMIN_REQUIRED/)
      await as(other); await assert.rejects(status(), /FACEBOOK_DAILY_MEMBER_REQUIRED/)
      await assert.rejects(settings(), /FACEBOOK_DAILY_ADMIN_REQUIRED/)
      await as(''); await assert.rejects(status(), /FACEBOOK_DAILY_MEMBER_REQUIRED/)
      await as('', 'anon'); await assert.rejects(status(), /permission denied/)
      await service(); await assert.rejects(status(), /permission denied/)
      await assert.rejects(q('select id from facebook_draft_assets'), /permission denied/)
      await as(owner); await assert.rejects(register({ product: foreignApp }), /FACEBOOK_DAILY_PRODUCT_NOT_FOUND/)
      await assert.rejects(register({ product: archivedApp }), /FACEBOOK_DAILY_APP_UNAVAILABLE/)
    })

    await t.test('Settings start/pause atomically cover all active apps, fixed Eastern time and new revisions', async () => {
      await as(owner)
      for (const args of [[null], [true, null], [true, -1], [true, 24], [true, 0, w, null], [true, 0, w, 'UTC'], [true, 0, w, 'America/Chicago']])
        await assert.rejects(settings(...args), /FACEBOOK_DAILY_SETTINGS_INVALID/)
      const a = await settings(); const b = await settings()
      assert.equal(a.apps_updated, 2); assert.notEqual(a.settings_revision, b.settings_revision)
      await root()
      assert.deepEqual((await q('select distinct settings_revision from facebook_daily_settings where workspace_id=$1', [w])).rows,
        [{ settings_revision: b.settings_revision }])
      assert.equal(await scalar('select count(*)::int from facebook_daily_settings where product_id=$1', [archivedApp]), 0)
      await as(admin); const paused = await settings(false)
      assert.equal(paused.settings.enabled, false)
      await root(); assert.equal(await scalar('select count(*)::int from facebook_daily_settings where enabled_by is not null'), 0)
      await as(admin); await settings()
      await service(); const rows = await due(); assert.equal(rows.length, 2)
      assert.ok(rows.every(r => r.asset === null && r.scheduled_day === rows[0].scheduled_day))
      assert.deepEqual(await due(), rows)
      assert.doesNotMatch(JSON.stringify(rows), /NOT-FOR-WORKER|private_note|secret|socialLinks/)
      assert.deepEqual(Object.keys(rows[0]).sort(), ['workspace_id', 'product_id', 'scheduled_day', 'settings_revision', 'product', 'asset'].sort())
      assert.deepEqual(Object.keys(rows[0].product).sort(), ['id', 'name', 'source_facts'])
      noImageItem = rows.find(r => r.product_id === app2)
    })

    await t.test('New image registration validates exact listing ID, scoped hash path and stable duplicate identity', async () => {
      await as(owner)
      for (const appleId of [null, '0', '-1', '123456789.1', '987654321'])
        await assert.rejects(register({ appleId }), /FACEBOOK_DAILY_APP_STORE_INVALID/)
      for (const badPath of [path(app2), path(app, 'a'.repeat(64), w2), path().replace('.png', '.jpg'),
        `${path()}?download=1`, `${path()}#image`, path().replace('/facebook-assets/', '/facebook-assets/../'),
        path().replace('facebook-assets', 'facebook%2Dassets'), path().replace('a'.repeat(64), 'b'.repeat(64)),
        `https://evil.test${path()}`, `https://demo.supabase.co/storage/v1/object/sign/marketing-assets${path()}`,
        `https://demo.supabase.co/storage/v1/object/public/other-bucket${path()}`,
        `https://demo.supabase.co:443/storage/v1/object/public/marketing-assets${path()}`,
        `https://user@demo.supabase.co/storage/v1/object/public/marketing-assets${path()}`,
        `https://demo.supabase.co.evil.test/storage/v1/object/public/marketing-assets${path()}`])
        await assert.rejects(register({ path: badPath }), /FACEBOOK_DAILY_ASSET_INVALID/)
      for (const bad of [{ hash: 'A'.repeat(64) }, { hash: 'a'.repeat(63) }, { hash: 'g'.repeat(64) }, { order: null },
        { caption: null }, { caption: 'x'.repeat(2001) }, { hashtags: 'x'.repeat(501) }, { title: 'x'.repeat(201) }, { title: 'bad\u0001' }])
        await assert.rejects(register(bad), /FACEBOOK_DAILY_ASSET_INVALID/)
      firstAsset = await register()
      await as(admin)
      const duplicate = await register({ caption: 'Do not overwrite this.', order: 99, title: 'Changed' })
      assert.deepEqual(duplicate, firstAsset); assert.equal(duplicate.uploaded_by, owner)
      secondAsset = await register({ hash: 'b'.repeat(64), order: 1,
        path: `https://demo.supabase.co/storage/v1/object/public/marketing-assets${path(app, 'b'.repeat(64))}`, source: null })
      await service(); item = (await due()).find(r => r.product_id === app)
      await root()
      const offset = await scalar("select mod(((now() at time zone 'America/New_York')::date-date '1970-01-01'),2)::int")
      assert.equal(item.asset.id, [firstAsset, secondAsset][offset].id)
      assert.deepEqual(Object.keys(item.asset).sort(), ['id', 'file_path', 'title', 'caption', 'hashtags'].sort())
      for (const [day, expected] of [['1970-01-01', firstAsset.id], ['1970-01-02', secondAsset.id], ['1969-12-31', secondAsset.id]]) {
        assert.equal(await scalar('select (facebook_daily_rotating_asset($1,$2,$3,$4)).id', [w, app, day, '123456789']), expected)
      }
      assert.equal(await scalar('select (facebook_daily_rotating_asset($1,$2,$3,$4)).id', [w, app2, '1970-01-01', '987654321']), null)
      await as(member); assert.equal((await status()).apps.find(a => a.product_id === app).assets_count, 2)
    })

    await t.test('Approved CDN source is immutable and hidden from clients; registry lookup is exact and service-only', async () => {
      await as(owner)
      assert.equal(Object.hasOwn(firstAsset, 'source_url'), false)
      for (const badSource of [source.replace('https:', 'http:'), `${source}?download=1`, `${source}#image`,
        source.replace('310519663911058939', '310519663911058938'), source.replace('.png', '.jpg'),
        source.replace('files.manuscdn.com', 'files.manuscdn.com.evil.test'), source.replace('qntknLRndGHYsEtq', '../qntknLRndGHYsEtq'),
        source.replace('qntknLRndGHYsEtq', 'bad%2Fname'), source.replace('files.manuscdn.com', 'user@files.manuscdn.com')])
        await assert.rejects(register({ source: badSource }), /FACEBOOK_DAILY_ASSET_INVALID/)
      assert.deepEqual(await register({ source: source.replace('qntknLRndGHYsEtq', 'DifferentApprovedName') }), firstAsset)
      await root()
      assert.equal(await scalar('select source_url from facebook_draft_assets where id=$1', [firstAsset.id]), source)
      await assert.rejects(q('update facebook_draft_assets set source_url=$2 where id=$1', [firstAsset.id, null]), /FACEBOOK_DAILY_HISTORY_IMMUTABLE/)
      await service()
      assert.deepEqual(await image(), { source_url: source, sha256: 'a'.repeat(64), title: firstAsset.title })
      for (const args of [[w2], [w, app2], [w, app, 'b'.repeat(64)], [w, app, 'A'.repeat(64)], [w, app, null], [w, app, '../bad']])
        assert.equal(await image(...args), null)
      assert.doesNotMatch(JSON.stringify(await due()), /source_url|manuscdn/)
      await as(member); assert.doesNotMatch(JSON.stringify(await status()), /source_url|manuscdn/)
      await root(); await q('update facebook_draft_assets set active=false where id=$1', [firstAsset.id])
      await service(); assert.equal(await image(), null)
      await root(); await q('update facebook_draft_assets set active=true where id=$1', [firstAsset.id])
      for (const invalidFacts of [{ ...facts, archived: true }, { ...facts, appId: '999999999' }, {}]) {
        await root(); await q('update products set source_facts=$2,product_url=null where id=$1', [app, invalidFacts])
        await service(); assert.equal(await image(), null)
      }
      await root(); await q('update products set source_facts=$2,product_url=$3 where id=$1', [app, facts, link])
      await service(); assert.equal((await image()).source_url, source)
    })

    await t.test('Service independently validates due date, revision, current identity, plain content and exact rotated image', async () => {
      await service()
      for (const day of [null, '2000-01-01', '2100-01-01']) assert.equal((await save(item, { day })).code, 'FACEBOOK_DAILY_NOT_DUE')
      assert.equal((await save(item, { workspace: w2 })).code, 'FACEBOOK_DAILY_SETTINGS_STALE')
      assert.equal((await save(item, { revision: '30000000-0000-0000-0000-000000000001' })).code, 'FACEBOOK_DAILY_SETTINGS_STALE')
      for (const url of [null, '', link2, `${link}?q=1`, `${link}#details`, link.replace('https:', 'http:'),
        link.replace('apps.apple.com', 'apps.apple.com.evil.test'), link.replace('/app/', '/app/test%2Fapp/')])
        assert.equal((await save(item, { url, body: `App Store: ${url}` })).code, 'FACEBOOK_DAILY_APP_STORE_INVALID')
      for (const bad of [{ body: null }, { body: 'No app link' }, { body: `${'x'.repeat(4000)} ${link}` },
        { body: `<a href="${link}">App</a>` }, { body: `[App](${link})` }, { hashtags: null }, { hashtags: 'x'.repeat(501) },
        ...['https://evil.test', '//evil.test', 'www.evil.test', 'evil.test/path', 'javascript:alert(1)', 'mailto:a@example.test']
          .flatMap(extra => [{ body: `${link}\n${extra}` }, { hashtags: extra }])])
        assert.equal((await save(item, bad)).code, 'FACEBOOK_DAILY_CONTENT_INVALID')
      for (const bad of [{ asset: null, image: null }, { asset: item.asset.id, image: `${item.asset.file_path}?x=1` },
        { asset: item.asset.id === firstAsset.id ? secondAsset.id : firstAsset.id, image: item.asset.file_path },
        { asset: firstAsset.id, image: path(app2) }, { asset: null, image: item.asset.file_path }])
        assert.equal((await save(item, bad)).code, 'FACEBOOK_DAILY_IMAGE_INVALID')
      assert.equal((await save(noImageItem, { asset: firstAsset.id, image: firstAsset.file_path })).code, 'FACEBOOK_DAILY_IMAGE_INVALID')
      for (const [newFacts, url] of [[{}, null], [{ ...facts, appId: '999999999' }, link], [{ ...facts, appStoreListing: { sourceUrl: link2 } }, link]]) {
        await root(); await q('update products set source_facts=$2,product_url=$3 where id=$1', [app, newFacts, url])
        await service(); assert.equal((await save(item)).code, 'FACEBOOK_DAILY_APP_STORE_INVALID')
      }
      await root(); await q('update products set source_facts=$2,product_url=$3 where id=$1', [app, facts, link])
      await service()
      const created = await Promise.all(Array.from({ length: 5 }, () => save(item)))
      assert.equal(created.filter(r => r.created).length, 1)
      assert.ok(created.every(r => ['FACEBOOK_DAILY_CREATED', 'FACEBOOK_DAILY_EXISTS'].includes(r.code)))
      assert.deepEqual(await save(noImageItem), { created: true, code: 'FACEBOOK_DAILY_CREATED' })
      await as(member); const s = await status()
      assert.deepEqual(s.today_counts, { apps: 2, drafts: 2, images: 1 })
      const imageDraft = s.apps.find(a => a.product_id === app).draft
      const emptyDraft = s.apps.find(a => a.product_id === app2).draft
      assert.equal(imageDraft.image_path, item.asset.file_path); assert.equal(imageDraft.asset_id, item.asset.id)
      assert.equal(imageDraft.status, 'draft'); assert.equal(imageDraft.source, 'approved_asset_template'); draftId = imageDraft.id
      assert.equal(emptyDraft.asset_id, null); assert.equal(emptyDraft.image_path, null)
      await service(); assert.deepEqual(await due(), [])
    })

    await t.test('Historical IDs/date/URL/image/status are immutable, human copy survives retry and durable reopen', async () => {
      await root()
      await q('update facebook_daily_drafts set body=$2,hashtags=$3 where id=$1', [draftId, `Human-reviewed image copy. ${link}`, '#Reviewed'])
      historical = await scalar('select to_jsonb(d) from facebook_daily_drafts d where id=$1', [draftId])
      for (const [query, values] of [
        ['delete from facebook_daily_drafts where id=$1', [draftId]],
        ["update facebook_daily_drafts set scheduled_day=scheduled_day-1 where id=$1", [draftId]],
        ["update facebook_daily_drafts set status='approved' where id=$1", [draftId]],
        ['update facebook_daily_drafts set app_store_url=$2 where id=$1', [draftId, link2]],
        ['update facebook_daily_drafts set image_path=$2 where id=$1', [draftId, firstAsset.file_path + '?x=1']],
        ['update facebook_daily_drafts set product_id=$2 where id=$1', [draftId, app2]],
        ["update facebook_daily_drafts set id='30000000-0000-0000-0000-000000000001' where id=$1", [draftId]],
        ['delete from facebook_draft_assets where id=$1', [firstAsset.id]],
        ['update facebook_draft_assets set file_path=$2 where id=$1', [firstAsset.id, path(app2)]],
        ['update facebook_draft_assets set sha256=$2 where id=$1', [firstAsset.id, 'c'.repeat(64)]],
        ['delete from facebook_daily_settings where workspace_id=$1', [w]]])
        await assert.rejects(q(query, values), /FACEBOOK_DAILY_HISTORY_IMMUTABLE/)
      await q('update facebook_draft_assets set active=false where id=$1', [item.asset.id])
      await service(); assert.deepEqual(await save(item), { created: false, code: 'FACEBOOK_DAILY_EXISTS' })
      await root(); assert.deepEqual(await scalar('select to_jsonb(d) from facebook_daily_drafts d where id=$1', [draftId]), historical)
      await db.close(); db = new PGlite(dir)
      await as(member); assert.deepEqual((await status()).apps.find(a => a.product_id === app).draft, historical)
      await root()
      await q(`insert into facebook_daily_drafts(workspace_id,product_id,scheduled_day,body,hashtags,app_store_url)
        values($1,$2,date '2001-02-03',$3,'#History',$4)`, [w, app, `Historical draft ${link}`, link])
      await as(member); const old = await status(w, '2001-02-03')
      assert.equal(old.apps.find(a => a.product_id === app).draft.scheduled_day, '2001-02-03')
      assert.deepEqual(old.today_counts, { apps: 2, drafts: 2, images: 1 })
    })

    await t.test('Revision/pause, revocation, real ownership, archival and current start-hour gate cannot be bypassed', async () => {
      await as(owner); await settings()
      await service(); assert.equal((await save(item)).code, 'FACEBOOK_DAILY_SETTINGS_STALE')
      await as(owner); await settings(false)
      await service(); assert.deepEqual(await due(), []); assert.equal((await save(item)).code, 'FACEBOOK_DAILY_SETTINGS_STALE')
      await as(admin); const enabled = await settings(); const refreshed = { ...item, settings_revision: enabled.settings_revision }
      await root(); await q("update workspace_members set role='member' where workspace_id=$1 and user_id=$2", [w, admin])
      await service(); assert.equal((await save(refreshed)).code, 'FACEBOOK_DAILY_SETTINGS_STALE'); assert.deepEqual(await due(), [])
      await root(); await q("update workspace_members set role='admin' where workspace_id=$1 and user_id=$2", [w, admin])
      await as(owner); const owned = await settings()
      await root(); await q('update workspaces set owner_user_id=$2 where id=$1', [w, other])
      await service(); assert.equal((await save({ ...item, settings_revision: owned.settings_revision })).code, 'FACEBOOK_DAILY_SETTINGS_STALE')
      await root(); await q('update workspaces set owner_user_id=$2 where id=$1', [w, owner])
      await q('update products set source_facts=$2 where id=$1', [app, { ...facts, archived: true }])
      await service(); assert.equal((await save({ ...item, settings_revision: owned.settings_revision })).code, 'FACEBOOK_DAILY_APP_UNAVAILABLE')
      await as(member); assert.equal((await status()).apps.length, 1)
      await root(); assert.deepEqual(await scalar('select to_jsonb(d) from facebook_daily_drafts d where id=$1', [draftId]), historical)
      await q('update products set source_facts=$2 where id=$1', [app, facts])
      await as(owner); const later = await settings(true, 23)
      const hour = await scalar("select extract(hour from now() at time zone 'America/New_York')::int")
      await service()
      assert.equal((await save({ ...item, settings_revision: later.settings_revision })).code, hour < 23 ? 'FACEBOOK_DAILY_NOT_DUE' : 'FACEBOOK_DAILY_EXISTS')
      await as(owner); await settings()
    })

    await t.test('Privileged SQL asset import works without JWT but rejects false actor, scope and listing metadata', async () => {
      await root(); await q("select set_config('request.jwt.claim.sub','',false)")
      assert.equal(await scalar('select auth.uid()'), null)
      const hash = 'c'.repeat(64)
      const imported = (actor = owner, appleId = '987654321', product = app2) => scalar(`
        insert into facebook_draft_assets(workspace_id,product_id,apple_app_id,file_path,sha256,uploaded_by,source_url,active)
        values($1,$2,$3,$4,$5,$6,$7,false) on conflict(workspace_id,product_id,sha256) do nothing returning id`,
        [w, product, appleId, path(product, hash), hash, actor, source])
      await assert.rejects(imported(member), /FACEBOOK_DAILY_ADMIN_REQUIRED/)
      await assert.rejects(imported(other), /FACEBOOK_DAILY_ADMIN_REQUIRED/)
      await assert.rejects(imported(owner, '123456789'), /FACEBOOK_DAILY_APP_STORE_INVALID/)
      await assert.rejects(imported(owner, '123456789', foreignApp), /FACEBOOK_DAILY_PRODUCT_NOT_FOUND/)
      await assert.rejects(imported(owner, '123456789', archivedApp), /FACEBOOK_DAILY_APP_UNAVAILABLE/)
      const id = await imported(); assert.ok(id)
      await q('update facebook_draft_assets set active=true where id=$1', [id])
      await service(); assert.deepEqual(await image(w, app2, hash), { source_url: source, sha256: hash, title: '' })
      await root(); await q('update facebook_draft_assets set active=false where id=$1', [id])
      await service(); await assert.rejects(q('insert into facebook_draft_assets(id) values(gen_random_uuid())'), /permission denied/)
    })

    await t.test('Complete all-25 app calendar, bounded deterministic worker batches and >100 fail-closed', async () => {
      await root()
      for (let i = 10; i < 109; i++) {
        const id = `20000000-0000-0000-0000-${String(i).padStart(12, '0')}`
        await q('insert into products(id,workspace_id,product_url,source_facts) values($1,$2,$3,$4)', [id, w, link, facts])
        if (i === 32) {
          await as(owner); const all = await settings(); assert.equal(all.apps_updated, 25)
          await as(member); assert.equal((await status()).apps.length, 25)
          await root()
        }
        if (i === 107) {
          await as(owner); assert.equal((await settings()).apps_updated, 100)
          await as(member); assert.equal((await status()).apps.length, 100)
          await service()
          assert.equal((await scalar('select facebook_due_daily_drafts()')).length, 25)
          for (const [limit, expected] of [[null, 25], [-1, 0], [0, 0], [1, 1], [5, 5], [100, 98], [101, 98], [2147483647, 98]])
            assert.equal((await due(limit)).length, expected)
          const items = await due(100)
          assert.deepEqual(items.map(r => `${r.workspace_id}:${r.product_id}`), items.map(r => `${r.workspace_id}:${r.product_id}`).sort())
          assert.ok(items.every(r => r.asset === null)); await root()
        }
      }
      await as(member); await assert.rejects(status(), /FACEBOOK_DAILY_APP_LIMIT_EXCEEDED/)
      await as(owner); await assert.rejects(settings(), /FACEBOOK_DAILY_APP_LIMIT_EXCEEDED/)
      await assert.rejects(settings(false), /FACEBOOK_DAILY_APP_LIMIT_EXCEEDED/)
      await service(); assert.deepEqual(await due(), [])
      await root(); const revision = await scalar('select settings_revision from facebook_daily_settings where product_id=$1', [app])
      await service(); assert.equal((await save({ ...item, settings_revision: revision })).code, 'FACEBOOK_DAILY_APP_LIMIT_EXCEEDED')
      await as(other); await settings(true, 0, w2)
      await service(); const foreign = await due(); assert.equal(foreign.length, 1); assert.equal(foreign[0].workspace_id, w2)
      assert.equal((await save(foreign[0])).created, true)
      await as(member); await assert.rejects(status(w2), /FACEBOOK_DAILY_MEMBER_REQUIRED/)
      assert.deepEqual(await preserved(), before)
    })

    await t.test('Additive fixed-3 follow-up normalizes only non-3 settings and preserves history, ACLs and all-app caps', async () => {
      // Baseline hour-0 scenarios above remain untouched. No due/save clock assumptions below.
      await as(other); await settings(true, 3, w2)
      await root()
      await q(`update facebook_daily_settings set enabled=false,enabled_by=null,settings_revision=gen_random_uuid()
        where workspace_id=$1 and product_id=$2`, [w, app2])
      const settingRows = () => q('select to_jsonb(s) as row from facebook_daily_settings s order by workspace_id,product_id').then(r => r.rows)
      const historyRows = async () => ({
        drafts: (await q('select to_jsonb(d) as row from facebook_daily_drafts d order by id')).rows,
        assets: (await q('select to_jsonb(a) as row from facebook_draft_assets a order by id')).rows,
        legacy: await preserved()
      })
      const aclRows = async () => ({
        functions: (await q(`select oid::regprocedure::text as signature,proacl::text as acl,prosecdef,proconfig
          from pg_proc where pronamespace='public'::regnamespace order by oid::regprocedure::text`)).rows,
        tables: (await q(`select relname,relacl::text as acl,relrowsecurity from pg_class
          where relnamespace='public'::regnamespace and relkind in ('r','p') order by relname`)).rows
      })
      const oldSettings = await settingRows()
      const oldHistory = await historyRows()
      const oldAcls = await aclRows()
      assert.ok(oldSettings.some(({ row }) => row.start_hour !== 3 && !row.enabled))
      assert.ok(oldSettings.some(({ row }) => row.start_hour !== 3 && row.enabled))
      assert.equal(oldSettings.filter(({ row }) => row.start_hour === 3).length, 1)
      await db.exec(fixedScheduleSql)
      const normalizedSettings = await settingRows()
      assert.equal(normalizedSettings.length, oldSettings.length)
      for (let i = 0; i < oldSettings.length; i++) {
        const previous = oldSettings[i].row; const current = normalizedSettings[i].row
        if (previous.start_hour === 3) assert.deepEqual(current, previous)
        else {
          assert.equal(current.start_hour, 3)
          assert.notEqual(current.settings_revision, previous.settings_revision)
          const stable = row => Object.fromEntries(Object.entries(row)
            .filter(([key]) => !['start_hour', 'settings_revision', 'updated_at'].includes(key)))
          assert.deepEqual(stable(current), stable(previous))
        }
      }
      assert.deepEqual(await historyRows(), oldHistory)
      assert.deepEqual(await aclRows(), oldAcls)
      assert.deepEqual((await q(`select conname,convalidated,pg_get_constraintdef(oid) as definition
        from pg_constraint where conrelid='public.facebook_daily_settings'::regclass
        and conname='facebook_daily_settings_start_hour_fixed'`)).rows,
      [{ conname: 'facebook_daily_settings_start_hour_fixed', convalidated: true, definition: 'CHECK ((start_hour = 3))' }])

      const invalidHours = [...Array.from({ length: 24 }, (_, hour) => hour).filter(hour => hour !== 3), null, -1, 24]
      await as(other)
      for (const hour of invalidHours) for (const enabled of [true, false])
        await assert.rejects(settings(enabled, hour, w2), /FACEBOOK_DAILY_SETTINGS_INVALID/)
      for (const args of [[null, 3, w2], [true, 3, w2, null], [true, 3, w2, 'UTC']])
        await assert.rejects(settings(...args), /FACEBOOK_DAILY_SETTINGS_INVALID/)
      await root()
      for (const hour of invalidHours) {
        await assert.rejects(q(`update facebook_daily_settings set start_hour=$2,settings_revision=gen_random_uuid()
          where workspace_id=$1`, [w2, hour]), error => {
          assert.equal(error.code, hour === null ? '23502' : '23514')
          if (hour !== null && hour >= 0 && hour <= 23)
            assert.match(error.message, /facebook_daily_settings_start_hour_fixed/)
          return true
        })
      }
      await assert.rejects(q('update facebook_daily_settings set start_hour=3 where workspace_id=$1', [w2]), /FACEBOOK_DAILY_SETTINGS_INVALID/)
      assert.deepEqual(await settingRows(), normalizedSettings)

      await as(other)
      const started = await settings(true, 3, w2)
      const paused = await settings(false, 3, w2)
      const restarted = await settings(true, 3, w2)
      for (const result of [started, paused, restarted]) {
        assert.equal(result.apps_updated, 1)
        assert.equal(result.settings.timezone, 'America/New_York'); assert.equal(result.settings.start_hour, 3)
      }
      assert.equal(paused.settings.enabled, false)
      assert.notEqual(started.settings_revision, paused.settings_revision)
      assert.notEqual(paused.settings_revision, restarted.settings_revision)
      await root()
      assert.deepEqual((await q('select start_hour,enabled,enabled_by,settings_revision from facebook_daily_settings where workspace_id=$1', [w2])).rows,
        [{ start_hour: 3, enabled: true, enabled_by: other, settings_revision: restarted.settings_revision }])
      assert.deepEqual((await settingRows()).filter(({ row }) => row.workspace_id === w),
        normalizedSettings.filter(({ row }) => row.workspace_id === w))
      await as(owner)
      for (const enabled of [true, false]) await assert.rejects(settings(enabled, 3), /FACEBOOK_DAILY_APP_LIMIT_EXCEEDED/)
      await assert.rejects(settings(true, 3, w2), /FACEBOOK_DAILY_ADMIN_REQUIRED/)
      await as(member); await assert.rejects(settings(true, 3, w2), /FACEBOOK_DAILY_ADMIN_REQUIRED/)
      await root()
      assert.deepEqual(await historyRows(), oldHistory)
      assert.deepEqual(await aclRows(), oldAcls)
    })
  } finally {
    await db.close(); await rm(dir, { recursive: true, force: true })
  }
})
