import crypto from 'node:crypto'

const SUPABASE_URL = 'https://jtogllurcrxxaguoxeus.supabase.co'
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0b2dsbHVyY3J4eGFndW94ZXVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4MDE2OTEsImV4cCI6MjEwMjM3NzY5MX0.2BanYaDFNpDMrwaBfz4vSa-CroeOhynemXh7m5YmBYM'

// This is Supabase's public project key, never a privileged credential.
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || SUPABASE_ANON_KEY

export function providerKeyError(code, message, status = 400) {
  const error = new Error(message)
  error.code = code
  error.status = status
  return error
}

function anonymousKey() {
  // The Vercel environment retains the legacy publishable key used by production routes.
  // If the environment value is not set, callers should configure it rather than exposing a key here.
  if (!SUPABASE_PUBLISHABLE_KEY) throw providerKeyError('SUPABASE_PUBLIC_KEY_MISSING', 'FloStudio server authentication is not configured.', 503)
  return SUPABASE_PUBLISHABLE_KEY
}

function serviceRoleKey() {
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '')
  if (!key) throw providerKeyError('SUPABASE_SERVICE_ROLE_MISSING', 'FloStudio secure storage is not configured in production.', 503)
  return key
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
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers:{ Authorization:`Bearer ${accessToken}`, apikey:anonymousKey() } })
  const user = await response.json().catch(() => null)
  if (!response.ok || !user?.id) throw providerKeyError('AUTH_REQUIRED', 'Your FloStudio session has expired. Sign in again and retry.', 401)
  return { user, accessToken }
}

async function rpcWithKey(name, args, key, authorization) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method:'POST',
    headers:{ apikey:key, Authorization:authorization, 'Content-Type':'application/json' },
    body:JSON.stringify(args),
  })
  const text = await response.text()
  const payload = text ? (() => { try { return JSON.parse(text) } catch { return null } })() : null
  if (!response.ok) throw providerKeyError('PROVIDER_DATABASE_ERROR', payload?.message || payload?.hint || 'FloStudio could not access the protected workspace provider key.', response.status === 401 || response.status === 403 ? response.status : 500)
  return payload
}

// User-JWT RPCs are restricted to authorization checks and never return credential material.
export async function authorizationRpc(name, args, accessToken) {
  return rpcWithKey(name, args, anonymousKey(), `Bearer ${accessToken}`)
}

// The database functions below independently re-check workspace-admin access from
// the signed-in JWT. Their only credential output is AES-GCM ciphertext, which this
// server decrypts with a deployment-only vault key and never returns to the browser.
export async function workspaceAdminVaultRpc(name, args, accessToken) {
  return authorizationRpc(name, args, accessToken)
}

// Credential material is read or changed only through the server's service role after an
// authorizationRpc check has verified the caller's workspace-admin membership.
export async function privilegedProviderRpc(name, args) {
  const key = serviceRoleKey()
  return rpcWithKey(name, args, key, `Bearer ${key}`)
}

export async function assertWorkspaceAdmin({ workspaceId, accessToken }) {
  if (!workspaceId) throw providerKeyError('WORKSPACE_REQUIRED', 'Select a workspace before using a provider key.', 400)
  const allowed = await authorizationRpc('is_workspace_admin', { target_workspace_id:workspaceId }, accessToken)
  if (allowed !== true) throw providerKeyError('WORKSPACE_ADMIN_REQUIRED', 'Only a workspace admin can manage this provider key.', 403)
  return true
}

export async function assertWorkspaceMember({ workspaceId, accessToken }) {
  if (!workspaceId) throw providerKeyError('WORKSPACE_REQUIRED', 'Select a workspace before continuing.', 400)
  const role = await authorizationRpc('get_workspace_role', { target_workspace_id:workspaceId }, accessToken)
  if (!['owner', 'admin', 'member'].includes(String(role || '').toLowerCase())) {
    throw providerKeyError('WORKSPACE_ACCESS_REQUIRED', 'This workspace is not available to your FloStudio account.', 403)
  }
  return role
}

export async function assertWorkspaceProduct({ workspaceId, productId, accessToken }) {
  if (!productId) throw providerKeyError('PRODUCT_REQUIRED', 'Select a portfolio app before continuing.', 400)
  await assertWorkspaceMember({ workspaceId, accessToken })
  const params = new URLSearchParams({
    select:'id,workspace_id,user_id,source_facts',
    id:`eq.${productId}`,
    workspace_id:`eq.${workspaceId}`,
    limit:'1',
  })
  const response = await fetch(`${SUPABASE_URL}/rest/v1/products?${params}`, {
    headers:{ apikey:anonymousKey(), Authorization:`Bearer ${accessToken}` },
  })
  const rows = await response.json().catch(() => [])
  const product = Array.isArray(rows) ? rows[0] : null
  if (!response.ok || !product?.id) {
    throw providerKeyError('PRODUCT_ACCESS_REQUIRED', 'This portfolio app is not available in the selected workspace.', 403)
  }
  return product
}

