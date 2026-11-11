import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const migration = name => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')
const sql = await migration('20261111_email_draft_calendar')
const prior = await Promise.all(['20261109_email_campaigns', '20261109_email_no_repeat', '20261109_email_sender_preference',
  '20261109_email_status_metadata', '20261110_gmail_diagnostic', '20261111_email_lifecycle', '20261111_email_daily_campaigns'].map(migration))
const signature = 'public.get_email_daily_campaign_date_status(uuid,uuid,date)'
const campaignFields = ['id', 'workspace_id', 'product_id', 'scheduled_day', 'name', 'subject', 'body', 'app_store_url',
  'status', 'content_source', 'created_at', 'updated_at'].sort()

test('Exact-date migration adds only one read-only RPC and no delivery/provider mutations', () => {
  assert.match(sql, /begin;[\s\S]*commit;/)
  assert.equal((sql.match(/create function /gi) || []).length, 1)
  assert.match(sql, /create function public\.get_email_daily_campaign_date_status\([\s\S]*p_scheduled_day date\)/)
  assert.match(sql, /returns jsonb language plpgsql security definer set search_path = ''/)
  assert.doesNotMatch(sql, /create or replace|\b(?:insert into|update\s+public\.|delete from|alter table|drop|truncate)\b/i)
  assert.doesNotMatch(sql, /cron\.schedule|net\.http|http_post|vault\.|encrypted_credentials|refresh_token|access_token/i)
  assert.doesNotMatch(sql, /(?:from|join) public\.(?:email_campaigns|email_contacts|email_drafts|email_send_queue|email_quota_reservations|workspace_gmail_connections|workspace_openai_provider_credentials|email_suppressions)\b/i)
  assert.match(sql, /comment on function public\.get_email_daily_campaign_date_status\(uuid,uuid,date\)/)
  assert.match(sql, /notify pgrst, 'reload schema'/)
})

test('Exact-date migration checks locked membership, scoped active app and bounded finite date', () => {
  assert.match(sql, /auth\.uid\(\) is null[\s\S]*email_daily_campaign_lock_actor\(p_workspace_id,auth\.uid\(\)\)[\s\S]*'owner','admin','member'/)
  assert.match(sql, /p\.workspace_id = p_workspace_id and p\.id = p_product_id for share/)
  assert.match(sql, /source_facts->>'archived'/)
  assert.match(sql, /p_scheduled_day is null or not pg_catalog\.isfinite\(p_scheduled_day\)/)
  assert.match(sql, /p_scheduled_day < date '0001-01-01' or p_scheduled_day > date '9999-12-31'/)
  assert.doesNotMatch(sql, /p_scheduled_day\s*>\s*(?:v_day|current_date|now\(\))/)
  assert.match(sql, /now\(\) at time zone \(v_settings->>'timezone'\)/)
  assert.match(sql, /d\.workspace_id = p_workspace_id and d\.product_id = p_product_id\s+and d\.scheduled_day = p_scheduled_day limit 1/)
  assert.doesNotMatch(sql, /select\s+(?:\*|\w+\.\*)|limit 30|order by[\s\S]*created_at/i)
})

test('Exact-date migration grants only authenticated EXECUTE and no private table privileges', () => {
  assert.match(sql, /revoke all on function public\.get_email_daily_campaign_date_status\(uuid,uuid,date\)\s+from public, anon, authenticated, service_role;/)
  assert.match(sql, /grant execute on function public\.get_email_daily_campaign_date_status\(uuid,uuid,date\) to authenticated;/)
  assert.equal((sql.match(/\bgrant\s/gi) || []).length, 1)
  assert.doesNotMatch(sql, /grant\s+(?:select|insert|update|delete|all)\b|grant[\s\S]*on\s+table/i)
})

// Same optional local PostgreSQL-in-WASM fixture strategy as daily campaign tests.
// Synthetic data only: no production, browser, provider, or credentials are accessed.
let PGlite
try { ({ PGlite } = await import('@electric-sql/pglite')) }
catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error
  try { ({ PGlite } = await import('/tmp/email-db-validation/node_modules/@electric-sql/pglite/dist/index.js')) }
  catch (fallback) { if (fallback.code !== 'ERR_MODULE_NOT_FOUND') throw fallback }
}

