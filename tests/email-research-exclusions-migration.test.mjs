import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const migration = name => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')
const sql = await migration('20261111_email_research_exclusions')
const original = await migration('20261111_email_daily_research')
const prior = await Promise.all(['20261109_email_campaigns', '20261109_email_no_repeat', '20261109_email_sender_preference',
  '20261109_email_status_metadata', '20261110_gmail_diagnostic', '20261111_email_lifecycle',
  '20261111_email_daily_campaigns', '20261111_email_daily_research', '20261111_email_workspace_automation'].map(migration))
const originalClaim = original.slice(original.indexOf('create function public.email_claim_research_batch('), original.indexOf('-- Only this RPC touches'))
const replacementClaim = sql.slice(sql.indexOf('create or replace function public.email_claim_research_batch('), sql.indexOf('-- No new RPC'))
const exclusionRead = sql.slice(sql.indexOf('    -- BEGIN EXCLUSION READ'), sql.indexOf('    -- END EXCLUSION READ') + '    -- END EXCLUSION READ\n'.length)
const claimSignature = 'public.email_claim_research_batch(integer)'

// These tests run even without the optional disposable engine. No network is used.
test('Only the existing claim is replaced; its original lock/quota/revision/authorization logic is byte-for-byte preserved', () => {
  const stripped = replacementClaim.replace('create or replace function', 'create function')
    .replace('  v_exclude_emails jsonb;\n', '').replace(exclusionRead, '')
    .replace(",'exclude_emails',v_exclude_emails", '')
  assert.equal(stripped.trim(), originalClaim.trim())
  assert.equal((sql.match(/create (?:or replace )?function /g) || []).length, 1)
  assert.match(sql, /begin;[\s\S]*commit;/)
  assert.match(sql, /revoke all on function public\.email_claim_research_batch\(integer\) from public, anon, authenticated, service_role;/)
  assert.match(sql, /grant execute on function public\.email_claim_research_batch\(integer\) to service_role;/)
  assert.doesNotMatch(sql, /\b(?:drop|truncate)\s|alter table|create policy|cron\.|net\.|http_post|vault\.|decryptProviderKey/i)
  assert.doesNotMatch(exclusionRead, /\b(?:insert|update|delete|for share|for update)\b/i)
  assert.match(exclusionRead, /c\.workspace_id = v_run\.workspace_id and c\.product_id = v_run\.product_id/)
  assert.match(exclusionRead, /public\.email_research_candidate\(jsonb_build_object/)
  assert.match(exclusionRead, /order by c\.created_at desc,c\.id desc\s+limit 100/)
  assert.doesNotMatch(exclusionRead, /encrypted|claim_token|consent|email_suppressions|email_send_queue|workspace_openai_provider_credentials/)
  assert.doesNotMatch(sql, /grant\s+(?:select|insert|update|delete|all)[\s\S]*?on\s+(?:table\s+)?public\./i)
})

let PGlite
try { ({ PGlite } = await import('@electric-sql/pglite')) }
catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error
  try { ({ PGlite } = await import('/tmp/email-db-validation/node_modules/@electric-sql/pglite/dist/index.js')) }
  catch (fallback) { if (fallback.code !== 'ERR_MODULE_NOT_FOUND') throw fallback }
}

