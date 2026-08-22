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

export function resolveVideoProvider({ apiKey: suppliedApiKey } = {}) {
  const apiKey = suppliedApiKey || process.env.OPENAI_API_KEY
  if (!apiKey) throw providerError('Video generation is not configured. Add OPENAI_API_KEY to the production environment.')
  const endpoint = 'https://api.openai.com/v1/videos'

  const readApiResponse = async response => {
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(payload?.error?.message || 'OpenAI could not start this video render.')
      error.status = response.status
      error.code = payload?.error?.code || null
      throw error
    }
    return payload
  }

  return {
    id: 'openai_sora',
    async create({ model, prompt, size, seconds, reference }) {
      const form = new FormData()
      form.append('model', model || 'sora-2')
      form.append('prompt', prompt)
      form.append('size', size)
      form.append('seconds', String(seconds))
      if (reference) form.append('input_reference', reference, 'flostudio-source-image.png')
      const response = await fetch(endpoint, { method:'POST', headers:authorizationHeader(apiKey), body:form })
      return readApiResponse(response)
    },
    async retrieve(id) {
      const response = await fetch(`${endpoint}/${encodeURIComponent(id)}`, { headers:authorizationHeader(apiKey) })
      return readApiResponse(response)
    },
    async download(id, variant) {
      const response = await fetch(`${endpoint}/${encodeURIComponent(id)}/content?variant=${encodeURIComponent(variant || 'video')}`, { headers:authorizationHeader(apiKey) })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload?.error?.message || 'The completed video could not be downloaded from OpenAI.')
      }
      return response
    },
  }
}

export function resolveImageProvider({ apiKey: suppliedApiKey } = {}) {
  const configured = process.env.FLOSTUDIO_IMAGE_PROVIDER || 'openai_gpt_image'
  const apiKey = suppliedApiKey || process.env.OPENAI_API_KEY
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
