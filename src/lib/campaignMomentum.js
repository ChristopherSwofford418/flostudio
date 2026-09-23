export const RUNBOOK_STAGES = [
  {
    key:'product_truth',
    number:'01',
    label:'Product truth',
    whyItMatters:'The campaign starts with product facts and guardrails the operator can correct.',
    actionLabel:'Complete product truth',
    actionTarget:'truth',
  },
  {
    key:'creative_thesis',
    number:'02',
    label:'Creative thesis',
    whyItMatters:'A chosen hook, proof, CTA, and visual direction make the strategic decision inspectable.',
    actionLabel:'Choose a thesis',
    actionTarget:'thesis',
  },
  {
    key:'creative_family',
    number:'03',
    label:'Creative family',
    whyItMatters:'A controlled family makes it possible to compare related work instead of collecting disconnected files.',
    actionLabel:'Attach two completed variants',
    actionTarget:'family',
  },
  {
    key:'human_review',
    number:'04',
    label:'Human review',
    whyItMatters:'A real review decision records what is safe, useful, or needs revision without publishing automatically.',
    actionLabel:'Record review decisions',
    actionTarget:'review',
  },
  {
    key:'controlled_experiment',
    number:'05',
    label:'Controlled experiment',
    whyItMatters:'A control, a single-variable challenger, and a metric turn a creative preference into a testable choice.',
    actionLabel:'Plan a controlled test',
    actionTarget:'experiment',
  },
  {
    key:'verified_learning',
    number:'06',
    label:'Verified learning',
    whyItMatters:'A sourced observation and operator interpretation preserve a defensible lesson, including an inconclusive one.',
    actionLabel:'Record an observation',
    actionTarget:'learning',
  },
  {
    key:'reusable_runbook',
    number:'07',
    label:'Reusable runbook',
    whyItMatters:'A saved learning stays editable and can be deliberately reused as a source-linked draft later.',
    actionLabel:'Review the learning',
    actionTarget:'reuse',
  },
]

const asArray = value => Array.isArray(value) ? value : []
const hasText = value => typeof value === 'string' && value.trim().length > 0
const isCompletedAsset = asset => ['ready', 'completed'].includes(asset?.render_status) && Boolean(asset?.asset_url)
const numericObservation = variant => {
  const latest = variant?.metrics?.latest
  if (!latest || !Number.isFinite(Number(latest.value)) || !hasText(latest.source) || !latest.observedAt) return null
  return latest
}

function checkpoint(stage, values = {}) {
  return {
    key:stage.key,
    number:stage.number,
    label:stage.label,
    status:'available',
    completionReason:'No evidence has been linked yet.',
    whyItMatters:stage.whyItMatters,
    evidence:[],
    nextAction:{ label:stage.actionLabel, target:stage.actionTarget },
    allowedActions:['open_evidence'],
    blockedReason:'',
    ...values,
  }
}

function productTruthEvidence({ brand, product, memoryEvents }) {
  const dna = brand?.brand_dna || brand?.brandDna || {}
  const facts = product?.source_facts || product?.sourceFacts || {}
  const hasProductContext = Boolean(
    hasText(product?.description) || hasText(product?.audience) || hasText(product?.offer_text) ||
    asArray(product?.proof_points).length || Object.keys(facts).some(key => key !== 'autopilot' && Boolean(facts[key]))
  )
  const hasDna = Boolean(hasText(dna.voice) || hasText(dna.visualDirection) || hasText(dna.visual_direction) || hasText(dna.proofPoints) || hasText(dna.restrictedClaims))
  const confirmation = asArray(memoryEvents).some(event => ['brand_dna_saved', 'product_ingested'].includes(event.event_type))
  const evidence = []
  if (product?.id) evidence.push({ type:'product', id:product.id, title:product.name || 'Product record', detail:hasProductContext ? 'Product context saved' : 'Product record needs context' })
  if (brand?.id) evidence.push({ type:'brand', id:brand.id, title:brand.name || 'Brand DNA', detail:hasDna ? 'Brand guardrails saved' : 'Brand guardrails need detail' })
  if (confirmation) evidence.push({ type:'memory_event', id:null, title:'Operator confirmation', detail:'A product or Brand DNA save was recorded.' })
  return { complete:Boolean(product?.id && brand?.id && hasProductContext && hasDna && confirmation), evidence, hasProductContext, hasDna, confirmation }
}

function selectedThesis(campaign, concepts) {
  const selectedId = campaign?.selected_concept_id
  return asArray(concepts).find(concept => concept.id === selectedId) || asArray(concepts).find(concept => concept.status === 'selected') || null
}

