import { supabase } from '../supabase'

async function appStoreConnectRequest(payload) {
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData?.session?.access_token
  if (!accessToken) throw new Error('Sign in again before refreshing App Store Connect data.')

  const response = await fetch('/api/app-store-connect', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${accessToken}` },
    body:JSON.stringify(payload),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'FloStudio could not refresh App Store Connect data.')
  return data
}

function existingFacts(app) {
  return app?.source_facts || app?.sourceFacts || {}
}

export async function refreshPublicAppStoreProfile(app) {
  const url = String(app?.product_url || app?.url || existingFacts(app).sourceUrl || '').trim()
  if (!url) return { status:'skipped', reason:'No App Store or product URL is saved for this app.' }

  const response = await fetch('/api/ingest-product', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify({ url, enrichOnly:true }),
  })
  const details = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(details.error || 'FloStudio could not refresh the public listing.')

  const facts = existingFacts(app)
  const incomingFacts = details.sourceFacts || {}
  const sourceFacts = {
    ...facts,
    ...incomingFacts,
    sourceType:details.sourceType || facts.sourceType || '',
    source:details.source || facts.source || '',
    image:details.image || facts.image || facts.artworkUrl || '',
    screenshots:incomingFacts.screenshots?.length ? incomingFacts.screenshots : (facts.screenshots || facts.screenshotUrls || []),
    storeMetadata:{ ...(facts.storeMetadata || {}), ...(incomingFacts.storeMetadata || {}) },
    learnedAt:new Date().toISOString(),
  }

  const { error } = await supabase.from('products').update({
    name:details.name || details.title || app.name,
    product_url:details.url || url,
    description:details.description || app.description || '',
    offer_text:details.offerText || app.offer_text || '',
    audience:details.audience || app.audience || '',
    source_facts:sourceFacts,
  }).eq('id', app.id)
  if (error) throw error
  return {
    status:'refreshed',
    source:details.source || 'Public listing',
    hasArtwork:Boolean(sourceFacts.image),
    screenshotCount:sourceFacts.screenshots.length,
  }
}

export async function refreshAppStoreConnectProfile(app) {
  const status = await appStoreConnectRequest({ action:'status', productId:app.id })
  if (status.connection?.status !== 'connected') {
    return { status:'not_connected', reason:'No secure App Store Connect key is connected for this app.' }
  }
  const sync = await appStoreConnectRequest({ action:'sync', productId:app.id })
  return {
    status:'refreshed',
    catalogName:sync.metrics?.catalog?.name || app.name,
    syncedAt:sync.syncedAt || new Date().toISOString(),
  }
}

export async function refreshPortfolioAppIntelligence({ apps, onProgress }) {
  const results = []
  for (const app of apps) {
    const result = { appId:app.id, name:app.name, publicListing:null, appStoreConnect:null, errors:[] }
    onProgress?.({ phase:'public', app, completed:results.length, total:apps.length })
    try {
      result.publicListing = await refreshPublicAppStoreProfile(app)
    } catch (error) {
      result.errors.push(`Public listing: ${error.message || 'refresh failed'}`)
    }

    onProgress?.({ phase:'private', app, completed:results.length, total:apps.length })
    try {
      result.appStoreConnect = await refreshAppStoreConnectProfile(app)
    } catch (error) {
      result.errors.push(`App Store Connect: ${error.message || 'sync failed'}`)
    }
    results.push(result)
  }
  return results
}
