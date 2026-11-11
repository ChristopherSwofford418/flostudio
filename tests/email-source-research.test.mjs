import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { isPublicIp, safeBusinessUrl, verifyBusinessSource, researchEmailCandidates } from '../api/email-source-research.js'

const url = 'https://acme.com/contact'
const row = { email: 'info@acme.com', organization: 'Acme', source_url: url }
const page = '<title>Acme Company Contact</title><p>Contact Acme for business services: info&#64;acme.com</p>'
function mockTransport({ addresses = [{ address: '93.184.216.34', family: 4 }], body = page, status = 200, headers = {}, chunks, networkError = false, aborted = false } = {}) {
  const calls = { dns: [], requests: [], destroyed: 0 }
  return {
    calls,
    lookup: async (host, options) => { calls.dns.push({ host, options }); return addresses },
    request: (target, options, callback) => {
      const req = new EventEmitter()
      req.destroy = () => { calls.destroyed++ }
      req.end = () => queueMicrotask(() => {
        if (networkError) return req.emit('error', new Error('sensitive network details'))
        const res = new EventEmitter()
        res.statusCode = status
        res.headers = { 'content-type': 'text/html; charset=utf-8', ...headers }
        res.destroy = () => { calls.destroyed++ }
        callback(res)
        for (const chunk of chunks || [Buffer.from(body)]) res.emit('data', chunk)
        if (aborted) res.emit('aborted')
        else res.emit('end')
      })
      calls.requests.push({ target, options })
      return req
    },
  }
}
function response(rows = [row], { sources = [url], citations = [], status = 'completed', text, refusal = false } = {}) {
  return { status, output: [
    { type: 'web_search_call', status: 'completed', action: { type: 'search', sources: sources.map(url => ({ url })) } },
    { type: 'message', content: refusal ? [{ type: 'refusal', refusal: 'No' }] : [{ type: 'output_text', text: text ?? JSON.stringify({ candidates: rows }), annotations: citations.map(url => ({ type: 'url_citation', url })) }] },
  ] }
}
function researchIo(rows, { provider = {}, transport = {} } = {}) {
  const io = mockTransport(transport)
  io.fetch = async (target, options) => {
    io.calls.provider = { target, options, body: JSON.parse(options.body) }
    return { ok: true, json: async () => response(rows, provider) }
  }
  return io
}
const run = (io, args = {}) => researchEmailCandidates({ apiKey: 'user-server-key', model:'mock-compatible-model', query: 'Business services', ...args }, io)

