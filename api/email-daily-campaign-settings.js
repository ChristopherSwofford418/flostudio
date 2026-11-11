import { emailDb, emailError, cleanEmailText } from './email-core.js'

export function dailyCampaignDeploymentStatus() {
  const enabled = process.env.EMAIL_DAILY_CAMPAIGN_CRON_ENABLED === 'true'
  const schedulerAuthorized = Boolean(process.env.CRON_SECRET)
  const storageConfigured = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  const blockers = []
  if (!enabled) blockers.push('Daily campaign draft creation is disabled in the server deployment.')
  if (!schedulerAuthorized || !storageConfigured) blockers.push('The protected daily draft scheduler and storage must be configured.')
  return { enabled, configured: enabled && schedulerAuthorized && storageConfigured, blockers, draftOnly: true, contentSource: 'listing_template', providerCalls: false, cadence: 'Every five minutes; one draft per app-local day, at or after the saved start hour.' }
}

export function dailyCampaignSettingsPayload(body = {}) {
  if (typeof body.enabled !== 'boolean') throw emailError('DAILY_CAMPAIGN_SETTINGS_INVALID', 'Choose whether daily campaign draft creation is enabled.')
  const hour = body.startHour
  if (!['number', 'string'].includes(typeof hour) || hour === '' || !Number.isInteger(Number(hour)) || Number(hour) < 0 || Number(hour) > 23) throw emailError('DAILY_CAMPAIGN_SETTINGS_INVALID', 'Choose a valid local start hour from 0 to 23.')
  if (typeof body.timezone !== 'string' || body.timezone.length > 100) throw emailError('DAILY_CAMPAIGN_SETTINGS_INVALID', 'Enter a valid IANA timezone.')
  const timezone = body.timezone.trim()
  try { if (!timezone) throw new Error(); new Intl.DateTimeFormat('en', { timeZone: timezone }).format(new Date()) }
  catch { throw emailError('DAILY_CAMPAIGN_SETTINGS_INVALID', 'Enter a valid IANA timezone.') }
  return { p_enabled: body.enabled, p_timezone: timezone, p_start_hour: Number(hour) }
}

function isDailyCampaignDay(value) {
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
}

export function dailyCampaignScheduledDay(value) {
  if (!isDailyCampaignDay(value)) throw emailError('DAILY_CAMPAIGN_DAY_INVALID', 'Choose a valid calendar date in YYYY-MM-DD format.')
  return value
}

const dailyCampaignColumns = ['workspace_id', 'product_id', 'id', 'name', 'scheduled_day', 'subject', 'body', 'app_store_url', 'status', 'content_source', 'created_at', 'updated_at']
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
function datedCampaignStatus(value, { workspaceId, productId, scheduledDay }) {
  const invalid = () => emailError('DAILY_CAMPAIGN_STATUS_INVALID', 'The saved campaign drafts could not be verified for the selected app and date. Refresh and try again.', 503)
  if (!object(value) || !object(value.settings) || value.settings.workspace_id !== workspaceId || value.settings.product_id !== productId || !object(value.today) || !isDailyCampaignDay(value.today.scheduled_day) || typeof value.today.created !== 'boolean' || !Array.isArray(value.campaigns) || value.campaigns.length > 1 || value.selectedDay !== scheduledDay || !object(value.selected) || value.selected.scheduled_day !== scheduledDay || value.selected.created !== (value.campaigns.length === 1)) throw invalid()
  const campaigns = value.campaigns.map(row => {
    if (!object(row) || row.workspace_id !== workspaceId || row.product_id !== productId || row.scheduled_day !== scheduledDay || typeof row.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(row.id) || ['name', 'subject', 'body', 'app_store_url', 'created_at', 'updated_at'].some(field => typeof row[field] !== 'string' || !row[field].trim()) || row.status !== 'draft' || row.content_source !== 'listing_template' || !Number.isFinite(Date.parse(row.created_at)) || !Number.isFinite(Date.parse(row.updated_at))) throw invalid()
    return Object.fromEntries(dailyCampaignColumns.map(field => [field, row[field]]))
  })
  return { settings: value.settings, campaigns, today: value.today, selectedDay: scheduledDay, selected: { scheduled_day: scheduledDay, created: campaigns.length === 1 } }
}

export async function getDailyCampaignStatus(args) {
  const { workspaceId, productId, accessToken } = args
  if (!Object.prototype.hasOwnProperty.call(args, 'scheduledDay')) return emailDb('rpc/get_email_daily_campaign_status', { method: 'POST', accessToken, body: { p_workspace_id: workspaceId, p_product_id: productId } })
  const scheduledDay = dailyCampaignScheduledDay(args.scheduledDay)
  // Date reads remain on the caller-JWT RPC boundary; private tables need no new grants.
  if (!accessToken) throw emailError('AUTH_REQUIRED', 'Sign in to view the saved campaign drafts.', 401)
  const value = await emailDb('rpc/get_email_daily_campaign_date_status', { method: 'POST', accessToken, body: { p_workspace_id: workspaceId, p_product_id: productId, p_scheduled_day: scheduledDay } })
  return datedCampaignStatus(value, { workspaceId, productId, scheduledDay })
}

export async function saveDailyCampaignSettings({ workspaceId, productId, accessToken, body }) {
  const payload = dailyCampaignSettingsPayload(body)
  return emailDb('rpc/save_email_daily_campaign_settings', { method: 'POST', accessToken, body: { p_workspace_id: workspaceId, p_product_id: productId, ...payload } })
}

export async function updateDailyCampaign({ workspaceId, productId, accessToken, body }) {
  if (typeof body.dailyCampaignId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.dailyCampaignId)) throw emailError('DAILY_CAMPAIGN_INVALID', 'Choose a saved campaign draft in the selected app.')
  if (typeof body.subject !== 'string' || typeof body.body !== 'string' || !body.subject.trim() || !body.body.trim() || body.subject.length > 180 || body.body.length > 6000 || /[\r\n]/.test(body.subject) || /^(?:re|fw|fwd)\s*:/i.test(body.subject.trim())) throw emailError('DAILY_CAMPAIGN_CONTENT_INVALID', 'Enter a nondeceptive single-line subject up to 180 characters and an email body up to 6,000 characters. Keep the matching App Store link.')
  return emailDb('rpc/update_email_daily_campaign', { method: 'POST', accessToken, body: { p_workspace_id: workspaceId, p_product_id: productId, p_campaign_id: body.dailyCampaignId, p_subject: cleanEmailText(body.subject, 180), p_body: cleanEmailText(body.body, 6000) } })
}
