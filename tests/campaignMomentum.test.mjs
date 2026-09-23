import test from 'node:test'
import assert from 'node:assert/strict'
import { buildLearningSummary, buildRunbookCheckpoints, canPromoteLearning, getNextMeaningfulAction } from '../src/lib/campaignMomentum.js'

const brand = { id:'brand-1', name:'Sample Brand', brand_dna:{ voice:'Specific', visualDirection:'Editorial', proofPoints:'Verified product fact', restrictedClaims:'No guarantees' } }
const product = { id:'product-1', name:'Sample Product', description:'Helps an operator organize campaign work.', audience:'Founders', offer_text:'Explore the workflow', source_facts:{ publicListing:'verified' } }
const campaign = { id:'campaign-1', product_id:'product-1', brand_id:'brand-1', name:'Evidence campaign', objective:'Learning', selected_concept_id:'concept-1' }
const concept = { id:'concept-1', campaign_id:'campaign-1', status:'selected', title:'Proof-led opening', hook:'Start with the problem.', proof:'Show the saved product workflow.', cta:'Explore the next step.', visual_recipe:{ direction:'Product-first editorial demonstration' } }
const memoryEvents = [{ id:'event-1', event_type:'brand_dna_saved' }, { id:'event-2', event_type:'product_ingested' }]
const completedAssets = [
  { id:'asset-1', campaign_id:'campaign-1', concept_id:'concept-1', render_status:'completed', asset_url:'https://example.test/a.png', kind:'image', metadata:{ change_summary:'Hook changes from question to checklist.' } },
  { id:'asset-2', campaign_id:'campaign-1', concept_id:'concept-1', render_status:'ready', asset_url:'https://example.test/b.png', kind:'image', metadata:{ change_summary:'Opening visual changes from screen to person.' } },
]
const completeReviews = [
  { id:'review-1', target_type:'media_asset', media_asset_id:'asset-1', decision:'approved' },
  { id:'review-2', target_type:'media_asset', media_asset_id:'asset-2', decision:'needs_revision' },
]
const experiment = {
  id:'experiment-1', campaign_id:'campaign-1', title:'Opening hook test', hypothesis:'If the opening hook is more specific, more people will continue.', primary_metric:'View-through rate',
  experiment_variants:[
    { id:'variant-control', label:'Control', is_control:true, change_summary:'Keep original hook.', status:'live', metrics:{} },
    { id:'variant-challenger', label:'Challenger', is_control:false, change_summary:'Change only the opening hook.', status:'winner', metrics:{ latest:{ value:42, unit:'%', source:'Verified platform export', observedAt:'2026-09-23T12:00:00.000Z' } } },
  ],
}
const reflection = { id:'learning-1', experiment_id:'experiment-1', what_changed:'Only the opening hook changed.', evidence_summary:'The sourced observation was higher for the challenger.', next_action:'Use the clearer hook as an editable starting point next time.' }

function checkpoints(overrides = {}) {
  return buildRunbookCheckpoints({
    brand, product, campaign, concepts:[concept], campaignPosts:[], mediaAssets:completedAssets, reviews:[], experiments:[experiment], memoryEvents, reflections:[], learningStatements:[],
    ...overrides,
  })
}

const byKey = (items, key) => items.find(item => item.key === key)

test('Product truth needs persisted product context, Brand DNA, and a save event', () => {
  const absent = checkpoints({ memoryEvents:[] })
  assert.equal(byKey(absent, 'product_truth').status, 'in_progress')
  assert.equal(byKey(absent, 'product_truth').evidence.length, 2)
  const complete = checkpoints()
  assert.equal(byKey(complete, 'product_truth').status, 'complete')
  assert.match(byKey(complete, 'product_truth').completionReason, /operator save/i)
})

test('Creative thesis needs a selected concept with hook, proof, CTA, and visual direction', () => {
  const incomplete = checkpoints({ concepts:[{ ...concept, cta:'' }] })
  assert.notEqual(byKey(incomplete, 'creative_thesis').status, 'complete')
  assert.equal(byKey(checkpoints(), 'creative_thesis').status, 'complete')
})

test('Creative family ignores queued, failed, and unlinked renders', () => {
  const onlyQueued = checkpoints({ mediaAssets:[{ ...completedAssets[0], render_status:'queued' }, { ...completedAssets[1], campaign_id:'other-campaign' }] })
  assert.notEqual(byKey(onlyQueued, 'creative_family').status, 'complete')
  assert.match(byKey(onlyQueued, 'creative_family').blockedReason, /0 of 2/i)
  assert.equal(byKey(checkpoints(), 'creative_family').status, 'complete')
})

