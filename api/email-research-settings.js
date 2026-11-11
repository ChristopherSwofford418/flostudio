import { emailDb, emailDeploymentStatus, emailError, cleanEmailText } from './email-core.js'

export function emailResearchDeploymentStatus(aiConfigured = false) {
  const existing = emailDeploymentStatus()
  const vaultConfigured = Boolean(process.env.OPENAI_PROVIDER_VAULT_KEY || process.env.ASC_CREDENTIALS_ENCRYPTION_KEY)
  const modelConfigured = Boolean(cleanEmailText(process.env.OPENAI_EMAIL_RESEARCH_MODEL, 120))
  const flagEnabled = process.env.EMAIL_RESEARCH_CRON_ENABLED === 'true'
  const schedulerAuthorized = Boolean(process.env.CRON_SECRET)
  const workspaceDailyRequestLimit = researchRequestLimit(process.env.EMAIL_RESEARCH_WORKSPACE_DAILY_REQUEST_LIMIT)
  return {
    configured: flagEnabled && schedulerAuthorized && existing.workerStorageConfigured && vaultConfigured && modelConfigured && workspaceDailyRequestLimit > 0,
    flagEnabled, schedulerAuthorized, modelConfigured, aiConfigured: aiConfigured === true,
    storageConfigured: existing.workerStorageConfigured, vaultConfigured,
    workspaceDailyRequestLimit,
    cadence: 'Every minute; eligible apps only at or after their saved local daily start hour.',
    candidateOnly: true,
  }
}

function researchRequestLimit(value) {
  if (value === undefined) return 200
  if (typeof value !== 'string' || !/^[1-9]\d{0,2}$/.test(value)) return 0
  const number = Number(value)
  return Number.isInteger(number) && number >= 1 && number <= 200 ? number : 0
}

export function researchSettingsPayload(body = {}) {
  if (typeof body.enabled !== 'boolean') throw emailError('EMAIL_RESEARCH_SETTINGS_INVALID', 'Choose whether daily candidate research is enabled.')
  const dailyTarget = Number(body.dailyTarget), dailyRequestLimit = Number(body.dailyRequestLimit), startHour = Number(body.startHour)
  if ([body.dailyTarget, body.dailyRequestLimit, body.startHour].some(value => !['number', 'string'].includes(typeof value) || value === '') ||
      !Number.isInteger(dailyTarget) || dailyTarget < 1 || dailyTarget > 100 ||
      !Number.isInteger(dailyRequestLimit) || dailyRequestLimit < 1 || dailyRequestLimit > 10 ||
      !Number.isInteger(startHour) || startHour < 0 || startHour > 23) {
    throw emailError('EMAIL_RESEARCH_SETTINGS_INVALID', 'Choose a daily target of 1–100, 1–10 requests and a valid local start hour.')
  }
  const timezone = cleanEmailText(body.timezone, 100)
  try { if (!timezone) throw new Error(); new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date()) }
  catch { throw emailError('EMAIL_RESEARCH_SETTINGS_INVALID', 'Enter a valid IANA timezone.') }
  if (body.query !== undefined && (typeof body.query !== 'string' || body.query.length > 500)) throw emailError('EMAIL_RESEARCH_SETTINGS_INVALID', 'The optional app research brief must be at most 500 characters.')
  return { p_enabled: body.enabled, p_daily_target: dailyTarget, p_daily_request_limit: dailyRequestLimit, p_timezone: timezone, p_start_hour: startHour, p_query: cleanEmailText(body.query || '', 500) }
}

export async function getDailyResearchStatus({ workspaceId, productId, accessToken }) {
  return await emailDb('rpc/get_email_research_status', { method: 'POST', accessToken, body: { p_workspace_id: workspaceId, p_product_id: productId } })
}

export async function saveDailyResearchSettings({ workspaceId, productId, accessToken, body }) {
  const settings = researchSettingsPayload(body)
  const result = await emailDb('rpc/save_email_research_settings', { method: 'POST', accessToken, body: { p_workspace_id: workspaceId, p_product_id: productId, ...settings } })
  if (result?.allowed === false) throw emailError('EMAIL_RESEARCH_SETTINGS_BLOCKED', 'Daily research settings were not saved. Refresh the selected app and verify workspace permissions.', 409)
  return result
}
