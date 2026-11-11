import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const migration = name => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')
const sql = await migration('20261111_email_lifecycle')
const prior = await Promise.all(['20261109_email_campaigns', '20261109_email_no_repeat', '20261109_email_sender_preference', '20261109_email_status_metadata', '20261110_gmail_diagnostic'].map(migration))

test('Lifecycle migration is additive, fixed-code and grants functions only; it does not run activation or change history', () => {
  assert.match(sql, /begin;[\s\S]*commit;/)
  assert.doesNotMatch(sql, /\b(?:drop|truncate)\s|cron\.schedule|net\.http|http_post|vault\.decrypted|encrypted_credentials|refresh_token|access_token/i)
  assert.doesNotMatch(sql, /grant\s+(?:select|insert|update|delete|all)[\s\S]*?on\s+(?:table\s+)?public\./i)
  assert.equal((sql.match(/add column delivery_pause_reason text/g) || []).length, 2)
  assert.match(sql, /'provider_rejected','submission_unknown','reconnect_required'/)
  assert.match(sql, /encode\(sha256\(convert_to/)
  assert.doesNotMatch(sql, /(?:insert into|update|delete from) public\.(?:email_send_queue|email_quota_reservations|email_gmail_diagnostics)\b/i)
  assert.equal((sql.match(/security definer/g) || []).length, (sql.match(/security definer set search_path = ''/g) || []).length)
  assert.match(sql, /current_user <> pg_get_userbyid/)
  assert.match(sql, /Transactional campaign review required/)
  const activation = sql.slice(sql.indexOf('create function public.email_activate_campaign'), sql.indexOf('-- Existing authenticated UPDATE'))
  assert.ok(activation.indexOf("p_review_revision is distinct from v_ready->>'reviewRevision'") < activation.indexOf('update public.email_campaigns'))
  assert.ok(activation.indexOf("(v_ready->>'allowed')::boolean") < activation.indexOf('update public.email_campaigns'))
})

// Offline disposable PostgreSQL only; never Supabase, Gmail or stored credentials.
let PGlite
try { ({ PGlite } = await import('/tmp/email-db-validation/node_modules/@electric-sql/pglite/dist/index.js')) }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error }

test('Durable PostgreSQL lifecycle: authorization, full-set review, atomic launch and mailbox-wide pause', { skip: !PGlite }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'flostudio-email-lifecycle-'))
  let db = new PGlite(dir)
  const owner = '00000000-0000-0000-0000-000000000001'
  const admin = '00000000-0000-0000-0000-000000000002'
  const member = '00000000-0000-0000-0000-000000000003'
  const other = '00000000-0000-0000-0000-000000000004'
  const w = '10000000-0000-0000-0000-000000000001'
  const w2 = '10000000-0000-0000-0000-000000000002'
  const app = '20000000-0000-0000-0000-000000000001'
  const app2 = '20000000-0000-0000-0000-000000000002'
  const app3 = '20000000-0000-0000-0000-000000000003'
  const account = 'a'.repeat(64)
  const account2 = 'b'.repeat(64)
  const sender = 'sender@example.test'
  const envelope = { version: 1, algorithm: 'aes-256-gcm', iv: 'synthetic-iv', tag: 'synthetic-tag', ciphertext: 'synthetic-ciphertext' }
  const consent = { method: 'operator_recorded', reference: 'Synthetic form opt-in 2020 for this app', recorded_at: '2020-01-01T00:00:00Z' }
  const q = (text, values = []) => db.query(text, values)
  const scalar = async (text, values = []) => Object.values((await q(text, values)).rows[0])[0]
  const root = () => db.exec('reset role')
  const as = async (id, role = 'authenticated') => {
    await root()
    await q("select set_config('request.jwt.claim.sub',$1,false)", [id])
    await db.exec(`set role ${role}`)
  }
  const service = () => as('', 'service_role')
  const ready = (product = app, workspace = w) => scalar('select email_campaign_readiness($1,$2)', [workspace, product])
  const activate = (revision, campaign = c, product = app, workspace = w) => scalar('select email_activate_campaign($1,$2,$3,$4)', [workspace, product, campaign, revision])
  const snapshot = async () => {
    await root()
    const result = {}
    for (const table of ['email_campaigns', 'email_contacts', 'email_drafts', 'workspace_gmail_connections', 'email_gmail_accounts', 'email_send_queue', 'email_quota_reservations', 'email_gmail_diagnostics']) {
      result[table] = (await q(`select to_jsonb(t) as row from public.${table} t order by to_jsonb(t)::text`)).rows
    }
    return result
  }
  const fixture = async (email, product = app, campaign = c, workspace = w) => {
    const id = await scalar('insert into email_contacts(workspace_id,product_id,email) values($1,$2,$3) returning id', [workspace, product, email])
    await q("update email_contacts set status='opted_in',consent_evidence=$2 where id=$1", [id, consent])
    const draft = await scalar("insert into email_drafts(workspace_id,product_id,campaign_id,contact_id,subject,body,status) values($1,$2,$3,$4,$5,$6,'approved') returning id", [workspace, product, campaign, id, `Reviewed ${email}`, `Reviewed truthful synthetic app body ${email}`])
    return { id, draft, email }
  }
  let c, c2, c3, first
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated,service_role;
      grant execute on function auth.uid() to authenticated,service_role;
      create table public.workspaces(id uuid primary key,owner_user_id uuid references auth.users);
      create table public.products(id uuid primary key,workspace_id uuid references public.workspaces,source_facts jsonb default '{}');
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
    await q('insert into products(id,workspace_id) values($1,$2),($3,$2),($4,$5)', [app, w, app2, app3, w2])
    await q("insert into workspace_members values($1,$2,'admin'),($1,$3,'member')", [w, admin, member])
    for (const migrationSql of prior) await db.exec(migrationSql)
    for (const [workspace, product] of [[w, app], [w, app2], [w2, app3]]) {
      const id = await scalar("insert into email_campaigns(workspace_id,product_id,send_hour,sender_name,postal_address,ad_link,audience,language) values($1,$2,0,'Truthful Sender','123 Synthetic Street','https://example.test/app','Consenting adults','English') returning id", [workspace, product])
      if (product === app) c = id
      if (product === app2) c2 = id
      if (product === app3) c3 = id
    }
    await q('insert into email_gmail_accounts(account_key) values($1),($2)', [account, account2])
    for (const [workspace, user] of [[w, owner], [w2, other]]) {
      await q('insert into workspace_gmail_connections(workspace_id,account_key,email,configured,encrypted_credentials,created_by) values($1,$2,$3,true,$4,$5)', [workspace, account, sender, envelope, user])
      await q('insert into workspace_email_preferences(workspace_id,expected_sender_email) values($1,$2)', [workspace, sender])
    }
    const beforeSql = await snapshot()
    const priorRpcs = (await q("select oid::regprocedure::text as signature,prosrc,proacl::text as acl from pg_proc where pronamespace='public'::regnamespace and proname in ('email_prepare_queue','email_claim_send','email_finish_send','email_claim_daily_run','email_reserve_diagnostic') order by proname")).rows
    await db.exec(sql)

    await t.test('Migration leaves existing flags/history/RPCs unchanged and safely defaults pause columns', async () => {
      const afterSql = await snapshot()
      for (const table of ['workspace_gmail_connections', 'email_gmail_accounts']) {
        for (const { row } of afterSql[table]) { assert.equal(row.delivery_pause_reason, null); delete row.delivery_pause_reason }
      }
      assert.deepEqual(afterSql, beforeSql)
      assert.deepEqual((await q("select oid::regprocedure::text as signature,prosrc,proacl::text as acl from pg_proc where pronamespace='public'::regnamespace and proname in ('email_prepare_queue','email_claim_send','email_finish_send','email_claim_daily_run','email_reserve_diagnostic') order by proname")).rows, priorRpcs)
      for (const table of ['workspace_gmail_connections', 'email_gmail_accounts']) {
        await assert.rejects(q(`update ${table} set delivery_pause_reason='SMTP arbitrary detail'`), /check constraint/)
      }
    })

    await t.test('ACLs: member-only metadata, admin-only activation, service-only pause, no secret grants', async () => {
      await root()
      for (const fn of ['email_connection_status(uuid)', 'email_campaign_readiness(uuid,uuid)', 'email_activate_campaign(uuid,uuid,uuid,text)']) {
        for (const role of ['anon', 'service_role']) assert.equal(await scalar("select has_function_privilege($1,$2,'EXECUTE')", [role, `public.${fn}`]), false)
        assert.equal(await scalar("select has_function_privilege('authenticated',$1,'EXECUTE')", [`public.${fn}`]), true)
      }
      for (const role of ['anon', 'authenticated']) assert.equal(await scalar("select has_function_privilege($1,'public.email_pause_mailbox(uuid,text)','EXECUTE')", [role]), false)
      assert.equal(await scalar("select has_function_privilege('service_role','public.email_pause_mailbox(uuid,text)','EXECUTE')"), true)
      for (const fn of ['email_lifecycle_readiness(uuid,uuid,boolean)', 'email_require_lifecycle_activation()']) {
        for (const role of ['anon', 'authenticated', 'service_role']) assert.equal(await scalar("select has_function_privilege($1,$2,'EXECUTE')", [role, `public.${fn}`]), false)
      }
      for (const table of ['workspace_gmail_connections', 'email_gmail_accounts']) {
        for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) assert.equal(await scalar("select has_table_privilege('authenticated',$1,$2)", [`public.${table}`, privilege]), false)
      }
      await as(member)
      assert.equal((await ready()).counts.eligibleRecipients, 0)
      await assert.rejects(activate('a'.repeat(64)), /Human workspace admin required/)
      await assert.rejects(q("select email_pause_mailbox($1,'provider_rejected')", [w]), /permission denied/)
      await as(other)
      await assert.rejects(ready(), /Workspace membership required/)
      await as('', 'authenticated')
      await assert.rejects(ready(), /Workspace membership required/)
      await assert.rejects(activate('a'.repeat(64)), /Human workspace admin required/)
      await service()
      await assert.rejects(ready(), /permission denied/)
      await assert.rejects(activate('a'.repeat(64)), /permission denied/)
    })

    await t.test('Zero eligible, wrong campaign/product scope and archived apps never partially enable anything', async () => {
      await as(owner)
      const empty = await ready()
      assert.match(empty.reviewRevision, /^[a-f0-9]{64}$/)
      assert.equal(empty.code, 'EMAIL_NO_ELIGIBLE_RECIPIENTS')
      const before = await snapshot()
      await as(owner)
      assert.equal((await activate(empty.reviewRevision)).code, 'EMAIL_NO_ELIGIBLE_RECIPIENTS')
      assert.equal((await activate(empty.reviewRevision, c2)).code, 'EMAIL_RECORD_NOT_FOUND')
      assert.equal((await activate(empty.reviewRevision, c, app3)).code, 'EMAIL_RECORD_NOT_FOUND')
      assert.equal((await ready(app3)).code, 'EMAIL_PRODUCT_NOT_FOUND')
      assert.deepEqual(await snapshot(), before)
      await as(owner)
      first = await fixture('first@example.test')
      await root()
      await q('update products set source_facts=$2 where id=$1', [app, { archived: true }])
      await as(owner)
      const archived = await ready()
      assert.equal(archived.code, 'EMAIL_APP_ARCHIVED')
      assert.equal((await activate(archived.reviewRevision)).code, 'EMAIL_APP_ARCHIVED')
      await root(); await q("update products set source_facts='{}' where id=$1", [app])
      await as(owner)
      const active = await ready()
      assert.equal(active.allowed, true)
      const status = await scalar('select email_connection_status($1)', [w])
      assert.deepEqual(Object.keys(status).sort(), ['account_sending_enabled', 'configured', 'connection_sending_enabled', 'daily_budget', 'email', 'expected_email', 'pause_reason'])
      assert.equal(status.account_sending_enabled, false)
    })

    await t.test('Configured expected sender, nonempty audience/language and strict HTTPS destination are authoritative', async () => {
      await root()
      await q('update workspace_email_preferences set expected_sender_email=$2 where workspace_id=$1', [w, 'wrong@example.test'])
      await as(owner)
      const wrong = await ready()
      assert.equal(wrong.code, 'GMAIL_CONNECTION_REQUIRED')
      assert.equal((await activate(wrong.reviewRevision)).code, wrong.code)
      await root(); await q('delete from workspace_email_preferences where workspace_id=$1', [w])
      await as(owner); assert.equal((await ready()).code, 'GMAIL_CONNECTION_REQUIRED')
      await root(); await q('insert into workspace_email_preferences values($1,$2,now())', [w, sender])
      await q('update workspace_gmail_connections set configured=false where workspace_id=$1', [w])
      await as(owner); assert.equal((await ready()).code, 'GMAIL_CONNECTION_REQUIRED')
      await service(); await q('update workspace_gmail_connections set configured=true where workspace_id=$1', [w])
      for (const [field, value] of [['audience', '  '], ['language', ''], ['ad_link', 'https://user:pass@example.test'], ['ad_link', 'https://127.0.0.1'], ['ad_link', 'https://example.local'], ['ad_link', 'https://example.test:444'], ['ad_link', 'http://example.test']]) {
        await as(owner); await q(`update email_campaigns set ${field}=$2 where id=$1`, [c, value])
        const invalid = await ready()
        assert.equal(invalid.code, 'SENDER_DETAILS_REQUIRED', `${field}: ${value}`)
        assert.equal((await activate(invalid.reviewRevision)).code, invalid.code)
      }
      await as(owner)
      await q("update email_campaigns set audience='Consenting adults',language='English',ad_link='https://example.test/app' where id=$1", [c])
      await q("update email_drafts set status='approved' where id=$1", [first.draft])
    })

    await t.test('Revision covers exact recipient/copy identities beyond preview 100 and configuration changes without timestamps', async () => {
      await as(owner)
      await q(`insert into email_contacts(workspace_id,product_id,email,status,consent_evidence)
        select $1,$2,'bulk-'||i||'@example.test','opted_in',$3::jsonb from generate_series(1,105) i`, [w, app, consent])
      await q(`insert into email_drafts(workspace_id,product_id,campaign_id,contact_id,subject,body,status)
        select $1,$2,$3,id,'Subject '||email,'Truthful body '||email,'approved' from email_contacts
        where workspace_id=$1 and product_id=$2 and email like 'bulk-%'`, [w, app, c])
      const old = await ready()
      assert.equal(old.counts.eligibleRecipients, 106)
      assert.equal(old.counts.approvedDrafts, 106)
      assert.equal(old.eligibleRecipients.length, 100)
      const visibleIds = old.eligibleRecipients.map(r => r.id)
      const hidden = (await q('select id from email_drafts where campaign_id=$1 and not(contact_id=any($2::uuid[])) order by id limit 1', [c, visibleIds])).rows[0].id
      await q("update email_drafts set body='Changed hidden reviewed body' where id=$1", [hidden])
      await q("update email_drafts set status='approved' where id=$1", [hidden])
      const changed = await ready()
      assert.notEqual(changed.reviewRevision, old.reviewRevision)
      assert.equal((await activate(old.reviewRevision)).code, 'EMAIL_REVIEW_STALE')
      const previous = changed.reviewRevision
      await q("update email_contacts set organization='Identity unchanged; metadata changed' where id=$1", [first.id])
      assert.notEqual((await ready()).reviewRevision, previous)
      const cfg = await ready()
      await root()
      await q('update email_gmail_accounts set daily_budget=399 where account_key=$1', [account])
      await as(owner)
      assert.notEqual((await ready()).reviewRevision, cfg.reviewRevision, 'Account has no updated_at; fingerprint still changes')
      assert.equal((await activate(cfg.reviewRevision)).code, 'EMAIL_REVIEW_STALE')
      await service(); await q('update email_gmail_accounts set daily_budget=400 where account_key=$1', [account])
      await as(owner)
    })

    await t.test('Permanent recipient evidence and cross-day exact-copy exclusions match existing no-repeat rules', async () => {
      await as(owner)
      const rows = (await q('select id,email from email_contacts where workspace_id=$1 and product_id=$2 order by email limit 5', [w, app])).rows
      const drafts = []
      for (const r of rows) drafts.push((await q('select id,subject,body from email_drafts where contact_id=$1 order by id limit 1', [r.id])).rows[0])
      await root()
      for (let i = 0; i < 4; i++) {
        const id = await scalar(`insert into email_send_queue(workspace_id,product_id,campaign_id,contact_id,draft_id,email,scheduled_day,status,claimed_at,claim_token,subject_snapshot,body_snapshot)
          values($1,$2,$3,$4,$5,$6,current_date-5000,$7,$8,$9,$10,$11) returning id`,
        [w, app, c, rows[i].id, drafts[i].id, rows[i].email, i === 0 ? 'unknown' : 'prepared', i === 0 || i === 1 ? '2010-01-01T00:00:00Z' : null, i === 0 || i === 2 ? '30000000-0000-0000-0000-000000000001' : null, drafts[i].subject, drafts[i].body])
        if (i === 3) await q('insert into email_quota_reservations(queue_id,account_key,reserved_at) values($1,$2,now()-interval \'5000 days\')', [id, account])
      }
      // A different genuinely new recipient with old exact ad copy is still excluded.
      await as(owner)
      await q('update email_drafts set subject=$2,body=$3 where id=$1', [drafts[4].id, drafts[0].subject, drafts[0].body])
      await q("update email_drafts set status='approved' where id=$1", [drafts[4].id])
      const result = await ready()
      assert.equal(result.counts.optedIn, 106, 'Opted-in count includes consumed; eligible counts exclude them')
      assert.equal(result.counts.eligibleRecipients, 101)
      for (const r of rows) assert.equal(result.eligibleRecipients.some(p => p.id === r.id), false)
      await q("insert into email_suppressions(workspace_id,email) values($1,'first@example.test')", [w])
      assert.equal((await ready()).counts.eligibleRecipients, 100)
      // Removing one approved nonempty copy from eligible set also changes the revision.
      const priorReview = await ready()
      await q("update email_drafts set status='draft',body='' where id=(select id from email_drafts where campaign_id=$1 and status='approved' order by id limit 1)", [c])
      assert.notEqual((await ready()).reviewRevision, priorReview.reviewRevision)
    })

    await t.test('Direct table activation is denied even with a forged transaction-local campaign marker', async () => {
      await as(owner)
      await assert.rejects(q("update email_campaigns set state='approved' where id=$1", [c]), /Transactional campaign review required/)
      await q("select set_config('email.lifecycle_campaign',$1,false)", [c])
      await assert.rejects(q("update email_campaigns set state='approved' where id=$1", [c]), /Transactional campaign review required/)
      await q("select set_config('email.lifecycle_campaign','',false)")
      await assert.rejects(q("insert into email_campaigns(workspace_id,product_id,state,sender_name,postal_address,ad_link) values($1,$2,'approved','Sender','123 Street','https://example.test')", [w, app]), /Transactional campaign review required/)
    })

    await t.test('Injected final connection write failure rolls back campaign/account activation durably across DB reopen', async () => {
      await root()
      await db.exec(`create function public.test_fail_lifecycle_connection() returns trigger language plpgsql as $$ begin
        if new.sending_enabled then raise exception 'Synthetic final write failure'; end if; return new; end $$;
        create trigger z_test_lifecycle_failure before update on public.workspace_gmail_connections for each row execute function public.test_fail_lifecycle_connection();`)
      const before = await snapshot()
      await as(owner)
      const review = await ready()
      assert.equal(review.allowed, true)
      await assert.rejects(activate(review.reviewRevision), /Synthetic final write failure/)
      assert.deepEqual(await snapshot(), before, 'All updates rolled back, including prior successful campaign and account writes')
      await db.close()
      db = new PGlite(dir)
      assert.deepEqual(await snapshot(), before, 'Rollback remains intact on durable store reopen')
      await db.exec('drop trigger z_test_lifecycle_failure on public.workspace_gmail_connections; drop function public.test_fail_lifecycle_connection();')
    })

    await t.test('Valid owner/admin activation enables only selected campaign and selected workspace connection', async () => {
      const beforeHistory = await snapshot()
      await as(admin)
      const review = await ready()
      assert.deepEqual(await activate(review.reviewRevision), { allowed: true, code: 'EMAIL_CAMPAIGN_ACTIVATED', status: 'approved' })
      await root()
      assert.deepEqual((await q('select state,sending_enabled,approved_by from email_campaigns where id=$1', [c])).rows[0], { state: 'approved', sending_enabled: true, approved_by: admin })
      assert.equal(await scalar('select sending_enabled from email_gmail_accounts where account_key=$1', [account]), true)
      assert.equal(await scalar('select sending_enabled from workspace_gmail_connections where workspace_id=$1', [w]), true)
      assert.equal(await scalar('select sending_enabled from workspace_gmail_connections where workspace_id=$1', [w2]), false)
      assert.equal(await scalar('select sending_enabled from email_campaigns where id=$1', [c2]), false)
      assert.equal(await scalar('select sending_enabled from email_campaigns where id=$1', [c3]), false)
      const after = await snapshot()
      for (const table of ['email_send_queue', 'email_quota_reservations', 'email_gmail_diagnostics', 'email_contacts', 'email_drafts']) assert.deepEqual(after[table], beforeHistory[table])
      await as(other)
      await fixture('peer@example.test', app3, c3, w2)
      assert.equal((await activate((await ready(app3, w2)).reviewRevision, c3, app3, w2)).allowed, true)
      await as(owner)
      await fixture('app2@example.test', app2, c2)
      assert.equal((await activate((await ready(app2)).reviewRevision, c2, app2)).allowed, true)
    })

    await t.test('Mailbox pause covers all account workspaces and approved apps, preserves ledgers and never reactivates peers', async () => {
      const history = await snapshot()
      await service()
      await assert.rejects(q("select email_pause_mailbox($1,'raw-provider-password')", [w]), /Invalid mailbox pause reason/)
      assert.deepEqual(await scalar("select email_pause_mailbox($1,'provider_rejected')", [w]), { allowed: true, code: 'EMAIL_MAILBOX_PAUSED', status: 'paused' })
      await root()
      assert.equal(await scalar("select count(*) from email_campaigns where id in ($1,$2,$3) and state='paused' and not sending_enabled", [c, c2, c3]), 3)
      assert.equal(await scalar('select count(*) from workspace_gmail_connections where account_key=$1 and not sending_enabled and delivery_pause_reason=\'provider_rejected\'', [account]), 2)
      assert.equal(await scalar('select delivery_pause_reason from email_gmail_accounts where account_key=$1', [account]), 'provider_rejected')
      assert.equal(await scalar('select sending_enabled from email_gmail_accounts where account_key=$1', [account2]), false)
      const after = await snapshot()
      for (const table of ['email_send_queue', 'email_quota_reservations', 'email_gmail_diagnostics', 'email_contacts', 'email_drafts']) assert.deepEqual(after[table], history[table])
      await as(owner)
      const status = await scalar('select email_connection_status($1)', [w])
      assert.equal(status.pause_reason, 'provider_rejected')
      assert.equal(status.account_sending_enabled, false)
      assert.equal(status.connection_sending_enabled, false)
      const reviewed = await ready()
      assert.equal(reviewed.deliveryPauseReason, 'provider_rejected')
      assert.equal(reviewed.allowed, true, 'A fresh explicit human review can recover a configured mailbox')
      assert.equal((await activate(reviewed.reviewRevision)).allowed, true)
      await root()
      assert.equal(await scalar('select delivery_pause_reason from email_gmail_accounts where account_key=$1', [account]), null)
      assert.equal(await scalar('select delivery_pause_reason from workspace_gmail_connections where workspace_id=$1', [w]), null)
      assert.equal(await scalar('select sending_enabled from workspace_gmail_connections where workspace_id=$1', [w2]), false)
      assert.equal(await scalar('select delivery_pause_reason from workspace_gmail_connections where workspace_id=$1', [w2]), 'provider_rejected')
      for (const id of [c2, c3]) assert.equal(await scalar('select sending_enabled from email_campaigns where id=$1', [id]), false)
      await service()
      for (const reason of ['submission_unknown', 'reconnect_required']) {
        await scalar('select email_pause_mailbox($1,$2)', [w, reason])
        await as(owner)
        assert.equal((await ready()).deliveryPauseReason, reason)
        const revision = (await ready()).reviewRevision
        assert.equal((await activate(revision)).allowed, true)
        await service()
      }
    })
  } finally {
    await db.close()
    await rm(dir, { recursive: true, force: true })
  }
})
