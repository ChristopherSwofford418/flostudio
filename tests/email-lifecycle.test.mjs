import test from 'node:test'
import assert from 'node:assert/strict'
import { getEmailCampaignReadiness, activateEmailCampaign } from '../api/email-lifecycle.js'

const args = { workspaceId: 'workspace-test', productId: 'product-test', campaignId: 'campaign-test', accessToken: 'synthetic-human-jwt', reviewRevision: 'a'.repeat(64) }
async function mocked(payload, operation, assertRequest = () => {}) {
  const previous = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    assert.equal(options.headers.Authorization, 'Bearer synthetic-human-jwt')
    assertRequest(url, JSON.parse(options.body))
    return new Response(JSON.stringify(payload), { status: 200 })
  }
  try { return await operation(calls) } finally { globalThis.fetch = previous }
}

test('readiness uses human JWT, authoritative counts and a bounded metadata whitelist', async () => {
  const payload = {
    allowed: true, code: 'EMAIL_READY', reviewRevision: args.reviewRevision,
    counts: { optedIn: 1200, approvedDrafts: 1100, eligibleRecipients: 1050, secret: 'never' },
    eligibleRecipients: Array.from({ length: 120 }, (_, i) => ({ id: `contact-${i}`, email: `person${i}@example.test`, organization: 'Synthetic', draftId: `draft-${i}`, subject: 'Reviewed subject', body: 'Reviewed body', encrypted_credentials: 'never' })),
    deliveryGates: { productActive: true, senderConfigured: true, accountEnabled: false, token: 'never' },
    deliveryPauseReason: 'provider_rejected', encrypted_credentials: 'never', account_key: 'never',
  }
  await mocked(payload, async calls => {
    const result = await getEmailCampaignReadiness(args)
    assert.equal(calls.length, 1)
    assert.equal(result.allowed, true)
    assert.deepEqual(result.counts, { optedIn: 1200, approvedDrafts: 1100, eligibleRecipients: 1050 })
    assert.equal(result.eligibleRecipients.length, 100)
    assert.deepEqual(result.eligibleRecipients[0], { id: 'contact-0', email: 'person0@example.test', organization: 'Synthetic', draftId: 'draft-0', subject: 'Reviewed subject', body: 'Reviewed body' })
    assert.equal(result.deliveryPauseReason, 'provider_rejected')
    assert.deepEqual(result.blockers, [])
    assert.doesNotMatch(JSON.stringify(result), /never|account_key|encrypted_credentials|token/)
  }, (url, body) => {
    assert.match(url, /\/rpc\/email_campaign_readiness$/)
    assert.deepEqual(body, { p_workspace_id: args.workspaceId, p_product_id: args.productId })
  })
})

test('zero eligibility retains review revision and safe actionable blockers', async () => {
  await mocked({ allowed: false, code: 'EMAIL_NO_ELIGIBLE_RECIPIENTS', reviewRevision: args.reviewRevision, counts: { optedIn: 2, approvedDrafts: 0, eligibleRecipients: 0 }, eligibleRecipients: [], deliveryPauseReason: 'raw SMTP detail' }, async () => {
    const result = await getEmailCampaignReadiness(args)
    assert.equal(result.allowed, false)
    assert.equal(result.reviewRevision, args.reviewRevision)
    assert.equal(result.deliveryPauseReason, null)
    assert.match(result.blockers[0], /No remaining eligible recipients/)
  })
})

test('activation is one JWT transactional RPC, never preliminary table writes', async () => {
  await mocked({ allowed: true, code: 'EMAIL_CAMPAIGN_ACTIVATED', status: 'approved', account_key: 'never' }, async calls => {
    assert.deepEqual(await activateEmailCampaign(args), { allowed: true, code: 'EMAIL_CAMPAIGN_ACTIVATED', status: 'approved' })
    assert.equal(calls.length, 1)
  }, (url, body) => {
    assert.match(url, /\/rpc\/email_activate_campaign$/)
    assert.deepEqual(body, { p_workspace_id: args.workspaceId, p_product_id: args.productId, p_campaign_id: args.campaignId, p_review_revision: args.reviewRevision })
  })
})

test('known activation blockers map to safe 409 errors; raw details and unknown codes never escape', async () => {
  for (const code of ['EMAIL_REVIEW_STALE', 'EMAIL_NO_ELIGIBLE_RECIPIENTS', 'GMAIL_CONNECTION_REQUIRED', 'EMAIL_APP_ARCHIVED', 'SMTP password=never']) {
    await mocked({ allowed: false, code, status: 'blocked', message: 'credential detail never' }, () => assert.rejects(activateEmailCampaign(args), error => {
      assert.equal(error.status, 409)
      assert.equal(error.code, code.startsWith('SMTP') ? 'EMAIL_LAUNCH_BLOCKED' : code)
      assert.doesNotMatch(error.message, /credential detail|password=|never/)
      return true
    }))
  }
})

test('missing sessions and missing/invalid review fingerprints fail before any network operation', async () => {
  const previous = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('No network calls permitted') }
  try {
    for (const fn of [getEmailCampaignReadiness, activateEmailCampaign]) await assert.rejects(fn({ ...args, accessToken: '' }), error => error.status === 401)
    for (const value of [null, '', 'timestamp', 'a'.repeat(63), 'g'.repeat(64)]) await assert.rejects(activateEmailCampaign({ ...args, reviewRevision: value }), error => error.status === 409 && error.code === 'EMAIL_REVIEW_STALE')
  } finally { globalThis.fetch = previous }
})

test('malformed readiness cannot claim server approval or return unsanitized metadata', async () => {
  await mocked({ allowed: true, code: 'EMAIL_READY', reviewRevision: 'timestamp', counts: { optedIn: -1, approvedDrafts: '100', eligibleRecipients: 1.5 }, eligibleRecipients: 'not-an-array', deliveryPauseReason: 'token-never' }, async () => {
    const result = await getEmailCampaignReadiness(args)
    assert.equal(result.allowed, false)
    assert.equal(result.reviewRevision, null)
    assert.deepEqual(result.counts, { optedIn: 0, approvedDrafts: 0, eligibleRecipients: 0 })
    assert.deepEqual(result.eligibleRecipients, [])
    assert.equal(result.deliveryPauseReason, null)
  })
})
