import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'

// Compile the actual JSX using Vite's existing esbuild dependency. Every
// service, browser observation and timer is stubbed: no network or auth calls.
const require = createRequire(import.meta.url)
const esbuild = require(require.resolve('esbuild', { paths: [dirname(require.resolve('vite'))] }))
const source = readFileSync(new URL('../src/components/EmailDailyResearchPanel.jsx', import.meta.url), 'utf8')
const bindings = ['useCallback', 'useEffect', 'useRef', 'useState', 'authenticatedJsonHeaders', 'trackFloEvent', 'fetch', 'IntersectionObserver', 'document', 'setInterval', 'clearInterval', '__jsx']
const stripped = source.replace(/^import .*$/gm, '').replace(/export default function /g, 'function ').replace(/export (const|function|async function) /g, '$1 ')
const compiled = esbuild.transformSync(`const { ${bindings.join(', ')} } = runtime;\n${stripped}`, { loader: 'jsx', jsxFactory: '__jsx', target: 'es2022' }).code
const load = new Function('runtime', `${compiled}\nreturn { Component: EmailDailyResearchPanel, defaults: DAILY_RESEARCH_DEFAULTS, researchSettingsPayload, researchStatusResponse, dailyResearchRequest };`)
const W = 'workspace-offline'
const P = 'product-offline'
const defaults = { enabled: false, dailyTarget: 80, dailyRequestLimit: 8, timezone: 'America/New_York', startHour: 6, query: '' }
const status = ({ settings = defaults, today = { localDate: '2026-11-11', found: 12, inserted: 7, skipped: 5, errors: 0, requestsUsed: 2, remaining: 73 }, recentRuns = [], deployment = { configured: true, aiConfigured: true, modelConfigured: true } } = {}) => ({ research: { settings: settings === null ? null : { ...settings }, today, recentRuns }, deployment })
const json = (body, code = 200) => new Response(JSON.stringify(body), { status: code })
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const nodes = tree => {
  if (tree == null || tree === false) return []
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  if (typeof tree !== 'object') return [tree]
  return [tree, ...nodes(tree.children)]
}
const text = tree => nodes(tree).filter(item => typeof item === 'string' || typeof item === 'number').join(' ')
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]))

