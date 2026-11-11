import { useCallback, useEffect, useRef, useState } from 'react'
import { authenticatedJsonHeaders } from '../lib/authenticatedApi'
import { trackFloEvent } from '../lib/observability'

export const DAILY_RESEARCH_DEFAULTS = Object.freeze({ enabled: false, dailyTarget: 80, dailyRequestLimit: 8, timezone: 'America/New_York', startHour: 6, query: '' })
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null
const shown = value => count(value) ?? '—'
const event = (name, flags = {}) => { void trackFloEvent(`email_studio_daily_research_${name}`, flags).catch(() => {}) }

export function researchSettingsPayload(value) {
  if (typeof value?.enabled !== 'boolean') throw new Error('Choose whether daily candidate research is enabled.')
  const dailyTarget = Number(value.dailyTarget)
  const dailyRequestLimit = Number(value.dailyRequestLimit)
  const startHour = Number(value.startHour)
  if ([value.dailyTarget, value.dailyRequestLimit, value.startHour].some(number => !['number', 'string'].includes(typeof number))) throw new Error('Target, paid AI limit and local start hour must be whole numbers.')
  if (value.dailyTarget === '' || !Number.isInteger(dailyTarget) || dailyTarget < 1 || dailyTarget > 100) throw new Error('Daily target must be a whole number from 1 to 100.')
  if (value.dailyRequestLimit === '' || !Number.isInteger(dailyRequestLimit) || dailyRequestLimit < 1 || dailyRequestLimit > 10) throw new Error('Paid AI call limit must be a whole number from 1 to 10.')
  if (value.startHour === '' || !Number.isInteger(startHour) || startHour < 0 || startHour > 23) throw new Error('Choose a local start hour from 00:00 to 23:00.')
  const timezone = typeof value.timezone === 'string' ? value.timezone.trim() : ''
  if (!timezone || timezone.length > 100) throw new Error('Enter a valid IANA timezone, such as America/New_York.')
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format() } catch { throw new Error('Enter a valid IANA timezone, such as America/New_York.') }
  if (typeof value.query !== 'string' || value.query.length > 500) throw new Error('The optional research query must be at most 500 characters.')
  return { enabled: value.enabled, dailyTarget, dailyRequestLimit, timezone, startHour, query: value.query.trim() }
}

function confirmedSettings(value) {
  // Null means no settings exist yet; only that case uses disabled defaults.
  if (value === null) return { ...DAILY_RESEARCH_DEFAULTS }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Research settings could not be confirmed. Refresh before saving.')
  const normalized = { enabled: value.enabled, dailyTarget: value.dailyTarget ?? value.daily_target, dailyRequestLimit: value.dailyRequestLimit ?? value.daily_request_limit, timezone: value.timezone, startHour: value.startHour ?? value.start_hour, query: value.query }
  if (!Number.isInteger(normalized.dailyTarget) || !Number.isInteger(normalized.dailyRequestLimit) || !Number.isInteger(normalized.startHour)) throw new Error('Research settings could not be confirmed. Refresh before saving.')
  return researchSettingsPayload(normalized)
}

export function researchStatusResponse(value) {
  const research = value?.research
  const runs = research?.recentRuns ?? research?.recent_runs
  if (!research || typeof research !== 'object' || !Object.prototype.hasOwnProperty.call(research, 'settings') || !Array.isArray(runs) || !Object.prototype.hasOwnProperty.call(research, 'today') || (research.today !== null && (typeof research.today !== 'object' || Array.isArray(research.today)))) throw new Error('Daily research returned an incomplete status response. Refresh after the server setup is complete.')
  const today = research.today
  return {
    settings: confirmedSettings(research.settings),
    settingsSaved: research.settings !== null && research.settings?.settings_revision !== null,
    today: today === null ? null : { localDate: today.localDate ?? today.scheduled_day, found: today.found ?? today.verified, inserted: today.inserted, skipped: today.skipped, errors: today.errors, requestsUsed: today.requestsUsed ?? today.requests, remaining: today.remaining ?? today.remainingTarget ?? today.target_remaining },
    recentRuns: runs.filter(run => run && typeof run === 'object' && !Array.isArray(run)).map(run => ({ id: run.id, status: run.status ?? run.state, startedAt: run.startedAt ?? run.claimed_at, finishedAt: run.finishedAt ?? run.finished_at, found: run.found ?? run.verified_count, inserted: run.inserted ?? run.inserted_count, skipped: run.skipped ?? run.skipped_count, errors: run.errors, requestsUsed: run.requestsUsed ?? (Number.isSafeInteger(run.request_number) && run.request_number > 0 ? 1 : undefined) })),
    deployment: { configured: value.deployment?.configured === true, aiConfigured: value.deployment?.aiConfigured === true, modelConfigured: value.deployment?.modelConfigured === true },
  }
}

