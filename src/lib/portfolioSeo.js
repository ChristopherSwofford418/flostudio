const STOP_WORDS = new Set(['about','after','again','also','and','app','are','available','before','best','build','can','clear','create','data','define','does','for','from','get','help','how','into','its','like','make','more','most','new','not','now','our','out','people','private','product','save','start','that','the','their','then','this','through','to','tool','use','using','with','your'])

function factsFor(app = {}) {
  return app.sourceFacts || app.source_facts || {}
}

function clean(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function sentence(value = '') {
  const text = clean(value)
  if (!text) return ''
  const first = text.split(/(?<=[.!?])\s+/)[0] || text
  return clean(first)
}

function clip(value = '', max = 160) {
  const text = clean(value)
  if (text.length <= max) return text
  const shortened = text.slice(0, Math.max(0, max - 1)).replace(/\s+\S*$/, '')
  return `${shortened || text.slice(0, Math.max(0, max - 1))}…`
}

function titleCase(value = '') {
  return clean(value).replace(/\b\w/g, letter => letter.toUpperCase())
}

function toList(value) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') return Object.values(value)
  return value == null || value === '' ? [] : [value]
}

function assetValue(value) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') return value.url || value.src || value.asset_url || value.imageUrl || value.image_url || ''
  return ''
}

function unique(values = []) {
  return [...new Set(toList(values).map(value => clean(assetValue(value) || value)).filter(Boolean))]
}

function wordTokens(value = '') {
  return clean(value).toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) || []
}

function meaningfulTokens(values = []) {
  return unique(values.flatMap(wordTokens).filter(token => !STOP_WORDS.has(token)))
}

function appStoreMetadata(app, facts) {
  return facts.storeMetadata || facts.store_metadata || app.storeMetadata || {}
}

function buildAsaKeywordString(candidates, blockedTokens) {
  const terms = []
  for (const term of candidates) {
    const normalized = clean(term).toLowerCase()
    if (!normalized || normalized.length < 3) continue
    if (wordTokens(normalized).some(token => blockedTokens.has(token))) continue
    if (terms.includes(normalized)) continue
    const next = [...terms, normalized].join(',')
    if (next.length > 100) continue
    terms.push(normalized)
  }
  return terms.join(',')
}

export function seoSourceCoverage(app = {}) {
  const facts = factsFor(app)
  const store = appStoreMetadata(app, facts)
  const screenshots = toList(facts.screenshots || facts.screenshotUrls || store.screenshots || [])
  const listingUrl = app.product_url || app.url || facts.sourceUrl || ''
  return {
    name: Boolean(clean(app.name)),
    category: Boolean(clean(app.category || facts.category || store.primaryGenreName)),
    description: Boolean(clean(app.description)),
    offer: Boolean(clean(app.offer_text || app.offerText || facts.offerText)),
    audience: Boolean(clean(app.audience || facts.audience)),
    listingUrl: Boolean(clean(listingUrl)),
    publicListing: Boolean(store.appStoreId || store.trackId || facts.sourceType === 'app_store'),
    screenshots: screenshots.length,
    artwork: Boolean(facts.image || facts.artworkUrl || store.artworkUrl100),
  }
}

/**
 * Build a review-ready SEO and ASO plan from a single app's saved facts.
 * It intentionally makes no claim about rankings, search volume, customers, or outcomes.
 */
