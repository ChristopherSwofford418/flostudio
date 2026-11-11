import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import handler from '../api/email-campaigns.js'
import { dailyCampaignDeploymentStatus, dailyCampaignScheduledDay, getDailyCampaignStatus } from '../api/email-daily-campaign-settings.js'
import { SUPABASE_ANON_KEY } from '../api/provider-key-vault.js'

const W = '11111111-1111-4111-8111-111111111111'
const P = '22222222-2222-4222-8222-222222222222'
const D = '44444444-4444-4444-8444-444444444444'
const OTHER = '55555555-5555-4555-8555-555555555555'
const TOKEN = 'synthetic-calendar-session'
const TODAY = '2026-11-11'
const DAY = '2026-11-12'
const scope = { workspaceId: W, productId: P }
const dayError = { error: 'Choose a valid calendar date in YYYY-MM-DD format.', code: 'DAILY_CAMPAIGN_DAY_INVALID' }
const statusError = { error: 'The saved campaign drafts could not be verified for the selected app and date. Refresh and try again.', code: 'DAILY_CAMPAIGN_STATUS_INVALID' }
const invalidDays = [null, undefined, [], [DAY], {}, 20261112, true, '', '2026-1-12', '26-11-12', '2026-11-12T00:00:00Z', ' 2026-11-12', '2026-11-12 ', '2026-11-12\n', '2026-00-12', '2026-13-12', '2026-11-00', '2026-11-31', '2026-04-31', '2026-02-31', '2026-02-29', '1900-02-29', '0000-01-01', '2026-11-12&workspace_id=eq.foreign']
const response = () => ({ statusCode: 0, data: null, setHeader() {}, status(code) { this.statusCode = code; return this }, json(data) { this.data = data; return this } })
const req = (action = 'get_daily_campaign_status', patch = {}) => ({ method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: { ...scope, action, ...patch } })
const json = (data, status = 200) => new Response(JSON.stringify(data), { status })
const settings = () => ({ workspace_id: W, product_id: P, enabled: true, timezone: 'America/New_York', start_hour: 4, settings_revision: D, enabled_by: OTHER, created_at: '2026-11-10T09:00:00Z', updated_at: '2026-11-10T09:00:00Z' })
const campaign = (day = DAY) => ({ workspace_id: W, product_id: P, id: D, name: 'Saved app draft', scheduled_day: day, subject: 'Explore the listing', body: 'Read the current app listing. https://apps.apple.com/us/app/sample/id1234567890', app_store_url: 'https://apps.apple.com/us/app/sample/id1234567890', status: 'draft', content_source: 'listing_template', created_at: '2026-11-11T09:00:00Z', updated_at: '2026-11-11T09:00:00Z' })
const legacyStatus = () => ({ settings: settings(), campaigns: [campaign(TODAY)], today: { scheduled_day: TODAY, created: true } })
const datedStatus = (day = DAY, campaigns = [campaign(day)]) => ({ settings: settings(), campaigns, today: { scheduled_day: TODAY, created: true }, selectedDay: day, selected: { scheduled_day: day, created: campaigns.length === 1 } })

