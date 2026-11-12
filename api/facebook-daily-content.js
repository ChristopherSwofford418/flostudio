import { resolveDailyAppCopyProfile, dailyAppThemeQualifiers, dailyAppCopyAngleIndex,
  dailyAppUnduplicatedQualifiers, isSafeDailyAppCopyText, DAILY_APP_COPY_FORBIDDEN_CONTROLS } from './daily-app-copy.js'
import { canonicalAppStoreUrl, resolveDailyCampaignAppStoreSource } from './email-daily-campaign-content.js'

export const FACEBOOK_DAILY_CONTENT_LIMIT = 4000
export const FACEBOOK_DAILY_HASHTAG_LIMIT = 5
export const FACEBOOK_DAILY_BLOCKER_CODES = Object.freeze([
  'FACEBOOK_DAILY_INVALID_SNAPSHOT', 'FACEBOOK_DAILY_SCOPE_MISMATCH',
  'FACEBOOK_DAILY_ARCHIVED', 'FACEBOOK_DAILY_APP_ID_REQUIRED',
  'FACEBOOK_DAILY_APP_ID_INVALID', 'FACEBOOK_DAILY_APP_ID_MISMATCH',
  'FACEBOOK_DAILY_APP_STORE_URL_REQUIRED', 'FACEBOOK_DAILY_APP_STORE_URL_INVALID',
  'FACEBOOK_DAILY_ASSET_INVALID', 'FACEBOOK_DAILY_IMAGE_PATH_INVALID',
  'FACEBOOK_DAILY_CONTENT_UNSAFE', 'FACEBOOK_DAILY_HASHTAGS_INVALID',
])
const fail = code => Object.assign(new Error('Facebook daily draft blocked.'), { code })
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
// Canonical lowercase UUIDs make comparisons and the approved literal path unambiguous.
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
const forbiddenControls = DAILY_APP_COPY_FORBIDDEN_CONTROLS
function assertPlainCopy(value, max, options = {}) {
  if (!isSafeDailyAppCopyText(value, max, options)) throw fail('FACEBOOK_DAILY_CONTENT_UNSAFE')
  return value
}

export function validateFacebookDailySnapshot(snapshot) {
  if (!object(snapshot) || !uuid(snapshot.workspace_id) || !uuid(snapshot.product_id) ||
      !uuid(snapshot.settings_revision) || !object(snapshot.product) || !object(snapshot.product.source_facts)) {
    throw fail('FACEBOOK_DAILY_INVALID_SNAPSHOT')
  }
  if (snapshot.product.id !== snapshot.product_id ||
      (snapshot.product.workspace_id !== undefined && snapshot.product.workspace_id !== snapshot.workspace_id)) {
    throw fail('FACEBOOK_DAILY_SCOPE_MISMATCH')
  }
  if (typeof snapshot.scheduled_day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.scheduled_day) || snapshot.scheduled_day.startsWith('0000-')) throw fail('FACEBOOK_DAILY_INVALID_SNAPSHOT')
  const date = new Date(`${snapshot.scheduled_day}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== snapshot.scheduled_day) throw fail('FACEBOOK_DAILY_INVALID_SNAPSHOT')
  // Language is descriptive metadata only: reviewed image captions may be Portuguese.
  if (snapshot.asset !== undefined && snapshot.asset !== null) {
    const asset = snapshot.asset
    if (!object(asset) || !uuid(asset.id)) throw fail('FACEBOOK_DAILY_ASSET_INVALID')
    if ((asset.workspace_id !== undefined && asset.workspace_id !== snapshot.workspace_id) ||
        (asset.product_id !== undefined && asset.product_id !== snapshot.product_id)) throw fail('FACEBOOK_DAILY_SCOPE_MISMATCH')
    const prefix = `/facebook-assets/${snapshot.workspace_id}/${snapshot.product_id}/`
    if (typeof asset.file_path !== 'string' || !asset.file_path.startsWith(prefix) ||
        !/^[0-9a-f]{64}\.png$/.test(asset.file_path.slice(prefix.length))) throw fail('FACEBOOK_DAILY_IMAGE_PATH_INVALID')
    assertPlainCopy(asset.caption, FACEBOOK_DAILY_CONTENT_LIMIT, { multiline:true, appId:resolveSource(snapshot.product).app_id })
  }
  return snapshot
}

function resolveSource(product) {
  try {
    const savedLink = product.source_facts.appStoreUrl
    const supplied = savedLink !== undefined && savedLink !== null && savedLink !== ''
    // The new protected RPC may carry its official canonical destination only
    // in source_facts. Feed that through the existing authority/ID resolver.
    const source = resolveDailyCampaignAppStoreSource(supplied && !product.product_url ? { ...product, product_url:savedLink } : product)
    if (!supplied) return source
    const url = canonicalAppStoreUrl(savedLink)
    if (!url) throw fail('FACEBOOK_DAILY_APP_STORE_URL_INVALID')
    if (/\/id([1-9]\d{0,19})\/?$/.exec(url)?.[1] !== source.app_id) throw fail('FACEBOOK_DAILY_APP_ID_MISMATCH')
    return { ...source, app_store_url:url }
  }
  catch (error) {
    const code = typeof error?.code === 'string' ? error.code.replace(/^EMAIL_DAILY_CAMPAIGN_/, 'FACEBOOK_DAILY_') : ''
    throw fail(FACEBOOK_DAILY_BLOCKER_CODES.includes(code) ? code : 'FACEBOOK_DAILY_INVALID_SNAPSHOT')
  }
}

function hashtagsFor(asset, name) {
  const supplied = asset?.hashtags
  // The database stores text; accept an array as a preparation convenience but
  // validate each individual token and persist one space-separated plain string.
  if (supplied !== undefined && supplied !== null && typeof supplied !== 'string' && !Array.isArray(supplied)) throw fail('FACEBOOK_DAILY_HASHTAGS_INVALID')
  if (typeof supplied === 'string' && (supplied.length > 500 || forbiddenControls.test(supplied))) throw fail('FACEBOOK_DAILY_HASHTAGS_INVALID')
  const tags = typeof supplied === 'string' ? supplied.trim().split(/\s+/u).filter(Boolean) : supplied || []
  if (tags.length > FACEBOOK_DAILY_HASHTAG_LIMIT || tags.some(tag => typeof tag !== 'string' || !/^#[\p{L}\p{M}\p{N}_]+$/u.test(tag))) {
    throw fail('FACEBOOK_DAILY_HASHTAGS_INVALID')
  }
  const unique = [...new Set(tags)]
  if (unique.join(' ').length > 500) throw fail('FACEBOOK_DAILY_HASHTAGS_INVALID')
  if (unique.length) return unique.join(' ')
  const brand = name.normalize('NFC').replace(/[^\p{L}\p{M}\p{N}_]/gu, '')
  return brand ? `#${brand}` : ''
}

