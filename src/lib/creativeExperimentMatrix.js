import { supabase } from '../supabase'
import { createExperiment, addExperimentVariant } from './experiments'
import { recordMemoryEvent } from './creativeMemory'
import { castingProfile, voiceProfile } from './ugcCasting'

const MAX_MATRIX_CELLS = 12

function cleanList(values, limit = 3) {
  return [...new Set((values || []).map(value => String(value || '').trim()).filter(Boolean))].slice(0, limit)
}

function matrixRecipe({ hooks, actorIds, voiceIds, format, placement }) {
  const normalizedHooks = cleanList(hooks, 3)
  const normalizedActors = cleanList(actorIds, 4)
  const normalizedVoices = cleanList(voiceIds, 3)
  if (!normalizedHooks.length) throw new Error('Add at least one hook before creating a creative matrix.')
  if (!normalizedActors.length) throw new Error('Choose at least one synthetic actor for the matrix.')
  if (!normalizedVoices.length) throw new Error('Choose at least one voice style for the matrix.')

  const cells = []
  for (const hook of normalizedHooks) {
    for (const actorId of normalizedActors) {
      for (const voiceId of normalizedVoices) {
        cells.push({ hook, actorId, voiceId, format, placement })
      }
    }
  }
  if (cells.length > MAX_MATRIX_CELLS) {
    throw new Error(`Keep the matrix to ${MAX_MATRIX_CELLS} variants or fewer. Reduce hooks, actors, or voices to preserve a controlled test.`)
  }
  return cells
}

export function estimateMatrixCells({ hooks, actorIds, voiceIds }) {
  return cleanList(hooks, 3).length * cleanList(actorIds, 4).length * cleanList(voiceIds, 3).length
}

export async function createCreativeExperimentMatrix({
  workspaceId,
  userId,
  productId,
  campaignId,
  title,
  objective,
  primaryMetric,
  hypothesis,
  hooks,
  actorIds,
  voiceIds,
  format = '9:16',
  placement = 'paid_social',
}) {
  if (!workspaceId || !userId || !productId) throw new Error('Choose a signed-in workspace and portfolio app before creating a matrix.')
  const cells = matrixRecipe({ hooks, actorIds, voiceIds, format, placement })
  const experiment = await createExperiment({
    workspaceId,
    userId,
    productId,
    campaignId,
    title: title.trim(),
    channel: placement,
    objective,
    primaryMetric: primaryMetric.trim(),
    hypothesis: hypothesis.trim(),
  })

  const inputs = {
    hooks: cleanList(hooks, 3),
    actorIds: cleanList(actorIds, 4),
    voiceIds: cleanList(voiceIds, 3),
    format,
    placement,
    plannedCellCount: cells.length,
  }
  const { data: matrix, error: matrixError } = await supabase
    .from('creative_experiment_matrices')
    .insert([{ workspace_id:workspaceId, user_id:userId, product_id:productId, campaign_id:campaignId || null, experiment_id:experiment.id, title:title.trim(), inputs, status:'planned' }])
    .select()
    .single()
  if (matrixError) throw matrixError

  const createdCells = []
  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells[index]
    const actor = castingProfile(cell.actorId)
    const voice = voiceProfile(cell.voiceId)
    const variant = await addExperimentVariant({
      experiment,
      userId,
      label:`${String.fromCharCode(65 + index)} · ${actor.name} · ${voice.shortName}`,
      changeSummary:`Hook: “${cell.hook}” · Actor: ${actor.name} · Voice: ${voice.name} · ${cell.format} · ${cell.placement}`,
      hypothesis:`Test the ${actor.name} / ${voice.name} delivery of the hook “${cell.hook}”.`,
      isControl:index === 0,
    })
    const lineage = {
      appId:productId,
      campaignId:campaignId || null,
      experimentId:experiment.id,
      matrixId:matrix.id,
      hook:cell.hook,
      actorId:actor.id,
      voiceId:voice.id,
      format:cell.format,
      placement:cell.placement,
      createdFrom:'creative_experiment_matrix',
    }
    const { data: createdCell, error: cellError } = await supabase
      .from('creative_experiment_cells')
      .insert([{ matrix_id:matrix.id, experiment_variant_id:variant.id, workspace_id:workspaceId, user_id:userId, product_id:productId, sequence:index + 1, hook:cell.hook, actor_id:actor.id, actor_name:actor.name, voice_id:voice.id, voice_name:voice.name, format:cell.format, placement:cell.placement, lineage }])
      .select()
      .single()
    if (cellError) throw cellError
    createdCells.push(createdCell)
  }

  await recordMemoryEvent({
    userId,
    productId,
    campaignId,
    eventType:'creative_experiment_matrix_created',
    attributes:{ matrixId:matrix.id, experimentId:experiment.id, cellCount:createdCells.length, ...inputs },
    note:'A controlled Creative Experiment Matrix was created from app-scoped hooks, actors, voices, and placement settings.',
  })
  return { matrix, experiment, cells:createdCells }
}

export async function listCreativeExperimentMatrices({ workspaceId, userId, productId }) {
  if (!workspaceId || !userId) return []
  let query = supabase
    .from('creative_experiment_matrices')
    .select('*, creative_experiment_cells(*, experiment_variants(*)), marketing_experiments(*)')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .order('created_at', { ascending:false })
  if (productId) query = query.eq('product_id', productId)
  const { data, error } = await query
  if (error) throw error
  return (data || []).map(matrix => ({
    ...matrix,
    creative_experiment_cells:(matrix.creative_experiment_cells || []).sort((a, b) => a.sequence - b.sequence),
  }))
}

export function matrixReadiness(matrix) {
  const cells = matrix?.creative_experiment_cells || []
  const ready = cells.filter(cell => cell.render_state === 'ready').length
  const approved = cells.filter(cell => cell.review_state === 'approved').length
  return { planned:cells.length, ready, approved, remaining:Math.max(0, cells.length - approved) }
}
