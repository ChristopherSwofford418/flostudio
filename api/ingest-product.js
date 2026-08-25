import OpenAI from 'openai'

const blockedHostname = hostname => {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true
  if (/^(127\.|0\.|10\.|192\.168\.|169\.254\.|::1$|fc|fd)/.test(h)) return true
  const octets = h.split('.').map(Number)
  return octets.length === 4 && octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31
}

const decode = value => String(value || '')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&#x27;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .trim()

const stripHtml = html => decode(String(html || '')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
  .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .slice(0, 16000))

const meta = (html, key) => {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name|itemprop)=["']${escaped}["'][^>]*>`, 'i'),
  ]
  const found = patterns.map(pattern => html.match(pattern)?.[1]).find(Boolean)
  return decode(found)
}

const jsonLd = html => {
  const matches = [...String(html || '').matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  for (const match of matches) {
    try {
      const parsed = JSON.parse(match[1].trim())
      const item = Array.isArray(parsed) ? parsed.find(Boolean) : parsed
      if (item && typeof item === 'object') return item
    } catch {}
  }
  return {}
}

const fetchWithTimeout = async (url, options = {}, timeoutMs = 9000) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 FloStudio Product Intelligence/2.0',
        Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
        ...(options.headers || {})
      }
    })
  } finally {
    clearTimeout(timer)
  }
}

const storeKind = candidate => {
  const host = candidate.hostname.toLowerCase()
  if (host === 'apps.apple.com' || host.endsWith('.apps.apple.com') || host === 'itunes.apple.com') return 'apple'
  if (host === 'play.google.com' && candidate.pathname.startsWith('/store/apps')) return 'google'
  return 'web'
}

async function readReaderListing(candidate, source = 'Product website') {
  const readerUrl = `https://r.jina.ai/http://${candidate.hostname}${candidate.pathname}${candidate.search}`
  const response = await fetchWithTimeout(readerUrl, { headers: { Accept: 'text/plain' } }, 12000)
  if (!response.ok) return null
  const markdown = (await response.text()).slice(0, 400000)
  const title = decode(markdown.match(/^Title:\s*(.+)$/im)?.[1] || '')
  const headings = [...markdown.matchAll(/^#{1,3}\s+(.+)$/gm)].map(match => decode(match[1])).filter(Boolean).slice(0, 20)
  const image = markdown.match(/!\[[^\]]*\]\((https?:\/\/[^)]+)\)/)?.[1] || ''
  const pageText = markdown.replace(/^Title:.*$/gim, '').replace(/^URL Source:.*$/gim, '').replace(/^Markdown Content:\s*/gim, '').replace(/\s+/g, ' ').trim().slice(0, 18000)
  return { source, name:title, description:pageText.slice(0, 800), category:'', image, siteName:source, storeUrl:candidate.toString(), headings, pageText }
}

