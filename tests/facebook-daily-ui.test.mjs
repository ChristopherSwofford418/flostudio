import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'

const require = createRequire(import.meta.url)
const esbuild = require(require.resolve('esbuild', { paths: [dirname(require.resolve('vite'))] }))
const clientSource = readFileSync(new URL('../src/lib/facebookDailyDraftsClient.js', import.meta.url), 'utf8')
const source = readFileSync(new URL('../src/pages/FacebookDailyDrafts.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/pages/FacebookDailyDrafts.css', import.meta.url), 'utf8')
const strip = value => value.replace(/^import .*$/gm, '').replace(/export default function /g, 'function ').replace(/export (const|function|async function) /g, '$1 ')
const compile = (value, bindings, result, jsx = false) => new Function('runtime', `${esbuild.transformSync(`const { ${bindings.join(', ')} } = runtime; const __fragment = 'fragment';\n${strip(value)}`, { loader: jsx ? 'jsx' : 'js', jsxFactory: '__jsx', jsxFragment: '__fragment', target: 'es2022' }).code}\nreturn ${result};`)
const helperNames = ['facebookDailyDraftsAction', 'facebookDailyUuid', 'facebookDailyDate', 'facebookDailyNextDay', 'facebookDailyMatchesSearch', 'facebookDailyCopyText', 'safeFacebookDailyAppUrl', 'safeFacebookDailyPageUrl', 'safeFacebookDailyImagePath', 'facebookDailyStatusResponse', 'copyFacebookDailyText', 'downloadFacebookDailyImage', 'FACEBOOK_DAILY_TIMEZONE', 'FACEBOOK_DAILY_START_HOUR']
const loadClient = compile(clientSource, ['authenticatedJsonHeaders', 'fetch'], `{ ${helperNames.join(', ')} }`)
const loadPage = compile(source, ['useCallback', 'useEffect', 'useRef', 'useState', 'Layout', 'useWorkspace', 'supabase', ...helperNames, '__jsx'], '{ Component: FacebookDailyDraftsWorkspace, Route: FacebookDailyDrafts }', true)
const W = '11111111-1111-4111-8111-111111111111', W2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const id = index => `22222222-2222-4222-8222-${String(index + 1).padStart(12, '0')}`
const rid = index => `33333333-3333-4333-8333-${String(index + 1).padStart(12, '0')}`
const aid = index => `44444444-4444-4444-8444-${String(index + 1).padStart(12, '0')}`
const DAY = '2026-11-11', APP_URL = 'https://apps.apple.com/us/app/example/id123456789'
const path = (index = 0, ws = W) => `/facebook-assets/${ws}/${id(index)}/${'a'.repeat(64)}.png`
const record = (index = 0, ws = W, day = DAY) => ({ id: rid(index), workspace_id: ws, product_id: id(index), scheduled_day: day, body: `Actual saved caption ${index + 1}.\n${APP_URL}`, hashtags: '#Actual #Saved', app_store_url: APP_URL, asset_id: aid(index), image_path: path(index, ws), status: 'draft', source: 'asset_caption', created_at: '2026-11-11T08:02:00Z', updated_at: '2026-11-11T08:04:00Z' })
const app = (index = 0, ws = W, day = DAY) => ({ workspace_id: ws, product_id: id(index), app_name: `Actual app ${index + 1}`, app_store_url: APP_URL, facebook_page_url: null, settings: { enabled: false, timezone: 'America/New_York', start_hour: 3 }, assets_count: index === 0 ? 40 : 20, draft: record(index, ws, day) })
const status = (count = 1, ws = W, day = DAY) => ({ workspace_id: ws, scheduled_day: day, today: DAY, timezone: 'America/New_York', apps: Array.from({ length: count }, (_, i) => app(i, ws, day)), today_counts: { apps: count, drafts: count, images: count } })
const missing = (value = status()) => { value.apps.forEach(item => { item.draft = null }); if (value.scheduled_day === value.today) value.today_counts = { apps: value.apps.length, drafts: 0, images: 0 }; return value }
const clone = value => JSON.parse(JSON.stringify(value))
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const nodes = tree => tree == null || tree === false ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : typeof tree === 'object' ? [tree, ...nodes(tree.children)] : [tree]
const text = tree => nodes(tree).flatMap(item => ['string', 'number'].includes(typeof item) ? [item] : item?.type === 'textarea' ? [item.props.value || ''] : []).join(' ').replace(/\s+/g, ' ').trim()
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]))
const png = () => new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])], { type: 'image/png' })
const pngResponse = () => ({ ok: true, redirected: false, headers: { get: () => 'image/png' }, blob: async () => png() })

