import test, { beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import cronHandler, {
  config, createEmailDailyCampaignCronHandler, runEmailDailyCampaignBatch,
  EMAIL_DAILY_CAMPAIGN_BATCH_LIMIT, EMAIL_DAILY_CAMPAIGN_SAVE_CONCURRENCY,
  EMAIL_DAILY_CAMPAIGN_DEADLINE_MS, EMAIL_DAILY_CAMPAIGN_SAVE_BLOCKER_CODES,
} from '../api/email-daily-campaign-cron.js'
import { buildDailyEmailCampaignContent, EMAIL_DAILY_CAMPAIGN_BLOCKER_CODES } from '../api/email-daily-campaign-content.js'

const W = '11111111-1111-4111-8111-111111111111'
const P = '22222222-2222-4222-8222-222222222222'
const R = '33333333-3333-4333-8333-333333333333'
const APP = '6781106756'
const LINK = `https://apps.apple.com/us/app/matterprep-legal-ai-help/id${APP}`
const row = (ordinal = 0) => ({ workspace_id:W, product_id:ordinal ? `product-${ordinal}` : P, scheduled_day:'2026-11-11', settings_revision:R, language:'en',
  product:{ id:ordinal ? `product-${ordinal}` : P, name:'MatterPrep: Legal AI Help', product_url:LINK,
    source_facts:{ appId:APP, storeMetadata:{ trackUrl:`${LINK}?uo=4`, description:'Organize your documents. Guaranteed legal victory.' } } } })
const envNames = ['CRON_SECRET', 'EMAIL_DAILY_CAMPAIGN_CRON_ENABLED', 'SUPABASE_SERVICE_ROLE_KEY',
  'EMAIL_RESEARCH_CRON_ENABLED', 'EMAIL_CRON_ENABLED', 'EMAIL_LIVE_SENDING_ENABLED', 'EMAIL_SENDING_ENABLED',
  'OPENAI_API_KEY', 'OPENAI_EMAIL_TEXT_MODEL', 'GOOGLE_EMAIL_CLIENT_ID', 'GOOGLE_EMAIL_CLIENT_SECRET', 'EMAIL_CREDENTIALS_ENCRYPTION_KEY']
let originalEnv, originalFetch, due, events, ack, failure, clock
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers:{ 'Content-Type':'application/json' } })
const response = () => ({ headers:{}, statusCode:0, data:null,
  setHeader(key, value) { this.headers[key] = value }, status(code) { this.statusCode = code; return this }, json(body) { this.data = body; return this } })
