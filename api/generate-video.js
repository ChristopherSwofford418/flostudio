import { resolveVideoProvider } from './media-provider.js'

export const maxDuration = 60

const ALLOWED_SIZES = new Set(['1280x720', '720x1280', '1920x1080', '1080x1920'])

async function parseBody(req) {
  return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
}

async function toReferenceBlob(value) {
  if (!value) return null
  if (value.startsWith('data:')) {
    const [meta, encoded] = value.split(',')
    const contentType = /data:([^;]+)/.exec(meta)?.[1] || 'image/png'
    return new Blob([Buffer.from(encoded, 'base64')], { type:contentType })
  }
  const response = await fetch(value)
  if (!response.ok) throw new Error('The uploaded video reference image could not be retrieved.')
  return new Blob([await response.arrayBuffer()], { type:response.headers.get('content-type') || 'image/png' })
}

export default async function handler(req, res) {
  try {
    const provider = resolveVideoProvider()
    const body = req.method === 'POST' ? await parseBody(req) : {}
    const action = req.method === 'GET' ? req.query?.action : body.action
    const id = req.method === 'GET' ? req.query?.id : null

    if (req.method === 'GET' && action === 'status') return res.status(200).json(await provider.retrieve(id))
    if (req.method === 'GET' && action === 'content') {
      const variant = ['video', 'thumbnail', 'spritesheet'].includes(req.query?.variant) ? req.query.variant : 'video'
      const content = await provider.download(id, variant)
      res.setHeader('Content-Type', content.headers.get('content-type') || (variant === 'video' ? 'video/mp4' : 'image/webp'))
      res.setHeader('Cache-Control', 'private, max-age=300')
      return res.status(200).send(Buffer.from(await content.arrayBuffer()))
    }
    if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' })

    const prompt = String(body.prompt || '').trim()
    if (!prompt) return res.status(400).json({ error:'Describe the video ad before starting a render.' })
    const size = ALLOWED_SIZES.has(body.size) ? body.size : '720x1280'
    const seconds = ['4', '8', '12', '16', '20'].includes(String(body.seconds)) ? String(body.seconds) : '8'
    const model = body.quality === 'production' ? 'sora-2-pro' : 'sora-2'
    const storyboard = Array.isArray(body.storyboard) ? body.storyboard.slice(0, 6).map((beat, index) => ({
      index:index + 1,
      label:String(beat?.label || `SHOT ${index + 1}`).slice(0, 80),
      purpose:String(beat?.purpose || '').slice(0, 240),
      visual:String(beat?.visual || '').slice(0, 420),
      caption:String(beat?.caption || '').slice(0, 140),
      voiceover:String(beat?.voiceover || '').slice(0, 240),
    })) : []
    const storyboardPrompt = storyboard.length ? ` Follow this editable storyboard exactly as a visual plan: ${storyboard.map(beat => `Shot ${beat.index} ${beat.label}. Purpose: ${beat.purpose}. Visual: ${beat.visual}. On-screen copy: ${beat.caption}. Voiceover direction: ${beat.voiceover}.`).join(' ')}` : ''
    const enhancedPrompt = `Create a finished social advertising video. ${prompt}.${storyboardPrompt} Use a clear shot sequence with deliberate camera motion, product focus, brand-safe lighting, and a strong final call-to-action composition. Do not depict real people, public figures, copyrighted characters, or copyrighted music.`
    const reference = await toReferenceBlob(body.referenceImage).catch(() => null)
    const job = await provider.create({ model, prompt:enhancedPrompt, size, seconds, reference })
    return res.status(200).json({ ...job, provider:provider.id })
  } catch (error) {
    console.error('Video generation error:', error)
    return res.status(error.code === 'MEDIA_PROVIDER_CONFIGURATION' ? 503 : 500).json({ error:error?.message || 'Video creation failed. Please try again.' })
  }
}
