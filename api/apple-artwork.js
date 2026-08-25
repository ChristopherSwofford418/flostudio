const allowedCountries = new Set(['us', 'ca', 'gb', 'au', 'de', 'fr', 'it', 'es', 'br', 'mx', 'jp', 'kr', 'in'])
const isAppleArtworkUrl = value => {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && (url.hostname === 'mzstatic.com' || url.hostname.endsWith('.mzstatic.com'))
  } catch {
    return false
  }
}

export default async function handler(req, res) {
  const appId = String(req.query?.id || '').trim()
  const requestedCountry = String(req.query?.country || 'us').trim().toLowerCase()
  const country = allowedCountries.has(requestedCountry) ? requestedCountry : 'us'

  if (!/^\d{4,20}$/.test(appId)) {
    return res.status(400).json({ error: 'A valid Apple App Store ID is required.' })
  }

  try {
    const lookup = await fetch(`https://itunes.apple.com/lookup?id=${appId}&country=${country}&entity=software`)
    if (!lookup.ok) throw new Error(`Apple lookup failed with ${lookup.status}`)

    const payload = await lookup.json()
    const result = payload.results?.[0]
    const artworkUrl = result?.artworkUrl512 || result?.artworkUrl100 || ''
    if (!isAppleArtworkUrl(artworkUrl)) {
      return res.status(404).json({ error: 'Apple App Store artwork was not found.' })
    }

    const artwork = await fetch(artworkUrl)
    if (!artwork.ok) throw new Error(`Apple artwork failed with ${artwork.status}`)

    const contentType = artwork.headers.get('content-type') || 'image/jpeg'
    if (!contentType.startsWith('image/')) throw new Error('Apple returned an unsupported artwork response.')

    const bytes = Buffer.from(await artwork.arrayBuffer())
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400')
    return res.status(200).send(bytes)
  } catch {
    return res.status(502).json({ error: 'Apple App Store artwork could not be loaded.' })
  }
}