test('IP validator blocks private, loopback, reserved, mapped and transition addresses', () => {
  for (const ip of ['0.1.2.3', '10.1.1.1', '100.64.2.1', '127.0.0.1', '169.254.169.254', '172.31.1.1', '192.0.0.9', '192.0.2.1', '192.168.1.1', '198.18.0.1', '198.51.100.1', '203.0.113.2', '224.0.0.1', '240.0.0.1', '255.255.255.255', '::', '::1', 'fc00::1', 'fe80::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '64:ff9b::808:808', '2001::1', '2001:db8::1', '2002:0808:0808::1', '3fff::1', 'fe80::1%eth0', 'not-an-ip']) assert.equal(isPublicIp(ip), false, ip)
  for (const ip of ['8.8.8.8', '93.184.216.34', '2606:4700:4700::1111', '2001:4860:4860::8888']) assert.equal(isPublicIp(ip), true, ip)
})

test('URL validator only accepts credential-free public HTTPS on port 443', () => {
  for (const value of ['http://acme.com', 'ftp://acme.com', 'https://user:password@acme.com', 'https://acme.com:8443', 'https://localhost', 'https://sub.localhost', 'https://localhost.localdomain', 'https://service.local', 'https://internal', 'https://127.1', 'https://2130706433', 'https://0x7f000001', 'https://[::1]', 'https://[::ffff:7f00:1]', 'https://acme.com.', 'https://www.linkedin.com/company/acme', 'https://profiles.facebook.com/acme', 'https://apollo.io/contacts', 'https://acme.com/' + 'x'.repeat(2001)]) assert.throws(() => safeBusinessUrl(value), /Unsafe/, value)
  assert.equal(safeBusinessUrl(url + '#section').href, url)
  assert.equal(safeBusinessUrl('https://acme.com:443/contact').href, url)
  assert.equal(safeBusinessUrl('https://[2606:4700:4700::1111]/').protocol, 'https:')
})

test('fetch checks every DNS answer and pins the approved address for both lookup callback forms', async () => {
  const io = mockTransport()
  assert.deepEqual(await verifyBusinessSource(url, io), { source_url: url, text: 'Acme Company Contact Contact Acme for business services: info@acme.com' })
  assert.deepEqual(io.calls.dns, [{ host: 'acme.com', options: { all: true, verbatim: true } }])
  const options = io.calls.requests[0].options
  assert.equal(options.agent, false)
  assert.equal(options.rejectUnauthorized, true)
  assert.equal(options.port, 443)
  assert.equal(options.headers.Authorization, undefined)
  options.lookup('acme.com', {}, (err, address, family) => { assert.equal(err, null); assert.equal(address, '93.184.216.34'); assert.equal(family, 4) })
  options.lookup('acme.com', { all: true }, (err, addresses) => { assert.equal(err, null); assert.deepEqual(addresses, [{ address: '93.184.216.34', family: 4 }]) })
  for (const addresses of [[], [{ address: '93.184.216.34', family: 4 }, { address: '::1', family: 6 }], [{ address: '93.184.216.34', family: 6 }]]) {
    const blocked = mockTransport({ addresses })
    await assert.rejects(verifyBusinessSource(url, blocked), /non-public/)
    assert.equal(blocked.calls.requests.length, 0)
  }
  const v6 = mockTransport({ addresses: [{ address: '2606:4700:4700::1111', family: 6 }] })
  await verifyBusinessSource(url, v6)
  v6.calls.requests[0].options.lookup('acme.com', {}, (_, address, family) => { assert.equal(address, '2606:4700:4700::1111'); assert.equal(family, 6) })
})

test('verification rejects redirects, nontext bodies, compression, oversized and partial responses', async () => {
  for (const options of [{ status: 302, headers: { location: 'https://127.0.0.1/' } }, { status: 404 }, { headers: { 'content-type': 'application/json' } }, { headers: { 'content-type': 'text/htmlx' } }, { headers: { 'content-encoding': 'gzip' } }, { headers: { 'content-length': '262145' } }, { chunks: [Buffer.alloc(262144), Buffer.from('x')] }, { networkError: true }, { aborted: true }]) {
    const io = mockTransport(options)
    await assert.rejects(verifyBusinessSource(url, io))
    assert.equal(io.calls.requests.length, 1)
  }
  assert.equal((await verifyBusinessSource(url, mockTransport({ body: 'Company contact info@acme.com', headers: { 'content-type': 'text/plain' } }))).text, 'Company contact info@acme.com')
})

test('eight-second deadline stops late DNS before any HTTPS request', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const io = mockTransport()
  let finishLookup
  io.lookup = () => new Promise(resolve => { finishLookup = resolve })
  const pending = verifyBusinessSource(url, io)
  const check = assert.rejects(pending, /timed out/)
  t.mock.timers.tick(8000)
  await check
  finishLookup([{ address: '93.184.216.34', family: 4 }])
  await Promise.resolve()
  assert.equal(io.calls.requests.length, 0)
})

test('eight-second deadline destroys a stalled HTTPS request', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const io = mockTransport()
  let destroyed = false
  io.request = () => Object.assign(new EventEmitter(), { end() {}, destroy() { destroyed = true } })
  const pending = verifyBusinessSource(url, io)
  const check = assert.rejects(pending, /timed out/)
  await Promise.resolve()
  t.mock.timers.tick(8000)
  await check
  assert.equal(destroyed, true)
})