async function apiFixture(work, { dateResult = datedStatus(), legacyResult = legacyStatus(), role = 'member', productAvailable = true, authenticated = true, admin = false, dateStatus = 200 } = {}) {
  const previousFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input)
    const body = options.body ? JSON.parse(options.body) : null
    const method = options.method || 'GET'
    calls.push({ path: url.pathname, params: Object.fromEntries(url.searchParams), body, method, headers: options.headers })
    assert.equal(options.headers.Authorization, `Bearer ${TOKEN}`)
    if (url.pathname === '/auth/v1/user') return json(authenticated ? { id: OTHER } : {}, authenticated ? 200 : 401)
    if (url.pathname === '/rest/v1/rpc/get_workspace_role') {
      assert.deepEqual(body, { target_workspace_id: W })
      return json(role)
    }
    if (url.pathname === '/rest/v1/products') {
      assert.equal(url.searchParams.get('id'), `eq.${P}`)
      assert.equal(url.searchParams.get('workspace_id'), `eq.${W}`)
      assert.equal(url.searchParams.get('limit'), '1')
      return json(productAvailable ? [{ id: P, workspace_id: W }] : [])
    }
    if (url.pathname === '/rest/v1/rpc/is_workspace_admin') return json(admin)
    if (url.pathname === '/rest/v1/rpc/get_email_daily_campaign_status') {
      assert.equal(method, 'POST')
      assert.deepEqual(body, { p_workspace_id: W, p_product_id: P })
      return json(legacyResult)
    }
    if (url.pathname === '/rest/v1/rpc/get_email_daily_campaign_date_status') {
      assert.equal(method, 'POST')
      assert.deepEqual(Object.keys(body).sort(), ['p_product_id', 'p_scheduled_day', 'p_workspace_id'])
      assert.equal(body.p_workspace_id, W)
      assert.equal(body.p_product_id, P)
      assert.equal(dailyCampaignScheduledDay(body.p_scheduled_day), body.p_scheduled_day)
      assert.equal(options.headers.apikey, SUPABASE_ANON_KEY)
      return json(dateResult, dateStatus)
    }
    if (url.pathname === '/rest/v1/rpc/save_email_daily_campaign_settings' && admin) return json({ enabled: true })
    if (url.pathname === '/rest/v1/rpc/update_email_daily_campaign' && admin) return json({ status: 'draft' })
    throw new Error('Unexpected call: no direct private-table reads, providers, credentials, writes, queues or send routes allowed')
  }
  try { await work(calls) } finally { globalThis.fetch = previousFetch }
}

const clientSource = readFileSync(new URL('../src/lib/emailCampaignClient.js', import.meta.url), 'utf8').replace(/^import .*authenticatedApi.*$/m, 'const authenticatedHeaders = async () => ({}); const authenticatedJsonHeaders = () => globalThis.__draftCalendarHeaders();')
const { emailCampaignAction } = await import(`data:text/javascript;base64,${Buffer.from(clientSource).toString('base64')}`)
async function clientFixture(work) {
  const previousFetch = globalThis.fetch
  const previousHeaders = globalThis.__draftCalendarHeaders
  const calls = []
  let authCalls = 0
  globalThis.__draftCalendarHeaders = async () => { authCalls++; return { Authorization: `Bearer ${TOKEN}` } }
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) })
    return json({ dailyCampaign: datedStatus() })
  }
  try { await work(calls, () => authCalls) } finally {
    globalThis.fetch = previousFetch
    if (previousHeaders === undefined) delete globalThis.__draftCalendarHeaders
    else globalThis.__draftCalendarHeaders = previousHeaders
  }
}

function assertReadOnly(calls) {
  assert(!calls.some(call => /is_workspace_admin|save_|update_|claim_|create_|gmail|credential|openai|email_send|email_contacts|email_campaigns$/.test(call.path)))
  assert(calls.every(call => call.method === 'GET' || (call.method === 'POST' && ['/rest/v1/rpc/get_workspace_role', '/rest/v1/rpc/get_email_daily_campaign_status', '/rest/v1/rpc/get_email_daily_campaign_date_status'].includes(call.path))))
}

test('no-date API and helper retain the identical legacy RPC arguments and response', async () => {
  const legacy = { ...legacyStatus(), legacyExtension: 'preserved' }
  await apiFixture(async calls => {
    const res = response()
    await handler(req(), res)
    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.data, { dailyCampaign: legacy, deployment: dailyCampaignDeploymentStatus() })
    const result = await getDailyCampaignStatus({ ...scope, accessToken: TOKEN })
    assert.deepEqual(result, legacy)
    assert(!Object.hasOwn(result, 'selectedDay'))
    assert(!Object.hasOwn(result, 'selected'))
    assert.equal(calls.filter(call => call.path.endsWith('get_email_daily_campaign_status')).length, 2)
    assert(!calls.some(call => call.path.endsWith('get_email_daily_campaign_date_status')))
    assertReadOnly(calls)
  }, { legacyResult: legacy })
})

