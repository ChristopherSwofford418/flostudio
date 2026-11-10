import crypto from 'node:crypto'
import { emailLocalClock } from './email-core.js'
const ANGLES = [
  'A concise feature spotlight grounded in one listed capability.',
  'A practical workflow overview using only listed app steps.',
  'One everyday organization challenge the listing explicitly addresses.',
  'A calm introductory overview of the app and its limitations.',
  'A short problem-to-feature explanation with no promised outcomes.',
  'A factual explanation of when an adult might choose this app.',
  'A concise getting-started overview with no invented UI steps.',
  'A transparency-first overview of what the app does and does not do.',
  'A brief useful-capability comparison without naming competitors.',
  'A focused description of the app’s listed information-organizing tools.',
  'A concise reminder of the app’s actual supported use case.',
  'A short feature-to-workflow connection with no made-up results.',
]
export function emailCopyFingerprint(subject,body) {
  const normalize=v=>String(v || '').normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase()
  return crypto.createHash('sha256').update(`${normalize(subject)}\n${normalize(body)}`).digest('hex')
}
export function emailDailyCreativePlan(product,campaign,now=new Date()) {
  const day=emailLocalClock(campaign.timezone || 'UTC',now).day
  const seed=crypto.createHash('sha256').update(String(product.id || product.name || '')).digest().readUInt32BE(0)
  const dayIndex=Math.floor(Date.parse(`${day}T00:00:00Z`)/86400000)
  return {day,angle:ANGLES[(seed+dayIndex)%ANGLES.length],instructions:'Write a new advertisement for this local day. Do not reuse prior subject/body wording, imply a previous relationship, say follow-up, or claim the recipient has used the app. New wording is not permission to email a public contact.'}
}
export function uniqueEmailDrafts(drafts,previous=[]) {
  const seen=new Set(previous.map(d=>emailCopyFingerprint(d.subject,d.body)))
  return drafts.filter(d=>{const fingerprint=emailCopyFingerprint(d.subject,d.body);if(seen.has(fingerprint))return false;seen.add(fingerprint);return true})
}
