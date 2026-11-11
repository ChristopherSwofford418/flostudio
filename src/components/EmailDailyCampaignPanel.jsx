import { useCallback, useEffect, useRef, useState } from 'react'
import { emailCampaignAction } from '../lib/emailCampaignClient'

export const DAILY_CAMPAIGN_DEFAULTS = Object.freeze({ enabled: false, timezone: 'America/New_York', startHour: 7 })
const object = value => value && typeof value === 'object' && !Array.isArray(value)

export function dailyCampaignSettingsPayload(value) {
  if (typeof value?.enabled !== 'boolean') throw new Error('Choose whether the daily draft library is enabled.')
  if (!['number', 'string'].includes(typeof value.startHour) || String(value.startHour).trim() === '' || !Number.isInteger(Number(value.startHour)) || Number(value.startHour) < 0 || Number(value.startHour) > 23) throw new Error('Choose a local start hour from 00:00 to 23:00.')
  const timezone = typeof value.timezone === 'string' ? value.timezone.trim() : ''
  if (!timezone || timezone.length > 100) throw new Error('Enter a valid IANA timezone, such as America/New_York.')
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format() } catch { throw new Error('Enter a valid IANA timezone, such as America/New_York.') }
  return { enabled: value.enabled, timezone, startHour: Number(value.startHour) }
}

function confirmedSettings(value) {
  if (value === null) return { ...DAILY_CAMPAIGN_DEFAULTS }
  if (!object(value) || !Number.isInteger(value.startHour ?? value.start_hour)) throw new Error('Daily draft settings could not be confirmed. Refresh before saving.')
  return dailyCampaignSettingsPayload({ enabled: value.enabled, timezone: value.timezone, startHour: value.startHour ?? value.start_hour })
}

