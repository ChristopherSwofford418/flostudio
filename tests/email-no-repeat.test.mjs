import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const base = await readFile(new URL('../supabase/migrations/20261109_email_campaigns.sql', import.meta.url), 'utf8')
const sql = await readFile(new URL('../supabase/migrations/20261109_email_no_repeat.sql', import.meta.url), 'utf8')
const definition = name => {
  const match = sql.match(new RegExp(`create or replace function public\\.${name}\\([^]*?end \\$\\$;`, 'i'))
  assert.ok(match, `${name} replacement exists`)
  return match[0]
}
const prepare = definition('email_prepare_queue')
const claim = definition('email_claim_send')

// Contract: same service-only RPC signatures/results. Preparation rejects permanent
// reuse; claim returns NULL without reserving/sending. An unclaimed prepared queue is
// still idempotent. Exact subject/body may repeat for new contacts on the SAME app day,
// never a different day. Approval/consent must still be recorded by a human admin.
test('No-repeat migration is additive, transactional, does not change data or live flags', () => {
  assert.match(sql, /begin;[\s\S]*commit;/)
  assert.doesNotMatch(sql, /\b(?:drop|truncate|delete)\s+(?:table|column|from)|cron\.schedule|net\.http|http_post/i)
  assert.doesNotMatch(sql, /update public\.(?:email_campaigns|email_contacts|email_drafts|email_quota_reservations)|sending_enabled\s*=\s*true/i)
  assert.equal((sql.match(/create or replace function/g) || []).length, 2)
  assert.match(prepare, /p_campaign_id uuid, p_contact_id uuid, p_draft_id uuid, p_scheduled_day date\)[\s\S]*returns uuid/)
  assert.match(claim, /p_queue_id uuid\) returns public\.email_send_queue/)
  assert.match(sql, /create index if not exists email_queue_app_copy_day_idx[\s\S]*workspace_id, product_id, scheduled_day/)
})

test('Both entry points use workspace-wide permanent claim OR reservation evidence', () => {
  for (const fn of [prepare, claim]) {
    assert.match(fn, /previous\.workspace_id = [cq]\.workspace_id and previous\.email = [rq]\.email/)
    assert.match(fn, /previous\.claimed_at is not null or previous\.claim_token is not null/)
    assert.match(fn, /previous\.status in \('claimed','sent','unknown','failed'\)/)
    assert.match(fn, /exists \(select 1 from public\.email_quota_reservations quota where quota\.queue_id = previous\.id\)/)
    assert.doesNotMatch(fn, /recipient_cooldown_days|make_interval|last_contacted_at|previous\.claimed_at\s*>|quota\.reserved_at\s*>/)
    const start = fn.indexOf('if exists (select 1 from public.email_send_queue previous')
    const predicate = fn.slice(start, fn.indexOf('then', start))
    assert.doesNotMatch(predicate, /previous\.product_id|previous\.id\s*<>/)
  }
  assert.match(prepare, /raise exception 'Recipient already consumed by a workspace send attempt'/)
  assert.match(claim, /quota\.queue_id = previous\.id\)\)\) then return null; end if;/)
  assert.ok(prepare.indexOf('Recipient already consumed') < prepare.indexOf('insert into public.email_send_queue'))
  assert.ok(claim.indexOf('previous.email = q.email') < claim.indexOf('insert into public.email_quota_reservations'))
})

test('Both entry points compare immutable exact ad snapshots across different app local days', () => {
  for (const fn of [prepare, claim]) {
    assert.match(fn, /previous\.workspace_id = [cq]\.workspace_id and previous\.product_id = [cq]\.product_id/)
    assert.match(fn, /previous\.scheduled_day <> (?:p_scheduled_day|q\.scheduled_day)/)
    assert.match(fn, /previous\.subject_snapshot = d\.subject and previous\.body_snapshot = d\.body/)
    assert.doesNotMatch(fn, /previous\.draft_id = d\.id/)
  }
  assert.match(prepare, /raise exception 'Approved ad copy already consumed on another app local day'/)
})

