import { authenticatedProviderUser, assertWorkspaceMember, assertWorkspaceAdmin, authorizationRpc, parseProviderBody } from './provider-key-vault.js'
import { emailDb, emailError, cleanEmailText, emailDeploymentStatus } from './email-core.js'
import { emailResearchDeploymentStatus } from './email-research-settings.js'
import { dailyCampaignDeploymentStatus } from './email-daily-campaign-settings.js'

export const config = { maxDuration: 60 }
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)
const revision = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value)
const integer = value => Number.isSafeInteger(value) && value >= 0
const errorMessages = Object.freeze({
  EMAIL_WORKSPACE_REVIEW_STALE: 'The active apps or automation settings changed. Refresh and review the complete workspace again.',
  EMAIL_WORKSPACE_AUTOMATION_LIMIT: 'This workspace is too large for the current all-app control. No partial change was made.',
  EMAIL_WORKSPACE_RESEARCH_CONFIRM_REQUIRED: 'Confirm the recurring research budget shown in the review before starting.',
  EMAIL_WORKSPACE_NO_APPS: 'This workspace has no active apps to start or pause.',
})

export function safeWorkspaceAutomation(value, workspaceId) {
  if (!value || value.workspace_id !== workspaceId || !revision(value.reviewRevision) || !Array.isArray(value.apps) || value.apps.length > 200 || typeof value.truncated !== 'boolean') throw emailError('EMAIL_WORKSPACE_STATUS_INVALID', 'The workspace automation status could not be verified. Refresh before making changes.', 503)
  const totals = {}
  for (const key of ['activeApps','researchEnabled','draftsEnabled','todayDrafts','deliveryEnabled','optedInContacts','researchRequestCeiling']) {
    if (!integer(value.totals?.[key])) throw emailError('EMAIL_WORKSPACE_STATUS_INVALID', 'Workspace automation counts could not be verified.', 503)
    totals[key] = value.totals[key]
  }
  const seen = new Set()
  const apps = value.apps.map(app => {
    if (!uuid(app?.id) || seen.has(app.id) || typeof app.name !== 'string' || ['researchEnabled','draftsEnabled','todayDraftCreated','deliveryEnabled','senderDetailsComplete'].some(key => typeof app[key] !== 'boolean') || ['researchTarget','researchRequestLimit','researchStartHour','draftStartHour','optedInCount'].some(key => !integer(app[key])) || !app.researchTimezone || !app.draftTimezone) throw emailError('EMAIL_WORKSPACE_STATUS_INVALID', 'The complete active-app review could not be verified.', 503)
    if (app.researchTarget < 1 || app.researchTarget > 100 || app.researchRequestLimit < 1 || app.researchRequestLimit > 10 || app.researchStartHour > 23 || app.draftStartHour > 23 || typeof app.researchTimezone !== 'string' || typeof app.draftTimezone !== 'string' || app.researchTimezone.length > 100 || app.draftTimezone.length > 100) throw emailError('EMAIL_WORKSPACE_STATUS_INVALID', 'The saved per-app schedule limits could not be verified.', 503)
    seen.add(app.id)
    return { id: app.id, name: cleanEmailText(app.name,200), researchEnabled:app.researchEnabled, draftsEnabled:app.draftsEnabled, researchTarget:app.researchTarget, researchRequestLimit:app.researchRequestLimit, researchTimezone:cleanEmailText(app.researchTimezone,100), researchStartHour:app.researchStartHour, draftTimezone:cleanEmailText(app.draftTimezone,100), draftStartHour:app.draftStartHour, todayDraftCreated:app.todayDraftCreated, deliveryEnabled:app.deliveryEnabled, senderDetailsComplete:app.senderDetailsComplete, optedInCount:app.optedInCount }
  })
  if ((!value.truncated && totals.activeApps !== apps.length) || totals.activeApps < apps.length) throw emailError('EMAIL_WORKSPACE_STATUS_INVALID', 'The active-app review is incomplete.', 503)
  return { workspace_id:workspaceId, reviewRevision:value.reviewRevision, apps, totals, truncated:value.truncated }
}

