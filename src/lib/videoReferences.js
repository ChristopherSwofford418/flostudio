export function buildVideoSourceOptions({ appStoreScreenshots = [], imageAssets = [] } = {}) {
  const approvedAppleMedia = imageAssets
    .filter(asset => asset?.kind === 'image' && asset?.source === 'app_store_connect_import' && asset?.asc_asset_id && asset?.asc_placement_id && asset?.asset_url)
    .map(asset => ({ id:asset.id || null, url:asset.asset_url, name:asset.name || 'Apple-approved App Store Connect media', source:'app_store_connect_import' }))
  const storeImages = appStoreScreenshots
    .filter(Boolean)
    .map((url, index) => ({ id:null, url, name:`App Store image ${index + 1}`, source:'app_store_listing' }))
  return [...approvedAppleMedia, ...storeImages].filter((asset, index, all) => all.findIndex(item => item.url === asset.url) === index)
}

export function resolvedVideoReference(source) {
  return source?.url || null
}
