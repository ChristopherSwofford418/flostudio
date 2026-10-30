export const ASC_APPROVED_ASSET_STATE = 'APPROVED'
export const ASC_PRODUCTION_PLACEMENT_STATE = 'PARENT_APPROVED'
export const MAX_APP_STORE_IMPORT_BYTES = 25 * 1024 * 1024

export function compactPlacement(placement = {}) {
  const attributes = placement.attributes || {}
  const relationships = placement.relationships || {}
  return {
    id: placement.id || null,
    mediaType: attributes.mediaType || null,
    placementType: attributes.placementType || null,
    placementGroup: attributes.placementGroup || null,
    state: attributes.state || null,
    stateDetails: attributes.stateDetails || null,
    createdDate: attributes.createdDate || null,
    lastModifiedDate: attributes.lastModifiedDate || null,
    targetSurface: relationships.appStoreVersionLocalization?.data ? 'app_store_version_localization'
      : relationships.appCustomProductPageLocalization?.data ? 'custom_product_page_localization'
        : relationships.appStoreVersionExperimentTreatment?.data ? 'app_store_version_experiment_treatment'
          : relationships.appEventLocalization?.data ? 'app_event_localization'
            : 'unknown',
  }
}

export function productionPlacements(placements = []) {
  return placements
    .filter(placement => placement?.attributes?.state === ASC_PRODUCTION_PLACEMENT_STATE)
    .map(compactPlacement)
    .filter(placement => Boolean(placement.id))
}

export function resolveAppleImageUrl(imageAsset = {}) {
  const templateUrl = String(imageAsset?.templateUrl || '').trim()
  const width = Number(imageAsset?.width)
  const height = Number(imageAsset?.height)
  if (!templateUrl || !Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null
  try {
    const url = new URL(templateUrl)
    if (url.protocol !== 'https:') return null
    return templateUrl
      .replaceAll('{w}', String(Math.round(width)))
      .replaceAll('{h}', String(Math.round(height)))
      .replaceAll('{f}', 'jpg')
  } catch {
    return null
  }
}

export function resolveAppleVideoUrl(videoAsset) {
  const candidate = typeof videoAsset === 'string' ? videoAsset : videoAsset?.url || videoAsset?.downloadUrl || ''
  try {
    const url = new URL(String(candidate || '').trim())
    return url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

function compactAsset(kind, asset = {}, placements = []) {
  const attributes = asset.attributes || {}
  const imageUrl = kind === 'image' ? resolveAppleImageUrl(attributes.imageAsset) : null
  const videoUrl = kind === 'video' ? resolveAppleVideoUrl(attributes.videoAsset) : null
  const previewFrame = attributes.previewFrameImage?.image || attributes.previewFrameImage || null
  const previewUrl = kind === 'video' ? resolveAppleImageUrl(previewFrame) : null
  const approvedPlacements = productionPlacements(placements)
  const fileSize = Number(attributes.fileSize)
  const downloadUrl = kind === 'image' ? imageUrl : videoUrl
  return {
    id: asset.id || null,
    kind,
    type: asset.type || (kind === 'image' ? 'appAssetLibraryImages' : 'appAssetLibraryVideos'),
    state: attributes.state || null,
    category: attributes.category || null,
    fileName: attributes.fileName || null,
    fileSize: Number.isFinite(fileSize) ? fileSize : null,
    referenceName: attributes.referenceName || null,
    specId: attributes.specId || null,
    createdDate: attributes.createdDate || null,
    lastModifiedDate: attributes.lastModifiedDate || null,
    imageUrl,
    videoUrl,
    previewUrl,
    previewFrameTimeCode: attributes.previewFrameTimeCode || null,
    placements: approvedPlacements,
    eligible: Boolean(asset.id && attributes.state === ASC_APPROVED_ASSET_STATE && approvedPlacements.length && downloadUrl),
    importable: Boolean(asset.id && attributes.state === ASC_APPROVED_ASSET_STATE && approvedPlacements.length && downloadUrl && (!Number.isFinite(fileSize) || fileSize <= MAX_APP_STORE_IMPORT_BYTES)),
    importBlocker: !asset.id ? 'missing_asset_id'
      : attributes.state !== ASC_APPROVED_ASSET_STATE ? 'asset_not_approved'
        : !approvedPlacements.length ? 'not_on_an_approved_surface'
          : !downloadUrl ? 'Apple did not return a downloadable or rendered media URL.'
            : Number.isFinite(fileSize) && fileSize > MAX_APP_STORE_IMPORT_BYTES ? `File exceeds FloStudio’s ${Math.round(MAX_APP_STORE_IMPORT_BYTES / 1024 / 1024)} MB library limit.`
              : null,
  }
}

export function buildProductionAssetCandidate(kind, asset, placements = []) {
  return compactAsset(kind === 'video' ? 'video' : 'image', asset, placements)
}

export function buildProductionAssetCandidates({ images = [], videos = [], placementsByAssetId = {} } = {}) {
  return [
    ...images.map(asset => compactAsset('image', asset, placementsByAssetId[asset.id] || [])),
    ...videos.map(asset => compactAsset('video', asset, placementsByAssetId[asset.id] || [])),
  ].filter(candidate => candidate.eligible)
}

export function assetSelectionKey(candidate, placementId) {
  return `${candidate?.kind || 'image'}:${candidate?.id || ''}:${placementId || ''}`
}

export function selectedProductionAssets(candidates = [], selectedKeys = []) {
  const selected = new Set((selectedKeys || []).map(value => String(value)))
  return candidates.flatMap(candidate => (candidate.placements || [])
    .filter(placement => selected.has(assetSelectionKey(candidate, placement.id)))
    .map(placement => ({ ...candidate, placement })))
}

export function appIsReadyForDistribution(versions = []) {
  return (versions || []).some(version => {
    const attributes = version?.attributes || version || {}
    return attributes.appStoreState === 'READY_FOR_SALE'
      || attributes.appVersionState === 'READY_FOR_DISTRIBUTION'
  })
}

export function normalizeAppNameForMatch(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function productionPortfolioDecision({ product = {}, appleApp = null, versions = [] } = {}) {
  const appleId = String(product.appleAppId || '').trim()
  if (!appleId) return { action:'leave', reason:'no_authoritative_apple_app_id' }
  if (!appleApp) return { action:'leave', reason:'apple_app_not_found_in_current_catalog' }
  const isReady = appIsReadyForDistribution(versions)
  if (isReady) return { action:'keep', reason:'ready_for_distribution' }
  return { action:'archive_candidate', reason:'not_ready_for_distribution' }
}