async function deployment(workspaceId,accessToken) {
  let aiConfigured = false
  try {
    const rows = await authorizationRpc('get_workspace_openai_provider_status',{target_workspace_id:workspaceId},accessToken)
    aiConfigured = (Array.isArray(rows) ? rows[0] : rows)?.configured === true
  } catch { /* Missing/unknown provider status is not readiness. */ }
  const research = emailResearchDeploymentStatus(aiConfigured), drafts = dailyCampaignDeploymentStatus(), delivery = emailDeploymentStatus()
  return { researchConfigured:research.configured, draftsConfigured:drafts.configured, workspaceDailyRequestLimit:research.workspaceDailyRequestLimit, aiConfigured, sendingEnabled:delivery.sendingEnabled, deliveryConfigured:delivery.cronConfigured }
}
async function status(workspaceId,accessToken) {
  return safeWorkspaceAutomation(await emailDb('rpc/get_email_workspace_automation_status',{method:'POST',accessToken,body:{p_workspace_id:workspaceId}}),workspaceId)
}

export default async function handler(req,res) {
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store')
  if (!['GET','POST'].includes(req.method)) return res.status(405).json({error:'Method not allowed'})
  try {
    const body = req.method === 'GET' ? req.query || {} : parseProviderBody(req)
    const workspaceId = body?.workspaceId
    const {accessToken} = await authenticatedProviderUser(req)
    if (!uuid(workspaceId)) throw emailError('WORKSPACE_REQUIRED','Select a valid workspace before continuing.')
    await assertWorkspaceMember({workspaceId,accessToken})
    const gates = await deployment(workspaceId,accessToken)
    if (req.method === 'GET') return res.status(200).json({automation:await status(workspaceId,accessToken),deployment:gates})
    await assertWorkspaceAdmin({workspaceId,accessToken})
    if (body.action !== 'set_research_and_drafts' || typeof body.enabled !== 'boolean' || !revision(body.reviewRevision)) throw emailError('EMAIL_WORKSPACE_REVIEW_REQUIRED','Review the complete active-app list before starting or pausing.')
    if (body.enabled && body.confirmResearchCost !== true) throw emailError('EMAIL_WORKSPACE_RESEARCH_CONFIRM_REQUIRED',errorMessages.EMAIL_WORKSPACE_RESEARCH_CONFIRM_REQUIRED)
    if (body.enabled && (!gates.researchConfigured || !gates.draftsConfigured || !gates.aiConfigured)) throw emailError('EMAIL_WORKSPACE_DEPLOYMENT_BLOCKED','The secured research and draft schedulers and workspace AI must be ready. No partial startup was made.',409)
    const result = await emailDb('rpc/set_email_workspace_automation',{method:'POST',accessToken,body:{p_workspace_id:workspaceId,p_enabled:body.enabled,p_review_revision:body.reviewRevision,p_confirm_research_cost:body.confirmResearchCost === true}})
    if (result?.applied === false && Object.hasOwn(errorMessages,result.code)) throw emailError(result.code,errorMessages[result.code],409)
    if (result?.applied !== true || result.mode !== 'research_and_drafts' || result.deliveryChanged !== 0 || !integer(result.researchChanged) || !integer(result.draftsChanged)) throw emailError('EMAIL_WORKSPACE_OPERATION_UNCONFIRMED','The workspace result could not be confirmed. Refresh status before retrying; no email delivery is authorized by this control.',503)
    return res.status(200).json({automation:safeWorkspaceAutomation(result.status,workspaceId),deployment:gates,applied:true,mode:'research_and_drafts',researchChanged:result.researchChanged,draftsChanged:result.draftsChanged,deliveryChanged:0})
  } catch(error) {
    const known = Object.keys(errorMessages).find(code => typeof error.message === 'string' && error.message.includes(code))
    if (known) return res.status(409).json({error:errorMessages[known],code:known})
    return res.status(error.status || 500).json({error:error.code && error.code !== 'EMAIL_DATABASE_ERROR' && error.code !== 'PROVIDER_DATABASE_ERROR' ? error.message : 'The workspace automation operation could not be completed. Refresh status before retrying.',code:error.code && error.code !== 'PROVIDER_DATABASE_ERROR' && error.code !== 'EMAIL_DATABASE_ERROR' ? error.code : 'EMAIL_WORKSPACE_AUTOMATION_ERROR'})
  }
}
