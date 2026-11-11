import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = name => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')
const base = await migration('20261109_email_campaigns')
const noRepeat = await migration('20261109_email_no_repeat')
const preferences = await migration('20261109_email_sender_preference')
const sql = await migration('20261110_gmail_diagnostic')
const signature = 'public.email_reserve_diagnostic(uuid,uuid,uuid,text)'

test('Diagnostic migration is additive, transactional and never activates sending or touches contact history', () => {
  assert.match(sql, /begin;[\s\S]*commit;/)
  assert.match(sql, /create table public\.email_gmail_diagnostics/)
  assert.doesNotMatch(sql, /create or replace function|\b(?:drop|truncate)\s|cron\.schedule|net\.http|http_post/i)
  assert.doesNotMatch(sql, /(?:insert into|update|delete from) public\.(?:email_campaigns|email_contacts|email_drafts|email_send_queue|email_quota_reservations|workspace_gmail_connections|email_gmail_accounts)\b/i)
  assert.doesNotMatch(sql, /sending_enabled\s*:=|set\s+sending_enabled|on conflict/i)
  assert.match(sql, /account_key text not null unique references public\.email_gmail_accounts\(account_key\) on delete restrict/)
  assert.match(sql, /foreign key \(workspace_id, product_id\) references public\.products\(workspace_id, id\) on delete restrict/)
  assert.match(sql, /created_by uuid not null references auth\.users\(id\) on delete restrict/)
  assert.match(sql, /status in \('reserved','unknown','accepted','rejected'\)/)
})

test('Private RLS ledger and locked-down definers allow only service reservation, reads and outcome writes', () => {
  assert.match(sql, /alter table public\.email_gmail_diagnostics enable row level security/)
  assert.match(sql, /revoke all on public\.email_gmail_diagnostics from public, anon, authenticated, service_role/)
  assert.match(sql, /grant select on public\.email_gmail_diagnostics to service_role/)
  assert.match(sql, /grant update \(status, provider_message_id, finished_at\) on public\.email_gmail_diagnostics to service_role/)
  assert.doesNotMatch(sql, /create policy|grant (?:insert|delete)|grant[^;]+to (?:authenticated|anon|public)/i)
  assert.equal((sql.match(/security definer/g) || []).length, (sql.match(/security definer set search_path = ''/g) || []).length)
  for (const fn of ['email_guard_diagnostic_history()', 'email_guard_diagnostic_quota()', 'email_reserve_diagnostic(uuid,uuid,uuid,text)']) {
    assert.ok(sql.includes(`revoke all on function public.${fn} from public, anon, authenticated, service_role;`))
  }
  assert.ok(sql.includes(`grant execute on function ${signature} to service_role;`))
})

test('Reservation scopes DB owner/admin, product, expected sender and recipient under existing claim lock order', () => {
  assert.match(sql, /w\.owner_user_id = p_user_id/)
  assert.match(sql, /m\.workspace_id = p_workspace_id and m\.user_id = p_user_id and m\.role in \('owner','admin'\)/)
  assert.match(sql, /p\.workspace_id = p_workspace_id and p\.id = p_product_id/)
  assert.match(sql, /source_facts->>'archived'/)
  assert.match(sql, /v_expected_email is distinct from v_connection_email/)
  assert.match(sql, /from auth\.users u where u\.id = p_user_id for share/)
  assert.match(sql, /lower\(btrim\(p_recipient\)\) = v_user_email/)
  assert.match(sql, /lower\(btrim\(p_recipient\)\) = v_connection_email/)
  assert.match(sql, /v_connection_sending is distinct from false/)
  assert.match(sql, /v_account_sending is distinct from false/)
  assert.match(sql, /connection\.account_key = v_account_key and campaign\.sending_enabled/)
  const reserve = sql.slice(sql.indexOf('create function public.email_reserve_diagnostic('))
  assert.ok(reserve.indexOf("'email-workspace:'") < reserve.indexOf('c.workspace_id = p_workspace_id for share'))
  assert.ok(reserve.indexOf('c.workspace_id = p_workspace_id for share') < reserve.indexOf('a.account_key = v_account_key for update'))
  assert.ok(reserve.indexOf('a.account_key = v_account_key for update') < reserve.indexOf("'email-account:'"))
  assert.ok(reserve.indexOf('>= least(v_workspace_budget, v_account_budget)') < reserve.indexOf('insert into public.email_gmail_diagnostics'))
  const permanent = reserve.slice(reserve.indexOf('if exists (select 1 from public.email_gmail_diagnostics'), reserve.indexOf("raise exception 'Gmail diagnostic already reserved'"))
  assert.doesNotMatch(permanent, /created_at|status|finished_at/)
  assert.match(reserve, /exception when unique_violation then\s+raise exception 'Gmail diagnostic already reserved'/)
  assert.match(reserve, /jsonb_build_object\('id', v_id, 'recipient', v_recipient, 'status', 'reserved'\)/)
})

