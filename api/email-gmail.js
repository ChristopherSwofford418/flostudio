import crypto from 'node:crypto'
import { authenticatedProviderUser, assertWorkspaceAdmin } from './provider-key-vault.js'
import { emailDb, emailRpc, emailError, encryptEmailCredential, decryptEmailCredential, normalizeEmail, hashEmailToken, randomEmailToken, safeEmailSecretEqual } from './email-core.js'

const SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send'
const COOKIE = '__Host-flo-email-state'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const query = (table, fields, filters) => `${table}?${new URLSearchParams({ select:fields, ...filters, limit:'1' })}`
const scoped = workspaceId => `workspace_gmail_connections?${new URLSearchParams({ workspace_id:`eq.${workspaceId}` })}`
const rootAvailable = () => Boolean(process.env.EMAIL_CREDENTIALS_ENCRYPTION_KEY || process.env.ASC_CREDENTIALS_ENCRYPTION_KEY || process.env.OPENAI_PROVIDER_VAULT_KEY)
function oauthConfig() {
  const client_id = process.env.GOOGLE_EMAIL_CLIENT_ID, client_secret = process.env.GOOGLE_EMAIL_CLIENT_SECRET, redirect_uri = process.env.GOOGLE_EMAIL_REDIRECT_URI
  let valid = false
  try { const u = new URL(redirect_uri); valid = u.protocol === 'https:' && !u.username && !u.password && !u.hash } catch { /* Unavailable, not a simulated connection. */ }
  if (!client_id || !client_secret || !valid || !rootAvailable() || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw emailError('GMAIL_NOT_CONFIGURED', 'Gmail OAuth or encrypted storage is unavailable. Ask an administrator to finish server setup.', 503)
  return { client_id, client_secret, redirect_uri }
}
function accountKey(sub) {
  const root = process.env.EMAIL_CREDENTIALS_ENCRYPTION_KEY || process.env.ASC_CREDENTIALS_ENCRYPTION_KEY || process.env.OPENAI_PROVIDER_VAULT_KEY
  if (!root) throw emailError('EMAIL_VAULT_NOT_CONFIGURED', 'The Gmail credential vault is unavailable.', 503)
  return crypto.createHmac('sha256', root).update(`flostudio:gmail-account:v1:${sub}`).digest('hex')
}
const budget = value => Number.isInteger(value) && value >= 1 && value <= 2000 ? value : 400
const scopesOf = scope => typeof scope === 'string' ? scope.split(/\s+/).filter(Boolean) : []
const granted = scopes => Array.isArray(scopes) && scopes.includes(SEND_SCOPE) && scopes.includes('openid') && (scopes.includes('email') || scopes.includes('https://www.googleapis.com/auth/userinfo.email'))
function tokenValid(tokens) {
  return typeof tokens?.access_token === 'string' && tokens.access_token.length > 0 && !/[\r\n]/.test(tokens.access_token) && String(tokens.token_type).toLowerCase() === 'bearer' && Number.isFinite(Number(tokens.expires_in)) && Number(tokens.expires_in) > 0
}
async function google(url, options) {
  try {
    const response = await fetch(url, { ...options, redirect:'error', signal:AbortSignal.timeout(15000) })
    return { response, payload:await response.json().catch(() => null) }
  } catch { throw emailError('GMAIL_TEMPORARILY_UNAVAILABLE', 'Gmail could not complete the secure request. Try again later.', 503) }
}
const form = body => ({ method:'POST', headers:{ 'Content-Type':'application/x-www-form-urlencoded' }, body:new URLSearchParams(body).toString() })
async function pauseWorkspace(workspaceId) {
  await emailRpc('email_pause_workspace', { p_workspace_id:workspaceId })
}
export async function expectedGmailSender(workspaceId) {
  const preference=(await emailDb(query('workspace_email_preferences','expected_sender_email',{workspace_id:`eq.${workspaceId}`})))?.[0]
  return preference?.expected_sender_email ? normalizeEmail(preference.expected_sender_email) : ''
}
async function invalidate(workspaceId) {
  await emailDb(scoped(workspaceId), { method:'PATCH', body:{ configured:false, sending_enabled:false } })
  await pauseWorkspace(workspaceId)
}
const reconnect = () => emailError('GMAIL_RECONNECT_REQUIRED', 'Reconnect Gmail before sending any more email.', 409)
async function callbackAdmin(workspaceId, userId) {
  if (!uuid(workspaceId) || !uuid(userId)) throw reconnect()
  const owners = await emailDb(query('workspaces', 'id', { id:`eq.${workspaceId}`, owner_user_id:`eq.${userId}` }))
  if (owners?.length === 1) return
  const members = await emailDb(query('workspace_members', 'role', { workspace_id:`eq.${workspaceId}`, user_id:`eq.${userId}`, role:'eq.admin' }))
  if (members?.[0]?.role !== 'admin') throw emailError('WORKSPACE_ADMIN_REQUIRED', 'Workspace admin access is required.', 403)
}
function cookieState(req) {
  const matches = String(req.headers?.cookie || '').split(';').map(s => s.trim()).filter(s => s.startsWith(`${COOKIE}=`))
  return matches.length === 1 ? matches[0].slice(COOKIE.length + 1) : ''
}
function parameter(req, name) {
  const values = new URL(req.url || '/', 'https://callback.invalid').searchParams.getAll(name)
  if (values.length) return values.length === 1 ? values[0] : ''
  const value = req.query?.[name]
  return typeof value === 'string' ? value : ''
}
const cookie = (res, state = '') => res.setHeader('Set-Cookie', `${COOKIE}=${state}; Max-Age=${state ? 600 : 0}; Path=/; Secure; HttpOnly; SameSite=Lax`)
async function callback(req) {
  const state = parameter(req, 'state')
  if (!/^[A-Za-z0-9_-]{43}$/.test(state) || !safeEmailSecretEqual(state, cookieState(req))) throw reconnect()
  const hash = hashEmailToken(state), now = new Date().toISOString()
  const states = await emailDb(query('email_oauth_states', 'workspace_id,created_by,expires_at', { state_hash:`eq.${hash}`, consumed_at:'is.null', expires_at:`gt.${now}` }))
  const saved = states?.[0]
  if (!saved || !uuid(saved.workspace_id) || !uuid(saved.created_by) || !(Date.parse(saved.expires_at) > Date.now())) throw reconnect()
  const filters = new URLSearchParams({ state_hash:`eq.${hash}`, workspace_id:`eq.${saved.workspace_id}`, created_by:`eq.${saved.created_by}`, consumed_at:'is.null', expires_at:`gt.${new Date().toISOString()}`, select:'workspace_id,created_by' })
  const consumed = await emailDb(`email_oauth_states?${filters}`, { method:'PATCH', body:{ consumed_at:new Date().toISOString() }, prefer:'return=representation' })
  if (!Array.isArray(consumed) || consumed.length !== 1 || consumed[0].workspace_id !== saved.workspace_id || consumed[0].created_by !== saved.created_by) throw reconnect()
  await callbackAdmin(saved.workspace_id, saved.created_by)
  const code = parameter(req, 'code')
  if (!code || code.length > 4096 || parameter(req, 'error')) throw reconnect()
  const config = oauthConfig()
  const { response, payload:tokens } = await google(TOKEN_URL, form({ ...config, code, grant_type:'authorization_code' }))
  const scopes = scopesOf(tokens?.scope)
  if (!response.ok || !tokenValid(tokens) || !granted(scopes)) throw reconnect()
  const info = await google(USERINFO_URL, { headers:{ Authorization:`Bearer ${tokens.access_token}` } })
  const user = info.payload
  if (!info.response.ok || typeof user?.sub !== 'string' || !user.sub.trim() || user.sub.length > 255 || !(user.email_verified === true || user.verified_email === true)) throw reconnect()
  const email = normalizeEmail(user.email), key = accountKey(user.sub), workspaceId = saved.workspace_id
  const expected=await expectedGmailSender(workspaceId)
  if(expected && expected!==email) throw emailError('GMAIL_WRONG_SENDER','Authorize the requested workspace sender account. A different Google login cannot be substituted.',409)
  const previous = (await emailDb(query('workspace_gmail_connections', 'account_key,email,daily_budget,encrypted_credentials', { workspace_id:`eq.${workspaceId}` })))?.[0]
  let refresh = typeof tokens.refresh_token === 'string' ? tokens.refresh_token : ''
  if (!refresh && previous?.account_key === key && previous.email === email) {
    try {
      const old = decryptEmailCredential(previous.encrypted_credentials, workspaceId)
      if (old.sub === user.sub && old.email === email && old.verified_email === true && granted(old.scopes)) refresh = old.refresh_token
    } catch { /* A mismatched or unavailable old grant must never be retained. */ }
  }
  if (typeof refresh !== 'string' || !refresh) throw reconnect()
  const credentials = { refresh_token:refresh, accessToken:tokens.access_token, expires_at:Date.now() + Number(tokens.expires_in) * 1000, scopes, sub:user.sub, email, verified_email:true }
  // Ignore duplicates: reconnecting cannot enable an account or reset its shared budget.
  await emailDb('email_gmail_accounts?on_conflict=account_key', { method:'POST', body:{ account_key:key, daily_budget:400, sending_enabled:false }, prefer:'resolution=ignore-duplicates' })
  await pauseWorkspace(workspaceId)
  await emailDb('workspace_gmail_connections?on_conflict=workspace_id', { method:'POST', body:{ workspace_id:workspaceId, account_key:key, email, configured:true, sending_enabled:false, daily_budget:previous?.account_key === key ? budget(previous.daily_budget) : 400, created_by:saved.created_by, encrypted_credentials:encryptEmailCredential(credentials, workspaceId) }, prefer:'resolution=merge-duplicates' })
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
  if (req.method === 'GET') {
    cookie(res)
    let connected = false
    try { await callback(req); connected = true } catch { /* Never echo OAuth codes, tokens, or provider responses. */ }
    res.setHeader('Location', connected ? '/email-campaigns?gmail=connected' : '/email-campaigns?gmail=setup_failed&code=GMAIL_SETUP_FAILED')
    return res.status(303).end()
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error:'Method not allowed.', code:'METHOD_NOT_ALLOWED' }) }
  try {
    const { user, accessToken } = await authenticatedProviderUser(req)
    let body = req.body || {}
    if (typeof body === 'string') { try { body = JSON.parse(body) } catch { throw emailError('BODY_INVALID', 'Use a valid JSON request.') } }
    const { workspaceId, action } = body || {}
    if (!uuid(workspaceId)) throw emailError('WORKSPACE_REQUIRED', 'Select a valid workspace.')
    await assertWorkspaceAdmin({ workspaceId, accessToken })
    if (action === 'connect') {
      const config = oauthConfig(), state = randomEmailToken()
      await emailDb('email_oauth_states', { method:'POST', body:{ state_hash:hashEmailToken(state), workspace_id:workspaceId, created_by:user.id, expires_at:new Date(Date.now() + 600000).toISOString(), consumed_at:null } })
      cookie(res, state)
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      url.search = new URLSearchParams({ client_id:config.client_id, redirect_uri:config.redirect_uri, response_type:'code', scope:`${SEND_SCOPE} openid email`, state, access_type:'offline', prompt:'consent', include_granted_scopes:'false' }).toString()
      const expected=await expectedGmailSender(workspaceId)
      if(expected) url.searchParams.set('login_hint',expected)
      return res.status(200).json({ configured:false, authorizationUrl:url.href, expiresIn:600 })
    }
    if (action === 'configure_budget') {
      const { accountType, dailyBudget, confirmWorkspace } = body
      const max = accountType === 'workspace' ? 2000 : accountType === 'personal' ? 400 : 0
      if (!max || !Number.isInteger(dailyBudget) || dailyBudget < 1 || dailyBudget > max) throw emailError('GMAIL_BUDGET_INVALID', 'Choose a valid daily mailbox budget.')
      if (accountType === 'workspace' && confirmWorkspace !== true) throw emailError('GMAIL_WORKSPACE_CONFIRMATION_REQUIRED', 'Confirm this is a paid Workspace mailbox before selecting a Workspace budget.')
      const connection = (await emailDb(query('workspace_gmail_connections', 'account_key,configured', { workspace_id:`eq.${workspaceId}`, configured:'eq.true' })))?.[0]
      if (!connection || connection.configured !== true || !/^[a-f0-9]{64}$/.test(connection.account_key)) throw reconnect()
      await pauseWorkspace(workspaceId)
      await emailDb(`email_gmail_accounts?${new URLSearchParams({ account_key:`eq.${connection.account_key}` })}`, { method:'PATCH', body:{ daily_budget:dailyBudget, sending_enabled:false } })
      await emailDb(scoped(workspaceId), { method:'PATCH', body:{ daily_budget:dailyBudget, sending_enabled:false } })
      return res.status(200).json({ configured:true, accountType, dailyBudget, sendingEnabled:false })
    }
    if (action === 'disconnect') {
      const previous = (await emailDb(query('workspace_gmail_connections', 'encrypted_credentials', { workspace_id:`eq.${workspaceId}` })))?.[0]
      await invalidate(workspaceId)
      await emailDb(scoped(workspaceId), { method:'DELETE' })
      try {
        const credentials = decryptEmailCredential(previous?.encrypted_credentials, workspaceId)
        if (credentials.refresh_token) await fetch('https://oauth2.googleapis.com/revoke', { ...form({ token:credentials.refresh_token }), redirect:'error', signal:AbortSignal.timeout(15000) })
      } catch { /* Local disable/removal remains authoritative even if revocation fails. */ }
      cookie(res)
      return res.status(200).json({ configured:false, disconnected:true, sendingEnabled:false })
    }
    throw emailError('ACTION_INVALID', 'Choose connect, disconnect, or configure_budget.')
  } catch (error) {
    const status = error?.status || 500
    // Auth helpers can contain database error detail. Return only curated messages.
    const code = /^[A-Z_]+$/.test(error?.code || '') ? error.code : 'GMAIL_SETUP_FAILED'
    const message = status === 401 ? 'Sign in again before managing Gmail.' : status === 403 ? 'Only a workspace admin can manage Gmail.' : status === 503 ? 'Gmail OAuth or encrypted storage is unavailable. Ask an administrator to finish server setup.' : 'Gmail setup could not be completed.'
    return res.status(status).json({ configured:false, error:message, code })
  }
}

