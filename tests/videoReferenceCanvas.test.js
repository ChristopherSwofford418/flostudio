import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { prepareVideoReference } from '../api/generate-video.js'

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
})
