import { authenticatedJsonHeaders } from './authenticatedApi'

export const FACEBOOK_DAILY_TIMEZONE = 'America/New_York'
export const FACEBOOK_DAILY_START_HOUR = 3
export const facebookDailyUuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const invalid = () => { throw new Error('The saved Facebook draft status could not be verified. Refresh before continuing.') }
const count = value => Number.isSafeInteger(value) && value >= 0
const text = (value, maximum, multiline = false) => typeof value === 'string' && value.length <= maximum && !(multiline ? /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f<>]/ : /[\x00-\x1f\x7f<>]/).test(value)

export function facebookDailyDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith('0000-') && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
}
export function facebookDailyNextDay(value) {
  if (!facebookDailyDate(value)) return ''
  const next = new Date(`${value}T12:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  const result = next.toISOString().slice(0, 10)
  return facebookDailyDate(result) ? result : ''
}
export function safeFacebookDailyAppUrl(value) {
  if (typeof value !== 'string' || !value || value.length > 2000 || /[\s\x00-\x1f\x7f\\]/.test(value)) return ''
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.hostname !== 'apps.apple.com' || url.username || url.password || url.port || url.search || url.hash || url.href !== value || !/^\/(?:[a-z]{2}\/)?app\/(?:[a-zA-Z0-9._~%+-]+\/)?id[1-9]\d{0,19}\/?$/.test(url.pathname)) return ''
    const decoded = decodeURIComponent(url.pathname)
    return /[\x00-\x1f\x7f\\?#@]/.test(decoded) || decoded.split('/').length !== url.pathname.split('/').length ? '' : value
  } catch { return '' }
}
/** A saved reference only, never a guessed Page, login, share or redirect URL. */
export function safeFacebookDailyPageUrl(value) {
  if (typeof value !== 'string' || value.length > 2000 || /[\s\x00-\x1f\x7f\\%]/.test(value)) return ''
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !['facebook.com', 'www.facebook.com'].includes(url.hostname) || url.username || url.password || url.port || url.hash || url.href !== value) return ''
    if (url.pathname === '/profile.php') return /^\?id=[1-9]\d{0,24}$/.test(url.search) ? value : ''
    if (url.search) return ''
    const reserved = /^(?:login|logout|l|share|sharer|sharer.php|dialog|plugins|groups|events|marketplace|watch|reel|reels|settings|help|checkpoint|recover|photo|photos|story.php|permalink.php|home.php|pages)$/i
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length === 1 && /^[a-zA-Z0-9._-]{1,100}$/.test(parts[0]) && !reserved.test(parts[0])) return value
    if (parts.length === 3 && parts[0] === 'pages' && /^[a-zA-Z0-9._-]{1,100}$/.test(parts[1]) && /^[1-9]\d{0,24}$/.test(parts[2])) return value
    return ''
  } catch { return '' }
}
export function safeFacebookDailyImagePath(value, workspaceId, productId) {
  if (!facebookDailyUuid(workspaceId) || !facebookDailyUuid(productId) || typeof value !== 'string') return ''
  const prefix = `/facebook-assets/${workspaceId}/${productId}/`
  return value.startsWith(prefix) && /^[a-f0-9]{64}\.png$/.test(value.slice(prefix.length)) ? value : ''
}
function hashtagsText(value) {
  const result = Array.isArray(value) && value.length <= 100 && value.every(tag => text(tag, 100)) ? value.join(' ') : value
  if (!text(result, 2000, true) || (result.trim() && !result.trim().split(/\s+/u).every(tag => /^#[\p{L}\p{N}_]+$/u.test(tag)))) invalid()
  return result
}
function verifiedBody(body, appUrl) {
  if (!text(body, 6000, true) || !body.trim() || /\]\s*\(/.test(body)) invalid()
  const urls = body.match(/https?:\/\/[^\s<>"'\[\]{}()]+/gi) || []
  if (!urls.length || urls.some(url => url.replace(/[.,;:!?]+$/, '') !== appUrl)) invalid()
  if (/(?:javascript|data|file|mailto):|www\.|\/\//i.test(body.replace(/https?:\/\/[^\s<>"'\[\]{}()]+/gi, ''))) invalid()
}
function timestamp(value) {
  return typeof value === 'string' && value.length <= 64 && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))
}
/** Reject wrong workspace/app/date before projecting any copy or image. */
export function facebookDailyStatusResponse(value, workspaceId, scheduledDay = null) {
  if (!facebookDailyUuid(workspaceId) || (scheduledDay !== null && !facebookDailyDate(scheduledDay)) || !object(value) || value.workspace_id !== workspaceId || !facebookDailyDate(value.scheduled_day) || !facebookDailyDate(value.today) || value.scheduled_day !== (scheduledDay || value.today) || value.timezone !== FACEBOOK_DAILY_TIMEZONE || !Array.isArray(value.apps) || value.apps.length > 200 || !object(value.today_counts)) invalid()
  const totals = value.today_counts
  if (!['apps', 'drafts', 'images'].every(key => count(totals[key])) || totals.apps !== value.apps.length || totals.drafts > totals.apps || totals.images > totals.drafts) invalid()
  const products = new Set(), drafts = new Set()
  const apps = value.apps.map(app => {
    if (!object(app) || app.workspace_id !== workspaceId || !facebookDailyUuid(app.product_id) || products.has(app.product_id.toLowerCase()) || !text(app.app_name, 200) || !app.app_name.trim() || !count(app.assets_count) || !object(app.settings) || typeof app.settings.enabled !== 'boolean' || app.settings.timezone !== FACEBOOK_DAILY_TIMEZONE || app.settings.start_hour !== FACEBOOK_DAILY_START_HOUR || !Object.hasOwn(app, 'draft')) invalid()
    products.add(app.product_id.toLowerCase())
    const appUrl = app.app_store_url === null || app.app_store_url === '' ? '' : safeFacebookDailyAppUrl(app.app_store_url)
    if (!appUrl && app.app_store_url !== null && app.app_store_url !== '') invalid()
    for (const key of ['workspace_id', 'product_id']) if (Object.hasOwn(app.settings, key) && app.settings[key] !== (key === 'workspace_id' ? workspaceId : app.product_id)) invalid()
    let draft = null
    if (app.draft !== null) {
      const saved = app.draft
      if (!object(saved) || !facebookDailyUuid(saved.id) || drafts.has(saved.id.toLowerCase()) || saved.workspace_id !== workspaceId || saved.product_id !== app.product_id || saved.scheduled_day !== value.scheduled_day || saved.status !== 'draft' || !appUrl || saved.app_store_url !== appUrl || !timestamp(saved.created_at) || !timestamp(saved.updated_at) || !text(saved.source, 100) || !saved.source.trim()) invalid()
      verifiedBody(saved.body, appUrl)
      const hashtags = hashtagsText(saved.hashtags)
      const emptyImage = saved.image_path === null || saved.image_path === ''
      const emptyAsset = saved.asset_id === null || saved.asset_id === ''
      const imagePath = emptyImage ? '' : safeFacebookDailyImagePath(saved.image_path, workspaceId, app.product_id)
      if (emptyImage !== emptyAsset || (!emptyImage && (!imagePath || !facebookDailyUuid(saved.asset_id)))) invalid()
      drafts.add(saved.id.toLowerCase())
      draft = { id: saved.id, workspace_id: workspaceId, product_id: app.product_id, scheduled_day: saved.scheduled_day, body: saved.body, hashtags, app_store_url: appUrl, asset_id: emptyAsset ? null : saved.asset_id, image_path: imagePath, status: 'draft', source: saved.source, created_at: saved.created_at, updated_at: saved.updated_at }
    }
    return { workspace_id: workspaceId, product_id: app.product_id, app_name: app.app_name, app_store_url: appUrl, facebook_page_url: safeFacebookDailyPageUrl(app.facebook_page_url), settings: { enabled: app.settings.enabled, timezone: app.settings.timezone, start_hour: app.settings.start_hour }, assets_count: app.assets_count, draft }
  })
  if (value.scheduled_day === value.today && (totals.drafts !== apps.filter(app => app.draft).length || totals.images !== apps.filter(app => app.draft?.image_path).length)) invalid()
  return { workspace_id: workspaceId, scheduled_day: value.scheduled_day, today: value.today, timezone: value.timezone, apps, today_counts: { apps: totals.apps, drafts: totals.drafts, images: totals.images } }
}
export function facebookDailyMatchesSearch(app, query = '') {
  if (typeof query !== 'string' || query.length > 200) return false
  const normalize = value => value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase()
  return normalize([app?.app_name, app?.draft?.body, app?.draft?.hashtags].filter(value => typeof value === 'string').join(' ')).includes(normalize(query))
}
export function facebookDailyCopyText(app, field) {
  const draft = app?.draft, appUrl = safeFacebookDailyAppUrl(app?.app_store_url)
  if (!draft || draft.status !== 'draft' || !facebookDailyUuid(draft.id) || draft.workspace_id !== app.workspace_id || draft.product_id !== app.product_id || !appUrl || draft.app_store_url !== appUrl || !['post', 'hashtags'].includes(field)) invalid()
  verifiedBody(draft.body, appUrl)
  const hashtags = hashtagsText(draft.hashtags)
  return field === 'hashtags' ? hashtags : `${draft.body}${hashtags.trim() ? `\n\n${hashtags}` : ''}`
}
export function ensureFacebookDailyCurrent(signal, isCurrent) {
  if (signal?.aborted || typeof isCurrent !== 'function' || !isCurrent()) {
    const error = new Error('The workspace, date or sign-in changed. Refresh before continuing.'); error.name = 'AbortError'; throw error
  }
}
/** One POST read returns the complete workspace; no per-app request fan-out. */
export async function facebookDailyDraftsAction({ workspaceId, action, payload = {}, signal, isCurrent = () => true }) {
  ensureFacebookDailyCurrent(signal, isCurrent)
  if (!facebookDailyUuid(workspaceId) || !object(payload)) invalid()
  let fields
  if (action === 'get_workspace_status') {
    const scheduledDay = payload.scheduledDay ?? null
    if (scheduledDay !== null && !facebookDailyDate(scheduledDay)) invalid()
    fields = { scheduledDay }
  } else if (action === 'save_workspace_settings') {
    if (typeof payload.enabled !== 'boolean' || payload.timezone !== FACEBOOK_DAILY_TIMEZONE || payload.startHour !== FACEBOOK_DAILY_START_HOUR) invalid()
    fields = { enabled: payload.enabled, timezone: FACEBOOK_DAILY_TIMEZONE, startHour: FACEBOOK_DAILY_START_HOUR }
  } else throw new Error('Unsupported Facebook daily draft action.')
  const headers = await authenticatedJsonHeaders()
  ensureFacebookDailyCurrent(signal, isCurrent)
  let response
  try {
    response = await fetch('/api/facebook-daily-drafts', { method: 'POST', credentials: 'same-origin', headers, signal, body: JSON.stringify({ ...fields, workspaceId, action }) })
  } catch {
    ensureFacebookDailyCurrent(signal, isCurrent)
    throw new Error(action === 'save_workspace_settings' ? 'The schedule save outcome is unconfirmed. Refresh before retrying.' : 'Saved Facebook drafts could not be loaded. Refresh to try again.')
  }
  const value = await response.json().catch(() => null)
  ensureFacebookDailyCurrent(signal, isCurrent)
  if (!response.ok) {
    const error = new Error(({ 401: 'Sign in again, then refresh.', 403: 'Your workspace access or role does not permit this action.', 404: 'The daily draft service is not available yet.', 409: 'The saved app set or settings changed. Refresh and review again.' })[response.status] || 'The operation could not be confirmed. Refresh before retrying.')
    error.status = response.status
    throw error
  }
  if (action === 'get_workspace_status') return facebookDailyStatusResponse(value, workspaceId, fields.scheduledDay)
  if (!object(value) || value.workspace_id !== workspaceId) invalid()
  return { workspace_id: workspaceId }
}
export async function copyFacebookDailyText(value, { isCurrent, signal, clipboard = globalThis.navigator?.clipboard }) {
  ensureFacebookDailyCurrent(signal, isCurrent)
  if (typeof value !== 'string' || !value || typeof clipboard?.writeText !== 'function') throw new Error('Clipboard unavailable')
  await clipboard.writeText(value)
  ensureFacebookDailyCurrent(signal, isCurrent)
}
/** Static originals only. A click requests a native download; it cannot verify disk completion. */
export async function downloadFacebookDailyImage(app, { isCurrent, signal, fetchImpl = globalThis.fetch, documentImpl = globalThis.document, urlImpl = globalThis.URL }) {
  ensureFacebookDailyCurrent(signal, isCurrent)
  const path = safeFacebookDailyImagePath(app?.draft?.image_path, app?.workspace_id, app?.product_id)
  if (!path || !facebookDailyUuid(app?.draft?.asset_id) || app.draft.workspace_id !== app.workspace_id || app.draft.product_id !== app.product_id) invalid()
  const response = await fetchImpl(path, { method: 'GET', credentials: 'same-origin', redirect: 'error', signal })
  ensureFacebookDailyCurrent(signal, isCurrent)
  if (!response.ok || response.redirected || response.headers?.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'image/png') throw new Error('Image unavailable')
  const blob = await response.blob()
  ensureFacebookDailyCurrent(signal, isCurrent)
  if (!blob || blob.size < 8 || blob.type.split(';')[0].trim().toLowerCase() !== 'image/png') throw new Error('Image unavailable')
  const bytes = new Uint8Array(await blob.slice(0, 8).arrayBuffer())
  ensureFacebookDailyCurrent(signal, isCurrent)
  if (![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) throw new Error('Image unavailable')
  let objectUrl, anchor
  try {
    objectUrl = urlImpl.createObjectURL(blob)
    ensureFacebookDailyCurrent(signal, isCurrent)
    anchor = documentImpl.createElement('a')
    anchor.href = objectUrl
    anchor.download = `${app.app_name.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'app'}-facebook-${app.draft.scheduled_day}.png`
    documentImpl.body.appendChild(anchor)
    ensureFacebookDailyCurrent(signal, isCurrent)
    anchor.click()
    return { requested: true }
  } finally {
    anchor?.remove()
    if (objectUrl) urlImpl.revokeObjectURL(objectUrl)
  }
}