// Synthetic auth headers, API reads, clipboard, and document. No real services.
function harness(props = {}, route = false) {
  const state = [], effects = []
  let cursor = 0, changed = false, tree, unmounted = false
  const h = { props: { workspaceId: W, role: 'member', authScope: 'test-user:1', ...props }, calls: [], dispatched: [], copied: [], downloads: [], uploads: [], updatesAfterUnmount: 0, revoked: [] }
  h.auth = async () => ({ Authorization: 'synthetic-test-only', 'Content-Type': 'application/json' })
  h.respond = async fields => fields.action === 'get_workspace_status' ? status(1, fields.workspaceId, fields.scheduledDay || DAY) : { workspace_id: fields.workspaceId }
  h.clipboard = async value => { h.copied.push(value) }
  h.imageFetch = async () => pngResponse()
  const documentImpl = { body: { appendChild: () => {} }, createElement: () => { const anchor = { remove() {}, click() { h.downloads.push({ href: anchor.href, filename: anchor.download }) } }; return anchor } }
  const urlImpl = { createObjectURL: () => 'blob:synthetic-original-png', revokeObjectURL: url => h.revoked.push(url) }
  const client = loadClient({ authenticatedJsonHeaders: () => h.auth(), fetch: async (url, options) => {
    h.dispatched.push({ url, options, fields: JSON.parse(options.body) })
    const value = await h.respond(JSON.parse(options.body))
    return { ok: true, json: async () => value }
  } })
  const runtime = {
    ...client,
    __jsx: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState(initial) { const i = cursor++; if (!state[i]) state[i] = { value: typeof initial === 'function' ? initial() : initial }; return [state[i].value, next => { if (unmounted) h.updatesAfterUnmount += 1; const value = typeof next === 'function' ? next(state[i].value) : next; if (!Object.is(value, state[i].value)) { state[i].value = value; changed = true } }] },
    useRef(initial) { const i = cursor++; if (!state[i]) state[i] = { current: initial }; return state[i] },
    useCallback(fn, deps) { const i = cursor++; if (!state[i] || !sameDeps(state[i].deps, deps)) state[i] = { deps, value: fn }; return state[i].value },
    useEffect(fn, deps) { const i = cursor++; if (!state[i] || !sameDeps(state[i].deps, deps)) { const previous = state[i]; state[i] = { deps }; effects.push(() => { previous?.cleanup?.(); state[i].cleanup = fn() }) } },
    facebookDailyDraftsAction: input => { h.calls.push(input); return client.facebookDailyDraftsAction(input) },
    copyFacebookDailyText: (value, options) => client.copyFacebookDailyText(value, { ...options, clipboard: { writeText: value => h.clipboard(value) } }),
    downloadFacebookDailyImage: (item, options) => client.downloadFacebookDailyImage(item, { ...options, fetchImpl: (...args) => h.imageFetch(...args), documentImpl, urlImpl }),
    Layout: 'layout', useWorkspace: () => h.props,
    supabase: { auth: {
      getSession: async () => ({ data: { session: { user: { id: 'test-user' } } } }),
      onAuthStateChange: callback => { h.authEvent = callback; return { data: { subscription: { unsubscribe() {} } } } },
    } },
  }
  h.helpers = client; const component = loadPage(runtime)
  h.render = () => { cursor = 0; changed = false; tree = route ? component.Route() : component.Component(h.props); return tree }
  h.flush = async () => {
    for (let i = 0; i < 70; i++) {
      if (!unmounted) { h.render(); effects.splice(0).forEach(fn => fn()) }
      for (let j = 0; j < 100; j++) await Promise.resolve()
      if (unmounted || (!changed && !effects.length)) return tree
    }
    assert.fail('Facebook view must settle without a render/effect loop')
  }
  h.allText = () => text(tree)
  h.find = predicate => nodes(tree).find(item => item && typeof item === 'object' && predicate(item))
  h.cards = () => nodes(tree).filter(item => item?.type === 'article')
  h.button = (title, index = null) => nodes(index === null ? tree : h.cards()[index]).find(item => item?.type === 'button' && text(item) === title)
  h.click = (title, index = null) => h.button(title, index)?.props.onClick()
  h.date = value => h.find(item => item.type === 'input' && item.props.type === 'date').props.onChange({ target: { value } })
  h.search = value => h.find(item => item.type === 'input' && item.props.type === 'search').props.onChange({ target: { value } })
  h.imageLoaded = index => { const image = nodes(h.cards()[index]).find(item => item?.type === 'img'); image.props.onLoad({ currentTarget: { getAttribute: () => image.props.src, naturalWidth: 1400, naturalHeight: 900 } }) }
  h.setProps = async next => { h.props = { ...h.props, ...next }; await h.flush() }
  h.unmount = () => { unmounted = true; for (const hook of state) hook?.cleanup?.(); effects.length = 0 }
  return h
}

