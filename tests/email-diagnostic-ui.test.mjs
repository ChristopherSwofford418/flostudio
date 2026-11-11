import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'

// No real authentication, Gmail, or network: load the client with dummy headers.
const clientSource = readFileSync(new URL('../src/lib/emailCampaignClient.js', import.meta.url), 'utf8').replace(/^import .*authenticatedApi.*$/m, "const authenticatedHeaders = async () => ({ Authorization: 'Bearer dummy-session' }); const authenticatedJsonHeaders = async () => ({ Authorization: 'Bearer dummy-session', 'Content-Type': 'application/json' });")
const client = await import(`data:text/javascript;base64,${Buffer.from(clientSource).toString('base64')}`)
const { emailGmailAction, gmailTestRecipients, gmailTestResultNotice, GMAIL_TEST_BODY, GMAIL_TEST_SUBJECT, GMAIL_TEST_ACCEPTED_NOTICE } = client
const W = '11111111-1111-4111-8111-111111111111'
const P = '22222222-2222-4222-8222-222222222222'
const OWNER = 'christopher.swofford@gmail.com'
const SENDER = 'sender@example.test'
const accepted = extra => ({ accepted: true, recipient: OWNER, providerMessageId: 'message123', recorded: true, sendingEnabled: false, ...extra })
const json = (body, status = 200) => new Response(JSON.stringify(body), { status })
async function mockFetch(callback, work) {
  const previous = globalThis.fetch
  globalThis.fetch = callback
  try { await work() } finally { globalThis.fetch = previous }
}

test('diagnostic copy is exact and recipient choices are owner-first, deduplicated, and fail closed', () => {
  assert.equal(GMAIL_TEST_SUBJECT, 'Flo Studio — Gmail connection test')
  assert.equal(GMAIL_TEST_BODY, 'This is a one-time email delivery test from Flo Studio. No daily marketing campaigns have been enabled.')
  assert.deepEqual(gmailTestRecipients(OWNER, SENDER).map(item => item.email), [OWNER, SENDER])
  assert.deepEqual(gmailTestRecipients(` ${OWNER.toUpperCase()} `, OWNER).map(item => item.email), [OWNER])
  for (const value of ['', undefined, 'bad', 'owner@example.test\r\nBcc: other@example.test', 'Name <owner@example.test>']) assert.deepEqual(gmailTestRecipients(value, SENDER), [])
  assert.deepEqual(gmailTestRecipients(OWNER, undefined), [])
})

test('send_test whitelists scoped confirmed payload and strips subject/body overrides, flags, and secrets', async () => {
  let requests = 0
  const controller = new AbortController()
  await mockFetch(async (url, options) => {
    requests += 1
    assert.equal(url, '/api/email-gmail')
    assert.equal(options.method, 'POST')
    assert.equal(options.signal, controller.signal)
    assert.deepEqual(JSON.parse(options.body), { workspaceId: W, action: 'send_test', productId: P, recipient: OWNER, confirmTest: true })
    return json(accepted({ access_token: 'synthetic-private-token', message: 'synthetic-private-provider-message' }))
  }, async () => {
    const result = await emailGmailAction({ workspaceId: W, action: 'send_test', signal: controller.signal, payload: { productId: P, recipient: ` ${OWNER.toUpperCase()} `, confirmTest: true, subject: 'override', body: 'override', workspaceId: 'override', action: 'override', sendingEnabled: true, access_token: 'synthetic-private-token' } })
    assert.deepEqual(result, accepted())
    assert.equal(requests, 1)
    assert(!JSON.stringify(result).includes('synthetic-private'))
  })
})