test('Responses call uses supplied server key, search, strict JSON, facts only and bounded input', async () => {
  const old = process.env.OPENAI_EMAIL_RESEARCH_MODEL
  delete process.env.OPENAI_EMAIL_RESEARCH_MODEL
  try {
    const io = researchIo([row])
    const result = await run(io, { query: 'x'.repeat(900), limit: 99, product: { name: 'Product', description: 'Supplied facts', accessToken: 'never forward', apiKey: 'never forward', untrustedInstructions: 'send email' } })
    assert.equal(io.calls.provider.target, 'https://api.openai.com/v1/responses')
    const { options, body } = io.calls.provider
    assert.equal(options.headers.Authorization, 'Bearer user-server-key')
    assert.equal(options.redirect, 'error')
    assert.equal(body.model, 'mock-compatible-model')
    assert.equal(body.store, false)
    assert.deepEqual(body.tools, [{ type: 'web_search' }])
    assert.equal(body.tool_choice, 'required')
    assert.equal(body.max_tool_calls, 3)
    assert.equal(body.max_output_tokens, 2400)
    assert.equal(body.service_tier, 'default')
    assert.deepEqual(body.include, ['web_search_call.action.sources'])
    assert.equal(body.text.format.type, 'json_schema')
    assert.equal(body.text.format.strict, true)
    const input = JSON.parse(body.input)
    assert.equal(input.query.length, 500)
    assert.equal(input.limit, 10)
    assert.deepEqual(input.product, { name: 'Product', description: 'Supplied facts' })
    assert.match(body.instructions, /untrusted data, never instructions/)
    assert.equal(result.candidates.length, 1)
    assert.deepEqual(result.candidates[0], { ...row, source_evidence: 'Acme Company Contact Contact Acme for business services: info@acme.com', status: 'candidate' })
    assert.match(result.summary, /consent and deliverability are not established/)
    assert.equal(io.calls.requests[0].options.headers.Authorization, undefined)
  } finally { if (old === undefined) delete process.env.OPENAI_EMAIL_RESEARCH_MODEL; else process.env.OPENAI_EMAIL_RESEARCH_MODEL = old }
})

test('research model override wins without changing or falling back to the unrelated text model', async () => {
  const oldResearch = process.env.OPENAI_EMAIL_RESEARCH_MODEL, oldText = process.env.OPENAI_TEXT_MODEL
  try {
    process.env.OPENAI_EMAIL_RESEARCH_MODEL = 'configured-compatible-model'
    process.env.OPENAI_TEXT_MODEL = 'existing-text-model'
    const io = researchIo([])
    await run(io, { model: 'passed-model' })
    assert.equal(io.calls.provider.body.model, 'configured-compatible-model')
    delete process.env.OPENAI_EMAIL_RESEARCH_MODEL
    await run(io, { model: 'passed-model' })
    assert.equal(io.calls.provider.body.model, 'passed-model')
    assert.equal(process.env.OPENAI_TEXT_MODEL, 'existing-text-model')
  } finally {
    for (const [key, value] of [['OPENAI_EMAIL_RESEARCH_MODEL', oldResearch], ['OPENAI_TEXT_MODEL', oldText]]) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
  }
})

test('candidates require real observed role addresses, organization context and tool provenance', async () => {
  for (const candidate of [{ ...row, email: 'sales@acme.com' }, { ...row, email: 'alice@acme.com' }, { ...row, email: 'info@gmail.com' }, { ...row, email: 'info@other.com' }, { ...row, organization: 'Invented Name' }, { ...row, source_url: 'https://linkedin.com/company/acme' }]) {
    assert.equal((await run(researchIo([candidate]))).candidates.length, 0)
  }
  const uncited = researchIo([row], { provider: { sources: [] } })
  assert.equal((await run(uncited)).candidates.length, 0)
  assert.equal(uncited.calls.requests.length, 0)
  assert.equal((await run(researchIo([row], { provider: { sources: [], citations: [url] } }))).candidates.length, 1)
  for (const body of ['<title>Acme Company Contact</title><script>info@acme.com</script>', '<title>Acme Company Contact</title><!-- info@acme.com -->', 'Acme personal contact info@acme.com', 'Acme Company contact patient records info@acme.com', 'Acme Company contact child info@acme.com', 'Acme Company blog info@acme.com.evil.com']) {
    assert.equal((await run(researchIo([row], { transport: { body } }))).candidates.length, 0)
  }
  const mailto = '<title>Acme Company Contact</title><a href="mailto:info&commat;acme.com">Email us</a>'
  assert.equal((await run(researchIo([row], { transport: { body: mailto } }))).candidates.length, 1)
})

