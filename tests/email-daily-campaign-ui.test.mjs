import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'

// Compile the actual JSX with Vite's installed esbuild. All authenticated
// actions, clipboard calls, browser observations and timers remain offline.
const require = createRequire(import.meta.url)
const esbuild = require(require.resolve('esbuild', { paths: [dirname(require.resolve('vite'))] }))
const source = readFileSync(new URL('../src/components/EmailDailyCampaignPanel.jsx', import.meta.url), 'utf8')
const bindings = ['useCallback', 'useEffect', 'useRef', 'useState', 'emailCampaignAction', 'IntersectionObserver', 'document', 'navigator', 'setInterval', 'clearInterval', '__jsx']
const stripped = source.replace(/^import .*$/gm, '').replace(/export default function /g, 'function ').replace(/export (const|function|async function) /g, '$1 ')
const compiled = esbuild.transformSync(`const { ${bindings.join(', ')} } = runtime;\n${stripped}`, { loader: 'jsx', jsxFactory: '__jsx', target: 'es2022' }).code
const load = new Function('runtime', `${compiled}\nreturn { Component: EmailDailyCampaignPanel, defaults: DAILY_CAMPAIGN_DEFAULTS, dailyCampaignSettingsPayload, safeDailyCampaignAppUrl, dailyCampaignCopyPayload, dailyCampaignStatusResponse, dailyCampaignRequest };`)
const W = 'workspace-offline', P = 'product-offline'
const URL_ONE = 'https://apps.apple.com/us/app/first-app/id123456789'
const URL_TWO = 'https://apps.apple.com/us/app/second-app/id987654321'
const defaults = { enabled: false, timezone: 'America/New_York', startHour: 7 }
const campaign = (extra = {}) => ({ id: 'draft-one', scheduled_day: '2026-11-11', name: 'First app daily campaign', subject: 'Actual saved first subject', body: `Actual saved first email body.\n\n${URL_ONE}`, app_store_url: URL_ONE, status: 'draft', content_source: 'listing_template', created_at: '2026-11-11T12:00:00Z', updated_at: '2026-11-11T12:05:00Z', ...extra })
const status = ({ settings = defaults, campaigns = [], today = null, deployment = { enabled: true, configured: true, blockers: [] } } = {}) => ({ dailyCampaign: { settings: settings === null ? null : { ...settings }, campaigns, today }, deployment })
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const nodes = tree => {
  if (tree == null || tree === false) return []
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  if (typeof tree !== 'object') return [tree]
  return [tree, ...nodes(tree.children)]
}
const text = tree => nodes(tree).filter(item => typeof item === 'string' || typeof item === 'number').join(' ').replace(/\s+/g, ' ').trim()
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]))

