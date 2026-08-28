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

function reportName(report) {
  return String(report?.attributes?.name || '').trim().toLowerCase()
}

function reportCategory(report) {
  return String(report?.attributes?.category || '').trim().toLowerCase()
}

function reportMatches(report, matcher) {
  return matcher(reportName(report), reportCategory(report))
}

function reportCoverageEntry({ report, result, message = null }) {
  if (!report) return { status:'not_generated', reportName:null, category:null, processingDate:null, message:message || 'Apple has not generated this report type for the active ongoing request yet.' }
  if (result?.status === 'rejected') return { status:'unavailable', reportName:report.attributes?.name || null, category:report.attributes?.category || null, processingDate:null, message:result.reason?.message || 'Apple could not download this report type.', providerStatus:result.reason?.details?.providerStatus || null }
  const value = result?.value
  if (!value || value.status !== 'available') return { status:'pending', reportName:report.attributes?.name || null, category:report.attributes?.category || null, processingDate:value?.processingDate || null, message:value?.message || 'Apple has not published a downloadable daily instance for this report type yet.' }
  return { status:'available', reportName:report.attributes?.name || null, category:report.attributes?.category || null, processingDate:value.processingDate || null, rowCount:value.rows.length, segmentCount:value.segmentCount, message:value.rows.length ? 'Apple returned rows for the most recent daily instance.' : 'Apple returned a completed daily instance with no rows.' }
}

async function analyticsReportsForApp({ appId, token }) {
  const requestResponse = await appleRequest(`/v1/apps/${encodeURIComponent(appId)}/analyticsReportRequests?filter[accessType]=ONGOING&fields[analyticsReportRequests]=accessType,stoppedDueToInactivity`, token)
  const requests = (requestResponse.data || []).filter(item => !item.attributes?.stoppedDueToInactivity)
  if (!requests.length) {
    try {
      const created = await appleRequest('/v1/analyticsReportRequests', token, { method:'POST', body:{ data:{ type:'analyticsReportRequests', attributes:{ accessType:'ONGOING' }, relationships:{ app:{ data:{ type:'apps', id:String(appId) } } } } } })
      return { status:'requested', requestId:created.data?.id || null, requestIds:created.data?.id ? [created.data.id] : [], message:'FloStudio requested ongoing Apple App Analytics reports for this app. Apple says the first report typically arrives in 24–48 hours.' }
    } catch (error) {
      if (error.details?.providerStatus === 403) return { status:'requires_admin_analytics_request', message:'Apple requires an Admin Team API key to request App Analytics reports for the first time. Replace this app’s key with an Admin Team key once, then sync again.' }
      throw error
    }
  }
  const reportResults = await Promise.allSettled(requests.map(async request => {
    const response = await appleRequest(`/v1/analyticsReportRequests/${encodeURIComponent(request.id)}/reports?limit=200`, token)
    return { requestId:request.id, reports:response.data || [] }
  }))
  const resolved = reportResults.filter(result => result.status === 'fulfilled').flatMap(result => result.value.reports.map(report => ({ ...report, floRequestId:result.value.requestId })))
  const uniqueReports = [...new Map(resolved.map(report => [report.id, report])).values()]
  if (!uniqueReports.length && reportResults.every(result => result.status === 'rejected')) throw reportResults.find(result => result.status === 'rejected').reason
  return {
    status:'ready',
    requestId:requests[0]?.id || null,
    requestIds:requests.map(request => request.id),
    reports:uniqueReports,
    diagnostics:{ activeRequestCount:requests.length, readableRequestCount:reportResults.filter(result => result.status === 'fulfilled').length, unreadableRequestCount:reportResults.filter(result => result.status === 'rejected').length },
  }
}

async function analyticsRowsForReport(report, token) {
  const instancesResponse = await appleRequest(`/v1/analyticsReports/${encodeURIComponent(report.id)}/instances?limit=200&filter[granularity]=DAILY`, token)
  const instance = latestAnalyticsInstance(instancesResponse.data || [])
  if (!instance) return { status:'pending', rows:[], processingDate:null, segmentCount:0, message:'Apple has not published a daily instance for this report yet.' }
  const segmentsResponse = await appleRequest(`/v1/analyticsReportInstances/${encodeURIComponent(instance.id)}/segments?limit=200&fields[analyticsReportSegments]=url`, token)
  const segmentResults = await Promise.allSettled((segmentsResponse.data || []).map(segment => segment.attributes?.url ? analyticsSegmentRequest(segment.attributes.url) : Promise.resolve(null)))
  const buffers = segmentResults.filter(result => result.status === 'fulfilled').map(result => result.value).filter(Boolean)
  if (!buffers.length && segmentResults.some(result => result.status === 'rejected')) throw segmentResults.find(result => result.status === 'rejected').reason
  return { status:'available', rows:buffers.flatMap(parseTabDelimitedReport), processingDate:instance.attributes?.processingDate || null, segmentCount:buffers.length, failedSegmentCount:segmentResults.filter(result => result.status === 'rejected').length }
}

