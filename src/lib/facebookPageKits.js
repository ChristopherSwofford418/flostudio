const asText = value => String(value || '').trim()

const safeUrl = value => {
  const raw = asText(value)
  if (!raw) return ''
  try {
    const url = new URL(raw)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''
  } catch {
    return ''
  }
}

const truncate = (value, length = 150) => {
  const text = asText(value).replace(/\s+/g, ' ')
  if (text.length <= length) return text
  return `${text.slice(0, Math.max(1, length - 1)).trimEnd()}…`
}

const escapeXml = value => asText(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')

const splitLines = (text, maxChars = 46, maxLines = 3) => {
  const words = asText(text).split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (next.length > maxChars && line) {
      lines.push(line)
      line = word
      if (lines.length === maxLines) break
    } else {
      line = next
    }
  }
  if (line && lines.length < maxLines) lines.push(line)
  const totalWords = words.join(' ')
  if (lines.join(' ').length < totalWords.length && lines.length) {
    lines[lines.length - 1] = truncate(lines[lines.length - 1], Math.max(3, maxChars - 1))
  }
  return lines.length ? lines : ['Add approved product information before using this kit.']
}

export function slugifyFacebookHandle(value) {
  const slug = asText(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 32)
  return slug ? `@${slug}` : '@yourpage'
}

export function requiresFacebookKitReview(app = {}) {
  const facts = app.sourceFacts || app.source_facts || {}
  const dna = app.brandDna || app.brand_dna || {}
  const text = [app.name, app.category, app.description, app.offer_text, app.audience, facts.category, facts.contentRating, dna.proofPoints, dna.restrictedClaims]
    .map(asText)
    .join(' ')
    .toLowerCase()
  return /(health|medical|doctor|mental|therapy|wellness|legal|law|attorney|credit|financial|finance|loan|insurance|invest|tax|safety|security|child|kids|pregnan)/.test(text)
}

export function buildFacebookPageKit(app = {}) {
  const facts = app.sourceFacts || app.source_facts || {}
  const dna = app.brandDna || app.brand_dna || {}
  const listing = facts.appStoreListing || {}
  const socialLinks = facts.socialLinks || {}
  const pageName = asText(facts.currentProductionTitle || listing.title || app.name) || 'Your app'
  const description = asText(app.description || listing.description)
  const category = asText(app.category || facts.category) || 'App'
  const offer = asText(app.offer_text || app.offerText)
  const audience = asText(app.audience)
  const pageUrl = safeUrl(socialLinks.facebook)
  const destinationUrl = safeUrl(app.product_url || app.url || listing.sourceUrl || facts.sourceUrl)
  const artworkUrl = safeUrl(app.imageUrl || facts.image || facts.artworkUrl || facts.storeMetadata?.artworkUrl512 || facts.storeMetadata?.artworkUrl100)
  const proofPoints = asText(dna.proofPoints)
  const restrictedClaims = asText(dna.restrictedClaims)
  const voice = asText(dna.voice)
  const visualDirection = asText(dna.visualDirection)
  const about = description || 'Add the approved app description in Portfolio before using this page kit.'
  const destinationLabel = offer || (destinationUrl ? 'Learn more' : 'Add an approved call to action')

  return {
    productId: app.id || '',
    appName: pageName,
    category,
    handleCandidate: slugifyFacebookHandle(pageName),
    handleAvailability: 'Not checked — verify availability in Facebook before publishing.',
    about: truncate(about, 300),
    audience: audience || 'Add the intended audience in Portfolio before publishing.',
    destinationLabel: truncate(destinationLabel, 80),
    destinationUrl,
    pageUrl,
    artworkUrl,
    graphicAvailable: Boolean(artworkUrl),
    requiresReview: requiresFacebookKitReview(app),
    proofPoints: proofPoints || 'Use only approved product facts from the App Store listing and Portfolio.',
    restrictedClaims: restrictedClaims || 'Do not add unsupported claims, guarantees, results, diagnoses, or legal / financial / safety advice.',
    voice: voice || 'Use the approved brand voice from Portfolio.',
    visualDirection: visualDirection || 'Use current App Store artwork as visual reference.',
    sourceNote: listing.syncedAt || facts.appStoreListingSyncedAt
      ? 'Grounded in the stored App Store listing context and approved Portfolio fields.'
      : 'Grounded in the current approved Portfolio fields. Refresh App Store intelligence for listing context.',
    isPageConnected: Boolean(pageUrl),
  }
}