function harness(props = {}, { observerAvailable = true, clipboardAvailable = true } = {}) {
  const state = [], effects = [], observers = new Set(), timers = new Map()
  let cursor = 0, changed = false, tree, timerId = 0
  const h = { calls: [], dispatched: [], copied: [], props: { workspaceId: W, productId: P, appName: 'First app', canEdit: true, ...props } }
  h.response = status()
  h.auth = async () => {}
  h.clipboard = async value => { h.copied.push(value) }
  h.respond = async input => {
    if (input.action === 'save_daily_campaign_settings') {
      h.response = { ...h.response, dailyCampaign: { ...h.response.dailyCampaign, settings: { ...input.payload } } }
      return { dailyCampaign: { settings: input.payload } }
    }
    if (input.action === 'update_daily_campaign') {
      h.response = { ...h.response, dailyCampaign: { ...h.response.dailyCampaign, campaigns: h.response.dailyCampaign.campaigns.map(record => record.id === input.payload.dailyCampaignId ? { ...record, subject: input.payload.subject, body: input.payload.body, status: 'draft' } : record) } }
      return { dailyCampaign: { campaign: input.payload } }
    }
    return h.response
  }
  h.document = { hidden: false }
  class Observer {
    constructor(callback) { this.callback = callback; observers.add(this) }
    observe() {}
    disconnect() { observers.delete(this) }
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
    emailCampaignAction: async input => {
      h.calls.push(input)
      await h.auth(input)
      // Mirrors required client integration: asynchronous auth must be followed
      // by signal/current checks BEFORE fetch, with forced workspace/app scope.
      if (input.signal?.aborted || !input.isCurrent()) { const error = new Error('Cancelled'); error.name = 'AbortError'; throw error }
      h.dispatched.push({ ...input.payload, workspaceId: input.workspaceId, productId: input.productId, action: input.action })
      return h.respond(input)
    },
    IntersectionObserver: observerAvailable ? Observer : undefined,
    document: h.document,
    navigator: clipboardAvailable ? { clipboard: { writeText: value => h.clipboard(value) } } : {},
    setInterval: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id },
    clearInterval: id => timers.delete(id),
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
  h.form = label => h.node(item => item.type === 'form' && item.props['aria-label'] === label)
  h.fieldset = (label = 'Daily draft settings') => nodes(h.form(label)).find(item => item?.type === 'fieldset')
  h.control = label => nodes(h.node(item => item.type === 'label' && text(item).startsWith(label))).find(item => ['input', 'textarea', 'select'].includes(item?.type))
  h.metric = label => h.node(item => item.type === 'div' && item.children?.some(child => child?.type === 'dt' && text(child) === label))
  h.set = async (label, value) => { h.control(label).props.onChange({ target: { value, checked: value } }); await h.flush() }
  h.submitSettings = () => h.form('Daily draft settings').props.onSubmit({ preventDefault() {} })
  h.submitCopy = () => h.form('Edit saved daily draft').props.onSubmit({ preventDefault() {} })
  h.refresh = () => h.button('Refresh draft library').props.onClick()
  h.copyEmail = () => h.button('Copy saved email text').props.onClick()
  h.setProps = async next => { h.props = { ...h.props, ...next }; await h.flush() }
  h.setVisible = async value => { for (const observer of observers) observer.callback([{ isIntersecting: value }]); await h.flush() }
  h.tick = async () => { for (const timer of [...timers.values()]) timer.callback(); await h.flush() }
  h.timers = timers
  h.unmount = () => { for (const hook of state) hook?.cleanup?.(); effects.length = 0 }
  return h
}

const actions = ['get_daily_campaign_status', 'save_daily_campaign_settings', 'update_daily_campaign']
test('panel is isolated to authenticated daily draft actions and existing styling, with no delivery or generation actions', () => {
  assert.match(source, /import \{ emailCampaignAction \} from '\.\.\/lib\/emailCampaignClient'/)
  assert.match(source, /emailCampaignAction\(\{ payload: fields, workspaceId, productId, action, signal, isCurrent \}\)/)
  assert.doesNotMatch(source, /fetch\(|supabase|localStorage|send_test|approve_draft|generate_drafts|set_state|research_candidates|add_contacts/)
  assert.doesNotMatch(source, /import .*\.css|<style|dangerouslySetInnerHTML/)
  assert.deepEqual(source.match(/style=\{\{[^}]*\}\}/g), ["style={{ whiteSpace: 'pre-wrap' }}"])
  assert.match(source, /Listing-based templates, not AI-generated copy/)
  assert.match(source, /no extra AI charges/)
  assert.match(source, /never sends or approves email/)
  assert.match(source, /60000/)
})

test('disabled New York 07:00 defaults use no fabricated records, saves, runs or AI requests', async () => {
  const h = harness(); h.response = status({ settings: null }); await h.flush()
  assert.deepEqual(h.helpers.defaults, defaults)
  assert.equal(h.control('Enable daily campaign drafts').props.checked, false)
  assert.equal(h.control('Draft timezone').props.value, 'America/New_York')
  assert.equal(h.control('Local daily draft start').props.value, 7)
  assert.equal(h.calls.length, 1)
  assert.equal(h.calls[0].action, 'get_daily_campaign_status')
  assert.equal(h.node(item => item.type === 'article'), undefined)
  assert.match(h.allText(), /No saved daily campaign drafts reported/)
  assert.match(h.allText(), /No illustrative records are generated/)
  assert.match(h.allText(), /Disabled defaults/)
  assert.match(text(h.metric('Today · server report')), /Date unavailable/)
  assert(!h.button('Save daily draft settings').props.disabled)
  h.unmount()
})