function thesisIsComplete(campaign, concept) {
  return Boolean(campaign?.id && hasText(campaign?.objective) && concept && hasText(concept.hook) && hasText(concept.proof) && hasText(concept.cta) && hasText(concept?.visual_recipe?.direction))
}

function relevantAssets(mediaAssets, campaign, concept) {
  return asArray(mediaAssets).filter(asset => {
    if (!isCompletedAsset(asset) || asset?.campaign_id !== campaign?.id) return false
    return !concept?.id || asset?.concept_id === concept.id
  })
}

function reviewForAsset(reviews, asset) {
  return asArray(reviews).find(review => review.target_type === 'media_asset' && review.media_asset_id === asset.id)
}

function validExperiment(experiment) {
  const variants = asArray(experiment?.experiment_variants)
  const control = variants.find(variant => variant.is_control && hasText(variant.change_summary))
  const challenger = variants.find(variant => !variant.is_control && hasText(variant.change_summary))
  return { control, challenger, valid:Boolean(experiment?.id && hasText(experiment?.hypothesis) && hasText(experiment?.primary_metric) && control && challenger) }
}

function statementIsComplete(statement) {
  return Boolean(statement && hasText(statement.what_changed) && hasText(statement.evidence_summary) && hasText(statement.next_action))
}

