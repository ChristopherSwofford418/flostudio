import { appStoreAssetsFromFacts } from './appStoreListing.js'

const cleanUrl = value => {
  try {
    const url = new URL(String(value || '').trim())
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''
  } catch {
    return ''
  }
}

export function appStoreListingVisualOptions(app = {}) {
  const facts = app.source_facts || app.sourceFacts || {}
  const urls = appStoreAssetsFromFacts({ ...facts, screenshots:facts.screenshots || app.screenshots || [] })
  const icon = cleanUrl(facts.image || facts.artworkUrl || app.image_url || app.imageUrl)
  const all = icon && !urls.includes(icon) ? [icon, ...urls] : urls
  return all.map((url, index) => ({
    id:`listing-${index + 1}`,
    source:'app_store_listing',
    url,
    name:index === 0 && icon === url ? 'App Store artwork' : `App Store visual ${index + 1}`,
  }))
}

export function approvedAppStoreConnectVisualOptions(imageAssets = []) {
  return imageAssets
    .filter(asset => asset?.kind === 'image' && asset?.source === 'app_store_connect_import' && asset?.id && asset?.asset_url)
    .filter(asset => asset?.asc_asset_id && asset?.asc_placement_id)
    .map(asset => ({
      id:asset.id,
      source:'app_store_connect_import',
      url:asset.asset_url,
      name:asset.name || 'Apple-approved App Store Connect media',
    }))
}

export function verifiedProductVisualOptions({ app = {}, imageAssets = [] } = {}) {
  const seen = new Set()
  return [...approvedAppStoreConnectVisualOptions(imageAssets), ...appStoreListingVisualOptions(app)]
    .filter(reference => {
      if (!reference.url || seen.has(reference.url)) return false
      seen.add(reference.url)
      return true
    })
}

export function referencePayload(reference = null) {
  if (!reference?.source || !reference?.url) return null
  if (reference.source === 'app_store_listing') return { source:'app_store_listing', url:reference.url }
  if (reference.source === 'app_store_connect_import' && reference.id) return { source:'app_store_connect_import', mediaAssetId:reference.id }
  return null
}