test('Locks, scope, human approval, suppression, quotas and immutable one-shot outcomes remain intact', () => {
  for (const fn of [prepare, claim]) {
    assert.match(fn, /security definer set search_path = ''/)
    assert.match(fn, /pg_advisory_xact_lock\(hashtextextended\('email-workspace:'/)
    assert.match(fn, /source_facts->>'archived' = 'true'/)
    assert.match(fn, /public\.email_suppressions/)
    assert.match(fn, /r\.status <> 'opted_in'/)
    assert.match(fn, /d\.status <> 'approved'/)
  }
  assert.match(claim, /id = p_queue_id for update/)
  assert.match(claim, /workspace_id = q\.workspace_id for share/)
  assert.match(claim, /account_key = conn\.account_key for update/)
  assert.match(claim, /item\.campaign_id = c\.id and item\.scheduled_day = q\.scheduled_day\) >= c\.daily_limit/)
  assert.match(claim, /least\(account\.daily_budget, min\(connection\.daily_budget\)\)/)
  assert.match(claim, /reserved_at > now\(\) - interval '24 hours'\) >= budget/)
  assert.match(claim, /subject_snapshot = d\.subject, body_snapshot = d\.body/)
  assert.match(claim, /sender_snapshot = jsonb_build_object/)
  assert.match(claim, /q\.status <> 'prepared' then return null/)
  assert.doesNotMatch(sql, /set status = 'prepared'|create or replace function public\.email_(?:finish_send|guard_mutation)/)
  assert.match(base, /Terminal outcomes cannot be retried or overwritten/)
  assert.match(base, /Human admin approval required/)
  assert.match(base, /Human draft approval required/)
  assert.match(base, /Manual admin consent recording required/)
  for (const [name, args] of [['email_prepare_queue', 'uuid,uuid,uuid,date'], ['email_claim_send', 'uuid']]) {
    assert.ok(sql.includes(`revoke all on function public.${name}(${args}) from public, anon, authenticated;`))
  }
  assert.match(sql, /grant execute[^;]+to service_role;/)
  assert.doesNotMatch(sql, /grant (?:execute|insert|update|delete)[^;]+to (?:public|anon|authenticated)/i)
})

// Never connects to Supabase or any provider. Optional local PGlite runtime only:
// EMAIL_TEST_PGLITE_MODULE=/absolute/path/@electric-sql/pglite/dist/index.js
// node --test tests/email-no-repeat.test.mjs
const modulePath = process.env.EMAIL_TEST_PGLITE_MODULE
let PGlite
if (modulePath) ({ PGlite } = await import(modulePath))

