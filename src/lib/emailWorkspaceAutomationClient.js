import { authenticatedJsonHeaders } from './authenticatedApi'

const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)
function ensureCurrent(signal,isCurrent) {
  if (signal?.aborted || (typeof isCurrent === 'function' && !isCurrent())) {
    const error = new Error('The workspace or permissions changed. Refresh before continuing.');error.name='AbortError';throw error
  }
}
async function request({workspaceId,signal,isCurrent},payload=null) {
  ensureCurrent(signal,isCurrent)
  if (!uuid(workspaceId)) throw new Error('Select a valid workspace before continuing.')
  const headers = await authenticatedJsonHeaders()
  ensureCurrent(signal,isCurrent)
  let response
  try {
    response = await fetch(`/api/email-workspace-automation${payload ? '' : `?workspaceId=${encodeURIComponent(workspaceId)}`}`,{method:payload ? 'POST' : 'GET',headers,signal,credentials:'same-origin',...(payload ? {body:JSON.stringify({...payload,workspaceId})} : {})})
  } catch {
    ensureCurrent(signal,isCurrent)
    throw new Error(payload ? 'The workspace action outcome is unconfirmed. Refresh status before retrying.' : 'Workspace status could not be loaded. Refresh before continuing.')
  }
  const value = await response.json().catch(()=>null)
  ensureCurrent(signal,isCurrent)
  if (!response.ok) {
    // Do not echo provider/database responses or arbitrary server fields into the UI.
    const allowed = {
      WORKSPACE_REQUIRED:'Select a valid workspace before continuing.',
      AUTH_REQUIRED:'Sign in again before continuing.',
      WORKSPACE_ACCESS_REQUIRED:'This workspace is not available to your account.',
      WORKSPACE_ADMIN_REQUIRED:'Only an owner or admin can change all-app automation.',
      EMAIL_WORKSPACE_REVIEW_STALE:'The active apps or settings changed. Refresh and review again.',
      EMAIL_WORKSPACE_RESEARCH_CONFIRM_REQUIRED:'Confirm the recurring research budget before starting.',
      EMAIL_WORKSPACE_DEPLOYMENT_BLOCKED:'The secured research and draft schedulers and workspace AI are not ready. No partial start was made.',
      EMAIL_WORKSPACE_AUTOMATION_LIMIT:'The complete workspace exceeds the supported app limit. No partial change was made.',
      EMAIL_WORKSPACE_NO_APPS:'This workspace has no active apps to start or pause.',
    }
    const error = new Error(allowed[value?.code] || 'The workspace operation could not be confirmed. Refresh status before retrying.')
    error.code = value?.code;throw error
  }
  if (!value || value.automation?.workspace_id !== workspaceId || !/^[a-f0-9]{32}$/.test(value.automation?.reviewRevision || '') || !Array.isArray(value.automation?.apps)) throw new Error('The workspace status could not be verified. Refresh before continuing.')
  if (payload && (value.applied !== true || value.mode !== 'research_and_drafts' || value.deliveryChanged !== 0)) throw new Error('The operation result is unconfirmed. Refresh status before retrying.')
  return value
}
export function getEmailWorkspaceAutomation(options) { return request(options) }
export function setEmailWorkspaceAutomation(options) {
  const {enabled,reviewRevision,confirmResearchCost} = options
  if (typeof enabled !== 'boolean' || !/^[a-f0-9]{32}$/.test(reviewRevision || '') || (enabled && confirmResearchCost !== true)) throw new Error('Review the complete workspace and confirm research costs before starting.')
  return request(options,{action:'set_research_and_drafts',enabled,reviewRevision,confirmResearchCost:confirmResearchCost === true})
}
