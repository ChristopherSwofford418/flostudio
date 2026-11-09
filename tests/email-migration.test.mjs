import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const sql = await readFile(new URL('../supabase/migrations/20261109_email_campaigns.sql', import.meta.url), 'utf8')
const tables = ['email_campaigns', 'email_contacts', 'email_drafts', 'email_gmail_accounts', 'workspace_gmail_connections', 'email_oauth_states', 'email_suppressions', 'email_unsubscribe_tokens', 'email_send_queue', 'email_quota_reservations', 'email_cron_runs']
const rpcs = ['email_prepare_queue', 'email_claim_send', 'email_finish_send', 'email_claim_daily_run', 'email_unsubscribe', 'email_consume_oauth_state', 'email_pause_workspace']

test('Email migration is additive, transactional, disabled and does not activate jobs', () => {
  assert.match(sql, /begin;[\s\S]*commit;/)
  assert.doesNotMatch(sql, /drop\s+(?:table|column)|cron\.schedule|net\.http|http_post|vault\.decrypted/i)
  for (const table of tables) assert.match(sql, new RegExp(`create table public\\.${table} \\(`))
  assert.match(sql, /daily_limit between 1 and 100/)
  assert.match(sql, /daily_budget integer not null default 400 check \(daily_budget between 1 and 2000\)/)
  assert.match(sql, /recipient_cooldown_days integer not null default 30/)
  assert.equal((sql.match(/sending_enabled boolean not null default false/g) || []).length, 3)
})

test('Every cross-app queue relationship binds workspace, product, campaign and recipient', () => {
  assert.match(sql, /on public\.products\(workspace_id, id\)/)
  assert.match(sql, /foreign key \(workspace_id, product_id, contact_id, email\)/)
  assert.match(sql, /foreign key \(workspace_id, product_id, campaign_id, contact_id, draft_id\)/)
  assert.match(sql, /unique \(workspace_id, email, scheduled_day\)/)
  assert.match(sql, /Email identity\/scope is immutable/)
})

test('Credentials are ciphertext-only, private tables have no client policies, definers are locked down', () => {
  assert.match(sql, /encrypted_credentials->>'algorithm' = 'aes-256-gcm'/)
  assert.match(sql, /revoke all on public\.%I from public, anon, authenticated, service_role/)
  assert.match(sql, /get_workspace_role\(workspace_id\) in/)
  assert.match(sql, /email_admin_update[\s\S]*is_workspace_admin\(workspace_id\)/)
  assert.equal((sql.match(/security definer/g) || []).length, (sql.match(/security definer set search_path = ''/g) || []).length)
  for (const rpc of rpcs) assert.match(sql, new RegExp(`revoke all on function public\\.${rpc}\\([^;]+from public, anon, authenticated;`))
  assert.doesNotMatch(sql, /grant execute[^;]*to authenticated/i)
})

test('Dispatch reserves quota, checks suppression/consent/approval, snapshots copy and has no uncertain retry path', () => {
  assert.match(sql, /account_key = conn\.account_key for update/)
  assert.match(sql, /reserved_at > now\(\) - interval '24 hours'/)
  assert.match(sql, /previous\.status in \('claimed','unknown'\)/)
  assert.match(sql, /make_interval\(days => c\.recipient_cooldown_days\)/)
  assert.match(sql, /r\.status <> 'opted_in' or d\.status <> 'approved'/)
  assert.match(sql, /subject_snapshot = d\.subject, body_snapshot = d\.body/)
  assert.match(sql, /Terminal outcomes cannot be retried or overwritten/)
  assert.doesNotMatch(sql, /set status = 'prepared'/)
  assert.match(sql, /Human admin approval required/)
  assert.match(sql, /Manual admin consent recording required/)
  assert.match(sql, /new\.state := 'draft'/)
  assert.match(sql, /new\.subject is distinct from old\.subject[^;]+new\.status := 'draft'/)
  assert.match(sql, /source_facts->>'archived' = 'true'/)
  assert.match(sql, /Connection budget cannot exceed shared account budget/)
})

// No test connects to Supabase. Supply a local @electric-sql/pglite module to exercise
// SQL against disposable synthetic tables: EMAIL_TEST_PGLITE_MODULE=/absolute/path/dist/index.js.
const modulePath = process.env.EMAIL_TEST_PGLITE_MODULE
let PGlite
if (modulePath) ({ PGlite } = await import(modulePath))