// Server-only result; never serialize this object into a browser response.
export async function refreshGmailConnection(workspaceId) {
  if (!uuid(workspaceId)) throw reconnect()
  const config = oauthConfig()
  const connection = (await emailDb(query('workspace_gmail_connections', 'workspace_id,account_key,email,configured,sending_enabled,daily_budget,encrypted_credentials', { workspace_id:`eq.${workspaceId}`, configured:'eq.true' })))?.[0]
  if (!connection || connection.configured !== true || connection.workspace_id !== workspaceId) throw reconnect()
  const expected=await expectedGmailSender(workspaceId)
  if(expected && expected!==connection.email) {await invalidate(workspaceId);throw reconnect()}
  const account = (await emailDb(query('email_gmail_accounts', 'account_key,daily_budget,sending_enabled', { account_key:`eq.${connection.account_key}` })))?.[0]
  if (!account || account.account_key !== connection.account_key) throw reconnect()
  let credentials
  try {
    credentials = decryptEmailCredential(connection.encrypted_credentials, workspaceId)
    if (credentials.verified_email !== true || !granted(credentials.scopes) || !credentials.sub || accountKey(credentials.sub) !== connection.account_key || normalizeEmail(credentials.email) !== connection.email || !credentials.refresh_token) throw reconnect()
  } catch { await invalidate(workspaceId); throw reconnect() }
  if (!credentials.accessToken || !(credentials.expires_at > Date.now() + 60000)) {
    const { response, payload:tokens } = await google(TOKEN_URL, form({ client_id:config.client_id, client_secret:config.client_secret, grant_type:'refresh_token', refresh_token:credentials.refresh_token }))
    if (!response.ok) {
      if (response.status >= 400 && response.status < 500 && ![408,429].includes(response.status)) { await invalidate(workspaceId); throw reconnect() }
      throw emailError('GMAIL_TEMPORARILY_UNAVAILABLE', 'Gmail token refresh is temporarily unavailable.', 503)
    }
    const scopes = tokens?.scope === undefined ? credentials.scopes : scopesOf(tokens.scope)
    if (!tokenValid(tokens) || !granted(scopes)) { await invalidate(workspaceId); throw reconnect() }
    credentials = { ...credentials, accessToken:tokens.access_token, expires_at:Date.now() + Number(tokens.expires_in) * 1000, scopes, refresh_token:tokens.refresh_token || credentials.refresh_token }
    await emailDb(scoped(workspaceId), { method:'PATCH', body:{ encrypted_credentials:encryptEmailCredential(credentials, workspaceId) } })
  }
  const { encrypted_credentials, ...safe } = connection
  return { ...safe, account, accessToken:credentials.accessToken }
}

