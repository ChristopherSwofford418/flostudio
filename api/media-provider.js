const VIDEO_API_URL = 'https://api.openai.com/v1/videos'

function authorizationHeader(apiKey) {
  return { Authorization: `Bearer ${apiKey}` }
}

function providerError(message) {
  const error = new Error(message)
  error.code = 'MEDIA_PROVIDER_CONFIGURATION'
  return error
}

function dataUrlToBlob(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+);base64,(.+)$/)
  if (!match) return null
  return new Blob([Buffer.from(match[2], 'base64')], { type:match[1] })
}

async function fetchWithRenderDeadline(url, options, timeoutMs = 52000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal:controller.signal })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('The image provider took too long to return this creative. No output was delivered; try a shorter direction or another visual lens.')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export function resolveVideoProvider() {
  const configured = process.env.FLOSTUDIO_VIDEO_PROVIDER || 'openai_sora'
  const apiKey = process.env.OPENAI_API_KEY
  if (configured !== 'openai_sora') throw providerError(`The configured video provider "${configured}" is not installed in FloStudio yet.`)
  if (!apiKey) throw providerError('Video generation is not configured. Add OPENAI_API_KEY to the production environment.')

  return {
    id: 'openai_sora',
    async create({ model, prompt, size, seconds, reference }) {
      let response
      if (reference) {
        const form = new FormData()
        form.append('model', model)
        form.append('prompt', prompt)
        form.append('size', size)
        form.append('seconds', seconds)
        form.append('input_reference', reference, 'flostudio-product-reference.png')
        response = await fetch(VIDEO_API_URL, { method:'POST', headers:authorizationHeader(apiKey), body:form })
      } else {
        response = await fetch(VIDEO_API_URL, { method:'POST', headers:{ ...authorizationHeader(apiKey), 'Content-Type':'application/json' }, body:JSON.stringify({ model, prompt, size, seconds }) })
      }
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error?.message || 'Video render could not be started.')
      return payload
    },
    async retrieve(id) {
      const response = await fetch(`${VIDEO_API_URL}/${encodeURIComponent(id)}`, { headers:authorizationHeader(apiKey) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error?.message || 'Could not read video render status.')
      return payload
    },
    async download(id, variant) {
      const response = await fetch(`${VIDEO_API_URL}/${encodeURIComponent(id)}/content?variant=${variant}`, { headers:authorizationHeader(apiKey) })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload?.error?.message || 'Could not download generated video content.')
      }
      return response
    },
  }
}

export function resolveImageProvider() {
  const configured = process.env.FLOSTUDIO_IMAGE_PROVIDER || 'openai_gpt_image'
  const apiKey = process.env.OPENAI_API_KEY
  if (configured !== 'openai_gpt_image') throw providerError(`The configured image provider "${configured}" is not installed in FloStudio yet.`)
  if (!apiKey) throw providerError('Image generation is not configured. Add OPENAI_API_KEY to the production environment.')

  return {
    id:'openai_gpt_image',
    async create({ prompt, size, referenceImage = null, count = 1 }) {
      const imageCount = Math.max(1, Math.min(Number(count) || 1, 4))
      const referenceBlob = dataUrlToBlob(referenceImage)
      const endpoint = referenceBlob ? 'https://api.openai.com/v1/images/edits' : 'https://api.openai.com/v1/images/generations'
      let response
      if (referenceBlob) {
        const form = new FormData()
        form.append('model', 'gpt-image-2')
        form.append('prompt', prompt)
        form.append('image', referenceBlob, 'flostudio-product-reference.png')
        form.append('size', size)
        form.append('quality', 'low')
        form.append('n', String(imageCount))
        response = await fetchWithRenderDeadline(endpoint, { method:'POST', headers:authorizationHeader(apiKey), body:form })
      } else {
        response = await fetchWithRenderDeadline(endpoint, {
          method:'POST',
          headers:{ ...authorizationHeader(apiKey), 'Content-Type':'application/json' },
          body:JSON.stringify({ model:'gpt-image-2', prompt, n:imageCount, size, quality:'low' }),
        })
      }
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error?.message || 'Image creative could not be generated. Your product reference was not replaced with a template.')
      const outputs = (payload.data || []).map(item => item?.b64_json ? `data:image/png;base64,${item.b64_json}` : item?.url).filter(Boolean)
      if (!outputs.length) throw new Error('The image provider returned no creative output.')
      return outputs
    },
  }
}