test('Isolated PostgreSQL behavior: RLS, scope, approval, consent, quotas, cooldown, suppression, OAuth and cron', { skip: !PGlite }, async () => {
  const db = new PGlite()
  const owner = '00000000-0000-0000-0000-000000000001'
  const member = '00000000-0000-0000-0000-000000000002'
  const other = '00000000-0000-0000-0000-000000000003'
  const w = '10000000-0000-0000-0000-000000000001'
  const w2 = '10000000-0000-0000-0000-000000000002'
  const app = '20000000-0000-0000-0000-000000000001'
  const app2 = '20000000-0000-0000-0000-000000000002'
  const app3 = '20000000-0000-0000-0000-000000000003'
  const account = 'a'.repeat(64)
  const envelope = { version: 1, algorithm: 'aes-256-gcm', iv: 'iv', tag: 'tag', ciphertext: 'ciphertext' }
  const query = (text, values = []) => db.query(text, values)
  const scalar = async (text, values = []) => Object.values((await query(text, values)).rows[0])[0]
  const reject = async (text, values, pattern) => assert.rejects(query(text, values), pattern)
  const asUser = async (id, role = 'authenticated') => {
    await db.exec('reset role')
    await query("select set_config('request.jwt.claim.sub', $1, false)", [id])
    await db.exec(`set role ${role}`)
  }
  const asService = () => asUser('', 'service_role')
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
      grant usage on schema auth to authenticated, service_role;
      grant execute on function auth.uid() to authenticated, service_role;
      create table public.workspaces(id uuid primary key, owner_user_id uuid references auth.users);
      create table public.products(id uuid primary key, workspace_id uuid references public.workspaces, source_facts jsonb default '{}');
      create table public.workspace_members(workspace_id uuid, user_id uuid, role text);
      create function public.is_workspace_admin(target_workspace_id uuid) returns boolean language sql stable security definer as $$
        select exists(select 1 from public.workspaces where id = target_workspace_id and owner_user_id = auth.uid())
          or exists(select 1 from public.workspace_members where workspace_id = target_workspace_id and user_id = auth.uid() and role = 'admin') $$;
      create function public.get_workspace_role(target_workspace_id uuid) returns text language sql stable security definer as $$
        select case when exists(select 1 from public.workspaces where id = target_workspace_id and owner_user_id = auth.uid()) then 'owner'
          else coalesce((select role from public.workspace_members where workspace_id = target_workspace_id and user_id = auth.uid()),'none') end $$;
    `)
    for (const id of [owner, member, other]) await query('insert into auth.users values ($1)', [id])
    await query('insert into workspaces values($1,$2),($3,$4)', [w, owner, w2, other])
    await query('insert into products(id,workspace_id) values($1,$2),($3,$2),($4,$5)', [app, w, app2, app3, w2])
    await query("insert into workspace_members values($1,$2,'member')", [w, member])
    await db.exec(sql)
    await asUser(owner)
    const campaign = async (product, workspace = w) => scalar(`insert into email_campaigns(workspace_id,product_id,send_hour,sender_name,postal_address,ad_link)
      values($1,$2,0,'Human Sender','123 Example Street','https://example.test') returning id`, [workspace, product])
    const c = await campaign(app)
    const c2 = await campaign(app2)
    assert.equal(await scalar('select sending_enabled from email_campaigns where id=$1', [c]), false)
    await reject('insert into email_campaigns(workspace_id,product_id) values($1,$2)', [w, app3], /foreign key/i)
    await reject("update email_campaigns set timezone='MadeUp/Zone' where id=$1", [c], /IANA timezone/)
    await reject('update email_campaigns set daily_limit=101 where id=$1', [c], /check constraint/)
    await query("update email_campaigns set state='approved' where id in ($1,$2)", [c, c2])
    assert.equal(await scalar('select approved_by from email_campaigns where id=$1', [c]), owner)
    const contact = async (email, product = app) => scalar('insert into email_contacts(workspace_id,product_id,email) values($1,$2,$3) returning id', [w, product, email])
    const consent = { method: 'operator_recorded', reference: 'Explicit opt-in form capture abc', recorded_at: '2026-01-01T00:00:00Z' }
    const r = await contact('person@example.test')
    await reject("update email_contacts set status='opted_in' where id=$1", [r], /Consent timestamp/)
    await reject("update email_contacts set status='opted_in',consent_evidence=$2 where id=$1", [r, { recorded_at: consent.recorded_at }], /check constraint/)
    await query("update email_contacts set status='opted_in',consent_evidence=$2 where id=$1", [r, consent])
    assert.equal(await scalar('select consent_recorded_by from email_contacts where id=$1', [r]), owner)
    const draft = async (campaignId, contactId, product = app) => scalar("insert into email_drafts(workspace_id,product_id,campaign_id,contact_id,subject,body,status) values($1,$2,$3,$4,'Reviewed subject','Reviewed body','approved') returning id", [w, product, campaignId, contactId])
    const d = await draft(c, r)
    await reject("insert into email_drafts(workspace_id,product_id,campaign_id,contact_id) values($1,$2,$3,$4)", [w, app2, c2, r], /foreign key/)
    await asUser(member)
    assert.equal(await scalar('select count(*) from email_campaigns'), 2)
    await reject('insert into email_contacts(workspace_id,product_id,email) values($1,$2,$3)', [w, app, 'member@example.test'], /row.level security/i)
    await reject('select encrypted_credentials from workspace_gmail_connections', [], /permission denied/)
    await reject('select email_claim_send($1)', [r], /permission denied/)
    await asUser(other)
    assert.equal(await scalar('select count(*) from email_contacts'), 0)
    await asService()
    await query('insert into email_gmail_accounts(account_key) values($1)', [account])
    await reject('insert into workspace_gmail_connections(workspace_id,account_key,email,configured,encrypted_credentials,created_by) values($1,$2,$3,true,$4,$5)', [w, account, 'sender@example.test', {}, owner], /check constraint/)
    await query('insert into workspace_gmail_connections(workspace_id,account_key,email,configured,encrypted_credentials,created_by) values($1,$2,$3,true,$4,$5)', [w, account, 'sender@example.test', envelope, owner])
    await reject('update workspace_gmail_connections set daily_budget=500 where workspace_id=$1', [w], /cannot exceed/)
    await reject('update email_gmail_accounts set daily_budget=2001 where account_key=$1', [account], /check constraint/)
    const day = await scalar("select (now() at time zone 'UTC')::date::text")
    const q = await scalar('select email_prepare_queue($1,$2,$3,$4)', [c, r, d, day])
    assert.equal(await scalar('select email_prepare_queue($1,$2,$3,$4)', [c, r, d, day]), q)
    assert.equal(await scalar('select email_claim_send($1)', [q]), null)
    await query('update workspace_gmail_connections set sending_enabled=true where workspace_id=$1', [w])
    await reject("insert into email_send_queue(workspace_id) values($1)", [w], /permission denied/)
    await query('update email_gmail_accounts set sending_enabled=true,daily_budget=1 where account_key=$1', [account])
    assert.ok(await scalar('select email_claim_daily_run($1)', [c]))
    assert.equal(await scalar('select email_claim_daily_run($1)', [c]), null)
    const claimed = await scalar('select email_claim_send($1)', [q])
    assert.ok(claimed)
    const row = (await query('select claim_token,status,subject_snapshot from email_send_queue where id=$1', [q])).rows[0]
    assert.equal(row.status, 'claimed')
    assert.equal(row.subject_snapshot, 'Reviewed subject')
    assert.equal(await scalar('select email_claim_send($1)', [q]), null)
    await reject('select email_finish_send($1,$2,$3)', [q, '40000000-0000-0000-0000-000000000001', 'sent'], /acceptance id/)
    await reject('select email_finish_send($1,$2,$3)', [q, '40000000-0000-0000-0000-000000000001', 'unknown'], /Invalid claim token/)
    await query('select email_finish_send($1,$2,$3)', [q, row.claim_token, 'unknown'])
    await query('select email_finish_send($1,$2,$3)', [q, row.claim_token, 'unknown'])
    await reject('select email_finish_send($1,$2,$3,$4)', [q, row.claim_token, 'sent', 'gmail-id'], /Terminal outcomes/)
    await asUser(owner)
    const r2 = await contact('second@example.test', app2)
    await query("update email_contacts set status='opted_in',consent_evidence=$2 where id=$1", [r2, consent])
    const d2 = await draft(c2, r2, app2)
    await asService()
    const q2 = await scalar('select email_prepare_queue($1,$2,$3,$4)', [c2, r2, d2, day])
    assert.equal(await scalar('select email_claim_send($1)', [q2]), null, 'Shared account budget blocks a second app')
    const stateHash = 'b'.repeat(64)
    await query("insert into email_oauth_states(state_hash,workspace_id,created_by,expires_at) values($1,$2,$3,now()+interval '10 minutes')", [stateHash, w, owner])
    assert.equal(await scalar('select email_consume_oauth_state($1,$2)', [stateHash, other]), null)
    assert.equal(await scalar('select email_consume_oauth_state($1,$2)', [stateHash, owner]), w)
    assert.equal(await scalar('select email_consume_oauth_state($1,$2)', [stateHash, owner]), null)
    const tokenHash = 'c'.repeat(64)
    await query('insert into email_unsubscribe_tokens(token_hash,workspace_id,email) values($1,$2,$3)', [tokenHash, w, 'second@example.test'])
    assert.equal(await scalar('select email_unsubscribe($1)', ['d'.repeat(64)]), false)
    assert.equal(await scalar('select email_unsubscribe($1)', [tokenHash]), true)
    assert.equal(await scalar('select email_unsubscribe($1)', [tokenHash]), true)
    assert.equal(await scalar('select status from email_send_queue where id=$1', [q2]), 'suppressed')
    assert.equal(await scalar('select status from email_contacts where id=$1', [r2]), 'unsubscribed')
    assert.equal(await scalar('select status from email_contacts where id=$1', [r]), 'opted_in')
    await asUser(owner)
    await reject("update email_contacts set status='opted_in' where id=$1", [r2], /suppression prevents/)
    await query("update email_campaigns set audience='Changed human content',daily_limit=1 where id=$1", [c])
    assert.equal(await scalar('select state from email_campaigns where id=$1', [c]), 'draft')
    assert.equal(await scalar('select sending_enabled from email_campaigns where id=$1', [c]), false)
    assert.equal(await scalar('select status from email_drafts where id=$1', [d]), 'draft')
    await query("update email_drafts set status='approved' where id=$1", [d])
    await query("update email_drafts set body='Modified after approval' where id=$1", [d])
    assert.equal(await scalar('select status from email_drafts where id=$1', [d]), 'draft')
    await query("update email_campaigns set state='approved' where id=$1", [c])
    const r4 = await contact('third@example.test')
    await query("update email_contacts set status='opted_in',consent_evidence=$2 where id=$1", [r4, consent])
    const d4 = await draft(c, r4)
    await asService()
    await query('update email_gmail_accounts set daily_budget=2 where account_key=$1', [account])
    const q4 = await scalar('select email_prepare_queue($1,$2,$3,$4)', [c, r4, d4, day])
    assert.equal(await scalar('select email_claim_send($1)', [q4]), null, 'App cap applies even with remaining shared account budget')
    const secretPrivilege = await scalar("select has_table_privilege('authenticated','workspace_gmail_connections','SELECT')")
    assert.equal(secretPrivilege, false)
    assert.equal(await scalar("select has_table_privilege('service_role','email_send_queue','UPDATE')"), false)
    // Inspect constraints and simulate historical time as the isolated DB owner only.
    await db.exec('reset role')
    await query("update email_send_queue set claimed_at=now()-interval '40 days',scheduled_day=(now() at time zone 'UTC')::date-40 where id=$1", [q])
    await query("update email_quota_reservations set reserved_at=now()-interval '40 days' where queue_id=$1", [q])
    await asUser(owner)
    await query("update email_campaigns set state='approved' where id=$1", [c])
    await query("update email_drafts set status='approved' where id=$1", [d])
    await asService()
    const q3 = await scalar('select email_prepare_queue($1,$2,$3,$4)', [c, r, d, day])
    await db.exec('reset role')
    await query("update products set source_facts='{" + '"archived":true' + "}' where id=$1", [app])
    await asService()
    await reject('select email_prepare_queue($1,$2,$3,$4)', [c, r, d, day], /Approved campaign/)
    assert.equal(await scalar('select email_claim_send($1)', [q3]), null, 'Archived app cannot dispatch')
    await db.exec('reset role')
    await query("update products set source_facts='{}' where id=$1", [app])
    await asService()
    assert.equal(await scalar('select email_claim_send($1)', [q3]), null, 'Unknown blocks exact recipient even beyond 30 days')
    await db.exec('reset role')
    await query("update email_send_queue set status='sent',claimed_at=now()-interval '10 days' where id=$1", [q])
    await asService()
    assert.equal(await scalar('select email_claim_send($1)', [q3]), null, 'Sent recipient has workspace-wide 30-day cooldown')
    await db.exec('reset role')
    await query("update email_send_queue set claimed_at=now()-interval '40 days' where id=$1", [q])
    await asService()
    assert.ok(await scalar('select email_claim_send($1)', [q3]), 'A sent recipient becomes eligible beyond cooldown')
    await query('select email_pause_workspace($1)', [w])
    assert.equal(await scalar('select state from email_campaigns where id=$1', [c]), 'paused')
    assert.equal(await scalar('select sending_enabled from email_campaigns where id=$1', [c]), false)
    assert.equal(await scalar('select status from email_send_queue where id=$1', [q3]), 'claimed', 'Pause cannot retract an already claimed request')
    assert.equal(await scalar('select status from email_send_queue where id=$1', [q4]), 'suppressed', 'Pause suppresses prepared requests')
  } finally { await db.close() }
})
