import { describe, it, expect } from 'vitest'

describe('App Store Ingestion & Asset Normalization', () => {
  it('correctly normalizes source facts and extracts screenshots', () => {
    const rawFacts = {
      provider: 'Apple App Store',
      screenshots: ['https://example.com/shot1.png', 'https://example.com/shot2.png'],
      image: 'https://example.com/icon.png'
    }
    const screenshots = rawFacts.screenshots || []
    const icon = rawFacts.image || ''
    const list = [...screenshots]
    if (icon && !list.includes(icon)) list.unshift(icon)

    expect(list.length).toBe(3)
    expect(list[0]).toBe('https://example.com/icon.png')
    expect(list[1]).toBe('https://example.com/shot1.png')
  })
})