test('exact server defaults revision and today.created aggregate render truthfully with deployment template metadata', async () => {
  const h = harness()
  h.response = status({ settings: { workspace_id: W, product_id: P, enabled: false, timezone: 'America/New_York', start_hour: 7, settings_revision: null }, today: { scheduled_day: '2026-11-11', created: false }, deployment: { enabled: false, configured: false, blockers: [], draftOnly: true, contentSource: 'listing_template', providerCalls: false } })
  await h.flush()
  assert(!h.button('Save daily draft settings').props.disabled, 'server disabled defaults are not a persisted revision')
  assert.match(h.allText(), /Disabled defaults/)
  assert.match(text(h.metric('Today · server report')), /No draft created today/)
  h.response = status({ settings: { ...h.response.dailyCampaign.settings, settings_revision: 'saved-revision' }, campaigns: [campaign()], today: { scheduled_day: '2026-11-11', created: true } })
  h.refresh(); await h.flush()
  assert(h.button('Save daily draft settings').props.disabled)
  assert.match(text(h.metric('Today · server report')), /Draft reported for human review/)
  assert.equal(h.control('Draft subject').props.maxLength, 180)
  assert.equal(h.control('Draft email body').props.maxLength, 6000)
  h.unmount()
})

test('actual latest saved copy, canonical link, dates and dated history come only from server rows', async () => {
  const h = harness()
  h.response = status({ settings: { enabled: true, timezone: 'America/New_York', start_hour: 7 }, campaigns: [campaign({ id: 'old', scheduled_day: '2026-11-10', subject: 'Older actual subject' }), campaign()], today: { scheduled_day: '2026-11-11', status: 'draft' } })
  await h.flush()
  assert.equal(h.control('Draft subject').props.value, 'Actual saved first subject')
  assert.equal(h.control('Draft email body').props.value, campaign().body)
  assert.equal(h.node(item => item.type === 'a').props.href, URL_ONE)
  assert.equal(h.node(item => item.type === 'a').props.rel, 'noopener noreferrer')
  assert.match(h.allText(), /Actual dated draft history \( 2 · newest 30\)/)
  assert.match(h.allText(), /2026-11-10/)
  assert.match(h.allText(), /2026-11-11/)
  assert.match(h.allText(), /Source: listing-based template \(not AI copy\)/)
  assert.match(h.allText(), /Draft · human review required/)
  assert.match(text(h.metric('Today · server report')), /Draft reported for human review/)
  assert(h.button('Save email copy as draft').props.disabled)
  h.button('View draft · 2026-11-10').props.onClick(); await h.flush()
  assert.equal(h.control('Draft subject').props.value, 'Older actual subject')
  h.unmount()
})

test('history sorts newest dates, caps at thirty, ignores malformed duplicate rows and does not invent missing status or time', async () => {
  const h = harness({ workspaceId: '' })
  const rows = Array.from({ length: 35 }, (_, index) => campaign({ id: `record-${index}`, scheduled_day: `2026-10-${String(index % 30 + 1).padStart(2, '0')}`, created_at: `2026-10-01T${String(index % 24).padStart(2, '0')}:00:00Z` }))
  const result = h.helpers.dailyCampaignStatusResponse(status({ campaigns: [...rows, null, [], { ...rows[0], subject: 'Duplicate override' }] }))
  assert.equal(result.campaigns.length, 30)
  assert.equal(new Set(result.campaigns.map(row => row.id)).size, 30)
  assert.equal(result.campaigns[0].scheduled_day, '2026-10-30')
  assert(!result.campaigns.some(row => row.subject === 'Duplicate override'))
  const actual = harness(); actual.response = status({ campaigns: [campaign({ scheduled_day: '2026-02-31', status: 'sent', content_source: 'ai_success', created_at: 'bad', updated_at: null })] }); await actual.flush()
  assert.match(actual.allText(), /Date unavailable/)
  assert.match(actual.allText(), /Time unavailable/)
  assert.match(actual.allText(), /Draft status unconfirmed/)
  assert.match(actual.allText(), /Content source unconfirmed/)
  assert(actual.fieldset('Edit saved daily draft').props.disabled)
  assert(!actual.allText().includes('ai_success'))
  actual.unmount()
})

