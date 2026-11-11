import { emailDb, emailError, cleanEmailText } from './email-core.js'

const messages = Object.freeze({
  EMAIL_PRODUCT_NOT_FOUND: 'This app is not available in the selected workspace.',
  EMAIL_RECORD_NOT_FOUND: 'This campaign is not available in the selected app.',
  CAMPAIGN_REQUIRED: 'Save this app’s campaign before reviewing its schedule.',
  EMAIL_APP_ARCHIVED: 'Archived apps cannot activate email campaigns.',
  GMAIL_CONNECTION_REQUIRED: 'Reconnect the configured expected Gmail sender before activation.',
  SENDER_DETAILS_REQUIRED: 'Complete the sender name, postal address, audience, language and valid HTTPS app link before approval.',
  EMAIL_NO_ELIGIBLE_RECIPIENTS: 'No remaining eligible recipients have approved nonempty drafts and recorded app-specific opt-in. Suppressed and previously consumed recipients are excluded.',
  EMAIL_REVIEW_STALE: 'Campaign settings, recipient eligibility or approved copy changed. Refresh and review the schedule again before approving.',
  EMAIL_LAUNCH_BLOCKED: 'The protected campaign review could not approve this schedule. Refresh its readiness before trying again.',
})
const pauseReasons = new Set(['provider_rejected', 'submission_unknown', 'reconnect_required'])
const revision = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value) ? value : null
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0
const row = value => Array.isArray(value) ? value[0] : value
function requireHuman(accessToken) {
  if (!accessToken || typeof accessToken !== 'string') throw emailError('AUTH_REQUIRED', 'Sign in to review the workspace email schedule.', 401)
}
function conflict(code) {
  const safe = Object.hasOwn(messages, code) ? code : 'EMAIL_LAUNCH_BLOCKED'
  return emailError(safe, messages[safe], 409)
}

/** Human-member JWT; authoritative SQL counts, <=100 exact-copy previews, safe metadata only. */
export async function getEmailCampaignReadiness({ workspaceId, productId, accessToken }) {
  requireHuman(accessToken)
  const result = row(await emailDb('rpc/email_campaign_readiness', {
    method: 'POST', accessToken, body: { p_workspace_id: workspaceId, p_product_id: productId },
  })) || {}
  const reviewRevision = revision(result.reviewRevision)
  const code = result.code === 'EMAIL_READY' && reviewRevision ? 'EMAIL_READY'
    : Object.hasOwn(messages, result.code) ? result.code : 'EMAIL_LAUNCH_BLOCKED'
  const allowed = result.allowed === true && code === 'EMAIL_READY'
  const gates = result.deliveryGates || {}
  return {
    allowed, code, status: allowed ? 'ready' : 'blocked', reviewRevision,
    counts: {
      optedIn: count(result.counts?.optedIn),
      approvedDrafts: count(result.counts?.approvedDrafts),
      eligibleRecipients: count(result.counts?.eligibleRecipients),
    },
    eligibleRecipients: (Array.isArray(result.eligibleRecipients) ? result.eligibleRecipients : []).slice(0, 100).map(recipient => ({
      id: cleanEmailText(recipient?.id, 100), email: cleanEmailText(recipient?.email, 254),
      organization: cleanEmailText(recipient?.organization, 200), draftId: cleanEmailText(recipient?.draftId, 100),
      subject: cleanEmailText(recipient?.subject, 998), body: cleanEmailText(recipient?.body, 6000),
    })),
    deliveryGates: {
      productActive: gates.productActive === true, campaignConfigured: gates.campaignConfigured === true,
      senderConfigured: gates.senderConfigured === true, connectionEnabled: gates.connectionEnabled === true,
      accountEnabled: gates.accountEnabled === true, campaignEnabled: gates.campaignEnabled === true,
    },
    deliveryPauseReason: pauseReasons.has(result.deliveryPauseReason) ? result.deliveryPauseReason : null,
    blockers: allowed ? [] : [messages[code]],
  }
}

/** Human-admin JWT; no service fallback or preliminary campaign/account PATCH. */
export async function activateEmailCampaign({ workspaceId, productId, campaignId, reviewRevision, accessToken }) {
  requireHuman(accessToken)
  if (!revision(reviewRevision)) throw conflict('EMAIL_REVIEW_STALE')
  const result = row(await emailDb('rpc/email_activate_campaign', {
    method: 'POST', accessToken,
    body: { p_workspace_id: workspaceId, p_product_id: productId, p_campaign_id: campaignId, p_review_revision: reviewRevision },
  }))
  if (result?.allowed !== true || result?.code !== 'EMAIL_CAMPAIGN_ACTIVATED' || result?.status !== 'approved') throw conflict(result?.code)
  return { allowed: true, code: 'EMAIL_CAMPAIGN_ACTIVATED', status: 'approved' }
}