export function safeDailyCampaignAppUrl(value) {
  if (typeof value !== 'string' || !value || value.length > 2000 || /[\s\x00-\x1f\x7f\\]/.test(value)) return ''
  try {
    const url = new URL(value)
    // Use the server's exact canonical listing, not a generic marketing URL,
    // a credential-bearing URL, another host, or a tracking/redirect query.
    if (url.protocol !== 'https:' || url.hostname !== 'apps.apple.com' || url.username || url.password || url.port || url.search || url.hash || url.href !== value) return ''
    if (!/^\/(?:[a-z]{2}\/)?app\/(?:[a-zA-Z0-9._~%+-]+\/)?id[1-9]\d{0,19}\/?$/.test(url.pathname)) return ''
    const decoded = decodeURIComponent(url.pathname)
    if (/[\x00-\x1f\x7f\\?#@]/.test(decoded) || decoded.split('/').length !== url.pathname.split('/').length) return ''
    return value
  } catch { return '' }
}

export function dailyCampaignCopyPayload(campaign, value) {
  if (campaign?.status !== 'draft' || typeof campaign.id !== 'string' || !campaign.id) throw new Error('Only a confirmed saved draft may be edited. Refresh the library.')
  const appUrl = safeDailyCampaignAppUrl(campaign.app_store_url)
  if (!appUrl) throw new Error('This draft has no verified canonical App Store link. Refresh or ask an administrator to review the app listing.')
  const subject = typeof value?.subject === 'string' ? value.subject.trim() : ''
  const body = typeof value?.body === 'string' ? value.body.trim() : ''
  if (!subject || subject.length > 180 || /[\x00-\x1f\x7f]/.test(subject) || /^(?:re|fw|fwd)\s*:/i.test(subject)) throw new Error('Enter a nondeceptive single-line subject of at most 180 characters; do not use Re: or Fwd: prefixes.')
  if (!body || body.length > 6000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f<>]/.test(body) || /\]\s*\(/.test(body)) throw new Error('Enter a plain-text email body of at most 6,000 characters, without HTML or Markdown links.')
  const urlPattern = /https?:\/\/[^\s<>"'\[\]{}()]+/gi
  const urls = body.match(urlPattern) || []
  if (!urls.length || urls.some(url => url.replace(/[.,;:!?]+$/, '') !== appUrl)) throw new Error('Keep the exact saved App Store link in the email body. A different app ID, another link or tracking parameters are not accepted.')
  const remaining = body.replace(urlPattern, '')
  if (/([a-z][a-z0-9+.-]*:\/\/|(?:mailto|javascript|data|tel|sms|file|ftp|https?):|\/\/|www\.|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,63}\b)/i.test(remaining)) throw new Error('Use only the exact saved App Store link in this plain-text draft.')
  return { dailyCampaignId: campaign.id, subject, body }
}

export function dailyCampaignStatusResponse(value) {
  const daily = value?.dailyCampaign
  if (!object(daily) || !Object.prototype.hasOwnProperty.call(daily, 'settings') || !Array.isArray(daily.campaigns) || !Object.prototype.hasOwnProperty.call(daily, 'today') || (daily.today !== null && !object(daily.today)) || !object(value.deployment)) throw new Error('Daily draft status could not be confirmed. Refresh after server setup is complete.')
  const seen = new Set()
  const campaigns = daily.campaigns.filter(record => object(record) && typeof record.id === 'string' && record.id && !seen.has(record.id) && seen.add(record.id)).map(record => ({
    id: record.id, scheduled_day: record.scheduled_day, name: typeof record.name === 'string' ? record.name : '', subject: typeof record.subject === 'string' ? record.subject : '', body: typeof record.body === 'string' ? record.body : '', app_store_url: safeDailyCampaignAppUrl(record.app_store_url), status: record.status === 'draft' ? 'draft' : 'unconfirmed', content_source: record.content_source === 'listing_template' ? 'listing_template' : 'unconfirmed', created_at: record.created_at, updated_at: record.updated_at,
  })).sort((a, b) => String(b.scheduled_day || '').localeCompare(String(a.scheduled_day || '')) || String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0, 30)
  return { settings: confirmedSettings(daily.settings), settingsSaved: daily.settings !== null && daily.settings?.settings_revision !== null, campaigns, today: daily.today, deployment: { enabled: value.deployment.enabled === true, configured: value.deployment.configured === true, blockerCount: Array.isArray(value.deployment.blockers) ? value.deployment.blockers.length : null } }
}

function safeRequestError(error, write) {
  const messages = { 401: 'Sign in again before continuing.', 403: 'Your workspace role does not permit this daily draft action.', 404: 'The daily draft library is not deployed. Ask an administrator to finish server setup.', 409: 'The saved draft or settings changed. Refresh and review before saving again.' }
  return messages[error?.status] || (write ? 'The save could not be confirmed. Refresh to check the saved state before trying again.' : 'Daily draft status is unavailable. Refresh to check server setup and try again.')
}

/**
 * Integrate inside .email-studio. All three actions use emailCampaignAction's
 * authenticated POST. The client must whitelist get_daily_campaign_status,
 * save_daily_campaign_settings and update_daily_campaign, force scope/action
 * after payload, and honor signal plus isCurrent after asynchronous auth.
 * Status returns { dailyCampaign: { settings, campaigns, today }, deployment }.
 * Writes may return their own result; a read-only status refresh confirms them.
 * No generation, sending, consent, recipient or delivery-schedule action exists.
 */
export async function dailyCampaignRequest({ workspaceId, productId, action, payload = {}, campaign, signal, isCurrent = () => true }) {
  if (!workspaceId || !productId) throw new Error('Select an app in an active workspace before continuing.')
  if (!['get_daily_campaign_status', 'save_daily_campaign_settings', 'update_daily_campaign'].includes(action)) throw new Error('Unsupported daily draft action.')
  const fields = action === 'save_daily_campaign_settings' ? dailyCampaignSettingsPayload(payload) : action === 'update_daily_campaign' ? dailyCampaignCopyPayload(campaign, payload) : {}
  if (signal?.aborted || !isCurrent()) { const error = new Error('Daily draft request cancelled.'); error.name = 'AbortError'; throw error }
  // Whitelist fields first; neither user copy nor form state can override scope.
  return emailCampaignAction({ payload: fields, workspaceId, productId, action, signal, isCurrent })
}

const dayLabel = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value ? value : 'Date unavailable'
function timestamp(value, timezone) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return 'Time unavailable'
  try { return new Intl.DateTimeFormat('en', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) } catch { return 'Time unavailable' }
}

