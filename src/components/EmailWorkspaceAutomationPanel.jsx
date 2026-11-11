import { useCallback, useEffect, useRef, useState } from 'react'
import { getEmailWorkspaceAutomation, setEmailWorkspaceAutomation } from '../lib/emailWorkspaceAutomationClient'

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const count = value => Number.isSafeInteger(value) && value >= 0
const shown = value => count(value) ? value : '—'
const hour = value => Number.isInteger(value) && value >= 0 && value <= 23
const timezone = value => {
  if (typeof value !== 'string' || !value || value.length > 100) return false
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); return true } catch { return false }
}
const schedule = (startHour, zone) => `${String(startHour).padStart(2, '0')}:00 · ${zone}`
const booleanFields = ['researchEnabled', 'draftsEnabled', 'todayDraftCreated', 'deliveryEnabled', 'senderDetailsComplete']
const totalFields = ['activeApps', 'researchEnabled', 'draftsEnabled', 'todayDrafts', 'deliveryEnabled', 'optedInContacts', 'researchRequestCeiling']
const deploymentFields = ['researchConfigured', 'draftsConfigured', 'aiConfigured', 'sendingEnabled', 'deliveryConfigured']

/** Reject partial, truncated, duplicate or cross-workspace snapshots: all apps must be reviewable. */
export function workspaceAutomationStatusResponse(value, workspaceId) {
  const automation = value?.automation, deployment = value?.deployment
  const invalid = () => { throw new Error('Workspace automation status could not be confirmed. Refresh and review again.') }
  if (!workspaceId || !object(automation) || automation.workspace_id !== workspaceId || !/^[a-f0-9]{32}$/i.test(automation.reviewRevision || '') || automation.truncated !== false || !Array.isArray(automation.apps) || !object(automation.totals) || !object(deployment)) invalid()
  if (!totalFields.every(key => count(automation.totals[key])) || !deploymentFields.every(key => typeof deployment[key] === 'boolean') || !count(deployment.workspaceDailyRequestLimit) || deployment.workspaceDailyRequestLimit < 1) invalid()
  const seen = new Set()
  const apps = automation.apps.map(app => {
    if (!object(app) || typeof app.id !== 'string' || !app.id || seen.has(app.id) || typeof app.name !== 'string' || !app.name.trim() || !booleanFields.every(key => typeof app[key] === 'boolean') || !Number.isInteger(app.researchTarget) || app.researchTarget < 1 || app.researchTarget > 100 || !Number.isInteger(app.researchRequestLimit) || app.researchRequestLimit < 1 || app.researchRequestLimit > 10 || !timezone(app.researchTimezone) || !timezone(app.draftTimezone) || !hour(app.researchStartHour) || !hour(app.draftStartHour) || !count(app.optedInCount)) invalid()
    seen.add(app.id)
    return Object.fromEntries(['id', 'name', ...booleanFields, 'researchTarget', 'researchRequestLimit', 'researchTimezone', 'researchStartHour', 'draftTimezone', 'draftStartHour', 'optedInCount'].map(key => [key, app[key]]))
  })
  const actual = { activeApps: apps.length, researchEnabled: apps.filter(app => app.researchEnabled).length, draftsEnabled: apps.filter(app => app.draftsEnabled).length, todayDrafts: apps.filter(app => app.todayDraftCreated).length, deliveryEnabled: apps.filter(app => app.deliveryEnabled).length, optedInContacts: apps.reduce((sum, app) => sum + app.optedInCount, 0) }
  if (!Object.keys(actual).every(key => actual[key] === automation.totals[key])) invalid()
  return { automation: { workspace_id: workspaceId, reviewRevision: automation.reviewRevision, apps, totals: Object.fromEntries(totalFields.map(key => [key, automation.totals[key]])), truncated: false }, deployment: Object.fromEntries([...deploymentFields, 'workspaceDailyRequestLimit'].map(key => [key, deployment[key]])) }
}

