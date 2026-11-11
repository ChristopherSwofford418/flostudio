import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import EmailDailyResearchPanel from '../components/EmailDailyResearchPanel'
import EmailDailyCampaignPanel from '../components/EmailDailyCampaignPanel'
import EmailWorkspaceAutomationPanel from '../components/EmailWorkspaceAutomationPanel'
import { useWorkspace } from '../context/WorkspaceContext'
import { supabase } from '../supabase'
import { trackFloEvent } from '../lib/observability'
import { campaignSavePayload, campaignValidation, campaignValues, consentEvidenceText, defaultEmailCampaign, emailCampaignAction, emailGmailAction, getEmailCampaigns, GMAIL_TEST_BODY, GMAIL_TEST_SUBJECT, gmailTestRecipients, gmailTestResultNotice, gmailDeliveryState, mergeEmailRecords, isApprovedOptIn, isSuppressedContact, parseContactLines, safeEmailUrl, sourceEvidenceText } from '../lib/emailCampaignClient'
import { gmailCallbackFailureNotice } from '../lib/gmailCallbackStatus'
import './EmailCampaigns.css'

const labelStatus = value => String(value || 'unknown').replaceAll('_', ' ')
const formatTime = campaign => `${String(campaign?.send_hour ?? 9).padStart(2, '0')}:${String(campaign?.send_minute ?? 0).padStart(2, '0')}`
const event = name => { void trackFloEvent(`email_studio_${name}`).catch(() => {}) }

function Badge({ children, tone = 'neutral' }) {
  return <span className={`es-badge es-badge--${tone}`}>{children}</span>
}

function SourceLink({ url }) {
  const safe = safeEmailUrl(url)
  return safe ? <a href={safe} target="_blank" rel="noopener noreferrer">Business source ↗</a> : <span className="es-muted">No valid source link</span>
}

function DraftEditor({ draft, contact, disabled, onAction }) {
  const [subject, setSubject] = useState(draft.subject || '')
  const [body, setBody] = useState(draft.body || '')
  useEffect(() => { setSubject(draft.subject || ''); setBody(draft.body || '') }, [draft.id, draft.subject, draft.body])
  const dirty = subject !== (draft.subject || '') || body !== (draft.body || '')
  const optIn = isApprovedOptIn(contact)
  const complete = Boolean(subject.trim() && body.trim())
  return <article className="es-draft">
    <div className="es-section-head"><div><h3>{contact?.organization || 'Individual draft'}</h3><p className="es-recipient">{contact?.email || 'Recipient unavailable'}</p></div><Badge tone={draft.status === 'approved' && optIn && !dirty ? 'ready' : 'neutral'}>{dirty ? 'Unsaved edit' : labelStatus(draft.status)}</Badge></div>
    <form onSubmit={e => { e.preventDefault(); void onAction('update_draft', { draftId: draft.id, subject: subject.trim(), body: body.trim() }, 'Draft saved. Its approval has been reset; review it again.') }}>
      <fieldset disabled={disabled}>
        <label className="es-field"><span>Subject</span><input aria-label={`Subject for ${contact?.email || 'draft'}`} value={subject} onChange={e => setSubject(e.target.value)} required maxLength={998} /></label>
        <label className="es-field"><span>Email body</span><textarea aria-label={`Body for ${contact?.email || 'draft'}`} rows={6} value={body} onChange={e => setBody(e.target.value)} required /></label>
        <div className="es-actions"><button className="es-button es-button--secondary" type="submit" disabled={!dirty || !complete}>Save draft edit</button><button className="es-button" type="button" disabled={!optIn || dirty || !complete || draft.status === 'approved'} onClick={() => { void onAction('approve_draft', { draftId: draft.id }, 'Draft approved for this opted-in recipient. This does not send email.') }}>Approve draft</button></div>
      </fieldset>
    </form>
    <p className="es-help">{!optIn ? 'Approval is locked: this contact needs documented, approved opt-in first.' : dirty ? 'Save changes first. Editing resets draft approval.' : 'Draft approval reviews copy only. It does not approve a schedule or send email.'}</p>
  </article>
}

function ApprovalDialog({ app, campaign, contacts, draftCount, budget, appCount, pauseReason, busy, onClose, onApprove }) {
  const [declared, setDeclared] = useState(false)
  const dialogRef = useRef(null)
  const cancelRef = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    cancelRef.current?.focus()
    return () => { if (previous?.isConnected) previous.focus() }
  }, [])
  const keyDown = e => {
    if (e.key === 'Escape' && !busy) { e.preventDefault(); onClose(); return }
    if (e.key !== 'Tab') return
    const elements = [...dialogRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), a[href], [tabindex="0"]')]
    const first = elements[0]
    const last = elements[elements.length - 1]
    if (!first) { e.preventDefault(); dialogRef.current.focus(); return }
    if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }
  return <div className="es-modal-backdrop" onKeyDown={keyDown}>
    <section className="es-modal" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="es-approve-title" aria-describedby="es-approve-note" tabIndex={-1}>
      <div className="es-kicker">FINAL CONFIGURATION REVIEW</div><h2 id="es-approve-title">Approve {app.name}’s schedule?</h2>
      <p id="es-approve-note">This approves the saved configuration for later server-controlled daily processing. It does not send now or turn on the deployment’s cron or live-sending environment flags.</p>
      <dl className="es-review-grid"><div><dt>Selected app</dt><dd>{app.name}<small>Product ID: {app.id}</small></dd></div><div><dt>Daily app cap</dt><dd>Up to {campaign.daily_limit} emails / day<small>One shared Gmail cap: {budget} / day across all apps. Remaining capacity may be lower.</small></dd></div><div><dt>Schedule</dt><dd>{formatTime(campaign)} · {campaign.timezone}<small>Daily, interpreted in this timezone</small></dd></div><div><dt>Recipients + copy</dt><dd>{contacts.length} approved opt-in contacts<small>{draftCount} approved drafts for eligible contacts; only server-eligible records can be queued.</small></dd></div><div className="es-wide"><dt>Ad link</dt><dd><a href={safeEmailUrl(campaign.ad_link)} target="_blank" rel="noopener noreferrer">{campaign.ad_link}</a></dd></div><div><dt>Sender</dt><dd>{campaign.sender_name}</dd></div><div><dt>Physical postal address</dt><dd>{campaign.postal_address}</dd></div></dl>
      <p className="es-help">Across {appCount} apps, an even share of this saved shared budget is up to {appCount && Number.isFinite(Number(budget)) ? Math.min(100, Math.floor(Number(budget) / appCount)) : 0} per app/day before other mailbox sends. The selected app cap is a desired ceiling, not a guaranteed allocation. The server must stop or defer activity at the total shared cap.</p>
      <details className="es-recipient-review" open><summary>Review eligible recipient preview ({contacts.length}, up to the app cap)</summary><p className="es-help">This is not a queue or guaranteed sending order. Only previously human-approved copies are eligible; final claim-time permission, history and quotas still apply.</p><ul>{contacts.map(contact => <li key={contact.id}><strong>{contact.email}</strong>{contact.organization && <span> · {contact.organization}</span>}<details><summary>{contact.subject || 'Reviewed copy'}</summary><p className="es-help">{contact.body}</p></details></li>)}</ul></details>
      {pauseReason && <p className="es-help"><strong>Recovery review:</strong> {pauseReason} This approval can reopen the selected workspace’s mailbox gate. Other paused workspaces are not silently resumed, and previously claimed, failed or uncertain messages are never reset.</p>}
      <label className="es-check"><input type="checkbox" checked={declared} disabled={busy} onChange={e => setDeclared(e.target.checked)} /><span>I confirm that every approved recipient has explicitly opted in to promotional email about <strong>{app.name}</strong>, that evidence and permission are saved, and that the sender, postal address, ad link, and copy are accurate. Public business contact information alone is not consent. Unsubscribes and suppressions must be honored.</span></label>
      <div className="es-actions"><button ref={cancelRef} className="es-button es-button--secondary" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="es-button" type="button" disabled={!declared || busy} onClick={onApprove}>{busy ? 'Checking on server…' : 'Approve saved schedule'}</button></div>
    </section>
  </div>
}

