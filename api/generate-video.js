import { resolveVideoProvider } from './media-provider.js'
import sharp from 'sharp'
export const maxDuration = 60

const ALLOWED_SIZES = new Set(['1280x720', '720x1280', '1792x1024', '1024x1792'])
const ALLOWED_SECONDS = new Set(['4', '8', '12'])
const CREATOR_DIRECTIONS = {
  creator_demo:'Show one original, non-identifiable adult creator in a natural social-ad setting. The creator reacts to the problem, then uses the selected app on a phone. Keep the person’s appearance consistent and never imitate a real person.',
  professional:'Show one original, non-identifiable adult professional in a credible work setting. Make the product action clear on their device, with simple purposeful movement and no real-person likeness.',
  customer_moment:'Show one original, non-identifiable adult customer in a believable outcome moment. Keep the product interaction central, use natural expressions, and never imitate a real person.',
  product_only:'Do not include people. Make the selected app and its product motion the visual hero.',
}
const UGC_STORY_SHAPES = {
  problem_solution:'Use a direct-response UGC arc: state a credible everyday problem in the opening beat, show the original creator using the selected app as the intervention, then land one specific visible payoff and a clean CTA.',
  testimonial:'Use a natural creator-discovery arc: the original adult creator opens with a candid “I found this” style reaction, shows the selected app in real use, then gives one grounded reason they would keep using it before the CTA.',
  screen_demo:'Use a screen-led UGC walkthrough: the original adult creator gives a short spoken-style hook, the selected app screen becomes the clear central proof, then return to the creator for a concise outcome and CTA.',
}

export function buildEnhancedVideoPrompt({ prompt, storyboardPrompt = '', creatorMode = 'creator_demo', ugcStoryShape = 'problem_solution', hasReference = false }) {
  const creatorDirection = CREATOR_DIRECTIONS[creatorMode] || CREATOR_DIRECTIONS.creator_demo
  const ugcDirection = UGC_STORY_SHAPES[ugcStoryShape] || UGC_STORY_SHAPES.problem_solution
  const referenceDirection = hasReference
    ? 'The supplied first-frame image is the canonical app asset. Preserve its product identity, logo, color, layout, and visible app interface faithfully. Hold a crisp, readable device-screen shot at the opening and closing; do not invent substitute app interfaces, warped screen text, or competing UI.'
    : 'Create a product-led video with a clean, legible final product composition.'
  return `Create a finished Arcads-style UGC short-form social advertising video. ${prompt}.${storyboardPrompt} ${creatorDirection} ${ugcDirection} ${referenceDirection} Use vertical creator-native composition, clean cinematic lighting, one deliberate camera move per shot, stable hands and faces, natural motion, sharp focus, and an uncluttered final call-to-action frame. Do not depict or imitate real people, public figures, copyrighted characters, or copyrighted music.`
}

async function parseBody(req) {
  return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
}

export async function prepareVideoReference(value, size) {
  if (!value) return null
  let source
  if (value.startsWith('data:')) {
    const [meta, encoded] = value.split(',')
    const contentType = /data:([^;]+)/.exec(meta)?.[1] || 'image/png'
    source = new Blob([Buffer.from(encoded, 'base64')], { type:contentType })
  } else {
    const response = await fetch(value)
    if (!response.ok) throw new Error('The selected video source image could not be retrieved.')
    source = new Blob([await response.arrayBuffer()], { type:response.headers.get('content-type') || 'image/png' })
  }
  const [width, height] = String(size || '720x1280').split('x').map(Number)
  if (!width || !height) throw new Error('The selected video canvas is not valid.')
  try {
    const sourceBuffer = Buffer.from(await source.arrayBuffer())
    const prepared = await sharp(sourceBuffer, { limitInputPixels:64_000_000 })
      .rotate()
      .resize(width, height, { fit:'contain', background:{ r:11, g:16, b:24, alpha:1 }, withoutEnlargement:false })
      .png()
      .toBuffer()
    return new Blob([prepared], { type:'image/png' })
  } catch {
    throw new Error('FloStudio could not prepare this image for the selected video canvas. Choose a PNG, JPG, or WebP image and try again.')
  }
}

export default async function handler(req, res) {
  try {
    const provider = resolveVideoProvider()
    const body = req.method === 'POST' ? await parseBody(req) : {}
    const action = req.method === 'GET' ? req.query?.action : body.action
    const id = req.method === 'GET' ? req.query?.id : null

    if (req.method === 'GET' && action === 'status') {
      if (!id) return res.status(400).json({ error:'A video render ID is required to check status.' })
      return res.status(200).json(await provider.retrieve(id))
    }
    if (req.method === 'GET' && action === 'content') {
      if (!id) return res.status(400).json({ error:'A video render ID is required to download content.' })
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
    const seconds = ALLOWED_SECONDS.has(String(body.seconds)) ? String(body.seconds) : '8'
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
    const enhancedPrompt = buildEnhancedVideoPrompt({ prompt, storyboardPrompt, creatorMode:body.creatorMode, ugcStoryShape:body.ugcStoryShape, hasReference:Boolean(body.referenceImage) })
    const reference = await prepareVideoReference(body.referenceImage, size)
    const job = await provider.create({ model, prompt:enhancedPrompt, size, seconds, reference })
    return res.status(200).json({ ...job, provider:provider.id })
  } catch (error) {
    console.error('Video generation error:', error)
    return res.status(error.code === 'MEDIA_PROVIDER_CONFIGURATION' ? 503 : 500).json({ error:error?.message || 'Video creation failed. Please try again.' })
  }
}