test('Additive quota trigger accounts for recent uncertain/accepted diagnostics and never refunds permanent history', () => {
  assert.match(sql, /create trigger email_diagnostic_quota_guard before insert on public\.email_quota_reservations/)
  assert.match(sql, /d\.status <> 'rejected'[\s\S]*d\.created_at > now\(\) - interval '24 hours'/)
  assert.match(sql, /q\.reserved_at > now\(\) - interval '24 hours'/)
  assert.match(sql, /\) >= v_budget then/)
  assert.match(sql, /Gmail diagnostic history is permanent/)
  assert.match(sql, /Gmail diagnostic identity is immutable/)
  assert.match(sql, /old\.status <> 'reserved' and new\.status = 'reserved'/)
  assert.match(sql, /old\.status in \('accepted','rejected'\) and new is distinct from old/)
})

// Offline only. This module never contacts Supabase, Gmail or another provider.
// EMAIL_TEST_PGLITE_MODULE=/tmp/email-db-validation/node_modules/@electric-sql/pglite/dist/index.js
const modulePath = process.env.EMAIL_TEST_PGLITE_MODULE
let PGlite
if (modulePath) ({ PGlite } = await import(modulePath))

test('Isolated PostgreSQL diagnostic authorization, permanent one-shot history, RLS and later campaign quotas', { skip: !PGlite }, async t => {
  const db = new PGlite()
  const owner = '00000000-0000-0000-0000-000000000001'
  const admin = '00000000-0000-0000-0000-000000000002'
  const member = '00000000-0000-0000-0000-000000000003'
  const outsider = '00000000-0000-0000-0000-000000000004'
  const workspace = '10000000-0000-0000-0000-000000000001'
  const workspace2 = '10000000-0000-0000-0000-000000000002'
  const app = '20000000-0000-0000-0000-000000000001'
  const app2 = '20000000-0000-0000-0000-000000000002'
  const foreignApp = '20000000-0000-0000-0000-000000000003'
  const absent = '90000000-0000-0000-0000-000000000099'
  const account = 'a'.repeat(64)
  const account2 = 'b'.repeat(64)
  const account3 = 'c'.repeat(64)
  const recipient = 'christopher.swofford@gmail.com'
  const sender = 'info@clearpasstechnologies.com'
  const envelope = { version: 1, algorithm: 'aes-256-gcm', iv: 'synthetic-iv', tag: 'synthetic-tag', ciphertext: 'synthetic-ciphertext' }
  const query = (text, values = []) => db.query(text, values)
  const scalar = async (text, values = []) => Object.values((await query(text, values)).rows[0])[0]
  const service = async () => { await db.exec('reset role; set role service_role') }
  const root = () => db.exec('reset role')
  const reserve = (w = workspace, p = app, u = owner, r = recipient) => scalar('select public.email_reserve_diagnostic($1,$2,$3,$4)', [w, p, u, r])
  const unavailable = (w = workspace, p = app, u = owner, r = recipient) => assert.rejects(reserve(w, p, u, r), error => {
    assert.equal(error.code, 'P0001')
    assert.equal(error.message, 'Gmail diagnostic unavailable')
    return true
  })
  const duplicate = (...args) => assert.rejects(reserve(...args), error => {
    assert.equal(error.code, 'P0001')
    assert.equal(error.message, 'Gmail diagnostic already reserved')
    return true
  })
  const snapshot = async () => {
    await root()
    const result = {}
    for (const table of ['email_campaigns', 'email_contacts', 'email_drafts', 'email_send_queue', 'email_quota_reservations', 'email_gmail_accounts', 'workspace_gmail_connections', 'workspace_email_preferences']) {
      result[table] = (await query(`select to_jsonb(t) as row from public.${table} t order by to_jsonb(t)::text`)).rows
    }
    return result
  }
  const fixtureQueue = async (email, product = app, w = workspace) => {
    await root()
    const campaign = await scalar('select id from email_campaigns where product_id=$1', [product])
    const contact = await scalar('insert into email_contacts(workspace_id,product_id,email) values($1,$2,$3) returning id', [w, product, email])
    const draft = await scalar("insert into email_drafts(workspace_id,product_id,campaign_id,contact_id,subject,body) values($1,$2,$3,$4,'Synthetic subject','Synthetic body') returning id", [w, product, campaign, contact])
    return scalar('insert into email_send_queue(workspace_id,product_id,campaign_id,contact_id,draft_id,email,scheduled_day) values($1,$2,$3,$4,$5,$6,current_date) returning id', [w, product, campaign, contact, draft, email])
  }
  const switchAccount = async (key, w = workspace) => {
    await root()
    await query('update workspace_gmail_connections set account_key=$1 where workspace_id=$2', [key, w])
    await service()
  }
  let id
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated, service_role;
      grant execute on function auth.uid() to authenticated, service_role;
      create table public.workspaces(id uuid primary key, owner_user_id uuid references auth.users(id));
      create table public.products(id uuid primary key, workspace_id uuid references public.workspaces(id), source_facts jsonb default '{}');
      create table public.workspace_members(workspace_id uuid, user_id uuid, role text);
      create function public.is_workspace_admin(w uuid) returns boolean language sql stable security definer as $$
        select exists(select 1 from public.workspaces where id=w and owner_user_id=auth.uid())
          or exists(select 1 from public.workspace_members where workspace_id=w and user_id=auth.uid() and role='admin') $$;
      create function public.get_workspace_role(w uuid) returns text language sql stable security definer as $$
        select case when exists(select 1 from public.workspaces where id=w and owner_user_id=auth.uid()) then 'owner'
          else coalesce((select role from public.workspace_members where workspace_id=w and user_id=auth.uid()),'none') end $$;
    `)
    await query('insert into auth.users values($1,$2),($3,$4),($5,$6),($7,$8)', [owner, recipient, admin, 'admin@example.test', member, 'member@example.test', outsider, 'outsider@example.test'])
    await query('insert into workspaces values($1,$2),($3,$4)', [workspace, owner, workspace2, outsider])
    await query('insert into products(id,workspace_id) values($1,$2),($3,$2),($4,$5)', [app, workspace, app2, foreignApp, workspace2])
    await query("insert into workspace_members values($1,$2,'admin'),($1,$3,'member')", [workspace, admin, member])
    await db.exec(base)
    await db.exec(noRepeat)
    await db.exec(preferences)
    for (const [w, p] of [[workspace, app], [workspace, app2], [workspace2, foreignApp]]) {
      await query('insert into email_campaigns(workspace_id,product_id) values($1,$2)', [w, p])
    }
    for (const key of [account, account2, account3]) await query('insert into email_gmail_accounts(account_key) values($1)', [key])
    for (const [w, u] of [[workspace, owner], [workspace2, outsider]]) {
      await query('insert into workspace_gmail_connections(workspace_id,account_key,email,configured,encrypted_credentials,created_by) values($1,$2,$3,true,$4,$5)', [w, account, sender, envelope, u])
      await query('insert into workspace_email_preferences(workspace_id,expected_sender_email) values($1,$2)', [w, sender])
    }
    await fixtureQueue('untouched-history@example.test')
    const before = await snapshot()
    const priorRpcs = (await query("select oid::regprocedure::text as signature,prosrc,proacl::text as acl from pg_proc where pronamespace='public'::regnamespace and proname in ('email_prepare_queue','email_claim_send','email_finish_send','email_claim_daily_run') order by proname")).rows
    await db.exec(sql)

    await t.test('Local migration preserves all flags, campaign/contact history, reservations and existing RPC definitions/ACLs', async () => {
      assert.deepEqual(await snapshot(), before)
      assert.deepEqual((await query("select oid::regprocedure::text as signature,prosrc,proacl::text as acl from pg_proc where pronamespace='public'::regnamespace and proname in ('email_prepare_queue','email_claim_send','email_finish_send','email_claim_daily_run') order by proname")).rows, priorRpcs)
      assert.equal(await scalar('select count(*) from email_gmail_diagnostics'), 0)
    })

    await t.test('Ledger privacy, column-level writes and service-only definer execution are enforced', async () => {
      assert.equal(await scalar("select relrowsecurity from pg_class where oid='public.email_gmail_diagnostics'::regclass"), true)
      assert.equal(await scalar("select count(*) from pg_policies where tablename='email_gmail_diagnostics'"), 0)
      for (const role of ['anon', 'authenticated']) {
        for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) assert.equal(await scalar('select has_table_privilege($1,$2,$3)', [role, 'public.email_gmail_diagnostics', privilege]), false)
        assert.equal(await scalar("select has_function_privilege($1,$2,'EXECUTE')", [role, signature]), false)
        await db.exec(`set role ${role}`)
        await assert.rejects(query('select id from email_gmail_diagnostics'), /permission denied/)
        await assert.rejects(reserve(), /permission denied/)
        await root()
      }
      assert.equal(await scalar("select has_function_privilege('service_role',$1,'EXECUTE')", [signature]), true)
      for (const privilege of ['INSERT', 'DELETE']) assert.equal(await scalar("select has_table_privilege('service_role','public.email_gmail_diagnostics',$1)", [privilege]), false)
      for (const column of ['status', 'provider_message_id', 'finished_at']) assert.equal(await scalar("select has_column_privilege('service_role','public.email_gmail_diagnostics',$1,'UPDATE')", [column]), true)
      for (const column of ['id', 'workspace_id', 'product_id', 'account_key', 'created_by', 'recipient_email', 'created_at']) assert.equal(await scalar("select has_column_privilege('service_role','public.email_gmail_diagnostics',$1,'UPDATE')", [column]), false)
      for (const fn of ['public.email_guard_diagnostic_history()', 'public.email_guard_diagnostic_quota()']) assert.equal(await scalar("select has_function_privilege('service_role',$1,'EXECUTE')", [fn]), false)
      const definition = (await query('select prosecdef,proconfig from pg_proc where oid=$1::regprocedure', [signature])).rows[0]
      assert.equal(definition.prosecdef, true)
      assert.ok(definition.proconfig.includes('search_path=""'))
      await service()
      await assert.rejects(query('insert into email_gmail_diagnostics(workspace_id) values($1)', [workspace]), /permission denied/)
      await assert.rejects(query('delete from email_gmail_diagnostics'), /permission denied/)
    })

    await t.test('Membership, product scope/archive and fixed recipient failures expose only the fixed unavailable error', async () => {
      await service()
      for (const user of [member, outsider, absent, null]) await unavailable(workspace, app, user)
      for (const [w, p] of [[workspace, foreignApp], [workspace2, app], [absent, app], [workspace, absent], [null, app], [workspace, null]]) await unavailable(w, p)
      for (const r of ['unapproved@example.test', 'owner+extra@gmail.com', 'a@example.test,b@example.test', '', null, `${recipient}\r\nBcc:other@example.test`]) await unavailable(workspace, app, owner, r)
      await root()
      await query('update products set source_facts=$2 where id=$1', [app, { archived: true }])
      await service()
      await unavailable()
      await root()
      await query("update products set source_facts='{}' where id=$1", [app])
      await query('insert into auth.users(id) values($1)', [absent])
      await query("insert into workspace_members values($1,$2,'admin')", [workspace, absent])
      await service()
      await unavailable(workspace, app, absent, sender)
      assert.equal(await scalar('select count(*) from email_gmail_diagnostics'), 0)
    })

    await t.test('Configured expected sender and BOTH disabled sending flags are required, including other-workspace campaigns', async () => {
      await root()
      await query('update workspace_gmail_connections set configured=false where workspace_id=$1', [workspace])
      await service(); await unavailable()
      await query('update workspace_gmail_connections set configured=true,sending_enabled=true where workspace_id=$1', [workspace])
      await unavailable()
      await query('update workspace_gmail_connections set sending_enabled=false where workspace_id=$1', [workspace])
      await query('update email_gmail_accounts set sending_enabled=true where account_key=$1', [account])
      await unavailable()
      await query('update email_gmail_accounts set sending_enabled=false where account_key=$1', [account])
      await root()
      await query('update workspace_email_preferences set expected_sender_email=$2 where workspace_id=$1', [workspace, 'different@example.test'])
      await service(); await unavailable()
      await root()
      await query('delete from workspace_email_preferences where workspace_id=$1', [workspace])
      await service(); await unavailable()
      await root()
      await query('insert into workspace_email_preferences(workspace_id,expected_sender_email) values($1,$2)', [workspace, sender])
      await query("select set_config('request.jwt.claim.sub',$1,false)", [outsider])
      await query("update email_campaigns set sender_name='Fixture owner',postal_address='123 Test Street',ad_link='https://example.test' where workspace_id=$1", [workspace2])
      await query("update email_campaigns set state='approved' where workspace_id=$1", [workspace2])
      await service(); await unavailable()
      await root()
      await query("update email_campaigns set state='paused' where workspace_id=$1", [workspace2])
      await service()
      assert.equal(await scalar('select count(*) from email_gmail_diagnostics'), 0)
    })

    await t.test('One normalized DB recipient is reserved atomically without changing live flags or any contact/queue history', async () => {
      const unchanged = await snapshot()
      await service()
      const result = await reserve(workspace, app, owner, '  CHRISTOPHER.SWOFFORD@GMAIL.COM  ')
      assert.deepEqual(Object.keys(result).sort(), ['id', 'recipient', 'status'])
      assert.match(result.id, /^[0-9a-f-]{36}$/)
      assert.equal(result.recipient, recipient)
      assert.equal(result.status, 'reserved')
      id = result.id
      const row = (await query('select id,workspace_id,product_id,account_key,created_by,recipient_email,status,provider_message_id,finished_at from email_gmail_diagnostics where id=$1', [id])).rows[0]
      assert.deepEqual(row, { id, workspace_id: workspace, product_id: app, account_key: account, created_by: owner, recipient_email: recipient, status: 'reserved', provider_message_id: null, finished_at: null })
      assert.deepEqual(await snapshot(), unchanged)
      await service()
      await duplicate()
      await duplicate(workspace, app2)
      await duplicate(workspace2, foreignApp, outsider, 'outsider@example.test')
      await assert.rejects(query('update email_gmail_diagnostics set account_key=$2 where id=$1', [id, account2]), /permission denied/)
      await root()
      await assert.rejects(query('update email_gmail_diagnostics set product_id=$2 where id=$1', [id, app2]), /identity is immutable/)
      await assert.rejects(query('delete from email_gmail_diagnostics where id=$1', [id]), /history is permanent/)
      for (const text of ['delete from email_gmail_accounts where account_key=$1', 'delete from workspaces where id=$1', 'delete from products where id=$1', 'delete from auth.users where id=$1']) {
        const value = text.includes('email_gmail_accounts') ? account : text.includes('workspaces') ? workspace : text.includes('products') ? app : owner
        await assert.rejects(query(text, [value]), /foreign key|history is permanent/)
      }
      await query('grant select on public.email_gmail_diagnostics to authenticated')
      await db.exec('set role authenticated')
      assert.equal(await scalar('select count(*) from email_gmail_diagnostics'), 0, 'RLS also protects the ledger if SELECT is accidentally granted')
      await root()
      await query('revoke select on public.email_gmail_diagnostics from authenticated')
    })

    await t.test('Rolling quota counts a diagnostic in reserved/unknown/accepted states against later campaign capacity', async () => {
      await service()
      await query('update email_gmail_accounts set daily_budget=3 where account_key=$1', [account])
      const q1 = await fixtureQueue('quota-first@example.test')
      const q2 = await fixtureQueue('quota-second@example.test')
      const q3 = await fixtureQueue('quota-overflow@example.test')
      await query('insert into email_quota_reservations(queue_id,account_key) values($1,$2)', [q1, account])
      await query('insert into email_quota_reservations(queue_id,account_key) values($1,$2)', [q2, account])
      await assert.rejects(query('insert into email_quota_reservations(queue_id,account_key) values($1,$2)', [q3, account]), /diagnostic quota unavailable/)
      // Exercise the existing claim RPC itself: its old quota check sees 2 < 3, but
      // the additive trigger sees diagnostic 1 + reservations 2 and aborts atomically.
      const campaignQueue = await fixtureQueue('quota-real-claim@example.test', app2)
      await query("select set_config('request.jwt.claim.sub',$1,false)", [owner])
      await query("update email_campaigns set send_hour=0,sender_name='Fixture owner',postal_address='123 Test Street',ad_link='https://example.test' where product_id=$1", [app2])
      await query("update email_campaigns set state='approved' where product_id=$1", [app2])
      const consent = { method: 'operator_recorded', reference: 'Synthetic offline consent', recorded_at: '2020-01-01T00:00:00Z' }
      await query("update email_contacts set status='opted_in',consent_evidence=$2 where id=(select contact_id from email_send_queue where id=$1)", [campaignQueue, consent])
      await query("update email_drafts set status='approved' where id=(select draft_id from email_send_queue where id=$1)", [campaignQueue])
      await service()
      await query('update workspace_gmail_connections set sending_enabled=true,daily_budget=3 where workspace_id=$1', [workspace])
      await query('update email_gmail_accounts set sending_enabled=true where account_key=$1', [account])
      await assert.rejects(query('select email_claim_send($1)', [campaignQueue]), /diagnostic quota unavailable/)
      assert.deepEqual((await query('select status,claim_token,claimed_at,subject_snapshot from email_send_queue where id=$1', [campaignQueue])).rows[0], { status: 'prepared', claim_token: null, claimed_at: null, subject_snapshot: null })
      assert.equal(await scalar('select count(*) from email_quota_reservations where queue_id=$1', [campaignQueue]), 0)
      await query('update workspace_gmail_connections set sending_enabled=false where workspace_id=$1', [workspace])
      await query('update email_gmail_accounts set sending_enabled=false where account_key=$1', [account])
      await root()
      await query("update email_campaigns set state='paused' where product_id=$1", [app2])
      await service()
      await query("update email_gmail_diagnostics set status='unknown' where id=$1", [id])
      await duplicate()
      await assert.rejects(query("update email_gmail_diagnostics set status='reserved' where id=$1", [id]), /cannot be reopened/)
      await root()
      await assert.rejects(query('insert into email_quota_reservations(queue_id,account_key) values($1,$2)', [q3, account]), /diagnostic quota unavailable/)
      await service()
      await query("update email_gmail_diagnostics set status='accepted',provider_message_id='synthetic-google-id',finished_at=now() where id=$1", [id])
      await duplicate()
      await assert.rejects(query("update email_gmail_diagnostics set status='rejected' where id=$1", [id]), /cannot be reopened or overwritten/)
      await root()
      await assert.rejects(query('insert into email_quota_reservations(queue_id,account_key) values($1,$2)', [q3, account]), /diagnostic quota unavailable/)
      assert.equal(await scalar('select count(*) from email_quota_reservations where account_key=$1', [account]), 2, 'Diagnostic 1 + campaign reservations cap-1 exhausts account budget 3')
      assert.equal(await scalar('select count(*) from email_quota_reservations where queue_id=$1', [q3]), 0)
      await query("update email_quota_reservations set reserved_at=now()-interval '25 hours' where queue_id=$1", [q1])
      await query('insert into email_quota_reservations(queue_id,account_key) values($1,$2)', [q3, account])
      await service()
      await query('update email_gmail_accounts set daily_budget=400 where account_key=$1', [account])
    })

    await t.test('Admin and connected self-recipient work, rejected stays consumed and does not charge later campaign quota', async () => {
      await switchAccount(account2)
      const result = await reserve(workspace, app2, admin, ' ADMIN@EXAMPLE.TEST ')
      assert.equal(result.recipient, 'admin@example.test')
      await query("update email_gmail_diagnostics set status='unknown' where id=$1", [result.id])
      await query("update email_gmail_diagnostics set status='rejected',finished_at=now() where id=$1", [result.id])
      await duplicate(workspace, app, owner)
      await assert.rejects(query("update email_gmail_diagnostics set status='reserved' where id=$1", [result.id]), /cannot be reopened/)
      await assert.rejects(query("update email_gmail_diagnostics set status='accepted' where id=$1", [result.id]), /cannot be reopened or overwritten/)
      await query('update email_gmail_accounts set daily_budget=1 where account_key=$1', [account2])
      const queue = await fixtureQueue('rejected-capacity@example.test')
      await query('insert into email_quota_reservations(queue_id,account_key) values($1,$2)', [queue, account2])
      await switchAccount(account3)
      const self = await reserve(workspace, app, owner, ' INFO@CLEARPASSTECHNOLOGIES.COM ')
      assert.equal(self.recipient, sender)
      await duplicate(workspace, app, admin, 'admin@example.test')
    })

    await t.test('Lifetime uniqueness survives 5000-day history and reconnection across workspaces; diagnostic quota is rolling', async () => {
      const oldAccount = 'd'.repeat(64)
      await root()
      await query('insert into email_gmail_accounts(account_key,daily_budget) values($1,1)', [oldAccount])
      await query("insert into email_gmail_diagnostics(workspace_id,product_id,account_key,created_by,recipient_email,status,created_at) values($1,$2,$3,$4,$5,'unknown',now()-interval '5000 days')", [workspace, app, oldAccount, owner, recipient])
      await query('update workspace_gmail_connections set daily_budget=1,account_key=$1 where workspace_id=$2', [oldAccount, workspace2])
      await service()
      await duplicate(workspace2, foreignApp, outsider, 'outsider@example.test')
      const queue = await fixtureQueue('old-diagnostic-capacity@example.test', foreignApp, workspace2)
      await query('insert into email_quota_reservations(queue_id,account_key) values($1,$2)', [queue, oldAccount])
      assert.equal(await scalar('select count(*) from email_gmail_diagnostics where account_key=$1', [oldAccount]), 1)
    })

    await t.test('Diagnostic reservation requires capacity below BOTH workspace and account budgets including other-workspace usage', async () => {
      const quotaAccount = 'e'.repeat(64)
      await root()
      await query('insert into email_gmail_accounts(account_key,daily_budget) values($1,2)', [quotaAccount])
      await query('update workspace_gmail_connections set account_key=$1,daily_budget=1 where workspace_id=$2', [quotaAccount, workspace])
      const q1 = await fixtureQueue('diagnostic-quota-one@example.test', foreignApp, workspace2)
      const q2 = await fixtureQueue('diagnostic-quota-two@example.test', foreignApp, workspace2)
      await query('insert into email_quota_reservations(queue_id,account_key) values($1,$2)', [q1, quotaAccount])
      await service(); await unavailable()
      await query('update workspace_gmail_connections set daily_budget=2 where workspace_id=$1', [workspace])
      await root()
      await query('insert into email_quota_reservations(queue_id,account_key) values($1,$2)', [q2, quotaAccount])
      await service(); await unavailable()
      await root()
      await query("update email_quota_reservations set reserved_at=now()-interval '25 hours' where queue_id=$1", [q1])
      await service()
      const result = await reserve()
      assert.equal(result.status, 'reserved', 'Old reservations do not consume the rolling window')
      await duplicate()
    })

    await t.test('Composite FK and status constraints reject invalid direct fixture data; service cannot forge a recipient', async () => {
      const fresh = 'f'.repeat(64)
      await root()
      await query('insert into email_gmail_accounts(account_key) values($1)', [fresh])
      await assert.rejects(query('insert into email_gmail_diagnostics(workspace_id,product_id,account_key,created_by,recipient_email) values($1,$2,$3,$4,$5)', [workspace, foreignApp, fresh, owner, recipient]), /foreign key/)
      await assert.rejects(query("insert into email_gmail_diagnostics(workspace_id,product_id,account_key,created_by,recipient_email,status) values($1,$2,$3,$4,$5,'sent')", [workspace, app, fresh, owner, recipient]), /check constraint/)
      await service()
      await assert.rejects(query('update email_gmail_diagnostics set recipient_email=$2 where id=$1', [id, 'other@example.test']), /permission denied/)
    })
  } finally { await db.close() }
})
