const VIDEO_API_URL = 'https://api.openai.com/v1/videos'

function authorizationHeader(apiKey) {
  return { Authorization: `Bearer ${apiKey}` }
}

function providerError(message) {
  const error = new Error(message)
  error.code = 'MEDIA_PROVIDER_CONFIGURATION'
  return error
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
    async create({ prompt, size }) {
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method:'POST',
        headers:{ ...authorizationHeader(apiKey), 'Content-Type':'application/json' },
        body:JSON.stringify({ model:'gpt-image-2', prompt, n:1, size, quality:'low', response_format:'b64_json' }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error?.message || 'Image creative could not be generated.')
      const output = payload.data?.[0]?.b64_json ? `data:image/png;base64,${payload.data[0].b64_json}` : payload.data?.[0]?.url
      if (!output) throw new Error('The image provider returned no creative output.')
      return output
    },
  }
}
