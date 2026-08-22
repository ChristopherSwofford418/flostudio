import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveVideoProvider } from '../api/media-provider.js'

const originalFetch = globalThis.fetch
const originalApiKey = process.env.OPENAI_API_KEY

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY
  else process.env.OPENAI_API_KEY = originalApiKey
})

describe('OpenAI Sora video provider', () => {
  it('starts an asynchronous Sora job with the selected image as input_reference', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id:'video_123', status:'queued', progress:0 }), { status:200, headers:{ 'Content-Type':'application/json' } }))

    const job = await resolveVideoProvider().create({ model:'sora-2', prompt:'Show the app in motion', size:'720x1280', seconds:'8', reference:new Blob(['image-bytes'], { type:'image/png' }) })

    expect(job).toMatchObject({ id:'video_123', status:'queued' })
    const [url, options] = globalThis.fetch.mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/videos')
    expect(options.headers.Authorization).toBe('Bearer test-key')
    expect(options.body).toBeInstanceOf(FormData)
    expect(options.body.get('model')).toBe('sora-2')
    expect(options.body.get('input_reference')).toBeInstanceOf(Blob)
  })

  it('retrieves job state and streams finished media from the OpenAI video endpoints', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id:'video_123', status:'in_progress', progress:40 }), { status:200, headers:{ 'Content-Type':'application/json' } }))
      .mockResolvedValueOnce(new Response('mp4-bytes', { status:200, headers:{ 'Content-Type':'video/mp4' } }))

    const provider = resolveVideoProvider()
    await expect(provider.retrieve('video_123')).resolves.toMatchObject({ status:'in_progress', progress:40 })
    const content = await provider.download('video_123', 'video')
    expect(await content.text()).toBe('mp4-bytes')
    expect(globalThis.fetch.mock.calls[0][0]).toBe('https://api.openai.com/v1/videos/video_123')
    expect(globalThis.fetch.mock.calls[1][0]).toBe('https://api.openai.com/v1/videos/video_123/content?variant=video')
  })
})
