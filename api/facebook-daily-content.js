import crypto from 'node:crypto'
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
const forbiddenControls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/u
// The only link belongs to the final validated App Store CTA. Reject links,
// encoded links, HTML/Markdown links, handles and protocol/host impersonation
// rather than silently editing the pre-reviewed caption into different copy.
const hasLinkOrMarkup = value => /(?:[\p{L}\d+.-]+:\/\/|\b(?:https?|javascript|data|mailto|tel)\s*:|www[.\uff0e]|(?:[\p{L}\d-]+[.\uff0e])+(?:[\p{L}]{2,63}|\d{1,3})(?=[\s/:?#]|$)|%[0-9a-f]{2}|[<>@\\]|\[[^\]]*\]\s*\(|!\[)/iu.test(value)
// Portuguese cure inflections are bounded word forms, not the shared prefix in
// English "curated"/"curation". Actual cure and guarantee claims remain blocked.
const unsafeClaimsOrInstructions = /\b(?:ignore\s+(?:(?:all|any|the|previous|prior)\s+)*(?:instructions?|rules?|prompts?)|(?:system|developer)\s+(?:prompt|message)|follow\s+(?:these|my)\s+instructions|override\s+(?:the\s+)?(?:rules?|policy)|do\s+not\s+(?:include|mention|add)\s+(?:the\s+)?(?:disclaimer|qualifier|limitations?)|guarantee\w*|guaranteed\s+results?|risk[- ]free|cure\w*|diagnos\w*|win\s+(?:every\s+)?(?:case|cases)|get\s+rich|lose\s+\d+|(?:100%|completely)\s+safe|no\s+risks?|(?:free|gr[aá]tis)\s+(?:trial|download|app|teste)|(?:buy|purchase|subscribe|pay|join|sign\s+up|register|message|dm|email|click)\s+(?:now|today|here|us|me)|(?:limited[- ]time|discount|promo\s+code|coupon)|(?:garantid\w*|garante\w*|cura(?:s|m|mos|is|r(?:ei|ás?|emos|eis|ão|am|ia(?:s|m)?|íamos|íeis|es|mos|des|em)?|ndo|d[oa]s?|va(?:s|m)?|stes?|sse(?:s|m)?|tiv[oa]s?)?|diagn[oó]stic\w*|sem\s+risco\w*|resultados\s+garantid\w*|compre\s+agora|assine\s+agora|envie\s+(?:uma\s+)?mensagem|ignore\s+(?:as\s+)?instru[cç][oõ]es))\b/iu
const unsupportedPromotion = /\b(?:(?:download|install|get\s+it|try\s+it)\s+(?:now|today|here|free|for\s+free)|(?:baixe|instale|experimente)\s+(?:agora|hoje|gr[aá]tis)|(?:use|enter|apply)\s+(?:the\s+)?(?:code|coupon)|(?:100\s*%\s*free|totally\s+free|completely\s+free)|(?:earn|make|save)\s+(?:\$|\d+\s*(?:dollars?|reais|%))|(?:double|triple)\s+(?:your\s+)?(?:money|returns)|(?:win|guarantee)\s+(?:all|any)\s+cases|(?:guaranteed|certain)\s+(?:profit|income)|(?:prevents?|eliminates?)\s+(?:all\s+)?(?:injur\w*|accidents?|disease\w*))\b/iu

function claimScanCopy(value, appId) {
  // Mask only bounded explicit negative qualifiers for the claim scan, never
  // the stored caption or a whole sentence. An affirmative claim after a safe
  // disclaimer must still be rejected; URLs/instructions are scanned unmasked.
  const copy = value
    .replace(/\b(no\s+)free\s+trial\b/giu, '$1 precaution ')
    .replace(/\b((?:not|never|isn['’]t|aren['’]t|is\s+not|are\s+not)\s+(?:(?:(?:a|an)\s+)?(?:parental\s+control|monitoring(?:\s+tool)?|employer['’]s\s+assessment|(?:health|medical)\s+assessment|issuer-verified\s+proof|confirmation\s+of\s+license\s+standing)(?:,\s*(?:or\s+)?|\s+or\s+)){1,3}(?:(?:a|an|any)\s+)?)guarantees?\b/giu, '$1 precaution ')
    .replace(/\b(no\s+)guarantees?\b/giu, '$1 precaution ')
    .replace(/\b((?:not|never|(?:does|do)\s+not\s+provide|(?:doesn|don)['’]t\s+provide)\s+(?:a\s+(?:health|medical)\s+assessment(?:,\s*|\s+or\s+))?medical\s+advice,\s+)diagnosis(?=,\s+(?:or\s+)?treatment\b)/giu, '$1 precaution ')
    .replace(/\b(without\s+(?:algorithmic\s+)?)diagnosis\b/giu, '$1 precaution ')
    .replace(/\b(without\s+treating\s+an\s+idea\s+as\s+a\s+)guaranteed(?=\s+outcome\b)/giu, '$1 precaution ')
    .replace(/\b(?:not|never|isn't|isn’t)\s+(?:(?:a|an|any)\s+)?(?:(?:confirmed|mechanical|medical|clinical|professional)\s+){0,3}(?:diagnos\w*|cure\w*)\b/giu, ' precaution ')
    .replace(/\bno\s+(?:(?:health|medical|financial|safety|repair|fitness|accuracy|legal)\s+){0,3}(?:outcomes?|results?|returns?|profits?)\s+(?:(?:are|is|will\s+be|can\s+be)\s+)?guaranteed\b/giu, ' precaution ')
    .replace(/\b(?:not|never)\s+guaranteed\b/giu, ' precaution ')
    .replace(/\b(?:not|never|isn['’]t)\s+(?:(?:a|an|any)\s+)?guarantees?\b/giu, ' precaution ')
    .replace(/\b(?:cannot|can['’]t|does\s+not|doesn['’]t|do\s+not|don['’]t|will\s+not|won['’]t)\s+(?:provide\s+(?:(?:a|an)\s+)?)?(?:(?:confirmed|mechanical|medical|clinical|professional)\s+){0,3}(?:guarantee\w*|diagnos\w*|cure\w*)\b/giu, ' precaution ')
    .replace(/\b(?:n[aã]o\s+[eé]\s+(?:um\s+)?(?:diagn[oó]stic\w*|cura\w*)|sem\s+diagn[oó]stic\w*|n[aã]o\s+garantid\w*|n[aã]o\s+garante\w*|(?:resultados?|retornos?)\s+n[aã]o\s+s[aã]o\s+garantid\w*)\b/giu, ' precaution ')
  // These saved-listing features are not human-health claims or sale urgency.
  // Scope comes only from the authority/ID resolver, not a name or raw fact.
  // Mask the feature token only; unrelated diagnoses, cures and offers remain.
  if (appId === '6779000255' && /\bAI-assisted\s+lawn\s+diagnoses\b/iu.test(value)) {
    return copy
      .replace(/\b(AI-assisted\s+lawn\s+)diagnoses\b/giu, '$1 feature ')
      .replace(/\b(AI-assisted\s+)diagnoses(?=\s+require\s+LawnSignal\s+Pro\b)/giu, '$1 feature ')
      .replace(/\b((?:keep|save)\s+(?:your\s+)?(?:lawn\s+)?)diagnosis(?=\s+history\b)/giu, '$1 feature ')
      .replace(/\b(past\s+)diagnoses(?=\s+as\s+you\s+consider\s+practical\s+next\s+steps\s+for\s+visible\s+lawn\s+problems\b)/giu, '$1 feature ')
      .replace(/\b(does\s+not\s+make\s+AI\s+)diagnoses(?=\s+free\b)/giu, '$1 feature ')
      .replace(/\b(does\s+not\s+include\s+Pro\s+)diagnoses\b/giu, '$1 feature ')
  }
  if (appId === '6816541818') return copy.replace(/\b(Optional\s+)diagnostics(?=\s+(?:are\s+your\s+choice\s+in\s+CivicGlow|stay\s+off\s+until\s+you\s+consent)\b)/giu, '$1 feature ')
  if (appId === '6763152727' && /\bprivate\s+QR\s+presentation\s+that\s+lasts\s+one\s+hour\b/iu.test(value)) {
    return copy.replace(/\b(share\s+them\s+for\s+a\s+)limited\s+time\b/giu, '$1 feature ')
  }
  return copy
}

function assertPlainCopy(value, max, { multiline = false, appId = '' } = {}) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || forbiddenControls.test(value) ||
      (!multiline && /[\r\n\t]/.test(value)) || hasLinkOrMarkup(value) || unsafeClaimsOrInstructions.test(claimScanCopy(value, appId)) || unsupportedPromotion.test(value)) {
    throw fail('FACEBOOK_DAILY_CONTENT_UNSAFE')
  }
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

function qualifiers(product) {
  const facts = product.source_facts
  // Only official saved listing fields inform topic precautions; arbitrary product
  // descriptions, prompts, audiences, and imported research are never copied.
  const context = [product.name, facts.storeMetadata?.trackName, facts.storeMetadata?.primaryGenreName,
    facts.storeMetadata?.description, facts.appStoreListing?.description].filter(value => typeof value === 'string').join(' ').slice(0, 40000)
  const named = product.name.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()
  const result = []
  if (named.includes('citationshield')) result.push('Extraction only. Verify sources. Not legal advice.')
  else if (named.includes('matterprep') || /legal|lawyer|attorney|\blaw\b|court|jur[ií]dic|advog/i.test(context)) result.push('Legal information only. Not legal advice.')
  if (named.includes('autowizard')) result.push('Vehicle information only. Follow manufacturer guidance and consult a qualified professional. No safety or repair outcomes are guaranteed.')
  if (named.includes('gymguard')) result.push('Fitness information only. Follow safe exercise practices and qualified guidance. No safety or fitness outcomes are guaranteed.')
  if (named.includes('tagsnap')) result.push('Identification information only. Verify results and follow applicable safety guidance. No accuracy or safety outcomes are guaranteed.')
  if (named.includes('pratofit')) result.push('Nutrition estimates only. Not medical advice.')
  else if (/health|wellness|medical|medicine|diagnos|diagn[oó]stic|treat|fitness|nutrition|diet|weight|mental|therapy|sa[uú]de|nutri[cç]|alimenta[cç]/i.test(context)) result.push('Health and wellness information only. Not medical advice, diagnosis, or treatment. No health outcomes are promised.')
  if (/financ|invest|trading|stocks?|crypto|banking|money|budget|income|loan|credit|\btax\b/i.test(context)) result.push('Financial information only. Not financial or investment advice. No financial outcomes are promised.')
  return result
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
  const dayIndex = Math.floor(Date.parse(`${snapshot.scheduled_day}T00:00:00Z`) / 86400000)
  const seed = crypto.createHash('sha256').update(source.app_id).digest().readUInt32BE(0)
  const index = ((seed + dayIndex) % intros.length + intros.length) % intros.length
  const asset = snapshot.asset || null
  const hashtags = hashtagsFor(asset, name)
  const paragraphs = [intros[index](name)]
  if (asset) paragraphs.push(asset.caption) // Intentionally verbatim, not translated or inferred from an image filename.
  paragraphs.push(...qualifiers(snapshot.product),
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
