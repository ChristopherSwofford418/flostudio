import { supabase } from '../supabase'
import { createMediaAsset, updateMediaAsset } from './mediaAssets'

const platformTimes = { instagram:'09:00', linkedin:'08:00', facebook:'13:00', tiktok:'19:00', twitter:'12:00' }

const extensionFor = mime => mime?.includes('webp') ? 'webp' : mime?.includes('jpeg') ? 'jpg' : 'png'

export async function loadCampaignWorkspace(userId) {
  const [brands, products, campaigns, media] = await Promise.all([
    supabase.from('brands').select('*').eq('user_id', userId).order('updated_at', { ascending:false }),
    supabase.from('products').select('*').eq('user_id', userId).order('updated_at', { ascending:false }),
    supabase.from('campaigns').select('*').eq('user_id', userId).order('updated_at', { ascending:false }).limit(12),
    supabase.from('media_assets').select('*').eq('user_id', userId).in('render_status', ['ready','completed']).order('created_at', { ascending:false }).limit(24),
  ])
  return { brands:brands.data || [], products:products.data || [], campaigns:campaigns.data || [], media:media.data || [] }
}

export async function saveBrandAndProduct({ userId, brandName, websiteUrl, productName, description, offerText, audience, brandDna, sourceFacts }) {
  const existingBrand = await supabase.from('brands').select('*').eq('user_id', userId).eq('name', brandName).maybeSingle()
  let brand
  if (existingBrand.data) {
    const update = await supabase.from('brands').update({ website_url:websiteUrl || null, brand_dna:brandDna, updated_at:new Date().toISOString() }).eq('id', existingBrand.data.id).select().single()
    if (update.error) throw update.error
    brand = update.data
  } else {
    const insert = await supabase.from('brands').insert([{ user_id:userId, name:brandName, website_url:websiteUrl || null, brand_dna:brandDna }]).select().single()
    if (insert.error) throw insert.error
    brand = insert.data
  }

  const existingProduct = await supabase.from('products').select('*').eq('user_id', userId).eq('brand_id', brand.id).eq('name', productName).maybeSingle()
  const productPayload = { brand_id:brand.id, product_url:websiteUrl || null, description:description || null, offer_text:offerText || null, audience:audience || null, source_facts:sourceFacts || {}, updated_at:new Date().toISOString() }
  let product
  if (existingProduct.data) {
    const update = await supabase.from('products').update(productPayload).eq('id', existingProduct.data.id).select().single()
    if (update.error) throw update.error
    product = update.data
  } else {
    const insert = await supabase.from('products').insert([{ user_id:userId, name:productName, ...productPayload }]).select().single()
    if (insert.error) throw insert.error
    product = insert.data
  }
  return { brand, product }
}

export async function createCampaign({ userId, brand, product, name, objective, audience, offerText, platforms, brief }) {
  const response = await supabase.from('campaigns').insert([{ user_id:userId, brand_id:brand.id, product_id:product.id, name, objective, audience, offer_text:offerText, platforms, brief, status:'concepting' }]).select().single()
  if (response.error) throw response.error
  return response.data
}

export async function saveCampaignConcepts({ userId, campaignId, concepts }) {
  const payload = concepts.map(concept => ({ user_id:userId, campaign_id:campaignId, title:concept.title, angle:concept.angle, hook:concept.hook, proof:concept.proof, cta:concept.cta, visual_recipe:concept.visual_recipe || {}, script:concept.script || {}, status:'proposed' }))
  const response = await supabase.from('campaign_concepts').insert(payload).select()
  if (response.error) throw response.error
  return response.data || []
}

export async function selectCampaignConcept(campaignId, conceptId) {
  const [campaignUpdate, conceptUpdate] = await Promise.all([
    supabase.from('campaigns').update({ selected_concept_id:conceptId, status:'ready_for_review', updated_at:new Date().toISOString() }).eq('id', campaignId).select().single(),
    supabase.from('campaign_concepts').update({ status:'selected', updated_at:new Date().toISOString() }).eq('id', conceptId).select().single(),
  ])
  if (campaignUpdate.error) throw campaignUpdate.error
  if (conceptUpdate.error) throw conceptUpdate.error
  return { campaign:campaignUpdate.data, concept:conceptUpdate.data }
}