/** A 2xx response or a server message alone never proves the requested change was applied. */
export function workspaceAutomationAppliedResponse(result, reviewed, enabled) {
  const next = workspaceAutomationStatusResponse(result, reviewed.automation.workspace_id)
  const before = reviewed.automation.apps, after = next.automation.apps
  // Starting may also reattribute an already-enabled schedule whose enabling
  // actor is no longer an admin. The snapshot does not expose that private actor.
  const validChanges = (changes, key) => count(changes) && changes >= before.filter(app => app[key] !== enabled).length && changes <= before.length && (enabled || changes === before.filter(app => app[key]).length)
  if (result.applied !== true || result.mode !== 'research_and_drafts' || result.deliveryChanged !== 0 || !validChanges(result.researchChanged, 'researchEnabled') || !validChanges(result.draftsChanged, 'draftsEnabled') || after.length !== before.length) throw new Error('Unconfirmed workspace automation change.')
  const previous = new Map(before.map(app => [app.id, app]))
  const unchanged = ['name', 'researchTarget', 'researchRequestLimit', 'researchTimezone', 'researchStartHour', 'draftTimezone', 'draftStartHour', 'deliveryEnabled', 'senderDetailsComplete']
  if (!after.every(app => previous.has(app.id) && app.researchEnabled === enabled && app.draftsEnabled === enabled && unchanged.every(key => app[key] === previous.get(app.id)[key]))) throw new Error('Unconfirmed workspace automation change.')
  return next
}

function safeError(error, write = false) {
  const messages = { 401: 'Sign in again, then refresh before continuing.', 403: 'Only a current workspace owner or admin can change daily automation.', 404: 'Workspace automation is not deployed. Ask an administrator to finish server setup.', 409: 'The active app set or saved settings changed. Refresh and review the exact app list again.' }
  const codes = { AUTH_REQUIRED: messages[401], WORKSPACE_ADMIN_REQUIRED: messages[403], EMAIL_WORKSPACE_REVIEW_STALE: messages[409], WORKSPACE_ACCESS_REQUIRED: 'This workspace is not available to your account. Choose an accessible workspace and refresh.', EMAIL_WORKSPACE_DEPLOYMENT_BLOCKED: 'The secured research and draft workers and workspace AI are not ready. No partial start was made. Refresh after server setup.', EMAIL_WORKSPACE_AUTOMATION_LIMIT: 'The complete active app set exceeds the supported limit. No partial change was made.', EMAIL_WORKSPACE_NO_APPS: 'This workspace has no active apps to start or pause.', EMAIL_WORKSPACE_RESEARCH_CONFIRM_REQUIRED: 'Review the complete active app set and acknowledge recurring research costs before starting.' }
  return codes[error?.code] || messages[error?.status] || (write ? 'The change could not be confirmed. Refresh to check actual server state before reviewing again. No sending or consent action was requested.' : 'Workspace automation status is unavailable or incomplete. Refresh to confirm the exact active app set and server setup.')
}

/**
 * Render inside .email-studio, above selected-app controls. The parent supplies
 * its current-page, scope-safe connection/readiness and existing secure Google
 * flow as onConnect(). No credentials, provider calls or sending actions live here.
 * The client MUST honor signal/isCurrent after asynchronous authentication and
 * force workspaceId; the server independently checks role and reviewRevision.
 */
