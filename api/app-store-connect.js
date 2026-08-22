import crypto, { sign } from 'node:crypto'
import { gunzipSync } from 'node:zlib'

export const config = { maxDuration: 30 }

const SUPABASE_URL = 'https://jtogllurcrxxaguoxeus.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0b2dsbHVyY3J4eGFndW94ZXVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4MDE2OTEsImV4cCI6MjEwMjM3NzY5MX0.2BanYaDFNpDMrwaBfz4vSa-CroeOhynemXh7m5YmBYM'
const APPLE_API = 'https://api.appstoreconnect.apple.com'

function apiError(code, message, status = 400, details = {}) {
  const error = new Error(message)
  error.code = code
  error.status = status
  error.details = details
  return error
}

function parseBody(req) {
  if (!req.body) return {}
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body) } catch { return {} }
  }
  return req.body
}

function sendError(res, error) {
  return res.status(error?.status || 500).json({
    error: error?.message || 'FloStudio could not complete this App Store Connect request.',
    code: error?.code || 'APP_STORE_CONNECT_ERROR',
    ...(error?.details || {}),
  })
}

function base64url(value) {
  const bytes = Buffer.isBuffer(value)
    ? value
    : Buffer.from(typeof value === 'string' ? value : JSON.stringify(value))
  return bytes
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function normalizePrivateKey(value) {
  return String(value || '').replace(/\r?\n/g, '\n').replace(/\\n/g, '\n').trim()
}

function vaultKey() {
  const raw = String(process.env.ASC_CREDENTIALS_ENCRYPTION_KEY || '')
  if (!raw) throw apiError('ASC_VAULT_NOT_CONFIGURED', 'FloStudio’s encrypted App Store credential vault is not configured in production yet.', 503)
  if (/^[A-Za-z0-9+/]{43}=$/.test(raw)) return Buffer.from(raw, 'base64')
  return crypto.createHash('sha256').update(raw).digest()
}

function encryptPrivateKey(privateKey) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', vaultKey(), iv)
  const encrypted = Buffer.concat([cipher.update(privateKey, 'utf8'), cipher.final()])
  return { version: 1, algorithm: 'aes-256-gcm', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: encrypted.toString('base64') }
}

function decryptPrivateKey(envelope) {
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', vaultKey(), Buffer.from(envelope.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    throw apiError('ASC_CREDENTIAL_DECRYPTION_FAILED', 'FloStudio could not read the secure App Store credential. Upload the `.p8` file again to reconnect this app.', 409)
  }
}

export function createAppleToken({ issuerId, keyId, privateKey, keyType = 'team' }) {
  const issuedAt = Math.floor(Date.now() / 1000)
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' }
  const payload = keyType === 'individual'
    ? { sub: 'user', iat: issuedAt, exp: issuedAt + 120, aud: 'appstoreconnect-v1' }
    : { iss: issuerId, iat: issuedAt, exp: issuedAt + 120, aud: 'appstoreconnect-v1' }
  const unsigned = `${base64url(header)}.${base64url(payload)}`
  const signature = sign('sha256', Buffer.from(unsigned), { key: privateKey, dsaEncoding: 'ieee-p1363' })
  return `${unsigned}.${base64url(signature)}`
}

function validateCredentials({ issuerId, keyId, privateKey, keyType }) {
  if (!keyId || !privateKey || (keyType !== 'individual' && !issuerId)) throw apiError('ASC_CREDENTIALS_REQUIRED', keyType === 'individual' ? 'Upload the matching `.p8` file and enter its App Store Connect Key ID.' : 'Enter the App Store Connect Issuer ID and Key ID, then upload the matching `.p8` file.')
  if (keyType !== 'individual' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(issuerId)) throw apiError('ASC_ISSUER_ID_INVALID', 'The Issuer ID must be the UUID shown in App Store Connect → Users and Access → Integrations.')
  if (!/^[A-Z0-9]{10}$/i.test(keyId)) throw apiError('ASC_KEY_ID_INVALID', 'The Key ID is the ten-character identifier shown next to the matching App Store Connect API key.')
  if (!privateKey.includes('-----BEGIN PRIVATE KEY-----') || !privateKey.includes('-----END PRIVATE KEY-----')) throw apiError('ASC_PRIVATE_KEY_INVALID', 'Upload the original App Store Connect `.p8` file. FloStudio could not recognize a valid private-key envelope.')
}

