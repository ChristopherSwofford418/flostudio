import { supabase } from '../supabase'
import { recordMemoryEvent } from './creativeMemory'

export async function listExperiments({ workspaceId, userId }) {
  if (!workspaceId || !userId) return []
  const { data, error } = await supabase
    .from('marketing_experiments')
    .select('*, experiment_variants(*)')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .order('created_at', { ascending:false })
  if (error) throw error
  return (data || []).map(experiment => ({
    ...experiment,
    experiment_variants:(experiment.experiment_variants || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
  }))
}

export async function createExperiment({ workspaceId, userId, productId, campaignId, title, channel, objective, primaryMetric, hypothesis }) {
  const { data, error } = await supabase.from('marketing_experiments').insert([{
    workspace_id:workspaceId, user_id:userId, product_id:productId, campaign_id:campaignId || null,
    title:title.trim(), channel, objective, primary_metric:primaryMetric.trim(), hypothesis:hypothesis.trim(), status:'planned',
  }]).select().single()
  if (error) throw error
  await recordMemoryEvent({ userId, productId, campaignId, eventType:'experiment_created', attributes:{ experimentId:data.id, title:data.title, channel:data.channel, objective:data.objective, primaryMetric:data.primary_metric, hypothesis:data.hypothesis }, note:'A controlled marketing experiment was planned.' })
  return data
}

export async function addExperimentVariant({ experiment, userId, label, changeSummary, hypothesis, isControl, mediaAssetId, conceptId }) {
  if (!label?.trim() || !changeSummary?.trim()) throw new Error('Name the variant and describe the one variable it changes.')
  if (mediaAssetId) {
    const { data:asset, error:assetError } = await supabase.from('media_assets').select('id,workspace_id,product_id,campaign_id,render_status,metadata').eq('id', mediaAssetId).maybeSingle()
    if (assetError) throw assetError
    if (!asset || asset.workspace_id !== experiment.workspace_id || asset.product_id !== experiment.product_id || !['ready', 'completed'].includes(asset.render_status)) throw new Error('Choose a completed asset that belongs to this app and workspace.')
    if (!asset.metadata?.change_summary?.trim()) throw new Error('Save the asset’s change summary before attaching it to a controlled experiment.')
  }
  const { data, error } = await supabase.from('experiment_variants').insert([{
    experiment_id:experiment.id, workspace_id:experiment.workspace_id, user_id:userId,
    label:label.trim(), change_summary:changeSummary.trim(), hypothesis:hypothesis.trim() || null,
    is_control:Boolean(isControl), status:'draft', media_asset_id:mediaAssetId || null, concept_id:conceptId || null,
  }]).select().single()
  if (error) throw error
  await recordMemoryEvent({ userId, productId:experiment.product_id, campaignId:experiment.campaign_id, eventType:'variant_created', attributes:{ experimentId:experiment.id, variantId:data.id, label:data.label, changeSummary:data.change_summary, isControl:data.is_control }, note:'A controlled variant was added to an experiment.' })
  return data
}

export async function recordExperimentOutcome({ experiment, variant, userId, outcomeValue, outcomeUnit, outcomeSource, observedAt, decision }) {
  const numericValue = Number(outcomeValue)
  if (!Number.isFinite(numericValue)) throw new Error('Enter a real numeric result before recording an outcome.')
  if (!outcomeUnit?.trim()) throw new Error('Add the observation unit before recording an outcome.')
  if (!outcomeSource?.trim()) throw new Error('Name the source used for this observation.')
  if (!observedAt) throw new Error('Add when the observation was made.')
  if (!['winner', 'loser', 'inconclusive', 'needs_more_evidence'].includes(decision)) throw new Error('Choose a valid outcome decision.')
  const storedStatus = decision === 'needs_more_evidence' ? 'inconclusive' : decision
  const metrics = {
    ...(variant.metrics || {}),
    latest:{ value:numericValue, unit:outcomeUnit.trim(), source:outcomeSource.trim(), observedAt, decision },
    observations:[...(Array.isArray(variant.metrics?.observations) ? variant.metrics.observations : []), { value:numericValue, unit:outcomeUnit.trim(), source:outcomeSource.trim(), observedAt, decision }].slice(-20),
  }
  const { data, error } = await supabase.from('experiment_variants').update({ metrics, status:storedStatus, decision_note:decision === 'needs_more_evidence' ? 'needs_more_evidence' : null, updated_at:new Date().toISOString() }).eq('id', variant.id).eq('experiment_id', experiment.id).eq('workspace_id', experiment.workspace_id).eq('user_id', userId).select().single()
  if (error) throw error
  await recordMemoryEvent({ userId, productId:experiment.product_id, campaignId:experiment.campaign_id, eventType:'experiment_outcome_recorded', attributes:{ experimentId:experiment.id, variantId:variant.id, value:numericValue, unit:metrics.latest.unit, source:metrics.latest.source, observedAt:metrics.latest.observedAt, decision }, note:'A human recorded a sourced numeric experiment outcome.' })
  return data
}

export async function setExperimentStatus({ experimentId, status }) {
  const { data, error } = await supabase.from('marketing_experiments').update({ status, updated_at:new Date().toISOString() }).eq('id', experimentId).select().single()
  if (error) throw error
  return data
}
