import { emailRpc, safeEmailSecretEqual } from './email-core.js'
import { buildFacebookDailyContent } from './facebook-daily-content.js'

export const config = { maxDuration:60 }
export const FACEBOOK_DAILY_BATCH_LIMIT = 25
export const FACEBOOK_DAILY_SAVE_CONCURRENCY = 5
// Shared emailRpc gives each request a 15-second timeout. Stop dispatching at
// 40 seconds so the last save can finish before the 60-second function ceiling.
export const FACEBOOK_DAILY_DEADLINE_MS = 40000
export const FACEBOOK_DAILY_SAVE_BLOCKER_CODES = Object.freeze([
  'FACEBOOK_DAILY_SETTINGS_STALE', 'FACEBOOK_DAILY_APP_UNAVAILABLE',
  'FACEBOOK_DAILY_NOT_DUE', 'FACEBOOK_DAILY_APP_STORE_INVALID',
  'FACEBOOK_DAILY_CONTENT_INVALID', 'FACEBOOK_DAILY_ASSET_INVALID',
  'FACEBOOK_DAILY_ASSET_STALE', 'FACEBOOK_DAILY_SCOPE_MISMATCH',
  'FACEBOOK_DAILY_IMAGE_INVALID', 'FACEBOOK_DAILY_APP_LIMIT_EXCEEDED',
])
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const counts = () => ({ created:0, exists:0, blocked:0, failed:0 })
const knownBlockedSuffixes = ['SETTINGS_STALE', 'APP_UNAVAILABLE', 'NOT_DUE', 'APP_STORE_INVALID',
  'CONTENT_INVALID', 'ASSET_INVALID', 'ASSET_STALE', 'SCOPE_MISMATCH', 'IMAGE_PATH_INVALID',
  'PRODUCT_UNAVAILABLE', 'IMAGE_INVALID', 'APP_LIMIT_EXCEEDED']
function acknowledgementBucket(ack) {
  if (!object(ack) || typeof ack.code !== 'string' || ack.code.length > 120 || !/^FACEBOOK_[A-Z0-9_]+$/.test(ack.code) ||
      (ack.created !== undefined && typeof ack.created !== 'boolean')) return 'failed'
  // Support the DB agent's namespaced codes without coupling to a particular
  // DAILY/DRAFT/DAILY_DRAFT spelling; reject contradictory boolean acknowledgements.
  if (ack.code.endsWith('_CREATED')) return ack.created === false ? 'failed' : 'created'
  if (ack.code.endsWith('_EXISTS')) return ack.created === true ? 'failed' : 'exists'
  if (ack.created !== true && knownBlockedSuffixes.some(suffix => ack.code.endsWith(`_${suffix}`))) return 'blocked'
  return 'failed'
}

// These dependencies are server-only test seams. Neither HTTP input nor saved
// asset text can select providers, change limits/scopes, publish, or send email.
export async function runFacebookDailyDraftBatch({ rpc = emailRpc, now = Date.now } = {}) {
  const stats = counts()
  if (process.env.FACEBOOK_DAILY_DRAFTS_CRON_ENABLED !== 'true') return { statusCode:200, body:stats }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return { statusCode:503, body:{ ...stats, failed:1 } }
  const start = now()
  if (!Number.isFinite(start)) return { statusCode:503, body:{ ...stats, failed:1 } }
  const deadline = start + FACEBOOK_DAILY_DEADLINE_MS
  let due
  try { due = await rpc('facebook_due_daily_drafts', { p_limit:FACEBOOK_DAILY_BATCH_LIMIT }) }
  catch { return { statusCode:503, body:{ ...stats, failed:1 } } }
  // Do not trim oversized results into apparently successful partial work.
  if (!Array.isArray(due) || due.length > FACEBOOK_DAILY_BATCH_LIMIT) return { statusCode:503, body:{ ...stats, failed:1 } }
  const seen = new Set()
  const jobs = []
  for (const snapshot of due) {
    let content
    try { content = buildFacebookDailyContent(snapshot) }
    catch { stats.blocked += 1; continue }
    const key = JSON.stringify([snapshot.workspace_id, snapshot.product_id, snapshot.scheduled_day])
    if (seen.has(key)) { stats.exists += 1; continue }
    seen.add(key)
    // Capture only the required primitives and generated content. Never retain
    // a caller-editable product/asset object across asynchronous saves.
    jobs.push({ workspace_id:snapshot.workspace_id, product_id:snapshot.product_id,
      scheduled_day:snapshot.scheduled_day, settings_revision:snapshot.settings_revision, content })
  }
  for (let offset = 0; offset < jobs.length; offset += FACEBOOK_DAILY_SAVE_CONCURRENCY) {
    await Promise.all(jobs.slice(offset, offset + FACEBOOK_DAILY_SAVE_CONCURRENCY).map(async job => {
      const clock = now()
      if (!Number.isFinite(clock) || clock >= deadline || clock < start) { stats.blocked += 1; return }
      const { content } = job
      try {
        // Exactly one save attempt. The DB must atomically revalidate enabled
        // settings/revision/day, canonical App Store product ID and approved
        // asset scope/path, and enforce one draft per workspace/product/day.
        const ack = await rpc('facebook_save_daily_draft', {
          p_workspace_id:job.workspace_id, p_product_id:job.product_id,
          p_scheduled_day:job.scheduled_day, p_settings_revision:job.settings_revision,
          p_body:content.body, p_hashtags:content.hashtags, p_app_store_url:content.app_store_url,
          p_asset_id:content.asset_id, p_image_path:content.image_path,
        })
        stats[acknowledgementBucket(ack)] += 1
      } catch {
        // A failed/ambiguous response may follow a committed save. Never retry
        // in this invocation; the next native tick relies on DB idempotency.
        stats.failed += 1
      }
    }))
  }
  return { statusCode:200, body:stats }
}
export const runFacebookDailyBatch = runFacebookDailyDraftBatch

export function createFacebookDailyCronHandler(dependencies = {}) {
  return async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST')
      return res.status(405).json(counts())
    }
    if (!process.env.CRON_SECRET?.trim() || typeof req.headers?.authorization !== 'string' ||
        !safeEmailSecretEqual(req.headers.authorization, `Bearer ${process.env.CRON_SECRET}`)) {
      return res.status(401).json(counts())
    }
    try {
      const result = await runFacebookDailyDraftBatch(dependencies)
      return res.status(result.statusCode).json(result.body)
    } catch { return res.status(503).json({ ...counts(), failed:1 }) }
  }
}
export const createFacebookDailyDraftCronHandler = createFacebookDailyCronHandler
export default createFacebookDailyCronHandler()
