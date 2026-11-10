import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { emailDeploymentStatus } from '../api/email-core.js'

const keys = ['GOOGLE_EMAIL_CLIENT_ID', 'GOOGLE_EMAIL_CLIENT_SECRET', 'GOOGLE_EMAIL_REDIRECT_URI', 'EMAIL_CREDENTIALS_ENCRYPTION_KEY', 'ASC_CREDENTIALS_ENCRYPTION_KEY', 'OPENAI_PROVIDER_VAULT_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_EMAIL_TEXT_MODEL', 'OPENAI_TEXT_MODEL', 'EMAIL_CRON_ENABLED', 'EMAIL_LIVE_SENDING_ENABLED', 'CRON_SECRET']
function withConfig(values, check) {
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  try {
    for (const key of keys) delete process.env[key]
    Object.assign(process.env, values)
    check()
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  }
}
const oauth = { GOOGLE_EMAIL_CLIENT_ID: 'dummy-client', GOOGLE_EMAIL_CLIENT_SECRET: 'dummy-client-secret', GOOGLE_EMAIL_REDIRECT_URI: 'https://www.flostudio.io/api/email-gmail' }

test('readiness rejects invalid OAuth redirects without exposing any credential', () => {
  for (const redirect of ['', 'not-a-url', 'http://example.test/callback', 'https://user:password@example.test/callback', 'https://example.test/callback#fragment']) {
    withConfig({ ...oauth, GOOGLE_EMAIL_REDIRECT_URI: redirect }, () => {
      assert.equal(emailDeploymentStatus().gmailConfigured, false)
    })
  }
  withConfig(oauth, () => {
    const status = emailDeploymentStatus()
    assert.equal(status.gmailConfigured, true)
    assert.equal(status.vaultConfigured, false)
    assert.equal(status.workerStorageConfigured, false)
    assert.equal(status.sendingEnabled, false)
    assert.equal(status.cronConfigured, false)
    assert(!JSON.stringify(status).includes('dummy-client'))
  })
})

test('readiness reports stable vault roots and explicit drafting configuration separately', () => {
  for (const root of ['EMAIL_CREDENTIALS_ENCRYPTION_KEY', 'ASC_CREDENTIALS_ENCRYPTION_KEY', 'OPENAI_PROVIDER_VAULT_KEY']) {
    withConfig({ [root]: 'dummy-vault', OPENAI_EMAIL_TEXT_MODEL: 'dummy-model' }, () => {
      assert.equal(emailDeploymentStatus().vaultConfigured, true)
      assert.equal(emailDeploymentStatus().draftingModelConfigured, true)
      assert.equal(emailDeploymentStatus().sendingEnabled, false)
    })
  }
  withConfig({ OPENAI_EMAIL_TEXT_MODEL: '   ' }, () => assert.equal(emailDeploymentStatus().draftingModelConfigured, false))
  withConfig({ OPENAI_TEXT_MODEL: 'dummy-model' }, () => assert.equal(emailDeploymentStatus().draftingModelConfigured, true))
})

test('campaign readiness surfaces missing vault and drafting model as blockers', () => {
  const source = readFileSync(new URL('../api/email-campaigns.js', import.meta.url), 'utf8')
  assert.match(source, /if\(!readiness\.vaultConfigured\) readiness\.blockers\.push\(/)
  assert.match(source, /if\(!readiness\.draftingModelConfigured\) readiness\.blockers\.push\(/)
})
