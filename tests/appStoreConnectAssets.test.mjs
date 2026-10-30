import assert from 'node:assert/strict'
import test from 'node:test'
import {
  appIsReadyForDistribution,
  assetSelectionKey,
  buildProductionAssetCandidate,
  productionPortfolioDecision,
  selectedProductionAssets,
} from '../api/app-store-connect-assets.js'

const approvedPlacement = {
  id:'placement-1',
  attributes:{ state:'PARENT_APPROVED', mediaType:'IMAGE', placementType:'APP_SCREENSHOT', placementGroup:'IPHONE_67', createdDate:'2026-10-20T00:00:00Z' },
  relationships:{ appStoreVersionLocalization:{ data:{ id:'localization-1', type:'appStoreVersionLocalizations' } } },
}

const approvedImage = {
  id:'image-1',
  attributes:{
    state:'APPROVED', category:'APP_SCREENSHOTS_AND_PREVIEWS', fileName:'store-shot.png', fileSize:1024,
    imageAsset:{ templateUrl:'https://is1-ssl.mzstatic.com/image/thumb/{w}x{h}bb.{f}', width:1290, height:2796 },
  },
}

test('permits only approved assets on parent-approved App Store surfaces', () => {
  const candidate = buildProductionAssetCandidate('image', approvedImage, [approvedPlacement])
  assert.equal(candidate.eligible, true)
  assert.equal(candidate.importable, true)
  assert.match(candidate.imageUrl, /1290x2796bb\.jpg/)
  assert.equal(candidate.placements.length, 1)
  assert.deepEqual(candidate.placements[0], {
    id:'placement-1', mediaType:'IMAGE', placementType:'APP_SCREENSHOT', placementGroup:'IPHONE_67', state:'PARENT_APPROVED', stateDetails:null,
    createdDate:'2026-10-20T00:00:00Z', lastModifiedDate:null, targetSurface:'app_store_version_localization',
  })
})

test('does not expose rejected media or drafts without an approved placement as import candidates', () => {
  assert.equal(buildProductionAssetCandidate('image', { ...approvedImage, attributes:{ ...approvedImage.attributes, state:'REJECTED' } }, [approvedPlacement]).eligible, false)
  assert.equal(buildProductionAssetCandidate('image', approvedImage, [{ ...approvedPlacement, attributes:{ ...approvedPlacement.attributes, state:'PARENT_IN_REVIEW' } }]).eligible, false)
})

test('selects exact asset-plus-placement provenance and never broadens the selection', () => {
  const candidate = buildProductionAssetCandidate('image', approvedImage, [approvedPlacement])
  const key = assetSelectionKey(candidate, 'placement-1')
  assert.equal(selectedProductionAssets([candidate], [key]).length, 1)
  assert.equal(selectedProductionAssets([candidate], ['image:image-1:other-placement']).length, 0)
})

test('marks only Apple ready-for-sale states as production-ready', () => {
  assert.equal(appIsReadyForDistribution([{ attributes:{ appStoreState:'READY_FOR_SALE' } }]), true)
  assert.equal(appIsReadyForDistribution([{ attributes:{ appVersionState:'READY_FOR_DISTRIBUTION' } }]), true)
  assert.equal(appIsReadyForDistribution([{ attributes:{ appStoreState:'REJECTED' } }]), false)
  assert.deepEqual(productionPortfolioDecision({ product:{ appleAppId:'123' }, appleApp:{ id:'123' }, versions:[{ attributes:{ appStoreState:'REJECTED' } }] }), { action:'archive_candidate', reason:'not_ready_for_distribution' })
  assert.deepEqual(productionPortfolioDecision({ product:{}, appleApp:null, versions:[] }), { action:'leave', reason:'no_authoritative_apple_app_id' })
})
