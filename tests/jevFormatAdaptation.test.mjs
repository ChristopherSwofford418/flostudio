import test from 'node:test'
import assert from 'node:assert/strict'
import { buildJevFormatCandidates, buildJevFormatShortlistRequest, buildOriginalFormatBrief, presentJevFormatShortlist, resolveJevFormatCandidate } from '../src/lib/jevFormatAdaptation.js'

const product = { name:'Auto Wizard', description:'Organizes vehicle maintenance records.', audience:'Drivers keeping up with routine maintenance.', offer_text:'Explore a maintenance workflow.', source_facts:{ category:'Utilities' } }
const examples = [
  { id:'source-1', platform:'TikTok', platform_rank:1, preview_title:'Routine reset format', source_creator:'Public creator', source_url:'https://example.com/source-1', format_pattern:'Open on an everyday friction moment, then show one simple workflow step and a low-pressure next action.', observed_evidence:'Publicly linked short-form example.', evidence_basis:'Public source page' },
  { id:'source-2', platform:'YouTube Shorts', platform_rank:2, preview_title:'Checklist format', source_creator:'Public creator', source_url:'https://example.com/source-2', format_pattern:'Use a short checklist structure with original product demonstration.', observed_evidence:'Publicly linked short-form example.', evidence_basis:'Public source page' },
]

test('Jev format request stays scoped to attributed source metadata and product facts', () => {
  const request = buildJevFormatShortlistRequest({ product, examples })
  assert.equal(request.questions.best_format.type, 'choice')
  assert.equal(Object.keys(request.questions.best_format.criteria).length, 2)
  assert.equal(request.questions.adaptation_focus.type, 'choice')
  assert.equal(request.questions.human_review_attention.type, 'noul')
  assert.match(request.state.boundary, /not a measurement of source performance/i)
  assert.match(request.state.boundary, /do not reproduce/i)
})

test('Original format brief preserves attribution and explicitly prohibits copying', () => {
  const source = buildJevFormatCandidates(examples)[0]
  const brief = buildOriginalFormatBrief({ product, source, adaptationFocus:'opening_visual', reviewAttention:.7 })
  assert.equal(brief.source_attribution.url, 'https://example.com/source-1')
  assert.equal(brief.selected_structure, 'Opening visual role')
  assert.match(brief.direction, /Auto Wizard/)
  assert.equal(brief.direction.includes(source.format_pattern), false)
  assert.match(brief.non_copying_rules, /Do not recreate/i)
  assert.match(brief.non_copying_rules, /footage/i)
  assert.match(brief.human_review_note, /Extra human/i)
})

test('Jev format shortlist preserves its selected in-set source and original adaptation boundary', () => {
  const candidates = buildJevFormatCandidates(examples)
  const selected = candidates.find(item => item.key === 'source_source-2')
  assert.ok(selected)
  const shortlist = presentJevFormatShortlist({ response:{ model:'jev-1.13.0', answers:{ best_format:{ type:'choice', choice:selected.key, confidence:.82 }, adaptation_focus:{ type:'choice', choice:'proof_sequence', confidence:.7 }, human_review_attention:{ type:'noul', noul:.2 } } }, source:selected, product })
  assert.equal(shortlist.source.id, 'source-2')
  assert.equal(shortlist.original_brief.source_attribution.creator, 'Public creator')
  assert.equal(shortlist.original_brief.selected_structure, 'Observable proof sequence')
  assert.equal(shortlist.human_review_attention, .2)
  assert.equal(resolveJevFormatCandidate(candidates, 'source_unknown'), null)
})
