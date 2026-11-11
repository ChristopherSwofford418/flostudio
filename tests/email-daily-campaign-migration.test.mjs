import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const migration = name => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')
const sql = await migration('20261111_email_daily_campaigns')
const prior = await Promise.all(['20261109_email_campaigns', '20261109_email_no_repeat', '20261109_email_sender_preference',
  '20261109_email_status_metadata', '20261110_gmail_diagnostic', '20261111_email_lifecycle'].map(migration))

test('Daily campaign migration is additive, draft-only, secret-free and narrowly RPC mediated', () => {
  assert.match(sql, /begin;[\s\S]*commit;/)
  assert.doesNotMatch(sql, /\b(?:drop|truncate)\s|cron\.schedule|net\.http|http_post|vault\.|encrypted_credentials|refresh_token|access_token/i)
  assert.doesNotMatch(sql, /(?:insert into|update|delete from|alter table|from|join) public\.(?:email_campaigns|email_contacts|email_drafts|email_send_queue|email_quota_reservations|workspace_gmail_connections|workspace_openai_provider_credentials|email_suppressions)\b/i)
  assert.match(sql, /enabled boolean not null default false/)
  assert.match(sql, /timezone text not null default 'America\/New_York'/)
  assert.match(sql, /start_hour integer not null default 7/)
  assert.match(sql, /unique \(workspace_id, product_id, scheduled_day\)/)
  assert.match(sql, /on conflict \(workspace_id,product_id,scheduled_day\) do nothing/)
  assert.equal((sql.match(/security definer/g) || []).length, (sql.match(/security definer set search_path = ''/g) || []).length)
  assert.doesNotMatch(sql, /grant\s+(?:select|insert|update|delete|all)[\s\S]*?on\s+(?:table\s+)?public\./i)
  const due = sql.slice(sql.indexOf('create function public.email_due_daily_campaigns'), sql.indexOf('create function public.email_save_daily_campaign'))
  assert.doesNotMatch(due, /insert into|for update|claim_token|credential|settings_snapshot/)
  assert.match(due, /least\(coalesce\(p_limit,25\),100\)/)
})

// Optional local PostgreSQL-in-WASM. No production, browser, provider or credentials are accessed.
let PGlite
try { ({ PGlite } = await import('@electric-sql/pglite')) }
catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error
  try { ({ PGlite } = await import('/tmp/email-db-validation/node_modules/@electric-sql/pglite/dist/index.js')) }
  catch (fallback) { if (fallback.code !== 'ERR_MODULE_NOT_FOUND') throw fallback }
}

