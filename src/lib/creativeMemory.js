import { supabase } from '../supabase'

const labels = {
  brand_dna_saved:'Brand DNA saved', product_ingested:'Product facts captured', campaign_created:'Campaign created', concept_generated:'Campaign angles created', concept_selected:'Creative thesis selected', post_created:'Platform post created', asset_rendered:'Creative variant rendered', asset_attached:'Creative attached', post_approved:'Human approval', post_rejected:'Human rejection', post_rewritten:'Copy revised', campaign_scheduled:'Campaign scheduled', outcome_recorded:'Outcome recorded', experiment_created:'Experiment planned', variant_created:'Experiment variant created', experiment_outcome_recorded:'Verified experiment outcome recorded',
}

export async function recordMemoryEvent({ userId, brandId, productId, campaignId, conceptId, mediaAssetId, eventType, attributes = {}, note = '', source = 'flo_product' }) {
  let resolvedBrandId = brandId
  let resolvedProductId = productId
  if (campaignId && (!resolvedBrandId || !resolvedProductId)) {
    const { data } = await supabase.from('campaigns').select('brand_id, product_id').eq('id', campaignId).maybeSingle()
    resolvedBrandId ||= data?.brand_id || null
    resolvedProductId ||= data?.product_id || null
  }
  const { data, error } = await supabase.from('creative_memory_events').insert([{
    user_id:userId, brand_id:resolvedBrandId || null, product_id:resolvedProductId || null, campaign_id:campaignId || null, concept_id:conceptId || null, media_asset_id:mediaAssetId || null, event_type:eventType, attributes, note, source,
  }]).select().single()
  if (error) throw error
  return data
}

const eventCount = (events, type) => events.filter(event => event.event_type === type).length

export async function buildNextBestCreative({ userId, brandId }) {
  if (!userId || !brandId) return null
  const [{ data:events, error:eventsError }, { data:brand }, { data:campaigns }, { data:concepts }] = await Promise.all([
    supabase.from('creative_memory_events').select('*').eq('user_id', userId).eq('brand_id', brandId).order('created_at', { ascending:false }).limit(80),
    supabase.from('brands').select('name, brand_dna').eq('id', brandId).maybeSingle(),
    supabase.from('campaigns').select('id, name, objective, status, offer_text, created_at').eq('user_id', userId).eq('brand_id', brandId).order('created_at', { ascending:false }).limit(12),
    supabase.from('campaign_concepts').select('id, campaign_id, title, angle, hook, proof, cta, status, created_at').eq('user_id', userId).order('created_at', { ascending:false }).limit(80),
  ])
  if (eventsError) throw eventsError
  const brandCampaignIds = new Set((campaigns || []).map(campaign => campaign.id))
  const scopedConcepts = (concepts || []).filter(concept => brandCampaignIds.has(concept.campaign_id))
  const selected = scopedConcepts.filter(concept => concept.status === 'selected')
  const approvals = eventCount(events || [], 'post_approved')
  const rejections = eventCount(events || [], 'post_rejected')
  const variants = eventCount(events || [], 'asset_rendered')
  const posts = eventCount(events || [], 'post_created')
  const outcomes = eventCount(events || [], 'experiment_outcome_recorded') + eventCount(events || [], 'outcome_recorded')
  const latest = selected[0]
  const evidence = []
  if (selected.length) evidence.push(`${selected.length} creative thesis${selected.length === 1 ? '' : 'es'} selected by a human`)
  if (variants) evidence.push(`${variants} real creative variant${variants === 1 ? '' : 's'} rendered`)
  if (posts) evidence.push(`${posts} platform post${posts === 1 ? '' : 's'} created`)
  if (outcomes) evidence.push(`${outcomes} verified outcome${outcomes === 1 ? '' : 's'} recorded`)
  if (approvals || rejections) evidence.push(`${approvals} approval${approvals === 1 ? '' : 's'} / ${rejections} rejection${rejections === 1 ? '' : 's'} recorded`)
  const state = evidence.length ? (approvals + rejections >= 3 ? 'Learning from decisions' : 'Early creative memory') : 'Memory begins with the first decision'
  let headline = 'Create a first campaign to give Flo something real to learn from.'
  let nextAction = 'Build one product-to-campaign run, choose a thesis, and approve or revise the resulting posts.'
  let rationale = 'Flo will not claim that a creative will perform before it has observed your brand choices or connected-channel outcomes.'
  if (latest && approvals >= rejections) {
    headline = `Extend “${latest.title}” with a fresh proof-led visual variation.`
    nextAction = `Keep the ${latest.angle || 'selected'} angle, vary the product proof or opening visual, and send the next variant to review.`
    rationale = `The recommendation is based on your selected thesis${approvals ? ` and ${approvals} recorded approval${approvals === 1 ? '' : 's'}` : ''}; it is not a performance prediction.`
  } else if (latest && rejections > approvals) {
    headline = `Keep the audience, but revise the hook in “${latest.title}.”`
    nextAction = 'Create a controlled alternative that changes one element—hook, proof, or visual opening—rather than regenerating blindly.'
    rationale = `${rejections} rejection${rejections === 1 ? '' : 's'} indicate that the current expression needs review; Flo preserves the decision trail for comparison.`
  } else if (latest) {
    headline = `Turn “${latest.title}” into the first controlled visual test.`
    nextAction = 'Render 2–3 variants from the same creative thesis, attach them to matching platform posts, and record the human review decision.'
    rationale = 'Flo has a selected campaign direction but not enough approval or outcome evidence to rank it as a winner.'
  }
  const guidance = { state, headline, nextAction, rationale, evidence, brandName:brand?.name || 'This brand', updatedAt:new Date().toISOString() }
  await supabase.from('brand_memory_snapshots').upsert({ user_id:userId, brand_id:brandId, learning_state:{ approvals, rejections, variants, posts, outcomes, selectedConcepts:selected.length, campaigns:(campaigns || []).length }, guidance, evidence_count:evidence.length, updated_at:new Date().toISOString() }, { onConflict:'brand_id' })
  return guidance
}

export const memoryEventLabel = type => labels[type] || type.replaceAll('_',' ')