function harness(props = {}, { observerAvailable = true } = {}) {
  const state = [], effects = [], observers = new Set(), timers = new Map()
  let cursor = 0, changed = false, tree, timerId = 0
  const h = { calls: [], events: [], candidateChanges: 0, headerCalls: 0, props: { workspaceId: W, productId: P, appName: 'Offline first app', canEdit: true, deploymentReady: true, onCandidatesChanged: () => { h.candidateChanges += 1 }, ...props } }
  h.response = status()
  h.respond = async body => body.action === 'save_research_settings' ? json({ research: { settings: { ...defaults, ...body } }, message: 'saved' }) : json(h.response)
  h.headers = async () => ({ Authorization: 'Bearer offline-session', 'Content-Type': 'application/json' })
  h.document = { hidden: false }
  class Observer {
    constructor(callback) { this.callback = callback; this.connected = true; observers.add(this) }
    observe() {}
    disconnect() { this.connected = false; observers.delete(this) }
  }
  const runtime = {
    __jsx(type, props, ...children) { if (props?.ref) props.ref.current = { isConnected: true }; return { type, props: props || {}, children } },
    useState(initial) {
      const i = cursor++
      if (!state[i]) state[i] = { value: typeof initial === 'function' ? initial() : initial }
      return [state[i].value, next => { const value = typeof next === 'function' ? next(state[i].value) : next; if (!Object.is(state[i].value, value)) { state[i].value = value; changed = true } }]
    },
    useRef(initial) { const i = cursor++; if (!state[i]) state[i] = { current: initial }; return state[i] },
    useCallback(fn, deps) { const i = cursor++; if (!state[i] || !sameDeps(state[i].deps, deps)) state[i] = { deps, value: fn }; return state[i].value },
    useEffect(fn, deps) { const i = cursor++; if (!state[i] || !sameDeps(state[i].deps, deps)) { const previous = state[i]; state[i] = { deps }; effects.push(() => { previous?.cleanup?.(); state[i].cleanup = fn() }) } },
    authenticatedJsonHeaders: async () => { h.headerCalls += 1; return h.headers() },
    trackFloEvent: async (name, properties) => { h.events.push({ name, properties }) },
    fetch: async (url, options) => { const body = JSON.parse(options.body); h.calls.push({ url, options, body }); return h.respond(body, options) },
    IntersectionObserver: observerAvailable ? Observer : undefined,
    document: h.document,
    setInterval: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id },
    clearInterval: id => timers.delete(id),
  }
  const helpers = load(runtime)
  h.helpers = helpers
  h.render = () => { cursor = 0; changed = false; tree = helpers.Component(h.props); return tree }
  h.flush = async () => {
    for (let i = 0; i < 50; i++) {
      h.render(); effects.splice(0).forEach(fn => fn())
      // Response.json and nested auth/read promises settle across microtasks.
      for (let j = 0; j < 20; j++) await Promise.resolve()
      if (!changed && !effects.length) return tree
    }
    assert.fail('The component must settle without a render/effect loop')
  }
  h.allText = () => text(tree)
  h.node = predicate => nodes(tree).find(item => item && typeof item === 'object' && predicate(item))
  h.button = label => h.node(item => item.type === 'button' && text(item) === label)
  h.fieldset = () => h.node(item => item.type === 'fieldset')
  h.form = () => h.node(item => item.type === 'form')
  h.control = label => nodes(h.node(item => item.type === 'label' && text(item).startsWith(label))).find(item => ['input', 'textarea', 'select'].includes(item?.type))
  h.metric = label => h.node(item => item.type === 'div' && item.children?.some(child => child?.type === 'dt' && text(child) === label))
  h.set = async (label, value) => { h.control(label).props.onChange({ target: { value, checked: value } }); await h.flush() }
  h.submit = () => h.form().props.onSubmit({ preventDefault() {} })
  h.refresh = () => h.button('Refresh research status').props.onClick()
  h.setProps = async next => { h.props = { ...h.props, ...next }; await h.flush() }
  h.setVisible = async value => { for (const observer of observers) observer.callback([{ isIntersecting: value }]); await h.flush() }
  h.tick = async () => { for (const timer of [...timers.values()]) timer.callback(); await h.flush() }
  h.timers = timers
  h.unmount = () => { for (const hook of state) hook?.cleanup?.(); effects.length = 0 }
  return h
}

