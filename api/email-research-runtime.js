import crypto from 'node:crypto'
import { emailRpc, normalizeEmail } from './email-core.js'
import { decryptProviderKey } from './provider-key-vault.js'
import { researchEmailCandidates, safeBusinessUrl, normalizeResearchExclusions } from './email-source-research.js'

export const EMAIL_RESEARCH_DEADLINE_MS = 170000
export const EMAIL_RESEARCH_MAX_TOOL_CALLS = 3
export const EMAIL_RESEARCH_MAX_DAILY_BATCHES = 10
export const EMAIL_RESEARCH_ERROR_CODES = Object.freeze([
  'EMAIL_RESEARCH_PROVIDER_FAILED', 'EMAIL_RESEARCH_PROVIDER_UNAVAILABLE',
  'EMAIL_RESEARCH_CREDENTIAL_UNAVAILABLE', 'EMAIL_RESEARCH_INVALID_RESPONSE',
])
const internalErrorCodes = [
  'EMAIL_RESEARCH_KEY_REQUIRED', 'EMAIL_RESEARCH_KEY_DECRYPTION_FAILED',
  'EMAIL_RESEARCH_MODEL_REQUIRED', 'EMAIL_RESEARCH_PROVIDER_ERROR',
  'EMAIL_RESEARCH_FORMAT_ERROR', 'EMAIL_RESEARCH_FACTS_REQUIRED',
  'EMAIL_RESEARCH_CLAIM_INVALID', 'EMAIL_RESEARCH_CLAIM_UNAVAILABLE',
  'EMAIL_RESEARCH_DEADLINE_EXCEEDED', 'EMAIL_RESEARCH_ERROR',
]
const errorCodes = new Set(internalErrorCodes)
const databaseErrorCode = code => {
  if (['EMAIL_RESEARCH_KEY_REQUIRED', 'EMAIL_RESEARCH_KEY_DECRYPTION_FAILED', 'EMAIL_RESEARCH_CLAIM_UNAVAILABLE'].includes(code)) return 'EMAIL_RESEARCH_CREDENTIAL_UNAVAILABLE'
  if (['EMAIL_RESEARCH_MODEL_REQUIRED', 'EMAIL_RESEARCH_FACTS_REQUIRED'].includes(code)) return 'EMAIL_RESEARCH_PROVIDER_UNAVAILABLE'
  if (['EMAIL_RESEARCH_FORMAT_ERROR', 'EMAIL_RESEARCH_CLAIM_INVALID'].includes(code)) return 'EMAIL_RESEARCH_INVALID_RESPONSE'
  return 'EMAIL_RESEARCH_PROVIDER_FAILED'
}
const fail = code => Object.assign(new Error('Research batch stopped safely.'), { code })
const clean = (value, limit = 500) => typeof value === 'string'
  ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit) : ''
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value)
const token = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,256}$/.test(value)
const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max
const single = value => {
  if (!Array.isArray(value)) return value
  if (value.length > 1) throw fail('EMAIL_RESEARCH_CLAIM_INVALID')
  return value[0] ?? null
}
const emptyStats = () => ({ disabled:false, claimed:0, completed:0, failed:0, blocked:0, providerRequests:0, discovered:0, inserted:0, skipped:0 })

// No permissive coercion, clamping, request override or fallback on bad config.
export function researchWorkspaceRequestLimit(value = process.env.EMAIL_RESEARCH_WORKSPACE_DAILY_REQUEST_LIMIT) {
  if (value === undefined) return 200
  if (typeof value !== 'string' || !/^[1-9]\d{0,2}$/.test(value) || Number(value) > 200) throw fail('EMAIL_RESEARCH_CONFIG_INVALID')
  return Number(value)
}

