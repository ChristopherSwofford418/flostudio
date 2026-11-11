import { useCallback, useEffect, useRef, useState } from 'react'
import Layout from '../components/Layout'
import { useWorkspace } from '../context/WorkspaceContext'
import { supabase } from '../supabase'
import { facebookDailyDraftsAction, facebookDailyUuid, facebookDailyDate, facebookDailyNextDay, facebookDailyMatchesSearch, facebookDailyCopyText, safeFacebookDailyImagePath, copyFacebookDailyText, downloadFacebookDailyImage, FACEBOOK_DAILY_TIMEZONE, FACEBOOK_DAILY_START_HOUR } from '../lib/facebookDailyDraftsClient'
import './FacebookDailyDrafts.css'

function readError(error, saving = false) {
  if (error?.status === 401) return 'Sign in again, then refresh.'
  if (error?.status === 403) return 'Workspace access or permission could not be confirmed. Choose an accessible workspace, then refresh.'
  return saving ? 'The schedule save outcome is unconfirmed. Refresh saved settings before reviewing another change.' : 'Saved drafts could not be verified. Refresh after access or server setup is restored.'
}
function savedTime(value) {
  try { return new Intl.DateTimeFormat('en', { timeZone: FACEBOOK_DAILY_TIMEZONE, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) } catch { return 'Time unavailable' }
}
const alwaysCurrent = () => true

/** Props isolate the view from global app selection and make all operations mockable. */
export function FacebookDailyDraftsWorkspace({ workspaceId, workspaceName = '', role = 'none', disabled = false, authScope = '', authCurrent = alwaysCurrent }) {
  const scope = facebookDailyUuid(workspaceId) ? workspaceId : ''
  const canManage = ['owner', 'admin'].includes(String(role).toLowerCase())
  const [dateChoice, setDateChoice] = useState(null), [searchChoice, setSearchChoice] = useState(null)
  const selectedDay = dateChoice?.scope === scope && dateChoice?.authScope === authScope ? dateChoice.value : null
  const search = searchChoice?.scope === scope && searchChoice?.authScope === authScope ? searchChoice.value : ''
  const contextRef = useRef({ scope, selectedDay, disabled, authScope, canManage, query: search, epoch: 0 })
  const before = contextRef.current
  if (before.scope !== scope || before.selectedDay !== selectedDay || before.disabled !== disabled || before.authScope !== authScope || before.canManage !== canManage) contextRef.current = { scope, selectedDay, disabled, authScope, canManage, query: search, epoch: before.epoch + 1 }
  else contextRef.current.query = search
  const epoch = contextRef.current.epoch
  const authCurrentRef = useRef(authCurrent); authCurrentRef.current = authCurrent
  const mountedRef = useRef(false), sequenceRef = useRef(0), readControllerRef = useRef(null)
  const operationRef = useRef(0), operationControllerRef = useRef(null), lockRef = useRef(null), snapshotRef = useRef(null)
  const [stored, setStored] = useState(null), [loadingState, setLoadingState] = useState(null), [errorState, setErrorState] = useState(null)
  const [notice, setNotice] = useState(null), [busyState, setBusyState] = useState(null), [review, setReview] = useState(null)
  const [imageStates, setImageStates] = useState(null)
  const dialogRef = useRef(null), previousFocusRef = useRef(null)
  const belongs = tag => tag?.scope === scope && tag.epoch === epoch
  const currentContext = tag => Boolean(tag && mountedRef.current && !contextRef.current.disabled && authCurrentRef.current() && contextRef.current.scope === tag.scope && contextRef.current.epoch === tag.epoch && sequenceRef.current === tag.sequence)
  const data = belongs(stored) ? stored.value : null
  const loading = belongs(loadingState), unavailable = belongs(errorState), busy = belongs(busyState)
  const rows = data?.apps || [], filtered = rows.filter(app => facebookDailyMatchesSearch(app, search))
  const tagFor = () => stored && { scope: stored.scope, epoch: stored.epoch, sequence: stored.sequence }
  const rowCurrent = (tag, app) => currentContext(tag) && snapshotRef.current?.sequence === tag.sequence && snapshotRef.current?.epoch === tag.epoch && snapshotRef.current.value.apps.includes(app) && facebookDailyMatchesSearch(app, contextRef.current.query)
  const imageKey = app => `${app.product_id}:${app.draft?.id}:${app.draft?.image_path}`
  const imageState = app => belongs(imageStates) ? imageStates.values[imageKey(app)] : null

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false; sequenceRef.current += 1; operationRef.current += 1; readControllerRef.current?.abort(); operationControllerRef.current?.abort(); snapshotRef.current = null; lockRef.current = null }
  }, [])

  const refresh = useCallback(async () => {
    if (!scope || !mountedRef.current || contextRef.current.disabled || !authCurrentRef.current() || contextRef.current.scope !== scope || contextRef.current.epoch !== epoch || lockRef.current?.kind === 'schedule') return false
    const tag = { scope, epoch, sequence: ++sequenceRef.current }
    readControllerRef.current?.abort(); operationControllerRef.current?.abort(); operationRef.current += 1; lockRef.current = null; snapshotRef.current = null
    const controller = new AbortController(); readControllerRef.current = controller
    const current = () => currentContext(tag) && !controller.signal.aborted
    setStored(null); setLoadingState(tag); setErrorState(null); setNotice(null); setBusyState(null); setReview(null); setImageStates(null)
    try {
      const value = await facebookDailyDraftsAction({ workspaceId: scope, action: 'get_workspace_status', payload: { scheduledDay: selectedDay }, signal: controller.signal, isCurrent: current })
      if (!current()) return false
      const next = { ...tag, value }; snapshotRef.current = next; setStored(next)
      return true
    } catch (error) {
      if (!current()) return false
      setErrorState({ ...tag, text: readError(error) }); return false
    } finally { if (current()) setLoadingState(null) }
  }, [scope, epoch, selectedDay])

  useEffect(() => {
    sequenceRef.current += 1; operationRef.current += 1; readControllerRef.current?.abort(); operationControllerRef.current?.abort(); snapshotRef.current = null; lockRef.current = null
    setStored(null); setLoadingState(null); setErrorState(null); setNotice(null); setBusyState(null); setReview(null); setImageStates(null)
    if (scope && !disabled) void refresh()
    return () => { sequenceRef.current += 1; operationRef.current += 1; readControllerRef.current?.abort(); operationControllerRef.current?.abort(); snapshotRef.current = null; lockRef.current = null }
  }, [scope, epoch, disabled, refresh])

  const activeReview = belongs(review) && currentContext(review) && data ? review : null
  useEffect(() => {
    if (!activeReview) return
    previousFocusRef.current = globalThis.document?.activeElement
    dialogRef.current?.focus()
    return () => { if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus() }
  }, [activeReview])

  const localAction = async (app, field) => {
    const tag = tagFor()
    if (loading || unavailable || busy || lockRef.current || !rowCurrent(tag, app) || !app.draft) return false
    if (field === 'image' && imageState(app) !== 'ready') return false
    let value
    try { if (field !== 'image') value = facebookDailyCopyText(app, field) } catch { return false }
    if (field !== 'image' && !value) return false
    const operation = ++operationRef.current, controller = new AbortController()
    operationControllerRef.current = controller; lockRef.current = { operation, kind: field }
    const current = () => rowCurrent(tag, app) && operationRef.current === operation && !controller.signal.aborted
    setBusyState({ ...tag, field }); setNotice(null)
    try {
      if (field === 'image') await downloadFacebookDailyImage(app, { signal: controller.signal, isCurrent: current })
      else await copyFacebookDailyText(value, { signal: controller.signal, isCurrent: current })
      if (!current()) return false
      setNotice({ ...tag, productId: app.product_id, tone: 'success', text: field === 'image' ? 'Image download requested. Check your browser downloads; completion is not verified.' : 'Saved text copied. Review it before pasting into Facebook; nothing was published.' })
      return true
    } catch {
      if (!current()) return false
      setNotice({ ...tag, productId: app.product_id, tone: 'warning', text: field === 'image' ? 'The image download could not be completed. Open the saved original below and save it manually.' : 'Clipboard unavailable. Select the saved text below and copy it manually.', ...(field === 'image' ? { manualImage: safeFacebookDailyImagePath(app.draft.image_path, scope, app.product_id) } : { manualText: value }) })
      return false
    } finally {
      if (lockRef.current?.operation === operation) { lockRef.current = null; if (currentContext(tag)) setBusyState(null) }
    }
  }

  const openReview = enabled => {
    const tag = tagFor()
    if (!canManage || busy || loading || unavailable || lockRef.current || !currentContext(tag) || !data || !rows.length) return
    setNotice(null); setReview({ ...tag, enabled, value: data })
  }
  const saveSchedule = async () => {
    const proposed = activeReview
    if (!proposed || !canManage || !contextRef.current.canManage || busy || lockRef.current || snapshotRef.current?.value !== proposed.value) return false
    const operation = ++operationRef.current, controller = new AbortController()
    operationControllerRef.current = controller; lockRef.current = { operation, kind: 'schedule' }
    const current = () => currentContext(proposed) && contextRef.current.canManage && operationRef.current === operation && !controller.signal.aborted && snapshotRef.current?.value === proposed.value
    setBusyState({ ...proposed, field: 'schedule' }); setNotice(null)
    try {
      await facebookDailyDraftsAction({ workspaceId: scope, action: 'save_workspace_settings', payload: { enabled: proposed.enabled, timezone: FACEBOOK_DAILY_TIMEZONE, startHour: FACEBOOK_DAILY_START_HOUR }, signal: controller.signal, isCurrent: current })
      if (!current()) return false
      lockRef.current = null; setBusyState(null); setReview(null)
      const refreshed = await refresh(), latest = snapshotRef.current
      if (!refreshed || !currentContext(latest)) return false
      const confirmed = latest.value.apps.length > 0 && latest.value.apps.every(app => app.settings.enabled === proposed.enabled)
      setNotice({ ...latest, tone: confirmed ? 'success' : 'warning', text: confirmed ? (proposed.enabled ? 'Daily draft settings saved for all active apps. Nothing was published. Server scheduling and completion remain subject to availability.' : 'Daily draft settings are paused for all active apps. Existing drafts remain saved; nothing was published.') : 'The schedule change is not confirmed by the refreshed settings. Review the saved state before trying again.' })
      return confirmed
    } catch (error) {
      if (!current()) return false
      setReview(null); setNotice({ ...proposed, tone: 'warning', text: readError(error, true) }); return false
    } finally {
      if (lockRef.current?.operation === operation) { lockRef.current = null; if (currentContext(proposed)) setBusyState(null) }
    }
  }

  const chooseDay = value => { if (contextRef.current.scope === scope && contextRef.current.epoch === epoch && !contextRef.current.disabled && authCurrentRef.current() && lockRef.current?.kind !== 'schedule' && (value === null || facebookDailyDate(value))) setDateChoice({ scope, authScope, value }) }
  const setImageState = (app, state, event) => {
    const tag = tagFor()
    if (!rowCurrent(tag, app) || event.currentTarget.getAttribute('src') !== app.draft?.image_path) return
    if (state === 'ready' && (!event.currentTarget.naturalWidth || !event.currentTarget.naturalHeight)) return
    setImageStates(previous => ({ ...tag, values: { ...(belongs(previous) ? previous.values : {}), [imageKey(app)]: state } }))
  }
  const activeNotice = belongs(notice) && !loading && !unavailable && (!notice.productId || filtered.some(app => app.product_id === notice.productId)) ? notice : null
  const tomorrow = facebookDailyNextDay(data?.today), controlsDisabled = !scope || disabled || Boolean(busy && busyState.field === 'schedule')
  const scheduleLocked = controlsDisabled || loading || unavailable || !data || !rows.length
  return <div className="fbd-page">
    <header className="fbd-hero">
      <div className="fbd-eyebrow">WORKSPACE / REVIEW FIRST</div>
      <h1>Daily Facebook Drafts</h1>
      <p>All active apps, one place. Copy a saved post and download its matching image for manual review.</p>
      <p className="fbd-muted">Daily creation starts at 3:00 AM Eastern, targeting 4:00 AM review. Timing is not guaranteed. Nothing here connects to Facebook or publishes a post.</p>
      {workspaceName && <p className="fbd-workspace">{workspaceName}</p>}
    </header>
    <section className="fbd-toolbar" aria-label="Browse saved Facebook drafts">
      <div className="fbd-fields">
        <label className="fbd-field"><span>Draft date</span><input type="date" min="0001-01-01" max="9999-12-31" value={selectedDay || data?.today || ''} disabled={controlsDisabled} onChange={event => chooseDay(event.target.value || null)} /></label>
        <label className="fbd-field"><span>Search app or post text</span><input type="search" maxLength={200} value={search} placeholder="App name or saved caption" disabled={!scope || disabled} onChange={event => setSearchChoice({ scope, authScope, value: event.target.value.slice(0, 200) })} /></label>
      </div>
      <div className="fbd-actions">
        <button type="button" disabled={controlsDisabled} aria-pressed={selectedDay === null} onClick={() => chooseDay(null)}>Today</button>
        <button type="button" disabled={controlsDisabled || loading || !tomorrow} aria-pressed={Boolean(tomorrow && selectedDay === tomorrow)} onClick={() => chooseDay(tomorrow)}>Tomorrow</button>
        <button type="button" disabled={controlsDisabled || loading} onClick={() => { void refresh() }}>Refresh all</button>
        {search && <button type="button" disabled={!scope || disabled} onClick={() => setSearchChoice({ scope, authScope, value: '' })}>Clear search</button>}
      </div>
      <p className="fbd-muted">Today and Tomorrow use the saved server date in America/New_York. Browsing and refreshing only read saved drafts; choosing a future date does not create one.</p>
    </section>
    {!scope && <p className="fbd-status" role="note">Choose a workspace to view its drafts.</p>}
    {disabled && <p className="fbd-status" role="status">Draft access is paused while sign-in or workspace access is checked.</p>}
    {loading && <p className="fbd-status" role="status">Reading saved drafts for all active apps…</p>}
    {unavailable && <div className="fbd-alert" role="alert">{errorState.text}</div>}
    {data && <section className="fbd-summary" aria-label="Actual saved draft counts">
      <div><strong>{rows.length}</strong><span>Active apps</span></div>
      <div><strong>{rows.filter(app => app.draft).length}</strong><span>Saved drafts · {data.scheduled_day}</span></div>
      <div><strong>{rows.filter(app => app.draft?.image_path).length}</strong><span>Saved matching image references</span></div>
      <div><strong>{rows.reduce((total, app) => total + app.assets_count, 0)}</strong><span>Supplied library images</span></div>
    </section>}
    {data && data.scheduled_day !== data.today && <p className="fbd-muted">Today ({data.today}): {data.today_counts.drafts} saved drafts and {data.today_counts.images} saved image references. Selected-date counts above are separate.</p>}
    {data && <div className="fbd-section-heading"><h2>{data.scheduled_day === data.today ? 'Today’s drafts' : `Drafts for ${data.scheduled_day}`}</h2><span className="fbd-muted">{search ? `${filtered.length} matching apps` : `${rows.length} active apps`} · Human review required</span></div>}
    {activeNotice && <div className={`fbd-alert fbd-alert--${activeNotice.tone}`} role="status" aria-live="polite">{activeNotice.text}</div>}
    {data && rows.length === 0 && <p className="fbd-status">No active apps were returned for this workspace.</p>}
    {data && rows.length > 0 && filtered.length === 0 && <p className="fbd-status">No drafts match this search. Clear search to show all apps.</p>}
    <section className="fbd-grid" aria-label="App daily draft cards">
      {filtered.map(app => <article className="fbd-card" key={app.product_id} aria-label={`Facebook draft for ${app.app_name}`}>
        <div className="fbd-card-heading"><h3>{app.app_name}</h3><span className={`fbd-badge ${app.draft ? 'fbd-badge--ready' : ''}`}>{app.draft ? 'Saved draft' : 'Not created yet'}</span></div>
        <p className="fbd-meta">{data.scheduled_day} · {app.settings.enabled ? 'Daily drafts enabled' : 'Daily drafts paused'} · {app.assets_count} library images</p>
        {app.draft?.image_path ? <div className="fbd-image-frame">
          {imageState(app) !== 'error' && <img key={imageKey(app)} className="fbd-image" src={app.draft.image_path} alt={`Saved marketing image for ${app.app_name} on ${data.scheduled_day}`} loading="lazy" decoding="async" onLoad={event => setImageState(app, 'ready', event)} onError={event => setImageState(app, 'error', event)} />}
          {imageState(app) === 'error' && <p className="fbd-image-empty">Saved image could not be loaded. Refresh or open the original manually.</p>}
        </div> : <div className="fbd-image-empty"><strong>{app.assets_count > 0 ? 'Matching image not saved yet' : 'Image needed · Upload images for this app'}</strong><span>{app.assets_count > 0 ? 'Library images exist, but no matching image has been saved for this draft yet.' : 'Supply an approved image set for this app’s own library.'}</span></div>}
        {app.draft ? <>
          <label className="fbd-field"><span>Saved Facebook post body</span><textarea readOnly rows={7} value={app.draft.body} aria-label={`Saved Facebook post body for ${app.app_name}`} /></label>
          <label className="fbd-field"><span>Saved hashtags</span><textarea readOnly rows={2} value={app.draft.hashtags} aria-label={`Saved hashtags for ${app.app_name}`} /></label>
          <p className="fbd-meta">Saved {savedTime(app.draft.updated_at)} Eastern</p>
          {!app.draft.image_path && <p className="fbd-muted">Text-only saved draft. No matching image is ready for download.</p>}
        </> : <p className="fbd-missing">Not created yet. {data.scheduled_day > data.today ? 'Check again after this day’s scheduled run.' : 'No saved draft was returned for this exact date.'} Older drafts are never substituted.</p>}
        <div className="fbd-actions fbd-card-actions">
          <button type="button" className="fbd-primary" disabled={disabled || loading || unavailable || busy || !app.draft} onClick={() => { void localAction(app, 'post') }}>Copy Facebook post</button>
          <button type="button" disabled={disabled || loading || unavailable || busy || !app.draft?.hashtags.trim()} onClick={() => { void localAction(app, 'hashtags') }}>Copy hashtags</button>
          <button type="button" disabled={disabled || loading || unavailable || busy || !app.draft?.image_path || imageState(app) !== 'ready'} onClick={() => { void localAction(app, 'image') }}>Download PNG</button>
        </div>
        {app.facebook_page_url ? <a className="fbd-page-link" href={app.facebook_page_url} target="_blank" rel="noopener noreferrer">Open saved Facebook Page</a> : <p className="fbd-muted">Page link not saved</p>}
        {(imageState(app) === 'error' || activeNotice?.productId === app.product_id && activeNotice.manualImage) && app.draft?.image_path && <a className="fbd-page-link" href={app.draft.image_path} target="_blank" rel="noopener noreferrer">Open saved original image to save manually</a>}
        {activeNotice?.productId === app.product_id && activeNotice.manualText && <label className="fbd-field"><span>Saved text for manual copy</span><textarea readOnly rows={7} value={activeNotice.manualText} aria-label={`Manual copy text for ${app.app_name}`} /></label>}
      </article>)}
    </section>
    {canManage && <section className="fbd-management" aria-label="Owner and admin daily draft settings">
      <div className="fbd-section-heading"><h2>Daily draft schedule</h2><span className="fbd-muted">Owner / admin</span></div>
      <p>Create ordinary saved drafts for all active apps starting at 3:00 AM Eastern. Images rotate through each app’s supplied library and repeat cyclically; they are not newly generated pictures. Human review and manual posting remain separate.</p>
      {data && <p className="fbd-muted">Saved settings: {rows.filter(app => app.settings.enabled).length} of {rows.length} active apps enabled.</p>}
      <div className="fbd-actions"><button type="button" className="fbd-primary" disabled={scheduleLocked || rows.every(app => app.settings.enabled)} onClick={() => openReview(true)}>Start daily drafts for all apps</button><button type="button" disabled={scheduleLocked || rows.every(app => !app.settings.enabled)} onClick={() => openReview(false)}>Pause daily drafts</button></div>
    </section>}
    {canManage && data && <details className="fbd-library">
      <summary>Image libraries</summary>
      <p>Your supplied images are matched to this app at the asset level. Add further sets through approved intake; no public posting. Each library stays app-specific and images can repeat cyclically.</p>
      <dl className="fbd-library-counts" aria-label="Supplied image counts by app">{rows.map(app => <div key={app.product_id}><dt>{app.app_name}</dt><dd>{app.assets_count} library images</dd></div>)}</dl>
      <p className="fbd-muted">This is a read-only inventory. Refresh after approved intake saves additional images. No App Store icon or another app’s image is substituted.</p>
    </details>}
    {activeReview && <div className="fbd-modal-backdrop" onKeyDown={event => {
      if (event.key === 'Escape' && !busy) { event.preventDefault(); setReview(null) }
      if (event.key === 'Tab') {
        const buttons = dialogRef.current?.querySelectorAll('button:not(:disabled)')
        if (!buttons?.length) { event.preventDefault(); return }
        const first = buttons[0], last = buttons[buttons.length - 1], focused = globalThis.document?.activeElement
        if (event.shiftKey && (focused === first || focused === dialogRef.current)) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && (focused === last || focused === dialogRef.current)) { event.preventDefault(); first.focus() }
      }
    }}>
      <section className="fbd-modal" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="fbd-review-title" aria-describedby="fbd-review-description" tabIndex={-1}>
        <h2 id="fbd-review-title">{activeReview.enabled ? 'Start daily drafts for all apps?' : 'Pause daily drafts?'}</h2>
        <p id="fbd-review-description">{activeReview.enabled ? `Enable saved daily draft creation for all ${rows.length} active apps, starting at 3:00 AM America/New_York. Target review time is 4:00 AM, not a guarantee. This does not immediately create drafts, connect Facebook or publish anything.` : `Pause daily draft creation for all ${rows.length} active apps. Existing saved drafts and image libraries remain available. Nothing will be published.`}</p>
        <p className="fbd-muted">{activeReview.enabled ? 'Images come only from each app’s supplied library, with cyclic reuse. Missing images can leave text-only drafts. The server must have scheduling configured.' : 'A run already in progress may finish. Refresh afterward to inspect actual saved settings.'}</p>
        <div className="fbd-actions"><button type="button" disabled={busy} onClick={() => { if (currentContext(activeReview)) setReview(null) }}>Cancel</button><button type="button" className="fbd-primary" disabled={busy} onClick={() => { void saveSchedule() }}>{busy ? 'Saving settings…' : activeReview.enabled ? 'Confirm start daily drafts' : 'Confirm pause daily drafts'}</button></div>
      </section>
    </div>}
  </div>
}

