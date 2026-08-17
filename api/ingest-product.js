const blockedHostname = hostname => {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true
  if (/^(127\.|0\.|10\.|192\.168\.|169\.254\.|::1$|fc|fd)/.test(h)) return true
  const octets = h.split('.').map(Number)
  return octets.length === 4 && octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31
}

const meta = (html, key) => {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i'),
  ]
  const found = patterns.map(pattern => html.match(pattern)?.[1]).find(Boolean)
  return found ? found.replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim() : ''
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' })
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const candidate = new URL(body.url)
    if (!['https:','http:'].includes(candidate.protocol) || candidate.port || blockedHostname(candidate.hostname)) return res.status(400).json({ error:'Enter a public http or https product URL.' })
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 7000)
    const response = await fetch(candidate.toString(), { signal:controller.signal, redirect:'follow', headers:{ 'User-Agent':'FloStudio Product Intake/1.0' } })
    clearTimeout(timeout)
    if (!response.ok) return res.status(422).json({ error:'FloStudio could not read that product page. You can continue with the fields below.' })
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) return res.status(422).json({ error:'That URL is not a product webpage. You can continue with the fields below.' })
    const html = (await response.text()).slice(0, 180000)
    const title = meta(html, 'og:title') || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() || ''
    const description = meta(html, 'og:description') || meta(html, 'description')
    const image = meta(html, 'og:image')
    const siteName = meta(html, 'og:site_name')
    return res.status(200).json({ url:candidate.toString(), title, description, image, siteName })
  } catch (error) {
    return res.status(422).json({ error:error.name === 'AbortError' ? 'The product page took too long to respond. Continue with the fields below.' : 'FloStudio could not analyze that URL. Continue with the fields below.' })
  }
}