test('route-contained styles, native originals, and restricted action surface', () => {
  assert.match(source, /import '\.\/FacebookDailyDrafts\.css'/)
  assert.match(clientSource, /import \{ authenticatedJsonHeaders \} from '\.\/authenticatedApi'/)
  assert.match(css, /\.fbd-page \.fbd-image[^}]*height: auto[^}]*object-fit: contain/s)
  const selectors = css.match(/[^{}]+(?=\{)/g).filter(value => !value.trim().startsWith('@media'))
  assert(selectors.every(value => value.split(',').every(selector => selector.trim().startsWith('.fbd-page'))))
  assert.doesNotMatch(source + clientSource, /setActiveApp|localStorage|setInterval|setTimeout|dangerouslySetInnerHTML|graph\.facebook|connect_facebook|publish_post|generate_image|supabase\.storage|\.upload\(/i)
  assert.match(source, /Download PNG/)
  assert.match(clientSource, /redirect: 'error'/)
})

test('25 cards use one authenticated batched read, actual library counts, no invented links', async () => {
  const h = harness(); h.respond = async () => status(25); await h.flush()
  assert.equal(h.cards().length, 25); assert.equal(h.calls.length, 1); assert.equal(h.dispatched.length, 1)
  assert.deepEqual(h.dispatched[0].fields, { workspaceId: W, action: 'get_workspace_status', scheduledDay: null })
  assert.equal(h.dispatched[0].options.credentials, 'same-origin')
  assert.match(h.allText(), /Daily Facebook Drafts/); assert.match(h.allText(), /40 library images/); assert.match(h.allText(), /520 Supplied library images/)
  assert.equal(h.find(item => item.type === 'a'), undefined)
  assert.equal((h.allText().match(/Page link not saved/g) || []).length, 25)
  assert.match(h.allText(), /3:00 AM Eastern/); assert.match(h.allText(), /4:00 AM review/); assert.match(h.allText(), /not guaranteed/)
  assert.equal(h.copied.length, 0); assert.equal(h.downloads.length, 0); h.unmount()
})

