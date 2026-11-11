import test, { beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { encryptProviderKey } from '../api/provider-key-vault.js'
import cronHandler, { config, createEmailResearchCronHandler } from '../api/email-research-cron.js'
import { runEmailResearchBatch, researchWorkspaceRequestLimit, buildEmailResearchQuery, researchProductFacts, EMAIL_RESEARCH_MAX_TOOL_CALLS, EMAIL_RESEARCH_MAX_DAILY_BATCHES, EMAIL_RESEARCH_ERROR_CODES } from '../api/email-research-runtime.js'

const W = '11111111-1111-4111-8111-111111111111'
const P = '22222222-2222-4222-8222-222222222222'
const R = '33333333-3333-4333-8333-333333333333'
const TOKEN = 'opaque-unit-test-claim-token'
const FAKE_KEY = 'sk-workspace-synthetic-offline-only'
const envNames = ['CRON_SECRET', 'EMAIL_RESEARCH_CRON_ENABLED', 'EMAIL_RESEARCH_WORKSPACE_DAILY_REQUEST_LIMIT', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_PROVIDER_VAULT_KEY', 'ASC_CREDENTIALS_ENCRYPTION_KEY', 'OPENAI_EMAIL_RESEARCH_MODEL', 'OPENAI_API_KEY', 'EMAIL_CRON_ENABLED', 'EMAIL_LIVE_SENDING_ENABLED', 'EMAIL_SENDING_ENABLED']
let originalFetch, originalEnv, claim, credential, finish, rpcEvents, researchEvents, result, providerError, databaseFailure, clock
const json = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers:{ 'Content-Type':'application/json' } })
function response() {
  return { statusCode:0, data:null, headers:{}, setHeader(name, value) { this.headers[name] = value }, status(code) { this.statusCode = code; return this }, json(data) { this.data = data; return this } }
}
const candidate = (email = 'info@business.example.com') => ({ email, organization:'Public Business Ltd', source_url:'https://business.example.com/contact', source_evidence:`Contact Public Business Ltd business services: ${email}`, status:'candidate' })
const dbCandidate = (email = 'info@business.example.com') => { const row = candidate(email), [role, domain] = email.toLowerCase().split('@'); return { email:email.toLowerCase(), organization:row.organization, source_url:row.source_url, source_evidence:{ kind:'public_business_role_email', business_domain:domain, role, email_excerpt:row.source_evidence, business_excerpt:row.source_evidence } } }
async function syntheticResearch(args) {
  researchEvents.push(args)
  if (providerError) throw providerError
  return structuredClone(result)
}
const invoke = async (request = {}, dependencies = {}) => {
  const res = response()
  await createEmailResearchCronHandler({ research:syntheticResearch, now:() => clock, ...dependencies })({ method:'GET', headers:{ authorization:'Bearer unit-cron-secret' }, ...request }, res)
  return res
}
const terminal = () => rpcEvents.find(event => event.name === 'email_finish_research_batch')
const credentialEvents = () => rpcEvents.filter(event => event.name === 'get_email_research_credential')
const assertOpaque = body => {
  const keys = new Set(['disabled', 'claimed', 'completed', 'failed', 'blocked', 'providerRequests', 'discovered', 'inserted', 'skipped', 'code'])
  assert(Object.keys(body).every(key => keys.has(key)))
  const text = JSON.stringify(body)
  for (const forbidden of [W, P, R, TOKEN, FAKE_KEY, 'Public Business', 'business.example.com', 'PRIVATE', 'Running clubs', 'encrypted_api_key', 'source_evidence']) assert(!text.includes(forbidden), `Response leaked ${forbidden}`)
}
beforeEach(() => {
  originalFetch = globalThis.fetch
  originalEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]))
  for (const name of envNames) delete process.env[name]
  Object.assign(process.env, { CRON_SECRET:'unit-cron-secret', EMAIL_RESEARCH_CRON_ENABLED:'true', SUPABASE_SERVICE_ROLE_KEY:'synthetic-service-role', OPENAI_PROVIDER_VAULT_KEY:'synthetic-unit-vault-root', OPENAI_EMAIL_RESEARCH_MODEL:'configured-unit-research-model' })
  claim = { run_id:R, claim_token:TOKEN, workspace_id:W, product_id:P, target_remaining:80, batch_limit:10, query:'PRIVATE ignored arbitrary query: contact consumers', timezone:'America/New_York', scheduled_day:'2026-11-11', request_number:1, batch_number:1,
    product:{ id:P, workspace_id:W, name:'Runner App', description:'Running clubs use a route-planning and event-management app in Canada.', audience:'Running clubs and event organizers', source_facts:{} } }
  credential = { encrypted_api_key:encryptProviderKey(FAKE_KEY) }
  finish = null; rpcEvents = []; researchEvents = []; result = { candidates:[candidate()], summary:'PRIVATE provider summary' }; providerError = null; databaseFailure = null; clock = Date.parse('2026-11-11T15:00:00Z')
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input)
    assert.equal(url.hostname, 'jtogllurcrxxaguoxeus.supabase.co', 'Every non-RPC network request is forbidden; all research is injected')
    assert.equal(options.method, 'POST')
    assert.equal(options.headers.apikey, 'synthetic-service-role')
    assert.equal(options.headers.Authorization, 'Bearer synthetic-service-role')
    assert(options.signal)
    const name = url.pathname.replace('/rest/v1/rpc/', '')
    assert(['email_claim_research_batch', 'get_email_research_credential', 'email_finish_research_batch'].includes(name), 'No campaign, queue, messaging, consent, settings, Gmail, or unrelated DB operations permitted')
    const body = JSON.parse(options.body)
    rpcEvents.push({ name, body })
    if (name === databaseFailure) return json({ message:'PRIVATE database error', hint:TOKEN, email:'private@business.example.com' }, 500)
    if (name === 'email_claim_research_batch') {
      assert.deepEqual(Object.keys(body), ['p_workspace_limit'])
      return json(claim)
    }
    assert.equal(body.p_run_id, R); assert.equal(body.p_claim_token, TOKEN)
    if (name === 'get_email_research_credential') { assert.deepEqual(Object.keys(body), ['p_run_id', 'p_claim_token']); return json(Array.isArray(credential) ? credential : credential === null ? [] : [credential]) }
    assert.deepEqual(Object.keys(body), ['p_run_id', 'p_claim_token', 'p_candidates', 'p_error_code'])
    assert(!JSON.stringify(body).includes(FAKE_KEY), 'Plaintext key must never be persisted')
    assert(body.p_error_code === null || EMAIL_RESEARCH_ERROR_CODES.includes(body.p_error_code))
    return json(finish ?? { allowed:!body.p_error_code, completed:!body.p_error_code, code:body.p_error_code || 'EMAIL_RESEARCH_COMPLETED', verified_count:body.p_candidates.length, inserted_count:body.p_candidates.length, skipped_count:0 })
  }
})
afterEach(() => {
  globalThis.fetch = originalFetch
  for (const name of envNames) { if (originalEnv[name] === undefined) delete process.env[name]; else process.env[name] = originalEnv[name] }
})