async function readAppleListing(candidate) {
  const appId = candidate.pathname.match(/(?:^|\/)id(\d+)/i)?.[1]
  if (!appId) return null
  const country = candidate.pathname.match(/^\/([a-z]{2})(?:\/|$)/i)?.[1]?.toLowerCase() || 'us'
  const response = await fetchWithTimeout(`https://itunes.apple.com/lookup?id=${appId}&country=${country}&entity=software`, {}, 8000)
  if (!response.ok) return null
  const payload = await response.json()
  const result = payload.results?.[0]
  if (!result) return null
  const storeMetadata = {
    appStoreId: result.trackId ? String(result.trackId) : appId,
    bundleId: result.bundleId || '',
    sellerName: result.sellerName || '',
    sellerUrl: result.sellerUrl || '',
    artistId: result.artistId ? String(result.artistId) : '',
    artistUrl: result.artistViewUrl || '',
    trackUrl: result.trackViewUrl || candidate.toString(),
    releaseDate: result.releaseDate || '',
    currentVersionReleaseDate: result.currentVersionReleaseDate || '',
    version: result.version || '',
    minimumOsVersion: result.minimumOsVersion || '',
    fileSizeBytes: result.fileSizeBytes || '',
    formattedPrice: result.formattedPrice || '',
    price: result.price ?? null,
    currency: result.currency || '',
    genres: result.genres || [],
    genreIds: result.genreIds || [],
    languageCodes: result.languageCodesISO2A || [],
    supportedDevices: result.supportedDevices || [],
    features: result.features || [],
    advisories: result.advisories || [],
    contentRating: result.contentAdvisoryRating || '',
    rating: result.averageUserRating ?? null,
    ratingCount: result.userRatingCount ?? 0,
    currentVersionRating: result.averageUserRatingForCurrentVersion ?? null,
    currentVersionRatingCount: result.userRatingCountForCurrentVersion ?? 0,
    artworkUrl512: result.artworkUrl512 || '',
    artworkUrl100: result.artworkUrl100 || '',
    screenshots: result.screenshotUrls || [],
    ipadScreenshots: result.ipadScreenshotUrls || [],
    appletvScreenshots: result.appletvScreenshotUrls || [],
    isGameCenterEnabled: Boolean(result.isGameCenterEnabled),
    kind: result.kind || '',
  }
  return {
      source: 'Apple App Store',
      appId,
      name: result.trackName || '',
      description: result.description || '',
      category: result.primaryGenreName || result.genres?.[0] || '',
      image: result.artworkUrl512 || result.artworkUrl100 || '',
      screenshots: result.screenshotUrls || result.ipadScreenshotUrls || [],
      siteName: 'Apple App Store',
      developer: result.artistName || result.sellerName || '',
      price: result.formattedPrice || '',
      rating: result.averageUserRating ? `${Number(result.averageUserRating).toFixed(1)}/5` : '',
      ratingCount: result.userRatingCount || 0,
      version: result.version || '',
      releaseNotes: result.releaseNotes || '',
      contentRating: result.contentAdvisoryRating || '',
      storeUrl: result.trackViewUrl || candidate.toString(),
      storeMetadata
    }
}

async function readGoogleListing(candidate) {
  const googleUrl = new URL(candidate.toString())
  googleUrl.searchParams.set('hl', 'en')
  googleUrl.searchParams.set('gl', 'US')
  const response = await fetchWithTimeout(googleUrl.toString(), {}, 9000)
  if (response.ok) {
    const html = (await response.text()).slice(0, 300000)
    const structured = jsonLd(html)
    const name = decode(structured.name || meta(html, 'og:title') || meta(html, 'twitter:title') || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+- Apps on Google Play$/i, '').trim()
    const description = decode(structured.description || meta(html, 'og:description') || meta(html, 'description') || '')
    if (name && name !== 'My App' && description) {
      return {
        source: 'Google Play', name, description, category: meta(html, 'genre') || structured.applicationCategory || '', image: structured.image || meta(html, 'og:image') || '', siteName: 'Google Play', developer: structured.author?.name || meta(html, 'author') || '', rating: structured.aggregateRating?.ratingValue ? `${structured.aggregateRating.ratingValue}/5` : '', ratingCount: structured.aggregateRating?.ratingCount || 0, price: structured.offers?.price === '0' ? 'Free' : structured.offers?.price || '', storeUrl: candidate.toString(), pageText: stripHtml(html)
      }
    }
  }
  return readReaderListing(candidate, 'Google Play')
}

