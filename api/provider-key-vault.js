import crypto from 'node:crypto'

const SUPABASE_URL = 'https://jtogllurcrxxaguoxeus.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0b2dsbHVyY3J4eGFndW94ZXVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4MDE2OTEsImV4cCI6MjEwMjM3NzY5MX0.2BanYaDFNpDMrwaBfz4vSa-CroeOhynemXh7m5YmBYM'

export function providerKeyError(code, message, status = 400) {
  const error = new Error(message)
  error.code = code
  error.status = status
  return error
}

function rootKey() {
  const value = String(process.env.OPENAI_PROVIDER_VAULT_KEY || process.env.ASC_CREDENTIALS_ENCRYPTION_KEY || '')
  if (!value) throw providerKeyError('PROVIDER_VAULT_NOT_CONFIGURED', 'FloStudio’s encrypted provider-key vault is not configured in production yet.', 503)
  return crypto.createHash('sha256').update(`flostudio:workspace-openai-provider:v1:${value}`).digest()
}

export function encryptProviderKey(value) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', rootKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return { version:1, algorithm:'aes-256-gcm', iv:iv.toString('base64'), tag:cipher.getAuthTag().toString('base64'), ciphertext:ciphertext.toString('base64') }
}

export function decryptProviderKey(envelope) {
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', rootKey(), Buffer.from(envelope.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    throw providerKeyError('PROVIDER_KEY_DECRYPTION_FAILED', 'FloStudio could not read the encrypted workspace provider key. Replace it in Creative Lab to reconnect.', 409)
  }
}

export function parseProviderBody(req) {
  if (!req.body) return {}
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body || '{}') } catch { return {} }
  }
  return req.body
}

export async function authenticatedProviderUser(req) {
  const authorization = req.headers.authorization || ''
  const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!accessToken) throw providerKeyError('AUTH_REQUIRED', 'Sign in to FloStudio before using a workspace provider key.', 401)
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers:{ Authorization:`Bearer ${accessToken}`, apikey:SUPABASE_ANON_KEY } })
  const user = await response.json().catch(() => null)
  if (!response.ok || !user?.id) throw providerKeyError('AUTH_REQUIRED', 'Your FloStudio session has expired. Sign in again and retry.', 401)
  return { user, accessToken }
}

export async function providerRpc(name, args, accessToken) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method:'POST', headers:{ apikey:SUPABASE_ANON_KEY, Authorization:`Bearer ${accessToken}`, 'Content-Type':'application/json' }, body:JSON.stringify(args),
  })
  const text = await response.text()
  const payload = text ? (() => { try { return JSON.parse(text) } catch { return null } })() : null
  if (!response.ok) throw providerKeyError('PROVIDER_DATABASE_ERROR', payload?.message || payload?.hint || 'FloStudio could not access the protected workspace provider key.', response.status === 401 || response.status === 403 ? response.status : 500)
  return payload
}

export async function resolveWorkspaceOpenAIKey({ workspaceId, accessToken }) {
  if (!workspaceId || !accessToken) return null
  const rows = await providerRpc('get_workspace_openai_provider_credential', { target_workspace_id:workspaceId }, accessToken)
  const envelope = Array.isArray(rows) ? rows[0]?.encrypted_api_key : null
  return envelope ? decryptProviderKey(envelope) : null
}

export async function validateOpenAIKey(apiKey) {
  const response = await fetch('https://api.openai.com/v1/models', { headers:{ Authorization:`Bearer ${apiKey}` } })
  if (response.ok) return { ok:true }
  const payload = await response.json().catch(() => ({}))
  const message = payload?.error?.message || 'OpenAI could not validate this API key.'
  const billing = response.status === 429 || /credit|quota|billing|insufficient/i.test(message)
  throw providerKeyError(billing ? 'OPENAI_PROVIDER_CREDITS_UNAVAILABLE' : 'OPENAI_PROVIDER_KEY_REJECTED', billing ? 'OpenAI accepted the request but this key has no available provider credits for live rendering. Add API credits, then save or replace this key.' : message, response.status === 401 ? 401 : 422)
}