test('only confirmed settings.enabled and server deployment.configured produce server scheduled label', async () => {
  const h = harness(); await h.flush()
  assert.equal(text(h.node(item => item.type === 'span' && item.props.className?.includes('es-badge'))), 'Disabled')
  await h.set('Enable daily campaign drafts', true)
  assert(!h.allText().includes('Enabled · server scheduled'), 'unsaved checkbox is not scheduled')
  h.response = status({ settings: { ...defaults, enabled: true }, deployment: { enabled: true, configured: false, blockers: ['synthetic-private-provider-token'] } }); h.refresh(); await h.flush()
  assert.match(h.allText(), /Enabled · pending deployment/)
  assert.match(h.allText(), /cannot activate it or confirm a run/)
  assert.match(h.allText(), /1 deployment blocker/)
  assert(!h.allText().includes('synthetic-private'))
  h.response = status({ settings: { ...defaults, enabled: true } }); h.refresh(); await h.flush()
  assert.match(h.allText(), /Enabled · server scheduled/)
  assert(h.calls.every(input => input.action === 'get_daily_campaign_status'))
  h.unmount()
})

test('members can read, refresh and copy saved text but cannot mutate settings or draft copy even programmatically', async () => {
  const h = harness({ canEdit: false }); h.response = status({ campaigns: [campaign()] }); await h.flush()
  assert(h.fieldset().props.disabled)
  assert(h.fieldset('Edit saved daily draft').props.disabled)
  assert(h.button('Save daily draft settings').props.disabled)
  assert(h.button('Save email copy as draft').props.disabled)
  assert(!h.button('Refresh draft library').props.disabled)
  await h.set('Enable daily campaign drafts', true)
  await h.set('Draft subject', 'Do not save')
  await h.submitSettings(); await h.submitCopy(); await h.flush()
  assert.equal(h.control('Draft subject').props.value, campaign().subject)
  assert.equal(h.control('Enable daily campaign drafts').props.checked, false)
  assert.equal(h.calls.length, 1)
  h.copyEmail(); await h.flush(); assert.equal(h.copied.length, 1)
  h.refresh(); await h.flush(); assert.equal(h.calls.length, 2)
  assert.match(h.allText(), /Read-only access/)
  h.unmount()
})

test('explicit settings save includes only independent draft settings and forced workspace/app scope; duplicates are ignored', async () => {
  const h = harness(); await h.flush()
  await h.set('Enable daily campaign drafts', true); await h.set('Draft timezone', 'Europe/London'); await h.set('Local daily draft start', '9')
  const pending = deferred(), base = h.respond
  h.respond = async input => input.action === 'save_daily_campaign_settings' ? pending.promise : base(input)
  const saving = h.submitSettings(); h.submitSettings(); await h.flush()
  assert.equal(h.calls.filter(input => input.action === 'save_daily_campaign_settings').length, 1)
  assert.deepEqual(h.dispatched.find(input => input.action === 'save_daily_campaign_settings'), { enabled: true, timezone: 'Europe/London', startHour: 9, workspaceId: W, productId: P, action: 'save_daily_campaign_settings' })
  assert(h.fieldset().props.disabled)
  h.response = status({ settings: { enabled: true, timezone: 'Europe/London', start_hour: 9 } })
  pending.resolve({ message: 'synthetic-private-success' }); await saving; await h.flush()
  assert.match(h.allText(), /Daily draft settings saved for this app only/)
  assert.match(h.allText(), /No draft was run from this page/)
  assert(!h.allText().includes('synthetic-private'))
  assert(h.calls.every(input => actions.includes(input.action)))
  assert.equal(h.calls.filter(input => input.action === 'get_daily_campaign_status').length, 2)
  h.unmount()
})

