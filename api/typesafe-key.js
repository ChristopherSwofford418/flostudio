import { assertWorkspaceAdmin, authenticatedProviderUser, encryptTypeSafeKey, parseProviderBody, privilegedProviderRpc, providerKeyError, validateTypeSafeKey } from './typesafe-key-vault.js'

function sendError(res, error) {
  return res.status(error?.status || 500).json({ error:error?.message || 'FloStudio could not manage the TypeSafe provider key.', code:error?.code || 'TYPESAFE_KEY_ERROR' })
}

export default async function handler(req, res) {
  try {
    const { user, accessToken } = await authenticatedProviderUser(req)
    const body = req.method === 'GET' ? req.query || {} : parseProviderBody(req)
    const workspaceId = String(body.workspaceId || '').trim()
    if (!workspaceId) throw providerKeyError('WORKSPACE_REQUIRED', 'Select a workspace before connecting a TypeSafe API key.', 400)
    await assertWorkspaceAdmin({ workspaceId, accessToken })
    if (req.method === 'GET') {
      const rows = await privilegedProviderRpc('get_workspace_typesafe_provider_status', { target_workspace_id:workspaceId })
      const connection = Array.isArray(rows) ? rows[0] : null
      return res.status(200).json({ configured:Boolean(connection), keyLast4:connection?.key_last4 || null, updatedAt:connection?.updated_at || null })
    }
    if (req.method === 'DELETE') {
      await privilegedProviderRpc('clear_workspace_typesafe_provider_credential', { target_workspace_id:workspaceId })
      return res.status(200).json({ configured:false })
    }
    if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' })
    const apiKey = String(body.apiKey || '').trim()
    if (apiKey.length < 12 || apiKey.length > 512 || /\s/.test(apiKey)) throw providerKeyError('TYPESAFE_PROVIDER_KEY_INVALID', 'Enter a valid TypeSafe API key.', 400)
    await validateTypeSafeKey(apiKey)
    await privilegedProviderRpc('save_workspace_typesafe_provider_credential', {
      target_workspace_id:workspaceId,
      target_encrypted_api_key:encryptTypeSafeKey(apiKey),
      target_key_last4:apiKey.slice(-4),
      target_created_by:user.id,
    })
    return res.status(200).json({ configured:true, keyLast4:apiKey.slice(-4), message:'Workspace TypeSafe / Jev key connected securely.' })
  } catch (error) {
    return sendError(res, error)
  }
}
