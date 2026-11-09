import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeEmail, emailSchedule, isEmailCampaignDue, emailLocalClock, encryptEmailCredential, decryptEmailCredential, emailMessage, emailHttpsUrl, safeEmailSecretEqual } from '../api/email-core.js'

test('email validation rejects header injection and multiple recipients', () => {
  assert.equal(normalizeEmail(' TEST@Example.com '), 'test@example.com')
  for (const value of ['a@example.com\r\nBcc: x@example.com','a@example.com,b@example.com','a@localhost','<a@example.com>']) assert.throws(() => normalizeEmail(value))
})
test('app daily limit and IANA timezone are validated', () => {
  assert.equal(emailSchedule({}).daily_limit,100)
  for (const input of [{daily_limit:101},{daily_limit:0},{send_hour:24},{send_minute:60},{timezone:'invalid/zone'}]) assert.throws(() => emailSchedule(input))
})
test('daily due time uses the campaign timezone and approval', () => {
  const campaign={state:'approved',timezone:'America/New_York',send_hour:9,send_minute:0}
  assert.equal(isEmailCampaignDue(campaign,new Date('2026-11-09T13:59:00Z')),false)
  assert.equal(isEmailCampaignDue(campaign,new Date('2026-11-09T14:00:00Z')),true)
  assert.equal(isEmailCampaignDue({...campaign,state:'paused'},new Date('2026-11-09T14:00:00Z')),false)
  assert.equal(emailLocalClock('Asia/Tokyo',new Date('2026-11-09T23:00:00Z')).day,'2026-11-10')
})
test('credential encryption is bound to exact workspace and hides plaintext', () => {
  process.env.EMAIL_CREDENTIALS_ENCRYPTION_KEY='test-only-not-a-real-secret'
  const sealed=encryptEmailCredential({refresh_token:'test-refresh'},'workspace-a')
  assert(!JSON.stringify(sealed).includes('test-refresh'))
  assert.equal(decryptEmailCredential(sealed,'workspace-a').refresh_token,'test-refresh')
  assert.throws(()=>decryptEmailCredential(sealed,'workspace-b'))
  delete process.env.EMAIL_CREDENTIALS_ENCRYPTION_KEY
})
test('message contains single recipient, exact app link and one-click unsubscribe', () => {
  const m=emailMessage({senderEmail:'sender@example.com',senderName:'Studio',recipient:'reader@example.com',subject:'A useful app',body:'Approved app features.',adLink:'https://apps.apple.com/us/app/example/id123',postalAddress:'Example Company, 100 Example Street',unsubscribeToken:'a'.repeat(43),messageId:'test-id'})
  const raw=Buffer.from(m.raw,'base64url').toString()
  assert(raw.includes('To: <reader@example.com>'))
  assert(!raw.includes('Bcc:'))
  assert(raw.includes('List-Unsubscribe-Post: List-Unsubscribe=One-Click'))
  assert(m.text.includes('Advertisement from Studio'))
  assert(m.text.includes('https://apps.apple.com/us/app/example/id123'))
  assert(m.text.includes('Unsubscribe: https://www.flostudio.io/api/email-unsubscribe?token='))
})
test('campaign links must be HTTPS public domain URLs', () => {
  for(const url of ['http://example.com','https://localhost/x','https://127.0.0.1','https://a:b@example.com','https://example.com:22','https://[::1]']) assert.equal(emailHttpsUrl(url),'')
  assert.equal(emailHttpsUrl('https://apps.apple.com/us/app/x/id123'),'https://apps.apple.com/us/app/x/id123')
})
test('secret equality is constant time for valid equal-length inputs',()=>{
  assert(safeEmailSecretEqual('sample','sample'))
  assert(!safeEmailSecretEqual('sample','samplf'))
  assert(!safeEmailSecretEqual('',''))
})