test('copy save requires exact original App Store link, whitelists only ID/subject/body and confirms draft status by reading', async () => {
  const h = harness(); h.response = status({ campaigns: [campaign()] }); await h.flush()
  await h.set('Draft subject', ' Updated subject ')
  await h.set('Draft email body', `  Human-edited actual body.\n${URL_ONE}  `)
  await h.submitCopy(); await h.flush()
  assert.deepEqual(h.dispatched.find(input => input.action === 'update_daily_campaign'), { dailyCampaignId: 'draft-one', subject: 'Updated subject', body: `Human-edited actual body.\n${URL_ONE}`, workspaceId: W, productId: P, action: 'update_daily_campaign' })
  assert.equal(h.control('Draft subject').props.value, 'Updated subject')
  assert.match(h.allText(), /Email copy saved as a draft for human review/)
  assert.match(h.allText(), /Sender, consent, recipients and sending schedule are unchanged/)
  assert(h.button('Save email copy as draft').props.disabled)
  for (const invalid of ['Missing listing link', `Different app ${URL_TWO}`, `Wrong exact id ${URL_ONE}0`, `Tracking link ${URL_ONE}?campaign=bad`, `Extra segment ${URL_ONE}/other`]) {
    await h.set('Draft email body', invalid); await h.submitCopy(); await h.flush()
    assert.match(h.allText(), /Keep the exact saved App Store link/)
  }
  assert.equal(h.calls.filter(input => input.action === 'update_daily_campaign').length, 1)
  assert(h.calls.every(input => actions.includes(input.action)))
  h.unmount()
})

test('settings and copy payload validators fail closed and ignore action/scope/consent/delivery overrides offline', async () => {
  const h = harness({ workspaceId: '' }), settings = h.helpers.dailyCampaignSettingsPayload, copy = h.helpers.dailyCampaignCopyPayload
  assert.deepEqual(settings(defaults), defaults)
  for (const [key, values] of Object.entries({ enabled: ['true', null], startHour: ['', ' ', -1, 24, 7.5, false, null, {}, []], timezone: ['', 'invalid/timezone', 'x'.repeat(101), null] })) for (const value of values) assert.throws(() => settings({ ...defaults, [key]: value }))
  assert.deepEqual(settings({ ...defaults, workspaceId: 'evil', productId: 'evil', action: 'send', sendingEnabled: true }), defaults)
  const validCopy = { subject: 'Subject', body: `Read the listing (${URL_ONE}).`, status: 'approved', action: 'send', workspaceId: 'evil', productId: 'evil', dailyCampaignId: 'evil', sender_name: 'evil', consent: true }
  assert.deepEqual(copy(campaign(), validCopy), { dailyCampaignId: 'draft-one', subject: 'Subject', body: `Read the listing (${URL_ONE}).` })
  for (const subject of ['', 'x'.repeat(181), 'Injected\r\nBcc: bad', 'null\0bad', 'Re: misleading', 'Fwd: misleading', null]) assert.throws(() => copy(campaign(), { ...validCopy, subject }))
  for (const body of ['', 'x'.repeat(6001), `Null\0${URL_ONE}`, `<a href="${URL_ONE}">App</a>`, `[App](${URL_ONE})`, `${URL_ONE}\nwww.evil.test`, `${URL_ONE}\nmailto:someone@example.test`, `${URL_ONE}\n${URL_TWO}`, null]) assert.throws(() => copy(campaign(), { ...validCopy, body }))
  assert.throws(() => copy(campaign({ status: 'approved' }), validCopy))
  assert.throws(() => copy(campaign({ app_store_url: URL_ONE + '?x=1' }), validCopy))
  await h.helpers.dailyCampaignRequest({ workspaceId: W, productId: P, action: 'save_daily_campaign_settings', payload: { ...defaults, workspaceId: 'evil', productId: 'evil', action: 'send' } })
  assert.deepEqual(h.dispatched[0], { ...defaults, workspaceId: W, productId: P, action: 'save_daily_campaign_settings' })
  for (const input of [{ workspaceId: '', productId: P, action: actions[0] }, { workspaceId: W, productId: '', action: actions[0] }, { workspaceId: W, productId: P, action: 'approve_draft' }, { workspaceId: W, productId: P, action: actions[0], isCurrent: () => false }]) await assert.rejects(h.helpers.dailyCampaignRequest(input))
  assert.equal(h.calls.length, 1)
})

