import crypto from 'node:crypto'
import { emailDb, emailRpc, emailError, normalizeEmail } from './email-core.js'

export const GMAIL_TEST_SUBJECT = 'Flo Studio — Gmail connection test'
export const GMAIL_TEST_BODY = 'This is a one-time email delivery test from Flo Studio. No daily marketing campaigns have been enabled.'
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

export function gmailDiagnosticMessage(sender, recipient, id = crypto.randomUUID()) {
  const from = normalizeEmail(sender), to = normalizeEmail(recipient)
  if (!uuid(id)) throw emailError('GMAIL_TEST_INVALID', 'A valid diagnostic record is required.')
  const lines = [
    `From: Flo Studio <${from}>`, `To: <${to}>`,
    `Subject: =?UTF-8?B?${Buffer.from(GMAIL_TEST_SUBJECT).toString('base64')}?=`,
    `Message-ID: <gmail-test-${id}@flostudio.io>`, `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64',
    '', Buffer.from(GMAIL_TEST_BODY).toString('base64').match(/.{1,76}/g).join('\r\n'),
  ]
  return Buffer.from(lines.join('\r\n')).toString('base64url')
}

// Operational diagnostic only: fixed content, owner/self recipient, one durable
// reservation PER GOOGLE ACCOUNT. This never calls the campaign worker or alters
// campaign, workspace/account sending flags, opt-ins or unsubscribe history.
export async function sendOneGmailDiagnostic({ connection, user, productId, recipient }) {
  if (!uuid(user?.id) || !uuid(productId) || !uuid(connection?.workspace_id) || connection.configured !== true || !connection.accessToken || !/^[a-f0-9]{64}$/.test(connection.account_key || '') || connection.account?.account_key !== connection.account_key) throw emailError('GMAIL_TEST_UNAVAILABLE', 'Reconnect the verified Gmail sender before testing.', 409)
  if (connection.sending_enabled !== false || connection.account.sending_enabled !== false) throw emailError('GMAIL_TEST_UNAVAILABLE', 'Pause shared campaign delivery before running this diagnostic.', 409)
  const to = normalizeEmail(recipient)
  const ownerEmail = user.email ? normalizeEmail(user.email) : ''
  if (to !== ownerEmail && to !== normalizeEmail(connection.email)) throw emailError('GMAIL_TEST_RECIPIENT_INVALID', 'Send the diagnostic only to your signed-in email or the connected Gmail address.', 400)
  let record
  try {
    record = await emailRpc('email_reserve_diagnostic', { p_workspace_id:connection.workspace_id, p_product_id:productId, p_user_id:user.id, p_recipient:to })
  } catch {
    throw emailError('GMAIL_TEST_UNAVAILABLE', 'The one-time diagnostic could not be reserved. It may already have been attempted, or its permission and paused-delivery checks failed. No automatic retry is allowed.', 409)
  }
  if (!uuid(record?.id) || record.recipient !== to || record.status !== 'reserved') throw emailError('GMAIL_TEST_UNAVAILABLE', 'A valid one-time diagnostic reservation was not returned. No email was submitted.', 409)
  const raw = gmailDiagnosticMessage(connection.email, to, record.id)
  const filters = status => new URLSearchParams({ id:`eq.${record.id}`, workspace_id:`eq.${connection.workspace_id}`, product_id:`eq.${productId}`, account_key:`eq.${connection.account_key}`, status:`eq.${status}`, select:'id', limit:'1' })
  // Persist unknown BEFORE crossing the external boundary. A crash or timeout
  // can never leave this record eligible for automatic resubmission.
  const claimed = await emailDb(`email_gmail_diagnostics?${filters('reserved')}`, { method:'PATCH', body:{status:'unknown'}, prefer:'return=representation' })
  if (!Array.isArray(claimed) || claimed.length !== 1 || claimed[0].id !== record.id) throw emailError('GMAIL_TEST_UNAVAILABLE', 'The diagnostic reservation could not be claimed. No email was submitted.', 409)
  async function finish(status, providerMessageId = null) {
    try {
      const rows = await emailDb(`email_gmail_diagnostics?${filters('unknown')}`, { method:'PATCH', body:{status, provider_message_id:providerMessageId, finished_at:new Date().toISOString()}, prefer:'return=representation' })
      return Array.isArray(rows) && rows.length === 1 && rows[0].id === record.id
    } catch { return false }
  }
  const unknown = () => emailError('GMAIL_TEST_ACCEPTANCE_UNKNOWN', 'Gmail acceptance is unknown. Check your inbox and the sender’s Sent folder; do not resend automatically.', 502)
  let response
  try {
    response = await fetch(SEND_URL, { method:'POST', headers:{Authorization:`Bearer ${connection.accessToken}`, 'Content-Type':'application/json'}, body:JSON.stringify({raw}), redirect:'error', signal:AbortSignal.timeout(15000) })
  } catch { throw unknown() }
  if (response.status >= 400 && response.status < 500) {
    await finish('rejected')
    throw emailError('GMAIL_TEST_REJECTED', 'Gmail rejected the diagnostic submission. No automatic retry will occur.', 422)
  }
  if (!response.ok) throw unknown()
  const payload = await response.json().catch(() => null)
  if (typeof payload?.id !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(payload.id)) throw unknown()
  const recorded = await finish('accepted', payload.id)
  return {accepted:true, recipient:to, providerMessageId:payload.id, recorded, sendingEnabled:false}
}
