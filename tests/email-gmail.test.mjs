import test, { beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import handler, { refreshGmailConnection, submitGmailEmail } from '../api/email-gmail.js'
import { encryptEmailCredential, decryptEmailCredential, hashEmailToken } from '../api/email-core.js'

const W = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const USER = '33333333-3333-4333-8333-333333333333'
const SCOPE = 'https://www.googleapis.com/auth/gmail.send'
const REDIRECT = 'https://example.test/api/email-gmail'
const ROOT = 'unit-test-only-email-root'
const COOKIE = '__Host-flo-email-state'
const envNames = ['GOOGLE_EMAIL_CLIENT_ID','GOOGLE_EMAIL_CLIENT_SECRET','GOOGLE_EMAIL_REDIRECT_URI','EMAIL_CREDENTIALS_ENCRYPTION_KEY','ASC_CREDENTIALS_ENCRYPTION_KEY','OPENAI_PROVIDER_VAULT_KEY','SUPABASE_SERVICE_ROLE_KEY','EMAIL_LIVE_SENDING_ENABLED']
let tables, events, responses, admin, memberRole, loseConsume, originalFetch
const keyFor = sub => crypto.createHmac('sha256', ROOT).update(`flostudio:gmail-account:v1:${sub}`).digest('hex')
const json = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers:{ 'Content-Type':'application/json' } })
const tokens = extra => ({ access_token:'dummy-access', refresh_token:'dummy-refresh', token_type:'Bearer', expires_in:3600, scope:`${SCOPE} openid email`, ...extra })
const identity = extra => ({ sub:'google-sub-1', email:'sender@example.test', email_verified:true, ...extra })
function response() {
  return { headers:{}, statusCode:0, data:null, ended:false, setHeader(name, value) { this.headers[name] = value }, status(code) { this.statusCode = code; return this }, json(data) { this.data = data; return this }, end() { this.ended = true; return this } }
}
const post = body => ({ method:'POST', headers:{ authorization:'Bearer dummy-session' }, body })
const matches = (row, params) => [...params].every(([name, filter]) => {
  if (['select','limit','on_conflict'].includes(name)) return true
  if (filter === 'is.null') return row[name] == null
  if (filter.startsWith('eq.')) return String(row[name]) === filter.slice(3)
  if (filter.startsWith('gt.')) return Date.parse(row[name]) > Date.parse(filter.slice(3))
  throw new Error(`Unexpected mock filter: ${name}`)
})
async function mockFetch(input, options = {}) {
  const url = new URL(input), method = options.method || 'GET'
  const body = options.body ? (options.headers?.['Content-Type'] === 'application/x-www-form-urlencoded' ? Object.fromEntries(new URLSearchParams(options.body)) : JSON.parse(options.body)) : undefined
  events.push({ url:url.href, method, body, headers:options.headers, redirect:options.redirect })
  if (url.hostname === 'jtogllurcrxxaguoxeus.supabase.co') {
    if (url.pathname === '/auth/v1/user') return json({ id:USER })
    if (url.pathname === '/rest/v1/rpc/is_workspace_admin') return json(admin)
    if (url.pathname === '/rest/v1/rpc/email_pause_workspace') {
      for (const campaign of tables.email_campaigns) if (campaign.workspace_id === body.p_workspace_id) Object.assign(campaign, { sending_enabled:false,state:'paused' })
      return json(null)
    }
    assert(url.pathname.startsWith('/rest/v1/'))
    const name = url.pathname.split('/').at(-1)
    assert.notEqual(name,'email_campaigns','Service must use pause RPC, not direct campaign writes')
    if (name === 'workspaces') return json(admin ? [{ id:W }] : [])
    if (name === 'workspace_members') return json(memberRole === 'admin' ? [{ role:'admin' }] : [])
    assert(Object.hasOwn(tables, name), `Unknown mock table ${name}`)
    const rows = tables[name], matching = rows.filter(row => matches(row, url.searchParams))
    if (method === 'GET') {
      assert.equal(url.searchParams.get('limit'), '1')
      assert(url.searchParams.get('select'))
      return json(matching.slice(0,1))
    }
    if (method === 'POST') {
      const conflict = url.searchParams.get('on_conflict')
      const old = conflict && rows.find(row => row[conflict] === body[conflict])
      if (old && !options.headers?.Prefer?.includes('ignore-duplicates')) Object.assign(old, body)
      if (!old) rows.push(structuredClone(body))
      return json(null)
    }
    if (method === 'PATCH') {
      if (name === 'email_oauth_states' && loseConsume) return json([])
      for (const row of matching) Object.assign(row, body)
      return json(options.headers?.Prefer === 'return=representation' ? matching : null)
    }
    if (method === 'DELETE') { tables[name] = rows.filter(row => !matching.includes(row)); return json(null) }
    throw new Error('Unexpected database method')
  }
  assert(['oauth2.googleapis.com','openidconnect.googleapis.com','gmail.googleapis.com'].includes(url.hostname), `No live network: unexpected host ${url.hostname}`)
  const next = responses.shift()
  assert(next, `Unexpected Google request ${url.href}`)
  assert.equal(url.href, next.url)
  if (next.error) throw next.error
  return next.response
}
const googleResponse = (url, payload, status = 200) => responses.push({ url, response:json(payload,status) })
const exchange = (tokenOverrides, userOverrides) => {
  googleResponse('https://oauth2.googleapis.com/token', tokens(tokenOverrides))
  googleResponse('https://openidconnect.googleapis.com/v1/userinfo', identity(userOverrides))
}
beforeEach(() => {
  // Test process uses only dummy values. No files, production secrets, or live APIs.
  for (const name of envNames) delete process.env[name]
  Object.assign(process.env, { GOOGLE_EMAIL_CLIENT_ID:'dummy-client', GOOGLE_EMAIL_CLIENT_SECRET:'dummy-client-secret', GOOGLE_EMAIL_REDIRECT_URI:REDIRECT, EMAIL_CREDENTIALS_ENCRYPTION_KEY:ROOT, SUPABASE_SERVICE_ROLE_KEY:'dummy-service-role', EMAIL_LIVE_SENDING_ENABLED:'false' })
  tables = { workspace_email_preferences:[], email_oauth_states:[], email_gmail_accounts:[], workspace_gmail_connections:[], email_campaigns:[{ workspace_id:W, sending_enabled:true, state:'approved' }, { workspace_id:OTHER, sending_enabled:true, state:'approved' }] }
  events = []; responses = []; admin = true; memberRole = 'member'; loseConsume = false
  originalFetch = globalThis.fetch; globalThis.fetch = mockFetch
})
afterEach(() => { globalThis.fetch = originalFetch; for (const name of envNames) delete process.env[name] })
async function connect() {
  const res = response(); await handler(post({ workspaceId:W, action:'connect', redirectUri:'https://attacker.test/callback' }),res)
  assert.equal(res.statusCode,200)
  const state = new URL(res.data.authorizationUrl).searchParams.get('state')
  return { res, state }
}
async function finish(state, extra = '') {
  const res = response()
  await handler({ method:'GET', url:`/api/email-gmail?state=${state}&code=dummy-code${extra}`, headers:{ cookie:`${COOKIE}=${state}` } }, res)
  return res
}
function seedConnection({ expired = true, enabled = false, credentialOverrides = {}, workspaceId = W } = {}) {
  const credentials = { sub:'google-sub-1', email:'sender@example.test', verified_email:true, scopes:[SCOPE,'openid','email'], accessToken:'dummy-old-access', refresh_token:'dummy-old-refresh', expires_at:Date.now() + (expired ? -1000 : 3600000), ...credentialOverrides }
  const account_key = keyFor(credentials.sub)
  const connection = { workspace_id:workspaceId, account_key, email:credentials.email, configured:true, sending_enabled:enabled, daily_budget:300, created_by:USER, encrypted_credentials:encryptEmailCredential(credentials, workspaceId) }
  tables.workspace_gmail_connections.push(connection)
  tables.email_gmail_accounts.push({ account_key, daily_budget:200, sending_enabled:enabled })
  return connection
}

