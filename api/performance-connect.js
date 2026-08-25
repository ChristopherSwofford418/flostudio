export const config = { maxDuration: 20 }

const SUPABASE_URL = 'https://jtogllurcrxxaguoxeus.supabase.co'

const PLATFORMS = {
  meta_ads: {
    label:'Meta Ads',
    requirement:'A Meta app with Marketing API access, an approved redirect URI, and a workspace-owned ad account are required before authorization can begin.',
    environment:['META_ADS_APP_ID', 'META_ADS_APP_SECRET', 'SUPABASE_SERVICE_ROLE_KEY', 'SOCIAL_CREDENTIALS_ENCRYPTION_KEY'],
  },
  tiktok_ads: {
    label:'TikTok Ads',
    requirement:'A TikTok for Business app with Marketing API access, approved redirect URI, and advertiser authorization are required before authorization can begin.',
    environment:['TIKTOK_ADS_APP_ID', 'TIKTOK_ADS_APP_SECRET', 'SUPABASE_SERVICE_ROLE_KEY', 'SOCIAL_CREDENTIALS_ENCRYPTION_KEY'],
  },
  google_ads: {
    label:'Google Ads',
    requirement:'A Google Cloud OAuth client, Google Ads developer token, approved redirect URI, and accessible customer account are required before authorization can begin.',
    environment:['GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_DEVELOPER_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY', 'SOCIAL_CREDENTIALS_ENCRYPTION_KEY'],
  },
  ga4: {
    label:'Google Analytics 4',
    requirement:'A Google Cloud OAuth client, Analytics Data API access, approved redirect URI, and an authorized GA4 property are required before authorization can begin.',
    environment:['GA4_CLIENT_ID', 'GA4_CLIENT_SECRET', 'SUPABASE_SERVICE_ROLE_KEY', 'SOCIAL_CREDENTIALS_ENCRYPTION_KEY'],
  },
}

function parseBody(req) {
  if (!req.body) return {}
  if (typeof req.body === 'string') { try { return JSON.parse(req.body) } catch { return {} } }
  return req.body
}

function apiError(code, message, status = 400, details = {}) {
  const error = new Error(message)
  error.code = code
  error.status = status
  error.details = details
  return error
}

function sendError(res, error) {
  return res.status(error?.status || 500).json({ error:error?.message || 'FloStudio could not read paid-performance connection status.', code:error?.code || 'PERFORMANCE_CONNECTION_ERROR', ...(error?.details || {}) })
}

function configured(platform) {
  return PLATFORMS[platform].environment.every(key => Boolean(process.env[key]))
}

async function authenticatedUser(req) {
  const authorization = req.headers.authorization || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!token) throw apiError('AUTH_REQUIRED', 'Sign in to FloStudio before managing paid-performance connections.', 401)
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw apiError('PERFORMANCE_VAULT_SETUP_REQUIRED', 'FloStudio’s secure credential vault must be configured before performance connections can be managed.', 503)
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers:{ Authorization:`Bearer ${token}`, apikey:serviceKey } })
  const user = await response.json().catch(() => null)
  if (!response.ok || !user?.id) throw apiError('AUTH_REQUIRED', 'Your FloStudio session has expired. Sign in again and retry.', 401)
  return user
}

async function db(path, { method='GET', body, prefer='return=representation' } = {}) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw apiError('PERFORMANCE_VAULT_SETUP_REQUIRED', 'FloStudio’s secure credential vault must be configured before performance connections can be managed.', 503)
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers:{ apikey:serviceKey, Authorization:`Bearer ${serviceKey}`, 'Content-Type':'application/json', Prefer:prefer },
    ...(body !== undefined ? { body:JSON.stringify(body) } : {}),
  })
  const text = await response.text()
  const payload = text ? (() => { try { return JSON.parse(text) } catch { return text } })() : null
  if (!response.ok) {
    const migrationMissing = response.status === 404 || String(payload?.message || payload || '').includes('performance_connections')
    throw apiError(migrationMissing ? 'GROWTH_LOOP_MIGRATION_REQUIRED' : 'PERFORMANCE_DATABASE_ERROR', migrationMissing ? 'The additive Growth Loop migration must be applied before paid-performance connection records can be stored.' : 'FloStudio could not read the paid-performance connection record.', 503)
  }
  return payload
}

async function statusFor({ platform, userId, workspaceId }) {
  const setupReady = configured(platform)
  const query = new URLSearchParams({ select:'id,status,account_name,account_id,last_verified_at,last_sync_at,last_error_code', user_id:`eq.${userId}`, workspace_id:`eq.${workspaceId}`, platform:`eq.${platform}`, limit:'1' })
  const rows = await db(`performance_connections?${query.toString()}`)
  const connection = rows?.[0] || null
  const status = connection?.status || (setupReady ? 'ready_to_authorize' : 'setup_required')
  return {
    platform,
    label:PLATFORMS[platform].label,
    status,
    configured:setupReady,
    live:status === 'connected',
    requirement:PLATFORMS[platform].requirement,
    connection:connection ? { id:connection.id, accountName:connection.account_name, accountId:connection.account_id, lastVerifiedAt:connection.last_verified_at, lastSyncAt:connection.last_sync_at, lastErrorCode:connection.last_error_code } : null,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', ['POST']); return res.status(405).json({ error:`Method ${req.method} Not Allowed` }) }
  try {
    const body = parseBody(req)
    const action = body.action || 'status'
    const platform = body.platform
    if (!PLATFORMS[platform]) throw apiError('PERFORMANCE_PLATFORM_INVALID', 'Choose Meta Ads, TikTok Ads, Google Ads, or Google Analytics 4.')
    const user = await authenticatedUser(req)
    if (!body.workspaceId) throw apiError('WORKSPACE_REQUIRED', 'Choose a FloStudio workspace before managing paid-performance connections.')
    if (action === 'status') return res.status(200).json(await statusFor({ platform, userId:user.id, workspaceId:body.workspaceId }))
    if (action === 'initialize') {
      const current = await statusFor({ platform, userId:user.id, workspaceId:body.workspaceId })
      if (!current.configured) return res.status(200).json(current)
      if (!current.connection) {
        const rows = await db('performance_connections', { method:'POST', body:{ workspace_id:body.workspaceId, user_id:user.id, platform, status:'ready_to_authorize', updated_at:new Date().toISOString() } })
        return res.status(200).json({ ...current, status:rows?.[0]?.status || 'ready_to_authorize', connection:rows?.[0] ? { id:rows[0].id } : null })
      }
      return res.status(200).json(current)
    }
    throw apiError('PERFORMANCE_ACTION_UNKNOWN', 'Choose a supported paid-performance connection action.')
  } catch (error) { return sendError(res, error) }
}
