import { useCallback, useEffect, useRef, useState } from 'react'
import { getEmailWorkspaceAutomation } from '../lib/emailWorkspaceAutomationClient'
import { emailCampaignAction } from '../lib/emailCampaignClient'
import { dailyCampaignStatusResponse, safeDailyCampaignAppUrl, dailyCampaignCopyPayload } from './EmailDailyCampaignPanel'

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)
const label = value => typeof value === 'string' && Boolean(value.trim()) && value.length <= 200 && !/[\x00-\x1f\x7f<>@]/.test(value)
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
const invalid = () => { throw new Error('The saved draft status could not be verified.') }
const contentOnly = value => !/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value) && !/^(?:to|cc|b[c]c|from|reply-to)\s*:/im.test(value)
const plainCopy = record => typeof record.subject === 'string' && typeof record.body === 'string' && record.subject.length <= 180 && record.body.length <= 6000 && !/[\x00-\x1f\x7f<>]/.test(record.subject) && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f<>]/.test(record.body) && contentOnly(record.subject) && contentOnly(record.body)

/** Project only the exact, complete authorized active app set; ignore other metadata. */
export function workspaceDraftAppsResponse(value, workspaceId) {
  const automation = value?.automation
  if (!uuid(workspaceId) || !object(automation) || automation.workspace_id !== workspaceId || !/^[a-f0-9]{32}$/i.test(automation.reviewRevision || '') || automation.truncated !== false || !Array.isArray(automation.apps) || automation.apps.length > 200 || !object(automation.totals) || !Number.isSafeInteger(automation.totals.activeApps) || automation.totals.activeApps !== automation.apps.length) invalid()
  const seen = new Set()
  return automation.apps.map(app => {
    if (!object(app) || !uuid(app.id) || seen.has(app.id.toLowerCase()) || !label(app.name) || (Object.hasOwn(app, 'workspace_id') && app.workspace_id !== workspaceId)) invalid()
    seen.add(app.id.toLowerCase())
    return { id: app.id, name: app.name }
  })
}

/** Check raw scope BEFORE the existing normalizer drops workspace/product IDs. */
export function workspaceDailyDraftResponse(value, workspaceId, productId) {
  if (!uuid(workspaceId) || !uuid(productId)) invalid()
  const daily = value?.dailyCampaign
  if (!object(daily) || !object(daily.settings) || daily.settings.workspace_id !== workspaceId || daily.settings.product_id !== productId || !Array.isArray(daily.campaigns) || daily.campaigns.length > 30 || !object(daily.today) || !date(daily.today.scheduled_day) || typeof daily.today.created !== 'boolean') invalid()
  for (const key of ['workspace_id', 'product_id']) {
    if (Object.hasOwn(daily.today, key) && daily.today[key] !== (key === 'workspace_id' ? workspaceId : productId)) invalid()
  }
  const seen = new Set(), days = new Set()
  for (const record of daily.campaigns) {
    if (!object(record) || record.workspace_id !== workspaceId || record.product_id !== productId || !uuid(record.id) || seen.has(record.id.toLowerCase()) || !date(record.scheduled_day) || days.has(record.scheduled_day)) invalid()
    seen.add(record.id.toLowerCase()); days.add(record.scheduled_day)
  }
  const normalized = dailyCampaignStatusResponse(value)
  const day = daily.today.scheduled_day
  const record = normalized.campaigns.find(item => item.scheduled_day === day)
  const base = { day, timezone: normalized.settings.timezone }
  if (!record) return { ...base, state: 'missing', record: null }
  if (daily.today.created !== true || record.status !== 'draft' || !safeDailyCampaignAppUrl(record.app_store_url) || !plainCopy(record)) invalid()
  // Validate saved plain text and its exact listing URL without editing/trimming it.
  dailyCampaignCopyPayload(record, record)
  return { ...base, state: 'ready', record: Object.fromEntries(['id', 'scheduled_day', 'subject', 'body', 'app_store_url', 'status', 'created_at', 'updated_at'].map(key => [key, record[key]])) }
}

export function workspaceDraftCopyText(record, field) {
  if (!record || record.status !== 'draft' || !['subject', 'body', 'full'].includes(field) || !safeDailyCampaignAppUrl(record.app_store_url) || !plainCopy(record)) invalid()
  dailyCampaignCopyPayload(record, record)
  return field === 'full' ? `Subject: ${record.subject}\n\n${record.body}` : record[field]
}