export function generateAppSeoBlueprint(app = {}) {
  const facts = factsFor(app)
  const store = appStoreMetadata(app, facts)
  const name = clean(app.name || store.trackName || 'Portfolio app')
  const category = clean(app.category || facts.category || store.primaryGenreName || 'mobile')
  const description = sentence(app.description || facts.description || store.description)
  const offer = sentence(app.offer_text || app.offerText || facts.offerText)
  const audience = clean(app.audience || facts.audience)
  const listingUrl = clean(app.product_url || app.url || facts.sourceUrl || store.trackViewUrl)
  const screenshots = unique(facts.screenshots || facts.screenshotUrls || store.screenshots || [])
  const titleSource = clean(store.trackName || name)
  const subtitleSource = clean(store.subtitle || facts.subtitle)
  const currentKeywords = clean(store.keywords || facts.keywords)
  const publicDescription = clean(store.description || app.description || '')
  const rawTokens = meaningfulTokens([name, category, subtitleSource, description, offer, audience, publicDescription])
  const titleTokens = new Set(meaningfulTokens([titleSource, subtitleSource, category]))
  const keywordString = buildAsaKeywordString(rawTokens, titleTokens)
  const websiteKeywordThemes = unique([
    category,
    ...rawTokens.slice(0, 12).map(titleCase),
  ]).slice(0, 12)
  const primaryPromise = offer || description || `${name} is a ${category} app.`
  const metaTitle = clip(`${name} | ${category} app`, 60)
  const metaDescription = clip(unique([description, offer, audience ? `Built for ${audience}.` : '']).join(' '), 155)
  const h1 = `${name}: ${primaryPromise || `${category} app`}`
  const landingSlug = `/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app'}`
  const promotionalText = clip(offer || description || `${name} helps with ${category.toLowerCase()} workflows.`, 170)
  const subtitleDraft = clip(offer || description || `${category} app`, 30)
  const screenshotPlan = screenshots.length
    ? screenshots.slice(0, 3).map((url, index) => ({
      order: index + 1,
      url,
      focus: index === 0 ? `Lead with the clearest visible benefit from: ${primaryPromise}` : `Show one specific ${category.toLowerCase()} workflow supported by the saved app experience.`,
      altText: `${name} app screen showing ${index === 0 ? 'the primary product benefit' : `a ${category.toLowerCase()} workflow`}.`,
    }))
    : []
  const sourceCoverage = seoSourceCoverage(app)
  const readiness = [
    { label:'Product truth', ready:sourceCoverage.description, detail:sourceCoverage.description ? 'Saved description is available for grounded page copy.' : 'Add a plain-language product description in Portfolio.' },
    { label:'Audience and offer', ready:sourceCoverage.audience || sourceCoverage.offer, detail:sourceCoverage.audience || sourceCoverage.offer ? 'At least one conversion context field is saved.' : 'Add an audience or offer before publishing conversion copy.' },
    { label:'Public listing', ready:sourceCoverage.publicListing || sourceCoverage.listingUrl, detail:sourceCoverage.publicListing ? 'Public App Store metadata is linked.' : sourceCoverage.listingUrl ? 'A product URL is saved; refresh public listing intelligence if needed.' : 'No public listing or product URL is saved.' },
    { label:'Search visuals', ready:sourceCoverage.screenshots > 0, detail:sourceCoverage.screenshots ? `${sourceCoverage.screenshots} saved screenshot${sourceCoverage.screenshots === 1 ? '' : 's'} can be planned for search and product pages.` : 'No App Store screenshots are currently saved.' },
  ]
  const appleKeywordNotes = [
    keywordString ? `Candidate string is ${keywordString.length}/100 characters and excludes terms already present in the stored title, subtitle, or category.` : 'No safe candidate keyword string could be formed from the saved facts; add a more detailed description, audience, or offer before researching new terms.',
    'Review terms for relevance, trademarks, competitor names, and App Review compliance before entering App Store Connect.',
    'Promotional text is a messaging field, not an App Store ranking field.',
  ]

  return {
    appName:name,
    category,
    sourceCoverage,
    website:{
      landingSlug,
      metaTitle,
      metaDescription,
      h1,
      heroPromise:primaryPromise,
      keywordThemes:websiteKeywordThemes,
      internalLinks:[
        { label:`How ${name} works`, target:`${landingSlug}/how-it-works` },
        { label:`${name} features`, target:`${landingSlug}/features` },
        { label:`${name} support`, target:`${landingSlug}/support` },
      ],
      faqs:[
        { question:`What is ${name}?`, answer:description || 'Document the app’s plain-language purpose before publishing this page.' },
        { question:`Who is ${name} for?`, answer:audience ? `${name} is positioned for ${audience}.` : 'Document the intended audience before publishing this page.' },
        { question:`What can ${name} help with?`, answer:offer || description || 'Document the app’s supported outcome before publishing this page.' },
      ],
    },
    appStore:{
      currentTitle:titleSource,
      currentSubtitle:subtitleSource,
      currentKeywords,
      titleCharacterCount:titleSource.length,
      subtitleDraft,
      subtitleCharacterCount:subtitleDraft.length,
      promotionalText,
      promotionalCharacterCount:promotionalText.length,
      candidateKeywordString:keywordString,
      keywordCharacterCount:keywordString.length,
      screenshotPlan,
      notes:appleKeywordNotes,
    },
    experiments:[
      {
        title:`${name} benefit-led screenshot treatment`,
        hypothesis:screenshots.length ? `Leading with a screenshot that demonstrates “${clip(primaryPromise, 90)}” may better communicate the app’s value than the current default ordering.` : 'Create a first screenshot or app preview that demonstrates the app’s clearest verified benefit before testing.',
        variable:screenshots.length ? 'First screenshot position and supporting message' : 'First visual asset and message',
        measurement:'Review App Analytics product-page impressions, downloads, and conversion rate after a manual App Store Connect test is configured.',
      },
      {
        title:`${name} audience-specific product page`,
        hypothesis:audience ? `A custom product page aligned to ${audience} can be reviewed as a dedicated message-and-visual journey.` : 'Define one concrete audience segment before planning a custom product page.',
        variable:'Audience-specific screenshots, promotional text, and feature emphasis',
        measurement:'Compare manual custom-product-page acquisition metrics against the default product page in App Analytics.',
      },
    ],
    sources:{ listingUrl, screenshots, artwork:facts.image || facts.artworkUrl || store.artworkUrl100 || '' },
    generatedAt:new Date().toISOString(),
  }
}

export function seoBriefToText(blueprint = {}) {
  const website = blueprint.website || {}
  const appStore = blueprint.appStore || {}
  return [
    `${blueprint.appName || 'App'} — SEO & ASO review brief`,
    '',
    'WEBSITE SEO',
    `URL: ${website.landingSlug || 'Not drafted'}`,
    `Title: ${website.metaTitle || 'Not drafted'}`,
    `Meta description: ${website.metaDescription || 'Not drafted'}`,
    `H1: ${website.h1 || 'Not drafted'}`,
    `Keyword themes: ${(website.keywordThemes || []).join(', ') || 'Add source context first'}`,
    '',
    'APP STORE DISCOVERY',
    `Current title: ${appStore.currentTitle || 'Not returned'}`,
    `Review subtitle: ${appStore.subtitleDraft || 'Not drafted'} (${appStore.subtitleCharacterCount || 0}/30)` ,
    `Candidate keywords: ${appStore.candidateKeywordString || 'Manual research needed'} (${appStore.keywordCharacterCount || 0}/100)`,
    `Promotional text: ${appStore.promotionalText || 'Not drafted'} (${appStore.promotionalCharacterCount || 0}/170)`,
    '',
    'REVIEW NOTE',
    'This is a grounded planning draft. Verify claims, terms, trademark use, and App Store compliance before publishing.',
  ].join('\n')
}
