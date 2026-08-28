import { articleSlug } from './seoArticles'

function text(value, fallback = '') {
  return String(value || fallback).trim()
}

function list(value) {
  return Array.isArray(value) ? value : []
}

export function buildGroundedSeoArticle({ app, blueprint, destination }) {
  const name = text(app?.name, 'Selected app')
  const category = text(app?.category || app?.sourceFacts?.category || app?.source_facts?.category, 'app')
  const description = text(app?.description || app?.sourceFacts?.description || app?.source_facts?.description, `A ${category} product.`)
  const website = blueprint?.website || {}
  const appStore = blueprint?.appStore || {}
  const themes = list(website.keywordThemes)
  const links = list(website.internalLinks)
  const faqs = list(website.faqs)
  const focusKeyword = text(themes[0], name)
  const title = text(website.h1, `${name}: a clearer way to approach ${category}`)
  const slug = articleSlug(title)
  const excerpt = text(website.metaDescription, description)
  const metaTitle = text(website.metaTitle, title).slice(0, 60)
  const metaDescription = excerpt.slice(0, 155)
  const themeLine = themes.length ? themes.join(', ') : `${name}, ${category}`
  const linkSection = links.length ? links.map(item => `- [${text(item.label, 'Related page')}](${text(item.target, '/')})`).join('\n') : '- Add only relevant internal links after the destination site is reviewed.'
  const faqSection = faqs.length ? faqs.map(item => `### ${text(item.question, 'Frequently asked question')}\n\n${text(item.answer, 'Write an app-specific answer from approved product facts.')}`).join('\n\n') : '### What is this app?\n\nUse the approved product description and current listing context to answer this question without adding unsupported claims.'
  const contentMarkdown = `# ${title}\n\n${description}\n\n## Why ${name} exists\n\n${description} This article is grounded in the selected app’s saved product context and should be reviewed by the owner before publication.\n\n## What to explore\n\nThe most relevant planning themes for this article are: ${themeLine}. Keep the final article focused on the reader’s task and use only features, pricing, outcomes, and comparisons that have been verified for ${name}.\n\n## A practical next step\n\nStart with the current product workflow, review the available evidence, and choose the next action that fits the reader’s needs. Do not promise a result that is not present in the saved app facts.\n\n## Related resources\n\n${linkSection}\n\n## Frequently asked questions\n\n${faqSection}\n\n---\n\n**Editorial note:** Review all claims, links, metadata, and destination formatting before publishing.`
  return {
    title,
    slug,
    excerpt,
    metaTitle,
    metaDescription,
    focusKeyword,
    contentMarkdown,
    internalLinks:links,
    faqs,
    sourceSnapshot:{ appName:name, category, listingUrl:blueprint?.sources?.listingUrl || '', currentTitle:appStore.currentTitle || '', destinationUrl:destination?.website_url || '', generatedAt:new Date().toISOString() },
  }
}
