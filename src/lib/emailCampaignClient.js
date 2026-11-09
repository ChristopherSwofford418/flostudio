import { authenticatedHeaders, authenticatedJsonHeaders } from './authenticatedApi'

export const EMAIL_DAILY_LIMIT = 100
export const EMAIL_BATCH_LIMIT = 10
export const CAMPAIGN_FIELDS = ['name', 'daily_limit', 'timezone', 'send_hour', 'send_minute', 'sender_name', 'postal_address', 'ad_link', 'audience', 'language']
const ACTIONS = new Set(['save_campaign', 'add_contacts', 'consent_contact', 'suppress_contact', 'generate_drafts', 'approve_draft', 'research_candidates', 'preview_run', 'set_state', 'update_draft'])

export function safeEmailUrl(value) {
  try {
    const url = new URL(String(value || '').trim())
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''
  } catch { return '' }
}

export function defaultEmailCampaign(app) {
  let timezone = 'UTC'
  try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { /* UTC is the safe fallback. */ }
  return { name: `${app?.name || 'App'} · Daily email`, daily_limit: 100, timezone, send_hour: 9, send_minute: 0, state: 'paused', sender_name: '', postal_address: '', ad_link: app?.product_url || '', audience: app?.audience || '', language: 'English' }
}

export function campaignValues(campaign) {
  return Object.fromEntries(CAMPAIGN_FIELDS.map(field => [field, campaign?.[field] ?? '']))
}

export function consentEvidenceText(evidence) {
  if (typeof evidence === 'string') return evidence.trim()
  return typeof evidence?.reference === 'string' ? evidence.reference.trim() : ''
}

export function sourceEvidenceText(evidence) {
  if (typeof evidence === 'string') return evidence.trim()
  return typeof evidence?.excerpt === 'string' ? evidence.excerpt.trim() : ''
}

export function isApprovedOptIn(contact) {
  // Integrated API uses opted_in + { method, reference, recorded_at }.
  // Retain the original approved/string contract; unknown statuses fail closed.
  return ['opted_in', 'approved'].includes(contact?.status) && Boolean(consentEvidenceText(contact.consent_evidence))
}

export function isSuppressedContact(contact) {
  return ['unsubscribed', 'suppressed', 'bounced'].includes(contact?.status)
}

export function campaignValidation(campaign, { complete = false } = {}) {
  const errors = []
  if (!String(campaign?.name || '').trim()) errors.push('Give this campaign a name.')
  const limit = Number(campaign?.daily_limit)
  if (campaign?.daily_limit === '' || !Number.isInteger(limit) || limit < 1 || limit > EMAIL_DAILY_LIMIT) errors.push('Daily app cap must be a whole number from 1 to 100.')
  try { new Intl.DateTimeFormat('en', { timeZone: campaign?.timezone || '__invalid__' }).format() } catch { errors.push('Enter a valid IANA timezone, such as America/New_York or Europe/London.') }
  if (campaign?.send_hour === '' || !Number.isInteger(Number(campaign?.send_hour)) || Number(campaign.send_hour) < 0 || Number(campaign.send_hour) > 23) errors.push('Choose a valid send hour.')
  if (campaign?.send_minute === '' || !Number.isInteger(Number(campaign?.send_minute)) || Number(campaign.send_minute) < 0 || Number(campaign.send_minute) > 59) errors.push('Choose a valid send minute.')
  if (campaign?.ad_link && !safeEmailUrl(campaign.ad_link)) errors.push('The ad link must be a full HTTP or HTTPS URL without embedded credentials.')
  if (complete) {
    for (const [field, label] of [['sender_name', 'Sender name'], ['postal_address', 'Physical postal address'], ['ad_link', 'Ad link'], ['audience', 'Audience'], ['language', 'Language']]) {
      if (!String(campaign?.[field] || '').trim()) errors.push(`${label} is required before schedule approval.`)
    }
  }
  return errors
}

export function campaignSavePayload(campaign) {
  return { ...campaignValues(campaign), ...(campaign?.id ? { id: campaign.id } : {}), daily_limit: Number(campaign.daily_limit), send_hour: Number(campaign.send_hour), send_minute: Number(campaign.send_minute), state: 'paused' }
}

