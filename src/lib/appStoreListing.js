const asText = value => String(value || '').trim()

const validHttpUrl = value => {
  try {
    const url = new URL(asText(value))
    return ['http:', 'https:'].includes(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}

export function uniqueAppStoreAssetUrls(...groups) {
  const seen = new Set()
  const urls = []
  for (const group of groups) {
    for (const value of Array.isArray(group) ? group : []) {
      const url = validHttpUrl(value)
      if (url && !seen.has(url)) {
        seen.add(url)
        urls.push(url)
      }
    }
  }
  return urls
}

export function appStoreAssetsFromFacts(facts = {}) {
  const metadata = facts.storeMetadata || facts.store_metadata || {}
  return uniqueAppStoreAssetUrls(
    facts.screenshots,
    facts.screenshotUrls,
    metadata.screenshots,
    metadata.ipadScreenshots,
    metadata.appletvScreenshots,
  )
}

export function buildAppStoreListingSync({ app = {}, details = {}, syncedAt = new Date().toISOString() } = {}) {
  const facts = app.source_facts || app.sourceFacts || {}
  const incomingFacts = details.sourceFacts || {}
  const incomingMetadata = incomingFacts.storeMetadata || {}
  const storeMetadata = { ...(facts.storeMetadata || {}), ...incomingMetadata }
  const screenshots = uniqueAppStoreAssetUrls(
    incomingFacts.screenshots,
    incomingFacts.screenshotUrls,
    incomingMetadata.screenshots,
    incomingMetadata.ipadScreenshots,
    incomingMetadata.appletvScreenshots,
    facts.screenshots,
    facts.screenshotUrls,
    facts.storeMetadata?.screenshots,
    facts.storeMetadata?.ipadScreenshots,
    facts.storeMetadata?.appletvScreenshots,
  )
  // The production title recorded from the authenticated App Store Connect catalog
  // takes precedence over the public listing response. The latter fills in public
  // copy and visuals, while the ASC catalog remains the naming source of truth.
  const title = asText(facts.currentProductionTitle || details.title || details.name || storeMetadata.trackName || app.name)
  const description = asText(details.description || app.description)
  const image = validHttpUrl(details.image || incomingFacts.image || storeMetadata.artworkUrl512 || storeMetadata.artworkUrl100 || facts.image || facts.artworkUrl)
  const listingUrl = validHttpUrl(details.url || incomingFacts.sourceUrl || storeMetadata.trackUrl || app.product_url || app.url)
  const releaseNotes = asText(incomingFacts.releaseNotes || facts.releaseNotes || storeMetadata.releaseNotes)
  const sourceFacts = {
    ...facts,
    ...incomingFacts,
    sourceType:details.sourceType || facts.sourceType || 'apple',
    source:details.source || facts.source || 'Apple App Store',
    image:image || facts.image || facts.artworkUrl || '',
    screenshots,
    storeMetadata:{ ...storeMetadata, screenshots:uniqueAppStoreAssetUrls(storeMetadata.screenshots, storeMetadata.ipadScreenshots, storeMetadata.appletvScreenshots) },
    appStoreListing:{
      title,
      description,
      releaseNotes,
      sourceUrl:listingUrl,
      syncedAt,
    },
    appStoreListingSyncedAt:syncedAt,
    learnedAt:syncedAt,
  }

  return {
    displayName:title || asText(app.name),
    sourceFacts,
    productUpdate:{
      name:title || asText(app.name),
      product_url:listingUrl || app.product_url || app.url || null,
      description,
      offer_text:asText(details.offerText || app.offer_text || app.offerText),
      audience:asText(details.audience || app.audience),
      source_facts:sourceFacts,
    },
    screenshotCount:screenshots.length,
    hasArtwork:Boolean(sourceFacts.image),
  }
}
