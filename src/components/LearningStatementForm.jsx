import { useMemo, useState } from 'react'
import { buildLearningSummary, canPromoteLearning } from '../lib/campaignMomentum'
import { promoteLearningToCreativeMemory, saveLearningStatement } from '../lib/campaignRunbook'

const inputStyle = { width:'100%', boxSizing:'border-box', background:'rgba(7,8,20,.32)', border:'1px solid rgba(212,208,255,.2)', borderRadius:8, color:'#fff', padding:'9px 10px', font:'inherit', fontSize:10.5, lineHeight:1.5, resize:'vertical' }

export default function LearningStatementForm({ runbook, experiment, selectedConcept, existingStatement, onSaved }) {
  const [form, setForm] = useState(() => ({ whatChanged:existingStatement?.what_changed || '', evidenceSummary:existingStatement?.evidence_summary || '', nextAction:existingStatement?.next_action || '' }))
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const currentStatement = existingStatement ? { ...existingStatement, what_changed:form.whatChanged, evidence_summary:form.evidenceSummary, next_action:form.nextAction } : { what_changed:form.whatChanged, evidence_summary:form.evidenceSummary, next_action:form.nextAction }
  const promotion = useMemo(() => canPromoteLearning({ experiment, variants:experiment?.experiment_variants, reflection:currentStatement }), [experiment, form.whatChanged, form.evidenceSummary, form.nextAction])
  const summary = useMemo(() => buildLearningSummary({ campaign:{ id:runbook?.campaign_id }, selectedConcept, experiment, variants:experiment?.experiment_variants, reflection:currentStatement }), [runbook?.campaign_id, selectedConcept, experiment, form.whatChanged, form.evidenceSummary, form.nextAction])
  if (!runbook || !experiment) return null

  const save = async () => {
    setBusy('save'); setNotice('')
    try {
      const saved = await saveLearningStatement({ runbook, experiment, variantId:experiment.experiment_variants?.find(variant => ['winner', 'loser', 'inconclusive'].includes(variant.status))?.id || null, ...form })
      setNotice('Learning Statement saved. It stays editable in this Campaign Runbook.')
      await onSaved?.(saved)
    } catch (error) { setNotice(error.message || 'Could not save this Learning Statement.') }
    finally { setBusy('') }
  }
  const promote = async () => {
    if (!existingStatement) { setNotice('Save the Learning Statement before promoting it.'); return }
    setBusy('promote'); setNotice('')
    try {
      await promoteLearningToCreativeMemory({ runbook, learningStatement:existingStatement, experiment, selectedConcept })
      setNotice('Learning promoted to Creative Memory as a source-linked, editable reference. It is not a performance prediction.')
      await onSaved?.()
    } catch (error) { setNotice(error.message || 'Could not promote this learning.') }
    finally { setBusy('') }
  }

  return <section style={{ marginTop:14, padding:14, borderRadius:12, border:'1px solid rgba(185,177,255,.28)', background:'rgba(112,95,206,.1)' }}><div className="studio-kicker" style={{ color:'#d9d4ff' }}>LEARNING STATEMENT / OPERATOR-WRITTEN</div><h4 style={{ color:'#fff', fontSize:14, marginTop:5 }}>Turn this observation into a reusable lesson.</h4><p style={{ color:'rgba(243,242,255,.66)', fontSize:10, lineHeight:1.5, marginTop:4 }}>An inconclusive result can still be useful. Flo does not promote a learning until the observation is sourced and all three fields are saved.</p><div style={{ display:'grid', gap:8, marginTop:11 }}><label style={{ display:'grid', gap:4 }}><span style={{ color:'rgba(243,242,255,.75)', fontSize:9.5 }}>What changed?</span><textarea rows={2} value={form.whatChanged} onChange={event => setForm(current => ({ ...current, whatChanged:event.target.value }))} placeholder="Describe the single variable and its context." style={inputStyle}/></label><label style={{ display:'grid', gap:4 }}><span style={{ color:'rgba(243,242,255,.75)', fontSize:9.5 }}>What did the evidence show?</span><textarea rows={2} value={form.evidenceSummary} onChange={event => setForm(current => ({ ...current, evidenceSummary:event.target.value }))} placeholder="Interpret the observed value without claiming more than the source supports." style={inputStyle}/></label><label style={{ display:'grid', gap:4 }}><span style={{ color:'rgba(243,242,255,.75)', fontSize:9.5 }}>What should Flo reuse or avoid next time?</span><textarea rows={2} value={form.nextAction} onChange={event => setForm(current => ({ ...current, nextAction:event.target.value }))} placeholder="Write an editable next step, not a guaranteed winner." style={inputStyle}/></label></div>{summary.status === 'evidence_backed' && <div style={{ marginTop:10, padding:'8px 9px', borderRadius:8, background:'rgba(255,255,255,.055)', color:'rgba(243,242,255,.68)', fontSize:9.5, lineHeight:1.5 }}><b style={{ color:'#fff' }}>Evidence preview:</b> {summary.summary}</div>}<div style={{ display:'flex', gap:7, flexWrap:'wrap', marginTop:11 }}><button onClick={save} disabled={busy === 'save'} className="studio-button" style={{ padding:'8px 10px', fontSize:9.5 }}>{busy === 'save' ? 'Saving…' : existingStatement ? 'Update Learning Statement' : 'Save Learning Statement'}</button><button onClick={promote} disabled={!existingStatement || !promotion.allowed || busy === 'promote'} className="studio-button studio-button--soft" style={{ padding:'8px 10px', fontSize:9.5, opacity:existingStatement && promotion.allowed ? 1 : .55 }}>{busy === 'promote' ? 'Promoting…' : 'Promote to Creative Memory'}</button></div>{!promotion.allowed && <p style={{ color:'rgba(243,242,255,.53)', fontSize:9.5, marginTop:8 }}>{promotion.blockedReason}</p>}{notice && <p role="status" style={{ color:'#ddd9ff', fontSize:9.5, marginTop:8, lineHeight:1.45 }}>{notice}</p>}</section>
}