test('Isolated PostgreSQL no-repeat behavior and preserved dispatch safety', { skip: !PGlite }, async t => {
  const db = new PGlite()
  const owner = '00000000-0000-0000-0000-000000000001'
  const other = '00000000-0000-0000-0000-000000000002'
  const w = '10000000-0000-0000-0000-000000000001'
  const w2 = '10000000-0000-0000-0000-000000000002'
  const app = '20000000-0000-0000-0000-000000000001'
  const app2 = '20000000-0000-0000-0000-000000000002'
  const app3 = '20000000-0000-0000-0000-000000000003'
  const disabledApp = '20000000-0000-0000-0000-000000000004'
  const account = 'a'.repeat(64)
  const consent = { method: 'operator_recorded', reference: 'Synthetic explicit opt-in', recorded_at: '2020-01-01T00:00:00Z' }
  const envelope = { version: 1, algorithm: 'aes-256-gcm', iv: 'iv', tag: 'tag', ciphertext: 'ciphertext' }
  const query = (text, values = []) => db.query(text, values)
  const scalar = async (text, values = []) => Object.values((await query(text, values)).rows[0])[0]
  const reject = (text, values, pattern) => assert.rejects(query(text, values), pattern)
  const asUser = async (id, role = 'authenticated') => {
    await db.exec('reset role')
    await query("select set_config('request.jwt.claim.sub', $1, false)", [id])
    await db.exec(`set role ${role}`)
  }
  const service = () => asUser('', 'service_role')
  let c, c2, c3, disabled, day
  const workspaceFor = product => product === app3 ? w2 : w
  const userFor = product => product === app3 ? other : owner
  const make = async (email, product = app, subject = 'Human reviewed new ad', body = 'Human reviewed body', optedIn = true, approved = true) => {
    await asUser(userFor(product))
    const workspace = workspaceFor(product)
    const campaign = product === app3 ? c3 : product === app2 ? c2 : c
    const r = await scalar('insert into email_contacts(workspace_id,product_id,email) values($1,$2,$3) returning id', [workspace, product, email])
    if (optedIn) await query("update email_contacts set status='opted_in',consent_evidence=$2 where id=$1", [r, consent])
    const d = await scalar('insert into email_drafts(workspace_id,product_id,campaign_id,contact_id,subject,body,status) values($1,$2,$3,$4,$5,$6,$7) returning id', [workspace, product, campaign, r, subject, body, approved ? 'approved' : 'draft'])
    return { c: campaign, r, d, email, product, workspace }
  }
  const prepareRow = async row => {
    await service()
    return scalar('select email_prepare_queue($1,$2,$3,$4)', [row.c, row.r, row.d, day])
  }
  const claimRow = async q => {
    await service()
    return scalar('select email_claim_send($1)', [q])
  }
  const finish = async (q, outcome) => {
    await service()
    const token = await scalar('select claim_token from email_send_queue where id=$1', [q])
    await query('select email_finish_send($1,$2,$3,$4)', [q, token, outcome, outcome === 'sent' ? `synthetic-${q}` : null])
    return token
  }
  const age = async q => {
    await db.exec('reset role')
    await query("update email_send_queue set claimed_at=now()-interval '5000 days',scheduled_day=(now() at time zone 'UTC')::date-5000 where id=$1", [q])
    await query("update email_quota_reservations set reserved_at=now()-interval '5000 days' where queue_id=$1", [q])
  }
  const reservations = async () => {
    await service()
    return Number(await scalar('select count(*) from email_quota_reservations'))
  }
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
      grant usage on schema auth to authenticated, service_role;
      grant execute on function auth.uid() to authenticated, service_role;
      create table public.workspaces(id uuid primary key, owner_user_id uuid references auth.users);
      create table public.products(id uuid primary key, workspace_id uuid references public.workspaces, source_facts jsonb default '{}');
      create function public.is_workspace_admin(target_workspace_id uuid) returns boolean language sql stable security definer as $$
        select exists(select 1 from public.workspaces where id=target_workspace_id and owner_user_id=auth.uid()) $$;
      create function public.get_workspace_role(target_workspace_id uuid) returns text language sql stable security definer as $$
        select case when public.is_workspace_admin(target_workspace_id) then 'owner' else 'none' end $$;
    `)
    await query('insert into auth.users values($1),($2)', [owner, other])
    await query('insert into workspaces values($1,$2),($3,$4)', [w, owner, w2, other])
    await query('insert into products(id,workspace_id) values($1,$2),($3,$2),($4,$5),($6,$2)', [app, w, app2, app3, w2, disabledApp])
    await db.exec(base)
    const campaign = async (product, enabled = true) => {
      await asUser(userFor(product))
      const id = await scalar("insert into email_campaigns(workspace_id,product_id,send_hour,sender_name,postal_address,ad_link,recipient_cooldown_days) values($1,$2,0,'Human Sender','123 Test Street','https://example.test',3650) returning id", [workspaceFor(product), product])
      if (enabled) await query("update email_campaigns set state='approved' where id=$1", [id])
      return id
    }
    c = await campaign(app)
    c2 = await campaign(app2)
    c3 = await campaign(app3)
    disabled = await campaign(disabledApp, false)
    await service()
    await query('insert into email_gmail_accounts(account_key,sending_enabled) values($1,true)', [account])
    for (const [workspace, user] of [[w, owner], [w2, other]]) {
      await query('insert into workspace_gmail_connections(workspace_id,account_key,email,configured,sending_enabled,encrypted_credentials,created_by) values($1,$2,$3,true,true,$4,$5)', [workspace, account, 'sender@example.test', envelope, user])
    }
    day = await scalar("select (now() at time zone 'UTC')::date::text")

    // Real synthetic claims under the OLD migration, then aged by the isolated DB owner.
    // Also prepare legacy pending rows before the new checks exist to prove claim rechecks.
    const history = []
    for (const outcome of ['claimed', 'sent', 'unknown', 'failed']) {
      const row = await make(`${outcome}@example.test`, app, `Legacy ${outcome}`, `Legacy ${outcome} body`)
      const q = await prepareRow(row)
      assert.ok(await claimRow(q))
      if (outcome !== 'claimed') await finish(q, outcome)
      await age(q)
      const pendingRow = await make(row.email, app2, `Brand new ${outcome}`, 'Different human reviewed body')
      const pending = await prepareRow(pendingRow)
      history.push({ outcome, row, q, pendingRow, pending })
    }
    // Reservation-only legacy history must also be permanent, even if claim fields are absent.
    const reservationRow = await make('reserved@example.test', app, 'Reserved copy', 'Reserved body')
    const reserved = await prepareRow(reservationRow)
    assert.ok(await claimRow(reserved))
    await finish(reserved, 'failed')
    await age(reserved)
    await db.exec('reset role')
    await query("update email_send_queue set status='suppressed',claimed_at=null,claim_token=null where id=$1", [reserved])
    const reservedPendingRow = await make(reservationRow.email, app2, 'Reserved replacement', 'Different body')
    const reservedPending = await prepareRow(reservedPendingRow)
    const copyPendingRow = await make('copy-pending@example.test', app, 'Legacy sent', 'Legacy sent body')
    const copyPending = await prepareRow(copyPendingRow)
    await db.exec('reset role')
    const before = (await query('select id,status,claim_token,claimed_at,scheduled_day,subject_snapshot,body_snapshot from email_send_queue order by id')).rows
    const flags = (await query('select id,state,sending_enabled,approved_by,approved_at from email_campaigns order by id')).rows
    const quotasBefore = (await query('select queue_id,account_key,reserved_at from email_quota_reservations order by queue_id')).rows
    await db.exec(sql)

    await t.test('Applying additive SQL locally preserves historical rows, reservations, disabled flags and ACLs', async () => {
      assert.deepEqual((await query('select id,status,claim_token,claimed_at,scheduled_day,subject_snapshot,body_snapshot from email_send_queue order by id')).rows, before)
      assert.deepEqual((await query('select id,state,sending_enabled,approved_by,approved_at from email_campaigns order by id')).rows, flags)
      assert.deepEqual((await query('select queue_id,account_key,reserved_at from email_quota_reservations order by queue_id')).rows, quotasBefore)
      assert.equal(await scalar('select sending_enabled from email_campaigns where id=$1', [disabled]), false)
      for (const signature of ['email_prepare_queue(uuid,uuid,uuid,date)', 'email_claim_send(uuid)']) {
        for (const role of ['anon', 'authenticated']) assert.equal(await scalar('select has_function_privilege($1,$2,\'EXECUTE\')', [role, signature]), false)
        assert.equal(await scalar('select has_function_privilege(\'service_role\',$1,\'EXECUTE\')', [signature]), true)
      }
      for (const table of ['email_send_queue', 'email_quota_reservations']) {
        for (const privilege of ['INSERT', 'UPDATE', 'DELETE']) assert.equal(await scalar('select has_table_privilege(\'service_role\',$1,$2)', [table, privilege]), false)
      }
      const definitions = (await query("select prosecdef,proconfig from pg_proc where oid in ('email_prepare_queue(uuid,uuid,uuid,date)'::regprocedure,'email_claim_send(uuid)'::regprocedure)")).rows
      assert.equal(definitions.length, 2)
      for (const fn of definitions) { assert.equal(fn.prosecdef, true); assert.ok(fn.proconfig.includes('search_path=""')) }
    })

    await t.test('Claimed/sent/failed/unknown stay excluded beyond 5000 days across apps at prepare AND claim', async () => {
      const count = await reservations()
      for (const { outcome, row, pendingRow, pending, q } of history) {
        await service()
        for (const candidate of [row, pendingRow]) await reject('select email_prepare_queue($1,$2,$3,$4)', [candidate.c, candidate.r, candidate.d, day], /Recipient already consumed/)
        assert.equal(await claimRow(pending), null, `${outcome} history must block a legacy prepared queue on another app`)
        assert.equal(await claimRow(q), null, 'Original claimed or terminal queue is not retryable')
      }
      assert.equal(await reservations(), count, 'Rejected claims consume no additional quota')
      const token = await scalar('select claim_token from email_send_queue where id=$1', [history.find(x => x.outcome === 'unknown').q])
      await reject('select email_finish_send($1,$2,$3,$4)', [history.find(x => x.outcome === 'unknown').q, token, 'sent', 'synthetic'], /Terminal outcomes/)
    })

    await t.test('Old reservation alone blocks preparation/claim even without claim fields or active status', async () => {
      await service()
      await reject('select email_prepare_queue($1,$2,$3,$4)', [reservedPendingRow.c, reservedPendingRow.r, reservedPendingRow.d, day], /Recipient already consumed/)
      assert.equal(await claimRow(reservedPending), null)
      // Self-reservation on a prepared row also returns NULL instead of duplicate-key/retry.
      await db.exec('reset role')
      await query("update email_send_queue set status='prepared' where id=$1", [reserved])
      assert.equal(await claimRow(reserved), null)
    })

    await t.test('Copy reuse across different local days is rejected at preparation and atomic claim', async () => {
      const copy = await make('copy-new@example.test', app, 'Legacy sent', 'Legacy sent body')
      const count = await reservations()
      await service()
      await reject('select email_prepare_queue($1,$2,$3,$4)', [copy.c, copy.r, copy.d, day], /ad copy already consumed/)
      assert.equal(await claimRow(copyPending), null, 'Pre-existing prepared copy is rechecked before claim')
      assert.equal(await reservations(), count)
      // It is immutable snapshot text, not current mutable draft contents/identity.
      const old = history.find(x => x.outcome === 'sent')
      await asUser(owner)
      await query("update email_drafts set subject='Changed legacy draft',body='Changed legacy draft body' where id=$1", [old.row.d])
      await service()
      await reject('select email_prepare_queue($1,$2,$3,$4)', [copy.c, copy.r, copy.d, day], /ad copy already consumed/)
      assert.equal(await scalar('select subject_snapshot from email_send_queue where id=$1', [old.q]), 'Legacy sent')
    })

    await t.test('Fresh contacts/new ads work; same-day copy is allowed; repeated recipients never are', async () => {
      const fresh = await make('fresh@example.test', app, 'A genuinely newly reviewed subject', 'A new body')
      const q = await prepareRow(fresh)
      assert.equal(await prepareRow(fresh), q, 'Unclaimed prepare remains idempotent')
      assert.ok(await claimRow(q))
      assert.equal(await claimRow(q), null)
      const token = await finish(q, 'failed')
      await finish(q, 'failed')
      await reject('select email_finish_send($1,$2,$3)', [q, token, 'unknown'], /Terminal outcomes/)
      await reject('select email_prepare_queue($1,$2,$3,$4)', [fresh.c, fresh.r, fresh.d, day], /Recipient already consumed/)
      const sameDay = await make('fresh-same-day@example.test', app, 'A genuinely newly reviewed subject', 'A new body')
      assert.ok(await claimRow(await prepareRow(sameDay)), 'Same day ad can go to another NEW recipient')
      // Both subject and body participate: a newly reviewed subject OR body avoids exact match.
      const subjectChanged = await make('changed-subject@example.test', app, 'Legacy sent with new subject', 'Legacy sent body')
      const bodyChanged = await make('changed-body@example.test', app, 'Legacy sent', 'Legacy sent with new body')
      assert.ok(await claimRow(await prepareRow(subjectChanged)))
      assert.ok(await claimRow(await prepareRow(bodyChanged)))
    })

    await t.test('Workspaces stay isolated; ad reuse on a different app is allowed; cross-app recipient collision is serialized', async () => {
      const elsewhere = await make('sent@example.test', app3, 'Legacy sent', 'Legacy sent body')
      assert.ok(await claimRow(await prepareRow(elsewhere)), 'Another workspace may use the same address/copy')
      const crossAppCopy = await make('different-app@example.test', app2, 'Legacy sent', 'Legacy sent body')
      assert.ok(await claimRow(await prepareRow(crossAppCopy)), 'Copy restriction is per workspace/product')
      const first = await make('race@example.test', app, 'Race first', 'Race first body')
      const q1 = await prepareRow(first)
      await db.exec('reset role')
      await query("update email_send_queue set scheduled_day=(now() at time zone 'UTC')::date-1 where id=$1", [q1])
      const second = await make(first.email, app2, 'Race second', 'Race second body')
      const q2 = await prepareRow(second)
      await db.exec('reset role')
      await query("update email_send_queue set scheduled_day=(now() at time zone 'UTC')::date where id=$1", [q1]).then(
        () => assert.fail('Existing workspace/email/day uniqueness must hold'),
        error => assert.match(error.message, /unique constraint/)
      )
      // Distinct timezone local days permit both pending rows; the workspace lock and
      // permanent evidence check must still allow only ONE claim (PGlite serial execution).
      await query("update email_campaigns set timezone='Etc/GMT+12' where id=$1", [c])
      await asUser(owner)
      await query("update email_campaigns set state='approved' where id=$1", [c])
      await query("update email_drafts set status='approved' where id=$1", [first.d])
      await db.exec('reset role')
      const localDay = await scalar("select (now() at time zone 'Etc/GMT+12')::date::text")
      if (localDay === day) {
        await query("update email_campaigns set timezone='Etc/GMT-12' where id=$1", [c])
        await asUser(owner)
        await query("update email_campaigns set state='approved' where id=$1", [c])
        await query("update email_drafts set status='approved' where id=$1", [first.d])
      }
      await db.exec('reset role')
      await query("update email_send_queue set status='prepared',scheduled_day=(now() at time zone (select timezone from email_campaigns where id=$2))::date where id=$1", [q1, c])
      assert.ok(await claimRow(q1))
      assert.equal(await claimRow(q2), null, 'Another app/local day cannot claim the same address')
      await asUser(owner)
      await query("update email_campaigns set timezone='UTC' where id=$1", [c])
      await query("update email_campaigns set state='approved' where id=$1", [c])
    })

    await t.test('Candidate/unapproved/suppressed/archived recipients and disabled campaigns cannot send', async () => {
      const candidate = await make('candidate@example.test', app, 'Candidate ad', 'Candidate body', false)
      const unapproved = await make('unapproved@example.test', app, 'Unapproved ad', 'Unapproved body', true, false)
      for (const row of [candidate, unapproved]) {
        await service()
        await reject('select email_prepare_queue($1,$2,$3,$4)', [row.c, row.r, row.d, day], /Approved campaign/)
      }
      const revoked = await make('revoked@example.test', app, 'Revoked ad', 'Revoked body')
      const q = await prepareRow(revoked)
      await asUser(owner)
      await query("update email_contacts set status='candidate' where id=$1", [revoked.r])
      assert.equal(await claimRow(q), null)
      assert.equal(await scalar('select status from email_send_queue where id=$1', [q]), 'suppressed')
      const changed = await make('draft-changed@example.test', app, 'Changed ad', 'Changed body')
      const changedQ = await prepareRow(changed)
      await asUser(owner)
      await query("update email_drafts set body='New unreviewed body' where id=$1", [changed.d])
      assert.equal(await scalar('select status from email_drafts where id=$1', [changed.d]), 'draft')
      assert.equal(await claimRow(changedQ), null)
      const suppressed = await make('suppressed@example.test', app, 'Suppressed ad', 'Suppressed body')
      const suppressedQ = await prepareRow(suppressed)
      await asUser(owner)
      await query('insert into email_suppressions(workspace_id,email) values($1,$2)', [w, suppressed.email])
      assert.equal(await claimRow(suppressedQ), null)
      await reject('select email_prepare_queue($1,$2,$3,$4)', [suppressed.c, suppressed.r, suppressed.d, day], /Approved campaign/)
      const archived = await make('archived@example.test', app, 'Archived ad', 'Archived body')
      const archivedQ = await prepareRow(archived)
      await db.exec('reset role')
      await query('update products set source_facts=$2 where id=$1', [app, { archived: true }])
      assert.equal(await claimRow(archivedQ), null)
      await reject('select email_prepare_queue($1,$2,$3,$4)', [archived.c, archived.r, archived.d, day], /Approved campaign/)
      await db.exec('reset role')
      await query("update products set source_facts='{}' where id=$1", [app])
      await asUser(owner)
      await query("update email_campaigns set state='paused' where id=$1", [c])
      assert.equal(await claimRow(archivedQ), null)
      await asUser(owner)
      await query("update email_campaigns set state='approved' where id=$1", [c])
      await query('update email_campaigns set daily_limit=99 where id=$1', [c])
      await service()
      await reject("update email_campaigns set state='approved' where id=$1", [c], /permission denied/)
      await asUser(owner)
      await query("update email_campaigns set state='approved' where id=$1", [c])
      assert.equal(await scalar('select sending_enabled from email_campaigns where id=$1', [disabled]), false)
    })

    await t.test('App-day quota and shared rolling-24h account quota still reject claims without reservation', async () => {
      const row = await make('quota@example.test', app, 'Quota new subject', 'Quota new body')
      const q = await prepareRow(row)
      const count = await reservations()
      await asUser(owner)
      await query('update email_campaigns set daily_limit=1 where id=$1', [c])
      await query("update email_campaigns set state='approved' where id=$1", [c])
      await query("update email_drafts set status='approved' where id=$1", [row.d])
      // Campaign edit intentionally suppresses unapproved pending drafts; restore only
      // fixture queue status as isolated owner after actual HUMAN draft reapproval.
      await db.exec('reset role')
      await query("update email_send_queue set status='prepared' where id=$1", [q])
      assert.equal(await claimRow(q), null, 'App-day quota exhausted by existing reservations')
      await asUser(owner)
      await query('update email_campaigns set daily_limit=100 where id=$1', [c])
      await query("update email_campaigns set state='approved' where id=$1", [c])
      await query("update email_drafts set status='approved' where id=$1", [row.d])
      await db.exec('reset role')
      await query("update email_send_queue set status='prepared' where id=$1", [q])
      await service()
      await query('update email_gmail_accounts set daily_budget=1 where account_key=$1', [account])
      assert.equal(await claimRow(q), null, 'Shared rolling quota exhausted by recent reservations')
      assert.equal(await reservations(), count)
      await query('update email_gmail_accounts set daily_budget=400 where account_key=$1', [account])
      assert.ok(await claimRow(q), 'Fresh recipient becomes claimable when quota exists')
      const after = (await query('select status,subject_snapshot,body_snapshot,sender_snapshot from email_send_queue where id=$1', [q])).rows[0]
      assert.equal(after.status, 'claimed')
      assert.equal(after.subject_snapshot, 'Quota new subject')
      assert.equal(after.body_snapshot, 'Quota new body')
      assert.equal(after.sender_snapshot.sender_name, 'Human Sender')
    })
  } finally { await db.close() }
})
