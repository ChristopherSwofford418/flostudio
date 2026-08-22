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

async function appleRequest(path, token, { method = 'GET', body } = {}) {
  const response = await fetch(`${APPLE_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type':'application/json' } : {}) },
    ...(body ? { body:JSON.stringify(body) } : {}),
  })
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

async function analyticsSegmentRequest(url) {
  const response = await fetch(url, { headers: { Accept:'application/a-gzip, application/gzip, application/octet-stream' } })
  if (!response.ok) throw apiError('ASC_ANALYTICS_SEGMENT_FAILED', 'Apple could not download the generated App Analytics report segment.', response.status, { providerStatus:response.status })
  return Buffer.from(await response.arrayBuffer())
}

export function salesReportPeriod(now = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

export function recentSalesReportPeriods(now = new Date(), count = 6) {
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  return Array.from({ length:count }, () => {
    const period = salesReportPeriod(cursor)
    cursor.setUTCMonth(cursor.getUTCMonth() - 1)
    return period
  })
}

function reportInstanceDate(instance) {
  const timestamp = Date.parse(instance?.attributes?.processingDate || '')
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function latestAnalyticsInstance(instances = []) {
  return [...instances].sort((left, right) => reportInstanceDate(right) - reportInstanceDate(left))[0] || null
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

function analyticsNumber(row) {
  for (const key of ['Counts', 'Count', 'Value', 'Unique Devices', 'Unique Device Count']) {
    const value = numberOrZero(row[key])
    if (value) return value
  }
  return 0
}

function normalizedAnalyticsLabel(row) {
  return String(row['Download Type'] || row['Event Type'] || row.Metric || row['Metric Name'] || row.Name || '').trim().toLowerCase()
}

export function summarizeAnalyticsRows({ downloadRows = [], engagementRows = [], now = new Date() }) {
  const cutoff = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 89)
  const isInWindow = row => {
    const date = Date.parse(row.Date || row['Event Date'] || '')
    return !Number.isFinite(date) || date >= cutoff
  }
  const sum = (rows, matcher) => rows.filter(isInWindow).reduce((total, row) => matcher(normalizedAnalyticsLabel(row)) ? total + analyticsNumber(row) : total, 0)
  const firstTimeDownloads = sum(downloadRows, label => /first.?time/.test(label))
  const redownloads = sum(downloadRows, label => /redownload/.test(label))
  const manualUpdates = sum(downloadRows, label => /manual.?update/.test(label))
  const autoUpdates = sum(downloadRows, label => /auto.?update/.test(label))
  const impressions = sum(engagementRows, label => /impression/.test(label))
  const productPageViews = sum(engagementRows, label => /product page view/.test(label))
  const totalDownloads = firstTimeDownloads + redownloads
  return {
    status:'available', periodDays:90,
    firstTimeDownloads, redownloads, totalDownloads,
    updates:manualUpdates + autoUpdates,
    impressions, productPageViews,
    conversionRate: impressions > 0 ? Number(((totalDownloads / impressions) * 100).toFixed(2)) : null,
    source:'Apple App Analytics Reports API',
  }
}

function rowsInRecentDays(rows, now, days) {
  const cutoff = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1))
  return rows.filter(row => {
    const date = Date.parse(row.Date || row['Event Date'] || '')
    return !Number.isFinite(date) || date >= cutoff
  })
}

function sumSubscriptionMetric(rows, matcher) {
  return rows.reduce((total, row) => matcher(String(row['State Metric'] || row['Event Grouping'] || row['Event Sub Type'] || '').trim().toLowerCase()) ? total + analyticsNumber(row) : total, 0)
}

export function summarizeSubscriptionRows({ stateRows = [], eventRows = [], purchaseRows = [], now = new Date() }) {
  const state = rowsInRecentDays(stateRows, now, 3)
  const events = rowsInRecentDays(eventRows, now, 30)
  const purchases = rowsInRecentDays(purchaseRows, now, 30)
  const inAppPurchaseRows = purchases.filter(row => /in.?app purchase/i.test(String(row['Purchase Type'] || '')))
  const inAppProceedsUsd = Number(inAppPurchaseRows.reduce((total, row) => total + numberOrZero(row['Proceeds in USD']), 0).toFixed(2))
  const inAppSalesUsd = Number(inAppPurchaseRows.reduce((total, row) => total + numberOrZero(row['Sales in USD']), 0).toFixed(2))
  return {
    status:'available',
    activePaidPlans:sumSubscriptionMetric(state, label => /full price|preserved price|contingent price/.test(label)),
    freeTrials:sumSubscriptionMetric(state, label => /free trial/.test(label)),
    paidOffers:sumSubscriptionMetric(state, label => /paid offer/.test(label)),
    billingIssues:sumSubscriptionMetric(state, label => /grace period|billing retry|suspended/.test(label)),
    voluntaryChurn:sumSubscriptionMetric(events, label => /voluntary churn/.test(label)),
    involuntaryChurn:sumSubscriptionMetric(events, label => /involuntary churn/.test(label)),
    trialToPaid:sumSubscriptionMetric(events, label => /paid subscriptions from offers|full price from free trial|contingent price from free trial/.test(label)),
    paidStarts:sumSubscriptionMetric(events, label => /paid subscription starts|full price subscription starts|contingent price subscription starts/.test(label)),
    renewals:sumSubscriptionMetric(events, label => /renewal/.test(label)),
    inAppPurchaseProceedsUsd:inAppProceedsUsd,
    inAppPurchaseSalesUsd:inAppSalesUsd,
    stateWindowDays:3,
    eventWindowDays:30,
    purchaseWindowDays:30,
    note:'Apple Purchase report proceeds include in-app purchases and may include subscription transactions; Apple does not expose a separate subscription-only proceeds field in this standard report.',
  }
}

async function analyticsReportsForApp({ appId, token }) {
  const requestResponse = await appleRequest(`/v1/apps/${encodeURIComponent(appId)}/analyticsReportRequests?filter[accessType]=ONGOING&include=reports&fields[analyticsReportRequests]=accessType,stoppedDueToInactivity,reports&fields[analyticsReports]=name,category`, token)
  const request = (requestResponse.data || []).find(item => !item.attributes?.stoppedDueToInactivity)
  if (!request) {
    try {
      const created = await appleRequest('/v1/analyticsReportRequests', token, { method:'POST', body:{ data:{ type:'analyticsReportRequests', attributes:{ accessType:'ONGOING' }, relationships:{ app:{ data:{ type:'apps', id:String(appId) } } } } } })
      return { status:'requested', requestId:created.data?.id || null, message:'FloStudio requested ongoing Apple App Analytics reports for this app. Apple says the first report typically arrives in 24–48 hours.' }
    } catch (error) {
      if (error.details?.providerStatus === 403) return { status:'requires_admin_analytics_request', message:'Apple requires an Admin Team API key to request App Analytics reports for the first time. Replace this app’s key with an Admin Team key once, then sync again.' }
      throw error
    }
  }
  const reportsResponse = await appleRequest(`/v1/analyticsReportRequests/${encodeURIComponent(request.id)}/reports?limit=200`, token)
  return { status:'ready', requestId:request.id, reports:reportsResponse.data || [] }
}

async function analyticsRowsForReport(report, token) {
  const instancesResponse = await appleRequest(`/v1/analyticsReports/${encodeURIComponent(report.id)}/instances?limit=200&filter[granularity]=DAILY`, token)
  const instance = latestAnalyticsInstance(instancesResponse.data || [])
  if (!instance) return { rows:[], processingDate:null }
  const segmentsResponse = await appleRequest(`/v1/analyticsReportInstances/${encodeURIComponent(instance.id)}/segments?limit=200&fields[analyticsReportSegments]=url`, token)
  const buffers = await Promise.all((segmentsResponse.data || []).map(segment => segment.attributes?.url ? analyticsSegmentRequest(segment.attributes.url) : Promise.resolve(null)))
  return { rows:buffers.filter(Boolean).flatMap(parseTabDelimitedReport), processingDate:instance.attributes?.processingDate || null }
}

async function analyticsMetrics({ connection, token }) {
  try {
    const reportState = await analyticsReportsForApp({ appId:connection.app_store_app_id, token })
    if (reportState.status !== 'ready') return reportState
    const downloadReport = reportState.reports.find(report => /download/i.test(report.attributes?.name || '') || /commerce/i.test(report.attributes?.category || ''))
    const engagementReport = reportState.reports.find(report => /discovery.*engagement/i.test(report.attributes?.name || '') || /engagement/i.test(report.attributes?.category || ''))
    if (!downloadReport || !engagementReport) return { status:'pending', requestId:reportState.requestId, message:'Apple has accepted the App Analytics request but has not generated both Downloads and Discovery & Engagement reports yet. Apple typically delivers the first ongoing reports within 24–48 hours.' }
    const subscriptionStateReport = reportState.reports.find(report => /subscription state/i.test(report.attributes?.name || ''))
    const subscriptionEventReport = reportState.reports.find(report => /subscription event/i.test(report.attributes?.name || ''))
    const purchaseReport = reportState.reports.find(report => /purchase/i.test(report.attributes?.name || ''))
    const [downloads, engagement, subscriptionState, subscriptionEvents, purchases] = await Promise.all([
      analyticsRowsForReport(downloadReport, token),
      analyticsRowsForReport(engagementReport, token),
      subscriptionStateReport ? analyticsRowsForReport(subscriptionStateReport, token) : Promise.resolve({ rows:[], processingDate:null }),
      subscriptionEventReport ? analyticsRowsForReport(subscriptionEventReport, token) : Promise.resolve({ rows:[], processingDate:null }),
      purchaseReport ? analyticsRowsForReport(purchaseReport, token) : Promise.resolve({ rows:[], processingDate:null }),
    ])
    if (!downloads.rows.length && !engagement.rows.length) return { status:'pending', requestId:reportState.requestId, message:'Apple has not published a downloadable App Analytics instance for this app yet.' }
    const subscriptions = subscriptionState.rows.length || subscriptionEvents.rows.length || purchases.rows.length
      ? summarizeSubscriptionRows({ stateRows:subscriptionState.rows, eventRows:subscriptionEvents.rows, purchaseRows:purchases.rows })
      : { status:'pending', message:'Apple has not generated the subscription state, subscription event, or purchase reports for this app yet.' }
    return {
      ...summarizeAnalyticsRows({ downloadRows:downloads.rows, engagementRows:engagement.rows }),
      subscriptions,
      processingDates:{ downloads:downloads.processingDate, engagement:engagement.processingDate, subscriptionState:subscriptionState.processingDate, subscriptionEvents:subscriptionEvents.processingDate, purchases:purchases.processingDate },
      requestId:reportState.requestId,
    }
  } catch (error) {
    if (error.details?.providerStatus === 403) return { status:'not_authorized', message:'The current Apple key cannot read App Analytics reports. Use a Team key with the Sales and Reports, Finance, or Admin role.' }
    return { status:'unavailable', message:error.message || 'Apple could not provide App Analytics data.', providerStatus:error.details?.providerStatus || null }
  }
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

export function salesHasValue(sales) {
  if (!sales?.matchedRows) return false
  if (Math.abs(Number(sales.appUnits || 0)) > 0 || Math.abs(Number(sales.totalUnits || 0)) > 0) return true
  return Object.values(sales.proceedsByCurrency || {}).some(value => Math.abs(Number(value || 0)) > 0)
}

async function monthlySalesMetrics({ connection, token, app }) {
  if (!connection.vendor_number) return { status:'requires_vendor_number', message:'Add the Apple Vendor Number shown in App Store Connect → Reports to pull Sales and Trends numbers.' }
  const checkedPeriods = recentSalesReportPeriods()
  let lastNoSalesMessage = ''
  for (const reportDate of checkedPeriods) {
    const params = new URLSearchParams({
      'filter[frequency]':'MONTHLY',
      'filter[reportDate]':reportDate,
      'filter[reportSubType]':'SUMMARY',
      'filter[reportType]':'SALES',
      'filter[vendorNumber]':connection.vendor_number,
      'filter[version]':'1_0',
    })
    try {
      const rows = parseTabDelimitedReport(await appleBinaryRequest(`/v1/salesReports?${params}`, token))
      const sales = summarizeSalesReport(rows, { appStoreAppId:connection.app_store_app_id, sku:app?.attributes?.sku })
      if (salesHasValue(sales)) return { ...sales, frequency:'MONTHLY', reportDate, checkedPeriods }
      lastNoSalesMessage = sales.matchedRows
        ? `Apple returned only zero-value rows for this app in ${reportDate}; FloStudio continued to earlier completed months.`
        : `Apple returned a report for ${reportDate}, but it contained no rows for this app.`
    } catch (error) {
      if (/no sales for the date specified/i.test(error.message || '')) {
        lastNoSalesMessage = error.message
        continue
      }
      return { status:'unavailable', message:error.message || 'Apple could not provide the monthly Sales and Trends report.', providerStatus:error.providerStatus || error.details?.providerStatus || null }
    }
  }
  return { status:'no_sales_in_recent_periods', message:'Apple returned no Sales and Trends rows for this app across the six most recent monthly report periods.', checkedPeriods, providerMessage:lastNoSalesMessage }
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
  const analytics = await analyticsMetrics({ connection, token })
  metrics.analytics = analytics
  metrics.availability.analytics = analytics.status === 'available'
    ? { status:'available', message:`Apple App Analytics returned a ${analytics.periodDays}-day acquisition window.` }
    : { status:analytics.status, message:analytics.message }
  metrics.availability.downloads = analytics.status === 'available'
    ? { status:'available', message:`${analytics.firstTimeDownloads} first-time downloads and ${analytics.redownloads} redownloads in the Apple App Analytics window.` }
    : { status:analytics.status, message:analytics.message }
  metrics.subscriptions = analytics.subscriptions || null
  metrics.availability.subscriptions = analytics.subscriptions?.status === 'available'
    ? { status:'available', message:`Apple subscription state, lifecycle, and purchase reports are available for the selected app.` }
    : { status:analytics.subscriptions?.status || analytics.status, message:analytics.subscriptions?.message || analytics.message }
  const sales = await monthlySalesMetrics({ connection, token, app:app.data })
  metrics.sales = sales
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
