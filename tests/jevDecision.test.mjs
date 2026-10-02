import test from 'node:test'
import assert from 'node:assert/strict'
import { JEV_MODEL_ID, buildJevReviewPresentation, buildJevThesisReviewRequest, buildJevThesisState } from '../src/lib/jevDecision.js'

const context = {
  product:{ id:'product-1', name:'PocketLawyer', description:'Self-help legal information organizer.', audience:'People organizing questions for legal self-help.', offer_text:'Explore an organizing workflow.', source_facts:{ category:'Productivity' } },
  brand:{ name:'PocketLawyer', brand_dna:{ voice:'Careful and plain', proofPoints:'Organizes self-help questions.', restrictedClaims:'Not legal advice, representation, or an attorney-client relationship.' } },
  campaign:{ id:'campaign-1', name:'Grounded thesis', objective:'Test a review-safe creative direction', platforms:['instagram'] },
  concept:{ id:'concept-1', title:'Organize the next question', angle:'Practical clarity', hook:'Start with the question you need to organize.', proof:'Show the organizing workflow.', cta:'Explore the next step.', visual_recipe:{ direction:'Product-first editorial demonstration' } },
}

test('Jev thesis request contains bounded app context and typed review decisions', () => {
  const request = buildJevThesisReviewRequest(context)
  assert.equal(request.model, JEV_MODEL_ID)
  assert.equal(request.state.product.name, 'PocketLawyer')
  assert.equal(request.questions.evidence_readiness.type, 'choice')
  assert.equal(request.questions.review_focus.type, 'choice')
  assert.equal(request.questions.controlled_test_variable.type, 'choice')
  assert.equal(request.questions.restricted_claim_attention.type, 'noul')
  assert.match(request.state.boundary, /decision support only/i)
  assert.match(request.state.boundary, /do not recommend publication or automatic action/i)
  assert.doesNotMatch(JSON.stringify(request.questions), /endpoint|checkout|render request/i)
})

test('Jev state limits text and preserves declared restrictions without inventing facts', () => {
  const state = buildJevThesisState({ ...context, product:{ ...context.product, description:'a'.repeat(7000) } })
  assert.equal(state.product.description.length, 6000)
  assert.match(state.brand.restricted_claims, /Not legal advice/i)
  assert.equal(state.product.verified_facts, '{"category":"Productivity"}')
})

test('Jev presentation retains uncertainty and never labels a decision as approval', () => {
  const presentation = buildJevReviewPresentation({
    model:'jev-1.13.0', usage:{ input_tokens:220, output_tokens:20 }, answers:{
      evidence_readiness:{ type:'choice', choice:'needs_claim_revision', confidence:.76, probabilities:{ needs_claim_revision:.84, ready_for_human_review:.16 } },
      review_focus:{ type:'choice', choice:'proof', confidence:.63, probabilities:{ proof:.7, hook:.3 } },
      controlled_test_variable:{ type:'choice', choice:'none_until_facts_improve', confidence:.92, probabilities:{ none_until_facts_improve:.96, hook:.04 } },
      restricted_claim_attention:{ type:'noul', noul:.81 },
    },
  })
  assert.equal(presentation.cards[0].value, 'Needs claim revision')
  assert.match(presentation.cards[0].detail, /76%/)
  assert.equal(presentation.cards[3].value, 'Human attention recommended')
  assert.match(presentation.cards[3].detail, /not approval/i)
  assert.doesNotMatch(JSON.stringify(presentation), /auto.?publish|approved/i)
})
