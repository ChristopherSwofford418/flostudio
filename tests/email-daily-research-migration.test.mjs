import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const migration = name => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')
const sql = await migration('20261111_email_daily_research')
const prior = await Promise.all(['20260822_workspace_openai_provider_vault', '20261031_authenticated_openai_provider_vault_bridge',
  '20261109_email_campaigns', '20261109_email_no_repeat', '20261109_email_sender_preference',
  '20261109_email_status_metadata', '20261110_gmail_diagnostic', '20261111_email_lifecycle'].map(migration))

test('Research migration is additive, secret-scoped, fixed-code and candidate-only', () => {
  assert.match(sql, /begin;[\s\S]*commit;/)
  assert.doesNotMatch(sql, /\b(?:drop|truncate)\s|cron\.schedule|net\.http|http_post|vault\.decrypted|decryptProviderKey/i)
  assert.doesNotMatch(sql, /(?:insert into|update|delete from) public\.(?:email_campaigns|email_drafts|email_send_queue|email_quota_reservations|workspace_openai_provider_credentials|workspace_gmail_connections)\b/i)
  assert.doesNotMatch(sql, /(?:update|delete from) public\.email_contacts\b/i)
  assert.match(sql, /foreign key \(workspace_id, product_id\) references public\.products\(workspace_id, id\)/)
  assert.match(sql, /daily_target integer not null default 80/)
  assert.match(sql, /daily_request_limit integer not null default 8/)
  assert.match(sql, /timezone text not null default 'America\/New_York'/)
  assert.match(sql, /'email-research-global'/)
  assert.match(sql, /encode\(sha256\(convert_to\(v_token::text/)
  assert.match(sql, /on conflict \(workspace_id,product_id,email\) do nothing/)
  assert.equal((sql.match(/security definer/g) || []).length, (sql.match(/security definer set search_path = ''/g) || []).length)
  const cred = sql.slice(sql.indexOf('create function public.get_email_research_credential'), sql.indexOf('-- Structural evidence'))
  assert.match(cred, /workspace_openai_provider_credentials c[\s\S]*where c.workspace_id = v_run.workspace_id/)
  assert.match(cred, /credential_accessed_at is not null/)
  assert.doesNotMatch(cred, /p_workspace_id|key_last4|created_by/)
  const status = sql.slice(sql.indexOf('create function public.get_email_research_status'), sql.indexOf('-- New tables'))
  assert.doesNotMatch(status, /claim_token|encrypted|credential|settings_snapshot/)
  assert.doesNotMatch(sql, /grant\s+(?:select|insert|update|delete|all)[\s\S]*?on\s+(?:table\s+)?public\./i)
})

// Disposable offline PostgreSQL only. Never Supabase/provider services or real envelopes.
let PGlite
try { ({ PGlite } = await import('/tmp/email-db-validation/node_modules/@electric-sql/pglite/dist/index.js')) }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error }

test('Durable offline daily research: authorization, reservation, safe candidates and isolation', { skip: !PGlite }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'flostudio-email-research-'))
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
  const token = '30000000-0000-0000-0000-000000000001'
  const envelope = { version: 1, algorithm: 'aes-256-gcm', iv: 'synthetic-only', tag: 'synthetic-only', ciphertext: 'NOT-A-REAL-KEY' }
  const foreignEnvelope = { ...envelope, ciphertext: 'FOREIGN-SYNTHETIC-ENVELOPE' }
  const consent = { method: 'operator_recorded', reference: 'Synthetic explicit form consent', recorded_at: '2020-01-01T00:00:00Z' }
  const q = (text, values = []) => db.query(text, values)
  const scalar = async (text, values = []) => Object.values((await q(text, values)).rows[0])[0]
  const root = () => db.exec('reset role')
  const as = async (id, role = 'authenticated') => {
    await root(); await q("select set_config('request.jwt.claim.sub',$1,false)", [id]); await db.exec(`set role ${role}`)
  }
  const service = () => as('', 'service_role')
  const save = (product = app, enabled = true, target = 80, requests = 8, query = 'Synthetic professional services', timezone = 'UTC', hour = 0, workspace = w) =>
    scalar('select save_email_research_settings($1,$2,$3,$4,$5,$6,$7,$8)', [workspace, product, enabled, target, requests, timezone, hour, query])
  const status = (product = app, workspace = w) => scalar('select get_email_research_status($1,$2)', [workspace, product])
  const claim = (limit = 200) => scalar('select email_claim_research_batch($1)', [limit])
  const finish = (run, candidates = [], error = null, claimToken = run.claim_token) =>
    scalar('select email_finish_research_batch($1,$2,$3,$4)', [run.run_id, claimToken, candidates, error])
  const credential = (run, claimToken = run.claim_token) => q('select * from get_email_research_credential($1,$2)', [run.run_id, claimToken])
  // Domains ending .com are intentionally structural fixtures: no DNS/network lookup happens.
  const candidate = (domain = 'syntheticbusiness.com', role = 'hello', extra = {}) => ({
    email: `${role}@${domain}`, organization: `Synthetic ${domain}`, source_url: `https://${domain}/contact`,
    source_evidence: { kind: 'public_business_role_email', business_domain: domain, role,
      email_excerpt: `Public business contact: ${role}@${domain}`, business_excerpt: 'Synthetic business offers professional services.' }, ...extra,
  })
  const legacyTables = ['email_campaigns', 'email_contacts', 'email_drafts', 'email_send_queue', 'email_quota_reservations',
    'workspace_openai_provider_credentials', 'workspace_gmail_connections', 'email_suppressions']
  const snapshot = async (tables = legacyTables) => {
    await root(); const result = {}
    for (const table of tables) result[table] = (await q(`select to_jsonb(t) as row from public.${table} t order by to_jsonb(t)::text`)).rows
    return result
  }
  const immutableRpcs = async () => (await q("select oid::regprocedure::text as signature,prosrc,proacl::text as acl from pg_proc where pronamespace='public'::regnamespace and (proname like '%workspace_openai%' or proname in ('email_claim_send','email_finish_send','email_prepare_queue','email_activate_campaign','email_campaign_readiness')) order by signature")).rows
  let first, second, stale, campaign, campaign2, campaignForeign
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.role() returns text language sql stable as $$ select current_setting('role',true) $$;
      grant usage on schema auth to authenticated,service_role;
      grant execute on function auth.uid(),auth.role() to authenticated,service_role;
      create table public.workspaces(id uuid primary key,owner_user_id uuid references auth.users);
      create table public.products(id uuid primary key,workspace_id uuid references public.workspaces,
        name text default 'Synthetic app',description text default 'Synthetic app facts',audience text default 'Business operators',source_facts jsonb default '{}');
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
    await q('insert into products(id,workspace_id) values($1,$2),($3,$2),($4,$5)', [app, w, app2, foreignApp, w2])
    await q("insert into workspace_members values($1,$2,'admin'),($1,$3,'member')", [w, admin, member])
    for (const migrationSql of prior) await db.exec(migrationSql)
    for (const [workspace, product] of [[w, app], [w, app2], [w2, foreignApp]]) {
      const id = await scalar('insert into email_campaigns(workspace_id,product_id) values($1,$2) returning id', [workspace, product])
      if (product === app) campaign = id
      if (product === app2) campaign2 = id
      if (product === foreignApp) campaignForeign = id
    }
    await q('insert into workspace_openai_provider_credentials(workspace_id,encrypted_api_key,key_last4,created_by) values($1,$2,$3,$4),($5,$6,$3,$7)', [w, envelope, 'FAKE', owner, w2, foreignEnvelope, other])
    await q('insert into email_contacts(workspace_id,product_id,email,organization) values($1,$2,$3,$4)', [w, app, 'info@existingbusiness.com', 'Preserve this existing contact'])
    const before = await snapshot(); const rpcBefore = await immutableRpcs()
    await db.exec(sql)

    await t.test('Migration preserves all records/approvals/vault functions and defaults research disabled', async () => {
      assert.deepEqual(await snapshot(), before)
      assert.deepEqual(await immutableRpcs(), rpcBefore)
      await as(member)
      const empty = await status()
      assert.equal(empty.settings.enabled, false)
      assert.equal(empty.settings.daily_target, 80)
      assert.equal(empty.settings.daily_request_limit, 8)
      assert.equal(empty.settings.timezone, 'America/New_York')
      assert.equal(empty.settings.start_hour, 6)
      assert.deepEqual(empty.recentRuns, [])
      assert.equal(empty.today.requests, 0)
      await service(); assert.equal(await claim(), null)
    })

    await t.test('ACLs allow human status/settings and service claims only, never table writes or secret access', async () => {
      await root()
      for (const fn of ['save_email_research_settings(uuid,uuid,boolean,integer,integer,text,integer,text)', 'get_email_research_status(uuid,uuid)']) {
        for (const role of ['anon', 'service_role']) assert.equal(await scalar("select has_function_privilege($1,$2,'EXECUTE')", [role, `public.${fn}`]), false)
        assert.equal(await scalar("select has_function_privilege('authenticated',$1,'EXECUTE')", [`public.${fn}`]), true)
      }
      for (const fn of ['email_claim_research_batch(integer)', 'get_email_research_credential(uuid,uuid)', 'email_finish_research_batch(uuid,uuid,jsonb,text)']) {
        for (const role of ['anon', 'authenticated']) assert.equal(await scalar("select has_function_privilege($1,$2,'EXECUTE')", [role, `public.${fn}`]), false)
        assert.equal(await scalar("select has_function_privilege('service_role',$1,'EXECUTE')", [`public.${fn}`]), true)
      }
      for (const fn of ['email_research_admin(uuid,uuid)', 'email_research_lock_scope(uuid,uuid,uuid)', 'email_research_settings_guard()', 'email_research_run_guard()', 'email_research_candidate(jsonb)']) {
        for (const role of ['anon', 'authenticated', 'service_role']) assert.equal(await scalar("select has_function_privilege($1,$2,'EXECUTE')", [role, `public.${fn}`]), false)
      }
      for (const table of ['email_research_settings', 'email_research_runs']) {
        assert.equal(await scalar('select relrowsecurity from pg_class where oid=$1::regclass', [`public.${table}`]), true)
        for (const role of ['anon', 'authenticated', 'service_role']) for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
          assert.equal(await scalar('select has_table_privilege($1,$2,$3)', [role, `public.${table}`, privilege]), false)
        }
      }
      await as(member); await assert.rejects(save(), /EMAIL_RESEARCH_ADMIN_REQUIRED/)
      await assert.rejects(claim(), /permission denied/)
      await assert.rejects(q('select * from get_email_research_credential($1,$2)', [app, token]), /permission denied/)
      await assert.rejects(q('insert into email_research_settings(workspace_id,product_id) values($1,$2)', [w, app]), /permission denied/)
      await as(other); await assert.rejects(status(), /EMAIL_RESEARCH_MEMBER_REQUIRED/)
      await assert.rejects(save(), /EMAIL_RESEARCH_ADMIN_REQUIRED/)
      await as(''); await assert.rejects(status(), /EMAIL_RESEARCH_MEMBER_REQUIRED/)
      await assert.rejects(save(), /EMAIL_RESEARCH_ADMIN_REQUIRED/)
      await service(); await assert.rejects(status(), /permission denied/)
    })

    await t.test('Admin save validates product scope, explicit values, timezone, query bounds and archive state', async () => {
      await as(owner)
      await assert.rejects(save(foreignApp), /EMAIL_RESEARCH_PRODUCT_NOT_FOUND/)
      await assert.rejects(status(foreignApp), /EMAIL_RESEARCH_PRODUCT_NOT_FOUND/)
      for (const args of [[app, true, 0], [app, true, 101], [app, true, 80, 0], [app, true, 80, 11],
        [app, true, 80, 8, 'x'.repeat(501)], [app, true, 80, 8, '', 'not-a-timezone'],
        [app, true, 80, 8, '', 'UTC', -1], [app, true, 80, 8, '', 'UTC', 24]]) {
        await assert.rejects(save(...args), /EMAIL_RESEARCH_SETTINGS_INVALID/)
      }
      await assert.rejects(save(app, null), /EMAIL_RESEARCH_SETTINGS_INVALID/)
      await root(); await q('update products set source_facts=$2 where id=$1', [app2, { archived: true }])
      await as(admin); await assert.rejects(save(app2), /EMAIL_RESEARCH_APP_UNAVAILABLE/)
      const disabled = await save(app2, false)
      assert.equal(disabled.enabled_by, null); assert.equal(disabled.enabled_at, null)
      await root(); await q("update products set source_facts='{}' where id=$1", [app2])
      await as(admin)
      const settings = await save(app)
      assert.equal(settings.enabled_by, admin); assert.ok(settings.enabled_at)
      assert.match(settings.settings_revision, /^[0-9a-f-]{36}$/)
      await root(); await q('update products set source_facts=$2 where id=$1', [app, { ascPrivateKey: 'NEVER-RETURN-THIS', api_key: 'NEVER-RETURN-THIS', category: 'business' }])
      await service()
      first = await claim()
      assert.equal(first.product_id, app); assert.equal(first.request_number, 1)
      assert.equal(first.target_remaining, 80); assert.equal(first.batch_limit, 10)
      assert.equal(first.allowed, true)
      assert.deepEqual(Object.keys(first).sort(), ['allowed', 'run_id', 'claim_token', 'workspace_id', 'product_id', 'target_remaining', 'batch_limit', 'query', 'timezone', 'scheduled_day', 'request_number', 'product'].sort())
      assert.deepEqual(Object.keys(first.product).sort(), ['id', 'name', 'description', 'audience'].sort())
      assert.doesNotMatch(JSON.stringify(first), /NEVER-RETURN-THIS|encrypted|key_last4|ciphertext|source_facts/)
      second = await claim()
      assert.equal(second.request_number, 2)
      assert.equal(second.target_remaining, 70)
      await as(member)
      const current = await status()
      assert.equal(current.today.requests, 2); assert.equal(current.today.reserved, 20)
      assert.doesNotMatch(JSON.stringify(current), /claim_token|ciphertext|encrypted|NEVER-RETURN-THIS/)
    })

    await t.test('Credential scope/token ACL and one-shot marker survive durable close/reopen; zero/failed calls consume ordinals', async () => {
      await service()
      assert.deepEqual((await credential(first, token)).rows, [])
      assert.deepEqual((await q('select * from get_email_research_credential($1,$2)', [foreignApp, first.claim_token])).rows, [])
      assert.deepEqual((await credential(first)).rows, [{ encrypted_api_key: envelope }])
      assert.deepEqual((await credential(first)).rows, [])
      await root()
      assert.equal(await scalar('select claim_token_hash <> $2::text from email_research_runs where id=$1', [first.run_id, first.claim_token]), true)
      await db.close(); db = new PGlite(dir)
      await service(); assert.deepEqual((await credential(first)).rows, [])
      assert.equal((await finish(first, [], null, token)).code, 'EMAIL_RESEARCH_CLAIM_INVALID')
      const completed = await finish(first)
      assert.equal(completed.completed, true); assert.equal(completed.inserted_count, 0)
      assert.equal((await finish(first)).code, 'EMAIL_RESEARCH_CLAIM_INVALID')
      assert.deepEqual((await credential(first)).rows, [])
      const failed = await finish(second, [], 'SQL/network error sk-secret-arbitrary')
      assert.equal(failed.code, 'EMAIL_RESEARCH_PROVIDER_FAILED')
      assert.equal(failed.completed, false)
      assert.equal((await finish(second)).code, 'EMAIL_RESEARCH_CLAIM_INVALID')
      await as(member)
      const current = await status()
      assert.equal(current.today.requests, 2); assert.equal(current.today.remainingRequests, 6)
      assert.equal(current.today.reserved, 0); assert.equal(current.today.remainingTarget, 80)
      assert.equal(current.today.failed, 1)
      assert.equal(current.today.errors, 1)
      assert.doesNotMatch(JSON.stringify(current), /sk-secret|SQL\/network/)
    })

    await t.test('Verified business candidates normalize/dedupe, preserve opt-in/opt-out/prior contacts and all send history', async () => {
      await as(owner)
      const optIn = await scalar('insert into email_contacts(workspace_id,product_id,email) values($1,$2,$3) returning id', [w, app, 'sales@optinbusiness.com'])
      await q("update email_contacts set status='opted_in',consent_evidence=$2 where id=$1", [optIn, consent])
      await q("insert into email_contacts(workspace_id,product_id,email,status) values($1,$2,$3,'unsubscribed')", [w, app, 'office@optoutbusiness.com'])
      await q('insert into email_suppressions(workspace_id,email) values($1,$2)', [w, 'hello@suppressedbusiness.com'])
      await root()
      const priorContact = await scalar('insert into email_contacts(workspace_id,product_id,email) values($1,$2,$3) returning id', [w, app2, 'support@priorbusiness.com'])
      const draft = await scalar('insert into email_drafts(workspace_id,product_id,campaign_id,contact_id) values($1,$2,$3,$4) returning id', [w, app2, campaign2, priorContact])
      await q(`insert into email_send_queue(workspace_id,product_id,campaign_id,contact_id,draft_id,email,scheduled_day,status,claim_token,claimed_at)
        values($1,$2,$3,$4,$5,$6,current_date,'failed',$7,now()-interval '10 years')`, [w, app2, campaign2, priorContact, draft, 'support@priorbusiness.com', token])
      const before = await snapshot()
      await service(); const run = await claim()
      const fresh = candidate('freshbusiness.com')
      const normalized = { ...fresh, email: ' HELLO@FRESHBUSINESS.COM ', source_url: 'https://www.freshbusiness.com:443/contact',
        consent_evidence: { method: 'provider-claimed-opt-in' }, status: 'opted_in', workspace_id: w2, product_id: foreignApp,
        source_evidence: { ...fresh.source_evidence, business_domain: ' FRESHBUSINESS.COM ', role: ' HELLO ', token: 'DO-NOT-STORE-THIS' } }
      const result = await finish(run, [normalized, fresh, candidate('existingbusiness.com', 'info'), candidate('optinbusiness.com', 'sales'),
        candidate('optoutbusiness.com', 'office'), candidate('suppressedbusiness.com'), candidate('priorbusiness.com', 'support'),
        candidate('gmail.com'), candidate('individualbusiness.com', 'jane'), candidate('wrongsourcebusiness.com', 'hello', { source_url: 'https://directory.com/contact' })])
      assert.deepEqual(result, { allowed: true, completed: true, code: 'EMAIL_RESEARCH_COMPLETED', verified_count: 6, inserted_count: 1, skipped_count: 9 })
      const after = await snapshot()
      for (const table of legacyTables.filter(name => name !== 'email_contacts')) assert.deepEqual(after[table], before[table], table)
      const inserted = after.email_contacts.filter(({ row }) => row.email === fresh.email)
      assert.equal(inserted.length, 1)
      const newRow = inserted[0].row
      assert.equal(newRow.workspace_id, w); assert.equal(newRow.product_id, app); assert.equal(newRow.status, 'candidate')
      assert.deepEqual(newRow.consent_evidence, {}); assert.equal(newRow.consent_recorded_by, null); assert.equal(newRow.consent_recorded_at, null)
      assert.equal(newRow.source_evidence.research_run_id, run.run_id)
      assert.equal(newRow.source_evidence.scheduled_day, run.scheduled_day)
      assert.ok(newRow.source_evidence.researched_at); assert.ok(newRow.source_evidence.settings_revision)
      assert.doesNotMatch(JSON.stringify(newRow), /DO-NOT-STORE-THIS|provider-claimed/)
      assert.deepEqual(after.email_contacts.filter(({ row }) => row.id !== newRow.id), before.email_contacts)
      await service(); const duplicate = await claim()
      assert.deepEqual(await finish(duplicate, [fresh]), { allowed: true, completed: true, code: 'EMAIL_RESEARCH_COMPLETED', verified_count: 1, inserted_count: 0, skipped_count: 1 })
    })

    await t.test('Strict role/HTTPS/source evidence rejects unsafe or unverified rows; bad payload is atomic', async () => {
      await service(); const run = await claim()
      const unsafe = [candidate('unsafecompany.com', 'hello', { source_url: 'http://unsafecompany.com/contact' }),
        candidate('unsafecompany.com', 'hello', { source_url: 'https://user:pass@unsafecompany.com/contact' }),
        candidate('unsafecompany.com', 'hello', { source_url: 'https://127.0.0.1/contact' }),
        candidate('unsafecompany.com', 'hello', { source_url: 'https://unsafecompany.com:444/contact' }),
        candidate('unsafecompany.local'), candidate('unsafecompany.com', 'hello', { organization: '' }),
        candidate('unsafecompany.com', 'hello', { source_evidence: { kind: 'opted_in' } }),
        candidate('unsafecompany.com', 'hello', { source_evidence: { ...candidate().source_evidence, email_excerpt: 'No email on this page' } }),
        null, { email: 'hello@unsafecompany.com', source_url: 'https://unsafecompany.com/contact' }]
      const result = await finish(run, unsafe)
      assert.equal(result.verified_count, 0); assert.equal(result.inserted_count, 0); assert.equal(result.skipped_count, 10)
      const bad = await claim()
      const priorContacts = await snapshot(['email_contacts'])
      await service()
      assert.equal((await finish(bad, [...Array(11)].map((_, i) => candidate(`synthetic${i}company.com`)))).code, 'EMAIL_RESEARCH_INVALID_RESPONSE')
      assert.deepEqual(await snapshot(['email_contacts']), priorContacts)
      await service(); const notArray = await claim()
      assert.equal((await finish(notArray, { candidates: [] })).code, 'EMAIL_RESEARCH_INVALID_RESPONSE')
    })

    await t.test('Settings revisions do not reset daily requests; expired/stale claims and removed admins cannot access/finish', async () => {
      await as(owner)
      const budget = await status()
      assert.equal(budget.today.requests, 7)
      await save(app, true, 80, 10)
      await service(); stale = await claim()
      assert.equal(stale.request_number, 8)
      await as(owner); await save(app, true, 80, 10, 'A revised explicit niche')
      await service(); assert.deepEqual((await credential(stale)).rows, [])
      assert.equal((await finish(stale, [candidate('stalebusiness.com')])).code, 'EMAIL_RESEARCH_SETTINGS_STALE')
      const disabled = await claim()
      await as(owner); await save(app, false, 80, 10)
      await service(); assert.deepEqual((await credential(disabled)).rows, [])
      assert.equal((await finish(disabled, [candidate('disabledbusiness.com')])).code, 'EMAIL_RESEARCH_SETTINGS_STALE')
      assert.equal(await claim(), null)
      await as(admin); await save(app, true, 80, 10)
      await service(); const removed = await claim(); assert.equal(removed.request_number, 10)
      await root(); await q("update workspace_members set role='member' where workspace_id=$1 and user_id=$2", [w, admin])
      await service(); assert.deepEqual((await credential(removed)).rows, [])
      assert.equal((await finish(removed, [candidate('removedbusiness.com')])).code, 'EMAIL_RESEARCH_SETTINGS_STALE')
      assert.equal(await claim(), null)
      await root(); await q("update workspace_members set role='admin' where workspace_id=$1 and user_id=$2", [w, admin])
      await as(owner); await save(app, true, 100, 10)
      await service(); assert.equal(await claim(), null, 'Request cap remains exhausted across revisions')
      await as(member)
      const acrossRevisions = await status()
      assert.equal(acrossRevisions.today.requests, 10)
      assert.equal(acrossRevisions.today.errors, 6)
    })

    await t.test('Local start hour, configured credentials, archival and foreign-workspace query/credential separation', async () => {
      await as(owner); await save(app, false, 100, 10)
      await save(app2, true, 80, 8)
      await root(); await q('update products set source_facts=$2 where id=$1', [app2, { archived: true }])
      await service(); assert.equal(await claim(), null)
      await root(); await q("update products set source_facts='{}' where id=$1", [app2])
      // Pick a timezone whose current local hour is before 23 for a deterministic start gate.
      const zone = await scalar("select name from pg_timezone_names where name in ('UTC','Pacific/Honolulu','Asia/Tokyo') and extract(hour from now() at time zone name)<23 order by name limit 1")
      await as(owner); await save(app2, true, 80, 8, 'Scoped app two query', zone, 23)
      await service(); assert.equal(await claim(), null)
      await as(owner); await save(app2, true, 80, 8, 'Scoped app two query')
      await root(); const savedEnvelope = await scalar('delete from workspace_openai_provider_credentials where workspace_id=$1 returning encrypted_api_key', [w])
      await service(); assert.equal(await claim(), null)
      await root(); await q('insert into workspace_openai_provider_credentials(workspace_id,encrypted_api_key,key_last4,created_by) values($1,$2,$3,$4)', [w, savedEnvelope, 'FAKE', owner])
      await as(other); await save(foreignApp, true, 80, 8, 'FOREIGN-WORKSPACE-QUERY', 'UTC', 0, w2)
      await service(); const a = await claim(); const b = await claim()
      assert.equal(a.product_id, app2); assert.equal(b.product_id, foreignApp)
      assert.equal(a.query, 'Scoped app two query'); assert.equal(b.query, 'FOREIGN-WORKSPACE-QUERY')
      assert.deepEqual((await credential(a)).rows, [{ encrypted_api_key: envelope }])
      assert.deepEqual((await credential(b)).rows, [{ encrypted_api_key: foreignEnvelope }])
      assert.deepEqual((await credential(a, b.claim_token)).rows, [])
      assert.equal((await finish(a, [], null, b.claim_token)).code, 'EMAIL_RESEARCH_CLAIM_INVALID')
      await root(); await q('update products set source_facts=$2 where id=$1', [app2, { archived: true }])
      await service(); assert.equal((await finish(a, [candidate('archivedbusiness.com')])).code, 'EMAIL_RESEARCH_SETTINGS_STALE')
      assert.equal((await finish(b)).completed, true)
      await as(member)
      const scoped = await status(app2)
      assert.doesNotMatch(JSON.stringify(scoped), /FOREIGN-WORKSPACE-QUERY|FOREIGN-SYNTHETIC/)
      await assert.rejects(status(foreignApp, w2), /EMAIL_RESEARCH_MEMBER_REQUIRED/)
      await as(other); await save(foreignApp, false, 80, 8, 'FOREIGN-WORKSPACE-QUERY', 'UTC', 0, w2)
      await root(); await q("update products set source_facts='{}' where id=$1", [app2])
    })

    await t.test('Expired reservations stay durable and consume request budget; stale runs cannot be reopened or deleted', async () => {
      await root()
      const expiredId = await scalar(`insert into email_research_runs(workspace_id,product_id,settings_revision,settings_snapshot,scheduled_day,request_number,
        claim_token_hash,batch_limit,claimed_at,expires_at)
        select workspace_id,product_id,settings_revision,to_jsonb(s),(now() at time zone s.timezone)::date,2,
          encode(sha256(convert_to($3::text,'UTF8')),'hex'),10,now()-interval '16 minutes',now()-interval '1 minute'
          from email_research_settings s where workspace_id=$1 and product_id=$2 returning id`, [w, app2, token])
      const expired = { run_id: expiredId, claim_token: token }
      await service(); assert.deepEqual((await credential(expired)).rows, [])
      assert.equal((await finish(expired, [candidate('expiredcompany.com')])).code, 'EMAIL_RESEARCH_EXPIRED')
      assert.equal((await finish(expired)).code, 'EMAIL_RESEARCH_CLAIM_INVALID')
      const next = await claim(); assert.equal(next.product_id, app2); assert.equal(next.request_number, 3)
      await finish(next)
      await root()
      for (const text of ["update email_research_runs set state='claimed',finished_at=null,error_code=null where id=$1",
        'update email_research_runs set product_id=$2 where id=$1', 'delete from email_research_runs where id=$1']) {
        await assert.rejects(q(text, text.includes('$2') ? [expiredId, app] : [expiredId]), /EMAIL_RESEARCH_HISTORY_IMMUTABLE/)
      }
      await as(member)
      assert.equal((await status(app2)).today.errors, 2, 'One archived failed claim plus one persisted expired reservation')
      await root()
      await assert.rejects(q('update email_research_settings set query=$3 where workspace_id=$1 and product_id=$2', [w, app2, 'bypass revision']), /EMAIL_RESEARCH_SETTINGS_INVALID/)
      await assert.rejects(q('insert into email_research_settings(workspace_id,product_id) values($1,$2)', [w, foreignApp]), /foreign key constraint/)
    })

    await t.test('Rollback creates no durable reservation; fair concurrent one-app claims respect lower workspace cap', async () => {
      await as(owner); await save(app2, true, 80, 8)
      await root(); const before = await scalar('select count(*)::int from email_research_runs')
      await service(); await db.exec('begin'); const transient = await claim(); assert.ok(transient); await db.exec('rollback')
      await root(); assert.equal(await scalar('select count(*)::int from email_research_runs'), before)
      await service(); assert.deepEqual((await credential(transient)).rows, [])
      assert.equal((await finish(transient)).code, 'EMAIL_RESEARCH_CLAIM_INVALID')
      await root(); const used = await scalar("select count(*)::int from email_research_runs where workspace_id=$1 and claimed_at > now()-interval '24 hours'", [w])
      await service(); const claims = await Promise.all(Array.from({ length: 6 }, () => claim(used + 2)))
      const reserved = claims.filter(Boolean)
      assert.equal(reserved.length, 2)
      assert.equal(new Set(reserved.map(r => r.run_id)).size, 2)
      assert.equal(new Set(reserved.map(r => r.request_number)).size, 2)
      for (const run of reserved) await finish(run)
      assert.equal(await claim(used + 2), null)
      await assert.rejects(claim(201), /EMAIL_RESEARCH_LIMIT_INVALID/)
      await assert.rejects(claim(0), /EMAIL_RESEARCH_LIMIT_INVALID/)
    })

    await t.test('Live target slots prevent overshoot; actual inserts meet target; timezone edits cannot reset paid calls', async () => {
      await as(owner); await save(app2, false, 80, 8)
      const targetApp = '20000000-0000-0000-0000-000000000004'
      await root(); await q('insert into products(id,workspace_id) values($1,$2)', [targetApp, w2])
      await as(other); await save(targetApp, true, 13, 2, '', 'UTC', 0, w2)
      await service()
      const [ten, three, none] = await Promise.all([claim(), claim(), claim()])
      assert.equal(ten.product_id, targetApp); assert.equal(ten.batch_limit, 10); assert.equal(ten.query, '')
      assert.equal(three.batch_limit, 3); assert.equal(three.target_remaining, 3); assert.equal(none, null)
      const tenCandidates = Array.from({ length: 10 }, (_, i) => candidate(`target${i}business.com`))
      assert.equal((await finish(ten, tenCandidates)).inserted_count, 10)
      assert.equal((await finish(three, Array.from({ length: 3 }, (_, i) => candidate(`smalltarget${i}business.com`)))).inserted_count, 3)
      assert.equal(await claim(), null)
      await as(other)
      const done = await status(targetApp, w2)
      assert.equal(done.today.inserted, 13); assert.equal(done.today.remainingTarget, 0); assert.equal(done.today.remainingRequests, 0)
      await root()
      const nextDayZone = await scalar("select name from pg_timezone_names where (now() at time zone name)::date <> (now() at time zone 'UTC')::date order by name limit 1")
      assert.ok(nextDayZone)
      await as(other); await save(targetApp, true, 20, 2, '', nextDayZone, 0, w2)
      await service(); assert.equal(await claim(), null, 'Different local date does not reopen rolling app requests')
      await as(other)
      const changedDay = await status(targetApp, w2)
      assert.equal(changedDay.today.requests, 0)
      assert.equal(changedDay.today.remainingRequests, 0)
      assert.equal(changedDay.today.remainingTarget, 7)
      await save(targetApp, false, 20, 2, '', nextDayZone, 0, w2)
      await as(owner); await save(app2, true, 80, 8)
    })

    await t.test('Insertion error rolls back every new candidate and terminal transition without freeing the request', async () => {
      await service(); const run = await claim(); assert.equal(run.product_id, app2)
      await root()
      await db.exec(`create function public.synthetic_research_insert_failure() returns trigger language plpgsql as $$
        begin if new.email='hello@rollbacksecondbusiness.com' then raise exception 'SYNTHETIC_INSERT_FAILURE'; end if; return new; end $$;
        create trigger synthetic_research_insert_failure before insert on public.email_contacts
          for each row execute function public.synthetic_research_insert_failure();`)
      await service()
      await assert.rejects(finish(run, [candidate('rollbackfirstbusiness.com'), candidate('rollbacksecondbusiness.com')]), /SYNTHETIC_INSERT_FAILURE/)
      await root()
      assert.equal(await scalar("select count(*)::int from email_contacts where email in ('hello@rollbackfirstbusiness.com','hello@rollbacksecondbusiness.com')"), 0)
      assert.deepEqual((await q('select state,inserted_count,verified_count from email_research_runs where id=$1', [run.run_id])).rows[0], { state: 'claimed', inserted_count: 0, verified_count: 0 })
      await db.exec('drop trigger synthetic_research_insert_failure on public.email_contacts; drop function public.synthetic_research_insert_failure();')
      await service()
      assert.equal((await finish(run, [], 'EMAIL_RESEARCH_PROVIDER_FAILED')).completed, false)
      await as(member); assert.equal((await status(app2)).today.requests, 6)
    })

    await t.test('Global serialized reservations enforce hard 200/day across many eligible apps and rotate claim order', async () => {
      await as(owner); await save(app2, false, 80, 8)
      const products = []
      await root()
      for (let i = 10; i < 32; i++) {
        const product = `20000000-0000-0000-0000-${String(i).padStart(12, '0')}`
        products.push(product)
        await q('insert into products(id,workspace_id) values($1,$2)', [product, w])
        await as(owner); await save(product, true, 100, 10, `App-specific synthetic query ${i}`)
        await root()
      }
      const used = await scalar("select count(*)::int from email_research_runs where workspace_id=$1 and claimed_at > now()-interval '24 hours'", [w])
      await service()
      const round = await Promise.all(products.map(() => claim()))
      assert.equal(new Set(round.map(r => r.product_id)).size, products.length, 'Each never-claimed app gets one slot before a second')
      for (const run of round) await finish(run)
      let extra = 0
      for (;;) {
        const batch = await Promise.all(Array.from({ length: 12 }, () => claim()))
        const runs = batch.filter(Boolean)
        if (!runs.length) break
        extra += runs.length
        for (const run of runs) await finish(run, [], 'EMAIL_RESEARCH_PROVIDER_UNAVAILABLE')
      }
      assert.equal(used + round.length + extra, 200)
      assert.equal(await claim(), null)
      await root()
      assert.equal(await scalar("select count(*)::int from email_research_runs where workspace_id=$1 and claimed_at > now()-interval '24 hours'", [w]), 200)
      await as(member)
      const scoped = await status(products[0])
      assert.equal(scoped.today.workspace_requests_remaining, 0)
      assert.ok(scoped.recentRuns.length <= 20)
      assert.doesNotMatch(JSON.stringify(scoped), /claim_token|encrypted|ciphertext/)
    })
  } finally {
    await db.close(); await rm(dir, { recursive: true, force: true })
  }
})