test('strict workspace/app/date/shape/copy validation fails closed', async () => {
  const variants = [
    value => { delete value.workspace_id }, value => { value.workspace_id = W2 },
    value => { delete value.apps[0].workspace_id }, value => { value.apps[0].workspace_id = W2 },
    value => { value.apps[0].draft.workspace_id = W2 }, value => { value.apps[0].draft.product_id = id(1) },
    value => { value.apps[0].draft.scheduled_day = '2026-11-10' }, value => { value.apps.push(clone(value.apps[0])); value.today_counts.apps = 2 },
    value => { value.apps[0].draft.status = 'published' }, value => { value.apps[0].draft.id = 'bad' },
    value => { value.apps[0].draft.body = 'No matching store link' },
    value => { value.apps[0].draft.body += '\nhttps://apps.apple.com/us/app/other/id987654321' },
    value => { value.apps[0].draft.app_store_url = 'https://example.test' },
    value => { value.apps[0].draft.body = `<b>Saved</b> ${APP_URL}` },
    value => { value.apps[0].draft.body = `\0${APP_URL}` }, value => { value.apps[0].draft.body = `${'x'.repeat(6001)} ${APP_URL}` },
    value => { value.apps[0].draft.hashtags = 'not hashtags' }, value => { value.apps[0].draft.created_at = 'yesterday' },
    value => { value.apps[0].draft.image_path = path(1) }, value => { value.apps[0].draft.image_path = path(0, W2) },
    value => { value.apps[0].draft.image_path = path() + '?x=1' }, value => { value.apps[0].draft.image_path = path().replace('.png', '.webp') },
    value => { value.apps[0].draft.asset_id = null }, value => { value.apps[0].assets_count = -1 },
    value => { value.today_counts.apps = 25 }, value => { value.today_counts.drafts = 0 },
    value => { value.today = '2026-02-31' }, value => { value.apps[0].settings.start_hour = 4 },
    value => { value.apps[0].settings.workspace_id = W2 }, value => { delete value.apps[0].draft },
  ]
  for (const mutate of variants) {
    const h = harness(), value = status(); mutate(value); h.respond = async () => value; await h.flush()
    assert.equal(h.cards().length, 0); assert.match(h.allText(), /could not be verified/); assert.equal(h.find(item => item.type === 'img'), undefined)
    assert.equal(h.copied.length, 0); h.unmount()
  }
})

test('only safe saved Facebook Page references and canonical App Store URLs are accepted', () => {
  const helpers = loadClient({})
  for (const value of ['https://www.facebook.com/ActualSavedPage', 'https://facebook.com/profile.php?id=1234567', 'https://www.facebook.com/pages/My-Page/123456']) assert.equal(helpers.safeFacebookDailyPageUrl(value), value)
  for (const value of [null, '', 'javascript:alert(1)', 'https://facebook.com.evil.test/Page', 'https://user:secret@facebook.com/Page', 'https://facebook.com/l.php?u=https://evil.test', 'https://facebook.com/sharer.php', 'https://facebook.com/groups/foo', 'https://facebook.com/login', 'https://facebook.com/Page?redirect=evil', 'https://facebook.com/Page#x', '//facebook.com/Page']) assert.equal(helpers.safeFacebookDailyPageUrl(value), '')
  for (const value of [APP_URL + '?tracking=1', APP_URL + '#x', 'https://apps.apple.com.evil.test/app/id123', 'javascript:alert(1)']) assert.equal(helpers.safeFacebookDailyAppUrl(value), '')
  assert.equal(helpers.safeFacebookDailyImagePath(path(), W, id(1)), '')
  assert.equal(helpers.safeFacebookDailyImagePath(path(), W, id(0)), path())
})

test('missing today/future and text-only drafts stay truthful; images never fall back', async () => {
  const h = harness(); h.respond = async () => missing(status(2)); await h.flush()
  assert.equal(h.cards().length, 2); assert.match(text(h.cards()[0]), /Not created yet/); assert.match(h.allText(), /Matching image not saved yet/)
  assert.doesNotMatch(h.allText(), /Upload images for this app/)
  assert.equal(h.button('Copy Facebook post', 0).props.disabled, true); assert.equal(h.find(item => item.type === 'img'), undefined)
  h.click('Copy Facebook post', 0); await h.flush(); assert.equal(h.copied.length, 0); h.unmount()
  const onlyText = harness(), value = status(); value.apps[0].draft.asset_id = null; value.apps[0].draft.image_path = null; value.apps[0].assets_count = 0; value.today_counts.images = 0
  onlyText.respond = async () => value; await onlyText.flush(); assert.match(onlyText.allText(), /Text-only saved draft/); assert.match(onlyText.allText(), /Image needed/)
  onlyText.click('Copy Facebook post', 0); await onlyText.flush(); assert.equal(onlyText.copied.length, 1)
  assert.equal(onlyText.button('Download PNG', 0).props.disabled, true); onlyText.unmount()
})

