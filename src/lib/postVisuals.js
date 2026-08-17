import { supabase } from '../supabase'
import { createMediaAsset } from './mediaAssets'

function extensionFor(mime = '') {
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('jpeg')) return 'jpg'
  return 'png'
}

function promptForPost(post) {
  const platform = post.platform || 'social media'
  const postCopy = (post.content || '').replace(/#[^\s]+/g, '').slice(0, 700)
  return `Create a premium ${platform} advertising creative for this campaign post: ${postCopy}. The composition must be visually striking, modern, commercial, and social-first. Use deliberate art direction, polished lighting, a strong focal product or lifestyle moment, and no unreadable AI text. Do not depict real public figures, copyrighted characters, or competitor logos.`
}

export async function generateVisualForPost(post) {
  const prompt = promptForPost(post)
  const response = await fetch('/api/generate-image', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify({ prompt, aspectRatio:'4:5', variations:1, stylePreset:'Commercial', textOverlay:'' }),
  })
  const payload = await response.json()
  if (!response.ok || payload.error) throw new Error(payload.error || 'Visual creative could not be generated.')
  const imageUrl = payload.images?.[0]?.url
  if (!imageUrl) throw new Error('The image provider returned no campaign creative.')

  const mediaResponse = await fetch(imageUrl)
  if (!mediaResponse.ok) throw new Error('The generated creative could not be saved to FloStudio.')
  const blob = await mediaResponse.blob()
  const storagePath = `media/campaign-${post.id}-${Date.now()}.${extensionFor(blob.type)}`
  const { error: uploadError } = await supabase.storage.from('marketing-assets').upload(storagePath, blob, { contentType:blob.type || 'image/png', upsert:true })
  if (uploadError) throw uploadError
  const { data: publicData } = supabase.storage.from('marketing-assets').getPublicUrl(storagePath)
  return createMediaAsset({
    kind:'image',
    source:'ai_image',
    provider:'openai_gpt_image',
    render_status:'completed',
    prompt,
    asset_url:publicData.publicUrl,
    storage_path:storagePath,
    campaign_post_id:post.id,
    metadata:{ platform:post.platform, postPreview:(post.content || '').slice(0, 160), ratio:'4:5', origin:'pipeline' },
    completed_at:new Date().toISOString(),
  })
}