export function buildFacebookPageOnePagerText(kit = {}) {
  return [
    `${kit.appName || 'App'} — FACEBOOK PAGE ONE-PAGER`,
    '',
    `Suggested Page name: ${kit.appName || 'Add name'}`,
    `Suggested handle: ${kit.handleCandidate || '@yourpage'}`,
    `Handle status: ${kit.handleAvailability || 'Verify in Facebook.'}`,
    `Category: ${kit.category || 'App'}`,
    kit.pageUrl ? `Current Page URL: ${kit.pageUrl}` : 'Current Page URL: Not connected — this kit does not create a Facebook Page.',
    '',
    'ABOUT',
    kit.about || 'Add approved app description.',
    '',
    'AUDIENCE',
    kit.audience || 'Add audience.',
    '',
    'CALL TO ACTION',
    kit.destinationLabel || 'Add approved CTA.',
    kit.destinationUrl ? `Destination: ${kit.destinationUrl}` : 'Destination: Add an approved website or App Store destination before publishing.',
    '',
    'APPROVED PROOF / CONTEXT',
    kit.proofPoints || 'Use only approved facts.',
    '',
    'VOICE + VISUAL DIRECTION',
    `Voice: ${kit.voice || 'Add approved voice.'}`,
    `Visual direction: ${kit.visualDirection || 'Use approved visual direction.'}`,
    '',
    'CLAIMS TO AVOID',
    kit.restrictedClaims || 'Do not add unsupported claims.',
    '',
    'WORKFLOW NOTE',
    'This is a review-ready setup kit only. It does not create a Facebook Page, connect an account, publish content, or verify handle availability.',
    kit.sourceNote || '',
  ].filter(Boolean).join('\n')
}

export function buildFacebookPageGraphicSvg(kit = {}) {
  const accent = '#635bff'
  const mint = '#57e2c2'
  const dark = '#11122a'
  const titleLines = splitLines(kit.appName || 'Your app', 26, 2)
  const aboutLines = splitLines(kit.about || '', 45, 3)
  const audienceLines = splitLines(kit.audience || '', 45, 2)
  const ctaLines = splitLines(kit.destinationLabel || '', 42, 2)
  const artwork = safeUrl(kit.artworkUrl)
  const titleSvg = titleLines.map((line, index) => `<text x="64" y="${218 + index * 42}" font-family="Arial, Helvetica, sans-serif" font-size="${index === 0 ? '40' : '34'}" font-weight="700" fill="#ffffff">${escapeXml(line)}</text>`).join('')
  const aboutSvg = aboutLines.map((line, index) => `<text x="64" y="${360 + index * 27}" font-family="Arial, Helvetica, sans-serif" font-size="19" fill="#43506e">${escapeXml(line)}</text>`).join('')
  const audienceSvg = audienceLines.map((line, index) => `<text x="64" y="${550 + index * 27}" font-family="Arial, Helvetica, sans-serif" font-size="18" fill="#43506e">${escapeXml(line)}</text>`).join('')
  const ctaSvg = ctaLines.map((line, index) => `<text x="64" y="${736 + index * 25}" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" fill="#ffffff">${escapeXml(line)}</text>`).join('')
  const icon = artwork
    ? `<image href="${escapeXml(artwork)}" x="662" y="56" width="146" height="146" preserveAspectRatio="xMidYMid slice" clip-path="url(#iconClip)"/>`
    : `<rect x="662" y="56" width="146" height="146" rx="34" fill="#8d85ff"/><text x="735" y="145" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="60" font-weight="700" fill="#ffffff">${escapeXml((kit.appName || 'F').slice(0, 1).toUpperCase())}</text>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900" role="img" aria-label="${escapeXml(kit.appName || 'App')} Facebook Page one-pager">
  <defs>
    <linearGradient id="hero" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${dark}"/><stop offset="0.58" stop-color="#2b2b68"/><stop offset="1" stop-color="${accent}"/></linearGradient>
    <linearGradient id="cta" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${accent}"/><stop offset="1" stop-color="#4e45cc"/></linearGradient>
    <clipPath id="iconClip"><rect x="662" y="56" width="146" height="146" rx="34"/></clipPath>
  </defs>
  <rect width="900" height="900" rx="32" fill="#f7f8ff"/>
  <rect width="900" height="290" rx="32" fill="url(#hero)"/>
  <rect y="250" width="900" height="40" fill="url(#hero)"/>
  <circle cx="842" cy="52" r="170" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="32"/>
  <text x="64" y="84" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="700" letter-spacing="3" fill="${mint}">FACEBOOK PAGE KIT</text>
  ${titleSvg}
  ${icon}
  <text x="64" y="316" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="700" letter-spacing="2" fill="${accent}">ABOUT</text>
  ${aboutSvg}
  <line x1="64" y1="460" x2="836" y2="460" stroke="#dfe2f7" stroke-width="2"/>
  <text x="64" y="500" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="700" letter-spacing="2" fill="${accent}">AUDIENCE</text>
  ${audienceSvg}
  <text x="64" y="625" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="700" letter-spacing="2" fill="${accent}">SUGGESTED HANDLE</text>
  <text x="64" y="663" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="${dark}">${escapeXml(kit.handleCandidate || '@yourpage')}</text>
  <text x="64" y="691" font-family="Arial, Helvetica, sans-serif" font-size="15" fill="#71809d">Verify availability in Facebook before publishing.</text>
  <rect x="64" y="708" width="772" height="104" rx="18" fill="url(#cta)"/>
  <text x="88" y="746" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="700" letter-spacing="2" fill="rgba(255,255,255,.75)">CALL TO ACTION</text>
  ${ctaSvg}
  <text x="64" y="858" font-family="Arial, Helvetica, sans-serif" font-size="13" fill="#71809d">Review-ready setup kit — no Page created, connected, or published by FloStudio.</text>
</svg>`
}
