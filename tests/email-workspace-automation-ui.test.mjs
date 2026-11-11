import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'

// Execute the real JSX with a small deterministic hook harness. No browser,
// credentials, provider, network, timers or delivery endpoints are used.
const require = createRequire(import.meta.url)
const esbuild = require(require.resolve('esbuild', { paths: [dirname(require.resolve('vite'))] }))
const source = readFileSync(new URL('../src/components/EmailWorkspaceAutomationPanel.jsx', import.meta.url), 'utf8')
const bindings = ['useCallback', 'useEffect', 'useRef', 'useState', 'getEmailWorkspaceAutomation', 'setEmailWorkspaceAutomation', '__jsx']
const stripped = source.replace(/^import .*$/gm, '').replace(/export default function /g, 'function ').replace(/export (const|function|async function) /g, '$1 ')
const compiled = esbuild.transformSync(`const { ${bindings.join(', ')} } = runtime;\n${stripped}`, { loader: 'jsx', jsxFactory: '__jsx', target: 'es2022' }).code
const load = new Function('runtime', `${compiled}\nreturn { Component: EmailWorkspaceAutomationPanel, workspaceAutomationStatusResponse, workspaceAutomationAppliedResponse };`)
const W = 'workspace-offline', R = '0123456789abcdef0123456789abcdef'
const START = 'Start daily research + drafts for all apps…', PAUSE = 'Pause daily research + drafts for all apps…'
const app = (extra = {}) => ({ id: 'app-one', name: 'Actual first app', researchEnabled: false, draftsEnabled: false, researchTarget: 80, researchRequestLimit: 8, researchTimezone: 'America/New_York', researchStartHour: 6, draftTimezone: 'America/New_York', draftStartHour: 7, todayDraftCreated: false, deliveryEnabled: false, senderDetailsComplete: false, optedInCount: 0, ...extra })
const apps = () => [app(), app({ id: 'app-two', name: 'Actual second app', researchEnabled: true, draftsEnabled: true, researchTarget: 45, researchRequestLimit: 5, researchTimezone: 'Europe/London', researchStartHour: 9, draftTimezone: 'Asia/Tokyo', draftStartHour: 12, todayDraftCreated: true, deliveryEnabled: true, senderDetailsComplete: true, optedInCount: 11 })]
const totalsFor = rows => ({ activeApps: rows.length, researchEnabled: rows.filter(row => row.researchEnabled).length, draftsEnabled: rows.filter(row => row.draftsEnabled).length, todayDrafts: rows.filter(row => row.todayDraftCreated).length, deliveryEnabled: rows.filter(row => row.deliveryEnabled).length, optedInContacts: rows.reduce((sum, row) => sum + row.optedInCount, 0), researchRequestCeiling: Math.min(200, rows.reduce((sum, row) => sum + row.researchRequestLimit, 0)) })
const status = ({ workspaceId = W, rows = apps(), revision = R, deployment = {} } = {}) => ({ automation: { workspace_id: workspaceId, reviewRevision: revision, apps: rows, totals: totalsFor(rows), truncated: false }, deployment: { researchConfigured: true, draftsConfigured: true, workspaceDailyRequestLimit: 200, aiConfigured: true, sendingEnabled: false, deliveryConfigured: false, ...deployment } })
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const nodes = tree => {
  if (tree == null || tree === false) return []
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  if (typeof tree !== 'object') return [tree]
  return [tree, ...nodes(tree.children)]
}
const text = tree => nodes(tree).filter(item => typeof item === 'string' || typeof item === 'number').join(' ').replace(/\s+/g, ' ').trim()
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]))