test('unconfirmed, malformed, missing-scope, and unsupported diagnostic requests never fetch', async () => {
  await mockFetch(async () => { assert.fail('No network request may occur') }, async () => {
    for (const payload of [{ productId: P, recipient: OWNER }, { productId: P, recipient: OWNER, confirmTest: 'true' }, { recipient: OWNER, confirmTest: true }, { productId: P, recipient: 'bad', confirmTest: true }, { productId: P, recipient: `${OWNER}\r\nBcc:other@example.test`, confirmTest: true }]) await assert.rejects(emailGmailAction({ workspaceId: W, action: 'send_test', payload }))
    await assert.rejects(emailGmailAction({ workspaceId: '', action: 'send_test', payload: { productId: P, recipient: OWNER, confirmTest: true } }))
    await assert.rejects(emailGmailAction({ workspaceId: W, action: 'send_campaign_now' }))
  })
})

test('connect, disconnect, and configure_budget keep their existing strict contracts', async () => {
  await mockFetch(async (_url, options) => {
    const body = JSON.parse(options.body)
    if (body.action === 'configure_budget') assert.deepEqual(body, { accountType: 'workspace', dailyBudget: 1800, confirmWorkspace: true, workspaceId: W, action: body.action })
    else assert.deepEqual(body, { workspaceId: W, action: body.action })
    return json(body.action === 'connect' ? { authorizationUrl: 'https://accounts.example.test/oauth' } : { sendingEnabled: false })
  }, async () => {
    for (const action of ['connect', 'disconnect']) await emailGmailAction({ workspaceId: W, action, payload: { recipient: OWNER, productId: P, sendingEnabled: true } })
    await emailGmailAction({ workspaceId: W, action: 'configure_budget', payload: { accountType: 'workspace', dailyBudget: 1800, confirmWorkspace: true, recipient: OWNER, sendingEnabled: true } })
  })
})

test('acceptance does not claim receipt and recording failure warns without losing definite acceptance', () => {
  for (const recorded of [true, false]) {
    const notice = gmailTestResultNotice(accepted({ recorded }))
    assert(notice.text.startsWith(GMAIL_TEST_ACCEPTED_NOTICE))
    assert.match(notice.text, /receipt is not verified/)
    assert.match(notice.text, /No daily marketing campaigns have been enabled/)
    assert.equal(notice.tone, recorded ? 'success' : 'warning')
    if (!recorded) assert.match(notice.text, /not recorded; do not send another test/)
  }
  assert.equal(gmailTestResultNotice({ accepted: true }).tone, 'warning')
})

test('malformed successes, provider errors, and transport failures stay sanitized with one request only', async () => {
  const responses = [
    () => json(accepted({ accepted: false, message: 'synthetic-private-detail' })),
    () => json(accepted({ recipient: SENDER })),
    () => json(accepted({ sendingEnabled: true })),
    () => json(accepted({ recorded: undefined })),
    () => json(accepted({ providerMessageId: 'bad\r\nheader' })),
    () => json({ error: 'synthetic-private-detail', access_token: 'synthetic-private-token' }, 500),
    () => json({ error: 'synthetic-private-detail' }, 409),
    () => { throw new Error('synthetic-private-transport-token') },
    () => new Response('synthetic-private-detail', { status: 200 }),
  ]
  for (const response of responses) {
    let requests = 0
    await mockFetch(async () => { requests += 1; return response() }, async () => {
      await assert.rejects(emailGmailAction({ workspaceId: W, action: 'send_test', payload: { productId: P, recipient: OWNER, confirmTest: true } }), error => {
        assert(!error.message.includes('synthetic-private'))
        assert.match(error.message, /outcome is unknown/)
        assert.match(error.message, /do not retry/)
        return true
      })
      assert.equal(requests, 1)
    })
  }
})