test('calendar reads exact requested day, Tomorrow uses server date, Today uses null', async () => {
  const h = harness(); await h.flush(); const oldCopy = h.button('Copy Facebook post', 0).props.onClick
  h.respond = async fields => fields.scheduledDay ? missing(status(1, W, fields.scheduledDay)) : status()
  h.click('Tomorrow'); assert(!text(h.render()).includes('Actual saved caption')); oldCopy(); await h.flush()
  assert.equal(h.dispatched.at(-1).fields.scheduledDay, '2026-11-12'); assert.match(h.allText(), /Not created yet/); assert.equal(h.copied.length, 0)
  h.date('2026-10-01'); await h.flush(); assert.equal(h.dispatched.at(-1).fields.scheduledDay, '2026-10-01')
  h.click('Today'); await h.flush(); assert.equal(h.dispatched.at(-1).fields.scheduledDay, null)
  const count = h.calls.length
  for (const bad of ['2026-02-31', '0000-01-01', 'bad', '2026-11-12\n']) { h.date(bad); await h.flush(); assert.equal(h.calls.length, count) }
  assert.equal(h.helpers.facebookDailyNextDay('2026-12-31'), '2027-01-01'); assert.equal(h.helpers.facebookDailyNextDay('2028-02-28'), '2028-02-29'); assert.equal(h.helpers.facebookDailyNextDay('9999-12-31'), '')
  h.unmount()
})

test('local search by app, body and hashtags makes no requests and captured hidden copy is blocked', async () => {
  const h = harness(); h.respond = async () => status(3); await h.flush(); const oldCopy = h.button('Copy Facebook post', 0).props.onClick
  h.search('actual APP 2'); await h.flush(); assert.equal(h.cards().length, 1); assert.match(h.allText(), /Actual app 2/)
  oldCopy(); await h.flush(); assert.equal(h.copied.length, 0)
  h.search('caption 3'); await h.flush(); assert.equal(h.cards().length, 1)
  h.search('#saved'); await h.flush(); assert.equal(h.cards().length, 3)
  h.search('no match'); await h.flush(); assert.match(h.allText(), /No drafts match/)
  h.click('Clear search'); await h.flush(); assert.equal(h.cards().length, 3); assert.equal(h.calls.length, 1); h.unmount()
})

test('copy exports exact saved body plus separate hashtags and supplies manual copy on failure', async () => {
  const h = harness(); await h.flush()
  h.click('Copy Facebook post', 0); await h.flush(); h.click('Copy hashtags', 0); await h.flush()
  assert.deepEqual(h.copied, [`${record().body}\n\n${record().hashtags}`, record().hashtags]); assert.equal(h.calls.length, 1)
  assert.match(h.allText(), /nothing was published/)
  h.clipboard = async () => { throw new Error('private-provider-token') }; h.click('Copy Facebook post', 0); await h.flush()
  const manual = h.find(item => item.type === 'textarea' && item.props['aria-label']?.startsWith('Manual copy'))
  assert.equal(manual.props.readOnly, true); assert.equal(manual.props.value, `${record().body}\n\n${record().hashtags}`); assert(!h.allText().includes('private-provider-token')); h.unmount()
})

test('PNG download waits for verified preview and native fetch/blob link never claims completion', async () => {
  const h = harness(); await h.flush(); assert.equal(h.button('Download PNG', 0).props.disabled, true)
  h.click('Download PNG', 0); await h.flush(); assert.equal(h.downloads.length, 0)
  h.imageLoaded(0); await h.flush(); assert.equal(h.button('Download PNG', 0).props.disabled, false)
  let requested
  h.imageFetch = async (url, options) => { requested = { url, options }; return pngResponse() }
  h.click('Download PNG', 0); await h.flush()
  assert.equal(requested.url, path()); assert.equal(requested.options.redirect, 'error'); assert.equal(requested.options.credentials, 'same-origin')
  assert.deepEqual(h.downloads, [{ href: 'blob:synthetic-original-png', filename: 'Actual-app-1-facebook-2026-11-11.png' }]); assert.equal(h.revoked.length, 1)
  assert.match(h.allText(), /download requested/); assert.match(h.allText(), /completion is not verified/); assert.equal(h.calls.length, 1); h.unmount()
})