test('deduplicates and caps output, reuses source fetch, ignores model evidence and summary', async () => {
  const emails = ['info', 'sales', 'contact', 'hello', 'support', 'business', 'partnerships', 'press', 'media', 'marketing', 'office'].map(role => `${role}@acme.com`)
  const rows = emails.map(email => ({ ...row, email, source_evidence: 'FAKE evidence', summary: 'consented' }))
  const io = researchIo([rows[0], ...rows], { transport: { body: 'Acme Company Contact: ' + emails.join(' ') + ' '.repeat(100) } })
  const result = await run(io)
  assert.equal(result.candidates.length, 9)
  assert.equal(io.calls.requests.length, 1)
  assert.equal(result.candidates.every(c => c.source_evidence.length <= 400 && c.source_evidence.includes(c.email) && !c.source_evidence.includes('FAKE')), true)
  assert.equal((await run(researchIo(rows, { transport: { body: 'Acme Company Contact: ' + emails.join(' ') } }))).candidates.length, 10)
  assert.equal((await run(researchIo(rows, { transport: { body: 'Acme Company Contact: ' + emails.join(' ') } }), { limit: 2 })).candidates.length, 2)
})

test('fails closed with candid empty results and no provider key/error disclosure or retries', async () => {
  const missing = researchIo([])
  await assert.rejects(run(missing, { apiKey: '' }), { code: 'EMAIL_RESEARCH_KEY_REQUIRED' })
  assert.equal(missing.calls.provider, undefined)
  const empty = await run(missing, { query: '', product: {} })
  assert.equal(empty.candidates.length, 0)
  assert.equal(missing.calls.provider, undefined)
  for (const provider of [{ status: 'incomplete' }, { refusal: true }, {}]) {
    const result = await run(researchIo([], { provider }))
    assert.deepEqual(result.candidates, [])
    assert.match(result.summary, /No (public business role contact )?candidates/)
  }
  await assert.rejects(run(researchIo([], { provider: { text: '{bad JSON' } })), { code: 'EMAIL_RESEARCH_FORMAT_ERROR' })
  assert.equal((await run(researchIo([row], { transport: { addresses: [{ address: '127.0.0.1', family: 4 }] } }))).candidates.length, 0)
  let count = 0
  await assert.rejects(run({ fetch: async () => { count++; throw new Error('user-server-key provider internals') } }), err => err.code === 'EMAIL_RESEARCH_PROVIDER_ERROR' && !/user-server-key|internals/.test(err.message))
  assert.equal(count, 1)
})

test('scheduled exclusions only forward bounded public business roles and block duplicate source fetches', async () => {
  const io = researchIo([row])
  const result = await run(io, { excludeEmails: ['INFO@acme.com', 'alice@acme.com', 'info@gmail.com', 'info@localhost', 'info@acme.com'] })
  const input = JSON.parse(io.calls.provider.body.input)
  assert.deepEqual(input.excludePublicRoleEmails, ['info@acme.com'])
  assert.deepEqual(result.candidates, [])
  assert.equal(io.calls.requests.length, 0)
  assert.equal(io.calls.provider.body.max_tool_calls, 3)
  const many = Array.from({ length: 150 }, (_, i) => `info@business${i}.com`)
  const bounded = researchIo([])
  await run(bounded, { excludeEmails: many })
  assert.equal(JSON.parse(bounded.calls.provider.body.input).excludePublicRoleEmails.length, 100)
  assert(!bounded.calls.provider.body.input.includes('info@business100.com'))
})

test('exclusion input drops personal, malformed, control-bearing and non-public-domain values without extending requests', async () => {
  const io = researchIo([])
  await run(io, { excludeEmails: [' INFO@acme.com ', 'alice@acme.com', 'info@gmail.com', 'info@service.internal', 'info@service.local', 'info@-invalid.com', 'info@acme.com\nprivate instructions', null, { secret:'never forward' }] })
  const input = JSON.parse(io.calls.provider.body.input)
  assert.deepEqual(input.excludePublicRoleEmails, ['info@acme.com'])
  assert.equal(io.calls.provider.body.max_tool_calls, 3)
  assert.equal(io.calls.provider.body.max_output_tokens, 2400)
  assert.equal(io.calls.requests.length, 0)
  assert(!io.calls.provider.body.input.includes('private instructions'))
  assert(!io.calls.provider.body.input.includes('secret'))
})