test('connect uses admin authorization, opaque hashed state, exact redirect and least privilege', async () => {
  const { res, state } = await connect(), url = new URL(res.data.authorizationUrl)
  assert.match(state,/^[A-Za-z0-9_-]{43}$/)
  assert.equal(tables.email_oauth_states[0].state_hash,hashEmailToken(state))
  assert(!JSON.stringify(tables.email_oauth_states).includes(state))
  assert.equal(tables.email_oauth_states[0].created_by,USER)
  assert.equal(url.searchParams.get('redirect_uri'),REDIRECT)
  assert.deepEqual(new Set(url.searchParams.get('scope').split(' ')),new Set([SCOPE,'openid','email']))
  assert.equal(url.searchParams.get('access_type'),'offline')
  assert.equal(url.searchParams.get('prompt'),'consent')
  assert.equal(url.searchParams.get('include_granted_scopes'),'false')
  for (const item of ['Secure','HttpOnly','SameSite=Lax','Path=/','Max-Age=600']) assert(res.headers['Set-Cookie'].includes(item))
  assert(!res.headers['Set-Cookie'].includes('Domain='))
  assert.equal(res.headers['Cache-Control'],'no-store')
  assert.equal(res.data.configured,false)
})
test('unconfigured OAuth honestly fails without making Google requests or creating states', async () => {
  for (const name of ['GOOGLE_EMAIL_CLIENT_ID','GOOGLE_EMAIL_CLIENT_SECRET','GOOGLE_EMAIL_REDIRECT_URI','EMAIL_CREDENTIALS_ENCRYPTION_KEY','SUPABASE_SERVICE_ROLE_KEY']) {
    const value = process.env[name]; delete process.env[name]
    const res = response(); await handler(post({ workspaceId:W, action:'connect' }),res)
    assert.equal(res.statusCode,503); assert.equal(res.data.configured,false)
    assert.equal(tables.email_oauth_states.length,0)
    process.env[name] = value
  }
  assert(!events.some(event => event.url.startsWith('https://oauth2.')))
})
test('non-admin and missing authentication cannot start or disconnect Gmail', async () => {
  admin = false
  for (const action of ['connect','disconnect']) { const res = response(); await handler(post({ workspaceId:W,action }),res); assert.equal(res.statusCode,403) }
  const res = response(); await handler({ ...post({ workspaceId:W,action:'connect' }), headers:{} },res)
  assert.equal(res.statusCode,401); assert.equal(tables.email_oauth_states.length,0)
})
test('callback consumes state once, verifies stored admin and encrypts connection without enabling sending', async () => {
  const { state } = await connect(); exchange()
  const res = await finish(state, `&workspaceId=${OTHER}&user_id=${OTHER}`)
  assert.equal(res.headers.Location,'/email-campaigns?gmail=connected')
  assert.equal(res.headers['Referrer-Policy'],'no-referrer'); assert(res.headers['Content-Security-Policy'].includes("default-src 'none'"))
  assert(res.headers['Set-Cookie'].includes('Max-Age=0'))
  const conn = tables.workspace_gmail_connections[0]
  assert.equal(conn.workspace_id,W); assert.equal(conn.account_key,keyFor('google-sub-1'))
  assert.equal(conn.configured,true); assert.equal(conn.daily_budget,400); assert.equal(conn.created_by,USER); assert.equal(conn.sending_enabled,false)
  assert(!JSON.stringify(conn).includes('dummy-access')); assert(!JSON.stringify(conn).includes('dummy-refresh'))
  assert.equal(conn.encrypted_credentials.algorithm,'aes-256-gcm')
  assert.equal(decryptEmailCredential(conn.encrypted_credentials,W).refresh_token,'dummy-refresh')
  assert.equal(tables.email_gmail_accounts[0].sending_enabled,false)
  assert.equal(tables.email_campaigns[0].sending_enabled,false); assert.equal(tables.email_campaigns[1].sending_enabled,true)
  const patch = events.find(event => event.method === 'PATCH' && event.url.includes('email_oauth_states'))
  assert.equal(new URL(patch.url).searchParams.get('consumed_at'),'is.null')
  assert.equal(patch.headers.Prefer,'return=representation')
  assert.equal(events.find(event => event.url === 'https://oauth2.googleapis.com/token').body.redirect_uri,REDIRECT)
  const again = await finish(state); assert(again.headers.Location.includes('setup_failed'))
  assert.equal(events.filter(event => event.url === 'https://oauth2.googleapis.com/token').length,1)
})
test('callback first connection clamps default workspace budget to persisted shared account cap', async () => {
  const peer = seedConnection({ workspaceId:OTHER }), account = tables.email_gmail_accounts[0]
  account.daily_budget = 125
  const originalAccount = structuredClone(account), originalPeer = structuredClone(peer)
  const { state } = await connect(); exchange()
  assert.equal((await finish(state)).headers.Location,'/email-campaigns?gmail=connected')
  const conn = tables.workspace_gmail_connections.find(row => row.workspace_id === W)
  assert.equal(conn.daily_budget,125); assert.equal(conn.configured,true); assert.equal(conn.sending_enabled,false)
  assert.equal(conn.encrypted_credentials.algorithm,'aes-256-gcm')
  assert.equal(decryptEmailCredential(conn.encrypted_credentials,W).refresh_token,'dummy-refresh')
  assert.deepEqual(account,originalAccount); assert.deepEqual(peer,originalPeer)
  assert.equal(tables.email_campaigns[0].sending_enabled,false); assert.equal(tables.email_campaigns[1].sending_enabled,true)
  const accountEvents = events.filter(event => new URL(event.url).pathname === '/rest/v1/email_gmail_accounts')
  assert.deepEqual(accountEvents.map(event => event.method),['POST','GET'])
  assert.equal(accountEvents[0].headers.Prefer,'resolution=ignore-duplicates')
  const read = new URL(accountEvents[1].url)
  assert.equal(read.searchParams.get('select'),'daily_budget'); assert.equal(read.searchParams.get('limit'),'1')
  assert.equal(read.searchParams.get('account_key'),`eq.${account.account_key}`)
  assert.equal(events.filter(event => event.url.startsWith('https://gmail.')).length,0)
})
test('callback rejects missing, mismatched, duplicate, expired and concurrently consumed state without exchange', async () => {
  const { state } = await connect()
  for (const input of [{ cookie:'' },{ cookie:`${COOKIE}=${'x'.repeat(43)}` },{ cookie:`${COOKIE}=${state}; ${COOKIE}=${state}` }]) {
    const res = response(); await handler({ method:'GET',url:`/?state=${state}&code=dummy-code`,headers:input },res); assert(res.headers.Location.includes('setup_failed'))
  }
  const duplicate = await finish(state, `&state=${state}`); assert(duplicate.headers.Location.includes('setup_failed'))
  tables.email_oauth_states[0].expires_at = new Date(Date.now() - 1000).toISOString()
  assert((await finish(state)).headers.Location.includes('setup_failed'))
  tables.email_oauth_states[0].expires_at = new Date(Date.now() + 600000).toISOString(); loseConsume = true
  assert((await finish(state)).headers.Location.includes('setup_failed'))
  assert(!events.some(event => event.url === 'https://oauth2.googleapis.com/token'))
})
test('callback rechecks revoked admin membership and supports current admin members', async () => {
  let { state } = await connect(); admin = false
  assert((await finish(state)).headers.Location.includes('setup_failed'))
  assert(!events.some(event => event.url === 'https://oauth2.googleapis.com/token'))
  admin = true; ({ state } = await connect()); admin = false; memberRole = 'admin'; exchange()
  assert((await finish(state)).headers.Location.includes('gmail=connected'))
  const memberQuery = events.find(event => event.url.includes('/workspace_members?'))
  assert.equal(new URL(memberQuery.url).searchParams.get('user_id'),`eq.${USER}`)
})
test('callback rejects insufficient scopes, unverified identity and missing refresh grant safely', async () => {
  for (const [tokenChange,userChange] of [[{ scope:'openid email' },null],[{ scope:SCOPE },null],[{}, { email_verified:false }],[{ refresh_token:undefined },{}]]) {
    const { state } = await connect()
    googleResponse('https://oauth2.googleapis.com/token',tokens(tokenChange))
    if (tokenChange.scope === undefined) googleResponse('https://openidconnect.googleapis.com/v1/userinfo',identity(userChange))
    const res = await finish(state)
    assert(res.headers.Location.includes('setup_failed')); assert(!res.headers.Location.includes('dummy-code'))
    assert.equal(tables.workspace_gmail_connections.length,0)
    responses = []
  }
})
test('same verified identity retains old refresh token and clamps reconnect budget to current shared cap', async () => {
  const previous = seedConnection({ enabled:true }), { state } = await connect()
  const originalAccount = structuredClone(tables.email_gmail_accounts[0])
  exchange({ refresh_token:undefined }); assert((await finish(state)).headers.Location.includes('gmail=connected'))
  assert.equal(decryptEmailCredential(previous.encrypted_credentials,W).refresh_token,'dummy-old-refresh')
  assert.equal(previous.daily_budget,200); assert.equal(previous.sending_enabled,false)
  assert.deepEqual(tables.email_gmail_accounts[0],originalAccount)
  assert.equal(tables.email_campaigns[0].sending_enabled,false)
})
test('callback never raises a lower workspace budget or resets a higher shared account cap', async () => {
  const previous = seedConnection(), account = tables.email_gmail_accounts[0]
  previous.daily_budget = 150; account.daily_budget = 600
  const originalAccount = structuredClone(account)
  const { state } = await connect(); exchange()
  assert.equal((await finish(state)).headers.Location,'/email-campaigns?gmail=connected')
  assert.equal(previous.daily_budget,150); assert.equal(previous.sending_enabled,false)
  assert.deepEqual(account,originalAccount)
  assert.equal(decryptEmailCredential(previous.encrypted_credentials,W).refresh_token,'dummy-refresh')
  assert.equal(tables.email_campaigns[0].sending_enabled,false)
  assert.equal(events.filter(event => new URL(event.url).pathname === '/rest/v1/email_gmail_accounts' && event.method !== 'GET').length,1)
  assert.equal(events.find(event => event.url.includes('/email_gmail_accounts?') && event.method === 'POST').headers.Prefer,'resolution=ignore-duplicates')
  assert.equal(events.filter(event => event.url.startsWith('https://gmail.')).length,0)
})
test('different Google identity cannot silently reuse an old refresh token', async () => {
  seedConnection(); const { state } = await connect()
  exchange({ refresh_token:undefined },{ sub:'different-sub',email:'different@example.test' })
  assert((await finish(state)).headers.Location.includes('setup_failed'))
  assert.equal(tables.workspace_gmail_connections[0].email,'sender@example.test')
})
test('disconnect pauses and removes only selected connection despite server revoke failure', async () => {
  seedConnection(); seedConnection({ workspaceId:OTHER })
  responses.push({ url:'https://oauth2.googleapis.com/revoke',error:new Error('dummy revocation failure') })
  const res = response(); await handler(post({ workspaceId:W,action:'disconnect' }),res)
  assert.equal(res.statusCode,200); assert.equal(res.data.configured,false)
  assert.equal(tables.workspace_gmail_connections.length,1); assert.equal(tables.workspace_gmail_connections[0].workspace_id,OTHER)
  assert.equal(tables.email_campaigns[0].sending_enabled,false); assert.equal(tables.email_campaigns[1].sending_enabled,true)
  assert(!JSON.stringify(res.data).includes('refresh'))
})
test('refresh stores encrypted fresh grant and returns access token only for server caller', async () => {
  seedConnection(); googleResponse('https://oauth2.googleapis.com/token',tokens({ refresh_token:undefined,scope:undefined }))
  const connection = await refreshGmailConnection(W)
  assert.equal(connection.accessToken,'dummy-access'); assert.equal(connection.account.daily_budget,200)
  assert(!Object.hasOwn(connection,'encrypted_credentials'))
  const saved = decryptEmailCredential(tables.workspace_gmail_connections[0].encrypted_credentials,W)
  assert.equal(saved.refresh_token,'dummy-old-refresh'); assert.equal(saved.accessToken,'dummy-access')
  assert(saved.expires_at > Date.now() + 3500000)
  assert.equal(events.find(event => event.url === 'https://oauth2.googleapis.com/token').body.grant_type,'refresh_token')
})
test('valid cached grant avoids refresh; revoked, corrupted and removed scopes require reconnection', async () => {
  seedConnection({ expired:false }); assert.equal((await refreshGmailConnection(W)).accessToken,'dummy-old-access')
  assert(!events.some(event => event.url === 'https://oauth2.googleapis.com/token'))
  tables.workspace_gmail_connections = []; tables.email_gmail_accounts = []
  seedConnection(); googleResponse('https://oauth2.googleapis.com/token',{ error:'invalid_grant',error_description:'dummy-secret-provider-detail' },400)
  await assert.rejects(refreshGmailConnection(W),err => err.code === 'GMAIL_RECONNECT_REQUIRED' && !err.message.includes('dummy-secret'))
  assert.equal(tables.workspace_gmail_connections[0].configured,false); assert.equal(tables.email_campaigns[0].sending_enabled,false)
  tables.workspace_gmail_connections = []; tables.email_gmail_accounts = []
  seedConnection({ credentialOverrides:{ scopes:['openid','email'] } })
  await assert.rejects(refreshGmailConnection(W),{ code:'GMAIL_RECONNECT_REQUIRED' })
  assert.equal(tables.workspace_gmail_connections[0].configured,false)
})
test('temporary refresh failure leaves credentials configured but sends nothing', async () => {
  seedConnection(); googleResponse('https://oauth2.googleapis.com/token',{ error:'temporarily_unavailable' },503)
  await assert.rejects(refreshGmailConnection(W),{ code:'GMAIL_TEMPORARILY_UNAVAILABLE' })
  assert.equal(tables.workspace_gmail_connections[0].configured,true)
  assert(!events.some(event => event.url.startsWith('https://gmail.')))
})
test('submission remains disabled by default and requires shared account gate', async () => {
  seedConnection({ expired:false,enabled:true }); const connection = await refreshGmailConnection(W)
  await assert.rejects(submitGmailEmail(connection,'YWJj'),{ code:'EMAIL_SENDING_DISABLED' })
  process.env.EMAIL_LIVE_SENDING_ENABLED = 'true'; connection.account.sending_enabled = false
  await assert.rejects(submitGmailEmail(connection,'YWJj'),{ code:'EMAIL_SENDING_DISABLED' })
  assert(!events.some(event => event.url.startsWith('https://gmail.')))
})
test('submission returns only definite provider id; 4xx rejection is never automatically retried', async () => {
  process.env.EMAIL_LIVE_SENDING_ENABLED = 'true'; seedConnection({ expired:false,enabled:true }); const connection = await refreshGmailConnection(W)
  googleResponse('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{ id:'message123',threadId:'thread123',access_token:'ignored' })
  assert.deepEqual(await submitGmailEmail(connection,'YWJj'),{ id:'message123' })
  for (const status of [400,403,408,429]) {
    googleResponse('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{ error:{ message:'dummy-provider-secret-detail' } },status)
    await assert.rejects(submitGmailEmail(connection,'YWJj'),err => err.acceptanceUnknown === false && !err.message.includes('dummy-provider'))
  }
  assert.equal(events.filter(event => event.url.startsWith('https://gmail.')).length,5)
})
test('network, timeout, 5xx and malformed 2xx are acceptance-unknown without retries', async () => {
  process.env.EMAIL_LIVE_SENDING_ENABLED = 'true'; seedConnection({ expired:false,enabled:true }); const connection = await refreshGmailConnection(W)
  for (const error of [new Error('dummy network error'),new DOMException('dummy timeout','TimeoutError')]) {
    responses.push({ url:'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',error })
    await assert.rejects(submitGmailEmail(connection,'YWJj'),err => err.acceptanceUnknown === true && !err.message.includes('dummy'))
  }
  for (const [payload,status] of [[{},503],[{},200],[{ id:'' },200]]) {
    googleResponse('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',payload,status)
    await assert.rejects(submitGmailEmail(connection,'YWJj'),err => err.acceptanceUnknown === true)
  }
  responses.push({ url:'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',response:new Response('not json',{ status:200 }) })
  await assert.rejects(submitGmailEmail(connection,'YWJj'),err => err.acceptanceUnknown === true)
  assert.equal(events.filter(event => event.url.startsWith('https://gmail.')).length,6)
})
test('401 definite rejection disables scoped connection and workspace campaigns for reconnect', async () => {
  process.env.EMAIL_LIVE_SENDING_ENABLED = 'true'; seedConnection({ expired:false,enabled:true }); const connection = await refreshGmailConnection(W)
  googleResponse('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{ error:'unauthorized' },401)
  await assert.rejects(submitGmailEmail(connection,'YWJj'),err => err.code === 'GMAIL_RECONNECT_REQUIRED' && err.acceptanceUnknown === false)
  assert.equal(tables.workspace_gmail_connections[0].configured,false)
  assert.equal(tables.email_campaigns[0].sending_enabled,false); assert.equal(tables.email_campaigns[1].sending_enabled,true)
})

test('budget configuration requires admin, configured connection, and explicit paid Workspace confirmation', async () => {
  const request = extra => post({ workspaceId:W,action:'configure_budget',accountType:'workspace',dailyBudget:2000,...extra })
  let res = response(); await handler(request({ confirmWorkspace:true }),res); assert.equal(res.statusCode,409)
  seedConnection({ enabled:true })
  res = response(); await handler(request(),res); assert.equal(res.statusCode,400); assert.equal(res.data.code,'GMAIL_WORKSPACE_CONFIRMATION_REQUIRED')
  admin = false; res = response(); await handler(request({ confirmWorkspace:true }),res); assert.equal(res.statusCode,403)
  assert.equal(tables.email_gmail_accounts[0].daily_budget,200)
})
test('budget configuration rejects invalid types and out-of-range or coerced daily limits', async () => {
  seedConnection()
  for (const [accountType,dailyBudget] of [['workspace',2001],['personal',401],['personal',0],['workspace','2000'],['personal',1.5],['other',100]]) {
    const res = response(); await handler(post({ workspaceId:W,action:'configure_budget',accountType,dailyBudget,confirmWorkspace:true }),res)
    assert.equal(res.statusCode,400); assert.equal(tables.email_gmail_accounts[0].daily_budget,200)
  }
})
test('confirmed Workspace 2000 budget and personal 400 budget never activate sending', async () => {
  seedConnection({ enabled:true }); process.env.EMAIL_LIVE_SENDING_ENABLED = 'true'
  for (const [accountType,dailyBudget] of [['workspace',2000],['personal',400]]) {
    const res = response(); await handler(post({ workspaceId:W,action:'configure_budget',accountType,dailyBudget,confirmWorkspace:true }),res)
    assert.equal(res.statusCode,200); assert.equal(res.data.sendingEnabled,false)
    assert.equal(tables.email_gmail_accounts[0].daily_budget,dailyBudget)
    assert.equal(tables.workspace_gmail_connections[0].daily_budget,dailyBudget)
    assert.equal(tables.email_gmail_accounts[0].sending_enabled,false)
    assert.equal(tables.workspace_gmail_connections[0].sending_enabled,false)
    assert.equal(tables.email_campaigns[0].sending_enabled,false)
    assert.equal(tables.email_campaigns[1].sending_enabled,true)
  }
  assert(!events.some(event => event.url.startsWith('https://gmail.')))
})

test('workspace requested sender adds Google hint and rejects a different verified account', async () => {
  tables.workspace_email_preferences.push({workspace_id:W,expected_sender_email:'required@example.test'})
  const {state,res}=await connect()
  assert.equal(new URL(res.data.authorizationUrl).searchParams.get('login_hint'),'required@example.test')
  exchange()
  const result=await finish(state)
  assert.match(result.headers.Location,/setup_failed/)
  assert.equal(tables.workspace_gmail_connections.length,0)
})
test('requested sender is rechecked before unattended refresh and mismatch pauses workspace', async () => {
  seedConnection({expired:false,enabled:true})
  tables.workspace_email_preferences.push({workspace_id:W,expected_sender_email:'required@example.test'})
  await assert.rejects(refreshGmailConnection(W),/Reconnect Gmail/)
  assert.equal(tables.workspace_gmail_connections[0].configured,false)
  assert.equal(tables.email_campaigns[0].sending_enabled,false)
  assert.equal(events.filter(e=>e.url.includes('googleapis.com')).length,0)
})

test('callback labels rejected client credentials without leaking Google details or retrying consumed grants', async () => {
  const { state } = await connect()
  googleResponse('https://oauth2.googleapis.com/token', { error:'invalid_client', error_description:'synthetic-private-secret-detail', access_token:'synthetic-private-token' }, 401)
  const result = await finish(state)
  assert.equal(result.headers.Location, '/email-campaigns?gmail=setup_failed&code=GMAIL_CLIENT_CREDENTIALS_REJECTED')
  assert(!JSON.stringify(result).includes('synthetic-private'))
  assert(tables.email_oauth_states[0].consumed_at)
  assert.equal(tables.workspace_gmail_connections.length, 0)
  assert.equal(events.filter(e => e.url.includes('openidconnect.googleapis.com')).length, 0)
  await finish(state)
  assert.equal(events.filter(e => e.url === 'https://oauth2.googleapis.com/token').length, 1)
  assert.equal(events.filter(e => e.url.startsWith('https://gmail.')).length, 0)
})

test('callback separates failed grant, unknown provider rejection and malformed token responses', async () => {
  for (const [payload,status,code] of [
    [{ error:'invalid_grant', error_description:'synthetic-private-detail' },400,'GMAIL_GRANT_REJECTED'],
    [{ error:'arbitrary-private-error', error_description:'synthetic-private-detail' },503,'GMAIL_TOKEN_EXCHANGE_FAILED'],
    [{ token_type:'Bearer', expires_in:3600 },200,'GMAIL_TOKEN_RESPONSE_INVALID'],
  ]) {
    const { state } = await connect()
    googleResponse('https://oauth2.googleapis.com/token', payload, status)
    const result = await finish(state)
    assert.equal(result.headers.Location, `/email-campaigns?gmail=setup_failed&code=${code}`)
    assert(!JSON.stringify(result).includes('synthetic-private'))
    assert(!result.headers.Location.includes('arbitrary-private-error'))
  }
  assert.equal(tables.workspace_gmail_connections.length, 0)
  assert.equal(events.filter(e => e.url.startsWith('https://gmail.')).length, 0)
})

test('callback exposes safe scope, identity and offline grant categories without connecting', async () => {
  for (const [tokenChanges,userChanges,code] of [
    [{ scope:'openid email' },null,'GMAIL_SEND_PERMISSION_MISSING'],
    [{},{ email_verified:false },'GMAIL_IDENTITY_UNVERIFIED'],
    [{ refresh_token:undefined },{},'GMAIL_REFRESH_GRANT_MISSING'],
  ]) {
    const { state } = await connect()
    googleResponse('https://oauth2.googleapis.com/token', tokens(tokenChanges))
    if (userChanges) googleResponse('https://openidconnect.googleapis.com/v1/userinfo', identity(userChanges))
    const result = await finish(state)
    assert.equal(result.headers.Location, `/email-campaigns?gmail=setup_failed&code=${code}`)
    assert(tables.email_oauth_states.at(-1).consumed_at)
    assert.equal(tables.workspace_gmail_connections.length, 0)
  }
  assert.equal(events.filter(e => e.url.startsWith('https://gmail.')).length, 0)
})

test('callback accepts Google email-scope alias and retains all connection-disabled invariants', async () => {
  const { state } = await connect()
  exchange({ scope:`${SCOPE} openid https://www.googleapis.com/auth/userinfo.email` })
  const result = await finish(state)
  assert.equal(result.headers.Location, '/email-campaigns?gmail=connected')
  assert.equal(tables.workspace_gmail_connections[0].configured, true)
  assert.equal(tables.workspace_gmail_connections[0].sending_enabled, false)
  assert.equal(tables.email_gmail_accounts[0].sending_enabled, false)
  assert.equal(tables.email_campaigns[0].sending_enabled, false)
  assert.equal(events.filter(e => e.url.startsWith('https://gmail.')).length, 0)
})
