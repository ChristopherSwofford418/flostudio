import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SYNTHETIC_ACTORS, SYNTHETIC_VOICES } from '../lib/ugcCasting'
import { createCreativeExperimentMatrix, estimateMatrixCells, listCreativeExperimentMatrices, matrixReadiness } from '../lib/creativeExperimentMatrix'

const fieldStyle = { width:'100%', boxSizing:'border-box', background:'rgba(5,5,5,.42)', border:'1px solid rgba(255,255,255,.14)', borderRadius:10, color:'#ffffff', padding:'10px 11px', outline:'none', font:'inherit', fontSize:11.5 }
const objectiveOptions = [['install_volume','Install volume'], ['conversion_rate','Conversion rate'], ['engagement','Engagement'], ['revenue','Revenue'], ['learning','Learning']]
const placementOptions = [['paid_social','Paid social'], ['organic_social','Organic social']]

function toggleValue(values, value, limit) {
  return values.includes(value) ? values.filter(item => item !== value) : values.length >= limit ? values : [...values, value]
}

export default function CreativeExperimentMatrix({ apps, workspaceId, userId, onCreated }) {
  const navigate = useNavigate()
  const [productId, setProductId] = useState('')
  const [matrices, setMatrices] = useState([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState({
    title:'',
    objective:'install_volume',
    primaryMetric:'Cost per install',
    hypothesis:'',
    hooks:'Show the outcome before the workflow\nName the friction this app removes',
    actorIds:['maya','darius'],
    voiceIds:['aoede','alnilam'],
    format:'9:16',
    placement:'paid_social',
  })

  useEffect(() => { if (!productId && apps[0]?.id) setProductId(apps[0].id) }, [apps, productId])
  const refresh = async () => {
    if (!workspaceId || !userId) return
    try { setMatrices(await listCreativeExperimentMatrices({ workspaceId, userId, productId })) }
    catch (error) { setNotice(error.message || 'Could not load existing creative matrices.') }
  }
  useEffect(() => { refresh() }, [workspaceId, userId, productId])

  const hooks = useMemo(() => form.hooks.split('\n').map(item => item.trim()).filter(Boolean).slice(0,3), [form.hooks])
  const cells = estimateMatrixCells({ hooks, actorIds:form.actorIds, voiceIds:form.voiceIds })
  const selectedApp = apps.find(app => app.id === productId)
  const update = (key, value) => setForm(previous => ({ ...previous, [key]:value }))

  const create = async event => {
    event.preventDefault()
    if (!selectedApp) { setNotice('Choose a portfolio app before creating a matrix.'); return }
    if (!form.title.trim() || !form.hypothesis.trim()) { setNotice('Add a test name and hypothesis first.'); return }
    setBusy(true); setNotice('')
    try {
      await createCreativeExperimentMatrix({ workspaceId, userId, productId, title:form.title, objective:form.objective, primaryMetric:form.primaryMetric, hypothesis:form.hypothesis, hooks, actorIds:form.actorIds, voiceIds:form.voiceIds, format:form.format, placement:form.placement })
      setNotice(`${cells} controlled creative variants are now in the experiment ledger for ${selectedApp.name}.`)
      setForm(previous => ({ ...previous, title:'', hypothesis:'' }))
      await refresh()
      onCreated?.()
    } catch (error) { setNotice(error.message || 'FloStudio could not create this creative matrix.') }
    finally { setBusy(false) }
  }

  return <section className="studio-panel flo-dark-surface experiment-matrix" style={{ padding:20, marginTop:16, border:'1px solid rgba(201,201,201,.24)', background:'linear-gradient(135deg,rgba(201,201,201,.09),rgba(12,12,12,.35))' }}>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'start', gap:18, flexWrap:'wrap' }}>
      <div><div className="studio-kicker" style={{ color:'#ededed' }}>GROWTH LOOP / CREATIVE EXPERIMENT MATRIX</div><h2 style={{ color:'#ffffff', fontSize:25, letterSpacing:'-.05em', marginTop:5 }}>Create a controlled <span className="studio-serif" style={{ color:'#c9c9c9' }}>test set.</span></h2><p style={{ color:'rgba(242,242,242,.64)', fontSize:11.5, lineHeight:1.6, maxWidth:700, marginTop:7 }}>Add variants to the existing experiment ledger without changing any imported app, current campaign, asset, casting selection, or experiment. Each cell keeps its own hook, actor, voice, placement, and source lineage.</p></div>
      <button type="button" onClick={() => navigate('/images')} className="studio-button studio-button--soft" style={{ whiteSpace:'nowrap' }}>Open Creative Lab →</button>
    </div>
    {notice && <div style={{ marginTop:14, padding:11, borderRadius:10, background:'rgba(237,237,237,.08)', border:'1px solid rgba(237,237,237,.17)', color:'#ededed', fontSize:11.5 }}>{notice}</div>}
    <form onSubmit={create} style={{ marginTop:17, display:'grid', gap:12 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
        <label style={{ display:'grid', gap:5 }}><span style={{ color:'rgba(242,242,242,.66)', fontSize:10 }}>Portfolio app</span><select value={productId} onChange={event => setProductId(event.target.value)} style={fieldStyle}>{apps.map(app => <option value={app.id} key={app.id}>{app.name}</option>)}</select></label>
        <label style={{ display:'grid', gap:5 }}><span style={{ color:'rgba(242,242,242,.66)', fontSize:10 }}>Objective</span><select value={form.objective} onChange={event => update('objective', event.target.value)} style={fieldStyle}>{objectiveOptions.map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label style={{ display:'grid', gap:5 }}><span style={{ color:'rgba(242,242,242,.66)', fontSize:10 }}>Placement</span><select value={form.placement} onChange={event => update('placement', event.target.value)} style={fieldStyle}>{placementOptions.map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1.2fr .8fr', gap:10 }}>
        <label style={{ display:'grid', gap:5 }}><span style={{ color:'rgba(242,242,242,.66)', fontSize:10 }}>Matrix name</span><input value={form.title} onChange={event => update('title', event.target.value)} placeholder="e.g. Install-first UGC hook matrix" style={fieldStyle}/></label>
        <label style={{ display:'grid', gap:5 }}><span style={{ color:'rgba(242,242,242,.66)', fontSize:10 }}>Primary metric</span><input value={form.primaryMetric} onChange={event => update('primaryMetric', event.target.value)} style={fieldStyle}/></label>
      </div>
      <label style={{ display:'grid', gap:5 }}><span style={{ color:'rgba(242,242,242,.66)', fontSize:10 }}>Hypothesis</span><input value={form.hypothesis} onChange={event => update('hypothesis', event.target.value)} placeholder="If the opening hook names the product friction, we expect more qualified installs." style={fieldStyle}/></label>
      <label style={{ display:'grid', gap:5 }}><span style={{ color:'rgba(242,242,242,.66)', fontSize:10 }}>Hooks — one per line, up to three</span><textarea value={form.hooks} onChange={event => update('hooks', event.target.value)} rows={3} style={{ ...fieldStyle, resize:'vertical' }}/></label>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <div><div style={{ color:'rgba(242,242,242,.66)', fontSize:10, marginBottom:7 }}>Actors — choose up to four</div><div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>{SYNTHETIC_ACTORS.map(actor => <button type="button" key={actor.id} onClick={() => update('actorIds', toggleValue(form.actorIds, actor.id, 4))} style={{ border:`1px solid ${form.actorIds.includes(actor.id) ? 'rgba(237,237,237,.8)' : 'rgba(255,255,255,.14)'}`, background:form.actorIds.includes(actor.id) ? 'rgba(237,237,237,.14)' : 'rgba(0,0,0,.18)', color:'#ffffff', borderRadius:999, padding:'7px 9px', cursor:'pointer', fontSize:10.5 }}>{form.actorIds.includes(actor.id) ? '✓ ' : ''}{actor.name}</button>)}</div></div>
        <div><div style={{ color:'rgba(242,242,242,.66)', fontSize:10, marginBottom:7 }}>Voice styles — choose up to three</div><div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>{SYNTHETIC_VOICES.map(voice => <button type="button" key={voice.id} onClick={() => update('voiceIds', toggleValue(form.voiceIds, voice.id, 3))} style={{ border:`1px solid ${form.voiceIds.includes(voice.id) ? 'rgba(237,237,237,.8)' : 'rgba(255,255,255,.14)'}`, background:form.voiceIds.includes(voice.id) ? 'rgba(237,237,237,.14)' : 'rgba(0,0,0,.18)', color:'#ffffff', borderRadius:999, padding:'7px 9px', cursor:'pointer', fontSize:10.5 }}>{form.voiceIds.includes(voice.id) ? '✓ ' : ''}{voice.shortName}</button>)}</div></div>
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap', paddingTop:3 }}><span style={{ color:cells > 12 ? '#cfcfcf' : 'rgba(242,242,242,.58)', fontSize:11 }}>{cells || 0} planned variants · capped at 12 to keep the test interpretable.</span><button type="submit" className="studio-button" disabled={busy || cells < 1 || cells > 12}>{busy ? 'Creating matrix…' : `Create ${cells || 0}-variant matrix →`}</button></div>
    </form>
    {matrices.length > 0 && <div style={{ marginTop:20, borderTop:'1px solid rgba(255,255,255,.11)', paddingTop:15 }}><div className="studio-kicker" style={{ color:'#c9c9c9' }}>RECENT CREATIVE MATRICES</div><div style={{ display:'grid', gap:8, marginTop:9 }}>{matrices.slice(0,3).map(matrix => { const readiness = matrixReadiness(matrix); return <div key={matrix.id} style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'center', padding:'10px 11px', background:'rgba(0,0,0,.18)', border:'1px solid rgba(255,255,255,.1)', borderRadius:9 }}><div><b style={{ color:'#ffffff', fontSize:11.5 }}>{matrix.title}</b><div style={{ color:'rgba(242,242,242,.5)', fontSize:10, marginTop:3 }}>{readiness.planned} variants · {readiness.ready} rendered · {readiness.approved} approved</div></div><span className="studio-chip" style={{ color:'#ededed' }}>{matrix.status}</span></div> })}</div></div>}
  </section>
}
