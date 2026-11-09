import crypto from 'node:crypto'
import { SUPABASE_ANON_KEY, providerKeyError } from './provider-key-vault.js'

export const EMAIL_DB_URL = 'https://jtogllurcrxxaguoxeus.supabase.co'
export const emailError = providerKeyError
export const cleanEmailText = (value, max = 500) => String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max)
export const hashEmailToken = value => crypto.createHash('sha256').update(String(value)).digest('hex')
export const randomEmailToken = () => crypto.randomBytes(32).toString('base64url')
export function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase()
  if (email.length > 254 || /[\r\n\s<>]/.test(email) || !/^[a-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/i.test(email)) throw emailError('EMAIL_INVALID', 'Enter a valid single email address.')
  return email
}
export function emailHttpsUrl(value) {
  try {
    const url = new URL(String(value || '').trim())
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return ''
    const host = url.hostname.toLowerCase()
    if (host === 'localhost' || !host.includes('.') || host.endsWith('.local') || host.endsWith('.internal') || /^[\d.]+$/.test(host) || host.includes(':') || /^(127\.|0\.|10\.|192\.168\.|169\.254\.)/.test(host)) return ''
    return url.href.slice(0, 2000)
  } catch { return '' }
}
export function emailSchedule(input = {}) {
  const daily_limit = Number(input.daily_limit ?? 100)
  const send_hour = Number(input.send_hour ?? 9)
  const send_minute = Number(input.send_minute ?? 0)
  if (!Number.isInteger(daily_limit) || daily_limit < 1 || daily_limit > 100) throw emailError('DAILY_LIMIT_INVALID', 'Choose between 1 and 100 eligible recipients per app per day.')
  if (!Number.isInteger(send_hour) || send_hour < 0 || send_hour > 23 || !Number.isInteger(send_minute) || send_minute < 0 || send_minute > 59) throw emailError('SCHEDULE_INVALID', 'Choose a valid daily time.')
  const timezone = String(input.timezone || 'UTC').slice(0, 100)
  try { new Intl.DateTimeFormat('en-US', { timeZone:timezone }).format() } catch { throw emailError('TIMEZONE_INVALID', 'Choose a valid IANA timezone, such as America/New_York.') }
  return { daily_limit, send_hour, send_minute, timezone }
}
export function emailLocalClock(timezone, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone:timezone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(now)
  const p = Object.fromEntries(parts.map(item => [item.type, item.value]))
  return { day:`${p.year}-${p.month}-${p.day}`, minute:Number(p.hour) * 60 + Number(p.minute) }
}
export function isEmailCampaignDue(campaign, now = new Date()) {
  const clock = emailLocalClock(campaign.timezone, now)
  return campaign.state === 'approved' && clock.minute >= campaign.send_hour * 60 + campaign.send_minute
}
function emailRootKey() {
  const root = process.env.EMAIL_CREDENTIALS_ENCRYPTION_KEY || process.env.ASC_CREDENTIALS_ENCRYPTION_KEY || process.env.OPENAI_PROVIDER_VAULT_KEY
  if (!root) throw emailError('EMAIL_VAULT_NOT_CONFIGURED', 'The encrypted Gmail credential vault is not configured.', 503)
  return crypto.createHash('sha256').update(`flostudio:email:v1:${root}`).digest()
}
export function encryptEmailCredential(value, workspaceId) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', emailRootKey(), iv)
  cipher.setAAD(Buffer.from(String(workspaceId)))
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return { version:1, algorithm:'aes-256-gcm', iv:iv.toString('base64'), tag:cipher.getAuthTag().toString('base64'), ciphertext:ciphertext.toString('base64') }
}
export function decryptEmailCredential(envelope, workspaceId) {
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', emailRootKey(), Buffer.from(envelope.iv, 'base64'))
    decipher.setAAD(Buffer.from(String(workspaceId)))
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]).toString('utf8'))
  } catch { throw emailError('GMAIL_RECONNECT_REQUIRED', 'Reconnect Gmail to restore the encrypted sender connection.', 409) }
}
export async function emailDb(path, { method = 'GET', body, accessToken, prefer } = {}) {
  const key = accessToken ? SUPABASE_ANON_KEY : process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw emailError('EMAIL_STORAGE_NOT_CONFIGURED', 'Email Campaigns storage is not configured in production.', 503)
  const response = await fetch(`${EMAIL_DB_URL}/rest/v1/${path}`, { method, headers:{ apikey:key, Authorization:`Bearer ${accessToken || key}`, 'Content-Type':'application/json', ...(prefer ? { Prefer:prefer } : {}) }, ...(body === undefined ? {} : { body:JSON.stringify(body) }), signal:AbortSignal.timeout(15000) })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    if (['42P01','PGRST205','PGRST202'].includes(payload?.code)) throw emailError('EMAIL_MIGRATION_REQUIRED', 'Email Campaigns storage needs its additive database migration.', 503)
    throw emailError('EMAIL_DATABASE_ERROR', 'Email Campaigns could not complete the protected database operation.', response.status === 401 || response.status === 403 ? response.status : 500)
  }
  return payload
}
export const emailRpc = (name, args) => emailDb(`rpc/${name}`, { method:'POST', body:args })
export function emailDeploymentStatus() {
  return {
    gmailConfigured:Boolean(process.env.GOOGLE_EMAIL_CLIENT_ID && process.env.GOOGLE_EMAIL_CLIENT_SECRET && process.env.GOOGLE_EMAIL_REDIRECT_URI),
    sendingEnabled:process.env.EMAIL_LIVE_SENDING_ENABLED === 'true',
    cronConfigured:process.env.EMAIL_CRON_ENABLED === 'true' && Boolean(process.env.CRON_SECRET),
    vaultConfigured:Boolean(process.env.EMAIL_CREDENTIALS_ENCRYPTION_KEY || process.env.ASC_CREDENTIALS_ENCRYPTION_KEY || process.env.OPENAI_PROVIDER_VAULT_KEY),
  }
}
export function emailPublicOrigin() {
  const raw = process.env.EMAIL_PUBLIC_ORIGIN || 'https://www.flostudio.io'
  const url = new URL(raw)
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/') throw emailError('EMAIL_ORIGIN_INVALID', 'Configure a secure public Flo Studio email origin.', 503)
  return url.origin
}
export function safeEmailSecretEqual(actual, expected) {
  const a = Buffer.from(String(actual || '')), b = Buffer.from(String(expected || ''))
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b)
}
export function emailMessage({ senderEmail, senderName, recipient, subject, body, adLink, postalAddress, unsubscribeToken, messageId }) {
  const from = normalizeEmail(senderEmail), to = normalizeEmail(recipient)
  const name = cleanEmailText(senderName, 120).replace(/[\r\n]/g, ' ')
  const title = cleanEmailText(subject, 180).replace(/[\r\n]/g, ' ')
  const link = emailHttpsUrl(adLink)
  if (!title || !link || !postalAddress || !/^[a-zA-Z0-9_-]{40,}$/.test(unsubscribeToken || '')) throw emailError('EMAIL_PAYLOAD_INVALID', 'Complete the approved email, app link, sender address, and unsubscribe token before sending.')
  const unsubscribe = `${emailPublicOrigin()}/api/email-unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`
  const text = `${cleanEmailText(body, 6000)}\n\nExplore the app: ${link}\n\nAdvertisement from ${name || from}\n${cleanEmailText(postalAddress, 500)}\n\nUnsubscribe: ${unsubscribe}`
  const id = String(messageId || crypto.randomUUID()).replace(/[^a-zA-Z0-9-]/g, '')
  const lines = [
    `From: =?UTF-8?B?${Buffer.from(name || from).toString('base64')}?= <${from}>`,
    `To: <${to}>`,
    `Subject: =?UTF-8?B?${Buffer.from(title).toString('base64')}?=`,
    `Message-ID: <${id}@${new URL(emailPublicOrigin()).hostname}>`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64',
    `List-Unsubscribe: <${unsubscribe}>`, 'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
    '', Buffer.from(text).toString('base64').match(/.{1,76}/g).join('\r\n'),
  ]
  return { raw:Buffer.from(lines.join('\r\n')).toString('base64url'), text }
}