test('failed or non-PNG downloads expose only exact saved original; nothing is downloaded', async () => {
  const responses = [async () => { throw new Error('synthetic failure') }, async () => ({ ...pngResponse(), ok: false }), async () => ({ ...pngResponse(), redirected: true }), async () => ({ ...pngResponse(), headers: { get: () => 'image/webp' } }), async () => ({ ...pngResponse(), blob: async () => new Blob(['not a png'], { type: 'image/png' }) })]
  for (const response of responses) {
    const h = harness(); await h.flush(); h.imageLoaded(0); await h.flush(); h.imageFetch = response
    h.click('Download PNG', 0); await h.flush(); assert.equal(h.downloads.length, 0)
    assert.match(h.allText(), /could not be completed/); const link = h.find(item => item.type === 'a'); assert.equal(link.props.href, path()); assert.equal(link.props.rel, 'noopener noreferrer'); h.unmount()
  }
})

test('sign-out/workspace/date/unmount cancels reads even if transport ignores abort', async () => {
  for (const change of [{ workspaceId: W2 }, { disabled: true }, { authScope: 'new-user:2' }, 'date', 'unmount']) {
    const h = harness(), pending = deferred(); h.respond = () => pending.promise; await h.flush(); const first = h.calls[0]
    h.respond = async fields => missing(status(1, fields.workspaceId, fields.scheduledDay || DAY))
    if (change === 'unmount') h.unmount(); else if (change === 'date') { h.date('2026-11-12'); await h.flush() } else await h.setProps(change)
    assert.equal(first.signal.aborted, true); assert.equal(first.isCurrent(), false)
    pending.resolve(status()); await h.flush(); assert(!h.allText().includes('Actual saved caption')); assert.equal(h.updatesAfterUnmount, 0)
    if (change !== 'unmount') h.unmount()
  }
})

test('auth waits never dispatch after scope/permission change or unmount', async () => {
  for (const change of [{ workspaceId: W2 }, { disabled: true }, { authScope: 'signed-out:2' }, 'unmount']) {
    const h = harness(), auth = deferred(); h.auth = () => auth.promise; await h.flush(); const request = h.calls[0]
    if (change === 'unmount') h.unmount(); else await h.setProps(change)
    auth.resolve({ Authorization: 'synthetic-test-only' }); await h.flush()
    assert.equal(request.signal.aborted, true); assert.equal(request.isCurrent(), false)
    assert(!h.dispatched.some(item => item.options.signal === request.signal))
    assert.equal(h.updatesAfterUnmount, 0); if (change !== 'unmount') h.unmount()
  }
})

test('late clipboard and PNG results cannot perform stale UI/export after scope, date or sign-out changes', async () => {
  for (const field of ['copy', 'image']) for (const change of [{ workspaceId: W2 }, { disabled: true }, { authScope: 'new-user:2' }, 'date', 'refresh', 'unmount']) {
    const h = harness(), pending = deferred(); await h.flush()
    if (field === 'copy') { h.clipboard = () => pending.promise; h.click('Copy Facebook post', 0) }
    else { h.imageLoaded(0); await h.flush(); h.imageFetch = () => pending.promise; h.click('Download PNG', 0) }
    await h.flush()
    if (change === 'unmount') h.unmount(); else if (change === 'date') { h.date('2026-11-12'); await h.flush() } else if (change === 'refresh') { h.click('Refresh all'); await h.flush() } else await h.setProps(change)
    pending.resolve(field === 'image' ? pngResponse() : undefined); await h.flush()
    assert.equal(h.downloads.length, 0); assert(!h.allText().includes('Saved text copied')); assert(!h.allText().includes('Image download requested')); assert.equal(h.updatesAfterUnmount, 0)
    if (change !== 'unmount') h.unmount()
  }
})

test('captured handlers are invalidated synchronously on away-and-back renders and refresh', async () => {
  const h = harness(); await h.flush(); const oldCopy = h.button('Copy Facebook post', 0).props.onClick, oldRefresh = h.button('Refresh all').props.onClick
  h.props = { ...h.props, workspaceId: W2 }; assert(!text(h.render()).includes('Actual saved caption'))
  h.props = { ...h.props, workspaceId: W }; assert(!text(h.render()).includes('Actual saved caption'))
  oldCopy(); oldRefresh(); await h.flush(); assert.equal(h.copied.length, 0)
  const pending = deferred(); h.respond = () => pending.promise; h.click('Refresh all'); await h.flush(); const attempted = h.calls.at(-1)
  h.respond = async fields => { const value = status(1, fields.workspaceId); value.apps[0].draft.body = `Newest saved caption.\n${APP_URL}`; return value }
  await h.setProps({ workspaceId: W2 }); assert.equal(attempted.signal.aborted, true)
  pending.resolve(status()); await h.flush(); assert.match(h.allText(), /Newest saved caption/); assert(!h.allText().includes('Actual saved caption')); h.unmount()
})