/**
 * Integration contract: POST /api/email-campaigns with Bearer auth and action.
 * get_research_status: { workspaceId, productId, action } (workspace members).
 * save_research_settings: same scope + enabled, dailyTarget, dailyRequestLimit,
 * timezone, startHour, query (owner/admin only, independently checked on server).
 * Status: { research: { settings, recent_runs, today }, deployment:
 * { configured, aiConfigured, modelConfigured } }. DB settings use daily_target,
 * daily_request_limit, start_hour, settings_revision. Today uses scheduled_day,
 * verified, inserted, skipped, requests, target_remaining (optional errors).
 * Runs use id, state, claimed_at, finished_at, verified_count, inserted_count,
 * skipped_count, request_number (one durable request reservation per run).
 * CamelCase API normalization is also accepted. Missing counts remain unknown.
 * Save returns { research: { settings, ...status }, deployment, message };
 * a separate status refresh confirms counts. No send or approval flags exist.
 */
export async function dailyResearchRequest({ workspaceId, productId, action, settings, signal, isCurrent = () => true }) {
  if (!workspaceId || !productId) throw new Error('Select an app in an active workspace before continuing.')
  if (!['get_research_status', 'save_research_settings'].includes(action)) throw new Error('Unsupported daily research action.')
  const payload = action === 'save_research_settings' ? researchSettingsPayload(settings) : {}
  const headers = await authenticatedJsonHeaders()
  // Auth lookup is asynchronous: never dispatch an old app's delayed action.
  if (signal?.aborted || !isCurrent()) { const error = new Error('Research request cancelled.'); error.name = 'AbortError'; throw error }
  const response = await fetch('/api/email-campaigns', { method: 'POST', headers, signal, body: JSON.stringify({ ...payload, workspaceId, productId, action }) })
  const result = await response.json().catch(() => null)
  if (!response.ok) {
    const messages = { 401: 'Sign in again before continuing.', 403: 'Your workspace role does not permit this research action.', 404: 'Daily research is not deployed. Ask an administrator to finish server setup.', 409: 'Research settings changed. Refresh and review before saving again.' }
    throw new Error(messages[response.status] || `Daily research request failed (HTTP ${response.status}). Refresh to confirm the saved state.`)
  }
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Daily research returned an invalid response. Refresh to confirm the saved state.')
  return result
}

function newInsertions(previous, next) {
  if (!previous) return false
  const before = count(previous.today?.inserted)
  const after = count(next.today?.inserted)
  if (after !== null && after > 0 && ((next.today?.localDate !== previous.today?.localDate) || (before !== null && after > before))) return true
  const earlierRuns = new Map(previous.recentRuns.filter(run => run.id).map(run => [run.id, count(run.inserted)]))
  return next.recentRuns.some(run => run.id && count(run.inserted) > 0 && (!earlierRuns.has(run.id) || count(run.inserted) > (earlierRuns.get(run.id) ?? 0)))
}

function runTime(value, timezone) {
  if (typeof value !== 'string' || !value || !Number.isFinite(Date.parse(value))) return 'Time unavailable'
  try { return new Intl.DateTimeFormat('en', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) } catch { return 'Time unavailable' }
}

