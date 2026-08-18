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

export async function addExperimentVariant({ experiment, userId, label, changeSummary, hypothesis, isControl }) {
  const { data, error } = await supabase.from('experiment_variants').insert([{
    experiment_id:experiment.id, workspace_id:experiment.workspace_id, user_id:userId,
    label:label.trim(), change_summary:changeSummary.trim(), hypothesis:hypothesis.trim() || null,
    is_control:Boolean(isControl), status:'draft',
  }]).select().single()
  if (error) throw error
  await recordMemoryEvent({ userId, productId:experiment.product_id, campaignId:experiment.campaign_id, eventType:'variant_created', attributes:{ experimentId:experiment.id, variantId:data.id, label:data.label, changeSummary:data.change_summary, isControl:data.is_control }, note:'A controlled variant was added to an experiment.' })
  return data
}

export async function recordExperimentOutcome({ experiment, variant, userId, outcomeValue, outcomeUnit, outcomeSource, observedAt, decision }) {
  const numericValue = Number(outcomeValue)
  if (!Number.isFinite(numericValue)) throw new Error('Enter a real numeric result before recording an outcome.')
  const metrics = {
    ...(variant.metrics || {}),
    latest:{ value:numericValue, unit:outcomeUnit.trim() || experiment.primary_metric, source:outcomeSource.trim() || 'manual confirmation', observedAt:observedAt || new Date().toISOString() },
    observations:[...(Array.isArray(variant.metrics?.observations) ? variant.metrics.observations : []), { value:numericValue, unit:outcomeUnit.trim() || experiment.primary_metric, source:outcomeSource.trim() || 'manual confirmation', observedAt:observedAt || new Date().toISOString() }].slice(-20),
  }
  const { data, error } = await supabase.from('experiment_variants').update({ metrics, status:decision || variant.status, updated_at:new Date().toISOString() }).eq('id', variant.id).select().single()
  if (error) throw error
  await recordMemoryEvent({ userId, productId:experiment.product_id, campaignId:experiment.campaign_id, eventType:'experiment_outcome_recorded', attributes:{ experimentId:experiment.id, variantId:variant.id, value:numericValue, unit:metrics.latest.unit, source:metrics.latest.source, observedAt:metrics.latest.observedAt, decision:decision || variant.status }, note:'A human recorded a real experiment outcome.' })
  return data
}

export async function setExperimentStatus({ experimentId, status }) {
  const { data, error } = await supabase.from('marketing_experiments').update({ status, updated_at:new Date().toISOString() }).eq('id', experimentId).select().single()
  if (error) throw error
  return data
}