test('member dated API uses only the new protected JWT RPC with exact app/workspace/day scope', async () => apiFixture(async calls => {
  const res = response()
  await handler(req('get_daily_campaign_status', { scheduledDay: DAY, sending_enabled: true, generate: true, accessToken: 'foreign', p_workspace_id: OTHER }), res)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.data.dailyCampaign, datedStatus())
  assert.deepEqual(res.data.dailyCampaign.settings, settings())
  assert.deepEqual(res.data.dailyCampaign.today, { scheduled_day: TODAY, created: true })
  assert.deepEqual(res.data.dailyCampaign.selected, { scheduled_day: DAY, created: true })
  assert.equal(res.data.deployment.draftOnly, true)
  assert.equal(res.data.deployment.providerCalls, false)
  const dated = calls.filter(call => call.path.endsWith('get_email_daily_campaign_date_status'))
  assert.equal(dated.length, 1)
  assert.deepEqual(dated[0].body, { p_workspace_id: W, p_product_id: P, p_scheduled_day: DAY })
  assert(!calls.some(call => call.path.endsWith('get_email_daily_campaign_status')))
  assertReadOnly(calls)
}))

test('past date older than recent history returns its actual record, not a newest-30 filter', async () => {
  const past = '2020-02-29'
  const record = { ...campaign(past), created_at: '2020-02-29T09:00:00Z', updated_at: '2020-02-29T09:00:00Z' }
  await apiFixture(async calls => {
    const res = response()
    await handler(req('get_daily_campaign_status', { scheduledDay: past }), res)
    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.data.dailyCampaign.campaigns, [record])
    assert.equal(res.data.dailyCampaign.selectedDay, past)
    assert.deepEqual(res.data.dailyCampaign.today, { scheduled_day: TODAY, created: true })
    assert.equal(calls.find(call => call.path.endsWith('get_email_daily_campaign_date_status')).body.p_scheduled_day, past)
    assertReadOnly(calls)
  }, { dateResult: datedStatus(past, [record]) })
})

test('tomorrow and distant future empty dates report created false without placeholders or writes', async () => {
  for (const day of [DAY, '2099-12-31']) {
    await apiFixture(async calls => {
      const res = response()
      await handler(req('get_daily_campaign_status', { scheduledDay: day, generate: true }), res)
      assert.equal(res.statusCode, 200)
      assert.deepEqual(res.data.dailyCampaign.campaigns, [])
      assert.deepEqual(res.data.dailyCampaign.selected, { scheduled_day: day, created: false })
      assert.equal(res.data.dailyCampaign.selectedDay, day)
      assert.deepEqual(res.data.dailyCampaign.today, { scheduled_day: TODAY, created: true })
      assertReadOnly(calls)
    }, { dateResult: datedStatus(day, []) })
  }
})

test('strict actual calendar validation accepts leap days, past and future without timezone conversion', () => {
  for (const day of ['0001-01-01', '0099-12-31', '2000-02-29', '2024-02-29', TODAY, DAY, '9999-12-31']) assert.equal(dailyCampaignScheduledDay(day), day)
  for (const day of invalidDays) assert.throws(() => dailyCampaignScheduledDay(day), error => error.code === dayError.code && error.message === dayError.error)
})

test('API rejects supplied null, array, malformed and impossible dates before auth or network dispatch', async () => apiFixture(async calls => {
  for (const day of invalidDays) {
    const res = response()
    await handler(req('get_daily_campaign_status', { scheduledDay: day }), res)
    assert.equal(res.statusCode, 400, String(day))
    assert.deepEqual(res.data, dayError)
  }
  assert.deepEqual(calls, [])
}))

test('dated helper also rejects invalid dates and missing JWT before any RPC or privileged fallback', async () => apiFixture(async calls => {
  for (const scheduledDay of invalidDays) await assert.rejects(getDailyCampaignStatus({ ...scope, accessToken: TOKEN, scheduledDay }), error => error.code === dayError.code)
  await assert.rejects(getDailyCampaignStatus({ ...scope, accessToken: '', scheduledDay: DAY }), error => error.code === 'AUTH_REQUIRED' && error.status === 401)
  assert.deepEqual(calls, [])
}))

test('dated read preserves authentication, member and selected-product authorization gates', async () => {
  for (const options of [{ authenticated: false }, { role: null }, { productAvailable: false }]) {
    await apiFixture(async calls => {
      const res = response()
      await handler(req('get_daily_campaign_status', { scheduledDay: DAY }), res)
      assert.equal(res.statusCode, options.authenticated === false ? 401 : 403)
      assert(!calls.some(call => call.path.includes('email_daily_campaign')))
      assertReadOnly(calls)
    }, options)
  }
})

