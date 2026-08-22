import { authenticatedProviderUser, encryptProviderKey, parseProviderBody, providerKeyError, providerRpc, validateOpenAIKey } from './provider-key-vault.js'

function sendError(res, error) {
  return res.status(error?.status || 500).json({ error:error?.message || 'FloStudio could not manage this provider key.', code:error?.code || 'PROVIDER_KEY_ERROR' })
}

export default async function handler(req, res) {
  try {
    const { accessToken } = await authenticatedProviderUser(req)
    const body = req.method === 'GET' ? req.query || {} : parseProviderBody(req)
    const workspaceId = String(body.workspaceId || '').trim()
    if (!workspaceId) throw providerKeyError('WORKSPACE_REQUIRED', 'Select a workspace before connecting an OpenAI API key.', 400)

    if (req.method === 'GET') {
      const rows = await providerRpc('get_workspace_openai_provider_status', { target_workspace_id:workspaceId }, accessToken)
      const connection = Array.isArray(rows) ? rows[0] : null
      return res.status(200).json({ configured:Boolean(connection), keyLast4:connection?.key_last4 || null, updatedAt:connection?.updated_at || null })
    }
    if (req.method === 'DELETE') {
      await providerRpc('clear_workspace_openai_provider_credential', { target_workspace_id:workspaceId }, accessToken)
      return res.status(200).json({ configured:false })
    }
    if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' })

    const apiKey = String(body.apiKey || '').trim()
    if (!/^sk-[A-Za-z0-9_-]{16,}$/.test(apiKey)) throw providerKeyError('OPENAI_PROVIDER_KEY_INVALID', 'Enter a valid OpenAI API key beginning with “sk-”.', 400)
    await validateOpenAIKey(apiKey)
    await providerRpc('save_workspace_openai_provider_credential', {
      target_workspace_id:workspaceId,
      target_encrypted_api_key:encryptProviderKey(apiKey),
      target_key_last4:apiKey.slice(-4),
    }, accessToken)
    return res.status(200).json({ configured:true, keyLast4:apiKey.slice(-4), message:'Workspace OpenAI provider key connected securely.' })
  } catch (error) {
    return sendError(res, error)
  }
}
