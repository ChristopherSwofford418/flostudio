import { describe, it, expect } from 'vitest'
import { generateAppSeoBlueprint } from '../src/lib/portfolioSeo.js'

describe('FloStudio Portfolio SEO Intelligence', () => {
  it('generates a grounded SEO and ASO review blueprint for a portfolio app', () => {
    const app = {
      name:'ResumeFix AI',
      category:'Productivity',
      description:'AI-powered resume optimization and job application assistant.',
      audience:'Job seekers',
    }

    const blueprint = generateAppSeoBlueprint(app)

    expect(blueprint.appName).toBe('ResumeFix AI')
    expect(blueprint.website.keywordThemes.length).toBeGreaterThan(0)
    expect(blueprint.appStore.currentTitle).toContain('ResumeFix AI')
    expect(blueprint.website.metaTitle).toBeTruthy()
    expect(blueprint.appStore.notes.join(' ')).toContain('Review terms')
  })
})
