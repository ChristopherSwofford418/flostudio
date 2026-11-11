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

export async function getDailyCampaignStatus({ workspaceId, productId, accessToken }) {
  return emailDb('rpc/get_email_daily_campaign_status', { method: 'POST', accessToken, body: { p_workspace_id: workspaceId, p_product_id: productId } })
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