test('dated status fails closed on wrong workspace, app or day and malformed rows/envelopes', async () => {
  const invalid = [
    null, [], {},
    { ...datedStatus(), campaigns: null },
    { ...datedStatus(), campaigns: campaign() },
    datedStatus(DAY, [campaign(), campaign()]),
    datedStatus(DAY, [null]),
    datedStatus(DAY, [[]]),
    datedStatus(DAY, [{ ...campaign(), workspace_id: OTHER }]),
    datedStatus(DAY, [{ ...campaign(), product_id: OTHER }]),
    datedStatus(DAY, [{ ...campaign(), scheduled_day: TODAY }]),
    datedStatus(DAY, [{ ...campaign(), id: null }]),
    datedStatus(DAY, [{ ...campaign(), subject: null }]),
    datedStatus(DAY, [{ ...campaign(), body: '' }]),
    datedStatus(DAY, [{ ...campaign(), status: 'approved' }]),
    datedStatus(DAY, [{ ...campaign(), content_source: 'provider_generated' }]),
    datedStatus(DAY, [{ ...campaign(), created_at: 'not-a-date' }]),
    { ...datedStatus(), settings: { ...settings(), workspace_id: OTHER } },
    { ...datedStatus(), settings: { ...settings(), product_id: OTHER } },
    { ...datedStatus(), today: null },
    { ...datedStatus(), today: { scheduled_day: '2026-02-31', created: true } },
    { ...datedStatus(), today: { scheduled_day: TODAY, created: 'true' } },
    { ...datedStatus(), selectedDay: TODAY },
    { ...datedStatus(), selected: { scheduled_day: TODAY, created: true } },
    { ...datedStatus(), selected: { scheduled_day: DAY, created: false } },
    { ...datedStatus(DAY, []), selected: { scheduled_day: DAY, created: true } },
    { ...datedStatus(), selected: { scheduled_day: DAY, created: 'true' } },
  ]
  for (const dateResult of invalid) {
    await apiFixture(async calls => {
      const res = response()
      await handler(req('get_daily_campaign_status', { scheduledDay: DAY }), res)
      assert.equal(res.statusCode, 503)
      assert.deepEqual(res.data, statusError)
      assertReadOnly(calls)
    }, { dateResult })
  }
})

test('dated response only exposes the campaign field whitelist and fixed selection metadata', async () => {
  const dateResult = { ...datedStatus(DAY, [{ ...campaign(), access_token: 'never return', encrypted_credentials: 'never return' }]), accessToken: 'never return', selected: { scheduled_day: DAY, created: true, secret: 'never return' } }
  await apiFixture(async () => {
    const res = response()
    await handler(req('get_daily_campaign_status', { scheduledDay: DAY }), res)
    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.data.dailyCampaign, datedStatus())
    assert(!JSON.stringify(res.data).includes('never return'))
  }, { dateResult })
})

test('dated RPC failures expose no database details and never retry or create drafts', async () => apiFixture(async calls => {
  const res = response()
  await handler(req('get_daily_campaign_status', { scheduledDay: DAY }), res)
  assert.equal(res.statusCode, 500)
  assert.deepEqual(res.data, { code: 'EMAIL_DATABASE_ERROR', error: 'Email Campaigns could not complete the protected database operation.' })
  assert.equal(calls.filter(call => call.path.endsWith('get_email_daily_campaign_date_status')).length, 1)
  assertReadOnly(calls)
}, { dateResult: { message: 'private database details synthetic-secret' }, dateStatus: 500 }))