test('owner/admin scheduling requires one review confirmation, double clicks do not duplicate writes', async () => {
  for (const role of ['owner', 'admin']) {
    const h = harness({ role }); let enabled = false
    h.respond = async fields => { if (fields.action === 'save_workspace_settings') { enabled = fields.enabled; return { workspace_id: W } } const value = status(25); value.apps.forEach(app => { app.settings.enabled = enabled }); return value }
    await h.flush(); h.click('Start daily drafts for all apps'); await h.flush()
    assert.equal(h.calls.length, 1); assert(h.find(item => item.props.role === 'dialog')); assert.match(h.allText(), /all 25 active apps/)
    const confirm = h.button('Confirm start daily drafts').props.onClick; confirm(); confirm(); await h.flush()
    assert.equal(h.calls.filter(item => item.action === 'save_workspace_settings').length, 1)
    assert.deepEqual(h.dispatched.find(item => item.fields.action === 'save_workspace_settings').fields, { workspaceId: W, action: 'save_workspace_settings', enabled: true, timezone: 'America/New_York', startHour: 3 })
    assert.match(h.allText(), /settings saved for all active apps/); assert.equal(h.find(item => item.props.role === 'dialog'), undefined)
    h.click('Pause daily drafts'); await h.flush(); h.click('Confirm pause daily drafts'); await h.flush()
    assert.equal(h.calls.filter(item => item.action === 'save_workspace_settings').length, 2); assert.match(h.allText(), /settings are paused/); h.unmount()
  }
})

test('members cannot see management/upload actions; stale admin confirmation cannot dispatch', async () => {
  const member = harness(); await member.flush(); assert.equal(member.button('Start daily drafts for all apps'), undefined); assert.equal(member.find(item => item.type === 'input' && item.props.type === 'file'), undefined); member.unmount()
  for (const change of [{ role: 'member' }, { workspaceId: W2 }, { authScope: 'signed-out:2' }, { disabled: true }]) {
    const h = harness({ role: 'owner' }); await h.flush(); h.click('Start daily drafts for all apps'); await h.flush(); const old = h.button('Confirm start daily drafts').props.onClick
    await h.setProps(change); old(); await h.flush(); assert.equal(h.calls.filter(item => item.action === 'save_workspace_settings').length, 0); h.unmount()
  }
})

test('read-only libraries list actual per-app counts with no fake upload or global app picker', async () => {
  const h = harness({ role: 'owner' }); h.respond = async () => status(2); await h.flush()
  const inventory = h.find(item => item.type === 'dl' && item.props['aria-label'] === 'Supplied image counts by app')
  assert.match(text(inventory), /Actual app 1 40 library images/); assert.match(text(inventory), /Actual app 2 20 library images/)
  assert.match(h.allText(), /60 Supplied library images/); assert.match(h.allText(), /read-only inventory/); assert.match(h.allText(), /approved intake/)
  assert.equal(h.find(item => item.type === 'select'), undefined); assert.equal(h.find(item => item.type === 'input' && item.props.type === 'file'), undefined)
  assert.equal(h.calls.length, 1); assert.equal(h.uploads.length, 0); h.unmount()
})

test('client strips payload overrides and disallows non-draft operations; errors never echo server secrets', async () => {
  const requests = [], client = loadClient({ authenticatedJsonHeaders: async () => ({ Authorization: 'synthetic' }), fetch: async (url, options) => { requests.push(JSON.parse(options.body)); return { ok: true, json: async () => status() } } })
  await client.facebookDailyDraftsAction({ workspaceId: W, action: 'get_workspace_status', payload: { workspaceId: W2, action: 'publish', scheduledDay: null, productId: id(1) } })
  assert.deepEqual(requests, [{ workspaceId: W, action: 'get_workspace_status', scheduledDay: null }])
  for (const action of ['publish', 'connect', 'generate_image', 'research']) await assert.rejects(client.facebookDailyDraftsAction({ workspaceId: W, action }), /Unsupported/)
  await assert.rejects(client.facebookDailyDraftsAction({ workspaceId: W, action: 'save_workspace_settings', payload: { enabled: true, timezone: 'UTC', startHour: 3 } }))
  const denied = loadClient({ authenticatedJsonHeaders: async () => ({}), fetch: async () => ({ ok: false, status: 403, json: async () => ({ error: 'secret provider credential', code: 'SECRET' }) }) })
  await assert.rejects(denied.facebookDailyDraftsAction({ workspaceId: W, action: 'get_workspace_status' }), error => error.status === 403 && !error.message.includes('secret'))
})

