import { emailRpc, safeEmailSecretEqual } from './email-core.js'
import { buildDailyEmailCampaignContent, EMAIL_DAILY_CAMPAIGN_BLOCKER_CODES } from './email-daily-campaign-content.js'

export const config = { maxDuration:120 }
export const EMAIL_DAILY_CAMPAIGN_BATCH_LIMIT = 25
export const EMAIL_DAILY_CAMPAIGN_SAVE_CONCURRENCY = 5
export const EMAIL_DAILY_CAMPAIGN_DEADLINE_MS = 110000
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const contentBlockers = new Set(EMAIL_DAILY_CAMPAIGN_BLOCKER_CODES)
export const EMAIL_DAILY_CAMPAIGN_SAVE_BLOCKER_CODES = Object.freeze([
  'EMAIL_DAILY_CAMPAIGN_SETTINGS_STALE', 'EMAIL_DAILY_CAMPAIGN_APP_UNAVAILABLE',
  'EMAIL_DAILY_CAMPAIGN_NOT_DUE', 'EMAIL_DAILY_CAMPAIGN_APP_STORE_INVALID',
  'EMAIL_DAILY_CAMPAIGN_CONTENT_INVALID',
])
const saveBlockers = new Set(EMAIL_DAILY_CAMPAIGN_SAVE_BLOCKER_CODES)
const emptyStats = () => ({ disabled:false, due:0, created:0, skipped:0, blocked:0, failed:0, blockers:{} })
function block(stats, code) {
  stats.blocked += 1
  stats.blockers[code] = (stats.blockers[code] || 0) + 1
}

// Server-side test seams only. HTTP query/body cannot change limits, scopes,
// content generation, RPC names, or deployment gates. No credential/provider
// lookup, recipients, queue, approval or message delivery exists in this worker.
export async function runEmailDailyCampaignBatch({ rpc = emailRpc, now = Date.now } = {}) {
  const stats = emptyStats()
  if (process.env.EMAIL_DAILY_CAMPAIGN_CRON_ENABLED !== 'true') return { statusCode:200, body:{ ...stats, disabled:true } }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { statusCode:503, body:{ ...stats, code:'EMAIL_STORAGE_NOT_CONFIGURED' } }
  const deadline = now() + EMAIL_DAILY_CAMPAIGN_DEADLINE_MS
  let due
  try {
    due = await rpc('email_due_daily_campaigns', { p_limit:EMAIL_DAILY_CAMPAIGN_BATCH_LIMIT })
  } catch {
    return { statusCode:503, body:{ ...stats, code:'EMAIL_DAILY_CAMPAIGN_STORAGE_ERROR' } }
  }
  // A malformed or over-limit response fails closed instead of selecting an
  // arbitrary subset or allowing extra persistence calls.
  if (!Array.isArray(due) || due.length > EMAIL_DAILY_CAMPAIGN_BATCH_LIMIT) {
    return { statusCode:503, body:{ ...stats, code:'EMAIL_DAILY_CAMPAIGN_INVALID_RESPONSE' } }
  }
  stats.due = due.length
  const seen = new Set()
  const jobs = []
  for (const snapshot of due) {
    let content
    try {
      content = buildDailyEmailCampaignContent(snapshot)
    } catch (error) {
      block(stats, contentBlockers.has(error?.code) ? error.code : 'EMAIL_DAILY_CAMPAIGN_INVALID_SNAPSHOT')
      continue
    }
    const key = JSON.stringify([snapshot.workspace_id, snapshot.product_id, snapshot.scheduled_day])
    if (seen.has(key)) { stats.skipped += 1; continue }
    seen.add(key)
    jobs.push({ snapshot, content })
  }
  for (let offset = 0; offset < jobs.length; offset += EMAIL_DAILY_CAMPAIGN_SAVE_CONCURRENCY) {
    await Promise.all(jobs.slice(offset, offset + EMAIL_DAILY_CAMPAIGN_SAVE_CONCURRENCY).map(async ({ snapshot, content }) => {
      if (now() >= deadline) { block(stats, 'EMAIL_DAILY_CAMPAIGN_DEADLINE_EXCEEDED'); return }
      try {
        // Exactly one attempt per unique valid snapshot. Revision/scope/day are
        // copied from the protected DB snapshot, never reconstructed or retried.
        const ack = await rpc('email_save_daily_campaign', {
          p_workspace_id:snapshot.workspace_id, p_product_id:snapshot.product_id,
          p_scheduled_day:snapshot.scheduled_day, p_settings_revision:snapshot.settings_revision,
          p_name:content.name, p_subject:content.subject, p_body:content.body,
          p_app_store_url:content.app_store_url,
        })
        if (!object(ack) || typeof ack.created !== 'boolean' || typeof ack.code !== 'string') { stats.failed += 1; return }
        // Never expose acknowledgement details, app IDs, names, content, or raw
        // storage errors. False acknowledgements include idempotent duplicates
        // and settings/scope changes revalidated atomically by the save RPC.
        if (ack.created === true && ack.code === 'EMAIL_DAILY_CAMPAIGN_CREATED') stats.created += 1
        else if (ack.created === false && ack.code === 'EMAIL_DAILY_CAMPAIGN_EXISTS') stats.skipped += 1
        else if (ack.created === false && saveBlockers.has(ack.code)) block(stats, ack.code)
        else stats.failed += 1
      } catch {
        // An ambiguous save may have committed. Never repeat it in this run.
        stats.failed += 1
      }
    }))
  }
  return { statusCode:200, body:stats }
}

export function createEmailDailyCampaignCronHandler(dependencies = {}) {
  return async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      return res.status(405).json({ code:'METHOD_NOT_ALLOWED' })
    }
    if (!process.env.CRON_SECRET || typeof req.headers?.authorization !== 'string' ||
        !safeEmailSecretEqual(req.headers.authorization, `Bearer ${process.env.CRON_SECRET}`)) {
      return res.status(401).json({ code:'AUTH_REQUIRED' })
    }
    try {
      const result = await runEmailDailyCampaignBatch(dependencies)
      return res.status(result.statusCode).json(result.body)
    } catch {
      return res.status(503).json({ code:'EMAIL_DAILY_CAMPAIGN_ERROR' })
    }
  }
}
export default createEmailDailyCampaignCronHandler()