test('Offline durable daily campaign contracts and preservation of delivery state', { skip: !PGlite }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'flostudio-email-daily-campaign-'))
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
  const link = 'https://apps.apple.com/us/app/synthetic-app/id123456789'
  const link2 = 'https://apps.apple.com/us/app/synthetic-two/id987654321'
  const facts = {
    appId: '123456789', appStoreId: 123456789, appleAppId: '123456789',
    storeMetadata: { trackId: 123456789, trackUrl: `${link}?mt=8`, description: 'Synthetic listing description', private_note: 'NOT-FOR-WORKER' },
    appStoreListing: { sourceUrl: link, description: 'Synthetic synchronized listing', internal_data: 'NOT-FOR-WORKER' },
    private_note: 'NOT-FOR-WORKER', nested: { private_note: 'NOT-FOR-WORKER' },
  }
  const q = (text, values = []) => db.query(text, values)
  const scalar = async (text, values = []) => Object.values((await q(text, values)).rows[0])[0]
  const root = () => db.exec('reset role')
  const as = async (id, role = 'authenticated') => {
    await root(); await q("select set_config('request.jwt.claim.sub',$1,false)", [id]); await db.exec(`set role ${role}`)
  }
  const service = () => as('', 'service_role')
  const settings = (product = app, enabled = true, timezone = 'UTC', hour = 0, workspace = w) =>
    scalar('select save_email_daily_campaign_settings($1,$2,$3,$4,$5)', [workspace, product, enabled, timezone, hour])
  const status = (product = app, workspace = w) => scalar('select get_email_daily_campaign_status($1,$2)', [workspace, product])
  const due = (limit = 25) => scalar('select email_due_daily_campaigns($1)', [limit])
  const save = (item, overrides = {}) => {
    const payload = { workspace: item.workspace_id, product: item.product_id, day: item.scheduled_day, revision: item.settings_revision,
      name: 'Synthetic daily app draft', subject: 'Discover this app', body: `Discover this app.\nApp Store: ${item.product_id === app2 ? link2 : link}`,
      url: item.product_id === app2 ? link2 : link, ...overrides }
    return scalar('select email_save_daily_campaign($1,$2,$3,$4,$5,$6,$7,$8)',
      [payload.workspace, payload.product, payload.day, payload.revision, payload.name, payload.subject, payload.body, payload.url])
  }
  const update = (campaign, subject = 'Human edited subject', body = `Human edited reusable copy.\n${link}`, product = app, workspace = w) =>
    scalar('select update_email_daily_campaign($1,$2,$3,$4,$5)', [workspace, product, campaign, subject, body])
  // Snapshot synthetic non-secret delivery rows; connection projections explicitly omit credential columns.
  const snapshot = async () => {
    await root(); const result = {}
    for (const table of ['email_campaigns', 'email_contacts', 'email_drafts', 'email_send_queue', 'email_quota_reservations',
      'email_gmail_accounts', 'email_suppressions', 'workspace_email_preferences', 'email_cron_runs']) {
      result[table] = (await q(`select to_jsonb(t) as row from public.${table} t order by to_jsonb(t)::text`)).rows
    }
    result.workspace_gmail_connections = (await q('select workspace_id,email,configured,sending_enabled,delivery_pause_reason from workspace_gmail_connections order by workspace_id')).rows
    return result
  }
  const sendFunctions = async () => (await q("select oid::regprocedure::text as signature,prosrc,proacl::text as acl from pg_proc where pronamespace='public'::regnamespace and proname in ('email_activate_campaign','email_campaign_readiness','email_prepare_queue','email_claim_send','email_finish_send','email_claim_daily_run') order by signature")).rows
  let before, functionsBefore, item, campaignId, secondItem
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated,service_role;
      grant execute on function auth.uid() to authenticated,service_role;
      create table public.workspaces(id uuid primary key,owner_user_id uuid references auth.users);
      create table public.products(id uuid primary key,workspace_id uuid references public.workspaces,
        name text default 'Synthetic app',product_url text,source_facts jsonb default '{}');
      create table public.workspace_members(workspace_id uuid,user_id uuid,role text);
      create function public.is_workspace_admin(w uuid) returns boolean language sql stable security definer as $$
        select exists(select 1 from public.workspaces where id=w and owner_user_id=auth.uid())
          or exists(select 1 from public.workspace_members where workspace_id=w and user_id=auth.uid() and role='admin') $$;
      create function public.get_workspace_role(w uuid) returns text language sql stable security definer as $$
        select case when exists(select 1 from public.workspaces where id=w and owner_user_id=auth.uid()) then 'owner'
          else coalesce((select role from public.workspace_members where workspace_id=w and user_id=auth.uid()),'none') end $$;
    `)
    for (const id of [owner, admin, member, other]) await q('insert into auth.users values($1,$2)', [id, `${id.slice(-1)}@example.test`])
    await q('insert into workspaces values($1,$2),($3,$4)', [w, owner, w2, other])
    await q('insert into products(id,workspace_id,product_url,source_facts) values($1,$2,$3,$4),($5,$2,$6,$7),($8,$9,$3,$4)',
      [app, w, link, facts, app2, link2, { appId: '987654321', appStoreListing: { sourceUrl: link2, description: 'Another synthetic app' } }, foreignApp, w2])
    await q("insert into workspace_members values($1,$2,'admin'),($1,$3,'member')", [w, admin, member])
    for (const migrationSql of prior) await db.exec(migrationSql)
    const deliveryCampaign = await scalar('insert into email_campaigns(workspace_id,product_id) values($1,$2) returning id', [w, app])
    const contact = await scalar("insert into email_contacts(workspace_id,product_id,email) values($1,$2,'synthetic@example.test') returning id", [w, app])
    // Approved/consented historical records are synthetic fixtures, set by the authorized owner.
    await as(owner)
    await q("update email_contacts set status='opted_in',consent_evidence=$2 where id=$1", [contact,
      { method: 'operator_recorded', reference: 'Synthetic explicit consent', recorded_at: '2020-01-01T00:00:00Z' }])
    const deliveryDraft = await scalar("insert into email_drafts(workspace_id,product_id,campaign_id,contact_id,subject,body,status) values($1,$2,$3,$4,'Historical reviewed subject','Historical reviewed copy','approved') returning id", [w, app, deliveryCampaign, contact])
    await root()
    const queue = await scalar(`insert into email_send_queue(workspace_id,product_id,campaign_id,contact_id,draft_id,email,scheduled_day,status,claimed_at,claim_token)
      values($1,$2,$3,$4,$5,'synthetic@example.test',current_date-100,'unknown',now()-interval '100 days','30000000-0000-0000-0000-000000000001') returning id`, [w, app, deliveryCampaign, contact, deliveryDraft])
    await q("insert into email_gmail_accounts(account_key,sending_enabled) values($1,true)", ['a'.repeat(64)])
    await q('insert into email_quota_reservations(queue_id,account_key) values($1,$2)', [queue, 'a'.repeat(64)])
    await q("insert into workspace_gmail_connections(workspace_id,account_key,email,configured,created_by) values($1,$3,'synthetic-sender@example.test',false,$2)", [w, owner, 'a'.repeat(64)])
    before = await snapshot(); functionsBefore = await sendFunctions()
    await db.exec(sql)

    await t.test('Defaults and migration preserve all sending flags, consent, review state and history', async () => {
      assert.deepEqual(await snapshot(), before)
      assert.deepEqual(await sendFunctions(), functionsBefore)
      await as(member)
      const empty = await status()
      assert.deepEqual(Object.keys(empty).sort(), ['campaigns', 'settings', 'today'])
      assert.equal(empty.settings.enabled, false); assert.equal(empty.settings.timezone, 'America/New_York')
      assert.equal(empty.settings.start_hour, 7); assert.equal(empty.settings.settings_revision, null)
      assert.deepEqual(empty.campaigns, []); assert.equal(empty.today.created, false)
      assert.equal(empty.today.scheduled_day, await scalar("select (now() at time zone 'America/New_York')::date::text"))
      await service(); assert.deepEqual(await due(), [])
    })

    await t.test('ACLs deny all direct reads/writes and internal helpers; member reads and admin mutation are scoped', async () => {
      await root()
      const human = ['get_email_daily_campaign_status(uuid,uuid)', 'save_email_daily_campaign_settings(uuid,uuid,boolean,text,integer)', 'update_email_daily_campaign(uuid,uuid,uuid,text,text)']
      const worker = ['email_due_daily_campaigns(integer)', 'email_save_daily_campaign(uuid,uuid,date,uuid,text,text,text,text)']
      for (const fn of [...human, ...worker]) for (const role of ['anon', 'authenticated', 'service_role']) {
        assert.equal(await scalar("select has_function_privilege($1,$2,'EXECUTE')", [role, `public.${fn}`]), role === (human.includes(fn) ? 'authenticated' : 'service_role'))
      }
      for (const fn of ['email_daily_campaign_actor_role(uuid,uuid)', 'email_daily_campaign_lock_actor(uuid,uuid)',
        'email_daily_campaign_listing_facts(jsonb)', 'email_daily_campaign_url_id(text)', 'email_daily_campaign_expected_app_id(jsonb,text)',
        'email_daily_campaign_content_valid(text,text,text)', 'email_daily_campaign_settings_guard()', 'email_daily_campaign_guard()']) {
        for (const role of ['anon', 'authenticated', 'service_role']) assert.equal(await scalar("select has_function_privilege($1,$2,'EXECUTE')", [role, `public.${fn}`]), false)
      }
      for (const table of ['email_daily_campaign_settings', 'email_daily_campaigns']) {
        assert.equal(await scalar('select relrowsecurity from pg_class where oid=$1::regclass', [`public.${table}`]), true)
        for (const role of ['anon', 'authenticated', 'service_role']) for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE'])
          assert.equal(await scalar('select has_table_privilege($1,$2,$3)', [role, `public.${table}`, privilege]), false)
      }
      await as(member); await assert.rejects(settings(), /EMAIL_DAILY_CAMPAIGN_ADMIN_REQUIRED/)
      await assert.rejects(update(app), /EMAIL_DAILY_CAMPAIGN_ADMIN_REQUIRED/)
      await assert.rejects(due(), /permission denied/)
      await as(other); await assert.rejects(status(), /EMAIL_DAILY_CAMPAIGN_MEMBER_REQUIRED/)
      await assert.rejects(settings(), /EMAIL_DAILY_CAMPAIGN_ADMIN_REQUIRED/)
      await as(''); await assert.rejects(status(), /EMAIL_DAILY_CAMPAIGN_MEMBER_REQUIRED/)
      await assert.rejects(settings(), /EMAIL_DAILY_CAMPAIGN_ADMIN_REQUIRED/)
      await service(); await assert.rejects(status(), /permission denied/)
      await assert.rejects(q('insert into email_daily_campaign_settings(workspace_id,product_id) values($1,$2)', [w, app]), /permission denied/)
      await as(owner); await assert.rejects(settings(foreignApp), /EMAIL_DAILY_CAMPAIGN_PRODUCT_NOT_FOUND/)
      await assert.rejects(status(foreignApp), /EMAIL_DAILY_CAMPAIGN_PRODUCT_NOT_FOUND/)
      // A forged membership owner label is not ownership.
      await root(); await q("insert into workspace_members values($1,$2,'owner')", [w2, member])
      await as(member); await assert.rejects(settings(foreignApp, true, 'UTC', 0, w2), /EMAIL_DAILY_CAMPAIGN_ADMIN_REQUIRED/)
    })

    await t.test('Strict settings validate IANA zone, hours, booleans, nonarchived app and fresh authorization revision', async () => {
      await as(owner)
      for (const args of [[app, null], [app, true, null], [app, true, 'Not/AZone'], [app, true, ' UTC'], [app, true, '+05:00'],
        [app, true, 'UTC', null], [app, true, 'UTC', -1], [app, true, 'UTC', 24]]) await assert.rejects(settings(...args), /EMAIL_DAILY_CAMPAIGN_SETTINGS_INVALID/)
      await root(); await q('update products set source_facts=$2 where id=$1', [app2, { archived: true }])
      await as(admin); await assert.rejects(settings(app2), /EMAIL_DAILY_CAMPAIGN_APP_UNAVAILABLE/)
      await assert.rejects(settings(app2, false), /EMAIL_DAILY_CAMPAIGN_APP_UNAVAILABLE/)
      await root(); await q('update products set source_facts=$2 where id=$1', [app2, { appId: '987654321', appStoreListing: { sourceUrl: link2 } }])
      await as(admin); const enabled = await settings(); const again = await settings()
      assert.equal(enabled.enabled_by, admin); assert.notEqual(enabled.settings_revision, again.settings_revision)
      const disabled = await settings(app, false); assert.equal(disabled.enabled_by, null)
      await settings()
      await service(); [item] = await due()
      assert.deepEqual(Object.keys(item).sort(), ['workspace_id', 'product_id', 'scheduled_day', 'settings_revision', 'product', 'language'].sort())
      assert.deepEqual(Object.keys(item.product).sort(), ['id', 'name', 'product_url', 'source_facts'])
      assert.equal(item.language, 'en'); assert.equal(item.product_id, app)
      assert.deepEqual(item.product.source_facts, { appId: '123456789', appStoreId: 123456789, appleAppId: '123456789',
        storeMetadata: { trackId: 123456789, trackUrl: `${link}?mt=8`, description: 'Synthetic listing description' },
        appStoreListing: { sourceUrl: link, description: 'Synthetic synchronized listing' } })
      assert.doesNotMatch(JSON.stringify(item), /NOT-FOR-WORKER|private_note|internal_data|nested/)
      assert.deepEqual(await due(), [item], 'Due snapshots do not reserve or mutate work')
    })

    await t.test('Save rejects missing listing/ID, conflicting official identity and noncanonical/mismatched destination', async () => {
      await service()
      for (const url of [null, '', 'http://apps.apple.com/us/app/synthetic-app/id123456789', `${link}?mt=8`, `${link}#details`,
        `${link}/extra`, link.replace('123456789', '999999999'), link.replace('apps.apple.com', 'apps.apple.com.evil.test'),
        link.replace('apps.apple.com', 'user:pass@apps.apple.com'), link.replace('apps.apple.com', 'apps.apple.com:443'),
        link.replace('synthetic-app', 'synthetic%2Fapp'), link.replace('synthetic-app', 'synthetic%0Aapp'),
        link.replace('synthetic-app', 'synthetic%XXapp')])
        assert.deepEqual(await save(item, { url, body: `App Store: ${url}` }), { created: false, code: 'EMAIL_DAILY_CAMPAIGN_APP_STORE_INVALID' })
      for (const [newFacts, productUrl] of [[{}, null], [{ appId: '123456789' }, null], [{ appId: 'not-numeric' }, link],
        [{ ...facts, appId: '999999999' }, link], [{ ...facts, appStoreId: '999999999' }, link],
        [{ ...facts, storeMetadata: { trackId: 999999999, trackUrl: link } }, link],
        [{ ...facts, appStoreListing: { sourceUrl: link2 } }, link], [{ ...facts }, link2],
        [{ appId: '123456789', appStoreListing: { sourceUrl: 'https://apps.apple.com/bad' } }, null],
        [{ ...facts, appStoreListing: { sourceUrl: 'https://evil.test/listing' } }, link]]) {
        await root(); await q('update products set source_facts=$2,product_url=$3 where id=$1', [app, newFacts, productUrl])
        await service(); assert.equal((await save(item)).code, 'EMAIL_DAILY_CAMPAIGN_APP_STORE_INVALID')
      }
      await root(); await q('update products set source_facts=$2,product_url=$3 where id=$1', [app, facts, link])
      await service()
    })

    await t.test('Lengths, CRLF subject, missing stored URL, unsafe extra links and markup fail closed', async () => {
      for (const overrides of [{ name: null }, { name: '' }, { name: 'x'.repeat(201) }, { name: 'bad\nname' },
        { subject: null }, { subject: ' ' }, { subject: 'x'.repeat(181) }, { subject: 'Header\r\nInjected: x' },
        { body: null }, { body: 'No destination' }, { body: `${link}\n${'x'.repeat(6000)}` },
        ...['https://evil.test', 'http://evil.test', '//evil.test/path', 'www.evil.test', 'evil.test/path', 'mailto:a@evil.test',
          'javascript:alert(1)', 'data:text/html,bad', `<a href="${link}">store</a>`, `[Store](${link})`, `${link}/bad`, `${link}?tracking=1`]
          .map(extra => ({ body: `${link}\n${extra}` }))]) {
        assert.deepEqual(await save(item, overrides), { created: false, code: 'EMAIL_DAILY_CAMPAIGN_CONTENT_INVALID' })
      }
      await root(); assert.equal(await scalar('select count(*)::int from email_daily_campaigns'), 0)
      await service()
      const result = await save(item, { subject: 'x'.repeat(180), body: `${'x'.repeat(6000 - link.length - 1)}\n${link}` })
      assert.deepEqual(result, { created: true, code: 'EMAIL_DAILY_CAMPAIGN_CREATED' })
      await as(member); const current = await status(); campaignId = current.campaigns[0].id
      assert.equal(current.today.created, true); assert.equal(current.campaigns[0].status, 'draft')
      assert.equal(current.campaigns[0].content_source, 'listing_template')
    })

    await t.test('Admin edits keep stored link and draft status, cannot cross scope and survive retries/revisions/reopen', async () => {
      await as(member); await assert.rejects(update(campaignId), /EMAIL_DAILY_CAMPAIGN_ADMIN_REQUIRED/)
      await as(admin)
      await assert.rejects(update(campaignId, 'New subject', 'Missing URL'), /EMAIL_DAILY_CAMPAIGN_CONTENT_INVALID/)
      await assert.rejects(update(campaignId, 'New subject', `${link} https://evil.test`), /EMAIL_DAILY_CAMPAIGN_CONTENT_INVALID/)
      await assert.rejects(update(campaignId, 'New subject', link2), /EMAIL_DAILY_CAMPAIGN_CONTENT_INVALID/)
      await assert.rejects(update(campaignId, 'New subject', link, app2), /EMAIL_DAILY_CAMPAIGN_RECORD_NOT_FOUND/)
      const edited = await update(campaignId)
      assert.equal(edited.app_store_url, link); assert.equal(edited.status, 'draft')
      assert.equal(edited.subject, 'Human edited subject'); assert.equal(edited.content_source, 'listing_template')
      await service(); assert.deepEqual(await save(item), { created: false, code: 'EMAIL_DAILY_CAMPAIGN_EXISTS' })
      assert.deepEqual(await due(), [])
      await as(owner); const revised = await settings()
      await service(); assert.equal((await save(item)).code, 'EMAIL_DAILY_CAMPAIGN_SETTINGS_STALE')
      const revisedItem = { ...item, settings_revision: revised.settings_revision }
      const duplicates = await Promise.all(Array.from({ length: 6 }, () => save(revisedItem)))
      assert.ok(duplicates.every(r => r.code === 'EMAIL_DAILY_CAMPAIGN_EXISTS'))
      await root(); await db.close(); db = new PGlite(dir)
      await as(member); assert.deepEqual((await status()).campaigns[0], edited)
      await root()
      for (const query of ["update email_daily_campaigns set status='approved' where id=$1", 'update email_daily_campaigns set app_store_url=$2 where id=$1',
        'update email_daily_campaigns set scheduled_day=current_date-1 where id=$1', 'delete from email_daily_campaigns where id=$1'])
        await assert.rejects(q(query, query.includes('$2') ? [campaignId, link2] : [campaignId]), /EMAIL_DAILY_CAMPAIGN_HISTORY_IMMUTABLE/)
    })

    await t.test('Stale revisions, disabling, removed admins, ownership changes, archival and wrong day block saves', async () => {
      await as(admin); await settings(app2)
      await service(); [secondItem] = await due()
      assert.equal(secondItem.product_id, app2)
      await as(admin); await settings(app2)
      await service(); assert.equal((await save(secondItem)).code, 'EMAIL_DAILY_CAMPAIGN_SETTINGS_STALE')
      ;[secondItem] = await due()
      await as(admin); await settings(app2, false)
      await service(); assert.equal((await save(secondItem)).code, 'EMAIL_DAILY_CAMPAIGN_SETTINGS_STALE')
      await as(admin); await settings(app2)
      await service(); [secondItem] = await due()
      await root(); await q("update workspace_members set role='member' where workspace_id=$1 and user_id=$2", [w, admin])
      await service(); assert.deepEqual(await due(), [])
      assert.equal((await save(secondItem)).code, 'EMAIL_DAILY_CAMPAIGN_SETTINGS_STALE')
      await root(); await q("update workspace_members set role='admin' where workspace_id=$1 and user_id=$2", [w, admin])
      await as(owner); await settings(app2)
      await service(); [secondItem] = await due()
      await root(); await q('update workspaces set owner_user_id=$2 where id=$1', [w, other])
      await service(); assert.deepEqual(await due(), [])
      assert.equal((await save(secondItem)).code, 'EMAIL_DAILY_CAMPAIGN_SETTINGS_STALE')
      await root(); await q('update workspaces set owner_user_id=$2 where id=$1', [w, owner])
      await q('update products set source_facts=$2 where id=$1', [app2, { appId: '987654321', archived: true }])
      await service(); assert.deepEqual(await due(), [])
      assert.equal((await save(secondItem)).code, 'EMAIL_DAILY_CAMPAIGN_APP_UNAVAILABLE')
      await root(); await q('update products set source_facts=$2 where id=$1', [app2, { appId: '987654321', appStoreListing: { sourceUrl: link2 } }])
      await service()
      for (const day of [null, '2000-01-01', '2100-01-01']) assert.equal((await save(secondItem, { day })).code, 'EMAIL_DAILY_CAMPAIGN_NOT_DUE')
      assert.equal((await save(secondItem, { workspace: w2 })).code, 'EMAIL_DAILY_CAMPAIGN_SETTINGS_STALE')
    })

    await t.test('Local timezone/day and start hour are authoritative; listing URL-only fallback and final uniqueness work', async () => {
      await root()
      const zone = await scalar("select name from pg_timezone_names where name in ('UTC','Pacific/Honolulu','Asia/Tokyo') and extract(hour from now() at time zone name)<23 order by name limit 1")
      await as(owner); await settings(app2, true, zone, 23)
      await service(); assert.deepEqual(await due(), [])
      await as(member); const notYet = await status(app2)
      await service(); assert.equal((await save({ ...secondItem, settings_revision: notYet.settings.settings_revision, scheduled_day: notYet.today.scheduled_day })).code, 'EMAIL_DAILY_CAMPAIGN_NOT_DUE')
      await root(); const differentDayZone = await scalar("select name from pg_timezone_names where name !~ '^(posix|right)/' and (now() at time zone name)::date <> (now() at time zone 'UTC')::date order by name limit 1")
      assert.ok(differentDayZone)
      await as(owner); await settings(app2, true, differentDayZone, 0)
      await service(); [secondItem] = await due()
      assert.equal(secondItem.scheduled_day, await scalar('select (now() at time zone $1)::date::text', [differentDayZone]))
      await root(); await q('update products set source_facts=$2,product_url=null where id=$1', [app2, { appStoreListing: { sourceUrl: link2 } }])
      await service()
      const results = await Promise.all(Array.from({ length: 6 }, () => save(secondItem)))
      assert.equal(results.filter(r => r.created).length, 1)
      assert.equal(results.filter(r => r.code === 'EMAIL_DAILY_CAMPAIGN_EXISTS').length, 5)
      await as(member); assert.equal((await status(app2)).campaigns.length, 1)
      assert.equal((await status()).campaigns.length, 1, 'Other app is not included')
    })

    await t.test('Track ID fallback, multiple-workspace deterministic order, source allowlist and every limit cap', async () => {
      await root()
      const extra = []
      for (let i = 10; i < 116; i++) {
        const product = `20000000-0000-0000-0000-${String(i).padStart(12, '0')}`
        extra.push(product)
        await q('insert into products(id,workspace_id,product_url,source_facts) values($1,$2,$3,$4)', [product, w,
          link, { storeMetadata: { trackId: 123456789, trackUrl: link, private_note: 'NOT-FOR-WORKER' }, appId: { private_note: 'NOT-FOR-WORKER' } }])
        await as(owner); await settings(product); await root()
      }
      await as(other); await settings(foreignApp, true, 'UTC', 0, w2)
      await service()
      assert.equal((await scalar('select email_due_daily_campaigns()')).length, 25)
      for (const [limit, expected] of [[null, 25], [0, 0], [-1000, 0], [1, 1], [5, 5], [100, 100], [101, 100], [2147483647, 100]])
        assert.equal((await due(limit)).length, expected)
      const firstHundred = await due(1000)
      assert.deepEqual(firstHundred.map(r => `${r.workspace_id}:${r.product_id}`), firstHundred.map(r => `${r.workspace_id}:${r.product_id}`).sort())
      assert.doesNotMatch(JSON.stringify(firstHundred), /NOT-FOR-WORKER|private_note/)
      // Non-scalar metadata cannot silently stand in for an authoritative ID.
      await root(); await q('update products set source_facts=$2 where id=$1', [extra[0], { storeMetadata: { trackId: 123456789, trackUrl: link } }])
      await service(); const trackItem = (await due(100)).find(r => r.product_id === extra[0])
      assert.deepEqual(await save(trackItem), { created: true, code: 'EMAIL_DAILY_CAMPAIGN_CREATED' })
      await as(owner)
      for (const product of extra) await settings(product, false)
      await service(); const foreign = await due(); assert.equal(foreign.length, 1); assert.equal(foreign[0].workspace_id, w2)
      assert.equal((await save(foreign[0])).created, true)
      await as(member); await assert.rejects(status(foreignApp, w2), /EMAIL_DAILY_CAMPAIGN_MEMBER_REQUIRED/)
    })

    await t.test('Status is capped at 30 newest historical drafts and edits remain readable for archived apps', async () => {
      await root()
      for (let i = 1; i <= 35; i++) await q(`insert into email_daily_campaigns(workspace_id,product_id,scheduled_day,name,subject,body,app_store_url,created_at)
        values($1,$2,current_date-$3::integer,'Historical draft','Historical subject',$4,$5,now()-($3::integer * interval '1 day'))`, [w, app, i, `Historical copy ${link}`, link])
      await as(member); const current = await status()
      assert.equal(current.campaigns.length, 30); assert.equal(current.campaigns[0].id, campaignId)
      assert.ok(current.campaigns.every(r => r.product_id === app && r.status === 'draft'))
      assert.ok(current.campaigns.every((row, i, rows) => i === 0 || Date.parse(rows[i - 1].created_at) >= Date.parse(row.created_at)))
      await root(); await q('update products set source_facts=$2 where id=$1', [app, { ...facts, archived: true }])
      await as(member); assert.equal((await status()).campaigns[0].subject, 'Human edited subject')
      await as(owner); await update(campaignId, 'Preserved archived app edit', `Archived draft still reusable. ${link}`)
      await service(); assert.deepEqual(await due(), [])
      await root(); assert.deepEqual(await snapshot(), before)
      assert.deepEqual(await sendFunctions(), functionsBefore)
    })
  } finally {
    await db.close(); await rm(dir, { recursive: true, force: true })
  }
})
