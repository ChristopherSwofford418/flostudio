import { supabase } from '../supabase'
import { recordMemoryEvent } from './creativeMemory'
import { buildRunbookCheckpoints, buildLearningSummary, getNextMeaningfulAction } from './campaignMomentum'

const one = async query => {
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function ensureCampaignRunbook({ workspaceId, userId, productId, campaignId }) {
  if (!workspaceId || !userId || !productId || !campaignId) throw new Error('A workspace, owner, product, and campaign are required for a Campaign Runbook.')
  const existing = await one(supabase.from('campaign_runbooks').select('*').eq('campaign_id', campaignId).maybeSingle())
  if (existing) return existing
  const runbook = await one(supabase.from('campaign_runbooks').insert([{
    workspace_id:workspaceId, user_id:userId, product_id:productId, campaign_id:campaignId, status:'active',
  }]).select().single())
  return runbook
}

export async function listCampaignRunbooks({ workspaceId, userId, productId }) {
  if (!workspaceId || !userId) return []
  let query = supabase.from('campaign_runbooks').select('*').eq('workspace_id', workspaceId).eq('user_id', userId).order('updated_at', { ascending:false })
  if (productId) query = query.eq('product_id', productId)
  return one(query)
}

export async function setRunbookStatus({ runbook, status, outcomeStatement, chosenFocus }) {
  const allowed = ['active', 'paused', 'completed', 'archived']
  if (!allowed.includes(status)) throw new Error('Choose a valid Campaign Runbook state.')
  const now = new Date().toISOString()
  const updates = {
    status,
    ...(outcomeStatement !== undefined ? { outcome_statement:outcomeStatement.trim() || null } : {}),
    ...(chosenFocus !== undefined ? { chosen_focus:chosenFocus.trim() || null } : {}),
    ...(status === 'archived' ? { archived_at:now } : { archived_at:null }),
    ...(status === 'completed' ? { completed_at:now } : {}),
  }
  const saved = await one(supabase.from('campaign_runbooks').update(updates).eq('id', runbook.id).eq('workspace_id', runbook.workspace_id).eq('user_id', runbook.user_id).select().single())
  const eventType = status === 'paused' ? 'runbook_paused' : status === 'archived' ? 'runbook_archived' : status === 'active' ? 'runbook_reopened' : null
  if (eventType) await recordMemoryEvent({ userId:runbook.user_id, productId:runbook.product_id, campaignId:runbook.campaign_id, eventType, attributes:{ runbookId:runbook.id, status }, note:`Campaign Runbook ${status}.` })
  return saved
}

export async function setRunbookProgressVisibility({ runbook, progressHidden }) {
  const saved = await one(supabase.from('campaign_runbooks').update({
    stage_overrides:{ ...(runbook.stage_overrides || {}), progressHidden:Boolean(progressHidden) },
  }).eq('id', runbook.id).eq('workspace_id', runbook.workspace_id).eq('user_id', runbook.user_id).select().single())
  return saved
}

export async function saveRunbookReflection({ runbookId, userId, kind, prompt, response }) {
  if (!response?.trim()) throw new Error('Add a short reflection before saving it.')
  return one(supabase.from('campaign_runbook_reflections').insert([{ runbook_id:runbookId, user_id:userId, kind, prompt, response:response.trim() }]).select().single())
}

export async function saveCampaignReviewDecision({ workspaceId, userId, productId, campaignId, runbookId, targetType, targetId, decision, reason }) {
  if (!['campaign_post', 'media_asset'].includes(targetType)) throw new Error('Choose a post or media asset to review.')
  if (!['approved', 'needs_revision', 'rejected', 'on_hold'].includes(decision)) throw new Error('Choose a valid review decision.')
  const targetTable = targetType === 'campaign_post' ? 'campaign_posts' : 'media_assets'
  const target = await one(supabase.from(targetTable).select('id,campaign_id').eq('id', targetId).maybeSingle())
  if (!target || target.campaign_id !== campaignId) throw new Error('This review target is not linked to the selected campaign.')
  const saved = await one(supabase.from('campaign_review_decisions').insert([{
    workspace_id:workspaceId, user_id:userId, product_id:productId, campaign_id:campaignId, runbook_id:runbookId || null,
    target_type:targetType, campaign_post_id:targetType === 'campaign_post' ? targetId : null,
    media_asset_id:targetType === 'media_asset' ? targetId : null,
    decision, reason:reason?.trim() || null,
  }]).select().single())
  await recordMemoryEvent({ userId, productId, campaignId, mediaAssetId:targetType === 'media_asset' ? targetId : null, eventType:'review_decision_recorded', attributes:{ reviewId:saved.id, decision, targetType, targetId }, note:reason?.trim() || 'A human review decision was recorded.' })
  return saved
}

export async function saveLearningStatement({ runbook, experiment, variantId, whatChanged, evidenceSummary, nextAction }) {
  if (![whatChanged, evidenceSummary, nextAction].every(value => value?.trim())) throw new Error('Complete all three Learning Statement fields before saving.')
  const payload = {
    runbook_id:runbook.id, experiment_id:experiment.id, experiment_variant_id:variantId || null,
    workspace_id:runbook.workspace_id, user_id:runbook.user_id, product_id:runbook.product_id, campaign_id:runbook.campaign_id,
    what_changed:whatChanged.trim(), evidence_summary:evidenceSummary.trim(), next_action:nextAction.trim(),
  }
  const saved = await one(supabase.from('experiment_learning_statements').upsert(payload, { onConflict:'runbook_id,experiment_id' }).select().single())
  await recordMemoryEvent({ userId:runbook.user_id, productId:runbook.product_id, campaignId:runbook.campaign_id, eventType:'learning_statement_saved', attributes:{ runbookId:runbook.id, experimentId:experiment.id, learningStatementId:saved.id }, note:'An operator saved an evidence-backed Learning Statement.' })
  return saved
}

export async function promoteLearningToCreativeMemory({ runbook, learningStatement, experiment, selectedConcept }) {
  if (!learningStatement?.id) throw new Error('Save a Learning Statement before promoting it.')
  const summary = buildLearningSummary({ campaign:{ id:runbook.campaign_id }, selectedConcept, experiment, variants:experiment?.experiment_variants, reflection:learningStatement })
  if (summary.status !== 'evidence_backed') throw new Error('This learning still needs a linked sourced observation and complete statement.')
  const saved = await one(supabase.from('experiment_learning_statements').update({ promoted_at:new Date().toISOString() }).eq('id', learningStatement.id).eq('user_id', runbook.user_id).select().single())
  await recordMemoryEvent({ userId:runbook.user_id, productId:runbook.product_id, campaignId:runbook.campaign_id, conceptId:selectedConcept?.id || null, eventType:'runbook_learning_promoted', attributes:{ runbookId:runbook.id, experimentId:experiment.id, learningStatementId:saved.id, summary }, note:'The operator explicitly promoted a Campaign Runbook learning to Creative Memory.' })
  return saved
}

export async function loadCampaignRunbookContext({ workspaceId, userId, productId, campaignId }) {
  if (!workspaceId || !userId || !productId || !campaignId) return null
  const [runbook, campaign, product, concepts, posts, assets, reviews, experiments, reflections, learningStatements, memoryEvents] = await Promise.all([
    one(supabase.from('campaign_runbooks').select('*').eq('campaign_id', campaignId).maybeSingle()),
    one(supabase.from('campaigns').select('*').eq('id', campaignId).eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle()),
    one(supabase.from('products').select('*').eq('id', productId).eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle()),
    one(supabase.from('campaign_concepts').select('*').eq('campaign_id', campaignId).eq('user_id', userId).order('created_at')),
    one(supabase.from('campaign_posts').select('*').eq('campaign_id', campaignId).eq('workspace_id', workspaceId).order('created_at')),
    one(supabase.from('media_assets').select('*').eq('campaign_id', campaignId).eq('workspace_id', workspaceId).eq('user_id', userId).order('created_at')),
    one(supabase.from('campaign_review_decisions').select('*').eq('campaign_id', campaignId).eq('workspace_id', workspaceId).eq('user_id', userId).order('created_at')),
    one(supabase.from('marketing_experiments').select('*, experiment_variants(*)').eq('campaign_id', campaignId).eq('workspace_id', workspaceId).eq('user_id', userId).order('created_at')),
    one(supabase.from('campaign_runbook_reflections').select('*').eq('user_id', userId).order('created_at')),
    one(supabase.from('experiment_learning_statements').select('*').eq('workspace_id', workspaceId).eq('user_id', userId).eq('product_id', productId).order('updated_at', { ascending:false })),
    one(supabase.from('creative_memory_events').select('*').eq('campaign_id', campaignId).eq('user_id', userId).order('created_at')),
  ])
  const campaignReflections = (reflections || []).filter(reflection => reflection.runbook_id === runbook?.id)
  const brand = campaign?.brand_id ? await one(supabase.from('brands').select('*').eq('id', campaign.brand_id).eq('user_id', userId).maybeSingle()) : null
  const checkpoints = buildRunbookCheckpoints({ brand, product, campaign, concepts, campaignPosts:posts, mediaAssets:assets, reviews, experiments, memoryEvents, reflections:campaignReflections, learningStatements, runbook })
  return { runbook, brand, product, campaign, concepts:concepts || [], campaignPosts:posts || [], mediaAssets:assets || [], reviews:reviews || [], experiments:experiments || [], reflections:campaignReflections, learningStatements:learningStatements || [], memoryEvents:memoryEvents || [], checkpoints, nextAction:getNextMeaningfulAction({ checkpoints, campaign, experiments, runbook }) }
}

export async function loadPortfolioMomentumOverview({ workspaceId, userId, apps }) {
  if (!workspaceId || !userId) return []
  const [runbooks, campaigns, concepts, assets, reviews, experiments, learningStatements, memoryEvents] = await Promise.all([
    listCampaignRunbooks({ workspaceId, userId }),
    one(supabase.from('campaigns').select('*').eq('workspace_id', workspaceId).eq('user_id', userId).order('updated_at', { ascending:false })),
    one(supabase.from('campaign_concepts').select('*').eq('user_id', userId).order('created_at')),
    one(supabase.from('media_assets').select('*').eq('workspace_id', workspaceId).eq('user_id', userId).in('render_status', ['ready', 'completed']).order('created_at')),
    one(supabase.from('campaign_review_decisions').select('*').eq('workspace_id', workspaceId).eq('user_id', userId).order('created_at')),
    one(supabase.from('marketing_experiments').select('*, experiment_variants(*)').eq('workspace_id', workspaceId).eq('user_id', userId).order('created_at')),
    one(supabase.from('experiment_learning_statements').select('*').eq('workspace_id', workspaceId).eq('user_id', userId).order('updated_at', { ascending:false })),
    one(supabase.from('creative_memory_events').select('*').eq('user_id', userId).order('created_at')),
  ])
  return (apps || []).map(product => {
    const productCampaigns = (campaigns || []).filter(campaign => campaign.product_id === product.id)
    const runbook = (runbooks || []).find(item => item.product_id === product.id && item.status !== 'archived') || (runbooks || []).find(item => item.product_id === product.id) || null
    const campaign = productCampaigns.find(item => item.id === runbook?.campaign_id) || productCampaigns[0] || null
    if (!campaign) return { product, runbook:null, campaign:null, checkpoints:[], nextAction:{ label:'Start a campaign from product facts', target:'truth', whyNow:'No durable campaign exists for this product yet.' }, lastVerifiedLearningAt:null }
    const scopedExperiments = (experiments || []).filter(experiment => experiment.campaign_id === campaign.id)
    const scopedStatements = (learningStatements || []).filter(statement => statement.campaign_id === campaign.id)
    const checkpointList = buildRunbookCheckpoints({
      brand:{ id:product.brand_id, name:product.name, brand_dna:product.brandDna || {} }, product, campaign,
      concepts:(concepts || []).filter(concept => concept.campaign_id === campaign.id), campaignPosts:[],
      mediaAssets:(assets || []).filter(asset => asset.campaign_id === campaign.id), reviews:(reviews || []).filter(review => review.campaign_id === campaign.id),
      experiments:scopedExperiments, memoryEvents:(memoryEvents || []).filter(event => event.campaign_id === campaign.id || event.product_id === product.id), learningStatements:scopedStatements, runbook,
    })
    const latestLearning = scopedStatements.find(statement => statement.what_changed && statement.evidence_summary && statement.next_action)
    return { product, runbook, campaign, checkpoints:checkpointList, nextAction:getNextMeaningfulAction({ checkpoints:checkpointList, campaign, experiments:scopedExperiments, runbook }), lastVerifiedLearningAt:latestLearning?.updated_at || latestLearning?.created_at || null, learningStatements:scopedStatements }
  })
}

export async function saveLearningReusePreference({ workspaceId, userId, targetProductId, sourceLearningStatementId, status = 'dismissed' }) {
  return one(supabase.from('campaign_learning_reuse_preferences').upsert({ workspace_id:workspaceId, user_id:userId, target_product_id:targetProductId, source_learning_statement_id:sourceLearningStatementId, status }, { onConflict:'user_id,target_product_id,source_learning_statement_id' }).select().single())
}

export async function listLearningReusePreferences({ workspaceId, userId }) {
  if (!workspaceId || !userId) return []
  return one(supabase.from('campaign_learning_reuse_preferences').select('*').eq('workspace_id', workspaceId).eq('user_id', userId))
}
