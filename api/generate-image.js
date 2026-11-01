import { resolveImageProvider } from './media-provider.js'
import { authenticatedProviderUser, resolveVerifiedProductVisualReference, resolveWorkspaceOpenAIKey } from './provider-key-vault.js'

export const maxDuration = 60

const SIZE_BY_RATIO = {
  '1:1':'1024x1024',
  '9:16':'1024x1536',
  '16:9':'1536x1024',
  '4:5':'1024x1536',
}

function publicReferenceUrl(value) {
  const raw = String(value || '').trim()
  if (!raw || raw.startsWith('data:')) return raw || null
  try {
    const url = new URL(raw)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    const host = url.hostname.toLowerCase()
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || /^(127\.|0\.|10\.|192\.168\.|169\.254\.)/.test(host)) return null
    return url.href
  } catch {
    return null
  }
}

async function fetchImageAsDataUrl(value) {
  const url = publicReferenceUrl(value)
  if (!url) return null
  if (url.startsWith('data:')) return url
  const response = await fetch(url, { redirect:'error' })
  if (!response.ok) return null
  const contentType = response.headers.get('content-type') || 'image/png'
  if (!/^image\//i.test(contentType)) return null
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length > 8 * 1024 * 1024) return null
  return `data:${contentType};base64,${buffer.toString('base64')}`
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const prompt = String(body.prompt || '').trim()
    if (!prompt) return res.status(400).json({ error:'Describe the ad creative before rendering.' })

    const workspaceId = String(body.workspaceId || '').trim()
    const productId = String(body.productId || '').trim()
    const { user, accessToken } = await authenticatedProviderUser(req)
    const verifiedReference = await resolveVerifiedProductVisualReference({ workspaceId, productId, userId:user.id, accessToken, reference:body.reference })
    const providerApiKey = await resolveWorkspaceOpenAIKey({ workspaceId, accessToken })
    if (!providerApiKey) return res.status(409).json({ error:'Connect an OpenAI provider key for this workspace before rendering.', code:'WORKSPACE_PROVIDER_NOT_CONNECTED' })

    const size = SIZE_BY_RATIO[body.aspectRatio] || SIZE_BY_RATIO['1:1']
    const referenceImage = await fetchImageAsDataUrl(verifiedReference.url).catch(() => null)
    if (!referenceImage) return res.status(422).json({ error:'The selected verified app image could not be retrieved. Refresh this app’s App Store listing or choose another approved visual.', code:'APP_REFERENCE_UNAVAILABLE' })
    const creativeAngles = [
      'high-contrast commercial hero with dramatic product lighting',
      'candid creator-native social frame with authentic performance energy',
      'cinematic lifestyle integration showing the product solving friction',
      'minimalist editorial pull highlighting exquisite product detail',
    ]
    const creativeRound = Math.max(1, Number(body.creativeRound) || 1)
    const angleConcept = creativeAngles[(creativeRound - 1) % creativeAngles.length]
    const finalPrompt = `Commercial performance ad visual. Style and angle: ${angleConcept}. Core creative direction: ${prompt}. Incorporate the provided verified app reference image as the primary product asset, preserving its distinct branding, UI, and color identity. Do not substitute another app, interface, logo, or product. Photographic lighting, crisp detail, designed for a reviewed social advertising concept. Avoid unreadable generated text, public figures, competitor marks, and copyrighted characters.`
    const provider = resolveImageProvider({ apiKey:providerApiKey })
    const generated = await provider.create({ prompt:finalPrompt, size, referenceImage, count:1 })
    const images = generated.map((url, index) => ({ url, kind:'image', variation:index + 1, concept:angleConcept }))
    return res.status(200).json({ images, size, reference:{ source:verifiedReference.source, label:verifiedReference.label }, generatedAt:new Date().toISOString() })
  } catch (error) {
    const status = error?.status || (error?.code === 'AUTH_REQUIRED' ? 401 : 500)
    console.error('Image generation error:', error?.code || error?.message)
    return res.status(status).json({ error:error?.message || 'Image creation failed. Please try again.', code:error?.code || 'IMAGE_GENERATION_ERROR' })
  }
}
