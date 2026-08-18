import { sign } from 'node:crypto'

const APPLE_APPS_URL = 'https://api.appstoreconnect.apple.com/v1/apps?limit=50&fields[apps]=name,bundleId,sku,primaryLocale'

const base64url = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value))
  .toString('base64')
  .replace(/=/g, '')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')

function errorMessage(payload, fallback) {
  const detail = Array.isArray(payload?.errors) ? payload.errors.map(item => item.detail || item.title).filter(Boolean).join('; ') : ''
  return detail || payload?.error || fallback
}

function normalizePrivateKey(value) {
  return String(value || '').replace(/\\n/g, '\n').trim()
}

function createAppleToken({ issuerId, keyId, privateKey, keyType = 'team' }) {
  const issuedAt = Math.floor(Date.now() / 1000)
  const header = { alg:'ES256', kid:keyId, typ:'JWT' }
  const payload = keyType === 'individual'
    ? { sub:'user', iat:issuedAt, exp:issuedAt + 120, aud:'appstoreconnect-v1', scope:['GET /v1/apps'] }
    : { iss:issuerId, iat:issuedAt, exp:issuedAt + 120, aud:'appstoreconnect-v1', scope:['GET /v1/apps'] }
  const unsignedToken = `${base64url(header)}.${base64url(payload)}`
  const signature = sign('sha256', Buffer.from(unsignedToken), { key:privateKey, dsaEncoding:'ieee-p1363' })
  return `${unsignedToken}.${base64url(signature)}`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error:`Method ${req.method} Not Allowed` })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const sourceFacts = body.sourceFacts || body
    const credentials = body.credentials || body
    const keyType = credentials.ascKeyType || credentials.keyType || 'team'
    const issuerId = String(credentials.ascIssuerId || credentials.issuerId || '').trim()
    const keyId = String(credentials.ascKeyId || credentials.keyId || '').trim()
    const privateKey = normalizePrivateKey(credentials.ascPrivateKey || credentials.privateKey)
    const expectedAppId = String(body.appStoreAppId || sourceFacts.appId || '').trim()

    if (!keyId || !privateKey || (keyType !== 'individual' && !issuerId)) {
      return res.status(400).json({ error:keyType === 'individual' ? 'An App Store Connect Key ID and Private Key are required for an individual API key.' : 'An App Store Connect Issuer ID, Key ID, and Private Key are required for a team API key.' })
    }
    if (keyType !== 'individual' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(issuerId)) {
      return res.status(400).json({ error:'The App Store Connect Issuer ID must be the UUID shown in Users and Access → Integrations → App Store Connect API. An Apple ID or email address will not work here.' })
    }
    if (!/^[A-Z0-9]{10}$/i.test(keyId)) {
      return res.status(400).json({ error:'The App Store Connect Key ID is the 10-character key identifier from Apple, not an email address or Apple ID.' })
    }
    if (!privateKey.includes('-----BEGIN PRIVATE KEY-----') || !privateKey.includes('-----END PRIVATE KEY-----')) {
      return res.status(400).json({ error:'Paste the full .p8 contents, including -----BEGIN PRIVATE KEY----- and -----END PRIVATE KEY-----.' })
    }

    let token
    try { token = createAppleToken({ issuerId, keyId, privateKey, keyType }) }
    catch { return res.status(400).json({ error:'FloStudio could not read that private key. Download a new App Store Connect .p8 key from Apple and paste its complete contents.' }) }

    const appleResponse = await fetch(APPLE_APPS_URL, { headers:{ Authorization:`Bearer ${token}`, Accept:'application/json' } })
    const applePayload = await appleResponse.json().catch(() => ({}))
    if (!appleResponse.ok) {
      const fallback = appleResponse.status === 401 ? 'Apple rejected these credentials. Check the API key, key type, and private key belong to the same App Store Connect account.' : appleResponse.status === 403 ? 'Apple authenticated the key but its role cannot list apps. Update the App Store Connect API key role and try again.' : 'App Store Connect could not validate this connection.'
      return res.status(appleResponse.status).json({ error:errorMessage(applePayload, fallback), providerStatus:appleResponse.status })
    }

    const apps = (applePayload.data || []).map(app => ({ id:app.id, name:app.attributes?.name || 'Untitled app', bundleId:app.attributes?.bundleId || '', sku:app.attributes?.sku || '', primaryLocale:app.attributes?.primaryLocale || '' }))
    const matchedApp = expectedAppId ? apps.find(app => app.id === expectedAppId) || null : null
    return res.status(200).json({
      success:true,
      status:'validated',
      connectionType:keyType,
      appCount:apps.length,
      apps,
      matchedApp,
      validatedAt:new Date().toISOString(),
      metrics:{ status:'not_synced', message:'Credentials are validated and apps are available to map. FloStudio has not claimed sales, downloads, or subscription metrics because those require a dedicated secure report-sync configuration.' },
    })
  } catch (error) {
    return res.status(500).json({ error:'FloStudio could not validate App Store Connect at this time. Please try again.' })
  }
}
