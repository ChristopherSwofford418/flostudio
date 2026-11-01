import assert from 'node:assert/strict'
import test from 'node:test'
import {
  appStoreListingVisualOptions,
  approvedAppStoreConnectVisualOptions,
  referencePayload,
  verifiedProductVisualOptions,
} from '../src/lib/appVisualReferences.js'

const app = {
  source_facts:{
    image:'https://cdn.example.com/app-icon.png',
    screenshots:['https://cdn.example.com/iphone-one.png'],
    storeMetadata:{ ipadScreenshots:['https://cdn.example.com/ipad-one.png'] },
  },
}

test('keeps only registered App Store artwork and screenshots as listing references', () => {
  const options = appStoreListingVisualOptions(app)
  assert.deepEqual(options.map(option => option.url), [
    'https://cdn.example.com/app-icon.png',
    'https://cdn.example.com/iphone-one.png',
    'https://cdn.example.com/ipad-one.png',
  ])
  assert.ok(options.every(option => option.source === 'app_store_listing'))
})

test('permits App Store Connect media only with exact approved import provenance', () => {
  const options = approvedAppStoreConnectVisualOptions([
    { id:'approved', kind:'image', source:'app_store_connect_import', asset_url:'https://cdn.example.com/approved.png', asc_asset_id:'apple-image', asc_placement_id:'apple-placement' },
    { id:'upload', kind:'image', source:'upload', asset_url:'https://cdn.example.com/upload.png', asc_asset_id:null, asc_placement_id:null },
    { id:'ai', kind:'image', source:'ai_image', asset_url:'https://cdn.example.com/ai.png', asc_asset_id:null, asc_placement_id:null },
    { id:'unproven', kind:'image', source:'app_store_connect_import', asset_url:'https://cdn.example.com/unproven.png', asc_asset_id:'apple-image', asc_placement_id:null },
  ])
  assert.deepEqual(options, [{ id:'approved', source:'app_store_connect_import', url:'https://cdn.example.com/approved.png', name:'Apple-approved App Store Connect media' }])
})

test('constructs a server-verifiable descriptor and never submits browser-only uploads or AI images', () => {
  const options = verifiedProductVisualOptions({ app, imageAssets:[
    { id:'approved', kind:'image', source:'app_store_connect_import', asset_url:'https://cdn.example.com/approved.png', asc_asset_id:'apple-image', asc_placement_id:'apple-placement' },
    { id:'random-upload', kind:'image', source:'upload', asset_url:'https://cdn.example.com/random.png' },
  ] })
  assert.deepEqual(referencePayload(options[0]), { source:'app_store_connect_import', mediaAssetId:'approved' })
  assert.deepEqual(referencePayload(options[1]), { source:'app_store_listing', url:'https://cdn.example.com/app-icon.png' })
  assert.equal(referencePayload({ id:'random-upload', source:'upload', url:'https://cdn.example.com/random.png' }), null)
  assert.equal(referencePayload({ id:'ai', source:'ai_image', url:'https://cdn.example.com/ai.png' }), null)
})