const saves = () => events.filter(event => event.name === 'email_save_daily_campaign')
async function invoke(request = {}, dependencies = {}) {
  const res = response()
  await createEmailDailyCampaignCronHandler({ now:() => clock, ...dependencies })({ method:'GET', headers:{ authorization:'Bearer unit-cron-secret' }, ...request }, res)
  return res
}
function assertOpaque(body) {
  const allowed = new Set(['disabled', 'due', 'created', 'skipped', 'blocked', 'failed', 'blockers', 'code'])
  assert(Object.keys(body).every(key => allowed.has(key)))
  const publicBlockers = new Set([...EMAIL_DAILY_CAMPAIGN_BLOCKER_CODES, ...EMAIL_DAILY_CAMPAIGN_SAVE_BLOCKER_CODES, 'EMAIL_DAILY_CAMPAIGN_DEADLINE_EXCEEDED'])
  if (body.blockers) assert(Object.keys(body.blockers).every(key => publicBlockers.has(key)))
  const text = JSON.stringify(body)
  for (const privateText of [W, P, R, APP, LINK, 'MatterPrep', 'documents', 'PRIVATE', 'unit-cron-secret', 'synthetic-service-role', 'private@example.com', 'GLOBAL-KEY']) assert(!text.includes(privateText), `Response leaked ${privateText}`)
}
beforeEach(() => {
  originalEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]))
  for (const name of envNames) delete process.env[name]
  Object.assign(process.env, { CRON_SECRET:'unit-cron-secret', EMAIL_DAILY_CAMPAIGN_CRON_ENABLED:'true', SUPABASE_SERVICE_ROLE_KEY:'synthetic-service-role' })
  originalFetch = globalThis.fetch
  due = [row()]; events = []; ack = { created:true, code:'EMAIL_DAILY_CAMPAIGN_CREATED' }; failure = null; clock = 5000
  globalThis.fetch = async (input, options) => {
    const url = new URL(input)
    assert.equal(url.origin, 'https://jtogllurcrxxaguoxeus.supabase.co', 'No network beyond exact storage RPCs')
    const name = url.pathname.replace('/rest/v1/rpc/', '')
    assert(['email_due_daily_campaigns', 'email_save_daily_campaign'].includes(name), 'No recipients, messages, queues, provider credentials, tables, or extra RPCs')
    assert.equal(options.method, 'POST'); assert.equal(url.search, '')
    assert.equal(options.headers.apikey, 'synthetic-service-role'); assert.equal(options.headers.Authorization, 'Bearer synthetic-service-role')
    assert(options.signal)
    const body = JSON.parse(options.body); events.push({ name, body })
    if (name === failure) return json({ code:'PRIVATE', details:`${W} ${P} ${R} ${LINK}`, message:'PRIVATE storage failure private@example.com' }, 500)
    if (name === 'email_due_daily_campaigns') { assert.deepEqual(body, { p_limit:25 }); return json(due) }
    assert.deepEqual(Object.keys(body), ['p_workspace_id', 'p_product_id', 'p_scheduled_day', 'p_settings_revision', 'p_name', 'p_subject', 'p_body', 'p_app_store_url'])
    assert.equal(body.p_workspace_id, W); assert.equal(body.p_settings_revision, R)
    assert.equal(body.p_app_store_url, LINK); assert(body.p_body.includes(LINK)); assert(!body.p_body.includes('Guaranteed legal victory'))
    return json(ack)
  }
})
afterEach(() => {
  globalThis.fetch = originalFetch
  for (const name of envNames) { if (originalEnv[name] === undefined) delete process.env[name]; else process.env[name] = originalEnv[name] }
})