export async function submitGmailEmail(connection, raw) {
  if (!uuid(connection?.workspace_id) || connection.configured !== true || !connection.accessToken) throw reconnect()
  if (process.env.EMAIL_LIVE_SENDING_ENABLED !== 'true' || connection.sending_enabled !== true || connection.account?.sending_enabled !== true || connection.account?.account_key !== connection.account_key) throw emailError('EMAIL_SENDING_DISABLED', 'Email sending is disabled.', 409)
  if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]+$/.test(raw)) throw emailError('EMAIL_PAYLOAD_INVALID', 'A valid prepared message is required.')
  const uncertain = () => Object.assign(emailError('GMAIL_ACCEPTANCE_UNKNOWN', 'Gmail submission outcome is unknown. Do not retry automatically.', 502), { acceptanceUnknown:true })
  let response
  try {
    response = await fetch(SEND_URL, { method:'POST', headers:{ Authorization:`Bearer ${connection.accessToken}`, 'Content-Type':'application/json' }, body:JSON.stringify({ raw }), redirect:'error', signal:AbortSignal.timeout(15000) })
  } catch { throw uncertain() }
  if (response.status >= 400 && response.status < 500) {
    if (response.status === 401) { try { await invalidate(connection.workspace_id) } catch { /* Never convert a definite rejection into an automatic resend. */ } }
    throw Object.assign(response.status === 401 ? reconnect() : emailError('GMAIL_SUBMISSION_REJECTED', 'Gmail rejected this submission. It will not be retried automatically.', 422), { acceptanceUnknown:false })
  }
  if (!response.ok) throw uncertain()
  const payload = await response.json().catch(() => null)
  if (typeof payload?.id !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(payload.id)) throw uncertain()
  return { id:payload.id }
}