const cancelled = () => { const error = new Error('Draft status read cancelled.'); error.name = 'AbortError'; return error }
const ensureCurrent = (signal, isCurrent) => { if (signal.aborted || !isCurrent()) throw cancelled() }

// A mount-local pool also bounds overlapping epochs when a mock/transport ignores
// cancellation. Waiting slots are cancellable; in-flight slots stay held until done.
function acquireRead(pool, signal, isCurrent) {
  ensureCurrent(signal, isCurrent)
  return new Promise((resolve, reject) => {
    const entry = {
      start() {
        signal.removeEventListener('abort', abort)
        try { ensureCurrent(signal, isCurrent) } catch (error) { reject(error); return }
        pool.active += 1
        resolve(() => {
          pool.active -= 1
          while (pool.active < 3 && pool.waiting.length) pool.waiting.shift().start()
        })
      },
    }
    const abort = () => { pool.waiting = pool.waiting.filter(item => item !== entry); reject(cancelled()) }
    if (pool.active < 3) entry.start()
    else { pool.waiting.push(entry); signal.addEventListener('abort', abort, { once: true }) }
  })
}
async function boundedRead(pool, signal, isCurrent, request) {
  ensureCurrent(signal, isCurrent)
  const release = await acquireRead(pool, signal, isCurrent)
  try {
    ensureCurrent(signal, isCurrent)
    const result = await request()
    ensureCurrent(signal, isCurrent)
    return result
  } finally { release() }
}

function safeReadError(error, workspace = false) {
  if (error?.status === 401 || error?.code === 'AUTH_REQUIRED') return 'Sign in again, then refresh.'
  if (error?.status === 403 || error?.code === 'WORKSPACE_ACCESS_REQUIRED') return 'Access could not be confirmed. Choose an accessible workspace, then refresh.'
  return workspace ? 'The complete active app set could not be verified. Refresh after server setup or access is restored.' : 'This app’s saved draft could not be verified. Refresh to try the read again.'
}
function savedTime(value, timezone) {
  if (typeof value !== 'string' || value.length > 64 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) return 'Time unavailable'
  try { return new Intl.DateTimeFormat('en', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) } catch { return 'Time unavailable' }
}

/** Mount inside .email-studio. Members may read; the server verifies access.
 * Only status reads and user-initiated text copying exist. No settings are changed.
 * Parent must disable/unmount this panel when authentication/access is unresolved.
 */