function harness(props = {}) {
  const hooks = [], effects = []
  let cursor = 0, changed = false, tree
  const h = { calls: [], dispatched: [], connects: 0, changes: 0, props: { workspaceId: W, workspaceName: 'Actual workspace', canEdit: true, connection: { configured: false, expected: true }, readiness: { gmailConfigured: true }, onConnect: () => { h.connects++ }, onChanged: () => { h.changes++ }, ...props } }
  h.response = status()
  h.auth = async () => {}
  h.respond = async input => {
    if (input.method === 'GET') return h.response
    const before = h.response.automation.apps
    const rows = before.map(row => ({ ...row, researchEnabled: input.enabled, draftsEnabled: input.enabled }))
    h.response = status({ workspaceId: input.workspaceId, rows, revision: input.enabled ? 'abcdef0123456789abcdef0123456789' : R, deployment: h.response.deployment })
    // Exactly the endpoint contract, without any sending/consent mutations.
    return { ...h.response, applied: true, mode: 'research_and_drafts', researchChanged: before.filter(row => row.researchEnabled !== input.enabled).length, draftsChanged: before.filter(row => row.draftsEnabled !== input.enabled).length, deliveryChanged: 0 }
  }
  const request = async (method, input) => {
    h.calls.push({ method, ...input })
    await h.auth({ method, ...input })
    // The parent-owned authenticated client must perform this guard AFTER auth.
    if (input.signal?.aborted || !input.isCurrent()) { const error = new Error('Cancelled'); error.name = 'AbortError'; throw error }
    const payload = method === 'GET' ? { workspaceId: input.workspaceId } : { workspaceId: input.workspaceId, enabled: input.enabled, reviewRevision: input.reviewRevision, confirmResearchCost: input.confirmResearchCost }
    h.dispatched.push({ method, ...payload })
    return h.respond({ method, ...input })
  }
  const runtime = {
    __jsx(type, props, ...children) { if (props?.ref) props.ref.current = { focus() {} }; return { type, props: props || {}, children } },
    useState(initial) {
      const i = cursor++
      if (!hooks[i]) hooks[i] = { value: typeof initial === 'function' ? initial() : initial }
      return [hooks[i].value, next => { const value = typeof next === 'function' ? next(hooks[i].value) : next; if (!Object.is(hooks[i].value, value)) { hooks[i].value = value; changed = true } }]
    },
    useRef(initial) { const i = cursor++; if (!hooks[i]) hooks[i] = { current: initial }; return hooks[i] },
    useCallback(fn, deps) { const i = cursor++; if (!hooks[i] || !sameDeps(hooks[i].deps, deps)) hooks[i] = { deps, value: fn }; return hooks[i].value },
    useEffect(fn, deps) { const i = cursor++; if (!hooks[i] || !sameDeps(hooks[i].deps, deps)) { const previous = hooks[i]; hooks[i] = { deps }; effects.push(() => { previous?.cleanup?.(); hooks[i].cleanup = fn() }) } },
    getEmailWorkspaceAutomation: input => request('GET', input),
    setEmailWorkspaceAutomation: input => request('POST', input),
  }
  h.helpers = load(runtime)
  h.render = () => { cursor = 0; changed = false; tree = h.helpers.Component(h.props); return tree }
  h.flush = async () => {
    for (let i = 0; i < 50; i++) {
      h.render(); effects.splice(0).forEach(fn => fn())
      for (let j = 0; j < 20; j++) await Promise.resolve()
      if (!changed && !effects.length) return tree
    }
    assert.fail('Panel must settle without a render/effect loop')
  }
  h.allText = () => text(tree)
  h.node = predicate => nodes(tree).find(item => item && typeof item === 'object' && predicate(item))
  h.button = label => h.node(item => item.type === 'button' && text(item) === label)
  h.review = () => h.node(item => item.props['aria-label'] === 'Review workspace daily research and drafts')
  h.form = () => h.node(item => item.type === 'form' && item.props['aria-label'] === 'Confirm workspace daily research and drafts')
  h.checkbox = () => h.node(item => item.type === 'input' && item.props['aria-label'] === 'Acknowledge recurring research costs')
  h.metric = label => h.node(item => item.type === 'div' && item.children?.some(child => child?.type === 'dt' && text(child) === label))
  h.open = async (enabled = true) => { h.button(enabled ? START : PAUSE).props.onClick(); await h.flush() }
  h.ack = async (checked = true) => { h.checkbox().props.onChange({ target: { checked } }); await h.flush() }
  h.submit = () => h.form().props.onSubmit({ preventDefault() {} })
  h.refresh = () => h.button('Refresh workspace status').props.onClick()
  h.setProps = async next => { h.props = { ...h.props, ...next }; await h.flush() }
  h.posts = () => h.dispatched.filter(input => input.method === 'POST')
  h.unmount = () => { for (const hook of hooks) hook?.cleanup?.(); effects.length = 0 }
  return h
}