test('App Store links require exact HTTPS apps.apple.com canonical listing id without credentials, query, fragment or alternate host', () => {
  const h = harness({ workspaceId: '' }), valid = h.helpers.safeDailyCampaignAppUrl
  for (const url of [URL_ONE, URL_ONE + '/', 'https://apps.apple.com/app/id123', 'https://apps.apple.com/us/app/id123', 'https://apps.apple.com/us/app/%E2%80%93-app/id123']) assert.equal(valid(url), url)
  for (const url of ['', null, 'javascript:alert(1)', 'http://apps.apple.com/us/app/first-app/id123', 'https://apps.apple.com.evil.test/us/app/x/id123', 'https://evil.apps.apple.com/us/app/x/id123', 'https://user:pass@apps.apple.com/us/app/x/id123', 'https://apps.apple.com:8443/us/app/x/id123', URL_ONE + '?x=1', URL_ONE + '#x', URL_ONE + 'extra', URL_ONE + '/more', 'https://apps.apple.com/us/app/x/noid123', 'https://apps.apple.com/us/app/x/id0', 'https://apps.apple.com/us/app/x/id123\n', 'https://apps.apple.com/us/app/x%2fy/id123', 'https://apps.apple.com/us/app/x%3Fy/id123', 'https://apps.apple.com/us/app/x%00y/id123', 'https://apps.apple.com/us/app/../x/id123', 'https://apps.apple.com/us/app/x\\id123']) assert.equal(valid(url), '', `Reject ${String(url)}`)
})

test('unsafe server links are not anchors, do not enable editing and never get replaced with illustrative links', async () => {
  const h = harness(); h.response = status({ campaigns: [campaign({ app_store_url: 'javascript:alert(1)' })] }); await h.flush()
  assert.equal(h.node(item => item.type === 'a'), undefined)
  assert(h.fieldset('Edit saved daily draft').props.disabled)
  await h.set('Draft subject', 'Attempt'); await h.submitCopy(); await h.flush()
  assert.equal(h.calls.length, 1)
  assert.match(h.allText(), /Canonical App Store link unavailable or unsafe/)
  assert(!h.allText().includes('javascript:'))
  h.unmount()
})

test('incomplete responses lock writes, keep refresh available and show only safe error text', async () => {
  for (const bad of [{}, { dailyCampaign: { settings: null, campaigns: [] }, deployment: {} }, status({ settings: { ...defaults, enabled: 'true' } }), status({ settings: { ...defaults, startHour: '7' } }), status({ today: [] }), status({ deployment: null })]) {
    const h = harness(); h.response = bad; await h.flush()
    assert(h.fieldset().props.disabled)
    assert.match(h.allText(), /Daily draft status unavailable/)
    assert(!h.button('Refresh draft library').props.disabled)
    h.response = status(); h.refresh(); await h.flush(); assert(!h.fieldset().props.disabled)
    h.unmount()
  }
  for (const code of [401, 403, 404, 409, 500, undefined]) {
    const h = harness(); h.respond = async () => { const error = new Error('synthetic-private-provider-email@example.test'); error.status = code; throw error }; await h.flush()
    assert(!h.allText().includes('synthetic-private'))
    assert(h.fieldset().props.disabled)
    h.respond = async () => status(); h.refresh(); await h.flush(); assert(!h.fieldset().props.disabled)
    h.unmount()
  }
})

test('unverified write results never claim saved copy; edits survive failed confirmation and private result text is ignored', async () => {
  const h = harness(); h.response = status({ campaigns: [campaign()] }); await h.flush()
  await h.set('Draft subject', 'Keep unsaved text')
  h.respond = async input => input.action === 'update_daily_campaign' ? { message: 'synthetic-private-token', status: 'approved' } : h.response
  await h.submitCopy(); await h.flush()
  assert.equal(h.control('Draft subject').props.value, 'Keep unsaved text')
  assert.match(h.allText(), /saved state could not be verified/)
  assert(!h.allText().includes('Email copy saved as a draft'))
  assert(!h.allText().includes('synthetic-private'))
  h.respond = async () => { throw new Error('synthetic-private-provider-message') }
  await h.submitCopy(); await h.flush()
  assert.match(h.allText(), /save could not be confirmed/)
  assert(!h.allText().includes('synthetic-private'))
  h.unmount()
})