test('contained source uses actual auth helper, only the scoped research route, and no direct providers or database writes', () => {
  assert.match(source, /import \{ authenticatedJsonHeaders \} from '\.\.\/lib\/authenticatedApi'/)
  assert.match(source, /fetch\('\/api\/email-campaigns'/)
  assert.match(source, /method: 'POST'/)
  assert.match(source, /JSON\.stringify\(\{ \.\.\.payload, workspaceId, productId, action \}\)/)
  assert.match(source, /AbortController/)
  assert.doesNotMatch(source, /\/api\/email-gmail|supabase|localStorage|send_test|set_state|generate_drafts|add_contacts|research_candidates|initializeObservability|identifyFloUser/)
  assert.doesNotMatch(source, /import .*\.css|<style|style=|https?:\/\//)
  assert.match(source, /candidates, not opt-ins/)
  assert.match(source, /public business sources only/)
  assert.match(source, /never sends email/)
})

test('defaults are disabled, 80 addresses/app/day, eight paid calls, New York at 06:00; no automatic settings save', async () => {
  const h = harness(); h.response = status({ settings: null, today: null }); await h.flush()
  assert.deepEqual(h.helpers.defaults, defaults)
  assert.equal(h.control('Enable daily candidate research').props.checked, false)
  assert.equal(h.control('Daily address target').props.value, 80)
  assert.equal(h.control('Paid AI call limit / day').props.value, 8)
  assert.equal(h.control('Local daily start').props.value, 6)
  assert.equal(h.control('Research timezone').props.value, 'America/New_York')
  assert.equal(h.control('Optional research query').props.value, '')
  assert.equal(h.calls.length, 1)
  assert.equal(h.calls[0].body.action, 'get_research_status')
  assert.match(h.allText(), /up to 200 paid AI requests\/day/)
  assert.match(h.allText(), /search and token charges/)
  assert.match(h.allText(), /fewer than 80\/app\/day/)
  assert.match(h.allText(), /No activity or counts are invented/)
  assert(!h.fieldset().props.disabled)
  h.unmount()
})

test('actual counts and run history are server-owned, missing counts stay unknown and never become the target', async () => {
  const h = harness(); h.response = status({ today: { localDate: '2026-11-11', found: 17, inserted: 6, skipped: 8, errors: 3, requestsUsed: 4, remaining: 74 }, recentRuns: [{ id: 'run-one', status: 'partial', startedAt: '2026-11-11T11:00:00Z', finishedAt: '2026-11-11T11:01:00Z', found: 17, inserted: 6, skipped: 8, errors: 3, requestsUsed: 4 }] }); await h.flush()
  for (const [label, expected] of [['Found today · actual', 17], ['Inserted candidates today', 6], ['Skipped today', 8], ['Errors today', 3], ['Remaining target today', 74]]) assert.match(text(h.metric(label)), new RegExp(` ${expected}(?: |$)`))
  assert.match(h.allText(), /Actual recent research runs \( 1 \)/)
  assert.match(h.allText().replace(/\s+/g, ' '), /Found 17 · Inserted 6 · Skipped 8 · Errors 3 · AI requests reserved 4/)
  h.response = status({ today: { found: '80', inserted: -1, skipped: 0, errors: null, remaining: null }, recentRuns: [{ id: 'unknown', status: 'made_up_success', startedAt: 'bad' }] }); h.refresh(); await h.flush()
  assert.match(text(h.metric('Found today · actual')), /—/)
  assert.match(text(h.metric('Inserted candidates today')), /—/)
  assert.match(text(h.metric('Remaining target today')), /—/)
  assert.match(text(h.metric('Skipped today')), / 0(?: |$)/)
  assert.match(h.allText(), /Time unavailable/)
  assert(!h.allText().includes('made_up_success'))
  h.unmount()
})

test('exact database snake_case API response renders verified/new totals, saved default revision, and actual terminal history', async () => {
  const h = harness()
  const settings = { workspace_id: W, product_id: P, enabled: true, daily_target: 80, daily_request_limit: 8, timezone: 'America/New_York', start_hour: 6, query: '', settings_revision: 'saved-revision' }
  h.response = { research: { settings, today: { scheduled_day: '2026-11-11', requests: 3, verified: 15, inserted: 12, skipped: 3, reserved: 10, target_remaining: 58, requests_remaining: 5, workspace_requests: 25, workspace_requests_remaining: 175 }, recent_runs: [{ id: 'real-run-one', state: 'claimed', claimed_at: '2026-11-11T11:00:00Z', finished_at: null, verified_count: 0, inserted_count: 0, skipped_count: 0, request_number: 3, error_code: null }, { id: 'real-run-two', state: 'expired', claimed_at: '2026-11-11T10:00:00Z', finished_at: '2026-11-11T10:15:00Z', verified_count: 0, inserted_count: 0, skipped_count: 0, request_number: 2, error_code: 'EMAIL_RESEARCH_EXPIRED' }] }, deployment: { configured: true, aiConfigured: true, modelConfigured: true } }
  await h.flush()
  assert.equal(h.control('Daily address target').props.value, 80)
  assert.equal(h.control('Paid AI call limit / day').props.value, 8)
  assert.match(text(h.metric('Found today · actual')), / 15(?: |$)/)
  assert.match(text(h.metric('Inserted candidates today')), / 12(?: |$)/)
  assert.match(text(h.metric('Remaining target today')), / 58(?: |$)/)
  assert.match(text(h.metric('AI requests reserved today / daily limit')), /3  \/  8/)
  assert.match(text(h.metric('Errors today')), /—/, 'an absent error aggregate must not be invented from a bounded history')
  assert.match(h.allText(), /claimed/)
  assert.match(h.allText(), /expired/)
  assert.match(h.allText(), /reservation alone does not prove a paid call occurred/)
  assert.match(h.allText(), /Enabled · server scheduled/)
  assert(h.button('Save research settings').props.disabled)
  await h.set('Daily address target', '79')
  h.respond = async body => body.action === 'save_research_settings' ? json({ research: { settings: { ...settings, daily_target: 79 } }, deployment: h.response.deployment }) : json({ ...h.response, research: { ...h.response.research, settings: { ...settings, daily_target: 79 } } })
  await h.submit(); await h.flush()
  assert.equal(h.control('Daily address target').props.value, 79)
  assert.match(h.allText(), /Research settings saved for this app only/)
  h.response = { ...h.response, research: { ...h.response.research, settings: { ...settings, enabled: false, settings_revision: null } } }
  h.respond = async () => json(h.response)
  h.refresh(); await h.flush()
  assert(!h.button('Save research settings').props.disabled, 'server defaults are not a persisted settings row')
  h.unmount()
})

test('member can read and refresh but all settings and even programmatic save attempts are locked', async () => {
  const h = harness({ canEdit: false }); await h.flush()
  assert(h.fieldset().props.disabled)
  assert(h.button('Save research settings').props.disabled)
  assert(!h.button('Refresh research status').props.disabled)
  await h.set('Enable daily candidate research', true)
  await h.submit(); await h.flush()
  assert.equal(h.control('Enable daily candidate research').props.checked, false)
  assert.equal(h.calls.filter(call => call.body.action === 'save_research_settings').length, 0)
  h.refresh(); await h.flush()
  assert.equal(h.calls.length, 2)
  assert.match(h.allText(), /Read-only access/)
  h.unmount()
})

test('explicit save sends only whitelisted settings for one selected app, ignores duplicate submits, and starts no sends', async () => {
  const h = harness(); await h.flush()
  await h.set('Enable daily candidate research', true)
  await h.set('Daily address target', '81'); await h.set('Paid AI call limit / day', '9')
  await h.set('Research timezone', 'Europe/London'); await h.set('Local daily start', '7')
  await h.set('Optional research query', '  public studios  ')
  const pending = deferred()
  h.respond = async body => body.action === 'save_research_settings' ? pending.promise : json(status({ settings: { ...defaults, enabled: true, dailyTarget: 81, dailyRequestLimit: 9, timezone: 'Europe/London', startHour: 7, query: 'public studios' } }))
  const submit = h.submit(); h.submit(); await h.flush()
  const save = h.calls.filter(call => call.body.action === 'save_research_settings')
  assert.equal(save.length, 1)
  assert.deepEqual(save[0].body, { workspaceId: W, productId: P, action: 'save_research_settings', enabled: true, dailyTarget: 81, dailyRequestLimit: 9, timezone: 'Europe/London', startHour: 7, query: 'public studios' })
  assert.equal(save[0].options.headers.Authorization, 'Bearer offline-session')
  assert.equal(save[0].options.headers['Content-Type'], 'application/json')
  assert(h.fieldset().props.disabled)
  pending.resolve(json({ research: { settings: { ...defaults, enabled: true, dailyTarget: 81, dailyRequestLimit: 9, timezone: 'Europe/London', startHour: 7, query: 'public studios' } }, message: 'No private server text is trusted' }))
  await submit; await h.flush()
  assert.match(h.allText(), /Research settings saved for this app only/)
  assert.match(h.allText(), /No email sends, opt-in approvals, or ads were enabled/)
  assert.equal(h.calls.filter(call => call.body.action === 'get_research_status').length, 2)
  assert(h.calls.every(call => ['get_research_status', 'save_research_settings'].includes(call.body.action)))
  h.unmount()
})

test('request validation enforces target 1..100, calls 1..10, IANA zone, hour 0..23 and query <=500 offline', async () => {
  const h = harness({ workspaceId: '' })
  const valid = h.helpers.researchSettingsPayload
  assert.deepEqual(valid(defaults), defaults)
  for (const [key, values] of Object.entries({ enabled: ['true', null], dailyTarget: ['', 0, 101, 1.2, 'bad', true, null], dailyRequestLimit: ['', 0, 11, 1.2, true, null], startHour: ['', -1, 24, 6.5, null, false], timezone: ['', 'not-a-zone'], query: ['x'.repeat(501), null] })) {
    for (const value of values) assert.throws(() => valid({ ...defaults, [key]: value }), `Reject ${key}: ${String(value)}`)
  }
  assert.equal(valid({ ...defaults, query: 'x'.repeat(500) }).query.length, 500)
  assert.deepEqual(valid({ ...defaults, workspaceId: 'evil', productId: 'evil', action: 'send', sendingEnabled: true }), defaults)
  for (const args of [{ workspaceId: '', productId: P, action: 'get_research_status' }, { workspaceId: W, productId: '', action: 'get_research_status' }, { workspaceId: W, productId: P, action: 'send_test' }, { workspaceId: W, productId: P, action: 'save_research_settings', settings: { ...defaults, enabled: 'true' } }]) await assert.rejects(h.helpers.dailyResearchRequest(args))
  assert.equal(h.headerCalls, 0)
  assert.equal(h.calls.length, 0)
})

test('status/save responses fail closed, error refresh stays available and provider error secrets are not shown', async () => {
  for (const bad of [{}, { research: { settings: null, today: null } }, status({ settings: { ...defaults, enabled: 'true' } }), status({ settings: { ...defaults, dailyTarget: '80' } }), status({ today: [] })]) {
    const h = harness(); h.response = bad; await h.flush()
    assert(h.fieldset().props.disabled)
    assert.match(h.allText(), /Daily research status unavailable/)
    assert.match(text(h.metric('Found today · actual')), /—/)
    h.response = status(); h.refresh(); await h.flush()
    assert(!h.fieldset().props.disabled)
    h.unmount()
  }
  const h = harness(); h.respond = async () => json({ error: 'provider-private-email@example.test', token: 'secret' }, 403); await h.flush()
  assert.match(h.allText(), /workspace role does not permit/)
  assert(!h.allText().includes('provider-private'))
  assert(!h.button('Refresh research status').props.disabled)
  h.respond = async () => json(status()); h.refresh(); await h.flush()
  await h.set('Daily address target', 75)
  h.respond = async body => body.action === 'save_research_settings' ? json({ research: { settings: { enabled: true } } }) : json(status())
  await h.submit(); await h.flush()
  assert.match(h.allText(), /Research settings could not be confirmed/)
  assert.equal(h.control('Daily address target').props.value, 75)
  h.unmount()
})

test('enabled is pending deployment or AI setup, independent of sending/Gmail, and no setup readiness promises working runs', async () => {
  const h = harness({ deploymentReady: false }); h.response = status({ settings: { ...defaults, enabled: true } }); await h.flush()
  assert.match(h.allText(), /Enabled · pending deployment/)
  assert.match(h.allText(), /cannot activate it or confirm any run/)
  await h.setProps({ deploymentReady: true })
  assert.match(h.allText(), /Enabled · server scheduled/)
  h.response = status({ settings: { ...defaults, enabled: true }, deployment: { configured: false, aiConfigured: true, modelConfigured: true } }); h.refresh(); await h.flush()
  assert.match(h.allText(), /Enabled · pending deployment/, 'server configured:false overrides a true readiness prop')
  h.response = status({ settings: { ...defaults, enabled: true }, deployment: { configured: true, aiConfigured: false, modelConfigured: true } }); h.refresh(); await h.flush()
  assert.match(h.allText(), /Enabled · pending AI setup/)
  assert.match(h.allText(), /Gmail connection and sending approvals do not satisfy/)
  assert(h.calls.every(call => call.body.action === 'get_research_status'))
  h.unmount()
})

test('refresh preserves unsaved edits; app/workspace switches clear drafts and notices, never displaying old app counts', async () => {
  const h = harness(); await h.flush(); await h.set('Daily address target', '90'); await h.set('Optional research query', 'private niche draft')
  h.response = status({ settings: { ...defaults, dailyTarget: 85 }, today: { found: 20 } }); h.refresh(); await h.flush()
  assert.equal(h.control('Daily address target').props.value, '90')
  assert.equal(h.control('Optional research query').props.value, 'private niche draft')
  await h.set('Daily address target', '0'); await h.submit(); await h.flush()
  assert.match(h.allText(), /Daily target must/)
  h.response = status({ settings: { ...defaults, dailyTarget: 65 }, today: { found: 1 } })
  await h.setProps({ productId: 'other-app', appName: 'Second app' })
  assert.equal(h.control('Daily address target').props.value, 65)
  assert.equal(h.control('Optional research query').props.value, '')
  assert(!h.allText().includes('Daily target must'))
  assert.match(text(h.metric('Found today · actual')), / 1(?: |$)/)
  await h.set('Daily address target', '70')
  await h.setProps({ workspaceId: 'other-workspace' })
  assert.equal(h.control('Daily address target').props.value, 65)
  assert.equal(h.calls.at(-1).body.workspaceId, 'other-workspace')
  assert.equal(h.calls.filter(call => call.body.action === 'save_research_settings').length, 0)
  h.unmount()
})

test('old read responses are aborted/ignored across app switches and a newer refresh wins even if abort is ignored', async () => {
  const h = harness(); const old = deferred(); h.respond = async body => body.productId === P ? old.promise : json(status({ today: { found: 3 } })); await h.flush()
  const signal = h.calls[0].options.signal
  await h.setProps({ productId: 'next-app', appName: 'New app' })
  assert(signal.aborted)
  old.resolve(json(status({ today: { found: 80 } }))); await h.flush()
  assert.match(text(h.metric('Found today · actual')), / 3(?: |$)/)
  assert(!text(h.metric('Found today · actual')).includes('80'))
  const pending = deferred(); h.respond = () => pending.promise; h.refresh(); await h.flush()
  const olderSignal = h.calls.at(-1).options.signal
  h.respond = async () => json(status({ today: { found: 4 } })); h.refresh(); await h.flush()
  assert(olderSignal.aborted)
  pending.resolve(json(status({ today: { found: 99 } }))); await h.flush()
  assert.match(text(h.metric('Found today · actual')), / 4(?: |$)/)
  h.unmount()
})

test('captured old save handler and asynchronous authentication cannot mutate another selected app or downgraded role', async () => {
  const h = harness(); await h.flush(); await h.set('Enable daily candidate research', true)
  const captured = h.form().props.onSubmit
  await h.setProps({ productId: 'second-app' })
  await captured({ preventDefault() {} }); await h.flush()
  assert.equal(h.calls.filter(call => call.body.action === 'save_research_settings').length, 0)
  await h.set('Daily address target', '79')
  const auth = deferred(); h.headers = () => auth.promise
  const saving = h.submit(); await h.flush()
  await h.setProps({ canEdit: false })
  auth.resolve({ Authorization: 'Bearer offline-session' }); await saving; await h.flush()
  assert.equal(h.calls.filter(call => call.body.action === 'save_research_settings').length, 0)
  assert(h.fieldset().props.disabled)
  h.unmount()

  const switching = harness(); await switching.flush(); await switching.set('Daily address target', '77')
  const auth2 = deferred(); switching.headers = () => auth2.promise
  const pending = switching.submit(); await switching.flush()
  switching.headers = async () => ({ Authorization: 'Bearer offline-session' })
  await switching.setProps({ productId: 'different-app' })
  auth2.resolve({ Authorization: 'Bearer offline-session' }); await pending; await switching.flush()
  assert.equal(switching.calls.filter(call => call.body.action === 'save_research_settings').length, 0)
  switching.unmount()
})

test('already dispatched save stays bound to its original app and its late response cannot contaminate current app', async () => {
  const h = harness(); await h.flush(); await h.set('Daily address target', '77')
  const pending = deferred(); h.respond = async body => body.action === 'save_research_settings' ? pending.promise : json(status({ settings: { ...defaults, dailyTarget: 60 } }))
  const saving = h.submit(); await h.flush()
  const action = h.calls.find(call => call.body.action === 'save_research_settings')
  assert.equal(action.body.productId, P)
  await h.setProps({ productId: 'other-app' })
  assert(action.options.signal.aborted)
  pending.resolve(json({ research: { settings: { ...defaults, dailyTarget: 77 } } })); await saving; await h.flush()
  assert.equal(h.control('Daily address target').props.value, 60)
  assert(!h.allText().includes('Research settings saved for this app only'))
  assert.equal(h.candidateChanges, 0)
  h.unmount()
})

test('new insertions notify parent only after refreshed current-app progress, not fabricated initial counts or duplicate refreshes', async () => {
  const h = harness(); await h.flush(); assert.equal(h.candidateChanges, 0)
  h.response = status({ today: { localDate: '2026-11-11', inserted: 8 } }); h.refresh(); await h.flush()
  assert.equal(h.candidateChanges, 1)
  h.refresh(); await h.flush(); assert.equal(h.candidateChanges, 1)
  h.response = status({ today: { localDate: '2026-11-12', inserted: 1 } }); h.refresh(); await h.flush()
  assert.equal(h.candidateChanges, 2)
  h.response = status({ today: null, recentRuns: [{ id: 'fresh-run', inserted: 1, status: 'completed' }] }); h.refresh(); await h.flush()
  assert.equal(h.candidateChanges, 3)
  await h.setProps({ productId: 'new-app' }); assert.equal(h.candidateChanges, 3)
  h.unmount()
})

test('60-second polling is status-only, enabled-and-visible current app only; background/hidden/unmounted panels do not poll', async () => {
  const h = harness(); await h.flush(); await h.setVisible(true)
  assert.equal(h.timers.size, 0)
  await h.set('Enable daily candidate research', true)
  assert.equal(h.timers.size, 0, 'unsaved enable is not active')
  h.response = status({ settings: { ...defaults, enabled: true } }); h.refresh(); await h.flush()
  assert.equal(h.timers.size, 1)
  assert.equal([...h.timers.values()][0].delay, 60000)
  const before = h.calls.length; await h.tick(); assert.equal(h.calls.length, before + 1)
  assert.equal(h.calls.at(-1).body.action, 'get_research_status')
  h.document.hidden = true; await h.tick(); assert.equal(h.calls.length, before + 1)
  h.document.hidden = false; await h.setVisible(false); assert.equal(h.timers.size, 0)
  await h.setVisible(true); assert.equal(h.timers.size, 1)
  await h.setProps({ productId: 'next-product' }); assert.equal(h.timers.size, 0, 'visibility resets on scope changes')
  await h.setVisible(true); assert.equal(h.timers.size, 1)
  h.unmount(); assert.equal(h.timers.size, 0)
  const noObserver = harness({}, { observerAvailable: false }); noObserver.response = status({ settings: { ...defaults, enabled: true } }); await noObserver.flush()
  assert.equal(noObserver.timers.size, 0); noObserver.unmount()
})

test('missing scope locks everything, and analytics contain only aggregate counts/flags, never query, addresses or IDs', async () => {
  const empty = harness({ workspaceId: '', productId: '' }); await empty.flush()
  assert.equal(empty.calls.length, 0)
  assert(empty.fieldset().props.disabled)
  assert(empty.button('Refresh research status').props.disabled)
  empty.unmount()
  const h = harness(); await h.flush(); await h.set('Optional research query', 'private niche prospect@example.test')
  await h.set('Daily address target', '79'); await h.submit(); await h.flush()
  assert(h.events.length > 0)
  for (const recorded of h.events) {
    assert.match(recorded.name, /^email_studio_daily_research_/)
    for (const value of Object.values(recorded.properties)) assert(value === null || ['boolean', 'number'].includes(typeof value))
    for (const key of Object.keys(recorded.properties)) assert(!/email|query|niche|product|workspace|id/i.test(key))
    const serialized = JSON.stringify(recorded)
    for (const secret of [W, P, 'prospect@example.test', 'private niche']) assert(!serialized.includes(secret))
  }
  h.unmount()
})
