import assert from 'node:assert/strict'
import test from 'node:test'
import crypto from 'node:crypto'
import { DAILY_APP_COPY_PROFILES } from '../api/daily-app-copy-profiles.js'
import { resolveDailyAppCopyProfile, dailyAppListingFingerprint, isSafeDailyAppCopyText } from '../api/daily-app-copy.js'

// Synthetic description fixtures reconstruct only reviewed evidence quotes. Their
// fingerprints are confined to injected test registries, never the shipped data.
const fixture = profile => {
  const description = [...new Set(profile.email_angles.flatMap(angle => angle.evidence))].join('\n')
  const product = { id:'11111111-1111-4111-8111-111111111111', name:profile.app_name,
    source_facts:{ appId:profile.apple_app_id, appStoreListing:{ description } } }
  const copy = structuredClone(profile)
  copy.listing_fingerprint = dailyAppListingFingerprint(product)
  return { product, copy, source:{ app_id:profile.apple_app_id } }
}

test('reviewed production registry contains all 25 app identities and 300 feature-specific angles', () => {
  assert.equal(Object.keys(DAILY_APP_COPY_PROFILES).length, 25)
  assert.equal(Object.values(DAILY_APP_COPY_PROFILES).flatMap(profile => profile.email_angles).length, 300)
  assert.equal(new Set(Object.values(DAILY_APP_COPY_PROFILES).map(profile => profile.app_name)).size, 25)
})

for (const [id, profile] of Object.entries(DAILY_APP_COPY_PROFILES)) {
  test(`${profile.app_name}: all reviewed fields pass unchanged runtime gates`, () => {
    assert.equal(profile.apple_app_id, id)
    assert.match(profile.listing_fingerprint, /^[a-f0-9]{64}$/)
    assert.equal(profile.email_angles.length, 12)
    assert.equal(new Set(profile.email_angles.map(angle => angle.subject.toLowerCase())).size, 12)
    const { product, copy, source } = fixture(profile)
    assert.equal(resolveDailyAppCopyProfile(product, source, { [id]:copy }), copy)
    for (const angle of profile.email_angles) {
      assert.ok(isSafeDailyAppCopyText(angle.subject, 180, { appId:id }))
      for (const paragraph of angle.paragraphs) assert.ok(isSafeDailyAppCopyText(paragraph, 1200, { appId:id }))
    }
    assert.equal(resolveDailyAppCopyProfile({ ...product, name:'A completely different app' }, source, { [id]:copy }), null)
    assert.equal(resolveDailyAppCopyProfile(product, { app_id:'99999999999999999999' }, { [id]:copy }), null)
    assert.equal(resolveDailyAppCopyProfile({ ...product, source_facts:{ ...product.source_facts,
      appStoreListing:{ description:'A changed listing must be reviewed again.' } } }, source, { [id]:copy }), null)
    assert.equal(profile.listing_fingerprint.length, crypto.createHash('sha256').update('fixture').digest('hex').length)
  })
}

test('app-specific precautions do not recreate the reported theme contamination', () => {
  const precautions = id => [...DAILY_APP_COPY_PROFILES[id].email_qualifiers, ...DAILY_APP_COPY_PROFILES[id].facebook_qualifiers].join(' ')
  for (const id of ['6780448901','6817971754','6816706003','6779407932','6779000255','6763152727','6812935760','6816477432']) {
    assert.doesNotMatch(precautions(id), /medical advice|financial advice|legal advice|for parents/i, id)
  }
  assert.match(precautions('6780260927'), /extraction|sources/i)
  assert.match(precautions('6780260927'), /not legal advice/i)
  assert.match(precautions('6780622153'), /not financial advice|not financial or investment advice/i)
  assert.match(precautions('6811360117'), /not an emergency service/i)
  assert.match(precautions('6777498249'), /not medical advice/i)
})
