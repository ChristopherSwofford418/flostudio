import { resolveDailyAppCopyProfile, dailyAppThemeQualifiers, dailyAppCopyAngleIndex } from './daily-app-copy.js'

export const EMAIL_DAILY_CAMPAIGN_LANGUAGE = 'en'
export const EMAIL_DAILY_CAMPAIGN_CONTENT_SOURCE = 'listing_template'
export const EMAIL_DAILY_CAMPAIGN_BLOCKER_CODES = Object.freeze([
  'EMAIL_DAILY_CAMPAIGN_INVALID_SNAPSHOT', 'EMAIL_DAILY_CAMPAIGN_SCOPE_MISMATCH',
  'EMAIL_DAILY_CAMPAIGN_ARCHIVED', 'EMAIL_DAILY_CAMPAIGN_LANGUAGE_UNSUPPORTED',
  'EMAIL_DAILY_CAMPAIGN_APP_ID_REQUIRED', 'EMAIL_DAILY_CAMPAIGN_APP_ID_INVALID',
  'EMAIL_DAILY_CAMPAIGN_APP_ID_MISMATCH', 'EMAIL_DAILY_CAMPAIGN_APP_STORE_URL_REQUIRED',
  'EMAIL_DAILY_CAMPAIGN_APP_STORE_URL_INVALID', 'EMAIL_DAILY_CAMPAIGN_CONTENT_UNSAFE',
])
const fail = code => Object.assign(new Error('Daily campaign draft blocked.'), { code })
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value)
const clean = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
const supplied = value => value !== undefined && value !== null && value !== ''
const archived = value => supplied(value) && value !== false && value !== 'false'

export function validateDailyCampaignSnapshot(snapshot) {
  if (!object(snapshot) || !identifier(snapshot.workspace_id) || !identifier(snapshot.product_id) ||
      !identifier(snapshot.settings_revision) || !object(snapshot.product) || !object(snapshot.product.source_facts)) {
    throw fail('EMAIL_DAILY_CAMPAIGN_INVALID_SNAPSHOT')
  }
  if (snapshot.product.id !== snapshot.product_id ||
      (snapshot.product.workspace_id !== undefined && snapshot.product.workspace_id !== snapshot.workspace_id)) {
    throw fail('EMAIL_DAILY_CAMPAIGN_SCOPE_MISMATCH')
  }
  if (typeof snapshot.scheduled_day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.scheduled_day)) {
    throw fail('EMAIL_DAILY_CAMPAIGN_INVALID_SNAPSHOT')
  }
  const day = new Date(`${snapshot.scheduled_day}T00:00:00Z`)
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== snapshot.scheduled_day) {
    throw fail('EMAIL_DAILY_CAMPAIGN_INVALID_SNAPSHOT')
  }
  if (snapshot.language !== EMAIL_DAILY_CAMPAIGN_LANGUAGE) throw fail('EMAIL_DAILY_CAMPAIGN_LANGUAGE_UNSUPPORTED')
  if (archived(snapshot.product.source_facts.archived) || archived(snapshot.product.archived) ||
      supplied(snapshot.product.archived_at) || supplied(snapshot.product.source_facts.archived_at)) {
    throw fail('EMAIL_DAILY_CAMPAIGN_ARCHIVED')
  }
  return snapshot
}