const intros = [
  name => `A closer look at ${name}.`,
  name => `Take a moment to explore ${name}.`,
  name => `Here's a look at ${name}.`,
  name => `Get to know ${name}.`,
  name => `Considering ${name}? Start with its current listing.`,
  name => `Explore the details of ${name}.`,
  name => `A quick introduction to ${name}.`,
]
export const FACEBOOK_DAILY_TEMPLATE_COUNT = intros.length

export function buildFacebookDailyContent(snapshot) {
  validateFacebookDailySnapshot(snapshot)
  const source = resolveSource(snapshot.product)
  const name = assertPlainCopy(snapshot.product.name, 120).trim()
  const profile = resolveDailyAppCopyProfile(snapshot.product, source)
  const index = dailyAppCopyAngleIndex(source.app_id, snapshot.scheduled_day, intros.length)
  const asset = snapshot.asset || null
  const fallback = !asset && profile ? profile.facebook_fallback : null
  const hashtags = hashtagsFor(asset || fallback, name)
  // A vetted caption speaks for itself, without an unrelated rotating intro.
  const paragraphs = profile ? [] : [intros[index](name)]
  const caption = asset?.caption || fallback?.caption || ''
  if (caption) paragraphs.push(caption) // Reviewed asset text is intentionally verbatim, never translated.
  const reviewedCta = source.app_id === '6804450872' ? `Conheça ${name} na App Store:` :
    source.app_id === '6816477432' ? `גלו את ${name} ב-App Store:` : `Explore ${name} on the App Store:`
  paragraphs.push(...dailyAppUnduplicatedQualifiers(dailyAppThemeQualifiers(snapshot.product, 'facebook', profile), caption),
    profile ? `${reviewedCta}\n${source.app_store_url}` :
      `View the current App Store listing for features, requirements, pricing, and limitations:\n${source.app_store_url}`)
  const body = paragraphs.join('\n\n')
  if (body.length > FACEBOOK_DAILY_CONTENT_LIMIT || body.split(source.app_store_url).length !== 2) throw fail('FACEBOOK_DAILY_CONTENT_UNSAFE')
  return {
    body, hashtags, app_store_url:source.app_store_url,
    asset_id:asset?.id || null, image_id:asset?.id || null, image_path:asset?.file_path || null,
    image_missing:!asset, status:'draft', content_source:asset ? 'reviewed_asset_caption' : 'app_store_fallback',
  }
}
export const buildDailyFacebookDraftContent = buildFacebookDailyContent
export const generateFacebookDailyContent = buildFacebookDailyContent