async function newestRowsForReports(reports, token) {
  if (!reports.length) return { report:null, result:null }
  const results = await Promise.allSettled(reports.map(async report => ({ report, result:await analyticsRowsForReport(report, token) })))
  const available = results.filter(result => result.status === 'fulfilled' && result.value.result.status === 'available')
  const fulfilled = results.filter(result => result.status === 'fulfilled')
  const candidates = available.length ? available : fulfilled
  if (!candidates.length) return { report:reports[0], result:results[0] }
  const chosen = [...candidates].sort((left, right) => reportInstanceDate({ attributes:{ processingDate:right.value.result.processingDate } }) - reportInstanceDate({ attributes:{ processingDate:left.value.result.processingDate } }))[0]
  return { report:chosen.value.report, result:{ status:'fulfilled', value:chosen.value.result } }
}

async function analyticsMetrics({ connection, token }) {
  try {
    const reportState = await analyticsReportsForApp({ appId:connection.app_store_app_id, token })
    if (reportState.status !== 'ready') return reportState
    const grouped = {
      downloads:reportState.reports.filter(report => reportMatches(report, name => /download/.test(name))),
      engagement:reportState.reports.filter(report => reportMatches(report, (name, category) => /discovery.*engagement|engagement/.test(name) || /engagement/.test(category))),
      subscriptionState:reportState.reports.filter(report => reportMatches(report, name => /subscription state/.test(name))),
      subscriptionEvents:reportState.reports.filter(report => reportMatches(report, name => /subscription event/.test(name))),
      purchases:reportState.reports.filter(report => reportMatches(report, name => /purchase/.test(name))),
    }
    const [downloads, engagement, subscriptionState, subscriptionEvents, purchases] = await Promise.all([
      newestRowsForReports(grouped.downloads, token),
      newestRowsForReports(grouped.engagement, token),
      newestRowsForReports(grouped.subscriptionState, token),
      newestRowsForReports(grouped.subscriptionEvents, token),
      newestRowsForReports(grouped.purchases, token),
    ])
    const coverage = {
      downloads:reportCoverageEntry({ report:downloads.report, result:downloads.result, message:'Apple has not generated the Downloads report type for the active ongoing request yet.' }),
      engagement:reportCoverageEntry({ report:engagement.report, result:engagement.result, message:'Apple has not generated the Discovery & Engagement report type for the active ongoing request yet.' }),
      subscriptionState:reportCoverageEntry({ report:subscriptionState.report, result:subscriptionState.result, message:'Apple has not generated the Subscription State report type for the active ongoing request yet.' }),
      subscriptionEvents:reportCoverageEntry({ report:subscriptionEvents.report, result:subscriptionEvents.result, message:'Apple has not generated the Subscription Event report type for the active ongoing request yet.' }),
      purchases:reportCoverageEntry({ report:purchases.report, result:purchases.result, message:'Apple has not generated the Purchase report type for the active ongoing request yet.' }),
    }
    const downloadRows = downloads.result?.status === 'fulfilled' ? downloads.result.value.rows : []
    const engagementRows = engagement.result?.status === 'fulfilled' ? engagement.result.value.rows : []
    const stateRows = subscriptionState.result?.status === 'fulfilled' ? subscriptionState.result.value.rows : []
    const eventRows = subscriptionEvents.result?.status === 'fulfilled' ? subscriptionEvents.result.value.rows : []
    const purchaseRows = purchases.result?.status === 'fulfilled' ? purchases.result.value.rows : []
    const subscriptionAvailable = [coverage.subscriptionState, coverage.subscriptionEvents, coverage.purchases].some(entry => entry.status === 'available')
    const subscriptions = subscriptionAvailable
      ? { ...summarizeSubscriptionRows({ stateRows, eventRows, purchaseRows }), reportCoverage:{ state:coverage.subscriptionState, events:coverage.subscriptionEvents, purchases:coverage.purchases } }
      : { status:'pending', message:'Apple has not generated a downloadable subscription state, subscription event, or purchase report for this app yet.', reportCoverage:{ state:coverage.subscriptionState, events:coverage.subscriptionEvents, purchases:coverage.purchases } }
    const metricAvailability = {
      downloads:coverage.downloads.status,
      redownloads:coverage.downloads.status,
      updates:coverage.downloads.status,
      impressions:coverage.engagement.status,
      productPageViews:coverage.engagement.status,
      conversionRate:coverage.downloads.status === 'available' && coverage.engagement.status === 'available' ? 'available' : 'pending',
    }
    const processingDates = { downloads:coverage.downloads.processingDate, engagement:coverage.engagement.processingDate, subscriptionState:coverage.subscriptionState.processingDate, subscriptionEvents:coverage.subscriptionEvents.processingDate, purchases:coverage.purchases.processingDate }
    const acquisitionAvailable = coverage.downloads.status === 'available' || coverage.engagement.status === 'available'
    if (!acquisitionAvailable) {
      const unavailable = [coverage.downloads, coverage.engagement].find(entry => entry.status === 'unavailable')
      return { status:unavailable ? 'unavailable' : 'pending', periodDays:90, metricAvailability, subscriptions, reportCoverage:coverage, processingDates, requestId:reportState.requestId, requestIds:reportState.requestIds, requestDiagnostics:reportState.diagnostics, message:unavailable?.message || 'Apple has accepted the App Analytics request but has not published a downloadable acquisition report instance yet.' }
    }
    return {
      ...summarizeAnalyticsRows({ downloadRows, engagementRows }),
      metricAvailability,
      subscriptions,
      reportCoverage:coverage,
      requestDiagnostics:reportState.diagnostics,
      processingDates,
      requestId:reportState.requestId,
      requestIds:reportState.requestIds,
      message:coverage.downloads.status === 'available' && coverage.engagement.status === 'available' ? 'Apple returned both acquisition report types for the current analytics window.' : 'Apple returned partial acquisition analytics. Available report types are displayed; pending report types remain unavailable rather than showing estimated zeros.',
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

function includedByType(payload, type) {
  return (payload?.included || []).filter(resource => resource.type === type)
}

function priceFromPayload(payload, priceType) {
  const points = new Map(includedByType(payload, priceType).map(point => [point.id, point]))
  const prices = (payload?.data || []).map(price => {
    const pointId = price.relationships?.[priceType === 'subscriptionPricePoints' ? 'subscriptionPricePoint' : 'inAppPurchasePricePoint']?.data?.id
    const point = points.get(pointId)
    return {
      startDate:price.attributes?.startDate || null,
      preserved:Boolean(price.attributes?.preserved),
      planType:price.attributes?.planType || null,
      customerPrice:point?.attributes?.customerPrice || null,
      proceeds:point?.attributes?.proceeds || null,
    }
  })
  return prices.find(price => !price.startDate) || prices[0] || null
}

function appPriceRowsFromPayload(payload) {
  const pricePoints = new Map(includedByType(payload, 'appPricePoints').map(point => [point.id, point]))
  const territories = new Map(includedByType(payload, 'territories').map(territory => [territory.id, territory]))
  return (payload?.data || []).map(price => {
    const point = pricePoints.get(price.relationships?.appPricePoint?.data?.id)
    const territory = territories.get(price.relationships?.territory?.data?.id)
    return {
      territory:territory?.id || price.relationships?.territory?.data?.id || null,
      currency:territory?.attributes?.currency || null,
      customerPrice:point?.attributes?.customerPrice || null,
      proceeds:point?.attributes?.proceeds || null,
      startDate:price.attributes?.startDate || null,
      endDate:price.attributes?.endDate || null,
      manual:Boolean(price.attributes?.manual),
    }
  })
}

function currentPriceForTerritory(prices, territory = 'USA', now = new Date()) {
  const at = now.getTime()
  return prices.filter(price => price.territory === territory).filter(price => {
    const starts = !price.startDate || Date.parse(price.startDate) <= at
    const ends = !price.endDate || Date.parse(price.endDate) > at
    return starts && ends
  }).sort((left, right) => Date.parse(right.startDate || 0) - Date.parse(left.startDate || 0))[0] || null
}

function scheduledPricesForTerritory(prices, territory = 'USA', now = new Date()) {
  const at = now.getTime()
  return prices.filter(price => price.territory === territory && price.startDate && Date.parse(price.startDate) > at)
    .sort((left, right) => Date.parse(left.startDate) - Date.parse(right.startDate)).slice(0, 3)
}

function availabilitySummary(payload) {
  const availability = payload?.data?.attributes || null
  const territories = includedByType(payload, 'territories').map(territory => ({ territory:territory.id, currency:territory.attributes?.currency || null }))
  return availability ? {
    ...availability,
    availableTerritoryCount:territories.length,
    availableTerritories:territories.slice(0, 12),
    territoryListTruncated:territories.length > 12,
  } : null
}

async function subscriptionConfiguration(subscription, token) {
  const [pricesResult, offersResult] = await Promise.allSettled([
    appleRequest(`/v1/subscriptions/${encodeURIComponent(subscription.id)}/prices?filter[territory]=USA&include=subscriptionPricePoint,territory&fields[subscriptionPrices]=startDate,preserved,planType&fields[subscriptionPricePoints]=customerPrice,proceeds&fields[territories]=currency`, token),
    appleRequest(`/v1/subscriptions/${encodeURIComponent(subscription.id)}/introductoryOffers?filter[territory]=USA&include=subscriptionPricePoint,territory&limit=50`, token),
  ])
  const price = pricesResult.status === 'fulfilled' ? priceFromPayload(pricesResult.value, 'subscriptionPricePoints') : null
  const offers = offersResult.status === 'fulfilled' ? (offersResult.value.data || []).map(offer => ({
    id:offer.id,
    offerMode:offer.attributes?.offerMode || null,
    numberOfPeriods:offer.attributes?.numberOfPeriods || null,
    duration:offer.attributes?.duration || null,
    startDate:offer.attributes?.startDate || null,
    endDate:offer.attributes?.endDate || null,
  })) : []
  return {
    id:subscription.id,
    name:subscription.attributes?.name || 'Unnamed subscription',
    productId:subscription.attributes?.productId || null,
    period:subscription.attributes?.subscriptionPeriod || null,
    state:subscription.attributes?.state || null,
    familySharable:Boolean(subscription.attributes?.familySharable),
    price,
    introductoryOffers:offers,
    priceAccess:pricesResult.status === 'fulfilled' ? 'available' : 'unavailable',
  }
}

async function inAppPurchaseConfiguration(purchase, token) {
  try {
    const schedule = await appleRequest(`/v2/inAppPurchases/${encodeURIComponent(purchase.id)}/priceSchedule`, token)
    const scheduleId = schedule.data?.id
    const prices = scheduleId
      ? await appleRequest(`/v1/inAppPurchasePriceSchedules/${encodeURIComponent(scheduleId)}/manualPrices?filter[territory]=USA&include=inAppPurchasePricePoint,territory&fields[inAppPurchasePrices]=startDate&fields[inAppPurchasePricePoints]=customerPrice,proceeds&fields[territories]=currency`, token)
      : null
    return {
      id:purchase.id,
      name:purchase.attributes?.name || 'Unnamed in-app purchase',
      productId:purchase.attributes?.productId || null,
      type:purchase.attributes?.inAppPurchaseType || null,
      state:purchase.attributes?.state || null,
      familySharable:Boolean(purchase.attributes?.familySharable),
      price:prices ? priceFromPayload(prices, 'inAppPurchasePricePoints') : null,
      priceAccess:prices ? 'available' : 'unavailable',
    }
  } catch {
    return {
      id:purchase.id,
      name:purchase.attributes?.name || 'Unnamed in-app purchase',
      productId:purchase.attributes?.productId || null,
      type:purchase.attributes?.inAppPurchaseType || null,
      state:purchase.attributes?.state || null,
      familySharable:Boolean(purchase.attributes?.familySharable),
      price:null,
      priceAccess:'unavailable',
    }
  }
}

function providerAvailability(error, fallback) {
  const providerStatus = error?.details?.providerStatus || null
  return { status:providerStatus === 403 ? 'not_authorized' : 'unavailable', message:error?.message || fallback, providerStatus }
}

async function appPriceScheduleConfiguration({ appId, token }) {
  try {
    const schedule = await appleRequest(`/v1/apps/${encodeURIComponent(appId)}/appPriceSchedule?fields[appPriceSchedules]=baseTerritory,manualPrices,automaticPrices`, token)
    const scheduleId = schedule.data?.id
    if (!scheduleId) return { status:'pending', message:'Apple has not created an App Price Schedule for this app yet.' }
    const [baseResult, manualResult, automaticResult] = await Promise.allSettled([
      appleRequest(`/v1/appPriceSchedules/${encodeURIComponent(scheduleId)}/baseTerritory?fields[territories]=currency`, token),
      appleRequest(`/v1/appPriceSchedules/${encodeURIComponent(scheduleId)}/manualPrices?limit=200&filter[territory]=USA&include=appPricePoint,territory&fields[appPrices]=manual,startDate,endDate&fields[appPricePoints]=customerPrice,proceeds&fields[territories]=currency`, token),
      appleRequest(`/v1/appPriceSchedules/${encodeURIComponent(scheduleId)}/automaticPrices?limit=200&filter[territory]=USA&include=appPricePoint,territory&fields[appPrices]=manual,startDate,endDate&fields[appPricePoints]=customerPrice,proceeds&fields[territories]=currency`, token),
    ])
    const manualPrices = manualResult.status === 'fulfilled' ? appPriceRowsFromPayload(manualResult.value) : []
    const automaticPrices = automaticResult.status === 'fulfilled' ? appPriceRowsFromPayload(automaticResult.value) : []
    const baseTerritory = baseResult.status === 'fulfilled' && baseResult.value.data ? { territory:baseResult.value.data.id, currency:baseResult.value.data.attributes?.currency || null } : null
    const currentManual = currentPriceForTerritory(manualPrices)
    const currentAutomatic = currentPriceForTerritory(automaticPrices)
    const scheduledManual = scheduledPricesForTerritory(manualPrices)
    const scheduledAutomatic = scheduledPricesForTerritory(automaticPrices)
    return {
      status:'available',
      scheduleId,
      baseTerritory,
      usPrice:currentManual || currentAutomatic || null,
      usPriceSource:currentManual ? 'manual' : currentAutomatic ? 'automatic' : null,
      scheduledUsChanges:scheduledManual.length ? scheduledManual : scheduledAutomatic,
      hasManualUsPrice:manualPrices.length > 0,
      sourceAvailability:{
        baseTerritory:baseResult.status === 'fulfilled' ? 'available' : providerAvailability(baseResult.reason, 'Apple did not return the price schedule base territory.').status,
        manualPrices:manualResult.status === 'fulfilled' ? 'available' : providerAvailability(manualResult.reason, 'Apple did not return manually chosen United States prices.').status,
        automaticPrices:automaticResult.status === 'fulfilled' ? 'available' : providerAvailability(automaticResult.reason, 'Apple did not return automatically calculated United States prices.').status,
      },
      message:'Apple App Price Schedule returned the base territory and currently effective or scheduled United States pricing when configured.',
    }
  } catch (error) {
    return providerAvailability(error, 'Apple could not provide this app’s price schedule.')
  }
}

function includedResource(payload, type, relationship) {
  const id = relationship?.data?.id
  return id ? includedByType(payload, type).find(resource => resource.id === id) || null : null
}

function buildSnapshot(payload) {
  const builds = payload?.data || []
  const betaGroups = includedByType(payload, 'betaGroups')
  return {
    status:'available',
    recentBuildCount:builds.length,
    betaGroupCount:new Set(betaGroups.map(group => group.id)).size,
    internalBetaGroupCount:new Set(betaGroups.filter(group => group.attributes?.isInternalGroup).map(group => group.id)).size,
    externalBetaGroupCount:new Set(betaGroups.filter(group => !group.attributes?.isInternalGroup).map(group => group.id)).size,
    publicBetaLinkCount:new Set(betaGroups.filter(group => group.attributes?.publicLinkEnabled).map(group => group.id)).size,
    recentBuilds:builds.slice(0, 10).map(build => {
      const prerelease = includedResource(payload, 'preReleaseVersions', build.relationships?.preReleaseVersion)
      const betaDetail = includedResource(payload, 'buildBetaDetails', build.relationships?.buildBetaDetail)
      const betaReview = includedResource(payload, 'betaAppReviewSubmissions', build.relationships?.betaAppReviewSubmission)
      const storeVersion = includedResource(payload, 'appStoreVersions', build.relationships?.appStoreVersion)
      return {
        id:build.id,
        buildNumber:build.attributes?.version || null,
        uploadedDate:build.attributes?.uploadedDate || null,
        expirationDate:build.attributes?.expirationDate || null,
        expired:Boolean(build.attributes?.expired),
        processingState:build.attributes?.processingState || null,
        audience:build.attributes?.buildAudienceType || null,
        minOsVersion:build.attributes?.minOsVersion || null,
        usesNonExemptEncryption:build.attributes?.usesNonExemptEncryption ?? null,
        prereleaseVersion:prerelease?.attributes?.version || null,
        platform:prerelease?.attributes?.platform || null,
        internalBuildState:betaDetail?.attributes?.internalBuildState || null,
        externalBuildState:betaDetail?.attributes?.externalBuildState || null,
        autoNotifyEnabled:betaDetail?.attributes?.autoNotifyEnabled ?? null,
        betaReviewState:betaReview?.attributes?.betaReviewState || null,
        betaReviewSubmittedDate:betaReview?.attributes?.submittedDate || null,
        linkedStoreVersion:storeVersion?.attributes?.versionString || null,
        linkedStoreVersionState:storeVersion?.attributes?.appStoreState || null,
      }
    }),
    message:builds.length ? 'Apple returned the most recent builds and TestFlight readiness details for this app.' : 'Apple returned no builds for this app.',
  }
}

async function releaseAndTestFlightSnapshot({ appId, token, versionsPayload }) {
  const versions = versionsPayload?.data || []
  const latestVersion = versions[0]?.attributes || null
  const versionLocalizations = includedByType(versionsPayload, 'appStoreVersionLocalizations')
  const [buildsResult, groupsResult] = await Promise.allSettled([
    appleRequest(`/v1/builds?filter[app]=${encodeURIComponent(appId)}&limit=10&sort=-uploadedDate&include=preReleaseVersion,buildBetaDetail,betaAppReviewSubmission,betaGroups,appStoreVersion&fields[builds]=version,uploadedDate,expirationDate,expired,minOsVersion,processingState,buildAudienceType,usesNonExemptEncryption&fields[preReleaseVersions]=version,platform&fields[buildBetaDetails]=autoNotifyEnabled,internalBuildState,externalBuildState&fields[betaAppReviewSubmissions]=betaReviewState,submittedDate&fields[betaGroups]=name,isInternalGroup,hasAccessToAllBuilds,publicLinkEnabled,publicLinkLimitEnabled,publicLinkLimit,feedbackEnabled&fields[appStoreVersions]=versionString,appStoreState`, token),
    appleRequest(`/v1/apps/${encodeURIComponent(appId)}/betaGroups?limit=200&fields[betaGroups]=name,isInternalGroup,hasAccessToAllBuilds,publicLinkEnabled,publicLinkLimitEnabled,publicLinkLimit,feedbackEnabled`, token),
  ])
  const testFlight = buildsResult.status === 'fulfilled'
    ? buildSnapshot(buildsResult.value)
    : providerAvailability(buildsResult.reason, 'The current Apple key could not load builds and TestFlight readiness.')
  if (groupsResult.status === 'fulfilled' && testFlight.status === 'available') {
    const groups = groupsResult.value.data || []
    testFlight.betaGroupCount = groups.length
    testFlight.internalBetaGroupCount = groups.filter(group => group.attributes?.isInternalGroup).length
    testFlight.externalBetaGroupCount = groups.filter(group => !group.attributes?.isInternalGroup).length
    testFlight.publicBetaLinkCount = groups.filter(group => group.attributes?.publicLinkEnabled).length
    testFlight.groupAvailability = 'available'
  } else if (testFlight.status === 'available') {
    testFlight.groupAvailability = providerAvailability(groupsResult.reason, 'Apple did not return all beta groups for this app.').status
  }
  return {
    status:'available',
    latestAppStoreVersion:latestVersion ? {
      versionString:latestVersion.versionString || null,
      appStoreState:latestVersion.appStoreState || null,
      appVersionState:latestVersion.appVersionState || null,
      platform:latestVersion.platform || null,
      releaseDate:latestVersion.releaseDate || null,
      releaseType:latestVersion.releaseType || null,
      earliestReleaseDate:latestVersion.earliestReleaseDate || null,
      downloadable:latestVersion.downloadable ?? null,
      createdDate:latestVersion.createdDate || null,
    } : null,
    versionCount:versions.length,
    versionLocalizationCount:versionLocalizations.length,
    testFlight,
    message:'Current App Store release metadata and authorized TestFlight build readiness are retained separately for the selected app.',
  }
}

async function storeConfiguration({ connection, token, app }) {
  const appId = connection.app_store_app_id
  try {
    const [groupsResult, purchasesResult, availabilityResult, appPriceSchedule] = await Promise.allSettled([
      appleRequest(`/v1/apps/${encodeURIComponent(appId)}/subscriptionGroups?limit=200&fields[subscriptionGroups]=referenceName`, token),
      appleRequest(`/v1/apps/${encodeURIComponent(appId)}/inAppPurchasesV2?limit=200&fields[inAppPurchases]=name,productId,inAppPurchaseType,state,familySharable`, token),
      appleRequest(`/v1/apps/${encodeURIComponent(appId)}/appAvailability?include=availableTerritories&fields[appAvailabilities]=availableInNewTerritories&fields[territories]=currency`, token),
      appPriceScheduleConfiguration({ appId, token }),
    ])
    const groups = groupsResult.status === 'fulfilled' ? groupsResult.value.data || [] : []
    const subscriptionGroupResults = await Promise.allSettled(groups.map(async group => {
      const response = await appleRequest(`/v1/subscriptionGroups/${encodeURIComponent(group.id)}/subscriptions?limit=200&fields[subscriptions]=name,productId,subscriptionPeriod,state,familySharable`, token)
      const subscriptions = await Promise.all((response.data || []).map(subscription => subscriptionConfiguration(subscription, token)))
      return { id:group.id, name:group.attributes?.referenceName || 'Subscription group', subscriptions }
    }))
    const subscriptionLists = subscriptionGroupResults.filter(result => result.status === 'fulfilled').map(result => result.value)
    const purchases = purchasesResult.status === 'fulfilled'
      ? await Promise.all((purchasesResult.value.data || []).map(purchase => inAppPurchaseConfiguration(purchase, token)))
      : []
    const availability = availabilityResult.status === 'fulfilled' ? availabilitySummary(availabilityResult.value) : null
    const pricing = appPriceSchedule.status === 'fulfilled' ? appPriceSchedule.value : providerAvailability(appPriceSchedule.reason, 'Apple did not return the app price schedule.')
    const sourceAvailability = {
      subscriptions:groupsResult.status === 'fulfilled' ? 'available' : providerAvailability(groupsResult.reason, 'Apple did not return subscription groups.').status,
      inAppPurchases:purchasesResult.status === 'fulfilled' ? 'available' : providerAvailability(purchasesResult.reason, 'Apple did not return in-app purchases.').status,
      availability:availabilityResult.status === 'fulfilled' ? 'available' : providerAvailability(availabilityResult.reason, 'Apple did not return App Store availability territories.').status,
      pricing:pricing.status,
      subscriptionGroupDetails:subscriptionGroupResults.some(result => result.status === 'rejected') ? 'partial' : groupsResult.status === 'fulfilled' ? 'available' : 'not_authorized_or_unavailable',
    }
    return {
      status:'available',
      app:{ appleId:app?.id || appId, name:app?.attributes?.name || null, bundleId:app?.attributes?.bundleId || null, sku:app?.attributes?.sku || null, primaryLocale:app?.attributes?.primaryLocale || null },
      availability,
      pricing,
      subscriptionGroups:subscriptionLists,
      inAppPurchases:purchases,
      sourceAvailability,
      message:'FloStudio retained the authorized App Store availability, price schedule, subscription, and in-app product settings for this selected app.',
    }
  } catch (error) {
    return providerAvailability(error, 'The current App Store key cannot load this app’s configuration and paywall catalog.')
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
  const [versionsResult, reviewsResult, appInfosResult] = await Promise.allSettled([
    appleRequest(`/v1/apps/${encodeURIComponent(connection.app_store_app_id)}/appStoreVersions?limit=10&include=appStoreVersionLocalizations&fields[appStoreVersions]=versionString,appStoreState,appVersionState,releaseType,earliestReleaseDate,downloadable,createdDate,platform&fields[appStoreVersionLocalizations]=locale,description,keywords,marketingUrl,promotionalText,supportUrl,whatsNew`, token),
    appleRequest(`/v1/apps/${encodeURIComponent(connection.app_store_app_id)}/customerReviews?limit=200&sort=-createdDate&fields[customerReviews]=rating,title,body,createdDate,territory`, token),
    appleRequest(`/v1/apps/${encodeURIComponent(connection.app_store_app_id)}/appInfos?include=appInfoLocalizations&fields[appInfos]=appStoreState,appStoreAgeRating&fields[appInfoLocalizations]=locale,name,subtitle,privacyPolicyUrl`, token),
  ])
  const versionsPayload = versionsResult.status === 'fulfilled' ? versionsResult.value : null
  if (versionsPayload?.data?.length > 1) versionsPayload.data.sort((left, right) => Date.parse(right.attributes?.createdDate || 0) - Date.parse(left.attributes?.createdDate || 0))
  const appInfoPayload = appInfosResult.status === 'fulfilled' ? appInfosResult.value : null
  const appInfo = appInfoPayload?.data?.[0]?.attributes || null
  const appInfoLocalizations = includedByType(appInfoPayload, 'appInfoLocalizations').map(resource => ({
    id:resource.id,
    locale:resource.attributes?.locale || '',
    name:resource.attributes?.name || '',
    subtitle:resource.attributes?.subtitle || '',
    privacyPolicyUrl:resource.attributes?.privacyPolicyUrl || '',
  }))
  const versionLocalizations = includedByType(versionsPayload, 'appStoreVersionLocalizations').map(resource => ({
    id:resource.id,
    locale:resource.attributes?.locale || '',
    description:resource.attributes?.description || '',
    keywords:resource.attributes?.keywords || '',
    marketingUrl:resource.attributes?.marketingUrl || '',
    promotionalText:resource.attributes?.promotionalText || '',
    supportUrl:resource.attributes?.supportUrl || '',
    versionDescription:resource.attributes?.versionDescription || '',
    whatsNew:resource.attributes?.whatsNew || '',
  }))
  const metrics = buildAppMetrics({ app: app.data, versions: versionsPayload?.data || [], reviews: reviewsResult.status === 'fulfilled' ? reviewsResult.value.data || [] : [] })
  metrics.availability.versions = versionsResult.status === 'fulfilled'
    ? { status:'available', message:`Apple returned ${versionsPayload?.data?.length || 0} recent App Store version record(s).` }
    : providerAvailability(versionsResult.reason, 'This key could not load App Store versions.')
  metrics.availability.reviews = reviewsResult.status === 'fulfilled'
    ? { status:'available', message:(reviewsResult.value.data || []).length ? `Apple returned ${(reviewsResult.value.data || []).length} authorized review record(s).` : 'Apple returned the review resource with no review records.' }
    : providerAvailability(reviewsResult.reason, 'This key could not load customer reviews.')
  metrics.localizedStoreMetadata = {
    status:appInfosResult.status === 'fulfilled' || versionsResult.status === 'fulfilled' ? 'available' : 'not_authorized_or_unavailable',
    appInfoLocalizations,
    versionLocalizations,
  }
  metrics.storeMetadata = {
    status:appInfosResult.status === 'fulfilled' ? 'available' : providerAvailability(appInfosResult.reason, 'This key could not load App Store app information.').status,
    appInfo:appInfo ? { appStoreState:appInfo.appStoreState || null, appStoreAgeRating:appInfo.appStoreAgeRating || null } : null,
    appInfoLocalizations,
    versionLocalizations,
    appInfoLocalizationCount:appInfoLocalizations.length,
    versionLocalizationCount:versionLocalizations.length,
    message:appInfosResult.status === 'fulfilled' ? `Apple returned ${appInfoLocalizations.length} app information localization(s) and ${versionLocalizations.length} version localization(s).` : 'Apple did not authorize this key to read app information and localized store metadata.',
  }
  metrics.availability.localizedMetadata = metrics.storeMetadata.status === 'available'
    ? { status:'available', message:metrics.storeMetadata.message }
    : providerAvailability(appInfosResult.reason, 'This key could not load localized App Store metadata.')
  const [analytics, sales, configuration, release] = await Promise.all([
    analyticsMetrics({ connection, token }),
    monthlySalesMetrics({ connection, token, app:app.data }),
    storeConfiguration({ connection, token, app:app.data }),
    releaseAndTestFlightSnapshot({ appId:connection.app_store_app_id, token, versionsPayload }),
  ])
  metrics.analytics = analytics
  metrics.availability.analytics = analytics.status === 'available'
    ? { status:'available', message:analytics.message || `Apple App Analytics returned a ${analytics.periodDays}-day acquisition window.` }
    : { status:analytics.status, message:analytics.message }
  const downloadsStatus = analytics.metricAvailability?.downloads || analytics.status
  const engagementStatus = analytics.metricAvailability?.impressions || analytics.status
  metrics.availability.downloads = downloadsStatus === 'available'
    ? { status:'available', message:`${analytics.firstTimeDownloads} first-time downloads and ${analytics.redownloads} redownloads in the Apple App Analytics window.` }
    : { status:downloadsStatus, message:analytics.reportCoverage?.downloads?.message || analytics.message }
  metrics.availability.engagement = engagementStatus === 'available'
    ? { status:'available', message:`Apple returned Discovery & Engagement data for the ${analytics.periodDays}-day analytics window.` }
    : { status:engagementStatus, message:analytics.reportCoverage?.engagement?.message || analytics.message }
  metrics.subscriptions = analytics.subscriptions || null
  metrics.availability.subscriptions = analytics.subscriptions?.status === 'available'
    ? { status:'available', message:'Apple subscription state, lifecycle, and purchase reports are available for the selected app.' }
    : { status:analytics.subscriptions?.status || analytics.status, message:analytics.subscriptions?.message || analytics.message }
  metrics.sales = sales
  metrics.availability.proceeds = sales.status === 'available'
    ? { status:'available', message:'Estimated developer proceeds are broken out by Apple reporting currency.' }
    : { status:sales.status, message:sales.message }
  metrics.configuration = configuration
  metrics.availability.configuration = configuration.status === 'available'
    ? { status:'available', message:'Apple returned this selected app’s configuration snapshot. Individual domains retain their own authorization state.' }
    : { status:configuration.status, message:configuration.message }
  metrics.release = release
  metrics.availability.release = versionsResult.status === 'fulfilled'
    ? { status:'available', message:'Apple returned current App Store release metadata.' }
    : providerAvailability(versionsResult.reason, 'This key could not load App Store release metadata.')
  metrics.availability.testFlight = release.testFlight?.status === 'available'
    ? { status:'available', message:release.testFlight.message }
    : release.testFlight || { status:'unavailable', message:'Apple did not return TestFlight readiness.' }
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
