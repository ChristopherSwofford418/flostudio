export const JEV_MODEL_ID = 'jev-1.13.0'

const safeText = value => String(value || '').trim().slice(0, 6000)
const safeFacts = value => safeText(JSON.stringify(value || {})).slice(0, 8000)

export function buildJevThesisState({ product = {}, brand = {}, campaign = {}, concept = {} } = {}) {
  return {
    product: {
      name:safeText(product.name),
      description:safeText(product.description),
      audience:safeText(product.audience),
      offer:safeText(product.offer_text || product.offerText),
      verified_facts:safeFacts(product.source_facts || product.sourceFacts),
    },
    brand: {
      name:safeText(brand.name),
      voice:safeText(brand.brand_dna?.voice || brand.brandDna?.voice),
      proof_points:safeText(brand.brand_dna?.proofPoints || brand.brandDna?.proofPoints),
      restricted_claims:safeText(brand.brand_dna?.restrictedClaims || brand.brandDna?.restrictedClaims),
    },
    campaign: {
      name:safeText(campaign.name),
      objective:safeText(campaign.objective),
      platforms:Array.isArray(campaign.platforms) ? campaign.platforms.slice(0, 8).map(safeText) : [],
    },
    thesis: {
      title:safeText(concept.title),
      angle:safeText(concept.angle),
      hook:safeText(concept.hook),
      proof:safeText(concept.proof),
      cta:safeText(concept.cta),
      visual_direction:safeText(concept.visual_recipe?.direction || concept.visualDirection),
    },
    boundary:'This is decision support only. Do not treat absent product facts as true, do not infer performance, legal, medical, financial, safety, or outcome claims, and do not recommend publication or automatic action.',
  }
}

export function buildJevThesisReviewRequest(context = {}) {
  const state = buildJevThesisState(context)
  return {
    model:JEV_MODEL_ID,
    state,
    questions:{
      evidence_readiness:{
        type:'choice',
        instructions:'Which review state best describes this campaign thesis based only on the supplied product, brand, campaign, and thesis record?',
        criteria:{
          ready_for_human_review:'The thesis uses a bounded, observable product framing and does not make a claim unsupported by the supplied facts. Human review is still required.',
          needs_product_proof:'The thesis needs a clearer observable product fact or proof detail before a reviewer can assess it.',
          needs_claim_revision:'The thesis appears to make or imply a claim that is missing support, conflicts with the listed restrictions, or needs human revision.',
          needs_audience_precision:'The thesis is too broad about who it helps or when; it needs a more specific audience or situation before review.',
        },
      },
      review_focus:{
        type:'choice',
        instructions:'Which one element should a human reviewer inspect first to make this thesis more precise without inventing claims?',
        criteria:{
          hook:'The opening hook needs more precise, fact-grounded framing.',
          proof:'The product proof needs a clearer observable basis.',
          audience:'The intended audience or situation needs narrowing.',
          visual_direction:'The opening visual direction needs a clearer relationship to the actual product moment.',
          cta:'The call to action needs a clearer, proportionate next step.',
        },
      },
      controlled_test_variable:{
        type:'choice',
        instructions:'If the operator later creates a controlled creative experiment, which single variable is the safest candidate to vary first? This is not a performance prediction.',
        criteria:{
          hook:'Change only the hook while holding the product proof and CTA constant.',
          proof:'Change only the product proof framing while holding the hook and CTA constant.',
          opening_visual:'Change only the opening visual while holding the written thesis constant.',
          cta:'Change only the CTA while holding the hook and proof constant.',
          none_until_facts_improve:'Do not plan a controlled test until product facts or claim boundaries are clarified.',
        },
      },
      restricted_claim_attention:{
        type:'noul',
        instructions:'Does this thesis need explicit human attention for a restricted, outcome, safety, health, financial, legal, or otherwise unsupported claim based on the supplied facts and restrictions?',
        criteria:{
          true:'A human should inspect claim language before any generation, scheduling, publishing, or experiment setup.',
          false:'No such concern is apparent from the supplied record, but this is not a guarantee or approval.',
        },
      },
    },
  }
}

const labelMap = {
  ready_for_human_review:'Ready for human review',
  needs_product_proof:'Needs clearer product proof',
  needs_claim_revision:'Needs claim revision',
  needs_audience_precision:'Needs audience precision',
  hook:'Hook',
  proof:'Product proof',
  audience:'Audience',
  visual_direction:'Visual direction',
  cta:'Call to action',
  opening_visual:'Opening visual',
  none_until_facts_improve:'Clarify facts first',
}

export function formatJevAnswer(answer = {}, label = 'Jev decision') {
  if (answer.type === 'noul') return {
    label,
    value:Number(answer.noul || 0) >= 0.5 ? 'Human attention recommended' : 'No concern surfaced',
    detail:`Jev assessment: ${Math.round(Number(answer.noul || 0) * 100)}% yes. This is not approval or a guarantee.`,
    confidence:null,
  }
  const choice = String(answer.choice || '')
  return {
    label,
    value:labelMap[choice] || choice.replaceAll('_', ' '),
    detail:answer.confidence === undefined ? '' : `Model confidence: ${Math.round(Number(answer.confidence || 0) * 100)}%. Review the source record and probability distribution before acting.`,
    confidence:Number.isFinite(Number(answer.confidence)) ? Number(answer.confidence) : null,
  }
}

export function buildJevReviewPresentation(response = {}) {
  const answers = response.answers || {}
  return {
    model:response.model || JEV_MODEL_ID,
    usage:response.usage || null,
    cards:[
      formatJevAnswer(answers.evidence_readiness || {}, 'Evidence readiness'),
      formatJevAnswer(answers.review_focus || {}, 'Review focus'),
      formatJevAnswer(answers.controlled_test_variable || {}, 'Controlled test variable'),
      formatJevAnswer(answers.restricted_claim_attention || {}, 'Restricted-claim attention'),
    ],
  }
}
