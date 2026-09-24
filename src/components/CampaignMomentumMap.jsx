import { useMemo, useState } from 'react'
import { evidenceBackedStageCount } from '../lib/campaignMomentum'
import { deleteCampaignRunbook, downloadRunbookExport, setRunbookProgressVisibility, setRunbookStatus } from '../lib/campaignRunbook'

const statusStyle = {
  complete:{ label:'Evidence linked', color:'#97e3bd', background:'rgba(87,176,125,.14)' },
  in_progress:{ label:'In progress', color:'#d8c8ff', background:'rgba(142,112,237,.15)' },
  available:{ label:'Available', color:'#ffd98b', background:'rgba(206,155,62,.14)' },
  locked:{ label:'Needs prior evidence', color:'rgba(239,242,250,.54)', background:'rgba(239,242,250,.08)' },
  paused:{ label:'Paused', color:'#bed0e6', background:'rgba(138,165,195,.13)' },
  not_applicable:{ label:'Not applicable', color:'rgba(239,242,250,.54)', background:'rgba(239,242,250,.08)' },
}

export default function CampaignMomentumMap({ runbook, checkpoints = [], nextAction, context, deletedAt, onNavigate, onChanged, onRecreate, onDeleted }) {
  const [openKey, setOpenKey] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [showWhy, setShowWhy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const progress = useMemo(() => evidenceBackedStageCount(checkpoints), [checkpoints])
  const hidden = Boolean(runbook?.stage_overrides?.progressHidden)
  if (!runbook) return <section className="studio-panel" style={{ padding:18, borderColor:'rgba(184,175,255,.28)', background:'linear-gradient(135deg,rgba(83,67,153,.22),rgba(20,21,42,.9))' }}><div className="studio-kicker" style={{ color:'#c9c2ff' }}>CAMPAIGN RUNBOOK</div><h3 style={{ color:'#fff', fontSize:18, marginTop:6 }}>{deletedAt ? 'This runbook was deleted.' : 'The runbook begins when a campaign is saved.'}</h3><p style={{ color:'rgba(242,243,255,.7)', fontSize:11.5, lineHeight:1.6, marginTop:6 }}>{deletedAt ? 'The campaign, posts, assets, and original product records remain in Flo Studio. Creating a new runbook starts a fresh evidence record; it does not restore deleted reflections or learning statements.' : 'Flo will map only product facts, selected theses, completed assets, human reviews, controlled tests, and sourced learning. No clicks, token activity, or generation requests advance it.'}</p>{deletedAt && <button onClick={onRecreate} className="studio-button" style={{ marginTop:12, padding:'8px 10px', fontSize:10 }}>Create a new runbook</button>}</section>

  const updateStatus = async status => {
    setBusy(status); setError('')
    try { const saved = await setRunbookStatus({ runbook, status }); await onChanged?.(saved) }
    catch (statusError) { setError(statusError.message || 'Could not update this runbook.') }
    finally { setBusy('') }
  }
  const toggleVisibility = async () => {
    setBusy('visibility'); setError('')
    try { const saved = await setRunbookProgressVisibility({ runbook, progressHidden:!hidden }); await onChanged?.(saved) }
    catch (visibilityError) { setError(visibilityError.message || 'Could not update this view.') }
    finally { setBusy('') }
  }
  const exportRunbook = () => {
    setError('')
    try { downloadRunbookExport(context || {}) }
    catch (exportError) { setError(exportError.message || 'Could not export this Campaign Runbook.') }
  }
  const deleteRunbook = async () => {
    setBusy('delete'); setError('')
    try {
      await deleteCampaignRunbook({ runbook })
      setConfirmDelete(false)
      await onDeleted?.()
    } catch (deleteError) { setError(deleteError.message || 'Could not delete this Campaign Runbook.') }
    finally { setBusy('') }
  }

  return <section className="studio-panel" style={{ padding:'19px 20px', borderColor:'rgba(177,169,255,.32)', background:'linear-gradient(145deg,#25234c,#121429)' }}>
    <div style={{ display:'flex', justifyContent:'space-between', gap:14, alignItems:'flex-start', flexWrap:'wrap' }}>
      <div><div className="studio-kicker" style={{ color:'#bcb6ff' }}>FLO MOMENTUM / CAMPAIGN RUNBOOK</div><h3 style={{ color:'#fff', fontSize:20, letterSpacing:'-.045em', marginTop:6 }}>An operating map, not a game score.</h3><p style={{ color:'rgba(244,245,255,.65)', fontSize:11, lineHeight:1.6, marginTop:6, maxWidth:650 }}>{hidden ? 'Stage progress is hidden for this runbook. The underlying workflow remains fully available.' : `${progress.label}. Open any stage to inspect the linked record or its honest blocker.`}</p></div>
      <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}><button onClick={() => setShowWhy(value => !value)} className="studio-chip" style={{ color:'#e6e4ff', borderColor:'rgba(213,209,255,.26)', background:'rgba(255,255,255,.06)' }}>{showWhy ? 'Close help' : 'Why Momentum exists'}</button><button onClick={exportRunbook} className="studio-chip" style={{ color:'#e6e4ff', borderColor:'rgba(213,209,255,.26)', background:'rgba(255,255,255,.06)' }}>Export JSON</button><button onClick={toggleVisibility} disabled={busy === 'visibility'} className="studio-chip" style={{ color:'#e6e4ff', borderColor:'rgba(213,209,255,.26)', background:'rgba(255,255,255,.06)' }}>{busy === 'visibility' ? 'Saving…' : hidden ? 'Show stages' : 'Hide stages'}</button>{runbook.status === 'active' && <button onClick={() => updateStatus('paused')} disabled={Boolean(busy)} className="studio-chip" style={{ color:'#e6e4ff', borderColor:'rgba(213,209,255,.26)', background:'rgba(255,255,255,.06)' }}>Pause campaign</button>}{runbook.status === 'paused' && <button onClick={() => updateStatus('active')} disabled={Boolean(busy)} className="studio-chip" style={{ color:'#e6e4ff', borderColor:'rgba(213,209,255,.26)', background:'rgba(255,255,255,.06)' }}>Reopen</button>}{runbook.status !== 'archived' ? <button onClick={() => updateStatus('archived')} disabled={Boolean(busy)} className="studio-chip" style={{ color:'#f2ddde', borderColor:'rgba(238,173,178,.26)', background:'rgba(166,61,74,.15)' }}>Archive</button> : <button onClick={() => updateStatus('active')} disabled={Boolean(busy)} className="studio-chip" style={{ color:'#e6e4ff', borderColor:'rgba(213,209,255,.26)', background:'rgba(255,255,255,.06)' }}>Reopen</button>}<button onClick={() => setConfirmDelete(true)} disabled={Boolean(busy)} className="studio-chip" style={{ color:'#ffc5cd', borderColor:'rgba(255,182,192,.28)', background:'rgba(166,61,74,.12)' }}>Delete runbook</button></div>
    </div>

    {showWhy && <div style={{ marginTop:15, padding:'12px 13px', borderRadius:11, background:'rgba(255,255,255,.045)', border:'1px solid rgba(213,209,255,.18)' }}><b style={{ color:'#fff', fontSize:11.5 }}>Flo values useful evidence over content volume.</b><p style={{ color:'rgba(244,245,255,.65)', fontSize:10.5, lineHeight:1.55, marginTop:4 }}>Momentum makes the real campaign loop inspectable: product truth, thesis, controlled variants, review, experiment, and reusable learning. It never rewards page views, token purchases, render requests, or social publishing.</p></div>}
    {confirmDelete && <div role="alertdialog" aria-label="Confirm Campaign Runbook deletion" style={{ marginTop:15, padding:'13px 14px', borderRadius:11, background:'rgba(146,49,63,.18)', border:'1px solid rgba(255,182,192,.30)' }}><b style={{ display:'block', color:'#fff', fontSize:11.5 }}>Delete this Campaign Runbook?</b><p style={{ color:'rgba(255,236,239,.75)', fontSize:10.5, lineHeight:1.55, marginTop:5 }}>This permanently removes the runbook, its reflections, checkpoints, and Learning Statements. It does not delete the campaign, product, posts, assets, social destinations, or App Store data.</p><div style={{ display:'flex', gap:7, marginTop:10 }}><button onClick={deleteRunbook} disabled={busy === 'delete'} className="studio-button" style={{ padding:'8px 10px', fontSize:9.5, background:'#b34f60', borderColor:'#b34f60' }}>{busy === 'delete' ? 'Deleting…' : 'Delete runbook'}</button><button onClick={() => setConfirmDelete(false)} disabled={busy === 'delete'} className="studio-button studio-button--soft" style={{ padding:'8px 10px', fontSize:9.5 }}>Keep runbook</button></div></div>}

    {nextAction && <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', flexWrap:'wrap', marginTop:16, padding:'13px 14px', borderRadius:12, background:'rgba(159,148,255,.13)', border:'1px solid rgba(177,169,255,.25)' }}><div><div className="studio-kicker" style={{ color:'#d8d5ff' }}>NEXT MEANINGFUL ACTION</div><b style={{ display:'block', color:'#fff', fontSize:13, marginTop:5 }}>{nextAction.label}</b><p style={{ color:'rgba(244,245,255,.68)', fontSize:10.5, lineHeight:1.5, marginTop:4, maxWidth:650 }}><b style={{ color:'#e5e1ff' }}>Why this now?</b> {nextAction.whyNow}</p></div><button onClick={() => onNavigate?.(nextAction.target)} className="studio-button" style={{ padding:'8px 11px', fontSize:10 }}>Open next step</button></div>}

    {!hidden && <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(188px,1fr))', gap:9, marginTop:15 }}>{checkpoints.map(item => {
      const display = statusStyle[item.status] || statusStyle.available
      const expanded = openKey === item.key
      return <article key={item.key} style={{ padding:12, borderRadius:11, background:'rgba(255,255,255,.035)', border:`1px solid ${expanded ? 'rgba(189,182,255,.55)' : 'rgba(255,255,255,.11)'}` }}>
        <div style={{ display:'flex', justifyContent:'space-between', gap:7, alignItems:'start' }}><span style={{ color:'#aaa4f8', font:'700 9px DM Mono,monospace', letterSpacing:'.1em' }}>{item.number}</span><span style={{ color:display.color, background:display.background, padding:'3px 5px', borderRadius:4, fontSize:8.5, fontWeight:800, textTransform:'uppercase' }}>{display.label}</span></div>
        <h4 style={{ color:'#fff', fontSize:12.5, marginTop:7 }}>{item.label}</h4><p style={{ color:'rgba(244,245,255,.61)', fontSize:9.5, lineHeight:1.5, minHeight:42, marginTop:5 }}>{item.completionReason}</p>
        <div style={{ display:'flex', justifyContent:'space-between', gap:6, alignItems:'center', marginTop:8 }}><span style={{ color:'rgba(244,245,255,.46)', fontSize:9 }}>{item.evidence.length} evidence item{item.evidence.length === 1 ? '' : 's'}</span><button onClick={() => setOpenKey(expanded ? null : item.key)} className="studio-chip" style={{ fontSize:8.5, padding:'4px 6px', color:'#e6e3ff', borderColor:'rgba(213,209,255,.22)' }}>{expanded ? 'Close' : 'Open evidence'}</button></div>
        {expanded && <div style={{ marginTop:10, paddingTop:9, borderTop:'1px solid rgba(255,255,255,.1)' }}><p style={{ color:'rgba(244,245,255,.7)', fontSize:9.5, lineHeight:1.5 }}>{item.whyItMatters}</p>{item.evidence.length ? <div style={{ display:'grid', gap:6, marginTop:8 }}>{item.evidence.map((evidence, index) => <div key={`${evidence.type}-${evidence.id || index}`} style={{ padding:'7px 8px', borderRadius:7, background:'rgba(255,255,255,.055)' }}><b style={{ display:'block', color:'#fff', fontSize:9.5 }}>{evidence.title}</b><span style={{ display:'block', color:'rgba(244,245,255,.57)', fontSize:8.5, lineHeight:1.4, marginTop:2 }}>{evidence.detail}</span></div>)}</div> : <p style={{ color:'rgba(244,245,255,.5)', fontSize:9.5, lineHeight:1.5, marginTop:8 }}>{item.blockedReason || 'No linked evidence yet.'}</p>}<button onClick={() => onNavigate?.(item.nextAction?.target)} className="studio-button studio-button--soft" style={{ fontSize:9, padding:'7px 8px', marginTop:9 }}>{item.nextAction?.label || 'Open stage'}</button></div>}
      </article>
    })}</div>}
    {error && <p role="alert" style={{ color:'#ffc3cb', fontSize:10.5, marginTop:11 }}>{error}</p>}
  </section>
}
