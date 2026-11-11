import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { buildEmailDraftResearchPrompt } from '../src/lib/emailDraftResearchPrompt.js'

const require = createRequire(import.meta.url)
const esbuild = require(require.resolve('esbuild', { paths: [dirname(require.resolve('vite'))] }))
const source = readFileSync(new globalThis.URL('../src/components/EmailWorkspaceDraftsPanel.jsx', import.meta.url), 'utf8')
const dailySource = readFileSync(new globalThis.URL('../src/components/EmailDailyCampaignPanel.jsx', import.meta.url), 'utf8')
const strip = value => value.replace(/^import .*$/gm, '').replace(/export default function /g, 'function ').replace(/export (const|function|async function) /g, '$1 ')
const compile = (value, bindings, result) => new Function('runtime', `${esbuild.transformSync(`const { ${bindings.join(', ')} } = runtime;\n${strip(value)}`, { loader: 'jsx', jsxFactory: '__jsx', target: 'es2022' }).code}\nreturn ${result};`)
const helpers = compile(dailySource, ['useCallback', 'useEffect', 'useRef', 'useState', 'emailCampaignAction', '__jsx'], '{ dailyCampaignStatusResponse, safeDailyCampaignAppUrl, dailyCampaignCopyPayload }')({})
const load = compile(source, ['useCallback', 'useEffect', 'useRef', 'useState', 'getEmailWorkspaceAutomation', 'emailCampaignAction', 'dailyCampaignStatusResponse', 'safeDailyCampaignAppUrl', 'dailyCampaignCopyPayload', 'buildEmailDraftResearchPrompt', 'navigator', '__jsx'], '{ Component: EmailWorkspaceDraftsPanel, workspaceDraftAppsResponse, workspaceDailyDraftResponse, workspaceDraftCopyText, workspaceDraftMatchesSearch, workspaceDraftNextDay }')
const W = '11111111-1111-4111-8111-111111111111', W2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const id = index => `22222222-2222-4222-8222-${String(index + 1).padStart(12, '0')}`
const recordId = index => `33333333-3333-4333-8333-${String(index + 1).padStart(12, '0')}`
const DAY = '2026-11-11'
const URL = 'https://apps.apple.com/us/app/example/id123456789'
const app = index => ({ id: id(index), name: `Actual app ${index + 1}` })
const workspace = (count = 1, workspaceId = W) => ({ automation: { workspace_id: workspaceId, reviewRevision: 'a'.repeat(32), truncated: false, totals: { activeApps: count, todayDrafts: count, optedInContacts: 999 }, apps: Array.from({ length: count }, (_, index) => ({ ...app(index), todayDraftCreated: true, optedInCount: 999 })) }, deployment: {} })
const record = (productId = id(0), workspaceId = W, extra = {}) => ({ id: recordId(Number(productId.slice(-12)) - 1), workspace_id: workspaceId, product_id: productId, scheduled_day: DAY, subject: `Actual saved subject ${productId.slice(-3)}`, body: `  Actual saved body.\n\n${URL}\n`, app_store_url: URL, status: 'draft', content_source: 'listing_template', created_at: '2026-11-11T09:02:00Z', updated_at: '2026-11-11T09:04:00Z', ...extra })
const status = (productId = id(0), workspaceId = W, extra = {}) => ({ dailyCampaign: { settings: { workspace_id: workspaceId, product_id: productId, enabled: true, timezone: 'America/New_York', start_hour: 4, settings_revision: 'saved' }, campaigns: [record(productId, workspaceId)], today: { scheduled_day: DAY, created: true }, ...extra }, deployment: { enabled: true, configured: true, blockers: [] } })
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const nodes = tree => tree == null || tree === false ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : typeof tree === 'object' ? [tree, ...nodes(tree.children)] : [tree]
const text = tree => nodes(tree).filter(item => ['string', 'number'].includes(typeof item)).join(' ').replace(/\s+/g, ' ').trim()
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]))