/** Simple newline-separated records, NOT a quoted/multiline CSV implementation. */
export function parseContactLines(text, sourceEvidence = '') {
  const lines = String(text || '').split(/\r?\n/).map((value, index) => ({ value: value.trim(), line: index + 1 })).filter(item => item.value)
  if (!lines.length) throw new Error('Add at least one contact line.')
  if (lines.length > 100) throw new Error('Import at most 100 non-empty lines at a time. Nothing was imported.')
  const seen = new Set()
  const contacts = []
  let duplicates = 0
  for (const { value, line } of lines) {
    const fields = value.split(',').map(field => field.trim())
    if (fields.length > 3 || fields.some(field => field.includes('"'))) throw new Error(`Line ${line}: use email, organization, source URL only. Quoted CSV and commas inside fields are not supported.`)
    const [email, organization = '', source_url = ''] = fields
    if (!/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email) || email.length > 254) throw new Error(`Line ${line}: enter a valid email address. Nothing was imported.`)
    if (source_url && !safeEmailUrl(source_url)) throw new Error(`Line ${line}: source URL must start with http:// or https:// and contain no credentials.`)
    const normalized = email.toLowerCase()
    if (seen.has(normalized)) { duplicates += 1; continue }
    seen.add(normalized)
    // No status or consent flag is sent. The server must create candidates.
    contacts.push({ email: normalized, organization, source_url, source_evidence: String(sourceEvidence || '').trim() })
  }
  return { contacts, duplicates }
}

function requireScope(workspaceId, productId) {
  if (!workspaceId || !productId) throw new Error('Select an app in an active workspace before continuing.')
}

async function responseJson(response, service) {
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = typeof data?.error === 'string' ? data.error : typeof data?.message === 'string' ? data.message : ''
    let fallback = `${service} request failed (HTTP ${response.status}).`
    if (response.status === 404) fallback += ' This endpoint is not deployed. Ask your workspace administrator to finish server setup.'
    if (response.status === 401) fallback += ' Sign in again.'
    if (response.status === 403) fallback += ' Your workspace role does not permit this action.'
    const error = new Error(detail ? `${detail} (HTTP ${response.status})` : fallback)
    error.status = response.status
    throw error
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${service} returned an invalid response. No configuration can be confirmed; check the server deployment.`)
  return data
}

export async function getEmailCampaigns({ workspaceId, productId, signal }) {
  requireScope(workspaceId, productId)
  const query = new URLSearchParams({ workspaceId, productId })
  const response = await fetch(`/api/email-campaigns?${query}`, { headers: await authenticatedHeaders(), signal })
  const data = await responseJson(response, 'Email campaigns')
  if (!Object.prototype.hasOwnProperty.call(data, 'campaign') || !Array.isArray(data.contacts) || !Array.isArray(data.drafts) || !Array.isArray(data.queue) || !data.connection || !data.readiness) throw new Error('Email campaigns returned an incomplete setup response. Check the API contract before approving anything.')
  return data
}

export async function emailCampaignAction({ workspaceId, productId, action, payload = {}, signal }) {
  requireScope(workspaceId, productId)
  if (!ACTIONS.has(action)) throw new Error('Unsupported email campaign action.')
  const response = await fetch('/api/email-campaigns', { method: 'POST', headers: await authenticatedJsonHeaders(), body: JSON.stringify({ ...payload, workspaceId, productId, action }), signal })
  return responseJson(response, 'Email campaigns')
}

export async function emailGmailAction({ workspaceId, action, payload = {}, signal }) {
  if (!workspaceId) throw new Error('An active workspace is required to connect Gmail.')
  if (!['connect', 'disconnect', 'configure_budget'].includes(action)) throw new Error('Unsupported Gmail connection action.')
  let budgetPayload = {}
  if (action === 'configure_budget') {
    const { accountType, dailyBudget, confirmWorkspace } = payload
    const budget = Number(dailyBudget)
    if (!['personal', 'workspace'].includes(accountType)) throw new Error('Explicitly select personal/trial Gmail or confirmed paid Google Workspace.')
    const maximum = accountType === 'workspace' ? 2000 : 400
    if (dailyBudget === '' || !Number.isInteger(budget) || budget < 1 || budget > maximum) throw new Error(`Shared daily budget must be a whole number from 1 to ${maximum} for the selected account type.`)
    if (accountType === 'workspace' && confirmWorkspace !== true) throw new Error('Confirm this is an eligible paid Google Workspace account, not a personal or trial mailbox.')
    budgetPayload = { accountType, dailyBudget: budget, ...(accountType === 'workspace' ? { confirmWorkspace: true } : {}) }
  }
  const response = await fetch('/api/email-gmail', { method: 'POST', headers: await authenticatedJsonHeaders(), body: JSON.stringify({ ...budgetPayload, workspaceId, action }), signal })
  const data = await responseJson(response, 'Gmail OAuth')
  if (action === 'connect') {
    const authorizationUrl = safeEmailUrl(data.authorizationUrl)
    if (!authorizationUrl || new URL(authorizationUrl).protocol !== 'https:') throw new Error('Gmail did not return a valid HTTPS authorization URL. OAuth is unavailable; ask your administrator to configure the server OAuth credentials and redirect URL.')
    return { ...data, authorizationUrl }
  }
  return data
}