export default function EmailDailyResearchPanel({ workspaceId, productId, appName, canEdit = false, deploymentReady = false, onCandidatesChanged }) {
  const scope = workspaceId && productId ? JSON.stringify([workspaceId, productId]) : ''
  const scopeRef = useRef(scope)
  scopeRef.current = scope
  const editRef = useRef(canEdit === true)
  editRef.current = canEdit === true
  const callbackRef = useRef(onCandidatesChanged)
  callbackRef.current = onCandidatesChanged
  const mountedRef = useRef(false)
  const readSequenceRef = useRef(0)
  const actionSequenceRef = useRef(0)
  const readControllerRef = useRef(null)
  const actionControllerRef = useRef(null)
  const actionLockRef = useRef(null)
  const loadingRef = useRef(false)
  const snapshotRef = useRef(null)
  const panelRef = useRef(null)
  const [stored, setStored] = useState(null)
  const [draft, setDraft] = useState(null)
  const [loadingScope, setLoadingScope] = useState('')
  const [busyScope, setBusyScope] = useState('')
  const [loadError, setLoadError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [visible, setVisible] = useState(false)
  const data = stored?.scope === scope ? stored.value : null
  const form = draft?.scope === scope ? draft.value : data?.settings || DAILY_RESEARCH_DEFAULTS
  const loading = Boolean(scope) && loadingScope === scope
  const busy = Boolean(scope) && busyScope === scope
  const locked = !scope || canEdit !== true || loading || busy || !data || loadError?.scope === scope
  const dirty = Boolean(data) && JSON.stringify(form) !== JSON.stringify(data.settings)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false; readSequenceRef.current += 1; actionSequenceRef.current += 1; readControllerRef.current?.abort(); actionControllerRef.current?.abort() }
  }, [])

  const refresh = useCallback(async ({ afterSave = false } = {}) => {
    const requestedScope = workspaceId && productId ? JSON.stringify([workspaceId, productId]) : ''
    if (!requestedScope || !mountedRef.current || scopeRef.current !== requestedScope || (actionLockRef.current && !afterSave)) return false
    const sequence = ++readSequenceRef.current
    readControllerRef.current?.abort()
    const controller = new AbortController()
    readControllerRef.current = controller
    loadingRef.current = true
    setLoadingScope(requestedScope)
    setLoadError(null)
    const current = () => mountedRef.current && scopeRef.current === requestedScope && readSequenceRef.current === sequence && !controller.signal.aborted
    try {
      const next = researchStatusResponse(await dailyResearchRequest({ workspaceId, productId, action: 'get_research_status', signal: controller.signal, isCurrent: current }))
      if (!current()) return false
      const previous = snapshotRef.current?.scope === requestedScope ? snapshotRef.current.value : null
      const changed = newInsertions(previous, next)
      snapshotRef.current = { scope: requestedScope, value: next }
      setStored({ scope: requestedScope, value: next })
      if (changed && typeof callbackRef.current === 'function') {
        try { Promise.resolve(callbackRef.current()).catch(() => {}) } catch { /* A parent refresh failure does not change research status. */ }
      }
      event('refreshed', { enabled: next.settings.enabled, foundCount: count(next.today?.found), insertedCount: count(next.today?.inserted) })
      return true
    } catch (error) {
      if (!current()) return false
      setLoadError({ scope: requestedScope, text: error?.message || 'Could not load daily research. Refresh to confirm its status.' })
      return false
    } finally {
      if (current()) { loadingRef.current = false; setLoadingScope('') }
    }
  }, [workspaceId, productId])

  useEffect(() => {
    readSequenceRef.current += 1
    actionSequenceRef.current += 1
    readControllerRef.current?.abort()
    actionControllerRef.current?.abort()
    actionLockRef.current = null
    loadingRef.current = false
    snapshotRef.current = null
    setStored(null); setDraft(null); setLoadError(null); setNotice(null); setBusyScope(''); setLoadingScope('')
    if (scope) void refresh()
    return () => { readSequenceRef.current += 1; actionSequenceRef.current += 1; readControllerRef.current?.abort(); actionControllerRef.current?.abort() }
  }, [scope, refresh])

  useEffect(() => {
    setVisible(false)
    // Poll only while this mounted panel is actually in the viewport. Without
    // IntersectionObserver, manual refresh remains available; fail closed.
    if (!scope || !panelRef.current || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver(entries => { if (mountedRef.current && scopeRef.current === scope) setVisible(entries.some(entry => entry.isIntersecting)) })
    observer.observe(panelRef.current)
    return () => observer.disconnect()
  }, [scope])

  useEffect(() => {
    if (!scope || data?.settings.enabled !== true || !visible || typeof document === 'undefined') return undefined
    const timer = setInterval(() => {
      if (!document.hidden && scopeRef.current === scope && !loadingRef.current && !actionLockRef.current) void refresh()
    }, 60000)
    // This reads status only; scheduling and paid research run exclusively on
    // the server. Opening or refreshing the panel never starts research.
    return () => clearInterval(timer)
  }, [scope, data?.settings.enabled, visible, refresh])

  const update = (key, value) => {
    if (locked || !mountedRef.current || scopeRef.current !== scope || !editRef.current || loadingRef.current || actionLockRef.current) return
    setDraft(previous => ({ scope, value: { ...(previous?.scope === scope ? previous.value : form), [key]: value } }))
    setNotice(null)
  }

  const save = async e => {
    e.preventDefault()
    if (locked || !mountedRef.current || scopeRef.current !== scope || !editRef.current || loadingRef.current || actionLockRef.current) return false
    let settings
    try { settings = researchSettingsPayload(form) } catch (error) { setNotice({ scope, tone: 'error', text: error.message }); return false }
    const requestedScope = scope
    const sequence = ++actionSequenceRef.current
    const controller = new AbortController()
    actionControllerRef.current = controller
    actionLockRef.current = { scope: requestedScope, sequence }
    setBusyScope(requestedScope)
    setNotice(null)
    const current = () => mountedRef.current && scopeRef.current === requestedScope && actionSequenceRef.current === sequence && !controller.signal.aborted
    const canDispatch = () => current() && editRef.current
    event('save_requested', { enabled: settings.enabled, dailyTarget: settings.dailyTarget, dailyRequestLimit: settings.dailyRequestLimit })
    try {
      const result = await dailyResearchRequest({ workspaceId, productId, action: 'save_research_settings', settings, signal: controller.signal, isCurrent: canDispatch })
      if (!current()) return false
      if (!result.research?.settings) throw new Error('The save could not be confirmed. Refresh before making another change.')
      const saved = confirmedSettings(result.research.settings)
      setStored(previous => previous?.scope === requestedScope ? { scope: requestedScope, value: { ...previous.value, settings: saved, settingsSaved: true } } : previous)
      setDraft(null)
      const refreshed = await refresh({ afterSave: true })
      if (!current()) return false
      setNotice({ scope: requestedScope, tone: refreshed ? 'success' : 'warning', text: `Research settings saved for this app only. No email sends, opt-in approvals, or ads were enabled.${refreshed ? '' : ' Follow-up status refresh failed; refresh to confirm current totals.'}` })
      event('saved', { enabled: saved.enabled, dailyTarget: saved.dailyTarget, dailyRequestLimit: saved.dailyRequestLimit })
      return true
    } catch (error) {
      if (!current()) return false
      setNotice({ scope: requestedScope, tone: 'error', text: error?.message || 'Research save failed. Refresh to confirm the saved state.' })
      return false
    } finally {
      if (current()) { actionLockRef.current = null; setBusyScope('') }
    }
  }

  const enabled = data?.settings.enabled === true
  const unavailable = loadError?.scope === scope
  const cronReady = deploymentReady === true && data?.deployment.configured === true
  const aiReady = data?.deployment.aiConfigured === true && data?.deployment.modelConfigured === true
  const stateLabel = !data ? 'Status unavailable' : unavailable ? 'Status needs refresh' : !enabled ? 'Disabled' : !cronReady ? 'Enabled · pending deployment' : !aiReady ? 'Enabled · pending AI setup' : 'Enabled · server scheduled'
  const tone = unavailable || (enabled && (!cronReady || !aiReady)) ? 'warning' : 'neutral'
  const today = data?.today
  const runs = data?.recentRuns || []

  return <section className="es-card" ref={panelRef} aria-label="Daily candidate research">
    <div className="es-section-head"><div><div className="es-kicker">DAILY CANDIDATE RESEARCH / SELECTED APP ONLY</div><h2>Daily research for {appName || 'this app'}</h2></div><span className={`es-badge es-badge--${tone}`}>{stateLabel}</span></div>
    <p>Target 80 public business email addresses per app/day by default, with up to 8 paid AI calls/day. These are limits, not guaranteed results. Research uses public business sources only and saves candidates, not opt-ins.</p>
    <p className="es-help">This research schedule is independent of Gmail and sending status. It requires the workspace AI configuration. It never sends email, grants consent, approves drafts, or automatically creates ads.</p>
    <p className="es-help">Provider cost: at 25 apps, the default limit permits up to 200 paid AI requests/day across the portfolio, plus search and token charges. Actual verified new addresses may be fewer than 80/app/day; duplicates, unavailable public sources, errors, and budgets reduce results.</p>
    {!scope && <div className="es-alert es-alert--warning" role="note">Select an app in an active workspace to view its research settings.</div>}
    {canEdit !== true && <p className="es-help" role="note">Read-only access. Only a workspace owner or admin may save research settings; the server independently verifies the selected workspace and app.</p>}
    {loading && <p className="es-help" role="status">Refreshing this app’s actual research status…</p>}
    {unavailable && <div className="es-alert es-alert--error" role="alert"><strong>Daily research status unavailable.</strong><p>{loadError.text}</p><p>Previously loaded totals, if any, may be stale.</p></div>}
    {notice?.scope === scope && <div className={`es-alert es-alert--${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'} aria-live="polite">{notice.text}</div>}
    {enabled && !cronReady && <p className="es-help"><strong>Pending deployment:</strong> enabled settings are saved, but the dedicated email research cron is not confirmed configured. This page cannot activate it or confirm any run.</p>}
    {data && !aiReady && <p className="es-help"><strong>Research AI setup required:</strong> the workspace AI provider and research model must both be configured. Gmail connection and sending approvals do not satisfy this requirement.</p>}
    <dl className="es-review-grid" aria-label="Actual daily research counts">
      <div><dt>Saved daily target</dt><dd>{data ? data.settings.dailyTarget : DAILY_RESEARCH_DEFAULTS.dailyTarget} addresses / app / day<small>{data?.settingsSaved ? 'Saved ceiling, not a result' : 'Disabled default; not a saved target'}</small></dd></div>
      <div><dt>Found today · actual</dt><dd>{shown(today?.found)}<small>{typeof today?.localDate === 'string' ? today.localDate : 'Local date unavailable'} · {data?.settings.timezone || DAILY_RESEARCH_DEFAULTS.timezone}</small></dd></div>
      <div><dt>Inserted candidates today</dt><dd>{shown(today?.inserted)}</dd></div>
      <div><dt>Skipped today</dt><dd>{shown(today?.skipped)}</dd></div>
      <div><dt>Errors today</dt><dd>{shown(today?.errors)}</dd></div>
      <div><dt>Remaining target today</dt><dd>{shown(today?.remaining)}<small>Server-reported remaining; no estimated yield</small></dd></div>
      <div className="es-wide"><dt>AI requests reserved today / daily limit</dt><dd>{shown(today?.requestsUsed)} / {data?.settings.dailyRequestLimit ?? DAILY_RESEARCH_DEFAULTS.dailyRequestLimit}<small>Reserved attempts consume the limit, including failed or expired runs. Provider calls may incur cost even when no new candidate is found; a reservation alone does not prove a paid call occurred.</small></dd></div>
    </dl>
    <form onSubmit={save} aria-label="Daily research settings">
      <fieldset disabled={locked}>
        <label className="es-check"><input type="checkbox" aria-label="Enable daily candidate research for this app" checked={form.enabled === true} onChange={e => update('enabled', e.target.checked)} /><span>Enable daily candidate research for <strong>{appName || 'this app'}</strong> only. This change is not applied until you save.</span></label>
        {form.enabled && !enabled && !cronReady && <p className="es-help">Enabling will remain pending deployment until the dedicated research cron is configured; it does not start research now.</p>}
        <div className="es-form-grid">
          <label className="es-field"><span>Daily address target</span><input type="number" min={1} max={100} step={1} required value={form.dailyTarget} onChange={e => update('dailyTarget', e.target.value)} /><small>1–100 candidates for this app; default 80.</small></label>
          <label className="es-field"><span>Paid AI call limit / day</span><input type="number" min={1} max={10} step={1} required value={form.dailyRequestLimit} onChange={e => update('dailyRequestLimit', e.target.value)} /><small>1–10 paid calls; default up to 8/day.</small></label>
          <label className="es-field"><span>Local daily start</span><select value={form.startHour} onChange={e => update('startHour', e.target.value)}>{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>)}</select><small>Default 06:00, interpreted in the timezone below.</small></label>
          <label className="es-field"><span>Research timezone</span><input required maxLength={100} value={form.timezone} onChange={e => update('timezone', e.target.value)} placeholder="America/New_York" /><small>IANA timezone; not your device’s clock.</small></label>
          <label className="es-field es-wide"><span>Optional research query</span><textarea rows={3} maxLength={500} value={form.query} onChange={e => update('query', e.target.value)} placeholder="Leave blank to derive research from the selected app’s saved facts" /><small>At most 500 characters. Public business sources only; do not paste private contact lists.</small></label>
        </div>
        <div className="es-actions"><button type="submit" className="es-button" disabled={locked || (!dirty && data?.settingsSaved === true)}>{busy ? 'Saving research settings…' : 'Save research settings'}</button><span className="es-muted">{dirty ? 'Unsaved changes for this app only' : data?.settingsSaved ? 'Saved settings' : 'Disabled defaults'}</span></div>
      </fieldset>
    </form>
    <div className="es-actions"><button type="button" className="es-button es-button--secondary" disabled={!scope || loading || busy} onClick={() => { if (scopeRef.current === scope) void refresh() }}>Refresh research status</button></div>
    <p className="es-help">Status refresh does not run research. Automatic 60-second refresh is read-only and occurs only while this enabled app’s panel is visible. Actual runs are performed by the dedicated server research worker.</p>
    <details className="es-disclosure" open><summary>Actual recent research runs ({runs.length})</summary>
      {!runs.length ? <p className="es-help">{data ? 'No recent research runs reported for this app.' : 'Run history is unavailable until an authenticated status refresh succeeds.'} No activity or counts are invented.</p> : <ul className="es-queue">{runs.map((run, index) => <li key={run.id || index}><span><strong>{runTime(run.startedAt, data.settings.timezone)}</strong><small>Finished: {run.finishedAt ? runTime(run.finishedAt, data.settings.timezone) : 'Not reported'} · {data.settings.timezone}</small><small>Found {shown(run.found)} · Inserted {shown(run.inserted)} · Skipped {shown(run.skipped)} · Errors {shown(run.errors)} · AI requests reserved {shown(run.requestsUsed)}</small></span><span className="es-badge">{['pending', 'claimed', 'running', 'completed', 'partial', 'failed', 'expired', 'skipped', 'cancelled'].includes(run.status) ? run.status : 'Status unavailable'}</span></li>)}</ul>}
    </details>
  </section>
}