function GmailTestDialog({ sender, recipients, recipient, busy, onRecipient, onClose, onSend }) {
  const dialogRef = useRef(null)
  const cancelRef = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    cancelRef.current?.focus()
    return () => { if (previous?.isConnected) previous.focus() }
  }, [])
  const keyDown = e => {
    if (e.key === 'Escape' && !busy) { e.preventDefault(); onClose(); return }
    if (e.key !== 'Tab') return
    const elements = [...dialogRef.current.querySelectorAll('button:not(:disabled), select:not(:disabled)')]
    const first = elements[0]
    const last = elements[elements.length - 1]
    if (!first) { e.preventDefault(); dialogRef.current.focus(); return }
    if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }
  return <div className="es-modal-backdrop" onKeyDown={keyDown}>
    <section className="es-modal" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="es-test-title" aria-describedby="es-test-note" tabIndex={-1}>
      <div className="es-kicker">ONE-TIME CONNECTION DIAGNOSTIC</div><h2 id="es-test-title">Review one test email</h2>
      <p id="es-test-note">This is a nonpromotional connection test, not a campaign. Opening this review sends nothing. Only the final button requests one email; no campaign is launched and daily marketing stays disabled.</p>
      <dl className="es-review-grid"><div><dt>FROM · connected Gmail</dt><dd>{sender}</dd></div><div><dt>TO · permitted recipient</dt><dd>{recipient}</dd></div><div className="es-wide"><dt>Exact subject</dt><dd>{GMAIL_TEST_SUBJECT}</dd></div><div className="es-wide"><dt>Exact body</dt><dd>{GMAIL_TEST_BODY}</dd></div></dl>
      <label className="es-field"><span>Test recipient · no other addresses permitted</span><select value={recipient} disabled={busy} onChange={e => onRecipient(e.target.value)} aria-label="One test email recipient">{recipients.map(item => <option key={item.email} value={item.email}>{item.label} · {item.email}</option>)}</select><small>Your authenticated account is selected by default. The connected Gmail account is the only alternative.</small></label>
      <p className="es-help">One diagnostic per connected Google account, across all apps. There are no automatic retries. If the result is unknown, check inbox/spam and do not send another test. Gmail acceptance is not proof of receipt.</p>
      <div className="es-actions"><button ref={cancelRef} type="button" className="es-button es-button--secondary" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="es-button" disabled={busy || !recipients.some(item => item.email === recipient)} onClick={onSend}>{busy ? 'Requesting one test…' : 'Send this one test email'}</button></div>
    </section>
  </div>
}

