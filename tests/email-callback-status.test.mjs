import test from 'node:test'
import assert from 'node:assert/strict'
import { gmailCallbackFailureNotice } from '../src/lib/gmailCallbackStatus.js'
import { gmailCallbackFailureCode } from '../api/email-gmail.js'

test('callback categorizes only fixed failure codes without echoing private details', () => {
  assert.equal(gmailCallbackFailureCode({ code:'GMAIL_CLIENT_CREDENTIALS_REJECTED', message:'synthetic-secret-detail' }), 'GMAIL_CLIENT_CREDENTIALS_REJECTED')
  for (const value of ['synthetic-secret-detail', '<script>', 'toString', undefined, {}, null]) {
    assert.equal(gmailCallbackFailureCode({ code:value, message:'synthetic-private-details' }), 'GMAIL_SETUP_FAILED')
    assert.deepEqual(gmailCallbackFailureNotice(value), gmailCallbackFailureNotice('GMAIL_SETUP_FAILED'))
  }
})

test('reviewed diagnostics explain failures without claiming Gmail is connected or mail sent', () => {
  for (const code of ['GMAIL_RECONNECT_REQUIRED', 'GMAIL_CLIENT_CREDENTIALS_REJECTED', 'GMAIL_GRANT_REJECTED', 'GMAIL_SEND_PERMISSION_MISSING', 'GMAIL_IDENTITY_UNVERIFIED', 'GMAIL_REFRESH_GRANT_MISSING', 'EMAIL_DATABASE_ERROR']) {
    const notice = gmailCallbackFailureNotice(code)
    assert.equal(notice.code, code)
    assert(notice.message.length > 40)
    assert(!notice.message.includes('synthetic-secret'))
    assert(!notice.message.includes('https://'))
  }
  assert.match(gmailCallbackFailureNotice('GMAIL_CLIENT_CREDENTIALS_REJECTED').message, /client secret belongs/)
  assert.match(gmailCallbackFailureNotice('GMAIL_SEND_PERMISSION_MISSING').message, /send-only/)
})
