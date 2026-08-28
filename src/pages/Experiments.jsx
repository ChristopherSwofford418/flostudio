import { useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout'
import { supabase } from '../supabase'
import { useWorkspace } from '../context/WorkspaceContext'
import { addExperimentVariant, createExperiment, listExperiments, recordExperimentOutcome, setExperimentStatus } from '../lib/experiments'
import CreativeExperimentMatrix from '../components/CreativeExperimentMatrix'

const channelOptions = [
  ['store_listing', 'App Store / Play listing'], ['paid_social', 'Paid social'], ['organic_social', 'Organic social'], ['seo', 'SEO content'], ['email', 'Email'], ['landing_page', 'Landing page'],
]
const objectiveOptions = [
  ['conversion_rate', 'Conversion rate'], ['install_volume', 'Install volume'], ['engagement', 'Engagement'], ['retention', 'Retention'], ['revenue', 'Revenue'], ['learning', 'Learning'],
]
const statusColor = { planned:'#d7d7d7', ready:'#c9c9c9', running:'#ededed', paused:'#c7c7c7', completed:'#e9e9e9', archived:'rgba(242,242,242,.55)', draft:'rgba(242,242,242,.58)', live:'#c9c9c9', winner:'#ededed', loser:'#adadad', inconclusive:'#d7d7d7' }
const fieldStyle = { width:'100%', boxSizing:'border-box', background:'rgba(5,5,5,.42)', border:'1px solid rgba(255,255,255,.14)', borderRadius:10, color:'#ffffff', padding:'11px 12px', outline:'none', font:'inherit', fontSize:12 }

const blankExperiment = { title:'', channel:'store_listing', objective:'conversion_rate', primaryMetric:'Install conversion rate', hypothesis:'' }
const blankVariant = { label:'', changeSummary:'', hypothesis:'', isControl:false }

export default function Experiments() {
  const { apps, workspaceId } = useWorkspace()
  const [userId, setUserId] = useState(null)
  const [experiments, setExperiments] = useState([])
  const [productId, setProductId] = useState('')
  const [experimentForm, setExperimentForm] = useState(blankExperiment)
  const [variantForms, setVariantForms] = useState({})
  const [outcomeForms, setOutcomeForms] = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => { if (!productId && apps[0]?.id) setProductId(apps[0].id) }, [apps, productId])
  const refresh = async (id = userId) => {
    if (!id || !workspaceId) return
    setLoading(true)
    try { setExperiments(await listExperiments({ workspaceId, userId:id })) }
    catch (error) { setNotice(error.message || 'Could not load experiments.') }
    finally { setLoading(false) }
  }
  useEffect(() => { supabase.auth.getUser().then(({ data:{ user } }) => { setUserId(user?.id || null); if (user?.id) refresh(user.id) }) }, [workspaceId])
  const scoped = useMemo(() => experiments.filter(experiment => !productId || experiment.product_id === productId), [experiments, productId])
  const selectedApp = apps.find(app => app.id === productId)

  const updateExperiment = (key, value) => setExperimentForm(previous => ({ ...previous, [key]:value }))
  const updateVariant = (experimentId, key, value) => setVariantForms(previous => ({ ...previous, [experimentId]:{ ...(previous[experimentId] || blankVariant), [key]:value } }))
  const updateOutcome = (variantId, key, value) => setOutcomeForms(previous => ({ ...previous, [variantId]:{ ...(previous[variantId] || { value:'', unit:'', source:'', observedAt:'' }), [key]:value } }))

  const create = async event => {
    event.preventDefault()
    if (!productId) { setNotice('Choose an app before planning an experiment.'); return }
    if (!experimentForm.title.trim() || !experimentForm.hypothesis.trim()) { setNotice('Add a title and hypothesis before creating an experiment.'); return }
    setBusy('create'); setNotice('')
    try {
      await createExperiment({ workspaceId, userId, productId, ...experimentForm })
      setExperimentForm(blankExperiment); setNotice('Experiment planned. Add a control and a single-variable challenger next.'); await refresh()
    } catch (error) { setNotice(error.message || 'Could not create the experiment.') }
    finally { setBusy('') }
  }

  const addVariant = async experiment => {
    const form = variantForms[experiment.id] || blankVariant
    if (!form.label.trim() || !form.changeSummary.trim()) { setNotice('Name the variant and describe the one variable it changes.'); return }
    setBusy(`variant-${experiment.id}`); setNotice('')
    try { await addExperimentVariant({ experiment, userId, ...form }); setVariantForms(previous => ({ ...previous, [experiment.id]:blankVariant })); setNotice('Variant added. Mark it ready only when its actual creative or listing asset is attached.'); await refresh() }
    catch (error) { setNotice(error.message || 'Could not add the variant.') }
    finally { setBusy('') }
  }

  const recordOutcome = async (experiment, variant, decision) => {
    const form = outcomeForms[variant.id] || {}
    setBusy(`outcome-${variant.id}`); setNotice('')
    try { await recordExperimentOutcome({ experiment, variant, userId, outcomeValue:form.value, outcomeUnit:form.unit, outcomeSource:form.source, observedAt:form.observedAt, decision }); setNotice(decision === 'winner' ? 'Winner recorded with a human-confirmed outcome. Flo can now reuse the learning.' : 'Outcome recorded as evidence.'); await refresh() }
    catch (error) { setNotice(error.message || 'Could not record this outcome.') }
    finally { setBusy('') }
  }

  return <Layout title="Experiments">
    <style>{`@media(max-width:1000px){.experiment-grid,.experiment-form-grid,.variant-grid{grid-template-columns:1fr!important}}`}</style>
    <div className="flo-page experiments-page" style={{ padding:'28px 30px 56px' }}>
      <section className="studio-dark abundance-hero" style={{ padding:'30px 32px', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'relative', zIndex:1, maxWidth:760 }}>
          <div className="studio-kicker" style={{ color:'#ededed' }}>EXPERIMENTS / EVIDENCE, NOT GUESSWORK</div>
          <h1 className="studio-display" style={{ color:'#ffffff', fontSize:'clamp(34px,4.2vw,60px)', marginTop:9 }}>Make every creative a <span className="studio-serif" style={{ color:'#c0c0c0' }}>learning system.</span></h1>
          <p style={{ color:'rgba(241,241,241,.72)', maxWidth:640, fontSize:13, lineHeight:1.7, marginTop:13 }}>Plan a real hypothesis, change one variable, attach genuine outcomes, and promote only verified learnings into Creative Memory. FloStudio does not manufacture performance results.</p>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:18 }}><span className="studio-chip" style={{ color:'#ededed', borderColor:'rgba(226,226,226,.28)', background:'rgba(226,226,226,.08)' }}>{scoped.length} active app experiment{scoped.length === 1 ? '' : 's'}</span><span className="studio-chip" style={{ color:'#e9e9e9' }}>Store · paid · social · SEO</span></div>
        </div><div className="abundance-orb abundance-orb--one"/><div className="abundance-orb abundance-orb--two"/>
      </section>

      <CreativeExperimentMatrix apps={apps} workspaceId={workspaceId} userId={userId} onCreated={() => refresh()} />

      <section className="studio-panel flo-dark-surface experiments-plan" style={{ padding:20, marginTop:16 }}>
        <div className="studio-kicker" style={{ color:'#c9c9c9' }}>PLAN A CONTROLLED TEST</div>
        <form onSubmit={create} className="experiment-form-grid" style={{ display:'grid', gridTemplateColumns:'1.1fr .8fr .8fr', gap:10, marginTop:12 }}>
          <label style={{ display:'grid', gap:6 }}><span style={{ color:'rgba(242,242,242,.7)', fontSize:10.5 }}>App</span><select value={productId} onChange={event => setProductId(event.target.value)} style={fieldStyle}><option value="">Select an app</option>{apps.map(app => <option key={app.id} value={app.id}>{app.name}</option>)}</select></label>
          <label style={{ display:'grid', gap:6 }}><span style={{ color:'rgba(242,242,242,.7)', fontSize:10.5 }}>Channel</span><select value={experimentForm.channel} onChange={event => updateExperiment('channel', event.target.value)} style={fieldStyle}>{channelOptions.map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label style={{ display:'grid', gap:6 }}><span style={{ color:'rgba(242,242,242,.7)', fontSize:10.5 }}>Objective</span><select value={experimentForm.objective} onChange={event => updateExperiment('objective', event.target.value)} style={fieldStyle}>{objectiveOptions.map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label style={{ display:'grid', gap:6, gridColumn:'span 2' }}><span style={{ color:'rgba(242,242,242,.7)', fontSize:10.5 }}>Experiment title</span><input value={experimentForm.title} onChange={event => updateExperiment('title', event.target.value)} placeholder="e.g. Social proof in first App Store screenshot" style={fieldStyle}/></label>
          <label style={{ display:'grid', gap:6 }}><span style={{ color:'rgba(242,242,242,.7)', fontSize:10.5 }}>Primary metric</span><input value={experimentForm.primaryMetric} onChange={event => updateExperiment('primaryMetric', event.target.value)} placeholder="Install conversion rate" style={fieldStyle}/></label>
          <label style={{ display:'grid', gap:6, gridColumn:'1 / -1' }}><span style={{ color:'rgba(242,242,242,.7)', fontSize:10.5 }}>Hypothesis</span><textarea value={experimentForm.hypothesis} onChange={event => updateExperiment('hypothesis', event.target.value)} rows={2} placeholder="If we change X for this audience, we expect Y because…" style={{ ...fieldStyle, resize:'vertical' }}/></label>
          <div style={{ gridColumn:'1 / -1', display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, paddingTop:2 }}><span style={{ color:'rgba(242,242,242,.46)', fontSize:10.5 }}>Use a control plus a single-variable challenger. Record outcomes only after a real store, channel, or analytics observation.</span><button type="submit" disabled={busy === 'create'} className="studio-button">{busy === 'create' ? 'Planning…' : 'Create experiment →'}</button></div>
        </form>
      </section>

      {notice && <div style={{ marginTop:14, padding:12, borderRadius:11, background:'rgba(197,197,197,.1)', border:'1px solid rgba(197,197,197,.24)', color:'#e9e9e9', fontSize:11.5 }}>{notice}</div>}
      <section className="experiments-ledger" style={{ marginTop:24 }}>
        <div style={{ display:'flex', alignItems:'end', justifyContent:'space-between', gap:12, marginBottom:12 }}><div><div className="studio-kicker" style={{ color:'#c0c0c0' }}>EXPERIMENT LEDGER</div><h2 style={{ color:'#ffffff', fontSize:24, letterSpacing:'-.05em', marginTop:5 }}>{selectedApp ? `${selectedApp.name} — learning in progress` : 'Choose an app to inspect its tests'}</h2></div><span style={{ color:'rgba(242,242,242,.52)', fontSize:11 }}>Results shown only when you add real observations.</span></div>
        {loading ? <div className="studio-panel flo-dark-surface" style={{ padding:28, color:'rgba(255,255,255,.62)' }}>Loading experiment evidence…</div> : !productId ? <div className="studio-panel flo-dark-surface" style={{ padding:28, color:'rgba(255,255,255,.62)' }}>Select a portfolio app to begin its first controlled test.</div> : scoped.length === 0 ? <div className="studio-panel flo-dark-surface" style={{ padding:30, borderStyle:'dashed', textAlign:'center' }}><h3 style={{ color:'#ffffff', margin:0, fontSize:18 }}>No experiments yet.</h3><p style={{ color:'rgba(242,242,242,.58)', margin:'8px auto 0', maxWidth:470, fontSize:12, lineHeight:1.6 }}>Start with the highest-confidence business question. A single control and challenger will produce more reusable learning than a collection of unrelated generations.</p></div> : <div style={{ display:'grid', gap:14 }}>{scoped.map(experiment => <article key={experiment.id} className="studio-panel flo-dark-surface experiment-card" style={{ padding:20, borderLeft:'4px solid #727272' }}>
          <div style={{ display:'flex', justifyContent:'space-between', gap:16, alignItems:'start', flexWrap:'wrap' }}><div><div className="studio-kicker" style={{ color:'#c9c9c9' }}>{channelOptions.find(item => item[0] === experiment.channel)?.[1] || experiment.channel} · {experiment.primary_metric}</div><h3 style={{ color:'#ffffff', fontSize:19, marginTop:5 }}>{experiment.title}</h3><p style={{ color:'rgba(242,242,242,.67)', fontSize:11.5, lineHeight:1.6, maxWidth:760, marginTop:7 }}><b style={{ color:'#ededed' }}>Hypothesis:</b> {experiment.hypothesis}</p></div><div style={{ display:'flex', gap:7, alignItems:'center' }}><span className="studio-chip" style={{ color:statusColor[experiment.status] || '#ffffff', borderColor:`${statusColor[experiment.status] || '#ffffff'}55` }}>{experiment.status}</span><select value={experiment.status} onChange={async event => { setBusy(`status-${experiment.id}`); try { await setExperimentStatus({ experimentId:experiment.id, status:event.target.value }); await refresh() } catch (error) { setNotice(error.message || 'Could not change experiment status.') } finally { setBusy('') } }} style={{ ...fieldStyle, width:'auto', padding:'7px 9px' }}><option value="planned">Planned</option><option value="ready">Ready</option><option value="running">Running</option><option value="paused">Paused</option><option value="completed">Completed</option><option value="archived">Archived</option></select></div></div>
          <div className="variant-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:16 }}>{(experiment.experiment_variants || []).map(variant => { const latest = variant.metrics?.latest; const outcome = outcomeForms[variant.id] || { value:'', unit:'', source:'', observedAt:'' }; return <section key={variant.id} style={{ padding:14, borderRadius:12, background:'rgba(255,255,255,.035)', border:'1px solid rgba(255,255,255,.1)' }}><div style={{ display:'flex', justifyContent:'space-between', gap:8 }}><div><span style={{ color:variant.is_control ? '#d7d7d7' : '#c0c0c0', font:'600 9px DM Mono,monospace', letterSpacing:'.08em' }}>{variant.is_control ? 'CONTROL' : 'CHALLENGER'} · {variant.status.toUpperCase()}</span><h4 style={{ color:'#ffffff', fontSize:14, marginTop:5 }}>{variant.label}</h4></div>{latest && <span className="studio-chip" style={{ color:'#e9e9e9', height:'fit-content' }}>{latest.value} {latest.unit}</span>}</div><p style={{ color:'rgba(242,242,242,.62)', fontSize:10.5, lineHeight:1.55, marginTop:7 }}>{variant.change_summary}</p>{latest ? <div style={{ color:'rgba(242,242,242,.42)', fontSize:9.5, marginTop:8 }}>Observed via {latest.source} · {new Date(latest.observedAt).toLocaleDateString()}</div> : <div style={{ color:'rgba(242,242,242,.42)', fontSize:9.5, marginTop:8 }}>No verified outcome recorded.</div>}<div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7, marginTop:11 }}><input value={outcome.value} onChange={event => updateOutcome(variant.id, 'value', event.target.value)} placeholder="Real result" inputMode="decimal" style={fieldStyle}/><input value={outcome.unit} onChange={event => updateOutcome(variant.id, 'unit', event.target.value)} placeholder={experiment.primary_metric} style={fieldStyle}/><input value={outcome.source} onChange={event => updateOutcome(variant.id, 'source', event.target.value)} placeholder="Source: ASC, Meta…" style={{ ...fieldStyle, gridColumn:'1 / -1' }}/></div><div style={{ display:'flex', gap:6, marginTop:8 }}><button type="button" onClick={() => recordOutcome(experiment, variant, 'inconclusive')} disabled={busy === `outcome-${variant.id}`} className="studio-button studio-button--soft" style={{ padding:'7px 9px', fontSize:9.5 }}>Record result</button><button type="button" onClick={() => recordOutcome(experiment, variant, 'winner')} disabled={busy === `outcome-${variant.id}`} className="studio-button" style={{ padding:'7px 9px', fontSize:9.5 }}>Mark winner</button></div></section> })}
            <section style={{ padding:14, borderRadius:12, background:'rgba(114,114,114,.1)', border:'1px dashed rgba(179,179,179,.34)' }}><div style={{ color:'#ededed', font:'600 9px DM Mono,monospace', letterSpacing:'.08em' }}>ADD A CONTROLLED VARIANT</div><div style={{ display:'grid', gap:7, marginTop:9 }}><input value={(variantForms[experiment.id] || blankVariant).label} onChange={event => updateVariant(experiment.id, 'label', event.target.value)} placeholder="Variant name" style={fieldStyle}/><input value={(variantForms[experiment.id] || blankVariant).changeSummary} onChange={event => updateVariant(experiment.id, 'changeSummary', event.target.value)} placeholder="One change: hook, proof, visual…" style={fieldStyle}/><input value={(variantForms[experiment.id] || blankVariant).hypothesis} onChange={event => updateVariant(experiment.id, 'hypothesis', event.target.value)} placeholder="Why this may work" style={fieldStyle}/><label style={{ color:'rgba(242,242,242,.62)', fontSize:10.5, display:'flex', gap:7, alignItems:'center' }}><input type="checkbox" checked={Boolean((variantForms[experiment.id] || blankVariant).isControl)} onChange={event => updateVariant(experiment.id, 'isControl', event.target.checked)}/> This is the control</label><button type="button" onClick={() => addVariant(experiment)} disabled={busy === `variant-${experiment.id}`} className="studio-button" style={{ justifySelf:'start', padding:'8px 10px', fontSize:10 }}>{busy === `variant-${experiment.id}` ? 'Adding…' : 'Add variant'}</button></div></section>
          </div>
        </article>)}</div>}
      </section>
    </div>
  </Layout>
}