export async function createCampaignPosts({ userId, campaignId, concept, platforms }) {
  const now = new Date()
  const rows = platforms.map((platform, index) => {
    const scheduled = new Date(now)
    scheduled.setDate(scheduled.getDate() + index + 1)
    const [hour, minute] = (platformTimes[platform] || '10:00').split(':').map(Number)
    scheduled.setHours(hour, minute, 0, 0)
    const content = `${concept.hook}\n\n${concept.proof}\n\n${concept.cta}`
    return { user_id:userId, campaign_id:campaignId, platform, content, status:'pending', scheduled_at:scheduled.toISOString() }
  })
  const response = await supabase.from('campaign_posts').insert(rows).select()
  if (response.error) throw response.error
  return response.data || []
}

export async function generateCampaignVariant({ userId, campaign, concept, post, variation }) {
  const prompt = `Create a premium conversion-focused ${post.platform} campaign creative. Campaign: ${campaign.name}. Concept: ${concept.title}. Angle: ${concept.angle}. Hook: ${concept.hook}. Proof: ${concept.proof}. CTA: ${concept.cta}. Visual direction: ${concept.visual_recipe?.direction || 'editorial commercial product story'}. Make the product benefit instantly clear; use sophisticated modern ad art direction, deliberate lighting, and a strong visual hierarchy. Do not use unreadable generated text, public figures, competitor marks, or copyrighted characters.`
  const jobResult = await supabase.from('render_jobs').insert([{ user_id:userId, campaign_id:campaign.id, concept_id:concept.id, provider:'openai_gpt_image', job_kind:'image', status:'queued', request_spec:{ prompt, variation, platform:post.platform, ratio:'4:5' }, quote_tokens:10 }]).select().single()
  if (jobResult.error) throw jobResult.error
  const job = jobResult.data
  try {
    await supabase.from('render_jobs').update({ status:'in_progress', started_at:new Date().toISOString(), updated_at:new Date().toISOString() }).eq('id', job.id)
    const response = await fetch('/api/generate-image', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ prompt, aspectRatio:'4:5', variations:1, stylePreset:'Commercial', textOverlay:'' }) })
    const payload = await response.json()
    if (!response.ok || payload.error || !payload.images?.[0]?.url) throw new Error(payload.error || 'The image provider returned no creative output.')
    const generatedUrl = payload.images[0].url
    const mediaResponse = await fetch(generatedUrl)
    if (!mediaResponse.ok) throw new Error('The generated creative could not be saved to FloStudio.')
    const blob = await mediaResponse.blob()
    const storagePath = `media/campaign-${campaign.id}-${concept.id}-${variation}-${Date.now()}.${extensionFor(blob.type)}`
    const { error: uploadError } = await supabase.storage.from('marketing-assets').upload(storagePath, blob, { contentType:blob.type || 'image/png', upsert:true })
    if (uploadError) throw uploadError
    const { data: publicData } = supabase.storage.from('marketing-assets').getPublicUrl(storagePath)
    const asset = await createMediaAsset({ user_id:userId, kind:'image', source:'ai_image', provider:'openai_gpt_image', render_status:'completed', prompt, asset_url:publicData.publicUrl, storage_path:storagePath, campaign_post_id:post.id, campaign_id:campaign.id, concept_id:concept.id, render_job_id:job.id, metadata:{ variation, platform:post.platform, origin:'campaign-engine', ratio:'4:5' }, completed_at:new Date().toISOString() })
    await supabase.from('campaign_media').insert([{ user_id:userId, campaign_id:campaign.id, concept_id:concept.id, media_asset_id:asset.id, role:'variant' }])
    await supabase.from('render_jobs').update({ status:'completed', settled_tokens:10, media_asset_id:asset.id, completed_at:new Date().toISOString(), updated_at:new Date().toISOString() }).eq('id', job.id)
    return asset
  } catch (error) {
    await supabase.from('render_jobs').update({ status:'failed', failure_message:error.message || 'Campaign render failed', updated_at:new Date().toISOString() }).eq('id', job.id)
    throw error
  }
}

export async function listCampaignConcepts(campaignId) {
  const response = await supabase.from('campaign_concepts').select('*').eq('campaign_id', campaignId).order('created_at')
  if (response.error) throw response.error
  return response.data || []
}

export async function listCampaignMedia(campaignId) {
  const response = await supabase.from('media_assets').select('*').eq('campaign_id', campaignId).order('created_at', { ascending:false })
  if (response.error) throw response.error
  return response.data || []
}