test('Human review requires an actual immutable review decision for each family member', () => {
  const oneDecision = checkpoints({ reviews:[{ id:'review-1', target_type:'media_asset', media_asset_id:'asset-1', decision:'approved' }] })
  assert.notEqual(byKey(oneDecision, 'human_review').status, 'complete')
  const allDecisions = checkpoints({ reviews:completeReviews })
  assert.equal(byKey(allDecisions, 'human_review').status, 'complete')
})

test('Controlled experiment requires hypothesis, metric, control, challenger, and change summaries', () => {
  const noControl = { ...experiment, experiment_variants:experiment.experiment_variants.map(variant => ({ ...variant, is_control:false })) }
  assert.notEqual(byKey(checkpoints({ experiments:[noControl], reviews:completeReviews }), 'controlled_experiment').status, 'complete')
  assert.equal(byKey(checkpoints({ reviews:completeReviews }), 'controlled_experiment').status, 'complete')
})

test('A valid experiment remains locked until every completed creative family member is reviewed', () => {
  const gated = checkpoints()
  assert.equal(byKey(gated, 'human_review').status, 'in_progress')
  assert.equal(byKey(gated, 'controlled_experiment').status, 'locked')
  assert.equal(byKey(gated, 'verified_learning').status, 'locked')
})

test('Verified learning requires a sourced numeric observation, decision, and learning statement', () => {
  const noStatement = checkpoints({ reviews:completeReviews })
  assert.notEqual(byKey(noStatement, 'verified_learning').status, 'complete')
  const withStatement = checkpoints({ reviews:completeReviews, learningStatements:[reflection] })
  assert.equal(byKey(withStatement, 'verified_learning').status, 'complete')
  assert.equal(byKey(withStatement, 'reusable_runbook').status, 'complete')
})

test('Next meaningful action selects the earliest evidence-backed incomplete stage', () => {
  const next = getNextMeaningfulAction({ checkpoints:checkpoints() })
  assert.equal(next.stageKey, 'human_review')
  assert.match(next.whyNow, /review/i)
})

test('Learning promotion is blocked until all evidence is real and statement fields are complete', () => {
  const blocked = canPromoteLearning({ experiment, variants:experiment.experiment_variants, reflection:{ ...reflection, next_action:'' } })
  assert.equal(blocked.allowed, false)
  const allowed = canPromoteLearning({ experiment, variants:experiment.experiment_variants, reflection })
  assert.equal(allowed.allowed, true)
})

test('Learning summary never invents performance claims when evidence is insufficient', () => {
  const absent = buildLearningSummary({ campaign, selectedConcept:concept, experiment, variants:experiment.experiment_variants, reflection:{ ...reflection, evidence_summary:'' } })
  assert.equal(absent.status, 'insufficient_evidence')
  const present = buildLearningSummary({ campaign, selectedConcept:concept, experiment, variants:experiment.experiment_variants, reflection })
  assert.equal(present.status, 'evidence_backed')
  assert.match(present.summary, /42 %/) 
  assert.match(present.summary, /Verified platform export/)
})

test('Pause and archive preserve evidence while changing only unfinished stage display', () => {
  const paused = checkpoints({ runbook:{ id:'runbook-1', status:'paused' }, learningStatements:[reflection] })
  assert.equal(byKey(paused, 'product_truth').status, 'complete')
  assert.equal(byKey(paused, 'human_review').status, 'paused')
  const archived = checkpoints({ runbook:{ id:'runbook-1', status:'archived' }, learningStatements:[reflection] })
  assert.equal(byKey(archived, 'creative_family').status, 'complete')
  assert.equal(byKey(archived, 'human_review').status, 'paused')
})

test('No token, route, local fake run, or simulated success fields can advance a checkpoint', () => {
  const baseline = checkpoints({ mediaAssets:[], reviews:[], experiments:[], memoryEvents:[] })
  const injected = buildRunbookCheckpoints({ brand, product, campaign, concepts:[concept], campaignPosts:[], mediaAssets:[], reviews:[], experiments:[], memoryEvents:[], learningStatements:[], tokensSpent:9999, localRun:{ status:'success' }, simulatedSuccess:true, pageVisits:100 })
  assert.deepEqual(injected.map(item => item.status), baseline.map(item => item.status))
})