async function authenticatedUser(req) {
  const authorization = req.headers.authorization || ''
  const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!accessToken) throw apiError('AUTH_REQUIRED', 'Sign in to FloStudio before managing App Store Connect.', 401)
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${accessToken}`, apikey: SUPABASE_ANON_KEY } })
  const user = await response.json().catch(() => null)
  if (!response.ok || !user?.id) throw apiError('AUTH_REQUIRED', 'Your FloStudio session has expired. Sign in again and retry.', 401)
  return { user, accessToken }
}

async function rpc(name, args, accessToken) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) })
  const text = await response.text()
  const payload = text ? (() => { try { return JSON.parse(text) } catch { return null } })() : null
  if (!response.ok) throw apiError('ASC_DATABASE_ERROR', payload?.message || payload?.hint || 'FloStudio could not update the protected App Store Connect connection.', response.status === 401 || response.status === 403 ? response.status : 500)
  return payload
}

async function appleRequest(path, token) {
  const response = await fetch(`${APPLE_API}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
  const text = await response.text()
  const payload = text ? (() => { try { return JSON.parse(text) } catch { return text } })() : null
  if (!response.ok) {
    const detail = Array.isArray(payload?.errors) ? payload.errors.map(item => item.detail || item.title).filter(Boolean).join('; ') : ''
    const fallback = response.status === 401 ? 'Apple rejected these credentials. Confirm the Issuer ID, Key ID, and `.p8` belong to the same App Store Connect key.' : response.status === 403 ? 'Apple authenticated the key but its role cannot access this App Store Connect resource.' : 'App Store Connect could not complete this request.'
    throw apiError('ASC_APPLE_REQUEST_FAILED', detail || fallback, response.status, { providerStatus: response.status })
  }
  return payload
}

async function appleBinaryRequest(path, token) {
  const response = await fetch(`${APPLE_API}${path}`, { headers: { Authorization:`Bearer ${token}`, Accept:'application/a-gzip, application/gzip' } })
  if (!response.ok) {
    const text = await response.text()
    const payload = text ? (() => { try { return JSON.parse(text) } catch { return null } })() : null
    const detail = Array.isArray(payload?.errors) ? payload.errors.map(item => item.detail || item.title).filter(Boolean).join('; ') : ''
    const fallback = response.status === 403 ? 'Apple authenticated the key but its role cannot download Sales and Trends reports.' : response.status === 401 ? 'Apple rejected the Sales and Trends request.' : 'Apple could not provide this Sales and Trends report yet.'
    throw apiError('ASC_SALES_REPORT_FAILED', detail || fallback, response.status, { providerStatus:response.status })
  }
  return Buffer.from(await response.arrayBuffer())
}