export default function EmailDailyCampaignPanel({ workspaceId, productId, appName, canEdit = false, disabled = false }) {
  const scope = workspaceId && productId ? JSON.stringify([workspaceId, productId]) : ''
  const scopeRef = useRef(scope); scopeRef.current = scope
  const editRef = useRef(false); editRef.current = canEdit === true && !disabled
  const disabledRef = useRef(disabled); disabledRef.current = disabled
  const mountedRef = useRef(false)
  const readSequenceRef = useRef(0), actionSequenceRef = useRef(0)
  const readControllerRef = useRef(null), actionControllerRef = useRef(null)
  const loadingRef = useRef(false), actionLockRef = useRef(null), panelRef = useRef(null)
  const [stored, setStored] = useState(null), [settingsDraft, setSettingsDraft] = useState(null)
  const [selection, setSelection] = useState(null), [copyDraft, setCopyDraft] = useState(null)
  const [loadingScope, setLoadingScope] = useState(''), [busyScope, setBusyScope] = useState('')
  const [loadError, setLoadError] = useState(null), [notice, setNotice] = useState(null), [visible, setVisible] = useState(false)
  const data = stored?.scope === scope ? stored.value : null
  const form = settingsDraft?.scope === scope ? settingsDraft.value : data?.settings || DAILY_CAMPAIGN_DEFAULTS
  const campaigns = data?.campaigns || []
  const selected = campaigns.find(record => selection?.scope === scope && record.id === selection.id) || campaigns[0] || null
  const selectedRef = useRef(null); selectedRef.current = selected?.id || null
  const copy = copyDraft?.scope === scope && copyDraft.id === selected?.id ? copyDraft.value : { subject: selected?.subject || '', body: selected?.body || '' }
  const loading = Boolean(scope) && loadingScope === scope
  const busy = Boolean(scope) && busyScope === scope
  const unavailable = loadError?.scope === scope
  const locked = !scope || disabled || canEdit !== true || loading || busy || !data || unavailable
  const copyLocked = locked || selected?.status !== 'draft' || !selected?.app_store_url
  const settingsDirty = Boolean(data) && JSON.stringify(form) !== JSON.stringify(data.settings)
  const copyDirty = Boolean(selected) && (copy.subject !== selected.subject || copy.body !== selected.body)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false; readSequenceRef.current += 1; actionSequenceRef.current += 1; readControllerRef.current?.abort(); actionControllerRef.current?.abort() }
  }, [])

  const refresh = useCallback(async ({ afterSave = false } = {}) => {
    const requestedScope = workspaceId && productId ? JSON.stringify([workspaceId, productId]) : ''
    if (!requestedScope || !mountedRef.current || disabledRef.current || scopeRef.current !== requestedScope || (actionLockRef.current && !afterSave)) return false
    const sequence = ++readSequenceRef.current
    readControllerRef.current?.abort()
    const controller = new AbortController(); readControllerRef.current = controller
    loadingRef.current = true; setLoadingScope(requestedScope); setLoadError(null)
    const current = () => mountedRef.current && scopeRef.current === requestedScope && !disabledRef.current && readSequenceRef.current === sequence && !controller.signal.aborted
    try {
      const result = await dailyCampaignRequest({ workspaceId, productId, action: 'get_daily_campaign_status', signal: controller.signal, isCurrent: current })
      if (!current()) return false
      const next = dailyCampaignStatusResponse(result)
      setStored({ scope: requestedScope, value: next })
      return next
    } catch (error) {
      if (!current()) return false
      setLoadError({ scope: requestedScope, text: safeRequestError(error, false) })
      return false
    } finally { if (current()) { loadingRef.current = false; setLoadingScope('') } }
  }, [workspaceId, productId])

  useEffect(() => {
    readSequenceRef.current += 1; actionSequenceRef.current += 1
    readControllerRef.current?.abort(); actionControllerRef.current?.abort()
    actionLockRef.current = null; loadingRef.current = false
    setStored(null); setSettingsDraft(null); setSelection(null); setCopyDraft(null); setLoadError(null); setNotice(null); setBusyScope(''); setLoadingScope('')
    if (scope && !disabled) void refresh()
    return () => { readSequenceRef.current += 1; actionSequenceRef.current += 1; readControllerRef.current?.abort(); actionControllerRef.current?.abort() }
  }, [scope, disabled, refresh])

  useEffect(() => {
    if (canEdit === true && !disabled) return
    actionSequenceRef.current += 1; actionControllerRef.current?.abort(); actionLockRef.current = null; setBusyScope(''); setSettingsDraft(null); setCopyDraft(null)
  }, [canEdit, disabled])

  useEffect(() => {
    setVisible(false)
    if (!scope || disabled || !panelRef.current || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver(entries => { if (mountedRef.current && scopeRef.current === scope && !disabledRef.current) setVisible(entries.some(entry => entry.isIntersecting)) })
    observer.observe(panelRef.current)
    return () => observer.disconnect()
  }, [scope, disabled])

  useEffect(() => {
    if (!scope || disabled || data?.settings.enabled !== true || !visible || typeof document === 'undefined') return undefined
    const timer = setInterval(() => { if (!document.hidden && scopeRef.current === scope && !disabledRef.current && !loadingRef.current && !actionLockRef.current) void refresh() }, 60000)
    return () => clearInterval(timer)
  }, [scope, disabled, data?.settings.enabled, visible, refresh])

  const editableNow = () => !locked && mountedRef.current && scopeRef.current === scope && editRef.current && !loadingRef.current && !actionLockRef.current
  const updateSetting = (key, value) => { if (!editableNow()) return; setSettingsDraft({ scope, value: { ...form, [key]: value } }); setNotice(null) }
  const updateCopy = (key, value) => { if (!editableNow() || copyLocked || selectedRef.current !== selected?.id) return; setCopyDraft({ scope, id: selected.id, value: { ...copy, [key]: value } }); setNotice(null) }

  const save = async (e, kind) => {
    e.preventDefault()
    if (!editableNow() || (kind === 'copy' && (copyLocked || selectedRef.current !== selected?.id))) return false
    let payload
    try { payload = kind === 'settings' ? dailyCampaignSettingsPayload(form) : dailyCampaignCopyPayload(selected, copy) } catch (error) { setNotice({ scope, tone: 'error', text: error.message }); return false }
    const requestedScope = scope, sequence = ++actionSequenceRef.current
    const controller = new AbortController(); actionControllerRef.current = controller
    actionLockRef.current = { scope: requestedScope, sequence }; setBusyScope(requestedScope); setNotice(null)
    const current = () => mountedRef.current && scopeRef.current === requestedScope && actionSequenceRef.current === sequence && !controller.signal.aborted && editRef.current
    try {
      await dailyCampaignRequest({ workspaceId, productId, action: kind === 'settings' ? 'save_daily_campaign_settings' : 'update_daily_campaign', payload, campaign: selected, signal: controller.signal, isCurrent: current })
      if (!current()) return false
      const confirmed = await refresh({ afterSave: true })
      if (!current()) return false
      const verified = kind === 'settings' ? confirmed && JSON.stringify(confirmed.settings) === JSON.stringify(payload) : confirmed?.campaigns.some(record => record.id === payload.dailyCampaignId && record.status === 'draft' && record.subject === payload.subject && record.body === payload.body && record.app_store_url === selected.app_store_url)
      if (verified) { if (kind === 'settings') setSettingsDraft(null); else setCopyDraft(null) }
      setNotice({ scope: requestedScope, tone: verified ? 'success' : 'warning', text: verified ? kind === 'settings' ? 'Daily draft settings saved for this app only. No draft was run from this page; sending settings are unchanged.' : 'Email copy saved as a draft for human review. Sender, consent, recipients and sending schedule are unchanged.' : 'The write returned, but the saved state could not be verified. Refresh and review before trying again. No sending or approval action was requested.' })
      return Boolean(verified)
    } catch (error) {
      if (!current()) return false
      setNotice({ scope: requestedScope, tone: 'error', text: safeRequestError(error, true) })
      return false
    } finally { if (current()) { actionLockRef.current = null; setBusyScope('') } }
  }

  const choose = id => {
    if (!mountedRef.current || disabledRef.current || scopeRef.current !== scope || actionLockRef.current || !campaigns.some(record => record.id === id)) return
    setSelection({ scope, id }); setCopyDraft(null); setNotice(null)
  }
  const copyEmail = async () => {
    if (!mountedRef.current || disabledRef.current || scopeRef.current !== scope || selectedRef.current !== selected?.id || !selected || unavailable || loadingRef.current || actionLockRef.current) return
    const requestedScope = scope, id = selected.id
    const current = () => mountedRef.current && scopeRef.current === requestedScope && selectedRef.current === id && !disabledRef.current
    try {
      if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') throw new Error('Clipboard unavailable')
      // User-triggered only; copy actual saved text, not an unverified edit.
      await navigator.clipboard.writeText(`Subject: ${selected.subject}\n\n${selected.body}`)
      if (current()) setNotice({ scope: requestedScope, tone: 'success', text: 'Saved email text copied. It is still a draft for human review; nothing was sent.' })
    } catch { if (current()) setNotice({ scope: requestedScope, tone: 'error', text: 'Could not copy email text. Select the saved subject and body below to copy them manually.' }) }
  }

  const enabled = data?.settings.enabled === true
  const scheduled = enabled && data?.deployment.configured === true
  const stateLabel = !data ? 'Status unavailable' : unavailable ? 'Status needs refresh' : !enabled ? 'Disabled' : scheduled ? 'Enabled · server scheduled' : 'Enabled · pending deployment'
  const timezone = data?.settings.timezone || DAILY_CAMPAIGN_DEFAULTS.timezone

  return <section className="es-card" ref={panelRef} aria-label="Daily campaign draft library">
    <div className="es-section-head"><div><div className="es-kicker">DAILY CAMPAIGN DRAFTS / SELECTED APP ONLY</div><h2>Daily draft library for {appName || 'this app'}</h2></div><span className={`es-badge es-badge--${unavailable || (enabled && !scheduled) ? 'warning' : 'neutral'}`}>{stateLabel}</span></div>
    <p>Reusable email campaign drafts from this app’s saved listing. Every record remains a draft for human review, never an approved email.</p>
    <p className="es-help">Listing-based templates, not AI-generated copy: no extra AI charges for this draft library. It does not change the sender, consent, recipients or sending schedule, and never sends or approves email.</p>
    {!scope && <div className="es-alert es-alert--warning" role="note">Select an app in an active workspace to view its daily drafts.</div>}
    {disabled && <p className="es-help" role="note">This panel is temporarily disabled. No refresh or save is performed.</p>}
    {canEdit !== true && <p className="es-help" role="note">Read-only access. Only a workspace owner or admin may save draft settings or email copy; the server independently verifies permissions and app scope.</p>}
    {loading && <p className="es-help" role="status">Refreshing this app’s actual draft library…</p>}
    {unavailable && <div className="es-alert es-alert--error" role="alert"><strong>Daily draft status unavailable.</strong><p>{loadError.text}</p><p>Previously loaded records, if any, may be stale.</p></div>}
    {notice?.scope === scope && <div className={`es-alert es-alert--${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'} aria-live="polite">{notice.text}</div>}
    {enabled && !scheduled && <p className="es-help"><strong>Pending deployment:</strong> enabled settings are saved, but the dedicated draft worker is not confirmed configured. This page cannot activate it or confirm a run.</p>}
    {data?.deployment.blockerCount > 0 && <p className="es-help">Server reports {data.deployment.blockerCount} deployment blocker(s). Ask an administrator to review the worker configuration.</p>}
    <dl className="es-review-grid" aria-label="Actual daily draft status">
      <div><dt>Saved local draft start</dt><dd>{data ? `${String(data.settings.startHour).padStart(2, '0')}:00 · ${timezone}` : 'Not confirmed'}<small>Draft creation only, not an email send time.</small></dd></div>
      <div><dt>Today · server report</dt><dd>{dayLabel(data?.today?.scheduled_day ?? data?.today?.localDate)}<small>{data?.today?.created === true || data?.today?.status === 'draft' ? 'Draft reported for human review' : data?.today?.created === false ? 'No draft created today, as reported by the server' : 'No confirmed draft status reported for today'}</small></dd></div>
    </dl>
    <form onSubmit={e => save(e, 'settings')} aria-label="Daily draft settings"><fieldset disabled={locked}>
      <label className="es-check"><input type="checkbox" aria-label="Enable daily campaign drafts for this app" checked={form.enabled === true} onChange={e => updateSetting('enabled', e.target.checked)} /><span>Enable daily campaign drafts for <strong>{appName || 'this app'}</strong> only. Changes apply only after saving.</span></label>
      <div className="es-form-grid">
        <label className="es-field"><span>Draft timezone</span><input required maxLength={100} value={form.timezone} onChange={e => updateSetting('timezone', e.target.value)} placeholder="America/New_York" /><small>IANA timezone; default America/New_York.</small></label>
        <label className="es-field"><span>Local daily draft start</span><select value={form.startHour} onChange={e => updateSetting('startHour', e.target.value)}>{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>)}</select><small>Default 07:00. Independent of research and sending.</small></label>
      </div>
      <div className="es-actions"><button type="submit" className="es-button" disabled={locked || (!settingsDirty && data?.settingsSaved)}>{busy ? 'Saving…' : 'Save daily draft settings'}</button><span className="es-muted">{settingsDirty ? 'Unsaved settings for this app only' : data?.settingsSaved ? 'Saved settings' : 'Disabled defaults'}</span></div>
    </fieldset></form>
    <div className="es-actions"><button type="button" className="es-button es-button--secondary" disabled={!scope || disabled || loading || busy} onClick={() => { if (scopeRef.current === scope) void refresh() }}>Refresh draft library</button></div>
    <p className="es-help">Refreshing only reads status; it does not create or execute drafts. Automatic 60-second refresh is read-only, for saved enabled settings while this panel is visible. Only the server worker creates daily drafts.</p>
    {selected && <article className="es-draft" aria-label="Selected saved daily draft">
      <div className="es-section-head"><h3>{selected.name || 'Saved daily campaign'} · {dayLabel(selected.scheduled_day)}</h3><span className="es-badge">{selected.status === 'draft' ? 'Draft · human review required' : 'Draft status unconfirmed'}</span></div>
      <p className="es-help">{selected.content_source === 'listing_template' ? 'Source: listing-based template (not AI copy)' : 'Content source unconfirmed'} · Created {timestamp(selected.created_at, timezone)} · Updated {timestamp(selected.updated_at, timezone)} · {timezone}</p>
      {selected.app_store_url ? <p className="es-help"><a href={selected.app_store_url} target="_blank" rel="noopener noreferrer">{selected.app_store_url}</a></p> : <p className="es-help" role="note">Canonical App Store link unavailable or unsafe. Copy editing is disabled until the server confirms this app’s listing.</p>}
      <div className="es-preview" aria-label="Actual saved email copy"><p><strong>Saved subject:</strong> {selected.subject || 'Subject not reported'}</p><p style={{ whiteSpace: 'pre-wrap' }}>{selected.body || 'Body not reported'}</p></div>
      <form onSubmit={e => save(e, 'copy')} aria-label="Edit saved daily draft"><fieldset disabled={copyLocked}>
        <label className="es-field"><span>Draft subject</span><input required maxLength={180} value={copy.subject} onChange={e => updateCopy('subject', e.target.value)} /><small>At most 180 characters. No misleading Re: or Fwd: prefixes.</small></label>
        <label className="es-field"><span>Draft email body</span><textarea required rows={9} maxLength={6000} value={copy.body} onChange={e => updateCopy('body', e.target.value)} /><small>Plain text, at most 6,000 characters. Keep the exact saved App Store link above as the only link in the body. Saving retains draft status; human review is still required.</small></label>
        <div className="es-actions"><button type="submit" className="es-button" disabled={copyLocked || !copyDirty}>{busy ? 'Saving…' : 'Save email copy as draft'}</button><span className="es-muted">{copyDirty ? 'Unsaved email copy' : 'Actual saved copy'}</span></div>
      </fieldset></form>
      <div className="es-actions"><button type="button" className="es-button es-button--secondary" disabled={disabled || unavailable || loading || busy} onClick={() => { void copyEmail() }}>Copy saved email text</button></div>
    </article>}
    <details className="es-disclosure" open><summary>Actual dated draft history ({campaigns.length} · newest 30)</summary>
      {!campaigns.length ? <p className="es-help">{data ? 'No saved daily campaign drafts reported for this app.' : 'Draft history is unavailable until an authenticated status refresh succeeds.'} No illustrative records are generated.</p> : <ul className="es-queue">{campaigns.map(record => <li key={record.id}><span><strong>{dayLabel(record.scheduled_day)} · {record.name || 'Saved daily campaign'}</strong><small>{record.subject || 'Subject not reported'}</small><small>Updated {timestamp(record.updated_at, timezone)} · {timezone}</small></span><button type="button" className="es-button es-button--secondary" aria-pressed={selected?.id === record.id} disabled={disabled || loading || busy} onClick={() => choose(record.id)}>View draft · {dayLabel(record.scheduled_day)}</button></li>)}</ul>}
    </details>
  </section>
}