// Render the real component with a small deterministic hook harness. JSX is
// compiled using the installed Vite dependency, with every external service mocked.
const require = createRequire(import.meta.url)
const esbuild = require(require.resolve('esbuild', { paths: [dirname(require.resolve('vite'))] }))
const pageSource = readFileSync(new URL('../src/pages/EmailCampaigns.jsx', import.meta.url), 'utf8').replace(/^import .*$/gm, '').replace('export default function EmailCampaigns()', 'function EmailCampaigns()')
const bindings = ['useCallback', 'useEffect', 'useMemo', 'useRef', 'useState', 'useSearchParams', 'Layout', 'useWorkspace', 'supabase', 'trackFloEvent', ...Object.keys(client), 'gmailCallbackFailureNotice', '__jsx']
const compiled = esbuild.transformSync(`const { ${bindings.join(', ')} } = runtime;\n${pageSource}`, { loader: 'jsx', jsxFactory: '__jsx', jsxFragment: 'Array', target: 'es2022' }).code
const loadPage = new Function('runtime', `${compiled}\nreturn EmailCampaigns;`)
const nodes = tree => {
  if (tree == null || tree === false) return []
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  if (typeof tree !== 'object') return [tree]
  return [tree, ...nodes(tree.children)]
}
const text = tree => nodes(tree).filter(item => typeof item === 'string').join(' ')
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function harness({ workspaceRole = 'owner', sendingEnabled = false, configured = true } = {}) {
  const state = [], effects = []
  let cursor = 0, changed = false, tree, authCallback
  const h = { calls: [], user: { id: 'authenticated-owner-id', email: OWNER }, role: workspaceRole, send: async () => accepted() }
  h.workspace = { apps: [{ id: P, name: 'First app' }, { id: 'other-product', name: 'Second app' }], activeApp: { id: P }, workspaceId: W, workspaceRole, workspaceLoading: false, workspaceError: '', setActiveApp: app => { h.workspace.activeApp = app; changed = true } }
  h.params = new URLSearchParams({ app: P })
  const data = { campaign: null, contacts: [], drafts: [], queue: [], connection: { configured, email: SENDER, expected_email: SENDER, daily_budget: 400 }, readiness: { sendingEnabled, gmailConfigured: configured } }
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]))
  const runtime = {
    ...client,
    __jsx: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState(initial) { const i = cursor++; if (!state[i]) state[i] = { value: typeof initial === 'function' ? initial() : initial }; return [state[i].value, next => { state[i].value = typeof next === 'function' ? next(state[i].value) : next; changed = true }] },
    useRef(initial) { const i = cursor++; if (!state[i]) state[i] = { current: initial }; return state[i] },
    useMemo(fn, deps) { const i = cursor++; if (!state[i] || !sameDeps(state[i].deps, deps)) state[i] = { deps, value: fn() }; return state[i].value },
    useCallback(fn) { cursor++; return fn },
    useEffect(fn, deps) { const i = cursor++; if (!state[i] || !sameDeps(state[i].deps, deps)) { const previous = state[i]; state[i] = { deps }; effects.push(() => { previous?.cleanup?.(); state[i].cleanup = fn() }) } },
    useWorkspace: () => h.workspace,
    useSearchParams: () => [h.params, params => { h.params = params; changed = true }],
    Layout: 'layout',
    trackFloEvent: async () => {},
    gmailCallbackFailureNotice: () => null,
    getEmailCampaigns: async () => data,
    emailGmailAction: async input => { h.calls.push(input); return h.send(input) },
    supabase: { auth: { getUser: async () => ({ data: { user: h.user }, error: null }), onAuthStateChange: callback => { authCallback = callback; return { data: { subscription: { unsubscribe() {} } } } } } },
  }
  const Component = loadPage(runtime)
  h.render = () => { cursor = 0; changed = false; tree = Component(); return tree }
  h.flush = async () => { for (let i = 0; i < 20; i++) { h.render(); effects.splice(0).forEach(fn => fn()); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); if (!changed && !effects.length) break } return tree }
  h.button = label => nodes(tree).find(item => item?.type === 'button' && text(item) === label)
  h.dialog = () => nodes(tree).find(item => item?.type?.name === 'GmailTestDialog')
  h.allText = () => text(tree)
  h.switchApp = async id => { const select = nodes(tree).find(item => item?.type === 'select' && item.props['aria-label'] === 'Choose email campaign app'); select.props.onChange({ target: { value: id } }); await h.flush() }
  h.authChange = async user => { h.user = user; authCallback('SIGNED_IN', user ? { user } : null); await h.flush() }
  return h
}

