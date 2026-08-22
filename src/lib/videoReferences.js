export function buildVideoSourceOptions({ appStoreScreenshots = [], imageAssets = [] } = {}) {
  const savedImages = imageAssets
    .filter(asset => asset?.kind === 'image' && asset?.url)
    .map(asset => ({ id:asset.id || null, url:asset.url, name:asset.name || 'Saved image creative', source:'saved_image' }))
  const storeImages = appStoreScreenshots
    .filter(Boolean)
    .map((url, index) => ({ id:null, url, name:`App Store image ${index + 1}`, source:'app_store' }))
  return [...savedImages, ...storeImages].filter((asset, index, all) => all.findIndex(item => item.url === asset.url) === index)
}

export function resolvedVideoReference(source, fallbackReference = null) {
  return source?.url || fallbackReference || null
}