// Validate the raw authority before URL parsing: URL normalizes Unicode hosts,
// default ports, backslashes and dot segments. None may impersonate this source.
// Query/fragment tracking is discarded, never copied into the validated link.
export function canonicalAppStoreUrl(value) {
  if (typeof value !== 'string' || value.length > 2000 || /[\s\u0000-\u001f\u007f\\]/u.test(value) ||
      !/^https:\/\/apps\.apple\.com\//i.test(value)) return ''
  const rawPath = value.replace(/^https:\/\/apps\.apple\.com/i, '').split(/[?#]/, 1)[0]
  const match = /^\/(?:[a-z]{2}\/)?app\/(?:[a-zA-Z0-9._~%+-]+\/)?id([1-9]\d{0,19})\/?$/.exec(rawPath)
  if (!match) return ''
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.hostname !== 'apps.apple.com' || url.username || url.password || url.port || url.pathname !== rawPath) return ''
    // Percent-encoded slugs are allowed, but encoded separators/control characters are not.
    const decoded = decodeURIComponent(rawPath)
    if (/[\u0000-\u001f\u007f\\?#@]/u.test(decoded) || decoded.split('/').length !== rawPath.split('/').length) return ''
    url.search = ''; url.hash = ''
    return url.href
  } catch { return '' }
}
const appIdFromUrl = value => /\/id([1-9]\d{0,19})\/?$/.exec(value)?.[1] || ''
const sourceId = value => {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value <= 0)) return ''
  if (typeof value !== 'string' && typeof value !== 'number') return ''
  const id = String(value)
  return /^[1-9]\d{0,19}$/.test(id) ? id : ''
}

export function resolveDailyCampaignAppStoreSource(product) {
  if (!object(product) || !object(product.source_facts)) throw fail('EMAIL_DAILY_CAMPAIGN_INVALID_SNAPSHOT')
  const facts = product.source_facts
  if (archived(facts.archived) || archived(product.archived) || supplied(facts.archived_at) || supplied(product.archived_at)) throw fail('EMAIL_DAILY_CAMPAIGN_ARCHIVED')
  const metadata = object(facts.storeMetadata) ? facts.storeMetadata : {}
  const listing = object(facts.appStoreListing) ? facts.appStoreListing : {}
  const ids = [facts.appId, facts.appStoreId, facts.appleAppId, metadata.trackId, metadata.appStoreId].filter(supplied)
  if (!ids.length) throw fail('EMAIL_DAILY_CAMPAIGN_APP_ID_REQUIRED')
  const normalizedIds = ids.map(sourceId)
  if (normalizedIds.some(id => !id)) throw fail('EMAIL_DAILY_CAMPAIGN_APP_ID_INVALID')
  if (new Set(normalizedIds).size !== 1) throw fail('EMAIL_DAILY_CAMPAIGN_APP_ID_MISMATCH')
  const appId = normalizedIds[0]
  const links = []
  for (const [value, listingSource] of [[metadata.trackUrl, true], [listing.sourceUrl, true], [product.product_url, false]]) {
    if (!supplied(value)) continue
    const url = canonicalAppStoreUrl(value)
    // A product homepage is not evidence of an App Store listing. Explicit saved
    // listing sources must be valid; do not hide corrupt sources with a fallback.
    if (!url) {
      if (listingSource || (typeof value === 'string' && /apps[.\uff0e]apple/i.test(value))) throw fail('EMAIL_DAILY_CAMPAIGN_APP_STORE_URL_INVALID')
      continue
    }
    if (appIdFromUrl(url) !== appId) throw fail('EMAIL_DAILY_CAMPAIGN_APP_ID_MISMATCH')
    links.push(url)
  }
  if (!links.length) throw fail('EMAIL_DAILY_CAMPAIGN_APP_STORE_URL_REQUIRED')
  return { app_id:appId, app_store_url:links[0] }
}

// Only complete, narrow capability clauses are eligible for verbatim quotation.
// No open-ended adjective/outcome suffixes: a denylist alone cannot establish safety.
const simpleCapability = /^(?:organize|save|store|view|browse|search|create|manage|record|keep|edit|review|access|add|track) (?:your )?(?:notes|documents|files|tasks|lists|to-do lists|events|recipes|bookmarks|appointments|reminders|legal information|meal logs|activity logs)(?:(?:, | and )(?:your )?(?:notes|documents|files|tasks|lists|to-do lists|events|recipes|bookmarks|appointments|reminders|legal information|meal logs|activity logs))*(?: in one place)?[.!]?$/i
export function safeListingExcerpt(description) {
  if (typeof description !== 'string') return ''
  const sentences = description.slice(0, 12000).split(/\r?\n|(?<=[.!?;])\s+/)
  for (const sentence of sentences) {
    const clause = clean(sentence).replace(/^[-*•]\s*/, '')
    if (clause.length <= 220 && simpleCapability.test(clause)) return clause
  }
  return ''
}

function appName(product) {
  const raw = product.name
  const name = clean(raw)
  if (!name || name.length > 100 || /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069<>@]/u.test(raw) ||
      /https?:|\b(?:ignore|instructions?|system prompt|guarantee\w*|cure\w*|risk[- ]free|free|diagnos\w*|get rich|lose weight|win cases)\b/i.test(name)) {
    throw fail('EMAIL_DAILY_CAMPAIGN_CONTENT_UNSAFE')
  }
  return name
}
// Finite factual rotations intentionally repeat eventually; they are not AI,
// translation, individualized copy, or a promise of forever-unique messages.
const subjects = [
  name => `${name}: App Store overview`, name => `Explore ${name} on the App Store`,
  name => `${name}: review the current listing`, name => `A look at ${name}`,
  name => `${name}: listing details`, name => `Find ${name} on the App Store`,
  name => `${name}: features and limitations`, name => `Introducing the ${name} listing`,
  name => `${name}: an app listing to review`, name => `App Store information for ${name}`,
  name => `${name}: consider the listing`, name => `Review App Store details for ${name}`,
]
const intros = [
  name => `Explore ${name} on the App Store. Review the current listing for features, requirements, pricing, and limitations.`,
  name => `Find ${name} on the App Store. The current listing is the place to review its features, requirements, pricing, and limitations.`,
  name => `The App Store listing for ${name} is available below. Read the current feature details, requirements, pricing, and limitations.`,
  name => `Take a look at the current App Store listing for ${name}. Review the requirements, features, pricing, and limitations before making a decision.`,
  name => `Learn about ${name} from its current App Store listing. Check the listed features, requirements, pricing, and limitations.`,
  name => `Review ${name} on the App Store. Consult the listing for current features, requirements, pricing, and limitations.`,
  name => `For information about ${name}, see the current App Store listing. Review features, requirements, pricing, and limitations there.`,
  name => `The link below leads to ${name} on the App Store. Review the current requirements, features, pricing, and limitations.`,
  name => `Consider the current App Store listing for ${name}. Read its features, pricing, requirements, and limitations before deciding.`,
  name => `Read about ${name} on the App Store. Check the current listing for features, pricing, requirements, and limitations.`,
  name => `App Store information for ${name} is linked below. Consult the current listing for requirements, features, pricing, and limitations.`,
  name => `Visit the App Store listing for ${name} to review its current features, requirements, pricing, and limitations.`,
]
export const EMAIL_DAILY_CAMPAIGN_TEMPLATE_COUNT = subjects.length