test('real UI opens and cancels without sending, defaults TO verified user.email, and fixes connected sender badge', async () => {
  const h = harness(); await h.flush()
  assert.match(h.allText(), /Connected · Google consent verified this sender/)
  assert(!h.allText().includes('Not connected until Google consent succeeds'))
  const open = h.button('Send one test email…'); assert(open && !open.props.disabled)
  open.props.onClick(); await h.flush()
  assert.equal(h.calls.length, 0)
  assert.equal(h.dialog().props.sender, SENDER)
  assert.equal(h.dialog().props.recipient, OWNER)
  assert.deepEqual(h.dialog().props.recipients.map(item => item.email), [OWNER, SENDER])
  h.dialog().props.onRecipient('arbitrary@example.test'); await h.flush()
  assert.equal(h.dialog().props.recipient, OWNER)
  h.dialog().props.onClose(); await h.flush()
  assert(!h.dialog()); assert.equal(h.calls.length, 0)
})

test('real UI sends only after final confirmation, ignores duplicate clicks, and locks the Gmail account across apps', async () => {
  const h = harness(); const pending = deferred(); h.send = () => pending.promise; await h.flush()
  h.button('Send one test email…').props.onClick(); await h.flush()
  const final = h.dialog().props.onSend
  final(); final(); await h.flush()
  assert.equal(h.calls.length, 1)
  assert.deepEqual(h.calls[0].payload, { productId: P, recipient: OWNER, confirmTest: true })
  assert.equal(h.calls[0].action, 'send_test')
  assert.equal(h.calls[0].workspaceId, W)
  pending.resolve(accepted()); await h.flush()
  assert.match(h.allText(), /Gmail accepted the test\. Check inbox\/spam; receipt is not verified\./)
  assert(h.button('Send one test email…').props.disabled)
  await h.switchApp('other-product')
  assert(h.button('Send one test email…').props.disabled)
  assert.equal(h.calls.length, 1)
})

test('real UI suppresses stale results after app switches and never retries unknown outcomes', async () => {
  const h = harness(); const pending = deferred(); h.send = () => pending.promise; await h.flush()
  h.button('Send one test email…').props.onClick(); await h.flush(); h.dialog().props.onSend(); await h.flush()
  await h.switchApp('other-product')
  assert(h.calls[0].signal.aborted)
  pending.resolve(accepted()); await h.flush()
  assert(!h.allText().includes('Gmail accepted the test'))
  assert(h.button('Send one test email…').props.disabled)
  assert.equal(h.calls.length, 1)

  const unknown = harness(); unknown.send = async () => { throw new Error('synthetic-private-secret') }; await unknown.flush()
  unknown.button('Send one test email…').props.onClick(); await unknown.flush(); unknown.dialog().props.onSend(); await unknown.flush()
  assert.match(unknown.allText(), /outcome is unknown/)
  assert(!unknown.allText().includes('synthetic-private'))
  assert(unknown.button('Send one test email…').props.disabled)
  assert.equal(unknown.calls.length, 1)
})

test('real UI limits diagnostics to connected owner/admin while live marketing is OFF', async () => {
  for (const role of ['member', 'none']) { const h = harness({ workspaceRole: role }); await h.flush(); assert(!h.button('Send one test email…')); assert.equal(h.calls.length, 0) }
  const enabled = harness({ sendingEnabled: true }); await enabled.flush(); assert(enabled.button('Send one test email…').props.disabled)
  const disconnected = harness({ configured: false }); await disconnected.flush(); assert(!disconnected.button('Send one test email…'))
  const admin = harness({ workspaceRole: 'admin' }); await admin.flush(); assert(!admin.button('Send one test email…').props.disabled)
})

test('real UI clears review when authentication changes and does not allow a stale confirmation', async () => {
  const h = harness(); await h.flush(); h.button('Send one test email…').props.onClick(); await h.flush()
  const stale = h.dialog().props.onSend
  await h.authChange({ id: 'different-owner-id', email: 'different@example.test' })
  assert(!h.dialog())
  stale(); await h.flush()
  assert.equal(h.calls.length, 0)
})