test('refresh preserves unsaved edits; scope switches prevent even pre-effect old-app flashes and clear notices/drafts', async () => {
  const h = harness(); h.response = status({ campaigns: [campaign()] }); await h.flush()
  await h.set('Draft subject', 'Private unsaved first app'); await h.set('Draft timezone', 'Europe/London')
  h.refresh(); await h.flush()
  assert.equal(h.control('Draft subject').props.value, 'Private unsaved first app')
  assert.equal(h.control('Draft timezone').props.value, 'Europe/London')
  const oldHandler = h.form('Edit saved daily draft').props.onSubmit
  h.props = { ...h.props, productId: 'second-app', appName: 'Second app' }
  const beforeEffects = text(h.render())
  assert(!beforeEffects.includes('Actual saved first'))
  assert(!beforeEffects.includes('Private unsaved first'))
  assert(!beforeEffects.includes(URL_ONE))
  h.response = status({ campaigns: [campaign({ id: 'second-draft', name: 'Second app campaign', subject: 'Second real subject', body: `Second real body ${URL_TWO}`, app_store_url: URL_TWO })] })
  await h.flush(); await oldHandler({ preventDefault() {} }); await h.flush()
  assert.equal(h.calls.filter(input => input.action === 'update_daily_campaign').length, 0)
  assert.equal(h.control('Draft subject').props.value, 'Second real subject')
  assert.equal(h.control('Draft timezone').props.value, 'America/New_York')
  assert(!h.allText().includes(URL_ONE))
  await h.setProps({ workspaceId: 'second-workspace' })
  assert.equal(h.calls.at(-1).workspaceId, 'second-workspace')
  h.unmount()
})

test('late reads are aborted/ignored across scope switches and the newest refresh wins if abort is ignored', async () => {
  const h = harness(), old = deferred()
  h.respond = async input => input.productId === P ? old.promise : status({ campaigns: [campaign({ id: 'second', subject: 'Second actual copy', body: URL_TWO, app_store_url: URL_TWO })] })
  await h.flush(); const signal = h.calls[0].signal
  await h.setProps({ productId: 'other-app' }); assert(signal.aborted)
  old.resolve(status({ campaigns: [campaign()] })); await h.flush()
  assert.equal(h.control('Draft subject').props.value, 'Second actual copy')
  const pending = deferred(); h.respond = async () => pending.promise; h.refresh(); await h.flush(); const oldSignal = h.calls.at(-1).signal
  h.respond = async () => status({ campaigns: [campaign({ subject: 'Newest actual response' })] }); h.refresh(); await h.flush(); assert(oldSignal.aborted)
  pending.resolve(status({ campaigns: [campaign({ subject: 'Stale actual response' })] })); await h.flush()
  assert.equal(h.control('Draft subject').props.value, 'Newest actual response')
  h.unmount()
})

test('abort plus isCurrent guards asynchronous auth on app switches, role downgrade, disable and unmount', async () => {
  for (const change of [{ productId: 'next-app' }, { workspaceId: 'next-workspace' }, { canEdit: false }, { disabled: true }, 'unmount']) {
    const h = harness(); await h.flush(); await h.set('Enable daily campaign drafts', true)
    const auth = deferred(); h.auth = input => input.action === 'save_daily_campaign_settings' ? auth.promise : Promise.resolve()
    const saving = h.submitSettings(); await h.flush()
    const attempted = h.calls.find(input => input.action === 'save_daily_campaign_settings')
    assert.equal(typeof attempted.isCurrent, 'function')
    if (change === 'unmount') h.unmount(); else await h.setProps(change)
    assert(attempted.signal.aborted)
    assert(!attempted.isCurrent())
    auth.resolve(); await saving; await h.flush()
    assert.equal(h.dispatched.filter(input => input.action === 'save_daily_campaign_settings').length, 0)
    h.unmount()
  }
})

test('already dispatched writes stay bound to original app, abort on scope change and cannot flash late success/copy', async () => {
  const h = harness(); h.response = status({ campaigns: [campaign()] }); await h.flush(); await h.set('Draft subject', 'Old app edit')
  const pending = deferred()
  h.respond = async input => input.action === 'update_daily_campaign' ? pending.promise : status({ campaigns: [campaign({ id: 'new-app-draft', subject: 'New app actual subject', body: URL_TWO, app_store_url: URL_TWO })] })
  const saving = h.submitCopy(); await h.flush()
  const attempted = h.calls.find(input => input.action === 'update_daily_campaign')
  assert.equal(attempted.workspaceId, W); assert.equal(attempted.productId, P)
  await h.setProps({ productId: 'new-app' }); assert(attempted.signal.aborted)
  pending.resolve({ dailyCampaign: { campaign: campaign({ subject: 'Old app edit' }) } }); await saving; await h.flush()
  assert.equal(h.control('Draft subject').props.value, 'New app actual subject')
  assert(!h.allText().includes('Old app edit'))
  assert(!h.allText().includes('Email copy saved as a draft'))
  h.unmount()
})

