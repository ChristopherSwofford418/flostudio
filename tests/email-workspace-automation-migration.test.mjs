import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const migration = name => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')
const sql = await migration('20261111_email_workspace_automation')
const prior = await Promise.all(['20261109_email_campaigns', '20261109_email_no_repeat', '20261109_email_sender_preference',
  '20261109_email_status_metadata', '20261110_gmail_diagnostic', '20261111_email_lifecycle',
  '20261111_email_daily_campaigns', '20261111_email_daily_research'].map(migration))
const getSignature = 'public.get_email_workspace_automation_status(uuid)'
const setSignature = 'public.set_email_workspace_automation(uuid,boolean,text,boolean)'
const privateSignature = 'public.email_workspace_automation_snapshot(uuid)'
const failure = code => ({ applied: false, code })

// These assertions always run, even when the optional offline engine is absent.
test('Workspace automation is additive, allowlisted, research/drafts-only and never executes delivery readiness', () => {
  assert.match(sql, /begin;[\s\S]*commit;/)
  assert.doesNotMatch(sql, /\b(?:drop|truncate)\s|alter table|create policy|cron\.schedule|net\.http|http_post|vault\.|encrypted_credentials|refresh_token|access_token|workspace_openai_provider_credentials/i)
  assert.doesNotMatch(sql, /(?:insert into|update|delete from) public\.(?:email_campaigns|email_contacts|email_drafts|email_send_queue|email_quota_reservations|email_research_runs|email_daily_campaigns|email_gmail_accounts|workspace_gmail_connections|workspace_email_preferences|email_suppressions|email_cron_runs)\b/i)
  assert.doesNotMatch(sql, /(?:perform|select|return)[^;]*public\.(?:email_activate_campaign|email_pause_mailbox|email_campaign_readiness|email_lifecycle_readiness|email_connection_status|email_claim_research_batch|get_email_research_credential)\(/i)
  assert.doesNotMatch(sql, /grant\s+(?:select|insert|update|delete|all)[\s\S]*?on\s+(?:table\s+)?public\./i)
  assert.equal((sql.match(/security definer/g) || []).length, (sql.match(/security definer set search_path = ''/g) || []).length)
  assert.match(sql, /'deliveryChanged',0/)
  assert.match(sql, /'reviewRevision',md5\(/)
  assert.match(sql, /p_review_revision !~ '\^\[0-9a-f\]\{32\}\$'/)
  assert.match(sql, /order by id limit 200/)
  assert.match(sql, /coalesce\(p\.source_facts->>'archived','false'\) = 'false'/)
  assert.match(sql, /research_actor_current/)
  assert.match(sql, /draft_actor_current/)
  const fingerprint = sql.slice(sql.indexOf("'reviewRevision',md5("), sql.indexOf("'apps',coalesce((select jsonb_agg(jsonb_build_object"))
  assert.doesNotMatch(fingerprint, /opted_in_count|today_created|scheduled_day|created_at|consent|recipient|subject|body/)
  const rpc = sql.slice(sql.indexOf('create function public.set_email_workspace_automation'))
  const checks = ["'EMAIL_WORKSPACE_AUTOMATION_LIMIT'", "'EMAIL_WORKSPACE_NO_APPS'", "'EMAIL_WORKSPACE_REVIEW_STALE'", "'EMAIL_WORKSPACE_RESEARCH_CONFIRM_REQUIRED'"]
  for (const check of checks) assert.ok(rpc.indexOf(check) < rpc.indexOf('insert into public.email_research_settings'))
})

test('Lock order avoids daily-worker inversion and binds the full app set before all mutations', () => {
  const rpc = sql.slice(sql.indexOf('create function public.set_email_workspace_automation'))
  const global = rpc.indexOf("hashtextextended('email-research-global'")
  const workspace = rpc.indexOf("hashtextextended('email-workspace:'")
  const owner = rpc.indexOf('from public.workspaces w')
  const membership = rpc.indexOf('from public.workspace_members m')
  const barrier = rpc.indexOf('lock table public.products in share mode nowait')
  const products = rpc.indexOf("order by p.id for share")
  const daily = rpc.indexOf("hashtextextended('email-daily-campaign:'")
  const snapshot = rpc.indexOf('v_status := public.email_workspace_automation_snapshot')
  const write = rpc.indexOf('insert into public.email_research_settings')
  assert.ok(global < workspace && workspace < daily && daily < owner && owner < membership && membership < barrier)
  assert.ok(barrier < products && products < snapshot && snapshot < write)
  assert.doesNotMatch(rpc.slice(0, daily), /email_daily_campaign_settings[^;]*for update/i)
  assert.match(rpc.slice(daily, snapshot), /order by m.user_id for share/)
  assert.match(rpc.slice(daily, snapshot), /v_locked_products is distinct from v_products/)
  // Existing per-app saves/workers take their advisory before settings rows.
  assert.ok(prior[6].indexOf("hashtextextended('email-daily-campaign:'") < prior[6].indexOf('insert into public.email_daily_campaign_settings'))
})

let PGlite
try { ({ PGlite } = await import('@electric-sql/pglite')) }
catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error
  try { ({ PGlite } = await import('/tmp/email-db-validation/node_modules/@electric-sql/pglite/dist/index.js')) }
  catch (fallback) { if (fallback.code !== 'ERR_MODULE_NOT_FOUND') throw fallback }
}

// Disposable local PostgreSQL only. No browser, provider, live SQL or credentials.
test('Offline workspace automation: strict scope, atomicity, reviews, durable histories and no delivery changes', { skip: !PGlite }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'flostudio-email-workspace-'))
  let db = new PGlite(dir)
  const owner = '00000000-0000-0000-0000-000000000001'
  const admin = '00000000-0000-0000-0000-000000000002'
  const member = '00000000-0000-0000-0000-000000000003'
  const other = '00000000-0000-0000-0000-000000000004'
  const w = '10000000-0000-0000-0000-000000000001'
  const w2 = '10000000-0000-0000-0000-000000000002'
  const emptyW = '10000000-0000-0000-0000-000000000003'
  const limitW = '10000000-0000-0000-0000-000000000004'
  const uuid = n => `20000000-0000-0000-0000-${String(n).padStart(12, '0')}`
  const apps = Array.from({ length: 25 }, (_, i) => uuid(i + 1))
  const app = apps[0], archived = uuid(26), foreign = uuid(27), newApp = uuid(28)
  const account = 'a'.repeat(64)
  const link = 'https://apps.apple.com/us/app/synthetic-app/id123456789'
  const consent = { method: 'operator_recorded', reference: 'Synthetic explicit app-specific form opt-in', recorded_at: '2020-01-01T00:00:00Z' }
  const q = (text, values = []) => db.query(text, values)
  const scalar = async (text, values = []) => Object.values((await q(text, values)).rows[0])[0]
  const root = () => db.exec('reset role')
  const as = async (id, role = 'authenticated') => {
    await root(); await q("select set_config('request.jwt.claim.sub',$1,false)", [id]); await db.exec(`set role ${role}`)
  }
  const get = (workspace = w) => scalar('select get_email_workspace_automation_status($1)', [workspace])
  const set = (revision, enabled = true, confirm = true, workspace = w) => scalar('select set_email_workspace_automation($1,$2,$3,$4)', [workspace, enabled, revision, confirm])
  const freshSet = async (enabled = true, workspace = w) => set((await get(workspace)).reviewRevision, enabled, enabled, workspace)
  const research = (product = app, enabled = true, workspace = w, target = 57, requests = 10, timezone = 'Asia/Tokyo', hour = 5, query = 'Private custom query never returned') =>
    scalar('select save_email_research_settings($1,$2,$3,$4,$5,$6,$7,$8)', [workspace, product, enabled, target, requests, timezone, hour, query])
  const drafts = (product = app, enabled = true, workspace = w, timezone = 'Pacific/Honolulu', hour = 11) =>
    scalar('select save_email_daily_campaign_settings($1,$2,$3,$4,$5)', [workspace, product, enabled, timezone, hour])
  const settingsSnapshot = async () => {
    await root(); const result = {}
    for (const table of ['email_research_settings', 'email_daily_campaign_settings'])
      result[table] = (await q(`select to_jsonb(t) as row from ${table} t order by workspace_id,product_id`)).rows
    return result
  }
  const untouchedTables = ['email_campaigns', 'email_contacts', 'email_drafts', 'email_send_queue', 'email_quota_reservations',
    'email_research_runs', 'email_daily_campaigns', 'email_gmail_accounts', 'email_suppressions', 'workspace_email_preferences',
    'email_cron_runs', 'email_gmail_diagnostics']
  const snapshot = async () => {
    await root(); const result = {}
    for (const table of untouchedTables) result[table] = (await q(`select to_jsonb(t) as row from ${table} t order by to_jsonb(t)::text`)).rows
    result.workspace_gmail_connections = (await q('select workspace_id,account_key,email,configured,sending_enabled,daily_budget,created_by,created_at,updated_at,delivery_pause_reason from workspace_gmail_connections order by workspace_id')).rows
    return result
  }
  const existingFunctions = () => q("select oid::regprocedure::text as signature,prosrc,proacl::text as acl from pg_proc where pronamespace='public'::regnamespace order by signature")
  const permissions = () => q("select c.relname,c.relacl::text as acl,c.relrowsecurity from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','S') order by c.relname")
  const settingsOnlyFor = (rows, ids) => Object.fromEntries(Object.entries(rows).map(([table, values]) => [table, values.filter(({ row }) => ids.includes(row.product_id))]))
  let before, originalFunctions, originalPermissions
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated,service_role; grant execute on function auth.uid() to authenticated,service_role;
      create table public.workspaces(id uuid primary key,owner_user_id uuid references auth.users);
      create table public.products(id uuid primary key,workspace_id uuid references public.workspaces,
        name text default 'Synthetic public app',description text default 'Synthetic description',audience text default 'Synthetic audience',product_url text,source_facts jsonb default '{}');
      create table public.workspace_members(workspace_id uuid,user_id uuid,role text,primary key(workspace_id,user_id));
      create function public.is_workspace_admin(w uuid) returns boolean language sql stable security definer as $$
        select exists(select 1 from public.workspaces where id=w and owner_user_id=auth.uid())
          or exists(select 1 from public.workspace_members where workspace_id=w and user_id=auth.uid() and role in ('admin','owner')) $$;
      create function public.get_workspace_role(w uuid) returns text language sql stable security definer as $$
        select case when exists(select 1 from public.workspaces where id=w and owner_user_id=auth.uid()) then 'owner'
          else coalesce((select role from public.workspace_members where workspace_id=w and user_id=auth.uid()),'none') end $$;
      -- Structure-only offline fixture for the existing worker's existence check;
      -- no credentials are populated, accessed or requested in these tests.
      create table public.workspace_openai_provider_credentials(workspace_id uuid primary key,encrypted_api_key jsonb);
    `)
    for (const id of [owner, admin, member, other]) await q('insert into auth.users values($1,$2)', [id, 'synthetic@example.test'])
    await q('insert into workspaces values($1,$2),($3,$4),($5,$2),($6,$2)', [w, owner, w2, other, emptyW, limitW])
    await q("insert into workspace_members values($1,$2,'admin'),($1,$3,'member'),($4,$3,'owner')", [w, admin, member, w2])
    await q('insert into products(id,workspace_id,product_url) select x,$2,$3 from unnest($1::uuid[]) x', [apps, w, link])
    await q('insert into products(id,workspace_id,product_url) values($1,$2,$5),($3,$4,$5)', [archived, w, foreign, w2, link])
    for (const migrationSql of prior) await db.exec(migrationSql)
    await as(admin)
    for (const product of apps) {
      await research(product, true, w, product === app ? 57 : 80, product === app ? 10 : 8,
        product === app ? 'Asia/Tokyo' : 'America/New_York', product === app ? 5 : 6, product === app ? 'Private custom query never returned' : '')
      await drafts(product, true, w, product === app ? 'Pacific/Honolulu' : 'America/New_York', product === app ? 11 : 7)
    }
    await research(archived); await drafts(archived)
    await as(other); await research(foreign, true, w2); await drafts(foreign, true, w2)
    await root(); await q('update products set source_facts=$2 where id=$1', [archived, { archived: true, privateKey: 'DO-NOT-RETURN' }])
    await q('update products set source_facts=$2 where id=$1', [app, { apiKey: 'DO-NOT-RETURN', appId: '123456789' }])
    const campaign = await scalar("insert into email_campaigns(workspace_id,product_id,sender_name,postal_address,ad_link,audience) values($1,$2,'Synthetic Sender','123 Synthetic Street',$3,'Consenting operators') returning id", [w, app, link])
    await scalar('insert into email_campaigns(workspace_id,product_id) values($1,$2) returning id', [w, apps[1]])
    await as(owner)
    const contact = await scalar("insert into email_contacts(workspace_id,product_id,email,status,consent_evidence) values($1,$2,'synthetic-recipient@example.test','opted_in',$3) returning id", [w, app, consent])
    const deliveryDraft = await scalar("insert into email_drafts(workspace_id,product_id,campaign_id,contact_id,subject,body,status) values($1,$2,$3,$4,'Private reviewed subject','Private reviewed body','approved') returning id", [w, app, campaign, contact])
    await root()
    const queue = await scalar("insert into email_send_queue(workspace_id,product_id,campaign_id,contact_id,draft_id,email,scheduled_day,status,claimed_at,claim_token) values($1,$2,$3,$4,$5,'synthetic-recipient@example.test',current_date-5,'unknown',now()-interval '5 days','30000000-0000-0000-0000-000000000001') returning id", [w, app, campaign, contact, deliveryDraft])
    await q('insert into email_gmail_accounts(account_key,sending_enabled) values($1,true)', [account])
    await q('insert into email_quota_reservations(queue_id,account_key) values($1,$2)', [queue, account])
    await q("insert into workspace_gmail_connections(workspace_id,account_key,email,configured,sending_enabled,created_by) values($1,$3,'synthetic-sender@example.test',false,true,$2),($4,$3,'synthetic-sender@example.test',false,false,$5)", [w, owner, account, w2, other])
    await q("insert into email_research_runs(workspace_id,product_id,settings_revision,settings_snapshot,scheduled_day,request_number,claim_token_hash,batch_limit,claimed_at,expires_at) select workspace_id,product_id,settings_revision,to_jsonb(s),(now() at time zone s.timezone)::date,1,repeat('b',64),10,now(),now()+interval '15 minutes' from email_research_settings s where workspace_id=$1 and product_id=$2", [w, app])
    await q("insert into email_daily_campaigns(workspace_id,product_id,scheduled_day,name,subject,body,app_store_url) select $1,$2,(now() at time zone timezone)::date,'Reusable draft','Private reusable subject',$3,$4 from email_daily_campaign_settings where workspace_id=$1 and product_id=$2", [w, app, `Private reusable draft ${link}`, link])
    before = await snapshot(); originalFunctions = (await existingFunctions()).rows; originalPermissions = (await permissions()).rows
    const settingsBeforeMigration = await settingsSnapshot()
    await db.exec(sql)

    await t.test('Migration never starts anything, alters old permissions/RPCs or changes existing rows', async () => {
      assert.deepEqual(await snapshot(), before)
      assert.deepEqual(await settingsSnapshot(), settingsBeforeMigration)
      assert.deepEqual((await permissions()).rows, originalPermissions)
      const oldNames = new Set(originalFunctions.map(x => x.signature))
      assert.deepEqual((await existingFunctions()).rows.filter(x => oldNames.has(x.signature)), originalFunctions)
      for (const fn of [getSignature, setSignature]) for (const role of ['anon', 'authenticated', 'service_role'])
        assert.equal(await scalar("select has_function_privilege($1,$2,'EXECUTE')", [role, fn]), role === 'authenticated')
      for (const role of ['anon', 'authenticated', 'service_role'])
        assert.equal(await scalar("select has_function_privilege($1,$2,'EXECUTE')", [role, privateSignature]), false)
    })

    await t.test('Member status has exact aggregate-only contract, complete primary 25 and no cross-app data', async () => {
      await as(member)
      const status = await get()
      assert.deepEqual(Object.keys(status).sort(), ['apps', 'reviewRevision', 'totals', 'truncated', 'workspace_id'])
      assert.equal(status.workspace_id, w); assert.match(status.reviewRevision, /^[a-f0-9]{32}$/)
      assert.equal(status.truncated, false); assert.equal(status.apps.length, 25)
      assert.deepEqual(status.apps.map(x => x.id), apps)
      assert.deepEqual(Object.keys(status.apps[0]).sort(), ['id','name','researchEnabled','draftsEnabled','researchTarget','researchRequestLimit',
        'researchTimezone','researchStartHour','draftTimezone','draftStartHour','todayDraftCreated','deliveryEnabled','senderDetailsComplete','optedInCount'].sort())
      assert.deepEqual(status.totals, { activeApps: 25, researchEnabled: 25, draftsEnabled: 25, todayDrafts: 1,
        deliveryEnabled: 0, optedInContacts: 1, researchRequestCeiling: 200 })
      assert.equal(status.apps[0].todayDraftCreated, true); assert.equal(status.apps[0].senderDetailsComplete, true)
      assert.equal(status.apps[1].senderDetailsComplete, false)
      assert.equal(status.apps[0].researchTarget, 57); assert.equal(status.apps[0].researchRequestLimit, 10)
      assert.equal(status.apps[0].researchTimezone, 'Asia/Tokyo'); assert.equal(status.apps[0].draftTimezone, 'Pacific/Honolulu')
      assert.doesNotMatch(JSON.stringify(status), /Private|DO-NOT-RETURN|recipient@|sender@|consent_evidence|claim_token|settings_snapshot|account_key|encrypted|postal_address|source_facts/)
    })

    await t.test('Authorization uses actual ownership, denies forged owner/member writes and rechecks revoked roles', async () => {
      const revision = (await get()).reviewRevision
      await assert.rejects(set(revision), /EMAIL_WORKSPACE_AUTOMATION_ADMIN_REQUIRED/)
      await assert.rejects(get(w2), /EMAIL_WORKSPACE_AUTOMATION_MEMBER_REQUIRED/)
      await assert.rejects(set(revision, true, true, w2), /EMAIL_WORKSPACE_AUTOMATION_ADMIN_REQUIRED/)
      await as(other); await assert.rejects(get(), /EMAIL_WORKSPACE_AUTOMATION_MEMBER_REQUIRED/)
      await assert.rejects(set(revision), /EMAIL_WORKSPACE_AUTOMATION_ADMIN_REQUIRED/)
      await as(''); await assert.rejects(get(), /EMAIL_WORKSPACE_AUTOMATION_MEMBER_REQUIRED/)
      await assert.rejects(set(revision), /EMAIL_WORKSPACE_AUTOMATION_ADMIN_REQUIRED/)
      for (const role of ['anon', 'service_role']) {
        await as(owner, role); await assert.rejects(get(), /permission denied/); await assert.rejects(set(revision), /permission denied/)
      }
      await root(); await q("update workspace_members set role='member' where workspace_id=$1 and user_id=$2", [w, admin])
      await as(admin); await assert.rejects(set(revision), /EMAIL_WORKSPACE_AUTOMATION_ADMIN_REQUIRED/)
      await root(); await q("update workspace_members set role='admin' where workspace_id=$1 and user_id=$2", [w, admin])
    })

    await t.test('All 25 already-on apps are truly idempotent with still-current different enabling admin', async () => {
      const old = await settingsSnapshot()
      await as(owner)
      const initial = await get()
      const started = await set(initial.reviewRevision)
      assert.deepEqual(Object.keys(started).sort(), ['applied','mode','researchChanged','draftsChanged','deliveryChanged','status'].sort())
      assert.equal(started.applied, true); assert.equal(started.mode, 'research_and_drafts')
      assert.equal(started.researchChanged, 0); assert.equal(started.draftsChanged, 0); assert.equal(started.deliveryChanged, 0)
      assert.deepEqual(started.status, initial)
      assert.deepEqual(await settingsSnapshot(), old)
      assert.deepEqual(await snapshot(), before)
    })

    await t.test('Malformed/stale tokens, explicit cost refusal and null mode cannot change any settings', async () => {
      const old = await settingsSnapshot(); await as(owner); const revision = (await get()).reviewRevision
      for (const token of [null, '', 'a'.repeat(31), 'a'.repeat(33), revision.toUpperCase(), 'a'.repeat(32), 'not-a-review'])
        assert.deepEqual(await set(token), failure('EMAIL_WORKSPACE_REVIEW_STALE'))
      for (const confirm of [false, null]) assert.deepEqual(await set(revision, true, confirm), failure('EMAIL_WORKSPACE_RESEARCH_CONFIRM_REQUIRED'))
      assert.deepEqual(await scalar('select set_email_workspace_automation($1,true,$2)', [w, revision]), failure('EMAIL_WORKSPACE_RESEARCH_CONFIRM_REQUIRED'))
      await assert.rejects(set(revision, null), /EMAIL_WORKSPACE_AUTOMATION_MODE_INVALID/)
      assert.deepEqual(await settingsSnapshot(), old)
    })

    await t.test('Pause preserves custom parameters, run/copy/delivery history and excludes archived/foreign apps', async () => {
      const old = await settingsSnapshot(); await as(owner)
      const paused = await freshSet(false)
      assert.equal(paused.researchChanged, 25); assert.equal(paused.draftsChanged, 25); assert.equal(paused.deliveryChanged, 0)
      assert.equal(paused.status.totals.researchEnabled, 0); assert.equal(paused.status.totals.draftsEnabled, 0)
      const after = await settingsSnapshot()
      assert.deepEqual(settingsOnlyFor(after, [archived, foreign]), settingsOnlyFor(old, [archived, foreign]))
      for (const [table, rows] of Object.entries(after)) for (const { row } of rows.filter(x => apps.includes(x.row.product_id))) {
        const priorRow = old[table].find(x => x.row.product_id === row.product_id).row
        assert.equal(row.enabled, false); assert.equal(row.enabled_by, null)
        if (table === 'email_research_settings') assert.equal(row.enabled_at, null)
        assert.notEqual(row.settings_revision, priorRow.settings_revision)
        const omit = r => Object.fromEntries(Object.entries(r).filter(([key]) => !['enabled','enabled_by','enabled_at','settings_revision','updated_at'].includes(key)))
        assert.deepEqual(omit(row), omit(priorRow))
      }
      await as(admin); const pausedAgain = await freshSet(false)
      assert.equal(pausedAgain.researchChanged, 0); assert.equal(pausedAgain.draftsChanged, 0)
      assert.deepEqual(await settingsSnapshot(), after)
      assert.deepEqual(await snapshot(), before)
      await as(owner); const started = await freshSet()
      assert.equal(started.researchChanged, 25); assert.equal(started.draftsChanged, 25)
      assert.equal(started.status.apps[0].researchTarget, 57); assert.equal(started.status.apps[0].researchRequestLimit, 10)
      assert.equal(started.status.apps[0].researchStartHour, 5); assert.equal(started.status.apps[0].draftStartHour, 11)
      const resumed = await settingsSnapshot()
      assert.equal(resumed.email_research_settings.find(x => x.row.product_id === app).row.query, 'Private custom query never returned')
      assert.deepEqual(await snapshot(), before)
    })

    await t.test('New app set makes review stale atomically; pause creates no missing rows; start uses defaults without listing filters', async () => {
      await as(owner); const revision = (await get()).reviewRevision
      await root(); await q("insert into products(id,workspace_id,name) values($1,$2,'Missing App Store link')", [newApp, w])
      const old = await settingsSnapshot(); await as(owner)
      assert.deepEqual(await set(revision), failure('EMAIL_WORKSPACE_REVIEW_STALE'))
      assert.deepEqual(await settingsSnapshot(), old)
      await as(owner); await freshSet(false)
      const paused = await settingsSnapshot()
      for (const rows of Object.values(paused)) assert.equal(rows.some(x => x.row.product_id === newApp), false)
      await as(owner); const missing = (await get()).apps.find(x => x.id === newApp)
      assert.deepEqual(missing, { id: newApp, name: 'Missing App Store link', researchEnabled: false, draftsEnabled: false,
        researchTarget: 80, researchRequestLimit: 8, researchTimezone: 'America/New_York', researchStartHour: 6,
        draftTimezone: 'America/New_York', draftStartHour: 7, todayDraftCreated: false, deliveryEnabled: false,
        senderDetailsComplete: false, optedInCount: 0 })
      const started = await freshSet()
      assert.equal(started.researchChanged, 26); assert.equal(started.draftsChanged, 26)
      const nowOn = started.status.apps.find(x => x.id === newApp)
      assert.equal(nowOn.researchEnabled, true); assert.equal(nowOn.draftsEnabled, true)
      assert.equal(nowOn.todayDraftCreated, false, 'Enabled settings are not a generation guarantee without valid official listings')
      assert.deepEqual(await snapshot(), before)
    })

    await t.test('Settings revisions/query/schedules, names, archive/removal and mailbox flags invalidate full reviews', async () => {
      await as(owner)
      for (const change of [() => research(), () => drafts(), () => research(app, true, w, 57, 10, 'UTC', 0, 'Changed hidden query')]) {
        const revision = (await get()).reviewRevision
        await change()
        assert.deepEqual(await set(revision), failure('EMAIL_WORKSPACE_REVIEW_STALE'))
      }
      for (const change of [
        () => q("update products set name='Renamed reviewed app' where id=$1", [newApp]),
        () => q("update products set source_facts='{" + '"archived":true' + "}' where id=$1", [newApp]),
        () => q("update products set source_facts='{}' where id=$1", [newApp]),
        () => q('update workspace_gmail_connections set sending_enabled=false where workspace_id=$1', [w]),
        () => q('update email_gmail_accounts set sending_enabled=false where account_key=$1', [account]),
      ]) {
        const revision = (await get()).reviewRevision
        await root(); await change(); await as(owner)
        assert.deepEqual(await set(revision), failure('EMAIL_WORKSPACE_REVIEW_STALE'))
      }
      await root(); await q('update workspace_gmail_connections set sending_enabled=true where workspace_id=$1', [w])
      await q('update email_gmail_accounts set sending_enabled=true where account_key=$1', [account])
      // Explicit mailbox fixture updates alter updated_at; establish a new immutable baseline.
      before = await snapshot()
    })

    await t.test('Contacts, daily copy creation/edit and unrelated product metadata do not invalidate research-only review', async () => {
      await as(owner); const revision = (await get()).reviewRevision
      await q("insert into email_contacts(workspace_id,product_id,email,status,consent_evidence) values($1,$2,'another-synthetic@example.test','opted_in',$3)", [w, app, consent])
      await root(); await q("insert into email_daily_campaigns(workspace_id,product_id,scheduled_day,name,subject,body,app_store_url) values($1,$2,current_date-1,'Unrelated historical draft','New private copy',$3,$4)", [w, app, `Another private copy ${link}`, link])
      await q("update email_daily_campaigns set subject='Edited private copy' where workspace_id=$1 and product_id=$2", [w, app])
      await q('update products set source_facts=$2 where id=$1', [app, { arbitraryMetadata: 'DO-NOT-RETURN', appId: '123456789' }])
      await as(owner)
      assert.equal((await get()).reviewRevision, revision)
      assert.equal((await get()).apps[0].optedInCount, 2)
      assert.equal((await set(revision)).applied, true)
      before = await snapshot()
    })

    await t.test('Revoked enabling actor changes token even without revision; reviewed replacement adopts current admin only', async () => {
      await as(admin); await research(); await drafts()
      const old = await settingsSnapshot(); await as(owner); const revision = (await get()).reviewRevision
      await root(); await q("update workspace_members set role='member' where workspace_id=$1 and user_id=$2", [w, admin])
      await as(owner); const revoked = await get()
      assert.notEqual(revoked.reviewRevision, revision)
      assert.deepEqual(await set(revision), failure('EMAIL_WORKSPACE_REVIEW_STALE'))
      assert.deepEqual(await settingsSnapshot(), old)
      await as(owner); const replaced = await freshSet()
      assert.equal(replaced.researchChanged, 1); assert.equal(replaced.draftsChanged, 1)
      const after = await settingsSnapshot()
      for (const [table, rows] of Object.entries(after)) {
        const row = rows.find(x => x.row.product_id === app).row
        assert.equal(row.enabled_by, owner); assert.notEqual(row.settings_revision, old[table].find(x => x.row.product_id === app).row.settings_revision)
      }
      assert.deepEqual(await snapshot(), before)
      await root(); await q("update workspace_members set role='admin' where workspace_id=$1 and user_id=$2", [w, admin])
    })

    await t.test('Changing actual ownership invalidates old-owner enabling actor and forged membership does not preserve it', async () => {
      await as(owner); const revision = (await get()).reviewRevision
      await root(); await q("insert into workspace_members values($1,$2,'owner')", [w, owner])
      await q('update workspaces set owner_user_id=$2 where id=$1', [w, other])
      await as(owner); await assert.rejects(get(), /EMAIL_WORKSPACE_AUTOMATION_MEMBER_REQUIRED/)
      await assert.rejects(set(revision), /EMAIL_WORKSPACE_AUTOMATION_ADMIN_REQUIRED/)
      await as(admin); assert.notEqual((await get()).reviewRevision, revision)
      assert.deepEqual(await set(revision), failure('EMAIL_WORKSPACE_REVIEW_STALE'))
      const replacement = await freshSet()
      assert.equal(replacement.researchChanged, 26); assert.equal(replacement.draftsChanged, 26)
      await root(); await q('delete from workspace_members where workspace_id=$1 and user_id=$2', [w, owner])
      await q('update workspaces set owner_user_id=$2 where id=$1', [w, owner])
    })

    await t.test('Empty workspace and exactly 200/201 active apps have complete bounded read and blocked partial bulk', async () => {
      await as(owner)
      const empty = await get(emptyW)
      assert.deepEqual(empty.apps, []); assert.equal(empty.truncated, false); assert.equal(empty.totals.activeApps, 0)
      assert.equal(empty.totals.researchRequestCeiling, 0)
      for (const mode of [true, false]) assert.deepEqual(await set(empty.reviewRevision, mode, mode, emptyW), failure('EMAIL_WORKSPACE_NO_APPS'))
      const limitApps = Array.from({ length: 200 }, (_, i) => uuid(i + 1000))
      await root(); await q('insert into products(id,workspace_id) select x,$2 from unnest($1::uuid[]) x', [limitApps, limitW])
      await as(owner)
      const complete = await get(limitW)
      assert.equal(complete.apps.length, 200); assert.equal(complete.truncated, false); assert.equal(complete.totals.activeApps, 200)
      const started = await freshSet(true, limitW)
      assert.equal(started.researchChanged, 200); assert.equal(started.draftsChanged, 200)
      assert.equal(started.status.totals.researchRequestCeiling, 200)
      const old = await settingsSnapshot(); await as(owner); const revision = (await get(limitW)).reviewRevision
      await root(); await q('insert into products(id,workspace_id) values($1,$2)', [uuid(1200), limitW])
      await as(owner); const over = await get(limitW)
      assert.equal(over.apps.length, 200); assert.equal(over.truncated, true); assert.equal(over.totals.activeApps, 201)
      assert.notEqual(over.reviewRevision, revision, 'Full-set token includes the hidden 201st app')
      for (const mode of [true, false]) assert.deepEqual(await set(over.reviewRevision, mode, mode, limitW), failure('EMAIL_WORKSPACE_AUTOMATION_LIMIT'))
      assert.deepEqual(await settingsSnapshot(), old)
      await root(); await q('delete from products where id=$1', [uuid(1200)])
    })

    await t.test('Workspace 200 paid-request cap and per-app limit10 remain exhausted across start/pause; quotas/runs are never reset', async () => {
      await root()
      await q('insert into workspace_openai_provider_credentials(workspace_id) values($1)', [limitW])
      await q("insert into email_research_runs(workspace_id,product_id,settings_revision,settings_snapshot,scheduled_day,request_number,claim_token_hash,batch_limit,claimed_at,expires_at) select s.workspace_id,s.product_id,s.settings_revision,to_jsonb(s),(now() at time zone s.timezone)::date,1,repeat('c',64),10,now(),now()+interval '15 minutes' from email_research_settings s where workspace_id=$1", [limitW])
      await as(owner); const runRowsBefore = (await scalar('select get_email_research_status($1,$2)', [limitW, uuid(1000)])).today
      assert.equal(runRowsBefore.workspace_requests_remaining, 0)
      await freshSet(false, limitW); await freshSet(true, limitW)
      const after = (await scalar('select get_email_research_status($1,$2)', [limitW, uuid(1000)])).today
      assert.equal(after.workspace_requests, 200); assert.equal(after.workspace_requests_remaining, 0)
      await as('', 'service_role'); assert.equal(await scalar('select email_claim_research_batch()'), null)
      await root(); await q('delete from workspace_openai_provider_credentials where workspace_id=$1', [limitW])
      before = await snapshot()
      // Existing custom limit 10 is not overwritten to 8 during a bulk start.
      await as(owner); const custom = (await get()).apps.find(x => x.id === app)
      assert.equal(custom.researchRequestLimit, 10)
      await freshSet(false); await freshSet()
      assert.equal((await get()).apps.find(x => x.id === app).researchRequestLimit, 10)
      assert.deepEqual(await snapshot(), before)
    })

    await t.test('Preserved per-app limit10 stays exhausted after bulk pause/start with its unchanged worker', async () => {
      const quotaApp = uuid(500)
      await root(); await q('insert into products(id,workspace_id) values($1,$2)', [quotaApp, emptyW])
      await as(owner); await research(quotaApp, true, emptyW, 100, 10, 'UTC', 0, 'Synthetic isolated quota app')
      await root(); await q('insert into workspace_openai_provider_credentials(workspace_id) values($1)', [emptyW])
      await q("insert into email_research_runs(workspace_id,product_id,settings_revision,settings_snapshot,scheduled_day,request_number,claim_token_hash,batch_limit,claimed_at,expires_at) select s.workspace_id,s.product_id,s.settings_revision,to_jsonb(s),current_date,n,repeat('d',64),10,now(),now()+interval '15 minutes' from email_research_settings s cross join generate_series(1,10) n where s.workspace_id=$1 and s.product_id=$2", [emptyW, quotaApp])
      const ledger = (await q('select to_jsonb(r) as row from email_research_runs r where workspace_id=$1 order by request_number', [emptyW])).rows
      await as(owner)
      const initial = await scalar('select get_email_research_status($1,$2)', [emptyW, quotaApp])
      assert.equal(initial.today.remainingRequests, 0); assert.equal(initial.today.workspace_requests_remaining, 190)
      await freshSet(false, emptyW); await freshSet(true, emptyW)
      const resumed = await scalar('select get_email_research_status($1,$2)', [emptyW, quotaApp])
      assert.equal(resumed.settings.daily_request_limit, 10); assert.equal(resumed.today.requests, 10)
      assert.equal(resumed.today.remainingRequests, 0); assert.equal(resumed.today.workspace_requests_remaining, 190)
      await as('', 'service_role'); assert.equal(await scalar('select email_claim_research_batch()'), null)
      await root()
      assert.deepEqual((await q('select to_jsonb(r) as row from email_research_runs r where workspace_id=$1 order by request_number', [emptyW])).rows, ledger)
      await q('delete from workspace_openai_provider_credentials where workspace_id=$1', [emptyW])
      before = await snapshot()
    })

    await t.test('Injected last-app draft write failure rolls back every research/draft change, including earlier apps', async () => {
      await as(owner); await freshSet(false)
      const old = await settingsSnapshot(); before = await snapshot()
      await db.exec(`create function synthetic_workspace_last_failure() returns trigger language plpgsql as $$ begin
        if new.product_id='${newApp}' and new.enabled then raise exception 'SYNTHETIC_LAST_APP_FAILURE'; end if; return new; end $$;
        create trigger z_synthetic_workspace_last_failure before update on email_daily_campaign_settings for each row execute function synthetic_workspace_last_failure();`)
      await as(owner); const revision = (await get()).reviewRevision
      await assert.rejects(set(revision), /SYNTHETIC_LAST_APP_FAILURE/)
      assert.deepEqual(await settingsSnapshot(), old); assert.deepEqual(await snapshot(), before)
      await db.close(); db = new PGlite(dir)
      assert.deepEqual(await settingsSnapshot(), old)
      await db.exec('drop trigger z_synthetic_workspace_last_failure on email_daily_campaign_settings; drop function synthetic_workspace_last_failure();')
      await as(owner); assert.equal((await freshSet()).researchChanged, 26)
      assert.deepEqual(await snapshot(), before)
    })

    await t.test('Per-app actions remain selected-app only and do not alter unrelated apps or delivery consent/history', async () => {
      const old = await settingsSnapshot(); await as(owner)
      await research(app, false); await drafts(app, false)
      const after = await settingsSnapshot()
      assert.deepEqual(settingsOnlyFor(after, [...apps.slice(1), archived, foreign, newApp]), settingsOnlyFor(old, [...apps.slice(1), archived, foreign, newApp]))
      assert.deepEqual(await snapshot(), before)
      assert.deepEqual((await permissions()).rows, originalPermissions)
      const oldNames = new Set(originalFunctions.map(x => x.signature))
      assert.deepEqual((await existingFunctions()).rows.filter(x => oldNames.has(x.signature)), originalFunctions)
    })
  } finally { await db.close(); await rm(dir, { recursive: true, force: true }) }
})
