import test from 'node:test'
import assert from 'node:assert/strict'
import { isSafeResearchUrl, normalizeFacebookGroupUrl, sortFacebookGroupDiscoveries } from '../src/lib/facebookGroupResearch.js'

test('normalizes only direct Facebook Group links and removes tracking parameters', () => {
  assert.equal(normalizeFacebookGroupUrl('https://facebook.com/groups/StudyTips/?mibextid=abc'), 'https://www.facebook.com/groups/StudyTips/')
  assert.equal(normalizeFacebookGroupUrl('https://www.facebook.com/sometopic'), '')
  assert.equal(normalizeFacebookGroupUrl('https://www.facebook.com/groups/'), '')
  assert.equal(normalizeFacebookGroupUrl('https://user:pass@facebook.com/groups/example'), '')
})

test('accepts only source-safe http(s) research evidence URLs', () => {
  assert.equal(isSafeResearchUrl('https://www.facebook.com/groups/example/'), true)
  assert.equal(isSafeResearchUrl('https://example.org/community-list'), true)
  assert.equal(isSafeResearchUrl('javascript:alert(1)'), false)
  assert.equal(isSafeResearchUrl('https://user:pass@example.org'), false)
})

test('shows only current app source-linked group records in rank order and caps at twenty', () => {
  const rows = [
    { rank:2, group_url:'https://www.facebook.com/groups/two/', source_url:'https://example.org/two', research_status:'source_linked' },
    { rank:1, group_url:'https://www.facebook.com/groups/one/', source_url:'https://example.org/one', research_status:'source_linked' },
    { rank:3, group_url:'https://www.facebook.com/pages/not-a-group', source_url:'https://example.org/bad', research_status:'source_linked' },
    { rank:4, group_url:'https://www.facebook.com/groups/archived/', source_url:'https://example.org/archived', research_status:'archived' },
  ]
  const sorted = sortFacebookGroupDiscoveries(rows)
  assert.deepEqual(sorted.map(row => row.rank), [1, 2])
})