test('GET performs one claim, one scoped decrypt/research and one terminal finish, returning only aggregates', async () => {
  const originalClaim = structuredClone(claim)
  const res = await invoke()
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.data, { disabled:false, claimed:1, completed:1, failed:0, blocked:0, providerRequests:1, discovered:1, inserted:1, skipped:0 })
  assert.deepEqual(rpcEvents.map(event => event.name), ['email_claim_research_batch', 'get_email_research_credential', 'email_finish_research_batch'])
  assert.equal(researchEvents.length, 1); assert.equal(researchEvents[0].apiKey, FAKE_KEY)
  assert.equal(researchEvents[0].model, 'configured-unit-research-model'); assert.equal(researchEvents[0].limit, 10)
  assert.equal(researchEvents[0].maxToolCalls, 3); assert.equal(EMAIL_RESEARCH_MAX_TOOL_CALLS, 3); assert.equal(EMAIL_RESEARCH_MAX_DAILY_BATCHES, 10)
  assert.equal(rpcEvents[0].body.p_workspace_limit, 200)
  assert.deepEqual(terminal().body.p_candidates, [dbCandidate()]); assert.equal(terminal().body.p_error_code, null)
  assert.deepEqual(claim, originalClaim); assertOpaque(res.data)
  assert.equal(res.headers['Cache-Control'], 'no-store'); assert.equal(res.headers['Content-Type'], 'application/json')
})
test('Vercel function limit is 180 seconds', () => { assert.equal(config.maxDuration, 180) })
for (const method of ['POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS']) test(`${method} is rejected before authentication or I/O`, async () => {
  const res = await invoke({ method, headers:{} })
  assert.equal(res.statusCode, 405); assert.equal(res.headers.Allow, 'GET'); assert.equal(rpcEvents.length, 0); assert.equal(researchEvents.length, 0)
})
for (const authorization of [undefined, '', 'Bearer wrong', 'bearer unit-cron-secret', 'Bearer unit-cron-secret ', 'unit-cron-secret', ['Bearer unit-cron-secret'], ['Bearer unit-cron-secret', 'other']]) test(`GET auth rejects ${String(authorization)}`, async () => {
  const res = await invoke({ headers:{ authorization } })
  assert.equal(res.statusCode, 401); assert.equal(rpcEvents.length, 0); assert.equal(researchEvents.length, 0); assert.deepEqual(res.data, { code:'AUTH_REQUIRED' })
})
test('missing secret returns 401 even when feature disabled', async () => {
  delete process.env.CRON_SECRET; process.env.EMAIL_RESEARCH_CRON_ENABLED = 'false'
  const res = await invoke(); assert.equal(res.statusCode, 401); assert.equal(rpcEvents.length, 0)
})
test('public unauthenticated status GET returns safe 401', async () => {
  const res = response(); await cronHandler({ method:'GET', headers:{}, query:{ status:'true' } }, res)
  assert.equal(res.statusCode, 401); assert.equal(rpcEvents.length, 0); assertOpaque(res.data)
})
for (const value of [undefined, '', 'false', 'TRUE', '1']) test(`research gate ${String(value)} is independently disabled`, async () => {
  if (value === undefined) delete process.env.EMAIL_RESEARCH_CRON_ENABLED; else process.env.EMAIL_RESEARCH_CRON_ENABLED = value
  process.env.EMAIL_CRON_ENABLED = 'true'; process.env.EMAIL_LIVE_SENDING_ENABLED = 'true'
  const res = await invoke({ query:{ enabled:'true', workspaceId:W }, body:{ enabled:true } })
  assert.equal(res.statusCode, 200); assert.equal(res.data.disabled, true); assert.equal(rpcEvents.length, 0); assert.equal(researchEvents.length, 0)
})
test('research runs while all existing send gates are off and preserves their values', async () => {
  for (const name of ['EMAIL_CRON_ENABLED', 'EMAIL_LIVE_SENDING_ENABLED', 'EMAIL_SENDING_ENABLED']) process.env[name] = 'false'
  const res = await invoke(); assert.equal(res.data.completed, 1)
  for (const name of ['EMAIL_CRON_ENABLED', 'EMAIL_LIVE_SENDING_ENABLED', 'EMAIL_SENDING_ENABLED']) assert.equal(process.env[name], 'false')
})
for (const value of ['1', '8', '50', '199', '200']) test(`valid workspace limit ${value} is passed once to DB`, async () => {
  process.env.EMAIL_RESEARCH_WORKSPACE_DAILY_REQUEST_LIMIT = value
  await invoke(); assert.equal(rpcEvents[0].body.p_workspace_limit, Number(value)); assert.equal(researchEvents.length, 1)
})
for (const value of ['', '0', '201', '-1', '+1', '01', ' 200 ', '1.5', '2e2', 'NaN', 'Infinity', 'true']) test(`invalid workspace limit ${value} cannot consume any reservation`, async () => {
  process.env.EMAIL_RESEARCH_WORKSPACE_DAILY_REQUEST_LIMIT = value
  const res = await invoke(); assert.equal(res.statusCode, 503); assert.equal(res.data.code, 'EMAIL_RESEARCH_CONFIG_INVALID'); assert.equal(rpcEvents.length, 0); assert.equal(researchEvents.length, 0)
})
test('limit parser defaults only for undefined, rejecting numeric coercion', () => {
  assert.equal(researchWorkspaceRequestLimit(undefined), 200)
  for (const value of [null, 100, true]) assert.throws(() => researchWorkspaceRequestLimit(value))
})
for (const noJob of [null, [], { no_job:true }]) test(`no job ${JSON.stringify(noJob)} performs no credential or provider lookup`, async () => {
  claim = noJob; const res = await invoke(); assert.equal(res.statusCode, 200); assert.equal(res.data.claimed, 0); assert.equal(rpcEvents.length, 1); assert.equal(researchEvents.length, 0)
})
test('blocked daily-budget claim is safe, opaque and not retried', async () => {
  claim = { allowed:false, error:'PRIVATE budget query', claim_token:TOKEN, email:'private@business.example.com' }
  const res = await invoke(); assert.equal(res.data.blocked, 1); assert.equal(rpcEvents.length, 1); assert.equal(researchEvents.length, 0); assertOpaque(res.data)
})
test('multiple claimed runs fail closed; worker never chooses an arbitrary workspace', async () => {
  claim = [claim, { ...claim, workspace_id:'different-workspace' }]
  const res = await invoke(); assert.equal(res.statusCode, 503); assert.equal(researchEvents.length, 0); assert.equal(rpcEvents.length, 1)
})
test('single-array claim and credential responses are supported', async () => {
  claim = [claim]; credential = [credential]; const res = await invoke(); assert.equal(res.data.completed, 1)
})
for (const mutate of [c => { c.batch_limit = 11 }, c => { c.target_remaining = 101 }, c => { c.request_number = 201 }, c => { c.request_number = 0 }, c => { c.batch_number = 11 }, c => { c.allowed = 'true' }, c => { c.product.id = 'different' }, c => { c.product.workspace_id = 'different' }, c => { c.scheduled_day = '2026-02-30' }, c => { c.timezone = 'invalid/timezone' }, c => { c.product.source_facts.archived = true }]) test(`malformed claimed metadata ${mutate.toString()} settles fixed failure without research`, async () => {
  mutate(claim); const res = await invoke(); assert.equal(res.data.failed, 1); assert.equal(terminal().body.p_error_code, 'EMAIL_RESEARCH_INVALID_RESPONSE'); assert.equal(credentialEvents().length, 0); assert.equal(researchEvents.length, 0)
})
test('malformed claim handle cannot be guessed or settled', async () => {
  claim.claim_token = 'PRIVATE invalid token'; const res = await invoke(); assert.equal(res.statusCode, 503); assert.equal(rpcEvents.length, 1); assertOpaque(res.data)
})
test('supported maximum ten-request setting works while ordinal eleven cannot dispatch a paid call', async () => {
  claim.request_number = 10; claim.batch_number = 10; claim.target_remaining = 100; const res = await invoke(); assert.equal(res.data.completed, 1); assert.equal(researchEvents.length, 1)
  claim.request_number = 11; researchEvents = []; rpcEvents = []; const blocked = await invoke(); assert.equal(blocked.data.failed, 1); assert.equal(researchEvents.length, 0)
})
test('remaining target strictly caps batch result count and request limit', async () => {
  claim.target_remaining = 2; claim.batch_limit = 7
  result.candidates = ['info', 'sales', 'support', 'hello'].map(role => candidate(`${role}@business.example.com`))
  const res = await invoke(); assert.equal(researchEvents[0].limit, 2); assert.equal(res.data.discovered, 2); assert.equal(terminal().body.p_candidates.length, 2)
})
test('app facts rather than arbitrary request fields or saved query shape research', async () => {
  const res = await invoke({ query:{ query:'Consumer patient addresses', workspaceId:'other', productId:'other', model:'borrowed', limit:'200' }, body:{ apiKey:'borrowed' } })
  const args = researchEvents[0]; assert.equal(res.data.completed, 1); assert(args.query.includes('Running clubs') || args.query.includes('Running clubs'.toLowerCase())); assert(!args.query.includes('PRIVATE')); assert(!args.query.includes('patient addresses')); assert.equal(args.apiKey, FAKE_KEY); assert.equal(args.limit, 10)
})
test('safe saved operator preference is an untrusted search hint, never new app facts', () => {
  claim.query = 'Business partnerships in Ontario'
  const plan = buildEmailResearchQuery(claim)
  assert(plan.query.includes('Business partnerships in Ontario'))
  assert(plan.query.includes('untrusted, not app facts'))
  assert(!JSON.stringify(plan.product).includes('Business partnerships in Ontario'))
  assert(plan.query.length <= 500)
  for (const hint of ['patient addresses', 'private credentials', 'send personal mail', 'bypass approval']) {
    claim.query = hint
    assert(!buildEmailResearchQuery(claim).query.includes(hint))
  }
})
test('day and request deterministically vary fact-based geography and niche without private personalization', () => {
  const a = buildEmailResearchQuery(claim); assert.deepEqual(a, buildEmailResearchQuery(structuredClone(claim)))
  const b = buildEmailResearchQuery({ ...claim, request_number:2 }); const c = buildEmailResearchQuery({ ...claim, scheduled_day:'2026-11-12' })
  assert.notEqual(a.query, b.query); assert.notEqual(a.query, c.query); assert(a.query.includes('Canada')); assert(a.query.length <= 500); assert(b.query.length <= 500)
  assert(!a.query.includes(W)); assert(!a.query.includes(P)); assert(a.query.includes('Public organization role emails')); assert(a.query.includes('No personal/consumer/child contacts'))
})
test('different apps produce different supplied business niches, not generic organizations for all apps', () => {
  const other = { ...claim, product:{ description:'Bakery shops use a wholesale ordering and inventory app.', audience:'Bakery shops and food distributors' } }
  const query = buildEmailResearchQuery(other).query
  assert.notEqual(query, buildEmailResearchQuery(claim).query); assert(/Bakery|wholesale/.test(query)); assert(!query.includes('Running')); assert(query.includes('no location fact supplied'))
})
test('listing description supplies niche but app name alone does not', async () => {
  claim.product = { name:'Uninformative name', source_facts:{ store_metadata:{ description:'Music studios plan recording sessions.', category:'Music production' } } }
  await invoke(); assert(/Music|recording/.test(researchEvents[0].query))
  rpcEvents = []; researchEvents = []; claim.product = { name:'Uninformative name' }
  const res = await invoke(); assert.equal(res.data.failed, 1); assert.equal(terminal().body.p_error_code, 'EMAIL_RESEARCH_PROVIDER_UNAVAILABLE'); assert.equal(credentialEvents().length, 0)
})
test('unsupported guarantee sentences and embedded emails/URLs are not forwarded as facts', () => {
  const facts = researchProductFacts({ description:'Community sports clubs plan events. This app guarantees medical cures and legal advice. Contact private@business.example.com at https://private.example.com.' })
  assert(facts.description.includes('Community sports clubs')); assert(!/guarantee|medical cures|legal advice|@|https:/.test(facts.description))
})
test('no facts means failure, not a generic fallback search', async () => {
  claim.product = {}; const res = await invoke(); assert.equal(res.data.failed, 1); assert.equal(terminal().body.p_error_code, 'EMAIL_RESEARCH_PROVIDER_UNAVAILABLE'); assert.equal(researchEvents.length, 0)
})
test('expired claimed lease is failed without resolving a credential', async () => {
  claim.claim_expires_at = new Date(clock - 1).toISOString(); const res = await invoke(); assert.equal(res.data.failed, 1); assert.equal(terminal().body.p_error_code, 'EMAIL_RESEARCH_CREDENTIAL_UNAVAILABLE'); assert.equal(credentialEvents().length, 0)
})
for (const mutation of [row => { row.workspace_id = 'other-workspace' }, row => { row.run_id = 'other-run' }, row => { row.claim_token = 'other-token' }, row => { row.product_id = 'other-product' }]) test(`credential scope mismatch ${mutation.toString()} never reaches provider`, async () => {
  mutation(credential); const res = await invoke(); assert.equal(res.data.failed, 1); assert.equal(terminal().body.p_error_code, 'EMAIL_RESEARCH_INVALID_RESPONSE'); assert.equal(researchEvents.length, 0); assertOpaque(res.data)
})
for (const unavailable of [null, [], { allowed:false }, { ...{}, workspace_id:W, enabled:false }, { workspace_id:W, admin_valid:false }]) test(`unavailable/stale-setting credential ${JSON.stringify(unavailable)} performs no research`, async () => {
  credential = unavailable; const res = await invoke(); assert.equal(res.data.failed, 1); assert.equal(researchEvents.length, 0); assert.equal(terminal().body.p_error_code, 'EMAIL_RESEARCH_CREDENTIAL_UNAVAILABLE')
})
test('expired credential echo is rejected even if claim expiry is absent', async () => {
  credential.claim_expires_at = new Date(clock - 1).toISOString(); const res = await invoke(); assert.equal(res.data.failed, 1); assert.equal(terminal().body.p_error_code, 'EMAIL_RESEARCH_CREDENTIAL_UNAVAILABLE'); assert.equal(researchEvents.length, 0)
})
test('matching workspace credential is mandatory; global key cannot replace a missing envelope', async () => {
  delete credential.encrypted_api_key; process.env.OPENAI_API_KEY = 'GLOBAL-KEY-MUST-NOT-BE-BORROWED'
  const res = await invoke(); assert.equal(res.data.failed, 1); assert.equal(terminal().body.p_error_code, 'EMAIL_RESEARCH_CREDENTIAL_UNAVAILABLE'); assert.equal(researchEvents.length, 0); assertOpaque(res.data)
})
for (const envelope of [{}, { version:2, algorithm:'aes-256-gcm', iv:'PRIVATE', tag:'PRIVATE', ciphertext:'PRIVATE' }, 'plaintext-secret']) test(`invalid opaque envelope ${JSON.stringify(envelope)} is never decrypted or researched`, async () => {
  credential.encrypted_api_key = envelope; const res = await invoke(); assert.equal(res.data.failed, 1); assert.equal(terminal().body.p_error_code, 'EMAIL_RESEARCH_CREDENTIAL_UNAVAILABLE'); assert.equal(researchEvents.length, 0)
})
test('wrong synthetic vault root yields sanitized failure and no provider call', async () => {
  process.env.OPENAI_PROVIDER_VAULT_KEY = 'wrong-unit-root'; const res = await invoke(); assert.equal(res.data.failed, 1); assert.equal(terminal().body.p_error_code, 'EMAIL_RESEARCH_CREDENTIAL_UNAVAILABLE'); assert.equal(researchEvents.length, 0)
})
test('missing vault root cannot borrow a plaintext/global key', async () => {
  delete process.env.OPENAI_PROVIDER_VAULT_KEY; process.env.OPENAI_API_KEY = FAKE_KEY
  const res = await invoke(); assert.equal(res.data.failed, 1); assert.equal(researchEvents.length, 0)
})
for (const plaintext of ['', '   ', 'sk-invalid\r\nsecret']) test(`bad decrypted workspace credential ${JSON.stringify(plaintext)} is rejected`, async () => {
  credential.encrypted_api_key = encryptProviderKey(plaintext); const res = await invoke(); assert.equal(res.data.failed, 1); assert.equal(terminal().body.p_error_code, 'EMAIL_RESEARCH_CREDENTIAL_UNAVAILABLE'); assert.equal(researchEvents.length, 0)
})
test('missing model fails the reserved batch without touching workspace credentials', async () => {
  delete process.env.OPENAI_EMAIL_RESEARCH_MODEL; const res = await invoke(); assert.equal(res.data.failed, 1); assert.equal(terminal().body.p_error_code, 'EMAIL_RESEARCH_PROVIDER_UNAVAILABLE'); assert.equal(credentialEvents().length, 0); assert.equal(researchEvents.length, 0)
})
test('provider failure is fixed-code terminal failed and never retried', async () => {
  providerError = Object.assign(new Error(`PRIVATE provider body ${FAKE_KEY}`), { code:'EMAIL_RESEARCH_PROVIDER_ERROR' })
  const res = await invoke(); assert.equal(res.data.failed, 1); assert.equal(researchEvents.length, 1); assert.equal(rpcEvents.length, 3); assert.equal(terminal().body.p_error_code, 'EMAIL_RESEARCH_PROVIDER_FAILED'); assert.deepEqual(terminal().body.p_candidates, []); assertOpaque(res.data)
})
test('unknown provider error cannot become an arbitrary persisted code or leak details', async () => {
  providerError = Object.assign(new Error('PRIVATE provider body'), { code:'PRIVATE-key-query-claim' })
  const res = await invoke(); assert.equal(terminal().body.p_error_code, 'EMAIL_RESEARCH_PROVIDER_FAILED'); assert.equal(res.data.failed, 1); assertOpaque(res.data)
})
for (const summary of ['No suitable contacts', 'research was refused or incomplete']) test(`zero ${summary} is a normally completed batch`, async () => {
  result = { candidates:[], summary }; const res = await invoke(); assert.equal(res.data.completed, 1); assert.equal(res.data.failed, 0); assert.equal(res.data.inserted, 0); assert.equal(terminal().body.p_error_code, null); assert.equal(researchEvents.length, 1)
})
test('invalid research structure fails once without persisting provider body', async () => {
  result = { text:'PRIVATE raw body', candidates:null }; const res = await invoke(); assert.equal(res.data.failed, 1); assert.equal(terminal().body.p_error_code, 'EMAIL_RESEARCH_INVALID_RESPONSE'); assertOpaque(res.data)
})
test('within-batch duplicate normalization and DB duplicate results stay candidate-only', async () => {
  result.candidates = [candidate(), candidate('INFO@business.example.com'), candidate('sales@business.example.com')]
  finish = { allowed:true, completed:true, code:'EMAIL_RESEARCH_COMPLETED', verified_count:2, inserted_count:1, skipped_count:1 }
  const res = await invoke(); assert.equal(terminal().body.p_candidates.length, 2); assert.equal(res.data.discovered, 2); assert.equal(res.data.inserted, 1); assert.equal(res.data.skipped, 1); assertOpaque(res.data)
})
test('existing-contact exclusion is passed only from protected claim to injected helper', async () => {
  claim.exclude_emails = ['info@business.example.com', 'sales@business.example.com']
  await invoke(); assert.deepEqual(researchEvents[0].excludeEmails, claim.exclude_emails); assert(!('excludeEmails' in terminal().body))
})
test('untrusted returned opt-in, messaging, query and credential fields are stripped', async () => {
  result.candidates = [{ ...candidate(), status:'opted_in', consent:true, apiKey:FAKE_KEY, draft:'PRIVATE', campaign_id:'PRIVATE', queue:'PRIVATE', query:'PRIVATE' }]
  const res = await invoke(); assert.deepEqual(terminal().body.p_candidates, [dbCandidate()]); assert.equal(res.data.completed, 1); assertOpaque(res.data)
})
test('personal, consumer, child, guessed or wrong-owner contacts are never persisted', async () => {
  result.candidates = [candidate('jane@business.example.com'), candidate('info@gmail.com'), { ...candidate(), source_evidence:'Child records info@business.example.com' }, { ...candidate(), source_evidence:'No observed address here' }, { ...candidate(), source_url:'https://unrelated.example.com/contact' }, { ...candidate(), source_url:'http://business.example.com/contact' }]
  const res = await invoke(); assert.equal(res.data.completed, 1); assert.deepEqual(terminal().body.p_candidates, []); assert.equal(res.data.discovered, 0)
})
test('stale setting at finish blocks insertion with safe aggregates and never repeats research', async () => {
  finish = { allowed:false, completed:false, code:'EMAIL_RESEARCH_SETTINGS_STALE', verified_count:0, inserted_count:0, skipped_count:0, error:'PRIVATE stale setting', run_id:R, claim_token:TOKEN }
  const res = await invoke(); assert.equal(res.data.blocked, 1); assert.equal(res.data.completed, 0); assert.equal(res.data.inserted, 0); assert.equal(researchEvents.length, 1); assertOpaque(res.data)
})
for (const ack of [null, true, {}, { allowed:true, completed:true, code:'EMAIL_RESEARCH_COMPLETED', verified_count:1, inserted_count:11, skipped_count:0 }, { allowed:true, completed:true, code:'EMAIL_RESEARCH_COMPLETED', verified_count:1, inserted_count:1, skipped_count:1 }]) test(`malformed finish acknowledgement ${JSON.stringify(ack)} fails safely without retry`, async () => {
  // null is explicitly returned instead of default acknowledgement through a one-row array.
  finish = ack === null ? [null] : ack
  const res = await invoke(); assert.equal(res.statusCode, 503); assert.equal(res.data.completed, 0); assert.equal(researchEvents.length, 1); assert.equal(rpcEvents.length, 3); assertOpaque(res.data)
})
for (const rpc of ['email_claim_research_batch', 'get_email_research_credential', 'email_finish_research_batch']) test(`database failure at ${rpc} never leaks details or retries`, async () => {
  databaseFailure = rpc; const res = await invoke(); assertOpaque(res.data)
  assert.equal(rpcEvents.filter(event => event.name === rpc).length, 1)
  if (rpc === 'email_claim_research_batch') { assert.equal(res.statusCode, 503); assert.equal(researchEvents.length, 0) }
  else if (rpc === 'get_email_research_credential') { assert.equal(res.data.failed, 1); assert.equal(researchEvents.length, 0); assert.equal(terminal().body.p_error_code, 'EMAIL_RESEARCH_PROVIDER_FAILED') }
  else { assert.equal(res.statusCode, 503); assert.equal(researchEvents.length, 1) }
})
test('slow claim consumes deadline and stops before credential/provider dispatch', async () => {
  const fetch = globalThis.fetch
  globalThis.fetch = async (input, options) => { const result = await fetch(input, options); if (String(input).endsWith('/email_claim_research_batch')) clock += 16000; return result }
  const res = await invoke(); assert.equal(res.data.failed, 1); assert.equal(terminal().body.p_error_code, 'EMAIL_RESEARCH_PROVIDER_FAILED'); assert.equal(researchEvents.length, 0); assert.equal(credentialEvents().length, 0)
})
test('expired credential lease between lookup and dispatch stops research', async () => {
  claim.claim_expires_at = new Date(clock + 1000).toISOString()
  const fetch = globalThis.fetch
  globalThis.fetch = async (input, options) => { const result = await fetch(input, options); if (String(input).endsWith('/get_email_research_credential')) clock += 1001; return result }
  const res = await invoke(); assert.equal(res.data.failed, 1); assert.equal(terminal().body.p_error_code, 'EMAIL_RESEARCH_CREDENTIAL_UNAVAILABLE'); assert.equal(researchEvents.length, 0)
})
test('late research result is not inserted and fixed timeout failure is attempted once', async () => {
  const res = await invoke({}, { research:async args => { researchEvents.push(args); clock += 156000; return result } })
  assert.equal(res.data.failed, 1); assert.equal(terminal().body.p_error_code, 'EMAIL_RESEARCH_PROVIDER_FAILED'); assert.deepEqual(terminal().body.p_candidates, []); assert.equal(researchEvents.length, 1)
})
test('fully expired runtime deadline performs no late finish or extra provider request', async () => {
  const res = await invoke({}, { research:async args => { researchEvents.push(args); clock += 170001; return result } })
  assert.equal(res.statusCode, 503); assert.equal(res.data.code, 'EMAIL_RESEARCH_DEADLINE_EXCEEDED'); assert(!terminal()); assert.equal(researchEvents.length, 1); assertOpaque(res.data)
})
test('runtime gate itself prevents direct disabled invocation from bypassing flags', async () => {
  process.env.EMAIL_RESEARCH_CRON_ENABLED = 'false'
  const res = await runEmailResearchBatch({ research:syntheticResearch }); assert.equal(res.body.disabled, true); assert.equal(rpcEvents.length, 0)
})
test('source contains no sending, global provider key, browser or logging capability', async () => {
  const runtime = await readFile(new URL('../api/email-research-runtime.js', import.meta.url), 'utf8')
  const cron = await readFile(new URL('../api/email-research-cron.js', import.meta.url), 'utf8')
  assert(!/from\s+['"].*(?:email-gmail|email-cron|email-diagnostic)/.test(runtime + cron))
  assert(!/process\.env\.(?:OPENAI_API_KEY|EMAIL_LIVE_SENDING_ENABLED|EMAIL_CRON_ENABLED)/.test(runtime + cron))
  assert(!/console\.|submitGmail|messages\/send|email_prepare_queue|email_drafts|email_campaigns/.test(runtime + cron))
  assert(runtime.includes('decryptProviderKey(row.encrypted_api_key)'))
  assert(cron.includes('safeEmailSecretEqual')); assert(runtime.includes('maxToolCalls:EMAIL_RESEARCH_MAX_TOOL_CALLS'))
})

test('historical exclusions are normalized and enforced even when injected research repeats an address', async () => {
  claim.exclude_emails = ['INFO@business.example.com', 'jane@business.example.com', 'info@gmail.com', 'info@gmx.com', 'info@localhost', 'info@business.example.com', { private:'never forwarded' }]
  result.candidates = [candidate('INFO@business.example.com'), candidate('sales@business.example.com')]
  const res = await invoke({ query:{ excludeEmails:['sales@business.example.com'] }, body:{ excludeEmails:['sales@business.example.com'] } })
  assert.equal(res.statusCode, 200)
  assert.deepEqual(researchEvents[0].excludeEmails, ['info@business.example.com'])
  assert.deepEqual(terminal().body.p_candidates, [dbCandidate('sales@business.example.com')])
  assert.equal(researchEvents.length, 1)
  assert.equal(rpcEvents[0].body.p_workspace_limit, 200)
  assert.equal(res.data.inserted, 1)
  assertOpaque(res.data)
})
test('historical exclusion metadata cannot expand the 100-address input or existing provider budget', async () => {
  claim.exclude_emails = Array.from({ length:150 }, (_, i) => `info@business${i}.example.com`)
  const res = await invoke()
  assert.equal(res.statusCode, 200)
  assert.equal(researchEvents[0].excludeEmails.length, 100)
  assert(!researchEvents[0].excludeEmails.includes('info@business100.example.com'))
  assert.equal(researchEvents[0].maxToolCalls, 3)
  assert.equal(researchEvents.length, 1)
  assert.equal(rpcEvents.length, 3)
  assert.equal(rpcEvents[0].body.p_workspace_limit, 200)
  assertOpaque(res.data)
})
test('malformed or exclusively private exclusions never reach the provider input', async () => {
  for (const exclusions of ['private list', { apiKey:FAKE_KEY }, ['alice@business.example.com', 'info@yahoo.com', 'info@gmx.com', 'info@service.internal', 'info@acme.com\nprivate instructions']]) {
    claim.exclude_emails = exclusions
    researchEvents = []; rpcEvents = []
    const res = await invoke()
    assert.equal(res.statusCode, 200)
    assert.equal(researchEvents[0].excludeEmails, undefined)
    assertOpaque(res.data)
  }
})