test('60-second polling is saved-enabled, visible foreground status-only; no observer, disabled and unmounted panels do not poll', async () => {
  const h = harness(); await h.flush(); await h.setVisible(true); assert.equal(h.timers.size, 0)
  await h.set('Enable daily campaign drafts', true); assert.equal(h.timers.size, 0)
  h.response = status({ settings: { ...defaults, enabled: true } }); h.refresh(); await h.flush()
  assert.equal(h.timers.size, 1); assert.equal([...h.timers.values()][0].delay, 60000)
  const count = h.calls.length; await h.tick(); assert.equal(h.calls.length, count + 1)
  assert.equal(h.calls.at(-1).action, 'get_daily_campaign_status')
  h.document.hidden = true; await h.tick(); assert.equal(h.calls.length, count + 1)
  h.document.hidden = false; await h.setVisible(false); assert.equal(h.timers.size, 0)
  await h.setVisible(true); assert.equal(h.timers.size, 1)
  await h.setProps({ productId: 'next-app' }); assert.equal(h.timers.size, 0)
  await h.setVisible(true); assert.equal(h.timers.size, 1)
  await h.setProps({ disabled: true }); assert.equal(h.timers.size, 0)
  h.unmount(); assert.equal(h.timers.size, 0)
  const noObserver = harness({}, { observerAvailable: false }); noObserver.response = status({ settings: { ...defaults, enabled: true } }); await noObserver.flush(); assert.equal(noObserver.timers.size, 0); noObserver.unmount()
})

test('missing scope or disabled panel dispatches nothing, and captured refresh cannot dispatch after a scope switch', async () => {
  for (const props of [{ workspaceId: '' }, { productId: '' }, { disabled: true }]) {
    const h = harness(props); await h.flush(); assert.equal(h.calls.length, 0); assert(h.fieldset().props.disabled); assert(h.button('Refresh draft library').props.disabled)
    await h.submitSettings(); h.refresh(); await h.flush(); assert.equal(h.calls.length, 0); h.unmount()
  }
  const h = harness(); await h.flush(); const refresh = h.button('Refresh draft library').props.onClick
  await h.setProps({ productId: 'next-app' }); const count = h.calls.length
  refresh(); await h.flush(); assert.equal(h.calls.length, count)
  h.unmount()
})

test('clipboard writes only actual saved text after user click, never unsaved edits; failures are safe and scope-guarded', async () => {
  const h = harness(); h.response = status({ campaigns: [campaign()] }); await h.flush(); assert.equal(h.copied.length, 0)
  await h.set('Draft subject', 'Unsaved subject'); await h.set('Draft email body', `Unsaved body ${URL_ONE}`)
  h.copyEmail(); await h.flush()
  assert.deepEqual(h.copied, [`Subject: ${campaign().subject}\n\n${campaign().body}`])
  assert.match(h.allText(), /nothing was sent/)
  h.clipboard = async () => { throw new Error('synthetic-private-clipboard-error') }; h.copyEmail(); await h.flush()
  assert.match(h.allText(), /Could not copy email text/); assert(!h.allText().includes('synthetic-private'))
  const pending = deferred(); h.clipboard = () => pending.promise; h.copyEmail(); await h.flush()
  const oldCopy = h.button('Copy saved email text').props.onClick
  await h.setProps({ productId: 'next-app' }); pending.resolve(); await h.flush()
  assert(!h.allText().includes('Saved email text copied'))
  oldCopy(); await h.flush(); assert(!h.allText().includes('Saved email text copied'))
  h.unmount()
  const unsupported = harness({}, { clipboardAvailable: false }); unsupported.response = status({ campaigns: [campaign()] }); await unsupported.flush(); unsupported.copyEmail(); await unsupported.flush(); assert.match(unsupported.allText(), /copy them manually/); unsupported.unmount()
})