// Match the existing lightweight JSX hook harness. Every API, auth wait and
// clipboard operation is synthetic; this suite cannot contact a real service.
function harness(props = {}, { clipboardAvailable = true } = {}) {
  const state = [], effects = []
  let cursor = 0, changed = false, tree, unmounted = false
  const h = { props: { workspaceId: W, workspaceName: 'Actual workspace', ...props }, calls: [], dispatched: [], copied: [], active: 0, maximum: 0, updatesAfterUnmount: 0 }
  h.auth = async () => {}
  h.respondWorkspace = async input => workspace(1, input.workspaceId)
  h.respondDaily = async input => status(input.productId, input.workspaceId)
  h.clipboard = async value => { h.copied.push(value) }
  const request = async (kind, input) => {
    h.calls.push({ kind, ...input }); h.active += 1; h.maximum = Math.max(h.maximum, h.active)
    try {
      await h.auth(kind, input)
      if (input.signal.aborted || !input.isCurrent()) { const error = new Error('Cancelled'); error.name = 'AbortError'; throw error }
      h.dispatched.push({ kind, workspaceId: input.workspaceId, ...(kind === 'daily' ? { productId: input.productId, action: input.action, payload: input.payload } : {}) })
      return await (kind === 'workspace' ? h.respondWorkspace(input) : h.respondDaily(input))
    } finally { h.active -= 1 }
  }
  const runtime = {
    ...helpers,
    buildEmailDraftResearchPrompt,
    __jsx: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState(initial) { const i = cursor++; if (!state[i]) state[i] = { value: typeof initial === 'function' ? initial() : initial }; return [state[i].value, next => { if (unmounted) h.updatesAfterUnmount += 1; const value = typeof next === 'function' ? next(state[i].value) : next; if (!Object.is(value, state[i].value)) { state[i].value = value; changed = true } }] },
    useRef(initial) { const i = cursor++; if (!state[i]) state[i] = { current: initial }; return state[i] },
    useCallback(fn, deps) { const i = cursor++; if (!state[i] || !sameDeps(state[i].deps, deps)) state[i] = { deps, value: fn }; return state[i].value },
    useEffect(fn, deps) { const i = cursor++; if (!state[i] || !sameDeps(state[i].deps, deps)) { const previous = state[i]; state[i] = { deps }; effects.push(() => { previous?.cleanup?.(); state[i].cleanup = fn() }) } },
    getEmailWorkspaceAutomation: input => request('workspace', input),
    emailCampaignAction: input => request('daily', input),
    navigator: clipboardAvailable ? { clipboard: { writeText: value => h.clipboard(value) } } : {},
  }
  h.helpers = load(runtime)
  h.render = () => { cursor = 0; changed = false; tree = h.helpers.Component(h.props); return tree }
  h.flush = async () => {
    for (let i = 0; i < 60; i++) {
      if (!unmounted) { h.render(); effects.splice(0).forEach(fn => fn()) }
      for (let j = 0; j < 100; j++) await Promise.resolve()
      if (unmounted || (!changed && !effects.length)) return tree
    }
    assert.fail('Panel must settle without an effect/render loop')
  }
  h.allText = () => text(tree)
  h.node = predicate => nodes(tree).find(item => item && typeof item === 'object' && predicate(item))
  h.rows = () => nodes(tree).filter(item => item?.type === 'article')
  h.row = index => h.rows()[index]
  h.button = (title, index = null) => nodes(index === null ? tree : h.row(index)).find(item => item?.type === 'button' && text(item) === title)
  h.refresh = () => h.button('Refresh all').props.onClick()
  h.copy = (field, index = 0) => h.button({ subject: 'Copy subject', body: 'Copy body', full: 'Copy full text' }[field], index).props.onClick()
  h.setProps = async next => { h.props = { ...h.props, ...next }; await h.flush() }
  h.unmount = () => { unmounted = true; for (const hook of state) hook?.cleanup?.(); effects.length = 0 }
  return h
}