/** Invalidate synchronously on auth transitions, before delayed workspace refreshes. */
export default function FacebookDailyDrafts() {
  const { workspaceId, workspaceRole, role, workspaceLoading, workspaceError } = useWorkspace()
  const [auth, setAuth] = useState({ ready: false, identity: '', epoch: 0 })
  const authRef = useRef({ ready: false, identity: '', epoch: 0 }), authSequenceRef = useRef(0)
  useEffect(() => {
    let mounted = true
    const apply = session => {
      if (!mounted) return
      const identity = session?.user?.id || ''
      const previous = authRef.current
      const next = { ready: true, identity, epoch: previous.epoch + 1 }
      authRef.current = next; setAuth(next)
    }
    const sequence = ++authSequenceRef.current
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      authSequenceRef.current += 1
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || (session?.user?.id || '') !== authRef.current.identity) apply(session)
    })
    void supabase.auth.getSession().then(({ data, error }) => { if (mounted && authSequenceRef.current === sequence) apply(error ? null : data?.session) }).catch(() => { if (mounted && authSequenceRef.current === sequence) apply(null) })
    return () => { mounted = false; authSequenceRef.current += 1; authRef.current = { ready: false, identity: '', epoch: authRef.current.epoch + 1 }; subscription.unsubscribe() }
  }, [])
  const authScope = `${auth.identity}:${auth.epoch}`
  const authCurrent = () => authRef.current.ready && Boolean(authRef.current.identity) && `${authRef.current.identity}:${authRef.current.epoch}` === authScope
  return <Layout title="Daily Facebook Drafts"><FacebookDailyDraftsWorkspace workspaceId={workspaceId} role={workspaceRole || role} disabled={Boolean(workspaceLoading || workspaceError || !auth.ready || !auth.identity)} authScope={authScope} authCurrent={authCurrent} /></Layout>
}