test('Offline exact-date draft calendar contracts', { skip: !PGlite }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'flostudio-email-draft-calendar-'))
  const db = new PGlite(dir)
  const owner = '00000000-0000-0000-0000-000000000001'
  const admin = '00000000-0000-0000-0000-000000000002'
  const member = '00000000-0000-0000-0000-000000000003'
  const other = '00000000-0000-0000-0000-000000000004'
  const w = '10000000-0000-0000-0000-000000000001'
  const w2 = '10000000-0000-0000-0000-000000000002'
  const app = '20000000-0000-0000-0000-000000000001'
  const app2 = '20000000-0000-0000-0000-000000000002'
  const foreignApp = '20000000-0000-0000-0000-000000000003'
  const missingApp = '20000000-0000-0000-0000-000000000099'
  const link = 'https://apps.apple.com/us/app/synthetic-app/id123456789'
  const facts = { appId: '123456789', appStoreListing: { sourceUrl: link }, private_note: 'NOT-FOR-CALENDAR' }
  const q = (text, values = []) => db.query(text, values)
  const scalar = async (text, values = []) => Object.values((await q(text, values)).rows[0])[0]
  const root = () => db.exec('reset role')
  const as = async (id, role = 'authenticated') => {
    await root(); await q("select set_config('request.jwt.claim.sub',$1,false)", [id]); await db.exec(`set role ${role}`)
  }
  const status = (day, product = app, workspace = w) =>
    scalar('select public.get_email_daily_campaign_date_status($1,$2,$3::date)', [workspace, product, day])
  const oldStatus = (product = app, workspace = w) => scalar('select public.get_email_daily_campaign_status($1,$2)', [workspace, product])
  const savedRow = day => scalar(`select to_jsonb(d) - 'fixture_private_note' from public.email_daily_campaigns d
    where workspace_id=$1 and product_id=$2 and scheduled_day=$3::date limit 1`, [w, app, day])
  const insertDraft = (day, product = app, workspace = w, age = 0) => scalar(`insert into public.email_daily_campaigns
    (workspace_id,product_id,scheduled_day,name,subject,body,app_store_url,created_at,fixture_private_note)
    values($1,$2,$3::date,'Saved synthetic draft','Saved human subject',$4,$5,now()-($6::integer * interval '1 day'),'NOT-FOR-CALENDAR') returning id`,
  [workspace, product, day, `Saved human copy.\n${link}`, link, age])
  const snapshot = async () => {
    await root(); const result = {}
    for (const table of ['email_campaigns', 'email_contacts', 'email_drafts', 'email_send_queue', 'email_quota_reservations',
      'email_gmail_accounts', 'email_suppressions', 'workspace_email_preferences', 'email_cron_runs',
      'email_daily_campaign_settings', 'email_daily_campaigns']) {
      result[table] = (await q(`select to_jsonb(t) as row from public.${table} t order by to_jsonb(t)::text`)).rows
    }
    // Deliberately omit credential columns even from synthetic connection snapshots.
    result.workspace_gmail_connections = (await q(`select workspace_id,email,configured,sending_enabled,delivery_pause_reason
      from public.workspace_gmail_connections order by workspace_id`)).rows
    return result
  }
  const functions = () => q(`select oid::regprocedure::text as signature,prosrc,proacl::text as acl
    from pg_proc where pronamespace='public'::regnamespace and proname <> 'get_email_daily_campaign_date_status' order by signature`).then(r => r.rows)
  const constraints = () => q(`select conname,pg_get_constraintdef(oid) as definition from pg_constraint
    where connamespace='public'::regnamespace order by conname,definition`).then(r => r.rows)
  let before, functionsBefore, constraintsBefore, today, historyDay, futureDay, historyRow, futureRow
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
    await q('insert into products(id,workspace_id,product_url,source_facts) values($1,$2,$3,$4),($5,$2,$3,$4),($6,$7,$3,$4)',
      [app, w, link, facts, app2, foreignApp, w2])
    await q("insert into workspace_members values($1,$2,'admin'),($1,$3,'member'),($4,$3,'owner')", [w, admin, member, w2])
    for (const migrationSql of prior) await db.exec(migrationSql)
    const deliveryCampaign = await scalar('insert into email_campaigns(workspace_id,product_id) values($1,$2) returning id', [w, app])
    const contact = await scalar("insert into email_contacts(workspace_id,product_id,email) values($1,$2,'synthetic@example.test') returning id", [w, app])
    await as(owner)
    await q("update email_contacts set status='opted_in',consent_evidence=$2 where id=$1", [contact,
      { method: 'operator_recorded', reference: 'Synthetic explicit consent', recorded_at: '2020-01-01T00:00:00Z' }])
    const deliveryDraft = await scalar(`insert into email_drafts(workspace_id,product_id,campaign_id,contact_id,subject,body,status)
      values($1,$2,$3,$4,'Historical reviewed subject','Historical reviewed copy','approved') returning id`, [w, app, deliveryCampaign, contact])
    await root()
    const queue = await scalar(`insert into email_send_queue(workspace_id,product_id,campaign_id,contact_id,draft_id,email,scheduled_day,status,claimed_at,claim_token)
      values($1,$2,$3,$4,$5,'synthetic@example.test',current_date-100,'unknown',now()-interval '100 days','30000000-0000-0000-0000-000000000001') returning id`,
    [w, app, deliveryCampaign, contact, deliveryDraft])
    await q("insert into email_gmail_accounts(account_key,sending_enabled,delivery_pause_reason) values($1,true,'submission_unknown')", ['a'.repeat(64)])
    await q('insert into email_quota_reservations(queue_id,account_key) values($1,$2)', [queue, 'a'.repeat(64)])
    await q(`insert into workspace_gmail_connections(workspace_id,account_key,email,configured,created_by,delivery_pause_reason)
      values($1,$3,'synthetic-sender@example.test',false,$2,'submission_unknown')`, [w, owner, 'a'.repeat(64)])
    await as(owner)
    await scalar('select public.save_email_daily_campaign_settings($1,$2,true,$3,0)', [w, app, 'UTC'])
    await root()
    // Extra synthetic metadata proves the new RPC uses a fixed saved-field projection, not d.*.
    await db.exec('alter table public.email_daily_campaigns add column fixture_private_note text')
    today = await scalar("select (now() at time zone 'UTC')::date::text")
    historyDay = await scalar("select ((now() at time zone 'UTC')::date-35)::text")
    futureDay = await scalar("select ((now() at time zone 'UTC')::date+7)::text")
    await insertDraft(today)
    for (let i = 1; i <= 35; i++) {
      const day = await scalar("select ((now() at time zone 'UTC')::date-$1::integer)::text", [i])
      await insertDraft(day, app, w, i)
    }
    await insertDraft(futureDay)
    await insertDraft(historyDay, app2)
    await insertDraft(historyDay, foreignApp, w2)
    historyRow = await savedRow(historyDay); futureRow = await savedRow(futureDay)
    before = await snapshot(); functionsBefore = await functions(); constraintsBefore = await constraints()
    await db.exec(sql)

    await t.test('Migration preserves sender/queue/campaign data, existing RPCs and history constraints', async () => {
      assert.deepEqual(await snapshot(), before)
      assert.deepEqual(await functions(), functionsBefore)
      assert.deepEqual(await constraints(), constraintsBefore)
      const definition = await scalar(`select jsonb_build_object('securityDefiner',prosecdef,'config',proconfig,'description',obj_description(oid,'pg_proc'))
        from pg_proc where oid=$1::regprocedure`, [signature])
      assert.equal(definition.securityDefiner, true)
      assert.deepEqual(definition.config, ['search_path=""'])
      assert.match(definition.description, /Read-only/)
    })

    await t.test('ACLs allow authenticated EXECUTE only; all private daily table reads/writes remain denied', async () => {
      await root()
      for (const role of ['anon', 'authenticated', 'service_role']) {
        assert.equal(await scalar("select has_function_privilege($1,$2,'EXECUTE')", [role, signature]), role === 'authenticated')
        for (const table of ['email_daily_campaign_settings', 'email_daily_campaigns']) {
          assert.equal(await scalar('select relrowsecurity from pg_class where oid=$1::regclass', [`public.${table}`]), true)
          for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'])
            assert.equal(await scalar('select has_table_privilege($1,$2,$3)', [role, `public.${table}`, privilege]), false)
          await as(owner, role)
          await assert.rejects(q(`select workspace_id from public.${table} limit 1`), /permission denied/)
          await root()
        }
      }
      assert.equal(await scalar(`select count(*)::integer from pg_proc p, lateral aclexplode(p.proacl) a
        where p.oid=$1::regprocedure and a.grantee=0`, [signature]), 0, 'PUBLIC has no function grants')
      await as(owner, 'anon'); await assert.rejects(status(historyDay), /permission denied/)
      await as(owner, 'service_role'); await assert.rejects(status(historyDay), /permission denied/)
    })

    await t.test('Anonymous JWT, foreign workspace/app, missing product and forged owner labels fail closed', async () => {
      await as(''); await assert.rejects(status(historyDay), /EMAIL_DAILY_CAMPAIGN_MEMBER_REQUIRED/)
      await as(other); await assert.rejects(status(historyDay), /EMAIL_DAILY_CAMPAIGN_MEMBER_REQUIRED/)
      await as(owner)
      await assert.rejects(status(historyDay, foreignApp), /EMAIL_DAILY_CAMPAIGN_PRODUCT_NOT_FOUND/)
      await assert.rejects(status(historyDay, missingApp), /EMAIL_DAILY_CAMPAIGN_PRODUCT_NOT_FOUND/)
      await assert.rejects(status(historyDay, foreignApp, w2), /EMAIL_DAILY_CAMPAIGN_MEMBER_REQUIRED/)
      await as(member); await assert.rejects(status(historyDay, foreignApp, w2), /EMAIL_DAILY_CAMPAIGN_MEMBER_REQUIRED/)
    })

    await t.test('Owner/admin/member retrieve exactly one actual selected row with only approved saved fields', async () => {
      for (const actor of [owner, admin, member]) {
        await as(actor)
        const selected = await status(historyDay)
        assert.deepEqual(Object.keys(selected).sort(), ['campaigns', 'selected', 'selectedDay', 'settings', 'today'])
        assert.deepEqual(selected.campaigns, [historyRow])
        assert.deepEqual(Object.keys(selected.campaigns[0]).sort(), campaignFields)
        assert.equal(selected.selectedDay, historyDay)
        assert.deepEqual(selected.selected, { scheduled_day: historyDay, created: true })
        assert.deepEqual(selected.settings, (await oldStatus()).settings)
        assert.doesNotMatch(JSON.stringify(selected), /NOT-FOR-CALENDAR|source_facts|fixture_private_note|private_note/)
      }
      await root(); await assert.rejects(insertDraft(historyDay), /duplicate key value violates unique constraint/)
      await as(member)
      const otherApp = await status(historyDay, app2)
      assert.equal(otherApp.campaigns.length, 1)
      assert.equal(otherApp.campaigns[0].product_id, app2)
      assert.notEqual(otherApp.campaigns[0].id, historyRow.id)
    })

    await t.test('Saved history older than the existing last-30 cap remains accessible by exact date', async () => {
      await as(member)
      const recent = await oldStatus()
      assert.equal(recent.campaigns.length, 30)
      assert.ok(!recent.campaigns.some(c => c.id === historyRow.id))
      assert.deepEqual((await status(historyDay)).campaigns, [historyRow])
    })

    await t.test('Missing past and future dates return empty arrays and never synthesized draft content', async () => {
      await as(member)
      for (const day of ['1900-02-01', '2100-02-01', '0001-01-01', '9999-12-31']) {
        const selected = await status(day)
        assert.deepEqual(selected.campaigns, [])
        assert.equal(selected.selectedDay, day)
        assert.deepEqual(selected.selected, { scheduled_day: day, created: false })
        assert.deepEqual(selected.today, { scheduled_day: today, created: true })
      }
    })

    await t.test('Future dates are allowed and return only an already saved exact-date row', async () => {
      await as(member)
      const selected = await status(futureDay)
      assert.deepEqual(selected.campaigns, [futureRow])
      assert.equal(selected.selectedDay, futureDay)
      assert.deepEqual(selected.selected, { scheduled_day: futureDay, created: true })
    })

    await t.test('Historical selection does not redefine today or its actual existence; default settings match old RPC', async () => {
      await as(member)
      const old = await oldStatus()
      assert.deepEqual((await status(historyDay)).today, old.today)
      assert.deepEqual((await status(today)).today, old.today)
      assert.equal((await status(today)).campaigns[0].scheduled_day, today)
      const defaultOld = await oldStatus(app2)
      const empty = await status('1900-02-01', app2)
      assert.deepEqual(empty.settings, defaultOld.settings)
      assert.deepEqual(empty.settings, { workspace_id: w, product_id: app2, enabled: false, timezone: 'America/New_York',
        start_hour: 7, settings_revision: null, enabled_by: null, created_at: null, updated_at: null })
      assert.deepEqual(empty.today, defaultOld.today)
      assert.equal(empty.today.created, false)
      assert.equal(empty.today.scheduled_day, await scalar("select (now() at time zone 'America/New_York')::date::text"))
    })

    await t.test('Configured timezone rather than caller/session timezone determines server-local today', async () => {
      await root()
      const zone = await scalar(`select name from pg_timezone_names where name !~ '^(posix|right)/'
        and (now() at time zone name)::date <> (now() at time zone 'UTC')::date order by name limit 1`)
      assert.ok(zone)
      await db.exec('begin')
      try {
        await as(owner)
        await scalar('select public.save_email_daily_campaign_settings($1,$2,false,$3,7)', [w, app2, zone])
        await db.exec("set local timezone = 'UTC'")
        const selected = await status('1900-02-01', app2)
        const localDay = await scalar('select (now() at time zone $1)::date::text', [zone])
        assert.notEqual(localDay, today)
        assert.deepEqual(selected.today, { scheduled_day: localDay, created: false })
        assert.deepEqual(selected.today, (await oldStatus(app2)).today)
      } finally {
        // Roll back only the temporary fixture settings; no history guards are bypassed.
        await root(); await db.exec('rollback')
      }
    })

    await t.test('Archived availability and revoked memberships deny without changing old status behavior', async () => {
      await root(); await q('update public.products set source_facts=$2 where id=$1', [app, { ...facts, archived: true }])
      try {
        await as(member); await assert.rejects(status(historyDay), /EMAIL_DAILY_CAMPAIGN_APP_UNAVAILABLE/)
        assert.equal((await oldStatus()).campaigns.length, 30, 'Existing archived history RPC is unchanged')
      } finally { await root(); await q('update public.products set source_facts=$2 where id=$1', [app, facts]) }
      await q("update public.workspace_members set role='viewer' where workspace_id=$1 and user_id=$2", [w, member])
      try { await as(member); await assert.rejects(status(historyDay), /EMAIL_DAILY_CAMPAIGN_MEMBER_REQUIRED/) }
      finally { await root(); await q("update public.workspace_members set role='member' where workspace_id=$1 and user_id=$2", [w, member]) }
    })

    await t.test('Null, infinity and unsupported years fail closed; all read queries preserve sender/queue/campaign state', async () => {
      await as(owner)
      for (const day of [null, 'infinity', '-infinity', '0001-01-01 BC', '10000-01-01'])
        await assert.rejects(status(day), /EMAIL_DAILY_CAMPAIGN_DATE_INVALID/)
      for (const day of ['not-a-date', '2026-02-30'])
        await assert.rejects(status(day), /invalid input syntax|date\/time field value out of range/)
      const beforeReads = await snapshot()
      await as(member)
      for (const day of [historyDay, today, futureDay, '1900-02-01', '2100-02-01']) await status(day)
      assert.deepEqual(await snapshot(), beforeReads)
      assert.deepEqual(await snapshot(), before)
      assert.deepEqual(await functions(), functionsBefore)
      assert.deepEqual(await constraints(), constraintsBefore)
    })
  } finally {
    await db.close(); await rm(dir, { recursive: true, force: true })
  }
})