export function buildRunbookCheckpoints({ brand, product, campaign, concepts, campaignPosts, mediaAssets, reviews, experiments, memoryEvents, reflections, learningStatements, runbook } = {}) {
  const stages = RUNBOOK_STAGES
  const checkpoints = []
  const truth = productTruthEvidence({ brand, product, memoryEvents })
  checkpoints.push(checkpoint(stages[0], truth.complete ? {
    status:'complete', completionReason:'Product context, Brand DNA, and an operator save are linked to this campaign.', evidence:truth.evidence, allowedActions:['open_evidence', 'edit_truth'],
  } : {
    status:'in_progress', completionReason:'Product truth is not complete yet.', evidence:truth.evidence,
    blockedReason:!truth.hasProductContext ? 'Add usable product context before a campaign can rely on it.' : !truth.hasDna ? 'Save Brand DNA and claim restrictions before moving forward.' : 'Confirm the saved product truth with an operator save.',
    allowedActions:['open_evidence', 'edit_truth'],
  }))

  const thesis = selectedThesis(campaign, concepts)
  const thesisEvidence = thesis ? [{ type:'campaign_concept', id:thesis.id, title:thesis.title || 'Selected creative thesis', detail:`Hook: ${thesis.hook || 'missing'}` }] : []
  checkpoints.push(checkpoint(stages[1], thesisIsComplete(campaign, thesis) ? {
    status:'complete', completionReason:'A selected thesis includes objective, hook, proof, CTA, and visual direction.', evidence:thesisEvidence, allowedActions:['open_evidence', 'edit_thesis'],
  } : {
    status:truth.complete ? 'available' : 'locked', completionReason:'No complete selected thesis is linked to this campaign.', evidence:thesisEvidence,
    blockedReason:!truth.complete ? 'Complete product truth first.' : !thesis ? 'Select a creative thesis.' : 'Complete the objective, hook, proof, CTA, and visual direction.',
    allowedActions:['open_evidence', 'edit_thesis'],
  }))

  const familyAssets = relevantAssets(mediaAssets, campaign, thesis)
  const familyEvidence = familyAssets.map(asset => ({ type:'media_asset', id:asset.id, title:asset.metadata?.variation ? `Variant ${asset.metadata.variation}` : 'Completed creative variant', detail:asset.metadata?.change_summary || asset.metadata?.platform || asset.kind || 'Completed campaign-linked asset' }))
  checkpoints.push(checkpoint(stages[2], familyAssets.length >= 2 ? {
    status:'complete', completionReason:`${familyAssets.length} completed assets are linked to the selected thesis.`, evidence:familyEvidence, allowedActions:['open_evidence', 'add_asset', 'review_family'],
  } : {
    status:thesisIsComplete(campaign, thesis) ? 'in_progress' : 'locked', completionReason:'A creative family needs at least two completed campaign-linked variants.', evidence:familyEvidence,
    blockedReason:!thesisIsComplete(campaign, thesis) ? 'Select a complete thesis before building variants.' : `${familyAssets.length} of 2 completed, selected-thesis assets are linked. Queued, failed, and detached renders do not count.`,
    allowedActions:['open_evidence', 'add_asset'],
  }))

  const reviewedAssets = familyAssets.filter(asset => reviewForAsset(reviews, asset))
  const familyComplete = familyAssets.length >= 2
  const reviewComplete = familyComplete && reviewedAssets.length === familyAssets.length
  const reviewEvidence = reviewedAssets.map(asset => {
    const review = reviewForAsset(reviews, asset)
    return { type:'review', id:review.id, title:`${review.decision.replaceAll('_', ' ')} decision`, detail:review.reason || `Recorded for asset ${asset.id.slice(0, 8)}` }
  })
  checkpoints.push(checkpoint(stages[3], reviewComplete ? {
    status:'complete', completionReason:'Every completed family member has a human review decision.', evidence:reviewEvidence, allowedActions:['open_evidence', 'review_family'],
  } : {
    status:familyAssets.length >= 2 ? 'in_progress' : 'locked', completionReason:'Human review is evidence, not an inferred post status.', evidence:reviewEvidence,
    blockedReason:familyAssets.length < 2 ? 'Build the creative family before reviewing it.' : `${reviewedAssets.length} of ${familyAssets.length} completed family members have a saved review decision.`,
    allowedActions:['open_evidence', 'review_family'],
  }))

  const campaignExperiments = asArray(experiments).filter(experiment => experiment?.campaign_id === campaign?.id)
  const eligibleExperiment = campaignExperiments.map(experiment => ({ experiment, ...validExperiment(experiment) })).find(item => item.valid)
  const experimentEvidence = campaignExperiments.map(experiment => ({ type:'experiment', id:experiment.id, title:experiment.title || 'Controlled experiment', detail:validExperiment(experiment).valid ? 'Control and challenger are linked' : 'Experiment needs a control, challenger, metric, or hypothesis' }))
  const experimentComplete = Boolean(eligibleExperiment) && reviewComplete
  checkpoints.push(checkpoint(stages[4], experimentComplete ? {
    status:'complete', completionReason:'A campaign-linked experiment has a hypothesis, metric, control, and single-variable challenger summary.', evidence:experimentEvidence, allowedActions:['open_evidence', 'open_experiment'],
  } : {
    status:reviewComplete ? 'available' : 'locked', completionReason:'No controlled experiment currently satisfies the evidence rule.', evidence:experimentEvidence,
    blockedReason:!familyComplete ? 'Build a creative family before planning a controlled test.' : !reviewComplete ? 'Save a human review decision for every completed family member before crediting a controlled test.' : 'Create a campaign-linked experiment with a primary metric, one control, and one challenger with a change summary.',
    allowedActions:['open_evidence', 'open_experiment'],
  }))

  const observed = asArray(eligibleExperiment?.experiment?.experiment_variants).map(variant => ({ variant, observation:numericObservation(variant) })).filter(item => item.observation)
  const decisioned = observed.filter(({ variant }) => ['winner', 'loser', 'inconclusive'].includes(variant.status))
  const learningStatement = asArray(learningStatements).find(statement => statement.experiment_id === eligibleExperiment?.experiment?.id && statementIsComplete(statement))
  const learningEvidence = decisioned.map(({ variant, observation }) => ({ type:'observation', id:variant.id, title:`${variant.label || 'Variant'} · ${variant.status}`, detail:`${observation.value} ${observation.unit || ''} from ${observation.source}`.trim() }))
  if (learningStatement) learningEvidence.push({ type:'learning_statement', id:learningStatement.id, title:'Learning Statement', detail:learningStatement.next_action })
  const learningComplete = Boolean(experimentComplete && decisioned.length && learningStatement)
  checkpoints.push(checkpoint(stages[5], learningComplete ? {
    status:'complete', completionReason:'A sourced numeric observation, operator decision, and Learning Statement are linked.', evidence:learningEvidence, allowedActions:['open_evidence', 'record_learning'],
  } : {
    status:experimentComplete ? 'in_progress' : 'locked', completionReason:'Verified learning needs both observation evidence and an operator-written learning statement.', evidence:learningEvidence,
    blockedReason:!experimentComplete ? 'Complete the reviewed, controlled experiment stage before crediting verified learning.' : !decisioned.length ? 'Record a numeric observation with unit, source, timestamp, and decision.' : 'Save a Learning Statement describing the change, evidence, and next action.',
    allowedActions:['open_evidence', 'record_learning'],
  }))

  const reusableEvidence = learningStatement ? [{ type:'learning_statement', id:learningStatement.id, title:'Reusable learning saved', detail:learningStatement.promoted_at ? 'Promoted to Creative Memory by the operator.' : 'Available to promote to Creative Memory or keep in the runbook.' }] : []
  checkpoints.push(checkpoint(stages[6], learningComplete ? {
    status:'complete', completionReason:'The runbook contains an editable Learning Statement; promotion to Creative Memory remains optional.', evidence:reusableEvidence, allowedActions:['open_evidence', 'promote_learning', 'archive'],
  } : {
    status:'locked', completionReason:'A reusable runbook begins after verified learning is written.', evidence:reusableEvidence,
    blockedReason:'Save a verified Learning Statement first.', allowedActions:['open_evidence', 'record_learning'],
  }))

  if (runbook?.status === 'paused') return checkpoints.map(item => item.status === 'complete' ? item : { ...item, status:'paused', blockedReason:'This runbook is paused. Reopen it when you are ready.' })
  if (runbook?.status === 'archived') return checkpoints.map(item => item.status === 'complete' ? item : { ...item, status:'paused', blockedReason:'This runbook is archived. Reopen it to continue.' })
  return checkpoints
}