test('exact protected snapshot is persisted once as reusable draft, not recipient or send copy', async () => {
  const original = structuredClone(due)
  const res = await invoke()
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.data, { disabled:false, due:1, created:1, skipped:0, blocked:0, failed:0, blockers:{} })
  assert.deepEqual(events.map(event => event.name), ['email_due_daily_campaigns', 'email_save_daily_campaign'])
  const content = buildDailyEmailCampaignContent(due[0])
  assert.deepEqual(saves()[0].body, { p_workspace_id:W, p_product_id:P, p_scheduled_day:'2026-11-11', p_settings_revision:R,
    p_name:content.name, p_subject:content.subject, p_body:content.body, p_app_store_url:LINK })
  assert.deepEqual(due, original); assertOpaque(res.data)
  assert.equal(res.headers['Cache-Control'], 'no-store'); assert.equal(res.headers['Content-Type'], 'application/json')
})
test('runtime fixed bounds are 120 seconds, 25 due rows, 5 concurrent saves and 110-second dispatch deadline', () => {
  assert.equal(config.maxDuration, 120); assert.equal(EMAIL_DAILY_CAMPAIGN_BATCH_LIMIT, 25)
  assert.equal(EMAIL_DAILY_CAMPAIGN_SAVE_CONCURRENCY, 5); assert.equal(EMAIL_DAILY_CAMPAIGN_DEADLINE_MS, 110000)
})
for (const method of ['POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS']) test(`${method} is rejected without I/O`, async () => {
  const res = await invoke({ method, headers:{} }); assert.equal(res.statusCode, 405); assert.equal(res.headers.Allow, 'GET'); assert.equal(events.length, 0)
})
for (const authorization of [undefined, '', 'unit-cron-secret', 'Bearer wrong', 'bearer unit-cron-secret', 'Bearer unit-cron-secret ', 'Bearer  unit-cron-secret', ['Bearer unit-cron-secret'], ['Bearer unit-cron-secret', 'other']]) test(`authorization ${String(authorization)} cannot bypass exact Bearer check`, async () => {
  const res = await invoke({ headers:{ authorization }, query:{ enabled:true }, body:{ enabled:true } })
  assert.equal(res.statusCode, 401); assert.deepEqual(res.data, { code:'AUTH_REQUIRED' }); assert.equal(events.length, 0)
})
test('missing CRON_SECRET remains unauthorized even while independent gate disabled', async () => {
  delete process.env.CRON_SECRET; process.env.EMAIL_DAILY_CAMPAIGN_CRON_ENABLED = 'false'
  const res = await invoke(); assert.equal(res.statusCode, 401); assert.equal(events.length, 0)
})
test('default endpoint is never an unauthenticated status API', async () => {
  const res = response(); await cronHandler({ method:'GET', headers:{}, query:{ status:true } }, res)
  assert.equal(res.statusCode, 401); assert.equal(events.length, 0); assertOpaque(res.data)
})
for (const value of [undefined, '', 'false', 'TRUE', '1']) test(`independent feature value ${String(value)} cannot be overridden by send/research flags or HTTP input`, async () => {
  if (value === undefined) delete process.env.EMAIL_DAILY_CAMPAIGN_CRON_ENABLED; else process.env.EMAIL_DAILY_CAMPAIGN_CRON_ENABLED = value
  for (const name of ['EMAIL_RESEARCH_CRON_ENABLED', 'EMAIL_CRON_ENABLED', 'EMAIL_LIVE_SENDING_ENABLED', 'EMAIL_SENDING_ENABLED']) process.env[name] = 'true'
  const res = await invoke({ query:{ enabled:true, limit:100, workspaceId:W }, body:{ enabled:true } })
  assert.equal(res.statusCode, 200); assert.equal(res.data.disabled, true); assert.equal(events.length, 0); assertOpaque(res.data)
})
test('disabled runtime cannot consume storage when called directly', async () => {
  process.env.EMAIL_DAILY_CAMPAIGN_CRON_ENABLED = 'false'; const result = await runEmailDailyCampaignBatch()
  assert.equal(result.body.disabled, true); assert.equal(events.length, 0)
})
test('storage is required but no Gmail, AI model, key or encryption configuration is required', async () => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  let res = await invoke(); assert.equal(res.statusCode, 503); assert.equal(res.data.code, 'EMAIL_STORAGE_NOT_CONFIGURED'); assert.equal(events.length, 0)
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-service-role'
  for (const name of ['EMAIL_RESEARCH_CRON_ENABLED', 'EMAIL_CRON_ENABLED', 'EMAIL_LIVE_SENDING_ENABLED', 'EMAIL_SENDING_ENABLED']) process.env[name] = 'false'
  res = await invoke(); assert.equal(res.data.created, 1)
  for (const name of ['EMAIL_RESEARCH_CRON_ENABLED', 'EMAIL_CRON_ENABLED', 'EMAIL_LIVE_SENDING_ENABLED', 'EMAIL_SENDING_ENABLED']) assert.equal(process.env[name], 'false')
})
test('HTTP cannot inject scope, day, content, provider key, limit or method seams', async () => {
  const res = await invoke({ query:{ workspaceId:'other', productId:'other', limit:100, model:'other', subject:'PRIVATE', language:'pt' }, body:{ scheduled_day:'2026-02-30', rpc:'PRIVATE', apiKey:'GLOBAL-KEY', settings_revision:'other' } })
  assert.equal(res.data.created, 1); assert.equal(saves()[0].body.p_workspace_id, W); assert.equal(saves()[0].body.p_settings_revision, R); assertOpaque(res.data)
})
test('empty due array does exactly one bounded due RPC', async () => {
  due = []; const res = await invoke(); assert.equal(res.statusCode, 200); assert.equal(res.data.due, 0); assert.equal(events.length, 1); assert.equal(saves().length, 0)
})
for (const malformed of [null, true, {}, { due:[row()] }, [row(), ...Array.from({ length:25 }, () => row())]]) test(`malformed or oversized due ${JSON.stringify(malformed)?.slice(0, 50)} fails closed without saves`, async () => {
  due = malformed; const res = await invoke(); assert.equal(res.statusCode, 503); assert.equal(res.data.code, 'EMAIL_DAILY_CAMPAIGN_INVALID_RESPONSE'); assert.equal(events.length, 1); assertOpaque(res.data)
})
for (const [mutate, code] of [
  [snapshot => { snapshot.product.id = 'other' }, 'EMAIL_DAILY_CAMPAIGN_SCOPE_MISMATCH'],
  [snapshot => { snapshot.product.workspace_id = 'other' }, 'EMAIL_DAILY_CAMPAIGN_SCOPE_MISMATCH'],
  [snapshot => { snapshot.settings_revision = '' }, 'EMAIL_DAILY_CAMPAIGN_INVALID_SNAPSHOT'],
  [snapshot => { snapshot.scheduled_day = '2026-02-30' }, 'EMAIL_DAILY_CAMPAIGN_INVALID_SNAPSHOT'],
  [snapshot => { snapshot.language = 'pt' }, 'EMAIL_DAILY_CAMPAIGN_LANGUAGE_UNSUPPORTED'],
  [snapshot => { snapshot.product.source_facts.archived = true }, 'EMAIL_DAILY_CAMPAIGN_ARCHIVED'],
  [snapshot => { delete snapshot.product.source_facts.appId }, 'EMAIL_DAILY_CAMPAIGN_APP_ID_REQUIRED'],
  [snapshot => { snapshot.product.product_url = 'https://apps.apple.com/us/app/other/id123456789' }, 'EMAIL_DAILY_CAMPAIGN_APP_ID_MISMATCH'],
]) test(`invalid snapshot ${mutate.toString()} skips with only fixed blockers`, async () => {
  mutate(due[0]); const res = await invoke(); assert.equal(res.statusCode, 200); assert.equal(res.data.blocked, 1)
  assert.deepEqual(res.data.blockers, { [code]:1 }); assert.equal(saves().length, 0); assert.equal(events.length, 1); assertOpaque(res.data)
})
test('malformed members do not prevent valid independent snapshots', async () => {
  due = [null, row(), 'PRIVATE', {}, row(1)]
  const res = await invoke(); assert.equal(res.data.due, 5); assert.equal(res.data.created, 2); assert.equal(res.data.blocked, 3); assert.equal(saves().length, 2); assertOpaque(res.data)
})
test('duplicate same workspace/product/day is skipped before persistence with no retry', async () => {
  const duplicate = structuredClone(due[0]); duplicate.settings_revision = 'different-but-valid'
  due.push(duplicate, structuredClone(due[0])); const res = await invoke()
  assert.equal(res.data.created, 1); assert.equal(res.data.skipped, 2); assert.equal(saves().length, 1); assert.equal(saves()[0].body.p_settings_revision, R)
})
test('idempotent save acknowledgement never repeats persistence', async () => {
  ack = { created:false, code:'EMAIL_DAILY_CAMPAIGN_EXISTS', product_id:P, body:'PRIVATE' }
  const res = await invoke(); assert.equal(res.data.created, 0); assert.equal(res.data.skipped, 1); assert.equal(saves().length, 1); assertOpaque(res.data)
})
for (const code of EMAIL_DAILY_CAMPAIGN_SAVE_BLOCKER_CODES) test(`atomic ${code} revalidation becomes a fixed aggregate blocker without retry`, async () => {
  ack = { created:false, code, error:`PRIVATE ${W} ${P} ${LINK}` }; const res = await invoke()
  assert.equal(res.data.created, 0); assert.equal(res.data.blocked, 1); assert.deepEqual(res.data.blockers, { [code]:1 }); assert.equal(saves().length, 1); assertOpaque(res.data)
})
for (const value of [null, true, [], {}, [ { created:true, code:'EMAIL_DAILY_CAMPAIGN_CREATED' } ], { created:'true', code:'EMAIL_DAILY_CAMPAIGN_CREATED' }, { created:true, code:'PRIVATE' }, { created:true, code:'EMAIL_DAILY_CAMPAIGN_EXISTS' }, { created:false, code:'EMAIL_DAILY_CAMPAIGN_CREATED' }, { created:false, code:W }]) test(`malformed save acknowledgement ${JSON.stringify(value)} cannot create false success or leak`, async () => {
  ack = value; const res = await invoke(); assert.equal(res.data.failed, 1); assert.equal(res.data.created, 0); assert.equal(saves().length, 1); assertOpaque(res.data)
})
test('due storage failure produces safe 503 and no retries or save calls', async () => {
  failure = 'email_due_daily_campaigns'; const res = await invoke(); assert.equal(res.statusCode, 503); assert.equal(res.data.code, 'EMAIL_DAILY_CAMPAIGN_STORAGE_ERROR'); assert.equal(events.length, 1); assertOpaque(res.data)
})
test('ambiguous save failure is counted without retry; other apps still complete', async () => {
  due = [row(), row(1), row(2)]
  const realFetch = globalThis.fetch
  globalThis.fetch = async (input, options) => {
    if (String(input).endsWith('/email_save_daily_campaign') && JSON.parse(options.body).p_product_id === 'product-1') {
      const body = JSON.parse(options.body); events.push({ name:'email_save_daily_campaign', body }); throw Object.assign(new Error(`PRIVATE ${LINK}`), { code:P })
    }
    return realFetch(input, options)
  }
  const res = await invoke(); assert.equal(res.statusCode, 200); assert.equal(res.data.created, 2); assert.equal(res.data.failed, 1)
  assert.equal(saves().length, 3); assert.equal(saves().filter(event => event.body.p_product_id === 'product-1').length, 1); assertOpaque(res.data)
})
test('maximum 25 snapshots receive at most one save each, in bounded concurrency', async () => {
  due = Array.from({ length:25 }, (_, index) => row(index))
  let active = 0, maxActive = 0
  const realFetch = globalThis.fetch
  globalThis.fetch = async (input, options) => {
    if (!String(input).endsWith('/email_save_daily_campaign')) return realFetch(input, options)
    active += 1; maxActive = Math.max(active, maxActive)
    await new Promise(resolve => setTimeout(resolve, 2))
    const result = await realFetch(input, options); active -= 1; return result
  }
  const res = await invoke(); assert.equal(res.data.created, 25); assert.equal(events.length, 26); assert.equal(saves().length, 25)
  assert.equal(new Set(saves().map(event => event.body.p_product_id)).size, 25); assert(maxActive <= 5); assert(maxActive > 1); assertOpaque(res.data)
})
test('slow due read consumes dispatch deadline and blocks without any late save', async () => {
  const realFetch = globalThis.fetch
  globalThis.fetch = async (input, options) => { const result = await realFetch(input, options); clock += EMAIL_DAILY_CAMPAIGN_DEADLINE_MS; return result }
  const res = await invoke(); assert.equal(saves().length, 0); assert.equal(res.data.blocked, 1); assert.deepEqual(res.data.blockers, { EMAIL_DAILY_CAMPAIGN_DEADLINE_EXCEEDED:1 }); assertOpaque(res.data)
})
test('deadline is rechecked between bounded save groups without retrying earlier work', async () => {
  due = Array.from({ length:7 }, (_, index) => row(index))
  const realFetch = globalThis.fetch
  globalThis.fetch = async (input, options) => {
    const result = await realFetch(input, options)
    if (String(input).endsWith('/email_save_daily_campaign') && saves().length === 5) clock += EMAIL_DAILY_CAMPAIGN_DEADLINE_MS
    return result
  }
  const res = await invoke(); assert.equal(saves().length, 5); assert.equal(res.data.created, 5); assert.equal(res.data.blocked, 2); assertOpaque(res.data)
})
test('only existing email RPC and timing-safe authorization helpers are imported; no provider/sending gates or capabilities', async () => {
  const source = await readFile(new URL('../api/email-daily-campaign-cron.js', import.meta.url), 'utf8')
  assert(source.includes('emailRpc, safeEmailSecretEqual'))
  assert(!/\bfetch\s*\(|console\.|submitGmail|messages\/send|email_prepare_queue|resolveWorkspaceOpenAIKey|email-gmail|provider-key-vault/.test(source))
  assert(!/process\.env\.(?:OPENAI|GOOGLE|EMAIL_CRON_ENABLED|EMAIL_LIVE_SENDING_ENABLED|EMAIL_RESEARCH_CRON_ENABLED|EMAIL_CREDENTIALS)/.test(source))
  const names = [...source.matchAll(/await rpc\('([^']+)'/g)].map(match => match[1])
  assert.deepEqual(names, ['email_due_daily_campaigns', 'email_save_daily_campaign'])
})
