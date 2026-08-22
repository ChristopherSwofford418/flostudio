import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { buildEnhancedVideoPrompt, prepareVideoReference } from '../api/generate-video.js'

describe('video source canvas preparation', () => {
  it('preserves a selected image inside an exact vertical Sora first-frame canvas', async () => {
    const sourcePng = await sharp({ create:{ width:1, height:1, channels:4, background:{ r:20, g:40, b:60, alpha:1 } } }).png().toBuffer()
    const onePixelPng = `data:image/png;base64,${sourcePng.toString('base64')}`
    const reference = await prepareVideoReference(onePixelPng, '720x1280')
    const metadata = await sharp(Buffer.from(await reference.arrayBuffer())).metadata()

    expect(reference.type).toBe('image/png')
    expect(metadata).toMatchObject({ width:720, height:1280, format:'png' })
  })

  it('returns no first-frame input when the user chooses text-only video generation', async () => {
    await expect(prepareVideoReference(null, '720x1280')).resolves.toBeNull()
  })

  it('uses an original adult creator while protecting the selected app screen as the canonical product reference', () => {
    const prompt = buildEnhancedVideoPrompt({ prompt:'Show an app that improves resumes.', creatorMode:'creator_demo', hasReference:true })
    expect(prompt).toContain('original, non-identifiable adult creator')
    expect(prompt).toContain('Preserve its product identity, logo, color, layout, and visible app interface faithfully')
    expect(prompt).toContain('do not invent substitute app interfaces')
  })

  it('supports a product-only direction when no on-camera creator is wanted', () => {
    expect(buildEnhancedVideoPrompt({ prompt:'Show the app.', creatorMode:'product_only' })).toContain('Do not include people')
  })

  it('uses the selected Arcads-style UGC story shape for a creator-led video', () => {
    const prompt = buildEnhancedVideoPrompt({ prompt:'Show the app.', creatorMode:'creator_demo', ugcStoryShape:'screen_demo', hasReference:true })
    expect(prompt).toContain('Arcads-style UGC')
    expect(prompt).toContain('screen-led UGC walkthrough')
    expect(prompt).toContain('vertical creator-native composition')
  })
})