export default function EmailWorkspaceDraftsPanel({ workspaceId, workspaceName, disabled = false, onCopy }) {
  const scope = uuid(workspaceId) ? workspaceId : ''
  const contextRef = useRef({ scope, disabled, epoch: 0 })
  const before = contextRef.current
  if (before.scope !== scope || before.disabled !== disabled) contextRef.current = { scope, disabled, epoch: before.epoch + 1 }
  const epoch = contextRef.current.epoch
  const mountedRef = useRef(false), sequenceRef = useRef(0), controllerRef = useRef(null)
  const poolRef = useRef({ active: 0, waiting: [] }), snapshotRef = useRef(null)
  const copySequenceRef = useRef(0), copyLockRef = useRef(null), callbackRef = useRef(onCopy)
  callbackRef.current = onCopy
  const [stored, setStored] = useState(null), [loadingState, setLoadingState] = useState(null)
  const [loadError, setLoadError] = useState(null), [notice, setNotice] = useState(null), [copyState, setCopyState] = useState(null)
  const belongs = value => value?.scope === scope && value.epoch === epoch
  const data = belongs(stored) ? stored.value : null
  const loading = belongs(loadingState), unavailable = belongs(loadError), copying = belongs(copyState)
  const currentContext = tag => mountedRef.current && !contextRef.current.disabled && contextRef.current.scope === tag.scope && contextRef.current.epoch === tag.epoch && sequenceRef.current === tag.sequence

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false; sequenceRef.current += 1; copySequenceRef.current += 1; controllerRef.current?.abort(); snapshotRef.current = null; copyLockRef.current = null }
  }, [])

  const refresh = useCallback(async () => {
    const tag = { scope, epoch, sequence: sequenceRef.current + 1 }
    if (!scope || !mountedRef.current || contextRef.current.disabled || contextRef.current.scope !== scope || contextRef.current.epoch !== epoch) return false
    sequenceRef.current = tag.sequence
    controllerRef.current?.abort()
    const controller = new AbortController(); controllerRef.current = controller
    const current = () => currentContext(tag) && !controller.signal.aborted
    if (!current()) return false
    snapshotRef.current = null; copySequenceRef.current += 1; copyLockRef.current = null
    setStored(null); setLoadingState(tag); setLoadError(null); setNotice(null); setCopyState(null)
    const publish = value => {
      if (!current()) return
      const next = { ...tag, value }; snapshotRef.current = next; setStored(next)
    }
    try {
      const result = await boundedRead(poolRef.current, controller.signal, current, () => getEmailWorkspaceAutomation({ workspaceId: scope, signal: controller.signal, isCurrent: current }))
      if (!current()) return false
      const apps = workspaceDraftAppsResponse(result, scope)
      const rows = apps.map(app => ({ app, state: 'pending', record: null }))
      publish({ rows: [...rows] })
      let nextIndex = 0
      const worker = async () => {
        while (current() && nextIndex < apps.length) {
          const index = nextIndex++, app = apps[index]
          try {
            if (!current()) return
            const raw = await boundedRead(poolRef.current, controller.signal, current, () => emailCampaignAction({ workspaceId: scope, productId: app.id, action: 'get_daily_campaign_status', payload: {}, signal: controller.signal, isCurrent: current }))
            if (!current()) return
            rows[index] = { app, ...workspaceDailyDraftResponse(raw, scope, app.id) }
          } catch (error) {
            if (!current()) return
            rows[index] = { app, state: 'error', record: null, error: safeReadError(error) }
          }
          if (!current()) return
          publish({ rows: [...rows] })
        }
      }
      await Promise.all(Array.from({ length: Math.min(3, apps.length) }, () => worker()))
      if (!current()) return false
      return true
    } catch (error) {
      if (!current()) return false
      snapshotRef.current = null; setStored(null); setLoadError({ ...tag, text: safeReadError(error, true) })
      return false
    } finally { if (current()) setLoadingState(null) }
  }, [scope, epoch])

  useEffect(() => {
    sequenceRef.current += 1; copySequenceRef.current += 1; controllerRef.current?.abort()
    snapshotRef.current = null; copyLockRef.current = null
    setStored(null); setLoadingState(null); setLoadError(null); setNotice(null); setCopyState(null)
    if (scope && !disabled) void refresh()
    return () => { sequenceRef.current += 1; copySequenceRef.current += 1; controllerRef.current?.abort(); snapshotRef.current = null; copyLockRef.current = null }
  }, [scope, epoch, disabled, refresh])

  const copy = async (row, field) => {
    const tag = stored && { scope: stored.scope, epoch: stored.epoch, sequence: stored.sequence }
    const available = () => tag && currentContext(tag) && snapshotRef.current?.sequence === tag.sequence && snapshotRef.current?.epoch === tag.epoch && snapshotRef.current.value.rows.some(item => item === row && item.state === 'ready') && !controllerRef.current?.signal.aborted
    if (loading || unavailable || copying || copyLockRef.current || !available()) return false
    let value
    try { value = workspaceDraftCopyText(row.record, field) } catch { return false }
    const copySequence = ++copySequenceRef.current
    const current = () => available() && copySequenceRef.current === copySequence
    if (!current()) return false
    copyLockRef.current = copySequence; setCopyState(tag); setNotice(null)
    try {
      if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') throw new Error('Clipboard unavailable')
      if (!current()) return false
      await navigator.clipboard.writeText(value)
      if (!current()) return false
      setNotice({ ...tag, tone: 'success', text: 'Saved text copied. Human review is required; nothing was sent.' })
      try {
        const result = callbackRef.current?.({ productId: row.app.id, field })
        if (result && typeof result.catch === 'function') result.catch(() => {})
      } catch { /* Observability must not affect content copying. */ }
      return true
    } catch {
      if (!current()) return false
      setNotice({ ...tag, tone: 'warning', text: 'Clipboard unavailable. Select the saved text below and copy it manually.', manual: { productId: row.app.id, field, value } })
      return false
    } finally { if (current()) { copyLockRef.current = null; setCopyState(null) } }
  }

  const workspaceLabel = label(workspaceName) ? workspaceName : 'this workspace'
  const activeNotice = belongs(notice) && !loading && !unavailable ? notice : null
  return <section className="es-card" aria-label="Workspace daily drafts">
    <div className="es-section-head"><div><div className="es-kicker">WORKSPACE / CONTENT-ONLY DRAFTS</div><h2>Today’s saved drafts for {workspaceLabel}</h2></div></div>
    <p>Read-only saved subject, body and App Store listing for each authorized active app. Every draft requires human review. This panel only reads saved status and copies text you choose; it does not create or send anything.</p>
    <p className="es-help">Today means each app’s server-reported local day, not this device’s date. Only actual saved records and timestamps are shown. A server schedule is not a completion-time guarantee. Refreshing does not run the draft worker or change settings.</p>
    <div className="es-actions"><button type="button" className="es-button es-button--secondary" disabled={!scope || disabled || loading} onClick={() => { void refresh() }}>Refresh all</button></div>
    {!scope && <p className="es-help" role="note">Select a valid workspace to read its saved drafts.</p>}
    {disabled && <p className="es-help" role="note">Read access is paused. Refresh and copying are disabled.</p>}
    {loading && <p className="es-help" role="status">Reading the complete active app set and today’s saved drafts… Copying is disabled until this refresh completes.</p>}
    {unavailable && <div className="es-alert es-alert--error" role="alert"><strong>Workspace draft read error.</strong><p>{loadError.text}</p></div>}
    {activeNotice && <div className={`es-alert es-alert--${activeNotice.tone}`} role="status" aria-live="polite">{activeNotice.text}</div>}
    {data && <p className="es-help">Confirmed active apps: {data.rows.length}. Each row reports its own saved draft, missing record or read error; no readiness total is inferred.</p>}
    {data?.rows.length === 0 && <p className="es-help">The server returned a complete active app set with no active apps.</p>}
    {data?.rows.map(row => <article key={row.app.id} className="es-draft" aria-label={`Saved draft for ${row.app.name}`}>
      <div className="es-section-head"><h3>{row.app.name}</h3><span className="es-badge">{row.state === 'ready' ? 'Saved draft · human review required' : row.state === 'missing' ? 'Missing' : row.state === 'error' ? 'Read error' : 'Reading'}</span></div>
      <p className="es-help">Today · server-local day: {row.day || 'Not confirmed'}{row.timezone ? ` · ${row.timezone}` : ''}</p>
      {row.state === 'pending' && <p className="es-help">This app’s saved draft status has not yet been confirmed.</p>}
      {row.state === 'missing' && <p className="es-help">No saved draft for today’s exact server-local day was returned. Older drafts are not shown as today’s draft.</p>}
      {row.state === 'error' && <div className="es-alert es-alert--error" role="alert"><p>{row.error}</p><p>No draft readiness is confirmed for this app.</p></div>}
      {row.record && <div className="es-preview" aria-label="Actual saved content">
        <p className="es-help">Created {savedTime(row.record.created_at, row.timezone)} · Updated {savedTime(row.record.updated_at, row.timezone)} · {row.timezone}</p>
        <p><strong>App Store URL:</strong> <a href={row.record.app_store_url} target="_blank" rel="noopener noreferrer">{row.record.app_store_url}</a></p>
        <p><strong>Saved subject:</strong> {row.record.subject}</p>
        <p style={{ whiteSpace: 'pre-wrap' }}>{row.record.body}</p>
      </div>}
      <div className="es-actions">{[['subject', 'Copy subject'], ['body', 'Copy body'], ['full', 'Copy full text']].map(([field, title]) => <button key={field} type="button" className="es-button es-button--secondary" disabled={disabled || loading || unavailable || copying || row.state !== 'ready'} onClick={() => { void copy(row, field) }}>{title}</button>)}</div>
      {activeNotice?.manual?.productId === row.app.id && <label className="es-field"><span>Saved text for manual copy · {activeNotice.manual.field}</span><textarea readOnly rows={8} maxLength={6200} value={activeNotice.manual.value} aria-label={`Saved ${activeNotice.manual.field} for manual copy`} style={{ whiteSpace: 'pre-wrap' }} /></label>}
    </article>)}
  </section>
}