// These are search lenses, never assertions about an app's customers or market.
const geographicLenses = ['urban business centers', 'regional business hubs', 'rural business districts', 'coastal business hubs', 'inland business hubs', 'metropolitan business districts', 'small-town business centers', 'suburban business hubs']
const knownRegions = ['United States', 'United Kingdom', 'Canada', 'Australia', 'New Zealand', 'Ireland', 'India', 'Singapore', 'Germany', 'France', 'Spain', 'Italy', 'Japan', 'South Korea', 'Brazil', 'Mexico', 'South Africa', 'Nigeria', 'Kenya', 'London', 'New York', 'Toronto', 'Sydney', 'Berlin', 'Paris']
// Remove claim-bearing sentences rather than rewriting them into new claims.
function publicFact(value, limit = 1000) {
  return clean(value, 4000).split(/(?<=[.!?])\s+/)
    .filter(sentence => !/\b(guarantee\w*|risk[- ]free|cure\w*|diagnos\w*|treats?\b|medical advice|legal advice|financial advice|investment returns?|guaranteed income)\b/i.test(sentence))
    .join(' ').replace(/https?:\/\/\S+|[\w.!#$%&'*+/=?^`{|}~-]+@[\w.-]+\.[a-z]{2,}/gi, '').trim().slice(0, limit)
}
export function researchProductFacts(product) {
  const source = object(product?.source_facts) ? product.source_facts : {}
  const listing = object(source.storeMetadata) ? source.storeMetadata : object(source.store_metadata) ? source.store_metadata : {}
  const facts = {}
  for (const key of ['name', 'productName', 'title', 'category', 'description', 'audience', 'niche']) {
    const value = publicFact(product?.[key], key === 'description' ? 1000 : 240) || publicFact(listing[key], key === 'description' ? 1000 : 240) || publicFact(source[key], key === 'description' ? 1000 : 240)
    if (value) facts[key] = value
  }
  return facts
}
export function buildEmailResearchQuery(claim) {
  const facts = researchProductFacts(claim.product)
  const niches = ['audience', 'niche', 'category', 'description'].map(key => facts[key]).filter(Boolean)
  if (!niches.length) throw fail('EMAIL_RESEARCH_FACTS_REQUIRED')
  const seed = crypto.createHash('sha256').update(String(claim.scheduled_day)).digest().readUInt32BE(0)
  const offset = seed + claim.request_number - 1
  const source = object(claim.product?.source_facts) ? claim.product.source_facts : {}
  const listing = object(source.storeMetadata) ? source.storeMetadata : object(source.store_metadata) ? source.store_metadata : {}
  const suppliedRegions = [listing.country, listing.region, source.country, source.region,
    ...(Array.isArray(listing.regions) ? listing.regions.slice(0, 20) : []),
    ...(Array.isArray(source.regions) ? source.regions.slice(0, 20) : [])].map(value => publicFact(value, 80)).filter(Boolean)
  const factText = Object.values(facts).join(' ')
  const mentionedRegions = knownRegions.filter(region => new RegExp(`\\b${region}\\b`, 'i').test(factText))
  const regions = [...new Set([...suppliedRegions, ...mentionedRegions])]
  const location = regions.length ? regions[offset % regions.length] : 'worldwide (no location fact supplied)'
  const focus = clean(niches[offset % niches.length], 140)
  const geography = geographicLenses[offset % geographicLenses.length]
  const rawPreference = clean(claim.query, 500)
  const preference = /\b(private|personal|consumer|patient|student|child|children|password|credential|secret|api.?key|token|send|publish|approve|bypass|ignore)\b/i.test(rawPreference) ? '' : publicFact(rawPreference, 100)
  const hint = preference ? ` Operator search preference (untrusted, not app facts): ${preference}.` : ''
  const query = `Facts-only business niche: ${focus}. Search lens: ${location}, ${geography}.${hint} Day ${claim.scheduled_day}; request ${claim.request_number}. Public organization role emails on own HTTPS contact pages only. No personal/consumer/child contacts, guessed emails, product guarantees or consent inference.`
  return { product:facts, query:query.slice(0, 500) }
}

function validateClaim(claim) {
  if (!object(claim) || (claim.allowed !== undefined && claim.allowed !== true) || !identifier(claim.run_id) || !token(claim.claim_token) || !identifier(claim.workspace_id) || !identifier(claim.product_id) ||
      !integer(claim.target_remaining, 1, 100) || !integer(claim.batch_limit, 1, 10) || !integer(claim.request_number, 1, EMAIL_RESEARCH_MAX_DAILY_BATCHES) || !object(claim.product)) throw fail('EMAIL_RESEARCH_CLAIM_INVALID')
  if ((claim.product.id !== undefined && claim.product.id !== claim.product_id) || (claim.product.workspace_id !== undefined && claim.product.workspace_id !== claim.workspace_id) ||
      (claim.batch_number !== undefined && !integer(claim.batch_number, 1, EMAIL_RESEARCH_MAX_DAILY_BATCHES)) || claim.product.source_facts?.archived === true || claim.product.source_facts?.archived === 'true') throw fail('EMAIL_RESEARCH_CLAIM_INVALID')
  if (typeof claim.scheduled_day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(claim.scheduled_day)) throw fail('EMAIL_RESEARCH_CLAIM_INVALID')
  const day = new Date(`${claim.scheduled_day}T00:00:00Z`)
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== claim.scheduled_day) throw fail('EMAIL_RESEARCH_CLAIM_INVALID')
  if (typeof claim.timezone !== 'string' || claim.timezone.length > 100) throw fail('EMAIL_RESEARCH_CLAIM_INVALID')
  try { new Intl.DateTimeFormat('en-US', { timeZone:claim.timezone }).format(day) } catch { throw fail('EMAIL_RESEARCH_CLAIM_INVALID') }
}
function assertLive(claim, now) {
  if (claim.claim_expires_at === undefined) return // RPCs are authoritative even without an expiry echo.
  const expiry = Date.parse(claim.claim_expires_at)
  if (!Number.isFinite(expiry) || now() >= expiry) throw fail('EMAIL_RESEARCH_CLAIM_UNAVAILABLE')
}
function encryptedEnvelope(value) {
  if (!object(value) || value.version !== 1 || value.algorithm !== 'aes-256-gcm') return false
  for (const [field, bytes] of [['iv', 12], ['tag', 16], ['ciphertext', null]]) {
    const text = value[field]
    if (typeof text !== 'string' || !text.length || text.length > 8192 || !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) return false
    const decoded = Buffer.from(text, 'base64')
    if (decoded.toString('base64') !== text || (bytes && decoded.length !== bytes) || (!bytes && (!decoded.length || decoded.length > 4096))) return false
  }
  return true
}
async function claimedWorkspaceKey(claim, now) {
  const row = single(await emailRpc('get_email_research_credential', { p_run_id:claim.run_id, p_claim_token:claim.claim_token }))
  if (!object(row) || row.allowed === false || row.enabled === false || row.admin_valid === false) throw fail('EMAIL_RESEARCH_CLAIM_UNAVAILABLE')
  // The production RPC accepts only run/token and derives workspace scope from
  // that live claim. Optional scope echoes must match; never query a global vault.
  if ((row.workspace_id !== undefined && row.workspace_id !== claim.workspace_id) || (row.run_id !== undefined && row.run_id !== claim.run_id) ||
      (row.claim_token !== undefined && row.claim_token !== claim.claim_token) || (row.product_id !== undefined && row.product_id !== claim.product_id)) throw fail('EMAIL_RESEARCH_CLAIM_INVALID')
  assertLive(claim, now)
  assertLive(row, now)
  if (row.encrypted_api_key === undefined || row.encrypted_api_key === null) throw fail('EMAIL_RESEARCH_KEY_REQUIRED')
  if (!encryptedEnvelope(row.encrypted_api_key)) throw fail('EMAIL_RESEARCH_KEY_DECRYPTION_FAILED')
  let apiKey
  try { apiKey = decryptProviderKey(row.encrypted_api_key) } catch { throw fail('EMAIL_RESEARCH_KEY_DECRYPTION_FAILED') }
  if (typeof apiKey !== 'string' || !apiKey.trim() || apiKey.length > 4096 || /[\u0000-\u0020\u007f]/.test(apiKey)) throw fail('EMAIL_RESEARCH_KEY_REQUIRED')
  return apiKey // Server-local only; never included in a result, log or database write.
}

const roles = /^(info|hello|contact|sales|support|office|admin|team|enquiries|inquiries|bookings|booking|service|services|business|partnerships|marketing|press|media|events|reservations)$/i
const consumerDomains = new Set(['gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'aol.com', 'icloud.com', 'me.com', 'mac.com', 'proton.me', 'protonmail.com', 'pm.me', 'mail.com', 'gmx.com', 'gmx.net', 'yandex.com', 'yandex.ru'])
// Only the helper's verified candidate fields survive. Never adopt supplied opt-in,
// draft, send, campaign, queue, suppression or provider-body fields.
function candidateRows(result, limit, exclusions = []) {
  if (!object(result) || !Array.isArray(result.candidates)) throw fail('EMAIL_RESEARCH_FORMAT_ERROR')
  const seen = new Set(exclusions), rows = []
  for (const row of result.candidates.slice(0, 10)) {
    if (!object(row) || rows.length >= limit) continue
    try {
      const email = normalizeEmail(row.email), [local, domain] = email.split('@')
      const source = safeBusinessUrl(row.source_url)
      const organization = clean(row.organization, 160), evidence = clean(row.source_evidence, 400)
      if (!roles.test(local) || consumerDomains.has(domain) || !organization || evidence.length < 10 || !evidence.toLowerCase().includes(email) ||
          !evidence.toLowerCase().includes(organization.toLowerCase()) || /\b(patient|minor|child|student|consumer)\b/i.test(evidence) || source.hostname.replace(/^www\./, '') !== domain || seen.has(email)) continue
      seen.add(email)
      // Both excerpts are the helper's actually observed text, not invented
      // marketing prose. The DB adds audit provenance and candidate-only status.
      rows.push({ email, organization, source_url:source.href, source_evidence:{
        kind:'public_business_role_email', business_domain:domain, role:local,
        email_excerpt:evidence, business_excerpt:evidence,
      } })
    } catch { /* Fail closed, without source or recipient details. */ }
  }
  return rows
}
async function boundedResearch(research, args, deadline, now) {
  // Leave a full 15-second RPC budget for terminal recording. The production
  // helper already bounds the provider at 45s and <=10 source pages at 8s each.
  const budget = Math.min(125000, deadline - now() - 15000)
  if (budget <= 0) throw fail('EMAIL_RESEARCH_DEADLINE_EXCEEDED')
  let timer
  try {
    return await Promise.race([
      Promise.resolve().then(() => research(args)),
      new Promise((_, reject) => { timer = setTimeout(() => reject(fail('EMAIL_RESEARCH_DEADLINE_EXCEEDED')), budget) }),
    ])
  } finally { clearTimeout(timer) }
}
function finishAck(payload, outcome, count) {
  const row = single(payload)
  if (!object(row) || !integer(row.verified_count, 0, count) || !integer(row.inserted_count, 0, row.verified_count) || !integer(row.skipped_count, 0, count)) throw fail('EMAIL_RESEARCH_STORAGE_ERROR')
  if (row.allowed === false && row.completed === false) {
    if (row.verified_count || row.inserted_count || row.skipped_count) throw fail('EMAIL_RESEARCH_STORAGE_ERROR')
    if (outcome === 'failed' && EMAIL_RESEARCH_ERROR_CODES.includes(row.code)) return row
    if (['EMAIL_RESEARCH_CLAIM_INVALID', 'EMAIL_RESEARCH_EXPIRED', 'EMAIL_RESEARCH_SETTINGS_STALE'].includes(row.code)) return null
    throw fail('EMAIL_RESEARCH_STORAGE_ERROR')
  }
  if (row.allowed !== true || row.completed !== true || outcome !== 'completed' || row.code !== 'EMAIL_RESEARCH_COMPLETED' || row.inserted_count + row.skipped_count !== count) throw fail('EMAIL_RESEARCH_STORAGE_ERROR')
  return row
}

// Dependency/clock injection is server-code-only for offline tests. No HTTP
// request selects credentials, settings, model, workspace, facts, limits or I/O.
export async function runEmailResearchBatch({ research = researchEmailCandidates, now = () => Date.now() } = {}) {
  const stats = emptyStats()
  if (process.env.EMAIL_RESEARCH_CRON_ENABLED !== 'true') return { statusCode:200, body:{ ...stats, disabled:true } }
  const deadline = now() + EMAIL_RESEARCH_DEADLINE_MS
  let workspaceLimit, claim
  try { workspaceLimit = researchWorkspaceRequestLimit() } catch { return { statusCode:503, body:{ ...stats, code:'EMAIL_RESEARCH_CONFIG_INVALID' } } }
  try {
    claim = single(await emailRpc('email_claim_research_batch', { p_workspace_limit:workspaceLimit }))
  } catch { return { statusCode:503, body:{ ...stats, code:'EMAIL_RESEARCH_STORAGE_ERROR' } } }
  if (!claim || (object(claim) && claim.no_job === true && !claim.run_id)) return { statusCode:200, body:stats }
  if (claim.allowed === false) return { statusCode:200, body:{ ...stats, blocked:1 } }
  // A malformed handle cannot be safely settled; never guess or acquire another.
  if (!identifier(claim.run_id) || !token(claim.claim_token)) return { statusCode:503, body:{ ...stats, code:'EMAIL_RESEARCH_CLAIM_INVALID' } }
  stats.claimed = 1
  let candidates = [], errorCode = null
  try {
    validateClaim(claim)
    assertLive(claim, now)
    const model = clean(process.env.OPENAI_EMAIL_RESEARCH_MODEL, 120)
    if (!model || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/.test(model)) throw fail('EMAIL_RESEARCH_MODEL_REQUIRED')
    const input = buildEmailResearchQuery(claim)
    const exclusions = normalizeResearchExclusions(claim.exclude_emails).filter(email => {
      const [role, domain] = email.split('@')
      return roles.test(role) && !consumerDomains.has(domain)
    })
    if (deadline - now() < 155000) throw fail('EMAIL_RESEARCH_DEADLINE_EXCEEDED')
    let apiKey = await claimedWorkspaceKey(claim, now)
    try {
      assertLive(claim, now)
      if (deadline - now() < 140000) throw fail('EMAIL_RESEARCH_DEADLINE_EXCEEDED')
      stats.providerRequests = 1
      const result = await boundedResearch(research, {
        apiKey, model, ...input, limit:Math.min(claim.batch_limit, claim.target_remaining, 10),
        maxToolCalls:EMAIL_RESEARCH_MAX_TOOL_CALLS,
        ...(exclusions.length ? { excludeEmails:exclusions } : {}),
      }, deadline, now)
      if (now() >= deadline - 15000) throw fail('EMAIL_RESEARCH_DEADLINE_EXCEEDED')
      candidates = candidateRows(result, Math.min(claim.batch_limit, claim.target_remaining, 10), exclusions)
    } finally { apiKey = null }
  } catch (error) { errorCode = errorCodes.has(error?.code) ? error.code : 'EMAIL_RESEARCH_ERROR'; candidates = [] }
  if (now() >= deadline) return { statusCode:503, body:{ ...stats, code:'EMAIL_RESEARCH_DEADLINE_EXCEEDED' } }
  try {
    // Exactly one terminal RPC attempt, including zero/refused/incomplete results.
    const ack = finishAck(await emailRpc('email_finish_research_batch', {
      p_run_id:claim.run_id, p_claim_token:claim.claim_token, p_candidates:candidates, p_error_code:errorCode ? databaseErrorCode(errorCode) : null,
    }), errorCode ? 'failed' : 'completed', candidates.length)
    if (!ack) return { statusCode:200, body:{ ...stats, blocked:1 } }
    if (errorCode) stats.failed = 1
    else { stats.completed = 1; stats.discovered = ack.verified_count; stats.inserted = ack.inserted_count; stats.skipped = ack.skipped_count }
    return { statusCode:200, body:stats }
  } catch { return { statusCode:503, body:{ ...stats, code:'EMAIL_RESEARCH_STORAGE_ERROR' } } }
}
