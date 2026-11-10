import test from 'node:test'
import assert from 'node:assert/strict'
import {emailDailyCreativePlan,emailCopyFingerprint,uniqueEmailDrafts} from '../api/email-content-plan.js'
test('daily creative plans rotate by local day and remain deterministic',()=>{
 const app={id:'app-one'},campaign={timezone:'America/New_York'}
 const first=emailDailyCreativePlan(app,campaign,new Date('2026-11-09T15:00:00Z'))
 const repeat=emailDailyCreativePlan(app,campaign,new Date('2026-11-09T16:00:00Z'))
 const next=emailDailyCreativePlan(app,campaign,new Date('2026-11-10T15:00:00Z'))
 assert.deepEqual(first,repeat);assert.notEqual(first.angle,next.angle)
 assert.match(first.instructions,/not permission/)
})
test('copy fingerprint normalizes cosmetic edits and rejects previous or same-batch copies',()=>{
 assert.equal(emailCopyFingerprint(' Explore App ','Useful   capability'),emailCopyFingerprint('explore app','Useful capability'))
 const old={subject:'Explore app',body:'Useful capability'}
 const fresh={subject:'An actual workflow',body:'A new fact-grounded explanation'}
 assert.deepEqual(uniqueEmailDrafts([{...old},{...fresh},{...fresh}],[old]),[fresh])
})