test('optional day is ignored on admin settings saves and edits; mutation and refresh args remain unchanged', async () => apiFixture(async calls => {
  const saveRes = response()
  await handler(req('save_daily_campaign_settings', { enabled: true, timezone: 'America/New_York', startHour: 4, scheduledDay: null }), saveRes)
  assert.equal(saveRes.statusCode, 200)
  const editRes = response()
  await handler(req('update_daily_campaign', { dailyCampaignId: D, subject: campaign().subject, body: campaign().body, scheduledDay: '2026-02-31' }), editRes)
  assert.equal(editRes.statusCode, 200)
  assert.deepEqual(calls.find(call => call.path.endsWith('save_email_daily_campaign_settings')).body, { p_workspace_id: W, p_product_id: P, p_enabled: true, p_timezone: 'America/New_York', p_start_hour: 4 })
  assert.deepEqual(calls.find(call => call.path.endsWith('update_email_daily_campaign')).body, { p_workspace_id: W, p_product_id: P, p_campaign_id: D, p_subject: campaign().subject, p_body: campaign().body })
  assert.equal(calls.filter(call => call.path.endsWith('get_email_daily_campaign_status')).length, 2)
  assert(!calls.some(call => call.path.endsWith('get_email_daily_campaign_date_status')))
}, { admin: true }))

test('client whitelists only scheduledDay, forces scope/action, and keeps no-date bodies identical', async () => clientFixture(async (calls, authCalls) => {
  await emailCampaignAction({ ...scope, action: 'get_daily_campaign_status', payload: { scheduledDay: DAY, workspaceId: OTHER, productId: OTHER, action: 'generate_drafts', sending_enabled: true, limit: 1000, accessToken: 'foreign', subject: 'foreign' } })
  assert.deepEqual(calls[0].body, { scheduledDay: DAY, ...scope, action: 'get_daily_campaign_status' })
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${TOKEN}`)
  await emailCampaignAction({ ...scope, action: 'get_daily_campaign_status', payload: { workspaceId: OTHER, productId: OTHER, action: 'set_state', scheduled_day: DAY, generate: true } })
  await emailCampaignAction({ ...scope, action: 'get_daily_campaign_status', payload: {} })
  await emailCampaignAction({ ...scope, action: 'get_daily_campaign_status' })
  for (const call of calls.slice(1)) assert.deepEqual(call.body, { ...scope, action: 'get_daily_campaign_status' })
  assert.equal(authCalls(), 4)
}))

test('client rejects impossible, malformed and nonstring dates before auth and network', async () => clientFixture(async (calls, authCalls) => {
  for (const scheduledDay of invalidDays) await assert.rejects(emailCampaignAction({ ...scope, action: 'get_daily_campaign_status', payload: { scheduledDay } }), { message: dayError.error })
  assert.equal(authCalls(), 0)
  assert.deepEqual(calls, [])
}))

test('client permits past and future valid dates without converting or replacing them', async () => clientFixture(async calls => {
  for (const scheduledDay of ['0001-01-01', '2000-02-29', DAY, '2099-12-31']) await emailCampaignAction({ ...scope, action: 'get_daily_campaign_status', payload: { scheduledDay } })
  assert.deepEqual(calls.map(call => call.body.scheduledDay), ['0001-01-01', '2000-02-29', DAY, '2099-12-31'])
}))

test('dated client rechecks stale app/role and aborted signal after asynchronous auth', async () => clientFixture(async calls => {
  for (const mode of ['stale', 'abort', 'invalid-current']) {
    let resolve
    let current = true
    const controller = new AbortController()
    globalThis.__draftCalendarHeaders = () => new Promise(done => { resolve = done })
    const pending = emailCampaignAction({ ...scope, action: 'get_daily_campaign_status', payload: { scheduledDay: DAY }, signal: controller.signal, isCurrent: mode === 'invalid-current' ? null : () => current })
    if (mode === 'stale') current = false
    if (mode === 'abort') controller.abort()
    resolve({ Authorization: `Bearer ${TOKEN}` })
    await assert.rejects(pending, error => error.name === 'AbortError')
  }
  assert.deepEqual(calls, [])
}))

test('dated client captures its validated day before auth so mutable overrides cannot replace scope or date', async () => clientFixture(async calls => {
  let resolve
  globalThis.__draftCalendarHeaders = () => new Promise(done => { resolve = done })
  const payload = { scheduledDay: DAY }
  const pending = emailCampaignAction({ ...scope, action: 'get_daily_campaign_status', payload })
  payload.scheduledDay = '2026-02-31'
  payload.workspaceId = OTHER
  payload.action = 'generate_drafts'
  resolve({ Authorization: `Bearer ${TOKEN}` })
  await pending
  assert.deepEqual(calls[0].body, { scheduledDay: DAY, ...scope, action: 'get_daily_campaign_status' })
}))