async function readyReview(h, enabled = true) { await h.flush(); await h.open(enabled); if (enabled) await h.ack() }

test('component uses only workspace GET/POST client and es-* styles, never send, consent, provider, browser or credential APIs', () => {
  assert.match(source, /import \{ getEmailWorkspaceAutomation, setEmailWorkspaceAutomation \} from '\.\.\/lib\/emailWorkspaceAutomationClient'/)
  assert.doesNotMatch(source, /fetch\(|supabase|localStorage|sessionStorage|authenticatedJsonHeaders|send_test|approve_draft|set_state|consent_contact|add_contacts|generate_drafts|oauth|window\.|setInterval\(/)
  assert.doesNotMatch(source, /import .*\.css|<style|style=|dangerouslySetInnerHTML/)
  assert.match(source, /reviewRevision: selected\.value\.automation\.reviewRevision/)
  assert.match(source, /Automatic sending is not started by this button\. Researched contacts are candidates\. Delivery requires recipient opt-in, reviewed recipient copy, sender footer and live gates\./)
})

test('mount and refresh are GET only, no connection callback or automatic start, and actual counts are server-backed', async () => {
  const h = harness(); await h.flush()
  assert.deepEqual(h.dispatched, [{ method: 'GET', workspaceId: W }])
  assert.equal(h.connects, 0); assert.equal(h.changes, 0); assert.equal(h.review(), undefined)
  assert.match(h.allText(), /One setup\. All apps\./)
  assert.match(h.allText(), /Actual workspace/)
  assert.match(h.allText(), /not only the selected app/)
  for (const [label, value] of [['Active apps · exact set', 2], ['Research enabled · actual', 1], ['Daily drafts enabled · actual', 1], ['Drafts created today · actual', 1], ['Delivery enabled · existing', 1], ['Opted-in contacts · actual', 11], ['Apps missing sender details', 1]]) assert.match(text(h.metric(label)), new RegExp(` ${value}(?: |$)`))
  assert.match(text(h.metric('Research request ceiling · server')), /13 \/ day.*200/)
  assert.match(h.allText(), /No connected account identity provided/)
  assert(!h.button(START).props.disabled, 'Gmail is not a research/draft prerequisite')
  h.refresh(); await h.flush()
  assert.equal(h.calls.length, 2); assert(h.calls.every(call => call.method === 'GET')); h.unmount()
})

test('one user confirmation starts every exact reviewed app using one POST, including zero-contact app, at existing schedules', async () => {
  const h = harness(); await h.flush(); await h.open()
  assert.equal(h.posts().length, 0)
  const review = text(h.review())
  for (const value of ['Actual first app', 'app-one', 'Actual second app', 'app-two', '06:00 · America/New_York', '07:00 · America/New_York', '09:00 · Europe/London', '12:00 · Asia/Tokyo', R, '80', '45', 'Opted-in contacts: 0', 'Opted-in contacts: 11']) assert(review.includes(value), value)
  assert.match(review, /shared workspace cap of 200/)
  assert.match(review, /not guaranteed yields/)
  assert.match(review, /templates add no AI charges/)
  assert(h.button('Start all daily research + drafts').props.disabled)
  await h.submit(); await h.flush(); assert.equal(h.posts().length, 0)
  await h.ack(); assert(!h.button('Start all daily research + drafts').props.disabled)
  const submit = h.form().props.onSubmit
  const saving = submit({ preventDefault() {} }); submit({ preventDefault() {} })
  await saving; await h.flush()
  assert.deepEqual(h.posts(), [{ method: 'POST', workspaceId: W, enabled: true, reviewRevision: R, confirmResearchCost: true }])
  assert.equal(h.calls.filter(call => call.method === 'GET').length, 1)
  assert.equal(h.changes, 1)
  assert.match(h.allText(), /Daily research \+ drafts enabled for the exact reviewed active app set/)
  assert.match(h.allText(), /Sending, contacts and recipient opt-in are unchanged/)
  assert.equal(h.review(), undefined)
  assert.equal(h.response.automation.apps[0].optedInCount, 0)
  assert.equal(h.response.automation.apps[0].deliveryEnabled, false)
  assert.equal(h.response.automation.apps[1].deliveryEnabled, true)
  h.unmount()
})

test('pause requires exact review and one confirmed request, with no deletion, delivery change or cost acknowledgement', async () => {
  const h = harness(); await h.flush(); await h.open(false)
  assert.equal(h.posts().length, 0); assert.equal(h.checkbox(), undefined)
  assert.match(text(h.review()), /Pause only research and daily draft creation/)
  assert.match(text(h.review()), /Do not delete saved drafts or contacts/)
  await h.submit(); await h.flush()
  assert.deepEqual(h.posts(), [{ method: 'POST', workspaceId: W, enabled: false, reviewRevision: R, confirmResearchCost: false }])
  assert.match(h.allText(), /paused for the exact reviewed active app set/)
  assert.match(h.allText(), /Saved drafts and contacts are not deleted/)
  assert.equal(h.response.automation.apps[1].todayDraftCreated, true)
  assert.equal(h.response.automation.apps[1].optedInCount, 11)
  assert.equal(h.response.automation.apps[1].deliveryEnabled, true)
  h.unmount()
})

test('shared Gmail shows one supplied identity, no illustrative address; onConnect runs only on current user click', async () => {
  const h = harness(); await h.flush()
  assert.equal(h.connects, 0)
  const oldClick = h.button('Connect Gmail for all apps').props.onClick
  oldClick(); await h.flush(); assert.equal(h.connects, 1); assert.equal(h.posts().length, 0)
  await h.setProps({ connection: { configured: true, email: 'real-account@example.test' } })
  assert.match(h.allText(), /Shared Gmail connected/)
  assert.equal(h.allText().split('real-account@example.test').length - 1, 1)
  assert.equal(h.button('Connect Gmail for all apps'), undefined)
  oldClick(); assert.equal(h.connects, 1, 'captured old connect must respect current render state')
  await h.setProps({ connection: { configured: true } })
  assert.match(h.allText(), /Connected account identity not provided/)
  assert(!h.allText().includes('real-account@example.test'))
  await h.setProps({ connection: { configured: true, email: 'bad<identity>@example.test' } })
  assert(!h.allText().includes('bad<identity>'))
  h.unmount()
})

test('members have read-only refresh; disabled, missing workspace or zero apps have no connect/start/pause action', async () => {
  const member = harness({ canEdit: false }); await member.flush()
  assert.match(member.allText(), /Read-only access/)
  assert(member.button(START).props.disabled); assert(member.button(PAUSE).props.disabled)
  member.button(START).props.onClick(); member.button(PAUSE).props.onClick(); member.button('Connect Gmail for all apps').props.onClick(); await member.flush()
  assert.equal(member.review(), undefined); assert.equal(member.connects, 0); assert.equal(member.posts().length, 0)
  member.refresh(); await member.flush(); assert.equal(member.calls.length, 2); member.unmount()
  for (const props of [{ disabled: true }, { workspaceId: '' }]) {
    const h = harness(props); await h.flush()
    assert.equal(h.calls.length, 0)
    h.button(START).props.onClick(); h.button(PAUSE).props.onClick(); h.button('Connect Gmail for all apps').props.onClick(); h.refresh(); await h.flush()
    assert.equal(h.calls.length, 0); assert.equal(h.connects, 0); h.unmount()
  }
  const empty = harness(); empty.response = status({ rows: [] }); await empty.flush()
  assert.match(empty.allText(), /There are no active apps/)
  assert.match(text(empty.metric('Active apps · exact set')), / 0$/)
  empty.button(START).props.onClick(); empty.button(PAUSE).props.onClick(); empty.button('Connect Gmail for all apps').props.onClick(); await empty.flush()
  assert.equal(empty.posts().length, 0); assert.equal(empty.connects, 0); assert.equal(empty.review(), undefined); empty.unmount()
})

test('start blocks missing worker/AI prerequisites, but pause remains possible and Gmail/sending gates do not block draft-only start', async () => {
  for (const key of ['researchConfigured', 'draftsConfigured', 'aiConfigured']) {
    const h = harness(); h.response = status({ deployment: { [key]: false } }); await h.flush()
    assert(h.button(START).props.disabled); h.button(START).props.onClick(); await h.flush(); assert.equal(h.review(), undefined)
    assert.match(h.allText(), /Start blocked/)
    assert(!h.button(PAUSE).props.disabled); await h.open(false); await h.submit(); await h.flush(); assert.equal(h.posts().length, 1); h.unmount()
  }
  const h = harness({ connection: undefined, readiness: undefined }); await readyReview(h)
  assert(!h.button('Start all daily research + drafts').props.disabled)
  await h.submit(); await h.flush(); assert.equal(h.posts().length, 1); h.unmount()
})

test('unchanged refresh preserves inline review and cost acknowledgement; snapshot/revision/count changes invalidate it', async () => {
  const h = harness(); await readyReview(h)
  h.refresh(); await h.flush(); assert(h.checkbox().props.checked)
  const staleSubmit = h.form().props.onSubmit
  h.response = status({ rows: [...apps(), app({ id: 'third-app', name: 'New exact active app' })], revision: '11111111111111111111111111111111' })
  h.refresh(); await h.flush()
  assert.equal(h.review(), undefined)
  assert.match(h.allText(), /Workspace status changed/)
  await staleSubmit({ preventDefault() {} }); await h.flush(); assert.equal(h.posts().length, 0)
  await h.open(); assert.equal(h.checkbox().props.checked, false); assert.match(text(h.review()), /New exact active app/)
  await h.ack(); h.response = status({ rows: h.response.automation.apps.map(row => ({ ...row, todayDraftCreated: true })), revision: h.response.automation.reviewRevision })
  h.refresh(); await h.flush(); assert.equal(h.review(), undefined)
  h.unmount()
})

test('changing start/pause selection or cancel invalidates old confirm and checkbox handlers', async () => {
  const h = harness(); await readyReview(h)
  const staleSubmit = h.form().props.onSubmit, staleCheck = h.checkbox().props.onChange
  await h.open(false)
  await staleSubmit({ preventDefault() {} }); staleCheck({ target: { checked: true } }); await h.flush()
  assert.equal(h.posts().length, 0); assert.equal(h.checkbox(), undefined)
  assert.match(text(h.review()), /Review pause/)
  h.button('Cancel workspace review').props.onClick(); await h.flush()
  assert.equal(h.review(), undefined)
  await staleSubmit({ preventDefault() {} }); await h.flush(); assert.equal(h.posts().length, 0)
  await h.open(); assert.equal(h.checkbox().props.checked, false); h.unmount()
})

test('workspace and role changes hide old scoped app names, reviews and confirmations even before effects, and old handlers cannot write', async () => {
  const h = harness(); await readyReview(h)
  const oldSubmit = h.form().props.onSubmit, oldRefresh = h.button('Refresh workspace status').props.onClick
  h.props = { ...h.props, workspaceId: 'second-workspace', workspaceName: 'Second workspace', connection: undefined }
  const beforeEffects = text(h.render())
  assert(!beforeEffects.includes('Actual first app')); assert(!beforeEffects.includes(R)); assert(!beforeEffects.includes('Actual workspace'))
  h.response = status({ workspaceId: 'second-workspace', rows: [app({ id: 'other-app', name: 'Other workspace actual app' })] })
  await h.flush(); await oldSubmit({ preventDefault() {} }); oldRefresh(); await h.flush()
  assert.equal(h.posts().length, 0); assert.equal(h.calls.length, 2)
  assert.equal(h.calls.at(-1).workspaceId, 'second-workspace')
  await h.open(); assert.match(text(h.review()), /Other workspace actual app/)
  const roleSubmit = h.form().props.onSubmit
  h.props = { ...h.props, canEdit: false }; assert(!text(h.render()).includes('Review revision'))
  await roleSubmit({ preventDefault() {} }); await h.flush(); assert.equal(h.posts().length, 0)
  await h.setProps({ canEdit: true }); await h.open(); assert.equal(h.checkbox().props.checked, false)
  h.unmount()
})

test('post-auth guard prevents stale workspace, role downgrade, disable, unmount and role round-trip dispatch', async () => {
  for (const change of [{ workspaceId: 'next-workspace' }, { canEdit: false }, { disabled: true }, 'unmount', 'role-round-trip']) {
    const h = harness(); await readyReview(h)
    const auth = deferred(); h.auth = input => input.method === 'POST' ? auth.promise : Promise.resolve()
    const saving = h.submit(); await h.flush()
    const attempted = h.calls.find(call => call.method === 'POST')
    assert.equal(typeof attempted.isCurrent, 'function'); assert(attempted.isCurrent())
    if (change === 'unmount') h.unmount()
    else if (change === 'role-round-trip') { h.props = { ...h.props, canEdit: false }; h.render(); h.props = { ...h.props, canEdit: true }; h.render(); await h.flush() }
    else { if (change.workspaceId) h.response = status({ workspaceId: change.workspaceId }); await h.setProps(change) }
    assert(attempted.signal.aborted); assert(!attempted.isCurrent())
    auth.resolve(); await saving; if (change !== 'unmount') await h.flush()
    assert.equal(h.posts().length, 0); assert.equal(h.changes, 0)
    if (change !== 'unmount') assert(!h.allText().includes('enabled for the exact reviewed'))
    h.unmount()
  }
})

test('render-time context guard prevents a delayed authenticated POST before role/workspace change effects run', async () => {
  for (const change of [{ workspaceId: 'different-workspace' }, { canEdit: false }, { disabled: true }]) {
    const h = harness(); await readyReview(h)
    const auth = deferred(); h.auth = input => input.method === 'POST' ? auth.promise : Promise.resolve()
    const saving = h.submit(); await h.flush()
    const attempted = h.calls.find(call => call.method === 'POST')
    h.props = { ...h.props, ...change }; h.render()
    assert(!attempted.isCurrent())
    auth.resolve(); await saving
    assert.equal(h.posts().length, 0)
    h.unmount()
  }
})

test('late cross-workspace reads and writes are ignored, newest refresh wins, and already-dispatched write remains bound to original workspace', async () => {
  const h = harness(), pendingRead = deferred()
  h.respond = input => input.workspaceId === W ? pendingRead.promise : Promise.resolve(status({ workspaceId: input.workspaceId, rows: [app({ id: 'new-app', name: 'New workspace row' })] }))
  await h.flush(); const originalRead = h.calls[0]
  await h.setProps({ workspaceId: 'other-workspace', workspaceName: 'Other workspace', connection: undefined })
  assert(originalRead.signal.aborted)
  pendingRead.resolve(status()); await h.flush()
  await h.open(); assert.match(text(h.review()), /New workspace row/); assert(!h.allText().includes('Actual first app'))
  h.button('Cancel workspace review').props.onClick(); await h.flush()
  const older = deferred(); h.respond = () => older.promise; h.refresh(); await h.flush(); const oldRead = h.calls.at(-1)
  h.respond = () => Promise.resolve(status({ workspaceId: 'other-workspace', rows: [app({ name: 'Newest workspace row' })] })); h.refresh(); await h.flush(); assert(oldRead.signal.aborted)
  older.resolve(status({ workspaceId: 'other-workspace', rows: [app({ name: 'Stale workspace row' })] })); await h.flush()
  await h.open(); assert.match(text(h.review()), /Newest workspace row/); assert(!h.allText().includes('Stale workspace row')); await h.ack()
  const write = deferred(); h.respond = input => input.method === 'POST' ? write.promise : Promise.resolve(status({ workspaceId: input.workspaceId }))
  const saving = h.submit(); await h.flush()
  assert.equal(h.posts()[0].workspaceId, 'other-workspace')
  await h.setProps({ workspaceId: 'final-workspace', workspaceName: 'Final workspace' })
  assert(h.calls.find(call => call.method === 'POST').signal.aborted)
  write.resolve({ applied: true, message: 'old-private-success' }); await saving; await h.flush()
  assert(!h.allText().includes('enabled for the exact reviewed')); assert(!h.allText().includes('old-private-success')); assert.equal(h.changes, 0)
  h.unmount()
})

test('partial, duplicate, cross-workspace, mismatched totals and truncated status fail closed without fake counts or secret errors', async () => {
  const valid = status()
  const bads = [{}, { ...valid, deployment: null }, { ...valid, automation: { ...valid.automation, workspace_id: 'evil' } }, { ...valid, automation: { ...valid.automation, reviewRevision: 'not-a-revision' } }, { ...valid, automation: { ...valid.automation, truncated: true } }, { ...valid, automation: { ...valid.automation, apps: [app(), app()] } }, { ...valid, automation: { ...valid.automation, totals: { ...valid.automation.totals, activeApps: 50 } } }, status({ rows: [app({ researchEnabled: 'true' })] }), status({ rows: [app({ researchTimezone: 'bad/timezone' })] }), status({ deployment: { aiConfigured: 'true' } }), status({ deployment: { workspaceDailyRequestLimit: 0 } })]
  for (const bad of bads) {
    const h = harness(); h.response = bad; await h.flush()
    assert(h.button(START).props.disabled); assert(h.button(PAUSE).props.disabled)
    assert.match(h.allText(), /status is unavailable or incomplete/)
    assert.match(text(h.metric('Active apps · exact set')), /—/)
    assert(!h.button('Refresh workspace status').props.disabled)
    h.response = status(); h.refresh(); await h.flush(); assert(!h.button(START).props.disabled)
    h.unmount()
  }
  for (const code of [401, 403, 404, 409, 500]) {
    const h = harness(); h.respond = async () => { const error = new Error('private-provider-token-address@example.test'); error.status = code; throw error }; await h.flush()
    assert(!h.allText().includes('private-provider')); assert(h.button(START).props.disabled); h.unmount()
  }
})

test('unknown, unapplied, delivery-changing and inconsistent write results never show success or retry automatically', async () => {
  for (const resultKind of ['message-only', 'not-applied', 'wrong-mode', 'delivery-change', 'wrong-count', 'missing-app', 'wrong-state', 'wrong-schedule', 'wrong-workspace']) {
    const h = harness(); await readyReview(h)
    const respond = h.respond
    h.respond = async input => {
      if (input.method === 'GET') return h.response
      const good = await respond(input)
      if (resultKind === 'message-only') return { message: 'private-provider-success' }
      if (resultKind === 'not-applied') return { ...good, applied: false }
      if (resultKind === 'wrong-mode') return { ...good, mode: 'sending' }
      if (resultKind === 'delivery-change') return { ...good, deliveryChanged: 1 }
      if (resultKind === 'wrong-count') return { ...good, researchChanged: 50 }
      if (resultKind === 'missing-app') return { ...good, ...status({ rows: [app({ researchEnabled: true, draftsEnabled: true })] }) }
      if (resultKind === 'wrong-state') return { ...good, ...status() }
      if (resultKind === 'wrong-schedule') return { ...good, ...status({ rows: h.response.automation.apps.map(row => ({ ...row, researchStartHour: 15 })) }) }
      return { ...good, automation: { ...good.automation, workspace_id: 'evil' } }
    }
    await h.submit(); await h.flush()
    assert.equal(h.posts().length, 1); assert.equal(h.calls.length, 2)
    assert.equal(h.changes, 0); assert.equal(h.review(), undefined)
    assert.match(h.allText(), /change could not be confirmed/)
    assert(!h.allText().includes('enabled for the exact reviewed')); assert(!h.allText().includes('private-provider-success'))
    assert(h.button(START).props.disabled)
    h.refresh(); await h.flush(); assert(!h.button(START).props.disabled)
    h.unmount()
  }
})

test('409 conflict clears review/cost and requires fresh snapshot; no auto-retry or sending requests', async () => {
  const h = harness(); await readyReview(h)
  h.respond = async input => { if (input.method === 'POST') { const error = new Error('private conflict'); error.status = 409; throw error } return h.response }
  await h.submit(); await h.flush()
  assert.match(h.allText(), /active app set or saved settings changed/)
  assert.equal(h.review(), undefined); assert.equal(h.posts().length, 1); assert.equal(h.changes, 0)
  h.response = status({ revision: '22222222222222222222222222222222' }); h.refresh(); await h.flush(); await h.open()
  assert.equal(h.checkbox().props.checked, false)
  assert.match(text(h.review()), /22222222222222222222222222222222/)
  assert.equal(h.posts().length, 1); h.unmount()
})

test('SQL may repair the enabling actor on already-enabled settings without a false unconfirmed result', async () => {
  const h = harness(); await readyReview(h)
  const respond = h.respond
  h.respond = async input => {
    const result = await respond(input)
    return input.method === 'POST' ? { ...result, researchChanged: 2, draftsChanged: 2 } : result
  }
  await h.submit(); await h.flush()
  assert.equal(h.posts().length, 1); assert.equal(h.changes, 1)
  assert.match(h.allText(), /enabled for the exact reviewed active app set/)
  assert.equal(h.response.automation.apps[1].researchStartHour, 9)
  assert.equal(h.response.automation.apps[1].draftTimezone, 'Asia/Tokyo')
  h.unmount()
})

test('client structured stale-review code is shown safely even without HTTP status; failed refresh invalidates acknowledged review', async () => {
  const h = harness(); await readyReview(h)
  h.respond = async input => { if (input.method === 'POST') { const error = new Error('private-provider-detail'); error.code = 'EMAIL_WORKSPACE_REVIEW_STALE'; throw error } return h.response }
  await h.submit(); await h.flush()
  assert.match(h.allText(), /active app set or saved settings changed/)
  assert(!h.allText().includes('private-provider-detail')); assert.equal(h.review(), undefined)
  h.refresh(); await h.flush(); await h.open(); await h.ack()
  const staleSubmit = h.form().props.onSubmit
  h.respond = async () => { throw new Error('private-read-detail') }; h.refresh(); await h.flush()
  assert.equal(h.review(), undefined); assert(h.button(START).props.disabled)
  await staleSubmit({ preventDefault() {} }); await h.flush()
  assert.equal(h.posts().length, 1); assert(!h.allText().includes('private-read-detail'))
  h.unmount()
})


test('daily use is one GET click with a server-counted result and no cost review, POST, connection or email', async () => {
  const h = harness({ connection: { configured: true, email: 'sender@example.test' } })
  h.response = status({ rows: apps().map(row => ({ ...row, researchEnabled: true, draftsEnabled: true })) })
  await h.flush()
  assert.match(h.allText(), /You do not need to restart them each day/)
  assert.match(h.allText(), /All apps scheduled daily/)
  const before = h.dispatched.length
  await h.button('Daily check · all apps').props.onClick(); await h.flush()
  assert.equal(h.dispatched.length, before + 1)
  assert(h.dispatched.every(call => call.method === 'GET'))
  assert.equal(h.posts().length, 0); assert.equal(h.connects, 0); assert.equal(h.review(), undefined)
  assert.match(h.allText(), /Daily check complete: 2\/2 research schedules and 2\/2 draft schedules enabled; 1 drafts created today/)
  assert.match(h.allText(), /This check did not send email or change any settings/)
  h.unmount()
})

test('daily check warns about partial schedules without pretending to start them', async () => {
  const h = harness(); await h.flush()
  h.button('Daily check · all apps').props.onClick(); await h.flush()
  assert.match(h.allText(), /Some workflows need setup/)
  assert.equal(h.posts().length, 0); assert.equal(h.review(), undefined)
  h.unmount()
})

test('daily check fails closed on server error and disables connection while account status is unknown', async () => {
  const h = harness({ connection: undefined }); await h.flush()
  assert(h.button('Connect Gmail for all apps').props.disabled)
  h.button('Connect Gmail for all apps').props.onClick(); assert.equal(h.connects, 0)
  h.respond = async () => { throw new Error('synthetic-private-error') }
  h.button('Daily check · all apps').props.onClick(); await h.flush()
  assert(!h.allText().includes('Daily check complete')); assert(!h.allText().includes('synthetic-private'))
  assert.equal(h.posts().length, 0); h.unmount()
})

test('concurrent daily clicks dispatch at most one GET and old-workspace results never show success', async () => {
  const h = harness(); await h.flush()
  const pending = deferred(); h.respond = async () => pending.promise
  const before = h.dispatched.length, click = h.button('Daily check · all apps').props.onClick
  click(); click(); await h.flush()
  assert.equal(h.dispatched.length, before + 1)
  await h.setProps({ workspaceId: 'new-workspace' })
  pending.resolve(status()); await h.flush()
  assert(!h.allText().includes('Daily check complete')); assert.equal(h.posts().length, 0); h.unmount()
})