export default function EmailWorkspaceAutomationPanel({ workspaceId, workspaceName, canEdit = false, disabled = false, connection, readiness, onConnect, onChanged, onDailyCheck }) {
  const scope = typeof workspaceId === 'string' ? workspaceId : ''
  const contextRef = useRef({ scope, disabled, canEdit: canEdit === true, scopeEpoch: 0, editEpoch: 0 })
  const previousContext = contextRef.current
  const scopeChanged = previousContext.scope !== scope || previousContext.disabled !== disabled
  if (scopeChanged || previousContext.canEdit !== (canEdit === true)) contextRef.current = { scope, disabled, canEdit: canEdit === true, scopeEpoch: previousContext.scopeEpoch + (scopeChanged ? 1 : 0), editEpoch: previousContext.editEpoch + 1 }
  const context = contextRef.current
  const callbacksRef = useRef({ onConnect, onChanged, onDailyCheck }); callbacksRef.current = { onConnect, onChanged, onDailyCheck }
  const connectionRef = useRef(connection); connectionRef.current = connection
  const mountedRef = useRef(false), readSequenceRef = useRef(0), actionSequenceRef = useRef(0)
  const readControllerRef = useRef(null), actionControllerRef = useRef(null)
  const snapshotRef = useRef(null), reviewRef = useRef(null), actionLockRef = useRef(null), loadingRef = useRef(false)
  const reviewHeadingRef = useRef(null)
  const [stored, setStored] = useState(null), [review, setReview] = useState(null)
  const [loadingState, setLoadingState] = useState(null), [busyState, setBusyState] = useState(null)
  const [loadError, setLoadError] = useState(null), [notice, setNotice] = useState(null)
  const belongs = value => value?.scope === scope && value.scopeEpoch === context.scopeEpoch
  const data = belongs(stored) ? stored.value : null
  const snapshotKey = data ? JSON.stringify(data) : ''
  const loading = belongs(loadingState), busy = belongs(busyState)
  const unavailable = belongs(loadError)
  const activeReview = belongs(review) && review.editEpoch === context.editEpoch && review.snapshotKey === snapshotKey && canEdit === true && !disabled && !unavailable ? review : null
  reviewRef.current = activeReview
  const locked = !scope || disabled || canEdit !== true || loading || busy || !data || unavailable || data.automation.apps.length === 0
  const startReady = data?.deployment.researchConfigured === true && data?.deployment.aiConfigured === true && data?.deployment.draftsConfigured === true

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false; readSequenceRef.current += 1; actionSequenceRef.current += 1; readControllerRef.current?.abort(); actionControllerRef.current?.abort() }
  }, [])

  const refresh = useCallback(async () => {
    const requestedContext = contextRef.current
    if (!scope || requestedContext.scope !== scope || requestedContext.disabled || !mountedRef.current || actionLockRef.current) return false
    const sequence = ++readSequenceRef.current
    readControllerRef.current?.abort()
    const controller = new AbortController(); readControllerRef.current = controller
    const tag = { scope, scopeEpoch: requestedContext.scopeEpoch }
    loadingRef.current = true; setLoadingState(tag); setLoadError(null)
    const current = () => mountedRef.current && !controller.signal.aborted && readSequenceRef.current === sequence && contextRef.current.scope === scope && contextRef.current.scopeEpoch === tag.scopeEpoch && !contextRef.current.disabled
    try {
      const result = await getEmailWorkspaceAutomation({ workspaceId: scope, signal: controller.signal, isCurrent: current })
      if (!current()) return false
      const next = workspaceAutomationStatusResponse(result, scope)
      const nextKey = JSON.stringify(next)
      if (reviewRef.current && reviewRef.current.snapshotKey !== nextKey) {
        reviewRef.current = null; setReview(null)
        setNotice({ ...tag, tone: 'warning', text: 'Workspace status changed. Review the current exact app list and acknowledge costs again before confirming.' })
      }
      snapshotRef.current = { ...tag, value: next, snapshotKey: nextKey }
      setStored({ ...tag, value: next })
      return next
    } catch (error) {
      if (!current()) return false
      reviewRef.current = null; setReview(null)
      setLoadError({ ...tag, text: safeError(error) })
      return false
    } finally { if (current()) { loadingRef.current = false; setLoadingState(null) } }
  }, [scope])

  useEffect(() => {
    readSequenceRef.current += 1; actionSequenceRef.current += 1
    readControllerRef.current?.abort(); actionControllerRef.current?.abort()
    snapshotRef.current = null; reviewRef.current = null; actionLockRef.current = null; loadingRef.current = false
    setStored(null); setReview(null); setLoadingState(null); setBusyState(null); setLoadError(null); setNotice(null)
    if (scope && !disabled) void refresh()
    return () => { readSequenceRef.current += 1; actionSequenceRef.current += 1; readControllerRef.current?.abort(); actionControllerRef.current?.abort() }
  }, [scope, disabled, refresh])

  useEffect(() => {
    // Permission changes invalidate a previously acknowledged review even if
    // permission returns while an asynchronous authentication lookup is pending.
    actionSequenceRef.current += 1; actionControllerRef.current?.abort()
    reviewRef.current = null; actionLockRef.current = null; setReview(null); setBusyState(null); setNotice(null)
  }, [canEdit])

  useEffect(() => { if (activeReview) reviewHeadingRef.current?.focus?.() }, [activeReview?.id])

  const editableNow = () => !locked && mountedRef.current && contextRef.current.scope === scope && contextRef.current.scopeEpoch === context.scopeEpoch && contextRef.current.editEpoch === context.editEpoch && contextRef.current.canEdit && !contextRef.current.disabled && !loadingRef.current && !actionLockRef.current
  const openReview = enabled => {
    if (!editableNow() || (enabled && !startReady) || typeof enabled !== 'boolean' || snapshotRef.current?.snapshotKey !== snapshotKey) return
    const next = { scope, scopeEpoch: context.scopeEpoch, editEpoch: context.editEpoch, snapshotKey, value: data, enabled, confirmedCost: false, id: ++actionSequenceRef.current }
    reviewRef.current = next; setReview(next); setNotice(null)
  }
  const cancelReview = () => {
    if (!mountedRef.current || contextRef.current.scopeEpoch !== context.scopeEpoch || actionLockRef.current) return
    actionSequenceRef.current += 1; reviewRef.current = null; setReview(null)
  }
  const acknowledgeCost = checked => {
    if (!editableNow() || !activeReview || reviewRef.current?.id !== activeReview.id) return
    const next = { ...activeReview, confirmedCost: checked === true }
    reviewRef.current = next; setReview(next)
  }

  const confirm = async e => {
    e.preventDefault()
    const selected = activeReview
    if (!editableNow() || !selected || reviewRef.current?.id !== selected.id || (selected.enabled && (!startReady || selected.confirmedCost !== true))) return false
    const sequence = ++actionSequenceRef.current
    const controller = new AbortController(); actionControllerRef.current = controller
    const tag = { scope, scopeEpoch: context.scopeEpoch }
    actionLockRef.current = { ...tag, sequence }; setBusyState(tag); setNotice(null)
    const current = () => mountedRef.current && !controller.signal.aborted && contextRef.current.scope === scope && contextRef.current.scopeEpoch === selected.scopeEpoch && contextRef.current.editEpoch === selected.editEpoch && contextRef.current.canEdit && !contextRef.current.disabled && actionSequenceRef.current === sequence && reviewRef.current?.id === selected.id && reviewRef.current?.enabled === selected.enabled && reviewRef.current?.snapshotKey === selected.snapshotKey && snapshotRef.current?.snapshotKey === selected.snapshotKey
    try {
      const result = await setEmailWorkspaceAutomation({ workspaceId: scope, enabled: selected.enabled, reviewRevision: selected.value.automation.reviewRevision, confirmResearchCost: selected.enabled && selected.confirmedCost === true, signal: controller.signal, isCurrent: current })
      if (!current()) return false
      const next = workspaceAutomationAppliedResponse(result, selected.value, selected.enabled)
      snapshotRef.current = { ...tag, value: next, snapshotKey: JSON.stringify(next) }
      setStored({ ...tag, value: next })
      setNotice({ ...tag, tone: 'success', text: selected.enabled ? 'Daily research + drafts enabled for the exact reviewed active app set. Existing schedules are preserved; server workers perform daily runs. Sending, contacts and recipient opt-in are unchanged.' : 'Daily research + drafts paused for the exact reviewed active app set. Saved drafts and contacts are not deleted. Existing delivery and sending settings are unchanged.' })
      if (typeof callbacksRef.current.onChanged === 'function') {
        try { Promise.resolve(callbacksRef.current.onChanged()).catch(() => {}) } catch { /* Parent refresh does not change the confirmed result. */ }
      }
      return true
    } catch (error) {
      if (!current()) return false
      setLoadError({ ...tag, text: safeError(error, true) })
      setNotice({ ...tag, tone: 'warning', text: safeError(error, true) })
      return false
    } finally {
      if (mountedRef.current && contextRef.current.scopeEpoch === tag.scopeEpoch && actionSequenceRef.current === sequence) {
        actionLockRef.current = null; reviewRef.current = null; setReview(null); setBusyState(null)
      }
    }
  }

  const connect = () => {
    if (!editableNow() || connectionRef.current?.configured !== false || typeof callbacksRef.current.onConnect !== 'function') return
    // User click only; reuse the parent's one secure workspace Gmail identity.
    callbacksRef.current.onConnect()
  }
  const apps = data?.automation.apps || [], totals = data?.automation.totals
  const missingSenders = data ? apps.filter(app => !app.senderDetailsComplete).length : null
  const gmailConnected = connection?.configured === true
  const email = gmailConnected && typeof connection.email === 'string' && connection.email.trim() && connection.email.length <= 254 && !/[\s<>\x00-\x1f\x7f]/.test(connection.email) && /^[^@]+@[^@]+\.[^@]+$/.test(connection.email) ? connection.email : ''
  const blockers = data ? [[data.deployment.researchConfigured, 'research worker deployment'], [data.deployment.aiConfigured, 'workspace AI setup'], [data.deployment.draftsConfigured, 'daily draft worker deployment']].filter(([ready]) => !ready).map(([, label]) => label) : []
  const startCeiling = data ? apps.reduce((sum, app) => sum + app.researchRequestLimit, 0) : null
  const allScheduled = Boolean(apps.length && startReady && totals.researchEnabled === apps.length && totals.draftsEnabled === apps.length)
  const stateLabel = unavailable ? 'Status needs refresh' : !data ? 'Status unavailable' : !apps.length ? 'No active apps' : !startReady ? 'Setup required' : allScheduled ? 'All apps scheduled daily' : 'Some schedules need setup'
  const dailyCheck = async () => {
    const epoch = contextRef.current.scopeEpoch
    if (!scope || disabled || loadingRef.current || actionLockRef.current) return
    const next = await refresh()
    if (!next || !mountedRef.current || contextRef.current.scope !== scope || contextRef.current.scopeEpoch !== epoch) return
    const actual = next.automation.totals
    const running = actual.activeApps > 0 && actual.researchEnabled === actual.activeApps && actual.draftsEnabled === actual.activeApps && next.deployment.researchConfigured && next.deployment.draftsConfigured && next.deployment.aiConfigured
    setNotice({ scope, scopeEpoch: epoch, tone: running ? 'success' : 'warning', text: `Daily check complete: ${actual.researchEnabled}/${actual.activeApps} research schedules and ${actual.draftsEnabled}/${actual.activeApps} draft schedules enabled; ${actual.todayDrafts} drafts created today. ${running ? 'No daily restart is needed. Completion still depends on server checks and each app’s run history.' : 'Some workflows need setup; review Manage automatic schedules below.'} ${actual.deliveryEnabled} existing delivery campaigns enabled. This check did not send email or change any settings.` })
    try { callbacksRef.current.onDailyCheck?.() } catch { /* Observability cannot block a read-only check. */ }
  }

  return <section className="es-card" aria-label="Workspace daily research and drafts">
    <div className="es-section-head"><div><div className="es-kicker">WORKSPACE-WIDE / RESEARCH + DRAFTS ONLY</div><h2>One setup. All apps.</h2></div><span className={`es-badge es-badge--${unavailable || blockers.length ? 'warning' : 'neutral'}`}>{stateLabel}</span></div>
    <p><strong>{workspaceName || 'Current workspace'}</strong> · One control for all {shown(totals?.activeApps)} active apps, not only the selected app. Once enabled, background timers continue daily even while you are working elsewhere. You do not need to restart them each day.</p>
    <div className="es-section-head"><div><span className={`es-badge es-badge--${gmailConnected ? 'ready' : 'warning'}`}>{gmailConnected ? 'Shared Gmail connected' : connection?.configured === false ? 'Gmail not connected' : 'Gmail status unavailable'}</span><p className="es-help">{gmailConnected ? email || 'Connected account identity not provided.' : 'No connected account identity provided.'} One workspace Gmail connection is shared by all apps. Gmail is not required for research or daily draft creation.</p></div>{!gmailConnected && <button type="button" className="es-button es-button--secondary" disabled={locked || connection?.configured !== false || typeof onConnect !== 'function'} onClick={connect}>Connect Gmail for all apps</button>}</div>
    <div className="es-actions"><button type="button" className="es-button" disabled={!scope || disabled || loading || busy} onClick={() => { void dailyCheck() }}>{loading ? 'Checking all apps…' : 'Daily check · all apps'}</button>{data && <span className="es-help">{shown(totals.researchEnabled)} research · {shown(totals.draftsEnabled)} draft schedules · {shown(totals.todayDrafts)} drafts created today</span>}</div>
    {!scope && <p className="es-help" role="note">Select an active workspace to read its automation status.</p>}
    {disabled && <p className="es-help" role="note">Workspace controls are temporarily disabled. No read or write is dispatched.</p>}
    {canEdit !== true && <p className="es-help" role="note">Read-only access. Only a workspace owner or admin can connect Gmail or change daily research + drafts. The server independently checks permissions.</p>}
    {loading && <p className="es-help" role="status">Refreshing actual workspace automation status…</p>}
    {unavailable && <div className="es-alert es-alert--error" role="alert">{loadError.text} Previously loaded counts may be stale.</div>}
    {belongs(notice) && <div className={`es-alert es-alert--${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'} aria-live="polite">{notice.text}</div>}
    {blockers.length > 0 && <p className="es-help"><strong>Start blocked:</strong> missing {blockers.join(', ')}. This button cannot configure server workers or AI credentials. Pausing saved research + drafts remains available.</p>}
    {data && !apps.length && <p className="es-help" role="note">There are no active apps in this workspace. No connect, start or pause action is available.</p>}
    <details className="es-disclosure"><summary>Detailed daily status</summary><dl className="es-review-grid" aria-label="Actual workspace automation counts">
      <div><dt>Active apps · exact set</dt><dd>{shown(totals?.activeApps)}</dd></div>
      <div><dt>Research enabled · actual</dt><dd>{shown(totals?.researchEnabled)}</dd></div>
      <div><dt>Daily drafts enabled · actual</dt><dd>{shown(totals?.draftsEnabled)}</dd></div>
      <div><dt>Drafts created today · actual</dt><dd>{shown(totals?.todayDrafts)}</dd></div>
      <div><dt>Delivery enabled · existing</dt><dd>{shown(totals?.deliveryEnabled)}<small>Read-only; this button does not change delivery.</small></dd></div>
      <div><dt>Opted-in contacts · actual</dt><dd>{shown(totals?.optedInContacts)}<small>Research candidates are not opt-ins.</small></dd></div>
      <div><dt>Research request ceiling · server</dt><dd>{shown(totals?.researchRequestCeiling)} / day<small>Workspace daily cap: {shown(data?.deployment.workspaceDailyRequestLimit)} paid AI requests; shared across all apps.</small></dd></div>
      <div><dt>Apps missing sender details</dt><dd>{shown(missingSenders)}<small>Sender footer setup is a separate delivery requirement.</small></dd></div>
    </dl></details>
    <p className="es-help">Automatic sending is not started by this button. Researched contacts are candidates. Delivery requires recipient opt-in, reviewed recipient copy, sender footer and live gates.</p>
    <details className="es-disclosure"><summary>Manage automatic schedules</summary><p className="es-help">New or reactivated apps require a new complete review. Existing schedules and provider caps are preserved. Opening this page never starts paid work or approves email.</p><p className="es-help">Existing live sending gate: {data ? data.deployment.sendingEnabled ? 'enabled' : 'disabled' : 'not confirmed'}. Delivery worker: {data ? data.deployment.deliveryConfigured ? 'configured' : 'not configured' : 'not confirmed'}. Gmail deployment: {readiness?.gmailConfigured === true ? 'configured' : readiness?.gmailConfigured === false ? 'not configured' : 'not confirmed'}. These separate gates are not changed here.</p><div className="es-actions">
      <button type="button" className="es-button" disabled={locked || !startReady} onClick={() => openReview(true)}>Start daily research + drafts for all apps…</button>
      <button type="button" className="es-button es-button--secondary" disabled={locked || !(totals?.researchEnabled || totals?.draftsEnabled)} onClick={() => openReview(false)}>Pause daily research + drafts for all apps…</button>
      <button type="button" className="es-button es-button--secondary" disabled={!scope || disabled || loading || busy} onClick={() => { if (contextRef.current.scope === scope && contextRef.current.scopeEpoch === context.scopeEpoch) void refresh() }}>Refresh workspace status</button>
    </div>
    <p className="es-help">Daily check and Refresh are authenticated status reads only. Start and pause each require the exact review below and one explicit confirmed request; no research, draft creation or email is run from this page.</p></details>
    {activeReview && <section className="es-draft" role="region" aria-label="Review workspace daily research and drafts">
      <h3 ref={reviewHeadingRef} tabIndex={-1}>{activeReview.enabled ? 'Review daily research + drafts for all apps' : 'Review pause for all daily research + drafts'}</h3>
      <p><strong>{workspaceName || 'Current workspace'}</strong> · Workspace ID: {scope} · Exact active apps: {apps.length}. {activeReview.enabled ? 'Enable research and daily templates at each app’s existing schedules below, including apps with no contacts. Do not enable delivery.' : 'Pause only research and daily draft creation. Do not delete saved drafts or contacts, cancel delivery, or change sending settings.'}</p>
      <p className="es-help">Review revision: <code>{activeReview.value.automation.reviewRevision}</code>. A changed app set, setting, role or workspace requires a new review. All app IDs and existing schedules are shown; no apps are omitted.</p>
      <ul className="es-queue" aria-label="Exact reviewed active apps">{activeReview.value.automation.apps.map(app => <li key={app.id}><span>
        <strong>{app.name}</strong><small>App ID: {app.id}</small>
        <small>Research: {app.researchEnabled ? 'enabled' : 'disabled'} → {activeReview.enabled ? 'enabled' : 'paused'} · {schedule(app.researchStartHour, app.researchTimezone)} · target up to {app.researchTarget} candidates/day · up to {app.researchRequestLimit} paid AI requests/day</small>
        <small>Daily drafts: {app.draftsEnabled ? 'enabled' : 'disabled'} → {activeReview.enabled ? 'enabled' : 'paused'} · {schedule(app.draftStartHour, app.draftTimezone)} · Draft created today: {app.todayDraftCreated ? 'yes' : 'no'}</small>
        <small>Existing delivery: {app.deliveryEnabled ? 'enabled' : 'disabled'} (unchanged) · Opted-in contacts: {app.optedInCount} · Sender details: {app.senderDetailsComplete ? 'complete' : 'missing'}</small>
      </span></li>)}</ul>
      {activeReview.enabled && <p className="es-help">Recurring research may incur provider, search and token charges even when no new candidate is found. The reviewed app limits total up to {shown(startCeiling)} paid AI requests/day, subject to the existing shared workspace cap of {shown(data.deployment.workspaceDailyRequestLimit)} requests/day (200/day is the existing standard cap). Targets, including 80 addresses per app/day, are not guaranteed yields. Listing-based daily draft templates add no AI charges. Neither action adds contacts, grants consent, approves recipient copy or enables delivery.</p>}
      <form onSubmit={confirm} aria-label="Confirm workspace daily research and drafts">
        {activeReview.enabled && <label className="es-check"><input type="checkbox" aria-label="Acknowledge recurring research costs" checked={activeReview.confirmedCost} disabled={locked} onChange={e => acknowledgeCost(e.target.checked)} /><span>I acknowledge recurring research provider costs, the shared workspace request cap, and that address targets are not guaranteed. Daily templates add no AI charges; automatic sending is not started.</span></label>}
        <div className="es-actions"><button type="button" className="es-button es-button--secondary" disabled={busy} onClick={cancelReview}>Cancel workspace review</button><button type="submit" className="es-button" disabled={locked || (activeReview.enabled && (!startReady || !activeReview.confirmedCost))}>{busy ? 'Checking workspace change…' : activeReview.enabled ? 'Start all daily research + drafts' : 'Pause all daily research + drafts'}</button></div>
      </form>
    </section>}
  </section>
}