export default function EmailCampaigns() {
  const { apps = [], activeApp, setActiveApp, workspaceId, workspaceRole, role, workspaceLoading, workspaceError } = useWorkspace()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedId = searchParams.get('app') || ''
  const [selectedId, setSelectedId] = useState(requestedId || activeApp?.id || '')
  const [linkWarning, setLinkWarning] = useState('')
  const syncRef = useRef(null)
  // One synchronizer: external URL changes win; otherwise a global app switch wins.
  // Never use competing URL->context and context->URL effects.
  useEffect(() => {
    if (workspaceLoading || !workspaceId || !apps.length) return
    const previous = syncRef.current
    const initial = !previous || previous.workspaceId !== workspaceId
    const urlChanged = initial || previous.requestedId !== requestedId
    const globalChanged = !initial && previous.activeId !== activeApp?.id
    const requested = apps.find(app => String(app.id) === requestedId)
    const global = apps.find(app => app.id === activeApp?.id)
    const chosen = (urlChanged && requested) || (!urlChanged && globalChanged && global) || (initial && global) || apps.find(app => app.id === selectedId) || global || apps[0]
    if (!chosen) return
    if (urlChanged) setLinkWarning(requestedId && !requested ? 'The linked app is not in this workspace. Showing an available app; verify the selector before making changes.' : '')
    syncRef.current = { workspaceId, requestedId, activeId: chosen.id }
    if (selectedId !== chosen.id) setSelectedId(chosen.id)
    if (activeApp?.id !== chosen.id) setActiveApp(chosen)
    if (requestedId !== String(chosen.id)) {
      const next = new URLSearchParams(searchParams)
      next.set('app', chosen.id)
      setSearchParams(next, { replace: true })
    }
  }, [workspaceLoading, workspaceId, apps, activeApp?.id, requestedId, selectedId, setActiveApp, searchParams, setSearchParams])
  const selectedApp = apps.find(app => String(app.id) === String(selectedId)) || null
  const productId = selectedApp?.id || ''
  const scope = workspaceId && productId ? `${workspaceId}:${productId}` : ''
  const scopeRef = useRef(scope)
  scopeRef.current = scope
  const fetchSequenceRef = useRef(0)
  const actionSequenceRef = useRef(0)
  const fetchControllerRef = useRef(null)
  const actionControllerRef = useRef(null)
  const actionLockRef = useRef(null)
  const mountedRef = useRef(false)
  const [stored, setStored] = useState(null)
  const [formState, setFormState] = useState(null)
  const [loadingScope, setLoadingScope] = useState('')
  const [loadError, setLoadError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [busyState, setBusyState] = useState(null)
  const [contactText, setContactText] = useState('')
  const [sourceEvidence, setSourceEvidence] = useState('')
  const [query, setQuery] = useState('')
  const [selectedContactId, setSelectedContactId] = useState('')
  const [consentEvidence, setConsentEvidence] = useState('')
  const [permissionConfirmed, setPermissionConfirmed] = useState(false)
  const [draftLimit, setDraftLimit] = useState(10)
  const [approvalScope, setApprovalScope] = useState('')
  const [disconnectScope, setDisconnectScope] = useState('')
  const [previewResult, setPreviewResult] = useState(null)
  const [budgetDraft, setBudgetDraft] = useState(null)
  const [authOwner, setAuthOwner] = useState(null)
  const authIdentityRef = useRef('')
  const [testReview, setTestReview] = useState(null)
  const testAttemptsRef = useRef(new Set())
  const [testAttemptCount, setTestAttemptCount] = useState(0)
  const currentRole = String(workspaceRole || role || 'none').toLowerCase()
  const canEdit = ['owner', 'admin'].includes(currentRole)
  const canConnect = ['owner', 'admin'].includes(currentRole)
  const data = stored?.scope === scope ? stored.data : null
  const defaults = useMemo(() => defaultEmailCampaign(selectedApp), [selectedApp])
  const form = formState?.scope === scope ? formState.value : defaults
  const contacts = data?.contacts || []
  const drafts = data?.drafts || []
  const queue = data?.queue || []
  const loading = loadingScope === scope && Boolean(scope)
  const busy = busyState?.scope === scope ? busyState.action : ''
  const locked = !canEdit || Boolean(busy) || loading || !data
  const savedForm = data ? { ...defaults, ...(data.campaign || {}) } : defaults
  const dirty = JSON.stringify(campaignValues(form)) !== JSON.stringify(campaignValues(savedForm))
  const selectedContact = contacts.find(contact => contact.id === selectedContactId)
  const connection = data?.connection
  const readiness = data?.readiness
  const launch = readiness?.launch
  const serverCounts = launch?.counts
  const serverOptedIn = Number.isSafeInteger(serverCounts?.optedIn) ? serverCounts.optedIn : 0
  const serverApprovedDrafts = Number.isSafeInteger(serverCounts?.approvedDrafts) ? serverCounts.approvedDrafts : 0
  const serverEligible = Number.isSafeInteger(serverCounts?.eligibleRecipients) ? serverCounts.eligibleRecipients : 0
  const reviewRecipients = Array.isArray(launch?.eligibleRecipients) ? launch.eligibleRecipients.filter(contact => contact?.id && typeof contact.email === 'string') : []
  const deliveryState = gmailDeliveryState(connection, data?.campaign, readiness)
  const effectiveApproval = data?.campaign?.state === 'approved' && data.campaign.sending_enabled === true && connection?.connection_sending_enabled === true && connection?.account_sending_enabled === true
  const owner = authOwner?.scope === scope ? authOwner.user : null
  const authIdentity = owner?.id && owner?.email ? `${owner.id}:${owner.email.toLowerCase()}` : ''
  authIdentityRef.current = authIdentity
  const testRecipients = gmailTestRecipients(owner?.email, connection?.email)
  const testSenderKey = testRecipients.length ? connection.email.trim().toLowerCase() : ''
  const testAttempted = Boolean(testAttemptCount && testAttemptsRef.current.has(testSenderKey))
  const canTest = canConnect && connection?.configured === true && Boolean(authIdentity) && testRecipients.length > 0 && !testAttempted && !busy && !loading && Boolean(data) && readiness?.sendingEnabled === false
  const testReviewCurrent = testReview?.scope === scope && testReview?.identity === authIdentity && testReview?.sender === connection?.email
  const callbackFailure = searchParams.get('gmail') === 'setup_failed' && connection?.configured !== true ? gmailCallbackFailureNotice(searchParams.get('code')) : null
  const budget = Number(connection?.daily_budget)
  const hasBudget = Number.isInteger(budget) && budget > 0 && budget <= 2000
  const displayBudget = hasBudget ? budget : 400
  const budgetSettings = budgetDraft?.scope === scope ? budgetDraft.value : { accountType: '', dailyBudget: displayBudget, confirmWorkspace: false, sharedCapConfirmed: false }
  const proposedBudget = Number(budgetSettings.dailyBudget)
  const maxBudget = budgetSettings.accountType === 'workspace' ? 2000 : 400
  const budgetValid = ['personal', 'workspace'].includes(budgetSettings.accountType) && budgetSettings.dailyBudget !== '' && Number.isInteger(proposedBudget) && proposedBudget > 0 && proposedBudget <= maxBudget && budgetSettings.sharedCapConfirmed && (budgetSettings.accountType !== 'workspace' || budgetSettings.confirmWorkspace)
  const allocationBudget = Number.isInteger(proposedBudget) && proposedBudget > 0 && proposedBudget <= maxBudget ? proposedBudget : displayBudget
  const fairAllocation = apps.length ? Math.min(100, Math.floor(allocationBudget / apps.length)) : 0
  const portfolioDemand = apps.length * 100
  const blockers = [...new Set([
    ...(Array.isArray(readiness?.blockers) ? readiness.blockers.filter(item => typeof item === 'string') : []),
    ...(connection?.configured === true && readiness?.gmailConfigured === true ? [] : ['Connect the workspace Gmail account.']),
    ...(readiness?.sendingEnabled === true ? [] : ['Live sending is disabled in the server environment.']),
    ...(readiness?.cronConfigured === true ? [] : ['Daily server cron is not configured. This page cannot activate it.']),
    ...(hasBudget ? [] : ['The shared Gmail sending budget is unavailable.']),
    ...(hasBudget && apps.length && Math.floor(budget / apps.length) < 1 ? ['The shared account budget is too small to allocate even one email per app. Ask an owner to review capacity.'] : []),
    ...campaignValidation(savedForm, { complete: true }),
    ...(data?.campaign?.id ? [] : ['Save a campaign configuration first.']),
    ...(Array.isArray(launch?.blockers) ? launch.blockers.filter(item => typeof item === 'string') : []),
    ...(/^[a-f0-9]{64}$/i.test(launch?.reviewRevision || '') ? [] : ['Server eligibility review is unavailable. Refresh before approval.']),
    ...(serverOptedIn ? [] : ['Record permission and evidence for at least one approved opt-in contact.']),
    ...(serverEligible && reviewRecipients.length ? [] : ['No reviewed, unsuppressed, never-contacted recipients are ready. Add genuine opt-ins and approve their copy.']),
  ])]
  const warnings = Array.isArray(readiness?.warnings) ? readiness.warnings.filter(item => typeof item === 'string') : []
  const canApprove = !locked && !dirty && !blockers.length && !effectiveApproval
  const updateForm = (key, value) => setFormState(current => ({ scope, value: { ...(current?.scope === scope ? current.value : form), [key]: value } }))
  const updateBudget = (key, value) => setBudgetDraft(current => ({ scope, value: { ...(current?.scope === scope ? current.value : budgetSettings), [key]: value } }))

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false; fetchSequenceRef.current += 1; actionSequenceRef.current += 1; fetchControllerRef.current?.abort(); actionControllerRef.current?.abort() }
  }, [])

  useEffect(() => {
    let current = true
    let sequence = 0
    setAuthOwner(null)
    setTestReview(null)
    const verifyOwner = async () => {
      const requestedSequence = ++sequence
      try {
        const { data: { user }, error } = await supabase.auth.getUser()
        if (current && scopeRef.current === scope && sequence === requestedSequence) setAuthOwner(!error && user?.id && user?.email ? { scope, user: { id: user.id, email: user.email } } : null)
      } catch { if (current && sequence === requestedSequence) setAuthOwner(null) }
    }
    if (scope) void verifyOwner()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authIdentityRef.current = ''
      setAuthOwner(null)
      setTestReview(null)
      if (actionLockRef.current?.action === 'send_test') {
        actionSequenceRef.current += 1
        actionControllerRef.current?.abort()
        actionLockRef.current = null
        setBusyState(null)
      }
      sequence += 1
      // Keep the auth callback synchronous; verification runs after it returns.
      if (session?.user && scope) queueMicrotask(() => { if (current) void verifyOwner() })
    })
    return () => { current = false; sequence += 1; subscription.unsubscribe() }
  }, [scope])

  const refresh = useCallback(async () => {
    if (!workspaceId || !productId) return false
    const requestedScope = `${workspaceId}:${productId}`
    const sequence = ++fetchSequenceRef.current
    fetchControllerRef.current?.abort()
    const controller = new AbortController()
    fetchControllerRef.current = controller
    setLoadingScope(requestedScope)
    setLoadError(null)
    try {
      const next = await getEmailCampaigns({ workspaceId, productId, signal: controller.signal })
      if (!mountedRef.current || scopeRef.current !== requestedScope || sequence !== fetchSequenceRef.current) return false
      setStored({ scope: requestedScope, data: next })
      setFormState({ scope: requestedScope, value: { ...defaultEmailCampaign(selectedApp), ...(next.campaign || {}) } })
      return true
    } catch (error) {
      if (!mountedRef.current || controller.signal.aborted || scopeRef.current !== requestedScope || sequence !== fetchSequenceRef.current) return false
      setStored(null)
      setLoadError({ scope: requestedScope, text: error?.message || 'Could not load this app’s email configuration.' })
      return false
    } finally {
      if (mountedRef.current && scopeRef.current === requestedScope && sequence === fetchSequenceRef.current) setLoadingScope('')
    }
  }, [workspaceId, productId, selectedApp])

  const loadMore = async kind => {
    const offset = data?.pagination?.[kind]?.nextOffset
    if (!['contacts', 'drafts'].includes(kind) || !Number.isInteger(offset) || locked || dirty || actionLockRef.current?.scope === scope) return
    const requestedScope = scope
    const revision = launch?.reviewRevision
    const sequence = ++actionSequenceRef.current
    const controller = new AbortController()
    actionControllerRef.current = controller
    actionLockRef.current = { scope: requestedScope, sequence }
    setBusyState({ scope: requestedScope, action: `load_${kind}` })
    const current = () => mountedRef.current && scopeRef.current === requestedScope && actionSequenceRef.current === sequence && !controller.signal.aborted
    try {
      const page = await getEmailCampaigns({ workspaceId, productId, signal: controller.signal, [kind === 'contacts' ? 'contactsOffset' : 'draftsOffset']: offset })
      if (!current()) return
      if (page.readiness?.launch?.reviewRevision !== revision) {
        setNotice({ scope: requestedScope, text: 'Saved recipients or copy changed while loading. Refresh the review before making changes.', tone: 'warning' })
        setApprovalScope('')
        return
      }
      setStored(previous => previous?.scope === requestedScope ? { scope: requestedScope, data: { ...previous.data, [kind]: mergeEmailRecords(previous.data[kind], page[kind]), pagination: { ...previous.data.pagination, [kind]: page.pagination?.[kind] }, connection: page.connection, readiness: page.readiness } } : previous)
    } catch (error) {
      if (current()) setNotice({ scope: requestedScope, text: error?.message || 'Could not load the next saved-record page.', tone: 'error' })
    } finally {
      if (current()) { actionLockRef.current = null; setBusyState(null) }
    }
  }

  useEffect(() => {
    actionSequenceRef.current += 1
    actionControllerRef.current?.abort()
    actionLockRef.current = null
    setBusyState(null)
    setNotice(null)
    setContactText(''); setSourceEvidence(''); setQuery(''); setSelectedContactId(''); setConsentEvidence(''); setPermissionConfirmed(false)
    setApprovalScope(''); setDisconnectScope(''); setPreviewResult(null); setBudgetDraft(null); setTestReview(null)
    if (scope && !workspaceLoading && !workspaceError) { void refresh(); event('app_opened') }
    return () => { fetchSequenceRef.current += 1; fetchControllerRef.current?.abort() }
    // Scope primitives, not changing app metadata, control resets and initial reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, workspaceLoading, workspaceError])

  const perform = async (action, payload = {}, fallback = 'Action completed. Configuration refreshed.', service = 'campaign') => {
    // Diagnostics must use their own explicit confirmation and fixed response handling.
    if (action === 'send_test') return false
    if (!scope || actionLockRef.current?.scope === scope || (service === 'gmail' ? !canConnect : !canEdit) || !data || loading) return false
    const requestedScope = scope
    const sequence = ++actionSequenceRef.current
    const controller = new AbortController()
    actionControllerRef.current = controller
    actionLockRef.current = { scope: requestedScope, sequence }
    setBusyState({ scope: requestedScope, action })
    setNotice(null)
    const current = () => mountedRef.current && scopeRef.current === requestedScope && actionSequenceRef.current === sequence
    event(`${service === 'gmail' ? 'gmail_' : ''}${action}_requested`)
    try {
      const result = service === 'gmail' ? await emailGmailAction({ workspaceId, action, payload, signal: controller.signal }) : await emailCampaignAction({ workspaceId, productId, action, payload, signal: controller.signal })
      if (!current()) return false
      const summary = typeof result.message === 'string' && result.message.trim() ? result.message : fallback
      setNotice({ scope: requestedScope, text: summary, tone: 'success' })
      if (action === 'preview_run') setPreviewResult({ scope: requestedScope, text: typeof result.message === 'string' ? result.message : 'Dry-run request completed. The server did not return a preview summary; no send was requested.' })
      if (action === 'set_state') setApprovalScope('')
      if (service === 'gmail' && action === 'disconnect') setDisconnectScope('')
      if (service === 'gmail' && action === 'configure_budget') setBudgetDraft(null)
      event(`${service === 'gmail' ? 'gmail_' : ''}${action}_succeeded`)
      const refreshed = await refresh()
      if (!current()) return false
      if (!refreshed) setNotice({ scope: requestedScope, text: `${summary} The follow-up refresh failed. Reload the app’s configuration before making another change.`, tone: 'warning' })
      if (service === 'gmail' && action === 'connect') window.location.assign(result.authorizationUrl)
      return true
    } catch (error) {
      if (!current() || controller.signal.aborted) return false
      setNotice({ scope: requestedScope, text: `${error?.message || 'The action failed.'}${service === 'gmail' && action === 'connect' ? ' No Gmail connection was established. An administrator must verify OAuth credentials, redirect URL, and server configuration; there are no tokens to paste here.' : ''}`, tone: 'error' })
      event(`${service === 'gmail' ? 'gmail_' : ''}${action}_failed`)
      return false
    } finally {
      if (current()) { actionLockRef.current = null; setBusyState(null) }
    }
  }

  const sendOneTest = async () => {
    if (!mountedRef.current || scopeRef.current !== scope || authIdentityRef.current !== authIdentity || !canTest || !testReviewCurrent || actionLockRef.current?.scope === scope || !testRecipients.some(item => item.email === testReview.recipient)) return false
    const requestedScope = scope
    const requestedIdentity = authIdentity
    const recipient = testReview.recipient
    const sequence = ++actionSequenceRef.current
    const controller = new AbortController()
    actionControllerRef.current = controller
    actionLockRef.current = { scope: requestedScope, sequence, action: 'send_test' }
    setBusyState({ scope: requestedScope, action: 'send_test' })
    setNotice(null)
    const current = () => mountedRef.current && scopeRef.current === requestedScope && authIdentityRef.current === requestedIdentity && actionSequenceRef.current === sequence && !controller.signal.aborted
    try {
      // Reverify the auth owner immediately before the only outbound diagnostic request.
      const { data: { user }, error } = await supabase.auth.getUser()
      if (!current()) return false
      if (error || !user?.id || !user?.email || `${user.id}:${user.email.toLowerCase()}` !== requestedIdentity || !gmailTestRecipients(user.email, connection.email).some(item => item.email === recipient)) {
        setTestReview(null)
        setNotice({ scope: requestedScope, text: 'The authenticated account changed or could not be verified. No test was requested. Refresh and review again.', tone: 'error' })
        return false
      }
      // Persist the local lock across app switches and errors; the server owns the
      // durable, atomic one-diagnostic-per-Google-account guard across sessions.
      if (testAttemptsRef.current.has(testSenderKey)) return false
      testAttemptsRef.current.add(testSenderKey)
      setTestAttemptCount(count => count + 1)
      const result = await emailGmailAction({ workspaceId, action: 'send_test', payload: { productId, recipient, confirmTest: true }, signal: controller.signal })
      if (!current()) return false
      setTestReview(null)
      setNotice({ scope: requestedScope, ...gmailTestResultNotice(result) })
      return true
    } catch {
      if (!current()) return false
      setTestReview(null)
      setNotice({ scope: requestedScope, text: 'The test outcome is unknown. Gmail may have accepted it. Check inbox/spam; do not retry. No automatic retry will occur. No daily marketing campaign was launched.', tone: 'warning' })
      return false
    } finally {
      if (current()) { actionLockRef.current = null; setBusyState(null) }
    }
  }

  const showError = text => setNotice({ scope, text, tone: 'error' })
  const saveCampaign = e => {
    e.preventDefault()
    const errors = campaignValidation(form)
    if (errors.length) { showError(errors.join(' ')); return }
    void perform('save_campaign', { campaign: campaignSavePayload(form) }, 'Configuration saved with sending disabled. Preview and schedule approval are separate steps.')
  }
  const importContacts = async e => {
    e.preventDefault()
    try {
      const parsed = parseContactLines(contactText, sourceEvidence)
      const importedScope = scope
      const success = await perform('add_contacts', { contacts: parsed.contacts }, `Imported ${parsed.contacts.length} candidate contacts${parsed.duplicates ? `; skipped ${parsed.duplicates} duplicate lines` : ''}. No opt-in or sending permission was granted.`)
      if (success && scopeRef.current === importedScope) { setContactText(''); setSourceEvidence('') }
    } catch (error) { showError(error.message) }
  }
  const selectContact = contact => { setSelectedContactId(contact.id); setConsentEvidence(consentEvidenceText(contact.consent_evidence)); setPermissionConfirmed(false) }
  const configureBudget = e => {
    e.preventDefault()
    if (!budgetValid) { showError('Select an account type, enter a budget within its cap, and confirm the shared-mailbox declaration. Paid Workspace additionally requires explicit account confirmation.'); return }
    void perform('configure_budget', { accountType: budgetSettings.accountType, dailyBudget: proposedBudget, ...(budgetSettings.accountType === 'workspace' ? { confirmWorkspace: true } : {}) }, 'Shared mailbox budget saved; workspace campaigns are paused. This does not approve a campaign or enable live sending.', 'gmail')
  }
  const approveSchedule = () => {
    if (!canApprove || approvalScope !== scope) { showError('Configuration changed or setup checks are incomplete. Close this review and refresh before approving.'); return }
    void perform('set_state', { state: 'approved', confirmSchedule: true, reviewRevision: launch.reviewRevision }, 'Server accepted schedule approval. Any later sending still depends on live deployment gates and shared account capacity.')
  }
  const chooseApp = id => {
    const app = apps.find(item => String(item.id) === id)
    if (!app) return
    if (app.id !== productId && actionLockRef.current?.action === 'send_test') {
      actionSequenceRef.current += 1
      actionControllerRef.current?.abort()
      actionLockRef.current = null
      setBusyState(null)
      setTestReview(null)
    }
    // URL navigation is the sole input here; the synchronizer updates context once.
    const next = new URLSearchParams(searchParams)
    next.set('app', app.id)
    setSearchParams(next)
    event('app_selected')
  }

  return <Layout title="Email Campaigns"><div className="email-studio">
    <section className="es-hero es-card"><div><div className="es-kicker">EMAIL STUDIO / PERMISSION FIRST</div><h1>Approved emails.<br /><em>On your schedule.</em></h1><p>Research candidates and create a dated campaign draft with the matching App Store link each day. Listing-based daily drafts have no extra AI charges. Review recipient permission and copy separately; the delivery timer processes human-approved recipient emails only, within one shared Gmail budget.</p><div className="es-actions"><Badge tone={effectiveApproval ? 'ready' : 'neutral'}>{data?.campaign ? `Campaign ${labelStatus(data.campaign.state)}` : 'Disabled by default'}</Badge><Badge>Research + daily draft → permission → review → schedule</Badge></div></div><div className="es-hero-mark" aria-hidden="true"><span>F</span><small>DAILY EMAIL<br />HUMAN APPROVED</small></div></section>
    {workspaceError && <div className="es-alert es-alert--error" role="alert"><strong>Workspace unavailable.</strong> {workspaceError}</div>}
    {workspaceLoading && <div className="es-card es-empty" role="status">Restoring your workspace…</div>}
    {!workspaceLoading && !workspaceError && <>
      {workspaceId && <EmailWorkspaceAutomationPanel key={`workspace-automation:${workspaceId}`} workspaceId={workspaceId} workspaceName="Current workspace" canEdit={canEdit} disabled={Boolean(busy)} connection={connection} readiness={readiness} onConnect={() => { void perform('connect', {}, 'Opening the single shared Gmail connection for this workspace.', 'gmail') }} onChanged={() => { event('workspace_schedule_changed'); if (!dirty && !busy && !loading) void refresh() }} onDailyCheck={() => event('workspace_daily_check')} />}
      <section className="es-card es-app-bar"><div><div className="es-kicker">SELECTED APP</div><h2>{selectedApp?.name || 'Choose a portfolio app'}</h2><p>Contacts, drafts, and approval stay with this app. Gmail is shared by the workspace.</p></div><label className="es-field"><span>App</span><select value={selectedId} onChange={e => chooseApp(e.target.value)} disabled={!apps.length} aria-label="Choose email campaign app">{!selectedApp && <option value="">Select an app</option>}{apps.map(app => <option key={app.id} value={app.id}>{app.name}</option>)}</select></label></section>
      {linkWarning && <div className="es-alert es-alert--warning" role="status">{linkWarning}</div>}
      {!canEdit && <div className="es-alert es-alert--warning" role="note">Read-only workspace access ({currentRole}). A workspace owner or admin must make campaign changes. The server independently verifies permissions.</div>}
      {!apps.length && <section className="es-card es-empty"><h2>No portfolio apps yet.</h2><p>Add an app in Portfolio, then return to set up its email campaign. No contacts or activity are invented here.</p></section>}
      {selectedApp && <>
        {loadError?.scope === scope && <div className="es-alert es-alert--error" role="alert"><h3>Email configuration unavailable</h3><p>{loadError.text}</p><button type="button" className="es-button es-button--secondary" onClick={() => { void refresh() }} disabled={Boolean(busy) || loading}>Retry authenticated load</button></div>}
        {loading && <div className="es-alert" role="status">Loading {selectedApp.name}’s latest configuration…</div>}
        {callbackFailure && <div className="es-alert es-alert--error" role="alert"><strong>Gmail connection not completed.</strong> {callbackFailure.message}<p className="es-help">Diagnostic: {callbackFailure.code}. This notice describes the previous callback attempt; connection status below comes from the workspace server. Connecting never starts a campaign.</p></div>}
        {notice?.scope === scope && <div className={`es-alert es-alert--${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'} aria-live="polite">{notice.text}</div>}
        <div className="es-main-grid">
          <div className="es-stack">
            <section className="es-card"><div className="es-section-head"><div><div className="es-kicker">01 / CONFIGURATION</div><h2>Set the daily brief</h2></div><Badge>{dirty ? 'Unsaved changes' : data?.campaign ? 'Saved configuration' : 'Not saved'}</Badge></div><p>Save stores settings with sending disabled. Preview is a dry run. Only the final approval review requests a schedule state change.</p>
              <form onSubmit={saveCampaign}><fieldset disabled={locked}><div className="es-form-grid">
                <label className="es-field es-wide"><span>Campaign name</span><input value={form.name} onChange={e => updateForm('name', e.target.value)} required maxLength={160} /></label>
                <label className="es-field"><span>Daily app cap</span><input type="number" min={1} max={100} step={1} value={form.daily_limit} onChange={e => updateForm('daily_limit', e.target.value)} required /><small>1–100. Not a reservation of shared Gmail capacity.</small></label>
                <label className="es-field"><span>Daily local time</span><input type="time" step={60} value={formatTime(form)} onChange={e => { const [hour, minute] = e.target.value.split(':'); setFormState({ scope, value: { ...form, send_hour: hour ?? '', send_minute: minute ?? '' } }) }} required /></label>
                <label className="es-field"><span>IANA timezone</span><input value={form.timezone} onChange={e => updateForm('timezone', e.target.value)} placeholder="America/New_York" required /><small>Schedule uses this timezone, not a fixed UTC offset.</small></label>
                <label className="es-field"><span>Language</span><input value={form.language} onChange={e => updateForm('language', e.target.value)} placeholder="English" /></label>
                <label className="es-field es-wide"><span>Audience for this app</span><textarea rows={2} value={form.audience} onChange={e => updateForm('audience', e.target.value)} placeholder="Who opted in, and what do they expect?" /></label>
                <label className="es-field"><span>Sender name</span><input value={form.sender_name} onChange={e => updateForm('sender_name', e.target.value)} autoComplete="organization" /></label>
                <label className="es-field"><span>Ad / product link</span><input type="url" value={form.ad_link} onChange={e => updateForm('ad_link', e.target.value)} placeholder="https://your-app.example" /><small>Included in the final approval review.</small></label>
                <label className="es-field es-wide"><span>Physical postal address</span><textarea rows={2} value={form.postal_address} onChange={e => updateForm('postal_address', e.target.value)} placeholder="Legal sender’s physical mailing address" /></label>
              </div><div className="es-actions"><button className="es-button" type="submit">{busy === 'save_campaign' ? 'Saving…' : 'Save configuration · disabled'}</button><button className="es-button es-button--secondary" type="button" disabled={!data?.campaign || dirty} onClick={() => { void perform('preview_run', {}, 'Dry run completed. No email was sent.') }}>Preview run · no send</button></div></fieldset></form>
              {dirty && <p className="es-help">Save changes before previewing or approving. Saving intentionally disables sending for an approved campaign.</p>}
              {previewResult?.scope === scope && <div className="es-preview" role="status"><div className="es-kicker">ACTUAL SERVER PREVIEW</div><p>{previewResult.text}</p><small>Dry-run response only. It is not proof of delivery, opens, or future sending.</small></div>}
            </section>

            <EmailDailyResearchPanel key={scope} workspaceId={workspaceId} productId={productId} appName={selectedApp.name} canEdit={canEdit && !busy && !loading} deploymentReady={readiness?.researchCronConfigured === true} onCandidatesChanged={() => { if (!dirty && !busy && !loading) void refresh() }} />

            <EmailDailyCampaignPanel key={`daily-campaign:${scope}`} workspaceId={workspaceId} productId={productId} appName={selectedApp.name} canEdit={canEdit} disabled={Boolean(busy) || loading} />

            <section className="es-card"><div className="es-section-head"><div><div className="es-kicker">02 / RECIPIENT PERMISSION</div><h2>A list is not consent</h2></div><Badge>{contacts.length} saved contacts</Badge></div><p>Imports and AI research create candidates only. Public business emails, source links, and a company’s website do not establish opt-in. Save evidence of specific permission for each recipient before draft approval.</p>
              <details className="es-disclosure" open><summary>Import candidate contacts · up to 100 lines</summary><form onSubmit={importContacts}><fieldset disabled={locked}><label className="es-field"><span>One contact per line: email, organization, source URL</span><textarea rows={4} value={contactText} onChange={e => setContactText(e.target.value)} placeholder={'email,organization,source URL\nOne unquoted record per line; no header'} /><small>Simple line parser, not full CSV. Organization and source URL are optional; use a blank middle field when only a source is available. No quoted fields or embedded commas. Duplicate email lines are skipped; any invalid line blocks the entire import.</small></label><label className="es-field"><span>Source context for this import (not opt-in evidence)</span><textarea rows={2} value={sourceEvidence} onChange={e => setSourceEvidence(e.target.value)} placeholder="Where the candidate list came from and what the source actually establishes" /></label><button className="es-button es-button--secondary" type="submit" disabled={!contactText.trim()}>Import as candidates</button></fieldset></form></details>
              <details className="es-disclosure"><summary>Business research · candidates, never subscribers</summary><form onSubmit={e => { e.preventDefault(); if (query.trim()) { void perform('research_candidates', { query: query.trim(), limit: 10 }, 'Business research completed. Found contacts remain candidates, not opted-in subscribers.') } }}><fieldset disabled={locked || readiness?.aiConfigured !== true}><label className="es-field"><span>Business research query or source URL</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Business category, region, or public business source URL" required /><small>At most 10 candidates per request. Results must include source-backed business evidence and stay in candidate status. No fabricated users or inferred consent.</small></label><button className="es-button es-button--secondary" type="submit" disabled={!query.trim()}>Research up to 10 candidates</button></fieldset></form>{readiness?.aiConfigured !== true && <p className="es-help">Research is unavailable until the server reports AI configured.</p>}</details>
              <div className="es-contact-layout"><div className="es-contact-list" aria-label="Saved contacts">{!contacts.length ? <div className="es-empty es-empty--small">{data ? 'No contacts saved for this app. Import a candidate list or run source-linked business research.' : 'Load this app’s configuration to view real saved contacts.'}</div> : contacts.map(contact => <article className={`es-contact ${selectedContactId === contact.id ? 'is-selected' : ''}`} key={contact.id}><button type="button" className="es-contact-select" onClick={() => selectContact(contact)} disabled={Boolean(busy)} aria-pressed={selectedContactId === contact.id}><strong>{contact.organization || contact.email}</strong><span>{contact.organization ? contact.email : 'Organization not recorded'}</span><Badge tone={isApprovedOptIn(contact) ? 'ready' : isSuppressedContact(contact) ? 'warning' : 'neutral'}>{isApprovedOptIn(contact) ? 'Approved opt-in' : labelStatus(contact.status)}</Badge></button><SourceLink url={contact.source_url} /></article>)}</div>
                <aside className="es-consent-panel">{selectedContact ? <><div className="es-kicker">SELECTED CONTACT</div><h3>{selectedContact.organization || 'Recipient permission'}</h3><p className="es-recipient">{selectedContact.email}</p><SourceLink url={selectedContact.source_url} />{sourceEvidenceText(selectedContact.source_evidence) && <p className="es-help"><strong>Source excerpt (not permission):</strong> {sourceEvidenceText(selectedContact.source_evidence)}</p>}{selectedContact.consent_evidence?.recorded_at && <p className="es-help">Operator consent record: {selectedContact.consent_evidence.method || 'method not returned'} · {selectedContact.consent_evidence.recorded_at}. This is not independent verification.</p>}<form onSubmit={e => { e.preventDefault(); if (permissionConfirmed && consentEvidence.trim().length >= 20) { void perform('consent_contact', { contactId: selectedContact.id, consentEvidence: consentEvidence.trim() }, 'Opt-in evidence saved. The server determines approved contact status.') } }}><fieldset disabled={locked || isSuppressedContact(selectedContact)}><label className="es-field"><span>Explicit opt-in evidence for this app</span><textarea rows={5} value={consentEvidence} onChange={e => { setConsentEvidence(e.target.value); setPermissionConfirmed(false) }} placeholder="Record when and how this person opted in, the wording and scope of permission, and a verifiable consent record reference." required /><small>Include date, method, app-specific promotional permission, and record reference (at least 20 characters). Source evidence alone is not permission.</small></label><label className="es-check"><input type="checkbox" checked={permissionConfirmed} onChange={e => setPermissionConfirmed(e.target.checked)} /><span>I have verified this recipient explicitly opted in to promotional email about {selectedApp.name}.</span></label><button className="es-button" type="submit" disabled={!permissionConfirmed || consentEvidence.trim().length < 20}>Save evidence + approve opt-in</button></fieldset></form><button type="button" className="es-button es-button--danger" disabled={locked || isSuppressedContact(selectedContact)} onClick={() => { void perform('suppress_contact', { contactId: selectedContact.id }, 'Contact suppressed across every app in this workspace. The server must exclude it from all future sending.') }}>Suppress contact</button>{isSuppressedContact(selectedContact) && <p className="es-help">Suppressed contacts cannot be re-approved here. The server must honor workspace-wide suppression and unsubscribe records.</p>}</> : <div className="es-empty es-empty--small"><h3>Review one person at a time.</h3><p>Select a saved contact to verify its source, record permission, or suppress it.</p></div>}</aside>
              </div>
              {Number.isInteger(data?.pagination?.contacts?.nextOffset) && <button type="button" className="es-button es-button--secondary es-button--full" disabled={locked || dirty} onClick={() => { void loadMore('contacts') }}>Load more saved contacts</button>}
              <p className="es-help">Loaded {contacts.length} contact records. Approval uses the server’s complete eligible-recipient check, not this page’s visible slice.</p>
            </section>

            <section className="es-card"><div className="es-section-head"><div><div className="es-kicker">03 / COPY REVIEW</div><h2>Every draft earns approval</h2></div><Badge>{drafts.length} loaded drafts</Badge></div><p>Generate a small batch, verify the claims and destination, then approve each eligible recipient’s copy. Editing a draft resets its approval.</p>
              <div className="es-generation"><label className="es-field"><span>Batch size</span><input type="number" min={1} max={10} step={1} value={draftLimit} disabled={locked} onChange={e => setDraftLimit(e.target.value)} /></label><button type="button" className="es-button es-button--secondary" disabled={locked || dirty || !data?.campaign?.id || readiness?.aiConfigured !== true || readiness?.draftingModelConfigured !== true || !serverOptedIn || !Number.isInteger(Number(draftLimit)) || Number(draftLimit) < 1 || Number(draftLimit) > 10} onClick={() => { void perform('generate_drafts', { limit: Number(draftLimit) }, 'Draft generation completed. Review the actual saved drafts below before approval.') }}>Generate up to {Number(draftLimit) >= 1 && Number(draftLimit) <= 10 ? draftLimit : 10} drafts</button></div>
              <p className="es-help">Drafting is a manual AI action, not part of the delivery timer. Requires a saved, unchanged campaign, configured AI and genuine opt-ins. Fresh copy never inherits approval.</p>
              {Array.isArray(readiness?.preparationBlockers) && readiness.preparationBlockers.length > 0 && <div className="es-blockers"><h3>Before AI preparation</h3><ul>{readiness.preparationBlockers.map(item => <li key={item}>{item}</li>)}</ul></div>}
              <div className="es-drafts">{drafts.length ? drafts.map(draft => <DraftEditor key={`${scope}:${draft.id}`} draft={draft} contact={contacts.find(contact => contact.id === draft.contact_id) || draft.email_contacts} disabled={locked} onAction={perform} />) : <div className="es-empty es-empty--small">No saved drafts to review. No example copy or performance metrics are presented as real activity.</div>}</div>
              {Number.isInteger(data?.pagination?.drafts?.nextOffset) && <button type="button" className="es-button es-button--secondary es-button--full" disabled={locked || dirty} onClick={() => { void loadMore('drafts') }}>Load more saved drafts</button>}
            </section>
          </div>

          <aside className="es-stack es-sidebar">
            {connection?.expected_email && <section className="es-card"><div className="es-kicker">REQUESTED SHARED SENDER</div><h2 className="es-recipient">{connection.expected_email}</h2><p>All app campaigns in this workspace use this requested Gmail identity. Google consent must verify this account; another login cannot silently replace it.</p><Badge tone={connection.configured === true ? 'ready' : 'neutral'}>{connection.configured === true ? 'Connected · Google consent verified this sender' : 'Not connected until Google consent succeeds'}</Badge></section>}
            <section className="es-card"><div className="es-kicker">WORKSPACE CONNECTION</div><h2>One Gmail. One budget.</h2><div className="es-connection-status"><Badge tone={data ? deliveryState.tone : 'warning'}>{data ? deliveryState.label : 'Status unavailable'}</Badge>{connection?.configured === true && <p className="es-recipient">{connection.email || 'Connected account email not returned'}</p>}{deliveryState.reason && <p className="es-help">{deliveryState.reason}</p>}</div><p>Gmail is shared by every app in this workspace. The backend must enforce <strong>{hasBudget ? `${budget} total emails per day` : 'one shared daily cap'}</strong>, not a separate account allowance for each app. This is the configured budget, not verified remaining capacity.</p><p className="es-help">A connected mailbox is not an active campaign or proof of inbox placement. Keep traffic genuinely wanted and consistent. Authentication passes do not force any recipient’s spam filter to accept marketing.</p>
              {connection?.configured === true ? <><button type="button" className="es-button es-button--secondary" disabled={!canConnect || Boolean(busy) || loading || !data} onClick={() => setDisconnectScope(scope)}>Disconnect Gmail…</button>{disconnectScope === scope && <div className="es-disconnect" role="group" aria-label="Confirm Gmail disconnect"><strong>Disconnect for every app?</strong><p>This removes the workspace’s shared Gmail connection. All app schedules must be blocked until reconnected. It does not delete contact evidence.</p><div className="es-actions"><button type="button" className="es-button es-button--danger" disabled={Boolean(busy)} onClick={() => { void perform('disconnect', {}, 'Shared Gmail account disconnected.', 'gmail') }}>Confirm disconnect</button><button type="button" className="es-button es-button--secondary" disabled={Boolean(busy)} onClick={() => setDisconnectScope('')}>Cancel</button></div></div>}</> : <button type="button" className="es-button" disabled={!canConnect || Boolean(busy) || loading || !data} onClick={() => { void perform('connect', {}, 'Opening Gmail’s secure authorization flow.', 'gmail') }}>{busy === 'connect' ? 'Opening OAuth…' : 'Connect Gmail securely ↗'}</button>}
              <p className="es-help">{canConnect ? 'Google OAuth only. No access tokens, passwords, or credentials are entered on this page.' : 'A workspace owner or admin must manage the shared Gmail connection.'}</p>
              {connection?.configured === true && <button type="button" className="es-button es-button--secondary es-button--full" disabled={!canConnect || Boolean(busy) || loading || !data || dirty} onClick={() => { void perform('check_connection', {}, 'Gmail authorization checked. No email was sent.', 'gmail') }}>Verify Gmail connection · no send</button>}
              <div className="es-capacity"><h3>100 desired per app. Capacity is shared.</h3><p>{apps.length} apps × 100 desired = <strong>{portfolioDemand.toLocaleString()} emails / day</strong>. {hasBudget ? `Configured shared budget: ${budget.toLocaleString()} / day.` : 'Personal/trial planning default: 400 / day; no configured budget has been verified.'}</p><p>Even split of {allocationBudget.toLocaleString()} across {apps.length} apps: <strong>up to {fairAllocation} / app / day</strong>, capped at 100. {portfolioDemand > allocationBudget ? `This leaves a ${Math.max(0, portfolioDemand - allocationBudget).toLocaleString()} / day gap against the desired portfolio target.` : 'The desired app target fits this planning budget before other mailbox use.'}</p><small>{budgetDraft?.scope === scope ? 'This is a proposed-budget estimate, not a saved allocation.' : 'This is a planning estimate, not a reservation or a verified remaining balance.'} Actual delivery depends on eligible enabled campaigns sharing this account, opted-in recipients, approved copy, suppressions, cooldown, and other mailbox sends. A lower pilot allocation does not fulfill the 100/app target.</small></div>
              <details className="es-disclosure"><summary>Configure the shared mailbox budget</summary><p className="es-help">400/day is the personal or trial safety ceiling. For an eligible paid Google Workspace mailbox, 1,800/day is the conservative recommendation with 200 of headroom; 2,000/day is the maximum only after explicit paid-account confirmation. Other mailbox sends consume the same provider capacity; headroom is not guaranteed remaining capacity.</p><form onSubmit={configureBudget}><fieldset disabled={!canConnect || Boolean(busy) || loading || !data || connection?.configured !== true}><label className="es-field"><span>Explicit account type</span><select value={budgetSettings.accountType} onChange={e => setBudgetDraft({ scope, value: { ...budgetSettings, accountType: e.target.value, dailyBudget: e.target.value === 'workspace' ? 1800 : 400, confirmWorkspace: false, sharedCapConfirmed: false } })} required><option value="">Choose account type…</option><option value="personal">Personal Gmail / trial · max 400</option><option value="workspace">Paid Google Workspace · max 2,000</option></select></label><label className="es-field"><span>Global daily budget · all apps combined</span><input type="number" min={1} max={maxBudget} step={1} value={budgetSettings.dailyBudget} onChange={e => { setBudgetDraft({ scope, value: { ...budgetSettings, dailyBudget: e.target.value, sharedCapConfirmed: false } }) }} required /><small>Do not budget per app. The server must reject over-cap configuration and stop or defer activity when the total shared cap is reached.</small></label>{budgetSettings.accountType === 'workspace' && <label className="es-check"><input type="checkbox" checked={budgetSettings.confirmWorkspace} onChange={e => updateBudget('confirmWorkspace', e.target.checked)} /><span>I confirm this mailbox is eligible paid Google Workspace, not personal Gmail or a trial account. Its verified provider allowance supports this budget.</span></label>}<label className="es-check"><input type="checkbox" checked={budgetSettings.sharedCapConfirmed} onChange={e => updateBudget('sharedCapConfirmed', e.target.checked)} /><span>I understand that all portfolio apps and other mailbox sends share one total sending cap. FloStudio must not bypass the provider’s cap, and reaching it can defer app deliveries.</span></label><button className="es-button es-button--secondary" type="submit" disabled={!budgetValid}>Save shared budget · no activation</button></fieldset></form></details>
            </section>
            {canConnect && connection?.configured === true && <section className="es-card"><div className="es-kicker">SEPARATE CONNECTION DIAGNOSTIC</div><h2>One email. No campaign.</h2><p>Review a fixed, nonpromotional test from {connection.email || 'the connected Gmail account'} to your authenticated account, or to the connected Gmail account itself. Daily marketing campaigns stay disabled.</p><button type="button" className="es-button es-button--secondary es-button--full" disabled={!canTest} onClick={() => { if (canTest) setTestReview({ scope, identity: authIdentity, sender: connection.email, recipient: testRecipients[0].email }) }}>Send one test email…</button><p className="es-help">{testAttempted ? 'A diagnostic was already requested for this Gmail account in this visit. Check inbox/spam; do not retry, even if the result was unknown.' : !authIdentity || !testRecipients.length ? 'Verifying your authenticated email and the connected Gmail address before review. No arbitrary recipient address is permitted.' : readiness?.sendingEnabled !== false ? 'This diagnostic requires daily campaign live sending to be disabled on the server.' : 'One diagnostic per connected Google account across all apps. Opening the review does not send. Only its final confirmation requests one email; there are no automatic retries.'}</p></section>}
            <section className="es-card es-readiness"><div className="es-kicker">DEPLOYMENT + CONSENT GATES</div><h2>Connection is not delivery</h2><ul className="es-checklist">{[['Gmail connected', connection?.configured === true && readiness?.gmailConfigured === true], ['Live sending deployment enabled', readiness?.sendingEnabled === true], ['Application delivery timer enabled', readiness?.cronConfigured === true], ['Workspace mailbox gate enabled', connection?.connection_sending_enabled === true], ['Shared account gate enabled', connection?.account_sending_enabled === true]].map(([label, ready]) => <li key={label}><span>{label}</span><Badge tone={ready ? 'ready' : 'warning'}>{ready ? 'Enabled' : 'Disabled / not ready'}</Badge></li>)}</ul>
              <div className="es-evidence-counts"><div><strong>{serverOptedIn}</strong><span>Server-counted opt-ins</span></div><div><strong>{serverEligible}</strong><span>Reviewed eligible recipients</span></div></div><p className="es-help">Complete server-side eligibility includes suppression and permanent no-repeat history; it is not limited to loaded contact pages. {serverApprovedDrafts} approved draft records are reported, not sent emails or confirmed inbox delivery.</p>
              <div className="es-preview"><div className="es-kicker">THREE INDEPENDENT TIMERS</div><p>Research checks eligible apps every minute and saves business candidates only. Daily campaign creation checks every five minutes and saves one unapproved listing-based draft per app-local day with its matching App Store link. Delivery separately checks every five minutes and processes human-approved recipient copy only. No timer grants consent or approves fresh copy; recipient-specific AI drafting remains manual.</p></div>
              {blockers.length ? <div className="es-blockers"><h3>Before schedule approval</h3><ul>{blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul></div> : <div className="es-alert es-alert--success">Client checks are complete. The server still performs the atomic authoritative approval checks.</div>}{dirty && <p className="es-help">Unsaved configuration changes also block approval.</p>}
              {warnings.length > 0 && <div className="es-alert es-alert--warning" role="note"><h3>Capacity + mailbox caveats</h3><ul className="es-server-warnings">{warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>}
              <button type="button" className="es-button es-button--full" disabled={!canApprove} onClick={() => { setApprovalScope(scope); event('schedule_review_opened') }}>Review + approve schedule</button>
              {data?.campaign?.state === 'approved' && <p className="es-help">Schedule configuration is approved, not a guarantee of sending. Later processing remains subject to permission, approved copy, suppressions, daily caps, and live server gates.</p>}
              <button type="button" className="es-button es-button--secondary es-button--full" disabled={locked || !data?.campaign?.id || data.campaign.state === 'paused'} onClick={() => { void perform('set_state', { state: 'paused' }, 'Campaign paused for this app.') }}>Pause this app’s campaign</button><p className="es-help">There is no campaign “send now” action. The separate one-time Gmail diagnostic does not activate a campaign, cron, or live campaign sending.</p>
            </section>
            <section className="es-card"><div className="es-section-head"><div><div className="es-kicker">ACTUAL QUEUE RECORDS</div><h2>Scheduled activity</h2></div><Badge>{queue.length}</Badge></div>{queue.length ? <ul className="es-queue">{queue.map(item => <li key={item.id}><span><strong>{item.scheduled_day || 'Day not returned'}</strong><small>Record {item.id}</small></span><Badge>{labelStatus(item.status)}</Badge></li>)}</ul> : <div className="es-empty es-empty--small">No queue records returned for this app. Nothing is shown as sent, scheduled, or opened without an actual API record.</div>}<button type="button" className="es-button es-button--secondary es-button--full" onClick={() => { void refresh(); event('configuration_refreshed') }} disabled={Boolean(busy) || loading || dirty}>Refresh server status</button>{dirty && <p className="es-help">Save configuration first; refreshing replaces local settings with saved values.</p>}</section>
          </aside>
        </div>
      </>}
    </>}
    {approvalScope === scope && scope && data && selectedApp && <ApprovalDialog key={`${scope}:${launch?.reviewRevision}`} app={selectedApp} campaign={savedForm} contacts={reviewRecipients} draftCount={serverApprovedDrafts} budget={hasBudget ? budget : 'unavailable'} appCount={apps.length} pauseReason={deliveryState.reason} busy={Boolean(busy)} onClose={() => setApprovalScope('')} onApprove={approveSchedule} />}
    {testReviewCurrent && scope && data && canConnect && connection?.configured === true && <GmailTestDialog key={`${scope}:${authIdentity}:${connection.email}`} sender={connection.email} recipients={testRecipients} recipient={testReview.recipient} busy={Boolean(busy)} onRecipient={recipient => { if (testRecipients.some(item => item.email === recipient)) setTestReview(current => ({ ...current, recipient })) }} onClose={() => setTestReview(null)} onSend={() => { void sendOneTest() }} />}
  </div></Layout>
}