async function readWebListing(candidate) {
  const response = await fetchWithTimeout(candidate.toString(), {}, 10000)
  if (response.ok && (response.headers.get('content-type') || '').includes('text/html')) {
    const html = (await response.text()).slice(0, 350000)
    const structured = jsonLd(html)
    const headings = [...html.matchAll(/<h[123][^>]*>([\s\S]*?)<\/h[123]>/gi)].map(m => decode(m[1].replace(/<[^>]+>/g, ''))).filter(Boolean).slice(0, 15)
    const name = decode(structured.name || meta(html, 'og:title') || meta(html, 'twitter:title') || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')
    const description = decode(structured.description || meta(html, 'og:description') || meta(html, 'description') || meta(html, 'twitter:description') || '')
    if (name || description || headings.length) {
      return { source:'Product website', name, description, category:structured.applicationCategory || meta(html, 'genre') || '', image:structured.image || meta(html, 'og:image') || '', siteName:meta(html, 'og:site_name') || candidate.hostname, storeUrl:candidate.toString(), headings, pageText:stripHtml(html) }
    }
  }
  return readReaderListing(candidate, 'Product website')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const targetUrl = String(body.url || '').trim()
    if (!targetUrl) return res.status(400).json({ error: 'Paste a public product or app store URL first.' })

    const candidate = new URL(targetUrl)
    if (!['https:', 'http:'].includes(candidate.protocol) || candidate.port || blockedHostname(candidate.hostname)) {
      return res.status(400).json({ error: 'Enter a public http or https product URL.' })
    }

    const kind = storeKind(candidate)
    let listing = null
    try {
      listing = kind === 'apple' ? await readAppleListing(candidate) : kind === 'google' ? await readGoogleListing(candidate) : await readWebListing(candidate)
    } catch {
      listing = null
    }
    if (!listing && kind === 'web') listing = await readReaderListing(candidate, 'Product website')
    if (!listing) return res.status(422).json({ error: 'FloStudio could not read that link. Check the URL and try again, or fill the fields manually.' })

    const sourceText = [
      `Source Type: ${listing.source}`,
      `Title / Name: ${listing.name}`,
      `Category: ${listing.category}`,
      `Developer / Publisher: ${listing.developer || 'Not specified'}`,
      `Price / Offer: ${listing.price || 'Not specified'}`,
      `Rating: ${listing.rating || 'N/A'}`,
      `Description: ${listing.description}`,
      `Key Headings: ${(listing.headings || []).join(' · ')}`,
      `Page Body Content: ${listing.pageText || ''}`
    ].join('\n').slice(0, 20000)

    let aiSynthesis = {
      productName: listing.name || 'My App',
      category: listing.category || 'Product & App',
      description: listing.description || 'A product designed to help people make meaningful progress.',
      offerText: listing.price === 'Free' || listing.price === '$0.00' ? 'Download free' : listing.price || 'Learn more',
      audience: 'People who need the outcome this product provides',
      voice: 'Clear, credible, modern, and human',
      visualDirection: 'Cinematic product storytelling with tactile editorial detail',
      proofPoints: [listing.category, listing.rating && `${listing.rating} rating`, listing.developer && `Built by ${listing.developer}`].filter(Boolean).join(' · '),
      restrictedClaims: 'Avoid unsupported guarantees, fabricated testimonials, and claims not present in the listing.'
    }

    const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY
    if (apiKey && !body.enrichOnly) {
      try {
        const openai = new OpenAI({ apiKey })
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: 'You are FloStudio Brand Intelligence. Deeply analyze the provided product listing or website page and return strictly valid JSON. Preserve factual details, infer professional audience and positioning accurately, and never invent testimonials, pricing, users, rankings, or guarantees.' },
            { role: 'user', content: `Analyze this scraped product page or app store listing and build a complete, professional profile and Brand DNA. Return exactly these string keys: productName, category, description, offerText, audience, voice, visualDirection, proofPoints, restrictedClaims. Keep description to 1-2 concise sentences.\n\n${sourceText}` }
          ],
          response_format: { type: 'json_object' },
          max_tokens: 800,
          temperature: 0.2
        })
        const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}')
        aiSynthesis = { ...aiSynthesis, ...parsed }
      } catch {}
    }

    const title = listing.name || aiSynthesis.productName
    return res.status(200).json({
      url: candidate.toString(),
      sourceType: kind,
      source: listing.source,
      title,
      siteName: listing.siteName,
      image: listing.image || '',
      sourceFacts: {
        provider: listing.source,
        appId: listing.appId || null,
        developer: listing.developer || '',
        price: listing.price || '',
        rating: listing.rating || '',
        ratingCount: listing.ratingCount || 0,
        version: listing.version || '',
        releaseNotes: listing.releaseNotes || '',
        contentRating: listing.contentRating || '',
        screenshots: listing.screenshots || [],
        storeMetadata: listing.storeMetadata || {},
        sourceUrl: listing.storeUrl || candidate.toString()
      },
      name: aiSynthesis.productName || title,
      category: aiSynthesis.category || listing.category || 'Product & App',
      description: aiSynthesis.description || listing.description,
      offerText: aiSynthesis.offerText || 'Learn more',
      audience: aiSynthesis.audience || 'Target users',
      brandDna: {
        voice: aiSynthesis.voice || 'Clear and credible',
        visualDirection: aiSynthesis.visualDirection || 'Cinematic editorial product storytelling',
        proofPoints: aiSynthesis.proofPoints || '',
        restrictedClaims: aiSynthesis.restrictedClaims || 'No unsupported claims'
      }
    })
  } catch (error) {
    return res.status(422).json({ error: error?.name === 'AbortError' ? 'That page took too long to respond. Try again or fill the fields manually.' : 'FloStudio could not analyze that URL. Check the link and try again.' })
  }
}
