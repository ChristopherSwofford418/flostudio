import crypto from 'node:crypto'
import { assertWorkspaceAdmin, authenticatedProviderUser, parseProviderBody, privilegedProviderRpc, providerKeyError } from './provider-key-vault.js'

function vaultKey() {
  const source = String(process.env.OPENAI_PROVIDER_VAULT_KEY || process.env.ASC_CREDENTIALS_ENCRYPTION_KEY || '')
  if (!source) throw providerKeyError('TYPESAFE_VAULT_NOT_CONFIGURED', 'FloStudio’s encrypted provider-key vault is not configured in production yet.', 503)
  return crypto.createHash('sha256').update(`flostudio:workspace-typesafe-provider:v1:${source}`).digest()
}

export function encryptTypeSafeKey(value) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', vaultKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return { version:1, algorithm:'aes-256-gcm', iv:iv.toString('base64'), tag:cipher.getAuthTag().toString('base64'), ciphertext:ciphertext.toString('base64') }
}

export function decryptTypeSafeKey(envelope) {
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', vaultKey(), Buffer.from(envelope.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    throw providerKeyError('TYPESAFE_KEY_DECRYPTION_FAILED', 'FloStudio could not read the encrypted TypeSafe key. Replace it to reconnect Jev.', 409)
  }
}

export async function resolveWorkspaceTypeSafeKey({ workspaceId, accessToken }) {
  if (!workspaceId || !accessToken) return null
  await assertWorkspaceAdmin({ workspaceId, accessToken })
  const rows = await privilegedProviderRpc('get_workspace_typesafe_provider_credential', { target_workspace_id:workspaceId })
  const envelope = Array.isArray(rows) ? rows[0]?.encrypted_api_key : null
  return envelope ? decryptTypeSafeKey(envelope) : null
}

export async function validateTypeSafeKey(apiKey) {
  const response = await fetch('https://api.typesafe.ai/v1/models', { headers:{ Authorization:`Bearer ${apiKey}` } })
  if (response.ok) return { ok:true }
  const payload = await response.json().catch(() => ({}))
  const message = payload?.detail || payload?.message || payload?.error?.message || 'TypeSafe could not validate this API key.'
  throw providerKeyError(response.status === 401 ? 'TYPESAFE_PROVIDER_KEY_REJECTED' : 'TYPESAFE_PROVIDER_UNAVAILABLE', message, response.status === 401 ? 401 : 422)
}

export { assertWorkspaceAdmin, authenticatedProviderUser, parseProviderBody, privilegedProviderRpc, providerKeyError }
