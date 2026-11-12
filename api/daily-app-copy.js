import crypto from 'node:crypto'
import { DAILY_APP_COPY_PROFILES } from './daily-app-copy-profiles.js'

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const canonicalId = value => typeof value === 'string' && /^[1-9]\d{0,19}$/.test(value)
const normalize = value => value.normalize('NFC').trim().replace(/\s+/gu, ' ')
const normalizedName = value => normalize(value).toLowerCase()
export const DAILY_APP_COPY_FORBIDDEN_CONTROLS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/u
const hasLinkOrMarkup = value => /(?:[\p{L}\d+.-]+:\/\/|\b(?:https?|javascript|data|mailto|tel)\s*:|www[.\uff0e]|(?:[\p{L}\d-]+[.\uff0e])+(?:[\p{L}]{2,63}|\d{1,3})(?=[\s/:?#]|$)|%[0-9a-f]{2}|[<>@\\]|\[[^\]]*\]\s*\(|!\[)/iu.test(value)
// These are the existing reviewed-caption restrictions. Negative masks remain
// bounded; a subsequent affirmative claim, instruction, offer or URL still fails.
const unsafeClaimsOrInstructions = /\b(?:ignore\s+(?:(?:all|any|the|previous|prior)\s+)*(?:instructions?|rules?|prompts?)|(?:system|developer)\s+(?:prompt|message)|follow\s+(?:these|my)\s+instructions|override\s+(?:the\s+)?(?:rules?|policy)|do\s+not\s+(?:include|mention|add)\s+(?:the\s+)?(?:disclaimer|qualifier|limitations?)|guarantee\w*|guaranteed\s+results?|risk[- ]free|cure\w*|diagnos\w*|win\s+(?:every\s+)?(?:case|cases)|get\s+rich|lose\s+\d+|(?:100%|completely)\s+safe|no\s+risks?|(?:free|gr[aá]tis)\s+(?:trial|download|app|teste)|(?:buy|purchase|subscribe|pay|join|sign\s+up|register|message|dm|email|click)\s+(?:now|today|here|us|me)|(?:limited[- ]time|discount|promo\s+code|coupon)|(?:garantid\w*|garante\w*|cura(?:s|m|mos|is|r(?:ei|ás?|emos|eis|ão|am|ia(?:s|m)?|íamos|íeis|es|mos|des|em)?|ndo|d[oa]s?|va(?:s|m)?|stes?|sse(?:s|m)?|tiv[oa]s?)?|diagn[oó]stic\w*|sem\s+risco\w*|resultados\s+garantid\w*|compre\s+agora|assine\s+agora|envie\s+(?:uma\s+)?mensagem|ignore\s+(?:as\s+)?instru[cç][oõ]es))\b/iu
const unsupportedPromotion = /\b(?:(?:download|install|get\s+it|try\s+it)\s+(?:now|today|here|free|for\s+free)|(?:baixe|instale|experimente)\s+(?:agora|hoje|gr[aá]tis)|(?:use|enter|apply)\s+(?:the\s+)?(?:code|coupon)|(?:100\s*%\s*free|totally\s+free|completely\s+free)|(?:earn|make|save)\s+(?:\$|\d+\s*(?:dollars?|reais|%))|(?:double|triple)\s+(?:your\s+)?(?:money|returns)|(?:win|guarantee)\s+(?:all|any)\s+cases|(?:guaranteed|certain)\s+(?:profit|income)|(?:prevents?|eliminates?)\s+(?:all\s+)?(?:injur\w*|accidents?|disease\w*))\b/iu

function claimScanCopy(value, appId) {
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

export function isSafeDailyAppCopyText(value, max, { multiline = false, appId = '' } = {}) {
  return typeof value === 'string' && !!value.trim() && value.length <= max &&
    !DAILY_APP_COPY_FORBIDDEN_CONTROLS.test(value) && (multiline || !/[\r\n\t]/u.test(value)) &&
    !hasLinkOrMarkup(value) && !unsafeClaimsOrInstructions.test(claimScanCopy(value, appId)) && !unsupportedPromotion.test(value)
}
const plain = (value, max, multiline = false) => typeof value === 'string' && !!value.trim() && value.length <= max &&
  !DAILY_APP_COPY_FORBIDDEN_CONTROLS.test(value) && (multiline || !/[\r\n\t]/u.test(value)) && !hasLinkOrMarkup(value)

// Authoritative description selection and fingerprinting deliberately do NOT
// lowercase or NFC-normalize the listing. This matches the reviewed registry.
export function dailyAppListingDescription(product) {
  for (const value of [product?.source_facts?.storeMetadata?.description, product?.source_facts?.appStoreListing?.description]) {
    if (typeof value === 'string' && value.trim()) return value.slice(0, 12000)
  }
  return ''
}
export function dailyAppListingFingerprint(product) {
  const description = dailyAppListingDescription(product).trim().replace(/\s+/gu, ' ')
  return description ? crypto.createHash('sha256').update(description, 'utf8').digest('hex') : ''
}
function profileSourceUrl(value, id) {
  if (typeof value !== 'string' || value.length > 2000 || /[\s\u0000-\u001f\u007f\\]/u.test(value)) return false
  const match = /^https:\/\/apps\.apple\.com\/(?:[a-z]{2}\/)?app\/(?:[a-zA-Z0-9._~%+-]+\/)?id([1-9]\d{0,19})\/?$/.exec(value)
  if (!match || match[1] !== id) return false
  try {
    const decoded = decodeURIComponent(new URL(value).pathname)
    return !/[\u0000-\u001f\u007f\\?#@]/u.test(decoded) && decoded.split('/').length === new URL(value).pathname.split('/').length
  } catch { return false }
}
const textArray = (value, maxItems, maxLength, id) => Array.isArray(value) && value.length <= maxItems &&
  value.every(text => isSafeDailyAppCopyText(text, maxLength, { appId:id }))

// Callers must first use their existing identity/URL resolver; this helper never
// infers an Apple ID from a name, a URL, an audience, or another app's profile.
// An injectable registry keeps tests independent of production reviewed copy.
export function resolveDailyAppCopyProfile(product, source, profiles = DAILY_APP_COPY_PROFILES) {
  const id = source?.app_id
  if (!canonicalId(id) || !object(product) || !plain(product.name, 120) || !object(profiles) ||
      !Object.hasOwn(profiles, id)) return null
  const profile = profiles[id]
  if (!object(profile) || profile.apple_app_id !== id || !plain(profile.app_name, 120) ||
      normalizedName(profile.app_name) !== normalizedName(product.name) || !plain(profile.theme, 100) ||
      typeof profile.listing_fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(profile.listing_fingerprint) ||
      profile.listing_fingerprint !== dailyAppListingFingerprint(product) || !profileSourceUrl(profile.source_url, id)) return null
  const description = dailyAppListingDescription(product).trim().replace(/\s+/gu, ' ')
  if (!Array.isArray(profile.email_angles) || profile.email_angles.length !== 12 ||
      !profile.email_angles.every(angle => object(angle) && isSafeDailyAppCopyText(angle.subject, 180, { appId:id }) &&
        Array.isArray(angle.paragraphs) && angle.paragraphs.length >= 2 && angle.paragraphs.length <= 3 &&
        angle.paragraphs.every(text => isSafeDailyAppCopyText(text, 1200, { appId:id })) &&
        Array.isArray(angle.evidence) && angle.evidence.length >= 1 && angle.evidence.length <= 3 &&
        angle.evidence.every(quote => plain(quote, 2000, true) && description.includes(quote.trim().replace(/\s+/gu, ' '))))) return null
  if (!textArray(profile.email_qualifiers, 6, 700, id) || !textArray(profile.facebook_qualifiers, 6, 700, id) ||
      !textArray(profile.facebook_qualifiers_native, 6, 700, id) || !object(profile.facebook_fallback) ||
      !isSafeDailyAppCopyText(profile.facebook_fallback.caption, 2500, { multiline:true, appId:id }) ||
      !Array.isArray(profile.facebook_fallback.hashtags) || profile.facebook_fallback.hashtags.length < 2 ||
      profile.facebook_fallback.hashtags.length > 4 || profile.facebook_fallback.hashtags.some(tag =>
        typeof tag !== 'string' || tag.length > 100 || !/^#[\p{L}\p{M}\p{N}_]+$/u.test(tag))) return null
  return profile
}

export function dailyAppCopyAngleIndex(appId, scheduledDay, count = 12) {
  const dayIndex = Math.floor(Date.parse(`${scheduledDay}T00:00:00Z`) / 86400000)
  const seed = crypto.createHash('sha256').update(appId).digest().readUInt32BE(0)
  return ((seed + dayIndex) % count + count) % count
}

// Fallbacks inspect ONLY a validated display title and an exact saved genre.
// Policy URLs, descriptions, negations, audiences and arbitrary product copy
// cannot turn a vehicle, scripture or self-directed adult app into a health,
// legal or child-targeted product. Token boundaries are Unicode-aware.
function fallbackTopics(product) {
  const title = typeof product?.name === 'string' ? normalizedName(product.name).replace(/[^\p{L}\p{N}]+/gu, ' ') : ''
  const has = tokens => title.split(' ').some(token => tokens.includes(token))
  const named = pattern => pattern.test(title)
  const genre = product?.source_facts?.storeMetadata?.primaryGenreName ?? product?.source_facts?.appStoreListing?.primaryGenreName
  const genres = typeof genre === 'string' ? normalizedName(genre) : ''
  const citation = named(/^citation ?shield(?: |$)/u)
  const vehicle = named(/^autowizard(?: |$)/u)
  const fitness = named(/^gymguard(?: |$)/u)
  const identification = named(/^tagsnap(?: |$)/u)
  const nutrition = named(/^pratofit(?: |$)/u)
  return {
    citation, vehicle, fitness, identification, nutrition,
    legal:citation || named(/^matterprep(?: |$)/u) || has(['legal', 'law', 'lawyer', 'attorney', 'court', 'jurídico', 'advogado']),
    health:nutrition || named(/^gutcheck(?: |$)/u) || has(['health', 'wellness', 'medical', 'medicine', 'fitness', 'nutrition', 'diet', 'mental', 'therapy', 'saúde', 'nutrição']) || ['medical', 'health & fitness', 'health and fitness'].includes(genres),
    financial:named(/^creditpath(?: |$)/u) || has(['finance', 'financial', 'invest', 'investing', 'investment', 'investments', 'trading', 'stock', 'stocks', 'crypto', 'banking', 'money', 'budget', 'income', 'loan', 'credit', 'tax']) || genres === 'finance',
    child:named(/^flickertales(?: |$)/u) || has(['child', 'children', 'kid', 'kids', 'toddler', 'toddlers', 'baby', 'babies', 'preschool', 'parent', 'parents', 'caregiver', 'pediatric', 'infantil']),
  }
}
export function dailyAppThemeQualifiers(product, channel = 'email', profile = null) {
  if (profile) {
    if (channel === 'email') return [...profile.email_qualifiers]
    return [...(profile.facebook_qualifiers_native.length ? profile.facebook_qualifiers_native : profile.facebook_qualifiers)]
  }
  const topics = fallbackTopics(product), result = []
  if (channel === 'email') {
    if (topics.legal) result.push('Legal information only, not legal advice or a substitute for a qualified lawyer.')
    if (topics.health) result.push('Health and wellness information only, not diagnosis, treatment, or a substitute for qualified medical care.')
    if (topics.financial) result.push('Financial information only, not financial or investment advice. No financial outcomes are promised.')
    if (topics.vehicle) result.push('Vehicle information only. Follow manufacturer guidance and consult a qualified professional. No safety or repair outcomes are guaranteed.')
    if (topics.child) result.push('For parents and caregivers, not children. Adults should review age suitability, permissions, pricing, and limitations. No purchase pressure is directed at children and no developmental outcomes are promised.')
    else result.push('For consenting adults reviewing app options; this draft does not establish permission to contact anyone.')
  } else {
    if (topics.citation) result.push('Extraction only. Verify sources. Not legal advice.')
    else if (topics.legal) result.push('Legal information only. Not legal advice.')
    if (topics.vehicle) result.push('Vehicle information only. Follow manufacturer guidance and consult a qualified professional. No safety or repair outcomes are guaranteed.')
    if (topics.fitness) result.push('Fitness information only. Follow safe exercise practices and qualified guidance. No safety or fitness outcomes are guaranteed.')
    if (topics.identification) result.push('Identification information only. Verify results and follow applicable safety guidance. No accuracy or safety outcomes are guaranteed.')
    if (topics.nutrition) result.push('Nutrition estimates only. Not medical advice.')
    else if (topics.health) result.push('Health and wellness information only. Not medical advice, diagnosis, or treatment. No health outcomes are promised.')
    if (topics.financial) result.push('Financial information only. Not financial or investment advice. No financial outcomes are promised.')
    if (topics.child) result.push('For parents and caregivers, not children. Adults should review age suitability, permissions, pricing, and limitations. No purchase pressure is directed at children and no developmental outcomes are promised.')
  }
  return result
}

// Remove only complete, already-present precaution sentences, not arbitrary
// matching words. Protections absent from the caption are always retained.
export function dailyAppUnduplicatedQualifiers(qualifiers, caption = '') {
  const sentences = value => value.split(/(?<=[.!?])\s+/u).map(part => normalize(part).toLowerCase()).filter(Boolean)
  const present = new Set(sentences(caption))
  return qualifiers.map(qualifier => qualifier.split(/(?<=[.!?])\s+/u)
    .filter(sentence => !present.has(normalize(sentence).toLowerCase())).join(' ')).filter(Boolean)
}
