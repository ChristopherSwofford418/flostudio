import test from 'node:test'
import assert from 'node:assert/strict'
import { appStoreAssetsFromFacts, buildAppStoreListingSync, uniqueAppStoreAssetUrls } from '../src/lib/appStoreListing.js'

test('uses the stored App Store Connect production title over public listing text', () => {
  const sync = buildAppStoreListingSync({
    app:{
      id:'product-1',
      name:'Legacy Flo Name',
      product_url:'https://apps.apple.com/us/app/example/id123',
      source_facts:{ currentProductionTitle:'Current App Store Connect Name' },
    },
    details:{
      title:'Public Storefront Name',
      name:'Public Storefront Name',
      image:'https://example.com/icon.png',
      sourceFacts:{ screenshots:['https://example.com/one.png'] },
    },
  })

  assert.equal(sync.displayName, 'Current App Store Connect Name')
  assert.equal(sync.productUpdate.name, 'Current App Store Connect Name')
  assert.equal(sync.screenshotCount, 1)
})

test('keeps portrait and iPad App Store visuals in the usable app media context', () => {
  const facts = {
    screenshots:['https://example.com/phone.png'],
    storeMetadata:{
      screenshots:['https://example.com/phone.png', 'https://example.com/phone-2.png'],
      ipadScreenshots:['https://example.com/ipad.png'],
      appletvScreenshots:['https://example.com/tv.png'],
    },
  }
  assert.deepEqual(appStoreAssetsFromFacts(facts), [
    'https://example.com/phone.png',
    'https://example.com/phone-2.png',
    'https://example.com/ipad.png',
    'https://example.com/tv.png',
  ])
})

test('only retains safe http(s) App Store media URLs', () => {
  assert.deepEqual(uniqueAppStoreAssetUrls([
    'https://example.com/valid.png',
    'https://example.com/valid.png',
    'javascript:alert(1)',
    'ftp://example.com/nope.png',
    'not-a-url',
  ]), ['https://example.com/valid.png'])
})