test('content-only component reuses existing authenticated clients and styling with no writes, extra services or timers', () => {
  assert.match(source, /import \{ getEmailWorkspaceAutomation \} from '\.\.\/lib\/emailWorkspaceAutomationClient'/)
  assert.match(source, /import \{ emailCampaignAction \} from '\.\.\/lib\/emailCampaignClient'/)
  assert.match(source, /dailyCampaignStatusResponse, safeDailyCampaignAppUrl/)
  assert.equal((source.match(/action: '/g) || []).length, 1)
  assert.match(source, /const payload = selectedDay \? \{ scheduledDay: selectedDay \} : \{\}/)
  assert.match(source, /action: 'get_daily_campaign_status', payload,/)
  assert.doesNotMatch(source, /fetch\(|supabase|Firebase|localStorage|setInterval|setTimeout|mailto:|gmail|\bBCC\b|add_contacts|send_test|generate_drafts|approve_draft|save_daily_campaign_settings|update_daily_campaign|set_state|research_candidates|dangerouslySetInnerHTML|import .*\.css|<style/i)
  assert(source.includes('es-card') && source.includes('es-section-head') && source.includes('es-draft'))
  assert.deepEqual(source.match(/style=\{\{[^}]*\}\}/g), ["style={{ whiteSpace: 'pre-wrap' }}", "style={{ whiteSpace: 'pre-wrap' }}"])
})

test('25 exact active apps use at most three authenticated reads and only actual saved records', async () => {
  const h = harness(); h.respondWorkspace = async () => workspace(25); await h.flush()
  assert.equal(h.rows().length, 25); assert.equal(h.calls.length, 26); assert.equal(h.maximum, 3)
  assert.deepEqual(h.dispatched.filter(item => item.kind === 'daily').map(item => item.productId).sort(), Array.from({ length: 25 }, (_, index) => id(index)).sort())
  assert(h.dispatched.filter(item => item.kind === 'daily').every(item => item.workspaceId === W && item.action === 'get_daily_campaign_status' && JSON.stringify(item.payload) === '{}'))
  assert.equal(h.copied.length, 0)
  assert.match(h.allText(), /Confirmed active apps: 25/); assert.match(h.allText(), /completion-time guarantee/)
  assert(!h.allText().includes('999')); assert(!h.allText().includes('5AM'))
  assert.match(text(h.row(0)), /Nov 11, 2026, 4:02 AM/)
  assert.equal(h.button('Copy body', 0).props.disabled, false)
  h.unmount()
})

test('duplicate, malformed, cross-workspace, truncated or incomplete app sets fail closed before per-app reads', async () => {
  const bad = []
  let value = workspace(2); value.automation.apps[1] = { ...value.automation.apps[0] }; bad.push(value)
  value = workspace(); value.automation.workspace_id = W2; bad.push(value)
  value = workspace(); value.automation.apps[0].workspace_id = W2; bad.push(value)
  value = workspace(); value.automation.truncated = true; bad.push(value)
  value = workspace(); value.automation.totals.activeApps = 25; bad.push(value)
  value = workspace(); value.automation.apps[0].id = 'not-a-uuid'; bad.push(value)
  value = workspace(); value.automation.apps[0].name = ''; bad.push(value)
  value = workspace(); value.automation.apps[0].name = 'private@example.test'; bad.push(value)
  value = workspace(); value.automation.apps[0].name = 'x'.repeat(201); bad.push(value)
  value = workspace(); value.automation.reviewRevision = ''; bad.push(value)
  bad.push(workspace(201), {}, { automation: null })
  for (const response of bad) {
    const h = harness(); h.respondWorkspace = async () => response; await h.flush()
    assert.equal(h.calls.length, 1); assert.equal(h.rows().length, 0)
    assert.match(h.allText(), /Workspace draft read error/); assert(!h.allText().includes('@'))
    assert.equal(h.button('Refresh all').props.disabled, false); h.unmount()
  }
})

test('complete empty app set, member read, missing scope and disabled state are truthful', async () => {
  const empty = harness(); empty.respondWorkspace = async () => workspace(0); await empty.flush()
  assert.equal(empty.calls.length, 1); assert.match(empty.allText(), /no active apps/); empty.unmount()
  const member = harness(); await member.flush(); member.copy('subject'); await member.flush()
  assert.equal(member.copied.length, 1); assert.equal(member.calls.length, 2); member.unmount()
  for (const props of [{ workspaceId: '' }, { workspaceId: 'invalid' }, { disabled: true }]) {
    const h = harness(props); await h.flush(); h.refresh(); await h.flush()
    assert.equal(h.calls.length, 0); assert.equal(h.button('Refresh all').props.disabled, true); h.unmount()
  }
})

test('raw campaign cross-app/workspace IDs, settings IDs and duplicate dates/IDs are rejected before normalization', async () => {
  const variants = [
    { campaigns: [record(id(1))] }, { campaigns: [record(id(0), W2)] },
    { campaigns: [record(id(0), W, { workspace_id: undefined })] },
    { campaigns: [record(id(0), W, { id: 'bad-id' })] },
    { campaigns: [record(), record()] },
    { campaigns: [record(), record(id(0), W, { id: recordId(30) })] },
    { settings: { ...status().dailyCampaign.settings, product_id: id(1) } },
    { settings: { ...status().dailyCampaign.settings, workspace_id: W2 } },
    { today: { scheduled_day: DAY, created: true, product_id: id(1) } },
  ]
  for (const extra of variants) {
    const h = harness(); h.respondDaily = async () => status(id(0), W, extra); await h.flush()
    assert.match(text(h.row(0)), /Read error/); assert(!h.allText().includes('Actual saved subject'))
    h.copy('body'); await h.flush(); assert.equal(h.copied.length, 0); h.unmount()
  }
})

test('today is the exact server-local scheduled day, not history, timezone guesses or aggregate readiness', async () => {
  for (const extra of [
    { campaigns: [record(id(0), W, { scheduled_day: '2026-11-10', subject: 'Yesterday private saved subject' })], today: { scheduled_day: DAY, created: false } },
    { campaigns: [], today: { scheduled_day: DAY, created: true } },
  ]) {
    const h = harness(); h.respondDaily = async () => status(id(0), W, extra); await h.flush()
    assert.match(text(h.row(0)), /Missing/); assert.match(h.allText(), /2026-11-11/)
    assert(!h.allText().includes('Yesterday private')); assert(!h.allText().includes('Saved draft ·'))
    h.copy('full'); await h.flush(); assert.equal(h.copied.length, 0); h.unmount()
  }
  const h = harness(); h.respondDaily = async () => status(id(0), W, { campaigns: [record(id(0), W, { scheduled_day: '2026-11-12' })], today: { scheduled_day: '2026-11-12', created: true } }); await h.flush()
  assert.match(text(h.row(0)), /2026-11-12/); assert.match(text(h.row(0)), /Saved draft ·/); h.unmount()
  for (const today of [null, { localDate: DAY, created: true }, { scheduled_day: '2026-02-31', created: true }, { scheduled_day: DAY, created: 'true' }]) {
    const bad = harness(); bad.respondDaily = async () => status(id(0), W, { today }); await bad.flush(); assert.match(text(bad.row(0)), /Read error/); bad.unmount()
  }
})

test('per-app errors do not invent readiness and never echo arbitrary errors or address metadata', async () => {
  const h = harness(); h.respondWorkspace = async () => workspace(3)
  h.respondDaily = async input => {
    if (input.productId === id(1)) { const error = new Error('private-recipient@example.test provider token'); error.status = 403; throw error }
    if (input.productId === id(2)) return status(input.productId, W, { campaigns: [] })
    const value = status(); value.contacts = [{ email: 'private@example.test' }]; value.dailyCampaign.today.owner_email = 'private@example.test'; value.deployment.blockers = ['private@example.test']; return value
  }
  await h.flush()
  assert.match(text(h.row(0)), /Saved draft ·/); assert.match(text(h.row(1)), /Read error/); assert.match(text(h.row(2)), /Missing/)
  assert.equal(h.button('Copy full text', 1).props.disabled, true)
  h.copy('full', 1); await h.flush(); assert.equal(h.copied.length, 0)
  assert(!h.allText().includes('@')); assert(!h.allText().includes('provider token')); assert(!h.allText().includes('ready drafts'))
  h.unmount()
})

test('invalid saved status, unsafe URLs, oversized or non-plain content never renders or copies', async () => {
  const bad = [
    { status: 'approved' }, { app_store_url: URL + '?tracking=bad' }, { app_store_url: 'javascript:alert(1)' },
    { subject: 'x'.repeat(181) }, { subject: 'Subject\r\n' }, { subject: '<b>Subject</b>' }, { subject: 'Re: misleading' },
    { body: `private@example.test\n${URL}` }, { body: `Bcc: private@example.test\n${URL}` },
    { body: `\0${URL}` }, { body: `<b>Text</b>\n${URL}` }, { body: `[App](${URL})` },
    { body: 'x'.repeat(6001) }, { body: 'Missing actual App Store listing' },
    { body: `${URL}\nhttps://example.test/redirect` },
  ]
  for (const extra of bad) {
    const h = harness(); h.respondDaily = async () => status(id(0), W, { campaigns: [record(id(0), W, extra)] }); await h.flush()
    assert.match(text(h.row(0)), /Read error/); assert.equal(h.node(item => item.type === 'a'), undefined)
    h.copy('full'); await h.flush(); assert.equal(h.copied.length, 0); assert(!h.allText().includes('@')); h.unmount()
  }
})

test('user-only clipboard copies exact actual saved fields; optional callback receives only product/field', async () => {
  const events = [], h = harness({ onCopy: event => { events.push(event) } }); await h.flush()
  assert.equal(h.copied.length, 0)
  for (const field of ['subject', 'body', 'full']) { h.copy(field); await h.flush() }
  const saved = record()
  assert.deepEqual(h.copied, [saved.subject, saved.body, `Subject: ${saved.subject}\n\n${saved.body}`])
  assert.deepEqual(events, ['subject', 'body', 'full'].map(field => ({ productId: id(0), field })))
  assert.equal(h.calls.length, 2); assert.match(h.allText(), /nothing was sent/)
  assert.equal(h.node(item => item.type === 'input' && item.props.type === 'date').props.value, DAY)
  assert.equal(h.node(item => item.type === 'input' && item.props.type === 'search').props.maxLength, 200)
  assert.equal(h.node(item => item.type === 'form'), undefined)
  const link = h.node(item => item.type === 'a'); assert.equal(link.props.href, URL); assert.equal(link.props.rel, 'noopener noreferrer')
  await h.setProps({ onCopy: () => Promise.reject(new Error('synthetic private telemetry')) }); h.copy('subject'); await h.flush(); assert.match(h.allText(), /Saved text copied/); h.unmount()
})

test('clipboard failure exposes a read-only manual textarea without private errors or automatic copying', async () => {
  for (const available of [true, false]) {
    const h = harness({}, { clipboardAvailable: available }); h.clipboard = async () => { throw new Error('private@example.test clipboard') }; await h.flush()
    h.copy('body'); await h.flush(); const textarea = h.node(item => item.type === 'textarea' && item.props['aria-label']?.includes('manual copy'))
    assert.equal(textarea.props.readOnly, true); assert.equal(textarea.props.value, record().body)
    assert.match(h.allText(), /copy it manually/); assert(!h.allText().includes('@')); assert.equal(h.copied.length, 0)
    await h.setProps({ disabled: true }); assert.equal(h.node(item => item.type === 'textarea'), undefined); h.unmount()
  }
})

test('auth waits cannot dispatch after workspace changes, disable or unmount; no stale state updates', async () => {
  for (const kind of ['workspace', 'daily']) for (const change of [{ workspaceId: W2 }, { disabled: true }, 'unmount']) {
    const h = harness(), auth = deferred(); h.auth = current => current === kind ? auth.promise : Promise.resolve(); await h.flush()
    const attempted = h.calls.find(item => item.kind === kind); assert(attempted); assert.equal(typeof attempted.isCurrent, 'function')
    if (change === 'unmount') h.unmount(); else await h.setProps(change)
    assert.equal(attempted.signal.aborted, true); assert.equal(attempted.isCurrent(), false)
    auth.resolve(); await h.flush()
    assert(!h.dispatched.some(item => item.kind === kind && item.workspaceId === W)); assert.equal(h.updatesAfterUnmount, 0)
    if (change !== 'unmount') h.unmount()
  }
})

test('old workspace responses and handlers cannot flash or copy, including away-and-back render epochs', async () => {
  const h = harness(); await h.flush(); const oldCopy = h.button('Copy body', 0).props.onClick, oldRefresh = h.button('Refresh all').props.onClick
  h.props = { ...h.props, workspaceId: W2 }; assert(!text(h.render()).includes('Actual saved subject'))
  h.props = { ...h.props, workspaceId: W }; assert(!text(h.render()).includes('Actual saved subject'))
  oldCopy(); oldRefresh(); await h.flush(); assert.equal(h.copied.length, 0)
  const pending = deferred(); h.respondDaily = input => input.workspaceId === W ? pending.promise : Promise.resolve(status(input.productId, W2, { campaigns: [record(input.productId, W2, { subject: 'Newest workspace saved subject' })] }))
  h.refresh(); await h.flush(); const signal = h.calls.at(-1).signal
  await h.setProps({ workspaceId: W2 }); assert.equal(signal.aborted, true)
  pending.resolve(status()); await h.flush(); assert.match(h.allText(), /Newest workspace saved subject/); assert(!h.allText().includes('Actual saved subject'))
  h.unmount()
})

test('newest refresh wins and overlapping cancelled transports never exceed three in-flight reads', async () => {
  const h = harness(); await h.flush(); const pending = deferred()
  h.respondWorkspace = async () => workspace(25); h.respondDaily = async () => pending.promise
  h.refresh(); await h.flush(); assert.equal(h.active, 3)
  const attempted = h.calls.filter(item => item.kind === 'daily').slice(-3)
  h.respondWorkspace = async input => workspace(1, input.workspaceId); h.respondDaily = async input => status(input.productId, input.workspaceId, { campaigns: [record(input.productId, input.workspaceId, { subject: 'Newest confirmed subject' })] })
  // Invoke the handler captured before loading, simulating a rapid refresh click.
  const staleButton = h.button('Refresh all').props.onClick
  staleButton(); await h.flush(); assert.equal(h.active, 3); assert.equal(h.maximum, 3)
  assert(attempted.every(item => item.signal.aborted && !item.isCurrent()))
  pending.resolve(status()); await h.flush()
  assert.equal(h.maximum, 3); assert.equal(h.active, 0); assert.match(h.allText(), /Newest confirmed subject/)
  assert.equal(h.rows().length, 1); h.unmount()
})

test('refresh errors clear prior content and disable captured copy handlers until fresh scoped confirmation', async () => {
  const h = harness(); await h.flush(); const old = h.button('Copy full text', 0).props.onClick
  h.respondWorkspace = async () => { throw new Error('private@example.test transport') }; h.refresh(); await h.flush()
  old(); await h.flush(); assert.equal(h.copied.length, 0); assert.equal(h.rows().length, 0)
  assert.match(h.allText(), /Workspace draft read error/); assert(!h.allText().includes('@'))
  h.respondWorkspace = async () => workspace(); h.refresh(); await h.flush(); h.copy('full'); await h.flush(); assert.equal(h.copied.length, 1); h.unmount()
})

test('late clipboard resolutions cannot update old scope, refresh epoch, disabled state or unmounted state', async () => {
  for (const change of [{ workspaceId: W2 }, { disabled: true }, 'refresh', 'unmount']) {
    const h = harness(), pending = deferred(); await h.flush(); h.clipboard = () => pending.promise
    h.copy('subject'); await h.flush()
    if (change === 'unmount') h.unmount(); else if (change === 'refresh') { h.refresh(); await h.flush() } else await h.setProps(change)
    pending.resolve(); await h.flush(); assert(!h.allText().includes('Saved text copied')); assert.equal(h.updatesAfterUnmount, 0)
    if (change !== 'unmount') h.unmount()
  }
})

test('already-dispatched workspace or daily reads cannot update state after unmount even when transport ignores abort', async () => {
  for (const kind of ['workspace', 'daily']) for (const outcome of ['resolve', 'reject']) {
    const h = harness(), pending = deferred()
    if (kind === 'workspace') h.respondWorkspace = () => pending.promise
    else h.respondDaily = () => pending.promise
    await h.flush(); const attempted = h.calls.find(item => item.kind === kind)
    assert(h.dispatched.some(item => item.kind === kind)); h.unmount()
    assert.equal(attempted.signal.aborted, true); assert.equal(attempted.isCurrent(), false)
    if (outcome === 'resolve') pending.resolve(kind === 'workspace' ? workspace() : status())
    else pending.reject(new Error('private@example.test late response'))
    await h.flush(); assert.equal(h.updatesAfterUnmount, 0); assert.equal(h.active, 0)
  }
})

function calendarStatus(productId, workspaceId, selectedDay, campaigns = []) {
  return status(productId, workspaceId, { campaigns, selectedDay, selected: { scheduled_day: selectedDay, created: campaigns.length === 1 } })
}
const changeDate = (h, value) => h.node(item => item.type === 'input' && item.props.type === 'date').props.onChange({ target: { value } })
const changeSearch = (h, value) => h.node(item => item.type === 'input' && item.props.type === 'search').props.onChange({ target: { value } })

test('calendar browses an exact saved historical day and Today restores the legacy date-free read', async () => {
  const h = harness(); await h.flush()
  const oldCopy = h.button('Copy body', 0).props.onClick
  h.respondDaily = async input => input.payload.scheduledDay ? calendarStatus(input.productId, W, input.payload.scheduledDay, [record(input.productId, W, { scheduled_day: input.payload.scheduledDay, subject: 'Exact October saved draft' })]) : status(input.productId, W)
  changeDate(h, '2026-10-01'); assert(!text(h.render()).includes('Actual saved subject'))
  oldCopy(); await h.flush(); assert.equal(h.copied.length, 0)
  assert.match(h.allText(), /Saved drafts for 2026-10-01/); assert.match(h.allText(), /Exact October saved draft/)
  assert.equal(h.dispatched.at(-1).payload.scheduledDay, '2026-10-01')
  h.copy('subject'); await h.flush(); assert.equal(h.copied.at(-1), 'Exact October saved draft')
  h.button('Today').props.onClick(); await h.flush()
  assert.deepEqual(h.dispatched.at(-1).payload, {}); assert.match(h.allText(), /Actual saved subject/); h.unmount()
})

test('Tomorrow uses server-local day and displays not-created rows without substituting today or starting generation', async () => {
  const h = harness(); await h.flush()
  h.respondDaily = async input => calendarStatus(input.productId, W, input.payload.scheduledDay)
  h.button('Tomorrow').props.onClick(); await h.flush()
  assert.equal(h.dispatched.at(-1).payload.scheduledDay, '2026-11-12')
  assert.match(h.allText(), /Saved drafts for 2026-11-12/); assert.match(h.allText(), /Not created yet/)
  assert(!h.allText().includes('Actual saved subject')); assert(!h.allText().includes('Actual saved body'))
  assert.equal(h.button('Copy body', 0).props.disabled, true)
  h.copy('body'); await h.flush(); assert.equal(h.copied.length, 0)
  assert(h.dispatched.filter(c => c.kind === 'daily').every(c => c.action === 'get_daily_campaign_status')); h.unmount()
})

test('exact-date read errors and wrong selected metadata never render other dates or enable copying', async () => {
  for (const extra of [
    { selectedDay: '2026-11-10' },
    { selected: { scheduled_day: '2026-11-12', created: true } },
    { campaigns: [record()] },
    { campaigns: [record(id(1), W, { scheduled_day: '2026-11-12' })] },
  ]) {
    const h = harness(); await h.flush()
    h.respondDaily = async input => ({ ...calendarStatus(input.productId, W, input.payload.scheduledDay), dailyCampaign: { ...calendarStatus(input.productId, W, input.payload.scheduledDay).dailyCampaign, ...extra } })
    changeDate(h, '2026-11-12'); await h.flush()
    assert.match(text(h.row(0)), /Read error/); assert(!h.allText().includes('Actual saved subject')); assert.equal(h.button('Copy body', 0).props.disabled, true); h.unmount()
  }
})

test('calendar rejects impossible dates locally and date rollover uses UTC calendar arithmetic', async () => {
  const h = harness(); await h.flush(); const count = h.calls.length
  for (const value of ['2026-02-31', '0000-01-01', 'not-a-date', '2026-11-12\n']) { changeDate(h, value); await h.flush(); assert.equal(h.calls.length, count) }
  assert.equal(h.helpers.workspaceDraftNextDay('2026-11-11'), '2026-11-12')
  assert.equal(h.helpers.workspaceDraftNextDay('2026-12-31'), '2027-01-01')
  assert.equal(h.helpers.workspaceDraftNextDay('2028-02-28'), '2028-02-29')
  assert.equal(h.helpers.workspaceDraftNextDay('2026-02-28'), '2026-03-01')
  assert.equal(h.helpers.workspaceDraftNextDay('9999-12-31'), '')
  assert.equal(h.helpers.workspaceDraftNextDay('2026-02-31'), ''); h.unmount()
})

test('search matches app names, subjects, body and dates locally without additional requests', async () => {
  const h = harness(); h.respondWorkspace = async () => workspace(3); await h.flush(); const count = h.calls.length
  changeSearch(h, 'ACTUAL APP 2'); await h.flush(); assert.equal(h.rows().length, 1); assert.match(text(h.row(0)), /Actual app 2/)
  changeSearch(h, 'saved subject 003'); await h.flush(); assert.equal(h.rows().length, 1); assert.match(text(h.row(0)), /Actual app 3/)
  changeSearch(h, 'saved body'); await h.flush(); assert.equal(h.rows().length, 3)
  changeSearch(h, '2026-11-11'); await h.flush(); assert.equal(h.rows().length, 3)
  changeSearch(h, 'no matching saved content'); await h.flush(); assert.equal(h.rows().length, 0); assert.match(h.allText(), /No drafts match/)
  h.button('Clear search').props.onClick(); await h.flush(); assert.equal(h.rows().length, 3); assert.equal(h.calls.length, count); h.unmount()
})

test('search cannot copy a hidden captured row and pending clipboard does not leave controls locked', async () => {
  const h = harness(); await h.flush(); const oldCopy = h.button('Copy body', 0).props.onClick
  changeSearch(h, 'hidden'); await h.flush(); oldCopy(); await h.flush(); assert.equal(h.copied.length, 0)
  changeSearch(h, ''); await h.flush(); const pending = deferred(); h.clipboard = () => pending.promise
  h.copy('body'); await h.flush(); changeSearch(h, 'hidden'); await h.flush(); pending.resolve(); await h.flush()
  changeSearch(h, ''); await h.flush(); assert.equal(h.button('Copy body', 0).props.disabled, false); assert(!h.allText().includes('Saved text copied'))
  h.clipboard = async value => h.copied.push(value); h.copy('subject'); await h.flush(); assert.equal(h.copied.length, 1); h.unmount()
})

test('date changes cancel in-flight reads and newest date wins even if old transport ignores cancellation', async () => {
  const h = harness(); await h.flush(); const pending = deferred()
  h.respondDaily = async input => input.payload.scheduledDay === '2026-11-12' ? pending.promise : calendarStatus(input.productId, W, input.payload.scheduledDay)
  changeDate(h, '2026-11-12'); await h.flush(); const attempted = h.calls.at(-1)
  changeDate(h, '2026-11-13'); await h.flush(); assert.equal(attempted.signal.aborted, true)
  pending.resolve(calendarStatus(id(0), W, '2026-11-12', [record(id(0), W, { scheduled_day: '2026-11-12', subject: 'Stale November 12 copy' })])); await h.flush()
  assert.match(h.allText(), /Saved drafts for 2026-11-13/); assert(!h.allText().includes('Stale November 12')); assert.match(h.allText(), /Not created yet/); h.unmount()
})

test('each saved draft has a bounded app/date research prompt and a separate one-click copy control', async () => {
  const events = [], h = harness({ onCopy: event => events.push(event) }); await h.flush()
  const expected = buildEmailDraftResearchPrompt({ productId: id(0), appName: app(0).name, scheduledDay: DAY, appStoreUrl: URL })
  const textarea = h.node(item => item.type === 'textarea' && item.props['aria-label']?.startsWith('Research prompt for'))
  assert.equal(textarea.props.readOnly, true); assert.equal(textarea.props.maxLength, 1500); assert.equal(textarea.props.value, expected.prompt)
  const count = h.calls.length; h.button('Copy research prompt', 0).props.onClick(); await h.flush()
  assert.deepEqual(h.copied, [expected.prompt]); assert.equal(h.calls.length, count)
  assert.deepEqual(events, [{ productId: id(0), field: 'research' }]); assert.match(h.allText(), /No search was run and nothing was sent/)
  assert.match(expected.prompt, /Target: 80 verified/); assert(expected.prompt.includes(URL)); assert(expected.prompt.includes(DAY)); h.unmount()
})

test('future or unverified drafts have no generated research prompt or captured copy capability', async () => {
  const h = harness(); await h.flush(); const old = h.button('Copy research prompt', 0).props.onClick
  h.respondDaily = async input => calendarStatus(input.productId, W, input.payload.scheduledDay)
  h.button('Tomorrow').props.onClick(); await h.flush()
  assert.equal(h.button('Copy research prompt', 0), undefined)
  assert.equal(h.node(item => item.type === 'textarea'), undefined)
  old(); await h.flush(); assert.equal(h.copied.length, 0); h.unmount()
})

test('research prompt clipboard failure supplies only the bounded prompt and date changes clear it', async () => {
  const h = harness({}, { clipboardAvailable: false }); await h.flush()
  h.button('Copy research prompt', 0).props.onClick(); await h.flush()
  const manual = h.node(item => item.type === 'textarea' && item.props['aria-label'] === 'Saved research for manual copy')
  assert.equal(manual.props.readOnly, true); assert.match(manual.props.value, /Target: 80 verified/); assert(!manual.props.value.includes('Actual saved body'))
  h.respondDaily = async input => calendarStatus(input.productId, W, input.payload.scheduledDay)
  changeDate(h, '2026-11-12'); await h.flush(); assert.equal(h.node(item => item.type === 'textarea'), undefined); h.unmount()
})