test('route auth ref blocks stale child handlers before sign-out/account-change rerenders', async () => {
  const h = harness({ workspaceLoading: false }, true); await h.flush()
  const child = h.find(item => typeof item.type === 'function' && item.props.authCurrent)
  assert(child); assert.equal(child.props.authCurrent(), true)
  h.authEvent('SIGNED_OUT', null)
  assert.equal(child.props.authCurrent(), false)
  await h.flush(); const signedOut = h.find(item => typeof item.type === 'function' && item.props.authCurrent)
  assert.equal(signedOut.props.disabled, true)
  h.authEvent('SIGNED_IN', { user: { id: 'different-user' } }); assert.equal(child.props.authCurrent(), false); await h.flush(); h.unmount()
})

test('safe stored Page links render exactly while unsafe saved references never render', async () => {
  for (const page of ['https://www.facebook.com/ActualSavedPage', 'https://facebook.com/l.php?u=evil', null]) {
    const h = harness(), value = status(); value.apps[0].facebook_page_url = page; h.respond = async () => value; await h.flush()
    const link = h.find(item => item.type === 'a')
    if (page === 'https://www.facebook.com/ActualSavedPage') { assert.equal(link.props.href, page); assert.equal(text(link), 'Open saved Facebook Page'); assert.equal(link.props.rel, 'noopener noreferrer') }
    else { assert.equal(link, undefined); assert.match(h.allText(), /Page link not saved/) }
    h.unmount()
  }
})

test('preview load failure never enables download and offers the same saved PNG original', async () => {
  const h = harness(); await h.flush()
  const image = h.find(item => item.type === 'img')
  image.props.onError({ currentTarget: { getAttribute: () => image.props.src } }); await h.flush()
  assert.equal(h.button('Download PNG', 0).props.disabled, true); assert.equal(h.find(item => item.type === 'img'), undefined)
  const link = h.find(item => item.type === 'a'); assert.equal(link.props.href, path()); h.click('Download PNG', 0); await h.flush(); assert.equal(h.downloads.length, 0); h.unmount()
})

test('read failures clear previous content and cancelled header waits cannot dispatch admin saves', async () => {
  const h = harness(); await h.flush(); const old = h.button('Copy Facebook post', 0).props.onClick
  h.respond = async () => { throw new Error('private credential') }; h.click('Refresh all'); await h.flush(); old(); await h.flush()
  assert.equal(h.cards().length, 0); assert.equal(h.copied.length, 0); assert(!h.allText().includes('private credential')); assert.match(h.allText(), /could not be verified/); h.unmount()
  const admin = harness({ role: 'owner' }); await admin.flush(); admin.click('Start daily drafts for all apps'); await admin.flush()
  const pending = deferred(); admin.auth = () => pending.promise; admin.click('Confirm start daily drafts'); await admin.flush(); const save = admin.calls.at(-1)
  await admin.setProps({ role: 'member' }); pending.resolve({ Authorization: 'synthetic-test-only' }); await admin.flush()
  assert.equal(save.signal.aborted, true); assert.equal(save.isCurrent(), false); assert(!admin.dispatched.some(item => item.fields.action === 'save_workspace_settings')); admin.unmount()
})

test('historical saved matching image is preserved independently of current active library count', () => {
  const client = loadClient({}), value = status(1, W, '2026-10-01'); value.apps[0].assets_count = 0
  const checked = client.facebookDailyStatusResponse(value, W, '2026-10-01')
  assert.equal(checked.apps[0].draft.image_path, path()); assert.equal(checked.apps[0].assets_count, 0)
})