export function salesReportPeriod(now = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

function parseTabDelimitedReport(buffer) {
  const text = gunzipSync(buffer).toString('utf8').replace(/^\uFEFF/, '').trim()
  if (!text) return []
  const [header, ...lines] = text.split(/\r?\n/)
  const columns = header.split('\t').map(column => column.trim())
  return lines.filter(Boolean).map(line => {
    const values = line.split('\t')
    return Object.fromEntries(columns.map((column, index) => [column, values[index] ?? '']))
  })
}

function numberOrZero(value) {
  const number = Number.parseFloat(String(value || '').replace(/,/g, ''))
  return Number.isFinite(number) ? number : 0
}

export function summarizeSalesReport(rows, { appStoreAppId, sku }) {
  const appId = String(appStoreAppId || '').trim()
  const appSku = String(sku || '').trim()
  const filtered = rows.filter(row => String(row['Apple Identifier'] || '').trim() === appId || (appSku && String(row['Parent Identifier'] || '').trim() === appSku))
  const proceedsByCurrency = {}
  let appUnits = 0
  let allUnits = 0
  let startDate = null
  let endDate = null
  for (const row of filtered) {
    const units = numberOrZero(row.Units)
    const proceeds = units * numberOrZero(row['Developer Proceeds'] ?? row['Developer Proceeds (per unit)'])
    const currency = String(row['Currency of Proceeds'] || row['Customer Currency'] || 'UNKNOWN').trim() || 'UNKNOWN'
    allUnits += units
    if (String(row['Apple Identifier'] || '').trim() === appId) appUnits += units
    proceedsByCurrency[currency] = Number(((proceedsByCurrency[currency] || 0) + proceeds).toFixed(2))
    startDate = startDate || row['Begin Date'] || null
    endDate = endDate || row['End Date'] || null
  }
  return {
    status:'available',
    matchedRows:filtered.length,
    appUnits:Number(appUnits.toFixed(2)),
    totalUnits:Number(allUnits.toFixed(2)),
    proceedsByCurrency,
    period:{ startDate, endDate },
  }
}

async function monthlySalesMetrics({ connection, token, app }) {
  if (!connection.vendor_number) return { status:'requires_vendor_number', message:'Add the Apple Vendor Number shown in App Store Connect → Reports to pull Sales and Trends numbers.' }
  const params = new URLSearchParams({
    'filter[frequency]':'MONTHLY',
    'filter[reportDate]':salesReportPeriod(),
    'filter[reportSubType]':'SUMMARY',
    'filter[reportType]':'SALES',
    'filter[vendorNumber]':connection.vendor_number,
    'filter[version]':'1_0',
  })
  try {
    const rows = parseTabDelimitedReport(await appleBinaryRequest(`/v1/salesReports?${params}`, token))
    return { ...summarizeSalesReport(rows, { appStoreAppId:connection.app_store_app_id, sku:app?.attributes?.sku }), frequency:'MONTHLY', reportDate:salesReportPeriod() }
  } catch (error) {
    return { status:'unavailable', message:error.message || 'Apple could not provide the monthly Sales and Trends report.', providerStatus:error.providerStatus || error.details?.providerStatus || null }
  }
}

export function buildAppMetrics({ app, versions = [], reviews = [], sales = null }) {
  const ratings = reviews.map(review => Number(review?.attributes?.rating)).filter(Number.isFinite)
  const latestVersion = versions[0]?.attributes || null
  const ratingAverage = ratings.length ? Number((ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(2)) : null
  return {
    catalog: { appStoreAppId: app?.id || null, name: app?.attributes?.name || null, bundleId: app?.attributes?.bundleId || null, sku: app?.attributes?.sku || null, primaryLocale: app?.attributes?.primaryLocale || null, latestVersion: latestVersion?.versionString || null, latestVersionState: latestVersion?.appStoreState || null, latestReleaseDate: latestVersion?.releaseDate || null },
    reviews: { sampledReviewCount: ratings.length, averageRating: ratingAverage, latest: reviews.slice(0, 5).map(review => ({ id: review.id, rating: review.attributes?.rating || null, title: review.attributes?.title || '', body: review.attributes?.body || '', createdDate: review.attributes?.createdDate || null, territory: review.attributes?.territory || null })) },
    availability: {
      downloads: { status: 'requires_sales_or_analytics_report', message: 'Downloads appear after Apple Sales and Trends or Analytics Reports are authorized and available.' },
      proceeds: { status: 'requires_vendor_number', message: 'Proceeds require a Sales and Trends vendor number and an authorized report.' },
      subscriptions: { status: 'requires_analytics_report', message: 'Subscription state and event metrics are provided through Apple Analytics Reports after report setup and availability.' },
    },
    sales,
  }
}

async function syncMetrics({ connection, privateKey }) {
  const token = createAppleToken({ issuerId: connection.issuer_id, keyId: connection.key_id, privateKey, keyType: connection.key_type || 'team' })
  const app = await appleRequest(`/v1/apps/${encodeURIComponent(connection.app_store_app_id)}?fields[apps]=name,bundleId,sku,primaryLocale`, token)
  const [versionsResult, reviewsResult] = await Promise.allSettled([
    appleRequest(`/v1/apps/${encodeURIComponent(connection.app_store_app_id)}/appStoreVersions?limit=10&sort=-createdDate&fields[appStoreVersions]=versionString,appStoreState,releaseDate,createdDate,platform`, token),
    appleRequest(`/v1/apps/${encodeURIComponent(connection.app_store_app_id)}/customerReviews?limit=200&sort=-createdDate&fields[customerReviews]=rating,title,body,createdDate,territory`, token),
  ])
  const metrics = buildAppMetrics({ app: app.data, versions: versionsResult.status === 'fulfilled' ? versionsResult.value.data || [] : [], reviews: reviewsResult.status === 'fulfilled' ? reviewsResult.value.data || [] : [] })
  metrics.availability.versions = versionsResult.status === 'fulfilled' ? { status: 'available' } : { status: 'not_authorized_or_unavailable', message: 'This key could not load App Store versions.' }
  metrics.availability.reviews = reviewsResult.status === 'fulfilled' ? { status: 'available' } : { status: 'not_authorized_or_unavailable', message: 'This key could not load customer reviews.' }
  const sales = await monthlySalesMetrics({ connection, token, app:app.data })
  metrics.sales = sales
  metrics.availability.downloads = sales.status === 'available'
    ? { status:'available', message:`${sales.appUnits} app units in the report period.` }
    : { status:sales.status, message:sales.message }
  metrics.availability.proceeds = sales.status === 'available'
    ? { status:'available', message:'Estimated developer proceeds are broken out by Apple reporting currency.' }
    : { status:sales.status, message:sales.message }
  return metrics
}

async function connectionFromInput(body, accessToken) {
  const productId = String(body.productId || '').trim()
  const appStoreAppId = String(body.appStoreAppId || '').trim()
  const issuerId = String(body.issuerId || '').trim()
  const keyId = String(body.keyId || '').trim()
  const keyType = body.keyType === 'individual' ? 'individual' : 'team'
  const vendorNumber = String(body.vendorNumber || '').trim() || null
  const privateKey = normalizePrivateKey(body.privateKey)
  if (!productId || !appStoreAppId) throw apiError('ASC_APP_ID_REQUIRED', 'Choose the FloStudio portfolio app and enter its App Store Connect App ID before testing the connection.')
  validateCredentials({ issuerId, keyId, privateKey, keyType })
  const connection = { product_id: productId, app_store_app_id: appStoreAppId, issuer_id: keyType === 'individual' ? null : issuerId, key_id: keyId, key_type: keyType, vendor_number: vendorNumber }
  const metrics = await syncMetrics({ connection, privateKey })
  await rpc('save_app_store_connect_connection', { target_product_id: productId, target_app_store_app_id: appStoreAppId, target_issuer_id: connection.issuer_id, target_key_id: keyId, target_key_type: keyType, target_vendor_number: vendorNumber, target_encrypted_private_key: encryptPrivateKey(privateKey), target_metrics: metrics, target_status: 'connected', target_error: null }, accessToken)
  return { productId, appStoreAppId, metrics }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', ['POST']); return res.status(405).json({ error: `Method ${req.method} Not Allowed` }) }
  try {
    const body = parseBody(req)
    const { accessToken } = await authenticatedUser(req)
    const action = body.action || 'status'
    if (action === 'status') {
      const productId = String(body.productId || '').trim()
      if (!productId) throw apiError('ASC_APP_ID_REQUIRED', 'Select a portfolio app first.')
      const status = await rpc('get_app_store_connect_status', { target_product_id: productId }, accessToken)
      return res.status(200).json({ success: true, connection: status?.[0] || null })
    }
    if (action === 'test') {
      const result = await connectionFromInput(body, accessToken)
      return res.status(200).json({ success: true, status: 'connected', ...result, syncedAt: new Date().toISOString() })
    }
    if (action === 'sync') {
      const productId = String(body.productId || '').trim()
      if (!productId) throw apiError('ASC_APP_ID_REQUIRED', 'Select a portfolio app first.')
      const rows = await rpc('get_app_store_connect_connection', { target_product_id: productId }, accessToken)
      const connection = rows?.[0]
      if (!connection?.encrypted_private_key) throw apiError('ASC_NOT_CONNECTED', 'Connect this app’s App Store Connect key before syncing.', 409)
      const metrics = await syncMetrics({ connection, privateKey: decryptPrivateKey(connection.encrypted_private_key) })
      await rpc('save_app_store_connect_connection', { target_product_id: productId, target_app_store_app_id: connection.app_store_app_id, target_issuer_id: connection.issuer_id, target_key_id: connection.key_id, target_key_type: connection.key_type, target_vendor_number: connection.vendor_number, target_encrypted_private_key: connection.encrypted_private_key, target_metrics: metrics, target_status: 'connected', target_error: null }, accessToken)
      return res.status(200).json({ success: true, status: 'connected', productId, metrics, syncedAt: new Date().toISOString() })
    }
    if (action === 'update_vendor_number') {
      const productId = String(body.productId || '').trim()
      const vendorNumber = String(body.vendorNumber || '').trim()
      if (!productId || !vendorNumber) throw apiError('ASC_VENDOR_NUMBER_REQUIRED', 'Enter the Vendor Number shown in App Store Connect → Reports.')
      const rows = await rpc('get_app_store_connect_connection', { target_product_id: productId }, accessToken)
      const connection = rows?.[0]
      if (!connection?.encrypted_private_key) throw apiError('ASC_NOT_CONNECTED', 'Connect this app’s App Store Connect key before adding its Vendor Number.', 409)
      const statusRows = await rpc('get_app_store_connect_status', { target_product_id:productId }, accessToken)
      const publicConnection = statusRows?.[0]
      await rpc('save_app_store_connect_connection', { target_product_id:productId, target_app_store_app_id:connection.app_store_app_id, target_issuer_id:connection.issuer_id, target_key_id:connection.key_id, target_key_type:connection.key_type, target_vendor_number:vendorNumber, target_encrypted_private_key:connection.encrypted_private_key, target_metrics:publicConnection?.metrics || {}, target_status:'connected', target_error:null }, accessToken)
      return res.status(200).json({ success:true, productId, vendorNumber })
    }
    throw apiError('ASC_ACTION_INVALID', 'FloStudio did not recognize that App Store Connect action.')
  } catch (error) { return sendError(res, error) }
}