// Structure-only synthetic credential presence, never any key/envelope retrieval.
test('Disposable PGlite: exact-app safe exclusions, unchanged interface/budgets/history/consent and service-only execution', { skip: !PGlite }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'flostudio-email-exclusions-'))
  let db = new PGlite(dir)
  const owner = '00000000-0000-0000-0000-000000000001'
  const admin = '00000000-0000-0000-0000-000000000002'
  const member = '00000000-0000-0000-0000-000000000003'
  const other = '00000000-0000-0000-0000-000000000004'
  const w = '10000000-0000-0000-0000-000000000001'
  const w2 = '10000000-0000-0000-0000-000000000002'
  const uuid = n => `20000000-0000-0000-0000-${String(n).padStart(12, '0')}`
  const apps = Array.from({ length: 25 }, (_, i) => uuid(i + 1))
  const app = apps[0], app2 = apps[1], foreignApp = uuid(26)
  const token = '30000000-0000-0000-0000-000000000001'
  const consent = { method: 'operator_recorded', reference: 'Synthetic explicit form consent', recorded_at: '2020-01-01T00:00:00Z' }
  const q = (text, values = []) => db.query(text, values)
  const scalar = async (text, values = []) => Object.values((await q(text, values)).rows[0])[0]
  const root = () => db.exec('reset role')
  const as = async (id = '', role = 'service_role') => {
    await root(); await q("select set_config('request.jwt.claim.sub',$1,false)", [id]); await db.exec(`set role ${role}`)
  }
  const claim = () => scalar('select email_claim_research_batch()')
  const finish = (run, candidates = []) => scalar('select email_finish_research_batch($1,$2,$3)', [run.run_id, run.claim_token, candidates])
  const candidate = (domain = 'syntheticbusiness.com', role = 'hello', extra = {}) => ({
    email: `${role}@${domain}`, organization: `Synthetic ${domain}`, source_url: `https://${domain}/contact`,
    source_evidence: { kind: 'public_business_role_email', business_domain: domain, role,
      email_excerpt: `Synthetic public business contact: ${role}@${domain}`, business_excerpt: 'Synthetic organization provides business services.' }, ...extra,
  })
  const tables = ['auth.users', 'workspaces', 'workspace_members', 'products', 'email_research_settings', 'email_research_runs',
    'email_contacts', 'email_campaigns', 'email_drafts', 'email_send_queue', 'email_quota_reservations', 'email_suppressions',
    'email_daily_campaign_settings', 'email_daily_campaigns', 'workspace_email_preferences', 'email_gmail_accounts',
    'workspace_gmail_connections', 'email_cron_runs', 'email_gmail_diagnostics', 'email_oauth_states',
    'email_unsubscribe_tokens', 'workspace_openai_provider_credentials']
  const snapshot = async (selected = tables) => {
    await root(); const result = {}
    for (const table of selected) result[table] = (await q(`select to_jsonb(t) as row from ${table} t order by to_jsonb(t)::text`)).rows
    return result
  }
  const functions = async () => (await q("select oid::regprocedure::text as signature,prosrc,proacl::text as acl from pg_proc where pronamespace='public'::regnamespace order by signature")).rows
  const permissions = async () => (await q("select relname,relacl::text as acl,relrowsecurity from pg_class where relnamespace='public'::regnamespace and relkind in ('r','S') order by relname")).rows
  const transaction = async fn => {
    await root(); await db.exec('begin')
    try { await fn() } finally { await db.exec('rollback'); await root() }
  }
  const historicRun = async (workspace, product, dayOffset = 3, request = 1, inserted = 10, state = 'completed') => {
    await root()
    return (await q(`insert into email_research_runs(workspace_id,product_id,settings_revision,settings_snapshot,scheduled_day,request_number,
      claim_token_hash,batch_limit,claimed_at,expires_at,state,finished_at,verified_count,inserted_count,error_code)
      select workspace_id,product_id,settings_revision,to_jsonb(s),(now()-$3*interval '1 day')::date,$4,
        repeat('a',64),10,now()-$3*interval '1 day',now()-$3*interval '1 day'+interval '15 minutes',$6,
        now()-$3*interval '1 day'+interval '1 minute',case when $6='completed' then $5 else 0 end,
        case when $6='completed' then $5 else 0 end,case when $6='failed' then 'EMAIL_RESEARCH_PROVIDER_FAILED' end
      from email_research_settings s where workspace_id=$1 and product_id=$2
      returning id,jsonb_build_object('research_run_id',id,'settings_revision',settings_revision,
        'scheduled_day',scheduled_day,'researched_at',finished_at) as provenance`, [workspace, product, dayOffset, request, inserted, state])).rows[0]
  }
  const provenance = run => run.provenance
  const addContact = async (row, run, workspace = w, product = app, extraEvidence = {}, age = 1, status = 'candidate') => {
    await root()
    return scalar(`insert into email_contacts(workspace_id,product_id,email,organization,source_url,source_evidence,created_at,status,consent_evidence)
      values($1,$2,$3,$4,$5,$6,now()-$7*interval '1 minute',$8,$9) returning id`,
    [workspace, product, row.email, row.organization, row.source_url,
      { ...row.source_evidence, ...(run ? provenance(run) : {}), ...extraEvidence }, age, status, status === 'opted_in' ? consent : {}])
  }
  let history, scopedHistory, foreignHistory, before, functionsBefore, permissionsBefore, oldClaim
  const invalidEmails = []
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated,service_role; grant execute on function auth.uid() to authenticated,service_role;
      create table public.workspaces(id uuid primary key,owner_user_id uuid references auth.users);
      create table public.products(id uuid primary key,workspace_id uuid references public.workspaces,
        name text default 'Synthetic app',description text default 'Synthetic description',audience text default 'Synthetic business audience',
        product_url text,source_facts jsonb default '{}');
      create table public.workspace_members(workspace_id uuid,user_id uuid,role text,primary key(workspace_id,user_id));
      create function public.is_workspace_admin(w uuid) returns boolean language sql stable security definer as $$
        select exists(select 1 from public.workspaces where id=w and owner_user_id=auth.uid())
          or exists(select 1 from public.workspace_members where workspace_id=w and user_id=auth.uid() and role='admin') $$;
      create function public.get_workspace_role(w uuid) returns text language sql stable security definer as $$
        select case when exists(select 1 from public.workspaces where id=w and owner_user_id=auth.uid()) then 'owner'
          else coalesce((select role from public.workspace_members where workspace_id=w and user_id=auth.uid()),'none') end $$;
      create table public.workspace_openai_provider_credentials(workspace_id uuid primary key,encrypted_api_key jsonb);
    `)
    for (const id of [owner, admin, member, other]) await q('insert into auth.users values($1,$2)', [id, 'synthetic@example.test'])
    await q('insert into workspaces values($1,$2),($3,$4)', [w, owner, w2, other])
    await q("insert into workspace_members values($1,$2,'admin'),($1,$3,'member')", [w, admin, member])
    await q('insert into products(id,workspace_id) select x,$2 from unnest($1::uuid[]) x', [apps, w])
    await q('insert into products(id,workspace_id) values($1,$2)', [foreignApp, w2])
    for (const migrationSql of prior) await db.exec(migrationSql)
    await q('insert into workspace_openai_provider_credentials(workspace_id) values($1),($2)', [w, w2])
    for (const product of apps) {
      await as(owner, 'authenticated')
      await scalar("select save_email_research_settings($1,$2,true,80,8,'UTC',0,'Synthetic business research')", [w, product])
      await root()
      await q('insert into email_campaigns(workspace_id,product_id) values($1,$2)', [w, product])
    }
    await as(other, 'authenticated')
    await scalar("select save_email_research_settings($1,$2,false,80,8,'UTC',0,'Synthetic foreign scope')", [w2, foreignApp])
    // 110 qualifying rows, with deterministic recency; all fixtures are offline synthetic.
    for (let batch = 0; batch < 11; batch++) {
      history = await historicRun(w, app, 3 + Math.floor(batch / 8), batch % 8 + 1)
      for (let j = 0; j < 10; j++) {
        const i = batch * 10 + j
        await addContact(candidate(`synthetic${i}business.com`), history, w, app, {}, 300 - i)
      }
    }
    // Invalid records are newer than all safe rows, proving filtering precedes LIMIT.
    const unsafe = [candidate('personalbusiness.com', 'jane'), candidate('gmail.com'), candidate('yahoo.com', 'info'),
      candidate('private.internal'), candidate('wrongsourcebusiness.com', 'hello', { source_url: 'https://unrelatedbusiness.com/contact' }),
      candidate('plainhttpbusiness.com', 'hello', { source_url: 'http://plainhttpbusiness.com/contact' }),
      candidate('userinfo-business.com', 'hello', { source_url: 'https://user:pass@userinfo-business.com/contact' }),
      candidate('portbusiness.com', 'hello', { source_url: 'https://portbusiness.com:444/contact' }),
      candidate('emptyorganization.com', 'hello', { organization: '' }),
      candidate('noobservedbusiness.com', 'hello', { source_evidence: { ...candidate().source_evidence, business_domain: 'noobservedbusiness.com', email_excerpt: 'No observed email on page.' } }),
      candidate('wrongkindbusiness.com', 'hello', { source_evidence: { ...candidate('wrongkindbusiness.com').source_evidence, kind: 'private_import' } }),
      candidate('personbusiness.com', 'jane.doe'), candidate('consumerbusiness.com', 'jane+private')]
    for (const row of unsafe) { await addContact(row, history); invalidEmails.push(row.email) }
    for (const [domain, extra] of [
      ['wrongrolebusiness.com', { role: 'sales' }], ['wrongdomainbusiness.com', { business_domain: 'otherbusiness.com' }],
      ['badprovenancebusiness.com', { research_run_id: 'malformed-no-cast' }],
      ['wrongrevisionbusiness.com', { settings_revision: token }], ['wrongdaybusiness.com', { scheduled_day: '1900-01-01' }],
      ['wrongtimebusiness.com', { researched_at: 'malformed-no-cast' }], ['missingtimebusiness.com', { researched_at: null }],
    ]) { const row = candidate(domain); await addContact(row, history, w, app, extra); invalidEmails.push(row.email) }
    const imported = candidate('importedbusiness.com')
    await addContact(imported, null); invalidEmails.push(imported.email)
    const unsubscribedImport = candidate('unsubscribedimportbusiness.com')
    await addContact(unsubscribedImport, null, w, app, {}, 1, 'unsubscribed'); invalidEmails.push(unsubscribedImport.email)
    const failedHistory = await historicRun(w, app, 5, 1, 0, 'failed')
    const failedContact = candidate('failedprovenancebusiness.com')
    await addContact(failedContact, failedHistory); invalidEmails.push(failedContact.email)
    const zeroHistory = await historicRun(w, app, 5, 2, 0)
    const zeroContact = candidate('zeroprovenancebusiness.com')
    await addContact(zeroContact, zeroHistory); invalidEmails.push(zeroContact.email)
    scopedHistory = await historicRun(w, app2)
    foreignHistory = await historicRun(w2, foreignApp)
    await addContact(candidate('otherappbusiness.com'), scopedHistory, w, app2)
    await addContact(candidate('foreignworkspacebusiness.com'), foreignHistory, w2, foreignApp)
    const forged = candidate('forgedscopebusiness.com')
    await addContact(forged, scopedHistory); invalidEmails.push(forged.email)
    const forgedForeign = candidate('forgedforeignbusiness.com')
    await addContact(forgedForeign, foreignHistory); invalidEmails.push(forgedForeign.email)
    // Mark all other apps as more recently claimed to make the exact test app first.
    for (const product of apps.slice(1)) await historicRun(w, product, 7)
    await transaction(async () => { await as(); oldClaim = await claim(); assert.equal(oldClaim.product_id, app) })
    before = await snapshot(); functionsBefore = await functions(); permissionsBefore = await permissions()
    await db.exec(sql)

    await t.test('Applying/reapplying migration changes no rows, budgets, enabled all25, revisions, actors, consent, credentials or existing other RPCs/ACLs', async () => {
      assert.deepEqual(await snapshot(), before)
      assert.deepEqual(await permissions(), permissionsBefore)
      const excludeClaim = rows => rows.filter(row => row.signature !== 'email_claim_research_batch(integer)')
      assert.deepEqual(excludeClaim(await functions()), excludeClaim(functionsBefore))
      assert.equal(await scalar('select count(*)::integer from email_research_settings where workspace_id=$1 and enabled and daily_target=80 and daily_request_limit=8', [w]), 25)
      await db.exec(sql)
      assert.deepEqual(await snapshot(), before)
      await db.close(); db = new PGlite(dir)
      assert.deepEqual(await snapshot(), before)
    })

    await t.test('Old integer/default interface, claim fields and reservation calculations are unchanged except additive exclusions', async () => transaction(async () => {
      await as(); const run = await claim()
      const { exclude_emails, ...compatible } = run
      const stable = row => { const { run_id, claim_token, ...result } = row; return result }
      assert.deepEqual(stable(compatible), stable(oldClaim))
      assert.equal(run.allowed, true); assert.equal(run.target_remaining, 80); assert.equal(run.batch_limit, 10)
      assert.equal(run.request_number, 1)
      assert.equal(exclude_emails.length, 100)
      assert.deepEqual(exclude_emails, Array.from({ length: 100 }, (_, i) => `hello@synthetic${109 - i}business.com`))
      assert.equal(new Set(exclude_emails).size, 100)
      assert.ok(exclude_emails.every(email => !invalidEmails.includes(email)))
      assert.doesNotMatch(JSON.stringify(exclude_emails), /jane|gmail|yahoo|otherapp|foreign|import|token|evidence|revision/)
      await root()
      assert.equal(await scalar("select pg_get_function_arguments($1::regprocedure)", [claimSignature]), 'p_workspace_limit integer DEFAULT 200')
      assert.equal(await scalar("select pg_get_function_result($1::regprocedure)", [claimSignature]), 'jsonb')
      const after = await snapshot(tables.filter(table => table !== 'email_research_runs'))
      const beforeWithoutRuns = { ...before }; delete beforeWithoutRuns.email_research_runs
      assert.deepEqual(after, beforeWithoutRuns)
      const oldRuns = (await snapshot(['email_research_runs'])).email_research_runs.filter(({ row }) => row.id !== run.run_id)
      assert.deepEqual(oldRuns, before.email_research_runs)
    }))

    await t.test('Exclusions are exact workspace AND product; empty apps have an empty array; no client/status field is added', async () => transaction(async () => {
      await as(); const a = await claim(); const b = await claim(); const empty = await claim()
      assert.equal(a.product_id, app); assert.equal(b.product_id, app2); assert.equal(empty.product_id, apps[2])
      assert.deepEqual(b.exclude_emails, ['hello@otherappbusiness.com'])
      assert.deepEqual(empty.exclude_emails, [])
      await as(member, 'authenticated')
      const status = await scalar('select get_email_research_status($1,$2)', [w, app])
      assert.doesNotMatch(JSON.stringify(status), /exclude_emails|synthetic109business|claim_token|research_run_id/)
    }))

    await t.test('Real offline finish provenance qualifies; dedup/suppression and opt-in/opt-out histories remain unchanged', async () => transaction(async () => {
      await as(); const run = await claim()
      const fresh = candidate('freshsyntheticbusiness.com')
      const duplicate = candidate('synthetic109business.com')
      const suppressed = candidate('suppressedsyntheticbusiness.com')
      await root(); await q('insert into email_suppressions(workspace_id,email) values($1,$2)', [w, suppressed.email])
      const beforeFinish = await snapshot(tables.filter(table => !['email_contacts', 'email_research_runs'].includes(table)))
      await as()
      assert.deepEqual(await finish(run, [fresh, duplicate, suppressed]), {
        allowed: true, completed: true, code: 'EMAIL_RESEARCH_COMPLETED', verified_count: 3, inserted_count: 1, skipped_count: 2,
      })
      assert.deepEqual(await snapshot(tables.filter(table => !['email_contacts', 'email_research_runs'].includes(table))), beforeFinish)
      await root()
      const inserted = (await q('select status,consent_evidence,consent_recorded_by,consent_recorded_at,source_evidence from email_contacts where workspace_id=$1 and product_id=$2 and email=$3', [w, app, fresh.email])).rows[0]
      assert.equal(inserted.status, 'candidate'); assert.deepEqual(inserted.consent_evidence, {})
      assert.equal(inserted.consent_recorded_by, null); assert.equal(inserted.consent_recorded_at, null)
      assert.equal(inserted.source_evidence.research_run_id, run.run_id)
      // Roll back only subsequent reservations while retaining completed fixture within outer transaction.
      await db.exec('savepoint subsequent_claims'); await as()
      let next
      for (let i = 0; i < 25; i++) { next = await claim(); if (next?.product_id === app) break }
      assert.equal(next.product_id, app)
      assert.equal(next.exclude_emails[0], fresh.email)
      assert.equal(next.exclude_emails.length, 100)
      assert.ok(!next.exclude_emails.includes(suppressed.email))
      await root(); await db.exec('rollback to savepoint subsequent_claims')
      const opted = await addContact(candidate('optedpublicbusiness.com'), history)
      await as(owner, 'authenticated')
      await q("update email_contacts set status='opted_in',consent_evidence=$2 where id=$1", [opted, consent])
      const optedOut = await addContact(candidate('optoutpublicbusiness.com'), history, w, app, {}, 1, 'unsubscribed')
      const contactsBefore = await snapshot(['email_contacts', 'email_suppressions'])
      await as()
      for (let i = 0; i < 25; i++) { next = await claim(); if (next?.product_id === app) break }
      assert.ok(next.exclude_emails.includes('hello@optedpublicbusiness.com'))
      assert.ok(next.exclude_emails.includes('hello@optoutpublicbusiness.com'))
      assert.deepEqual(await snapshot(['email_contacts', 'email_suppressions']), contactsBefore)
      assert.ok(optedOut)
    }))

    await t.test('Service-only ACL survives replacement; PUBLIC/anon/authenticated cannot execute and helper/table grants are unchanged', async () => {
      await root()
      assert.equal(await scalar("select count(*)::integer from pg_proc p, lateral aclexplode(p.proacl) a where p.oid=$1::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE'", [claimSignature]), 0)
      for (const role of ['anon', 'authenticated']) {
        assert.equal(await scalar("select has_function_privilege($1,$2,'EXECUTE')", [role, claimSignature]), false)
        await as(role === 'authenticated' ? owner : '', role)
        await assert.rejects(claim(), /permission denied/)
        await root()
      }
      assert.equal(await scalar("select has_function_privilege('service_role',$1,'EXECUTE')", [claimSignature]), true)
      for (const role of ['anon', 'authenticated', 'service_role']) {
        assert.equal(await scalar("select has_function_privilege($1,'public.email_research_candidate(jsonb)','EXECUTE')", [role]), false)
      }
      assert.deepEqual(await permissions(), permissionsBefore)
      await as()
      await assert.rejects(scalar('select email_claim_research_batch($1)', [null]), /EMAIL_RESEARCH_LIMIT_INVALID/)
      await assert.rejects(scalar('select email_claim_research_batch(201)'), /EMAIL_RESEARCH_LIMIT_INVALID/)
    })

    await t.test('100 email hint never alters request cap, live target reservations or 24h/UTC workspace cap', async () => transaction(async () => {
      await as()
      const claims = []
      for (let round = 0; round < 8; round++) for (let i = 0; i < 25; i++) claims.push(await claim())
      assert.equal(claims.filter(Boolean).length, 200)
      assert.equal(new Set(claims.map(run => run.run_id)).size, 200)
      for (const product of apps) {
        const rows = claims.filter(run => run.product_id === product)
        assert.deepEqual(rows.map(run => run.request_number), [1, 2, 3, 4, 5, 6, 7, 8])
        assert.deepEqual(rows.map(run => run.target_remaining), [80, 70, 60, 50, 40, 30, 20, 10])
      }
      assert.equal(await claim(), null)
      await root()
      const settingsBefore = await snapshot(['email_research_settings'])
      await as(owner, 'authenticated')
      const budget = await scalar('select get_email_research_status($1,$2)', [w, app])
      assert.equal(budget.today.requests, 8); assert.equal(budget.today.reserved, 80)
      assert.equal(budget.today.remainingRequests, 0); assert.equal(budget.today.workspace_requests_remaining, 0)
      assert.deepEqual(await snapshot(['email_research_settings']), settingsBefore)
    }))

    await t.test('Claim eligibility still checks current enabling actor and archival before any exclusions', async () => transaction(async () => {
      await root(); await q('update products set source_facts=$2 where id=$1', [app, { archived: true }])
      await as(); assert.equal((await claim()).product_id, app2)
      await root(); await q("update products set source_facts='{}' where id=$1", [app])
      await as(admin, 'authenticated')
      await scalar("select save_email_research_settings($1,$2,true,80,8,'UTC',0,'Synthetic admin research')", [w, app])
      await root(); await q("update workspace_members set role='member' where workspace_id=$1 and user_id=$2", [w, admin])
      await as(); assert.notEqual((await claim()).product_id, app)
      await root()
      assert.deepEqual((await snapshot(['email_contacts'])).email_contacts, before.email_contacts)
    }))
    assert.deepEqual(await snapshot(), before, 'Every behavioral subtest rolls back synthetic runtime mutations')
  } finally {
    await db.close(); await rm(dir, { recursive: true, force: true })
  }
})