function safePublicImageUrl(value) {
  try {
    const url = new URL(String(value || '').trim())
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return ''
    const host = url.hostname.toLowerCase()
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || /^(127\.|0\.|10\.|192\.168\.|169\.254\.)/.test(host)) return ''
    return url.href
  } catch {
    return ''
  }
}

function registeredAppStoreImageUrls(sourceFacts = {}) {
  const facts = sourceFacts && typeof sourceFacts === 'object' ? sourceFacts : {}
  const metadata = facts.storeMetadata || facts.store_metadata || {}
  const candidates = [
    facts.image,
    facts.artworkUrl,
    ...(Array.isArray(facts.screenshots) ? facts.screenshots : []),
    ...(Array.isArray(facts.screenshotUrls) ? facts.screenshotUrls : []),
    ...(Array.isArray(metadata.screenshots) ? metadata.screenshots : []),
    ...(Array.isArray(metadata.ipadScreenshots) ? metadata.ipadScreenshots : []),
    ...(Array.isArray(metadata.appletvScreenshots) ? metadata.appletvScreenshots : []),
  ]
  return [...new Set(candidates.map(safePublicImageUrl).filter(Boolean))]
}

// Render endpoints accept a reference descriptor rather than trusting an arbitrary browser URL.
// A reference can resolve only to the selected product's registered App Store listing media or
// a product-scoped, approved App Store Connect import with exact Apple provenance.
export async function resolveVerifiedProductVisualReference({ workspaceId, productId, userId, accessToken, reference }) {
  const product = await assertWorkspaceProduct({ workspaceId, productId, accessToken })
  const descriptor = reference && typeof reference === 'object' ? reference : {}
  const source = String(descriptor.source || '').trim()

  if (source === 'app_store_listing') {
    const url = safePublicImageUrl(descriptor.url)
    const registered = registeredAppStoreImageUrls(product.source_facts)
    if (!url || !registered.includes(url)) {
      throw providerKeyError('UNVERIFIED_APP_REFERENCE', 'Choose a current App Store screenshot or artwork for this selected app before rendering.', 400)
    }
    return { source:'app_store_listing', url, label:'App Store listing visual' }
  }

  if (source === 'app_store_connect_import') {
    const mediaAssetId = String(descriptor.mediaAssetId || '').trim()
    if (!mediaAssetId) throw providerKeyError('UNVERIFIED_APP_REFERENCE', 'Choose approved App Store Connect media for this selected app before rendering.', 400)
    const params = new URLSearchParams({
      select:'id,asset_url,kind,source,asc_asset_id,asc_placement_id',
      id:`eq.${mediaAssetId}`,
      user_id:`eq.${userId}`,
      workspace_id:`eq.${workspaceId}`,
      product_id:`eq.${productId}`,
      kind:'eq.image',
      source:'eq.app_store_connect_import',
      limit:'1',
    })
    const response = await fetch(`${SUPABASE_URL}/rest/v1/media_assets?${params}`, {
      headers:{ apikey:anonymousKey(), Authorization:`Bearer ${accessToken}` },
    })
    const rows = await response.json().catch(() => [])
    const asset = Array.isArray(rows) ? rows[0] : null
    const url = safePublicImageUrl(asset?.asset_url)
    if (!response.ok || !asset?.id || !asset.asc_asset_id || !asset.asc_placement_id || !url) {
      throw providerKeyError('UNVERIFIED_APP_REFERENCE', 'That media item is not approved App Store Connect artwork for the selected app.', 403)
    }
    return { source:'app_store_connect_import', url, mediaAssetId:asset.id, label:'Approved App Store Connect media' }
  }

  throw providerKeyError('APP_REFERENCE_REQUIRED', 'Select a verified App Store screenshot, artwork, or approved App Store Connect image for this app before rendering.', 400)
}

export async function assertOwnedMediaAsset({ workspaceId, productId, mediaAssetId, userId, accessToken, providerJobId = null }) {
  if (!mediaAssetId) throw providerKeyError('MEDIA_ASSET_REQUIRED', 'This video render is missing its FloStudio media record.', 400)
  const params = new URLSearchParams({
    select:'id,provider_job_id',
    id:`eq.${mediaAssetId}`,
    user_id:`eq.${userId}`,
    workspace_id:`eq.${workspaceId}`,
    product_id:`eq.${productId}`,
    limit:'1',
  })
  if (providerJobId) params.set('provider_job_id', `eq.${providerJobId}`)
  const response = await fetch(`${SUPABASE_URL}/rest/v1/media_assets?${params}`, {
    headers:{ apikey:anonymousKey(), Authorization:`Bearer ${accessToken}` },
  })
  const rows = await response.json().catch(() => [])
  const asset = Array.isArray(rows) ? rows[0] : null
  if (!response.ok || !asset?.id) {
    throw providerKeyError('MEDIA_ASSET_ACCESS_REQUIRED', 'This video render is not available in the selected app.', 403)
  }
  return asset
}

export async function resolveWorkspaceOpenAIKey({ workspaceId, accessToken }) {
  if (!workspaceId || !accessToken) return null
  await assertWorkspaceAdmin({ workspaceId, accessToken })
  const rows = await workspaceAdminVaultRpc('get_workspace_openai_provider_credential', { target_workspace_id:workspaceId }, accessToken)
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