export function buildDailyEmailCampaignContent(snapshot) {
  validateDailyCampaignSnapshot(snapshot)
  const source = resolveDailyCampaignAppStoreSource(snapshot.product)
  const name = appName(snapshot.product)
  const profile = resolveDailyAppCopyProfile(snapshot.product, source)
  const index = dailyAppCopyAngleIndex(source.app_id, snapshot.scheduled_day, subjects.length)
  const angle = profile?.email_angles[index]
  // Changed or unknown listings never borrow features from a stale/other profile.
  const paragraphs = angle ? [...angle.paragraphs] : ['App promotion', intros[index](name)]
  paragraphs.push(...dailyAppThemeQualifiers(snapshot.product, 'email', profile), `App Store: ${source.app_store_url}`)
  const result = {
    name:`${name} — ${snapshot.scheduled_day} — English template — Draft for review`,
    subject:angle ? angle.subject : subjects[index](name), body:paragraphs.join('\n\n'),
    app_store_url:source.app_store_url, status:'draft', content_source:EMAIL_DAILY_CAMPAIGN_CONTENT_SOURCE,
  }
  if (result.name.length > 180 || result.subject.length > 180 || result.body.length > 6000) throw fail('EMAIL_DAILY_CAMPAIGN_CONTENT_UNSAFE')
  return result
}
export const generateDailyCampaignContent = buildDailyEmailCampaignContent