export function getNextMeaningfulAction({ checkpoints = [], campaign, experiments = [], hasVerifiedOutcome = false, runbook } = {}) {
  if (runbook?.status === 'archived') return { label:'Reopen this runbook', target:'reopen', whyNow:'This campaign is archived. Reopen it to make any further edits.', blockedReason:'' }
  if (runbook?.status === 'paused') return { label:'Reopen this runbook', target:'reopen', whyNow:'This campaign is paused. Existing evidence remains available while work is on hold.', blockedReason:'' }
  const next = asArray(checkpoints).find(item => item.status !== 'complete' && item.status !== 'not_applicable')
  if (!next) return { label:'Review reusable learning', target:'reuse', whyNow:'All seven stages have inspectable evidence. You can retain, promote, archive, or export the runbook.', blockedReason:'' }
  return {
    label:next.nextAction?.label || 'Open the next stage',
    target:next.nextAction?.target || next.key,
    stageKey:next.key,
    whyNow:next.blockedReason || next.whyItMatters,
    blockedReason:next.status === 'locked' ? next.blockedReason : '',
  }
}

export function getCheckpointEvidence({ checkpoint, records } = {}) {
  if (!checkpoint) return []
  return asArray(checkpoint.evidence).map(evidence => ({ ...evidence, record:records?.[evidence.type]?.find?.(record => record.id === evidence.id) || null }))
}

export function canPromoteLearning({ experiment, variants, outcomeRecords, reflection } = {}) {
  const valid = validExperiment({ ...experiment, experiment_variants:variants || experiment?.experiment_variants })
  const observations = asArray(variants || experiment?.experiment_variants).map(numericObservation).filter(Boolean)
  const completeReflection = statementIsComplete(reflection)
  const allowed = Boolean(valid.valid && observations.length && completeReflection)
  return {
    allowed,
    evidence:{ experiment:Boolean(valid.valid), observations:observations.length, reflection:completeReflection },
    blockedReason:allowed ? '' : !valid.valid ? 'Use a campaign-linked hypothesis with a control and challenger first.' : !observations.length ? 'Record a numeric source-linked observation first.' : 'Save the Learning Statement before promoting it.',
  }
}

export function buildLearningSummary({ campaign, selectedConcept, experiment, variants, reflection } = {}) {
  const observations = asArray(variants || experiment?.experiment_variants).map(variant => ({ variant, observation:numericObservation(variant) })).filter(item => item.observation)
  const decision = observations.find(item => ['winner', 'loser', 'inconclusive'].includes(item.variant.status))
  const completeReflection = statementIsComplete(reflection)
  if (!campaign || !experiment || !decision || !completeReflection) {
    return {
      status:'insufficient_evidence',
      headline:'Learning is not ready to summarize.',
      summary:'Flo needs a linked campaign, controlled experiment, sourced numeric observation, operator decision, and saved Learning Statement before it can preserve a learning.',
      evidence:[],
    }
  }
  return {
    status:'evidence_backed',
    headline:reflection.next_action,
    summary:`${reflection.what_changed} Evidence recorded: ${decision.observation.value} ${decision.observation.unit || ''} from ${decision.observation.source}. Operator interpretation: ${reflection.evidence_summary}`.trim(),
    evidence:[
      { type:'campaign', id:campaign.id, title:campaign.name || 'Campaign' },
      { type:'campaign_concept', id:selectedConcept?.id || null, title:selectedConcept?.title || 'Selected thesis' },
      { type:'experiment', id:experiment.id, title:experiment.title || 'Experiment' },
      { type:'observation', id:decision.variant.id, title:`${decision.observation.value} ${decision.observation.unit || ''} · ${decision.observation.source}`.trim() },
    ],
  }
}

export function evidenceBackedStageCount(checkpoints = []) {
  const total = RUNBOOK_STAGES.length
  const completed = asArray(checkpoints).filter(checkpoint => checkpoint.status === 'complete').length
  return { completed, total, label:`${completed} of ${total} evidence-backed stages completed` }
}
