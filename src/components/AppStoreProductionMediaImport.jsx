import { useMemo, useState } from 'react'
import { trackFloEvent } from '../lib/observability'

const selectionKey = (candidate, placement) => `${candidate?.kind || 'image'}:${candidate?.id || ''}:${placement?.id || ''}`

function bytes(value) {
  const number = Number(value || 0)
  if (!Number.isFinite(number) || number <= 0) return 'Size not returned by Apple'
  if (number < 1024 * 1024) return `${Math.round(number / 1024)} KB`
  return `${(number / (1024 * 1024)).toFixed(1)} MB`
}

function labelForPlacement(placement = {}) {
  return String(placement.placementType || placement.placementGroup || 'App Store surface')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, letter => letter.toUpperCase())
}

function ProductionMediaPreview({ candidate }) {
  const preview = candidate.kind === 'video' ? candidate.previewUrl : candidate.imageUrl
  if (candidate.kind === 'video' && candidate.videoUrl) return <video src={candidate.videoUrl} poster={preview || undefined} muted playsInline preload="metadata" style={{ width:'100%', height:110, objectFit:'cover', display:'block', background:'#0a0a0a' }} />
  if (preview) return <img src={preview} alt={candidate.referenceName || candidate.fileName || 'Approved App Store media'} loading="lazy" referrerPolicy="no-referrer" style={{ width:'100%', height:110, objectFit:'cover', display:'block', background:'#0a0a0a' }} />
  return <div style={{ height:110, display:'grid', placeItems:'center', background:'rgba(255,255,255,.06)', color:'rgba(240,240,240,.55)', fontSize:11 }}>Apple preview unavailable</div>
}

export default function AppStoreProductionMediaImport({ productId, appName, request, disabled = false, onImported }) {
  const [state, setState] = useState({ loading:false, importing:false, candidates:[], selected:[], message:'', error:'', finished:false })
  const candidates = state.candidates || []
  const selectionCount = state.selected.length
  const importableCandidates = useMemo(() => candidates.filter(candidate => candidate.importable), [candidates])

  const discover = async () => {
    if (!productId || state.loading) return
    setState(current => ({ ...current, loading:true, error:'', message:'Reading approved App Store media for this app only…', finished:false }))
    try {
      const response = await request({ action:'list_production_assets', productId })
      const next = response.candidates || []
      trackFloEvent('app_store_production_media_discovered', { product_id:productId, candidate_count:next.length })
      setState(current => ({ ...current, loading:false, candidates:next, selected:[], message:next.length ? `${next.length} approved production media placement${next.length === 1 ? '' : 's'} found. Choose what to copy into ${appName || 'this app'}’s Creative Lab.` : 'Apple returned no media that is both APPROVED and placed on a PARENT_APPROVED App Store surface.', error:'' }))
    } catch (error) {
      setState(current => ({ ...current, loading:false, error:error.message || 'FloStudio could not read approved App Store media.', message:'' }))
    }
  }

  const toggle = key => setState(current => ({ ...current, selected:current.selected.includes(key) ? current.selected.filter(value => value !== key) : [...current.selected, key], error:'', finished:false }))

  const chooseAll = () => setState(current => ({ ...current, selected:importableCandidates.flatMap(candidate => (candidate.placements || []).map(placement => selectionKey(candidate, placement))), error:'', finished:false }))

  const importSelected = async () => {
    if (!selectionCount || state.importing) return
    setState(current => ({ ...current, importing:true, error:'', message:'Copying selected Apple-approved media into this app’s Creative Lab only…', finished:false }))
    try {
      const response = await request({ action:'import_production_assets', productId, selectedKeys:state.selected })
      trackFloEvent('app_store_production_media_imported', { product_id:productId, selected_count:state.selected.length, imported_count:response.imported || 0, already_imported_count:response.alreadyImported || 0, failed_count:response.failed || 0 })
      const pieces = []
      if (response.imported) pieces.push(`${response.imported} imported`)
      if (response.alreadyImported) pieces.push(`${response.alreadyImported} already in library`)
      if (response.failed) pieces.push(`${response.failed} could not import`)
      setState(current => ({ ...current, importing:false, message:`${pieces.join(' · ') || 'No new media was imported.'} No posts, drafts, reviews, schedules, or publications were created.`, error:'', finished:true }))
      await onImported?.(response)
    } catch (error) {
      setState(current => ({ ...current, importing:false, error:error.message || 'FloStudio could not import the selected media.', message:'' }))
    }
  }

  return <section style={{ marginTop:14, padding:14, border:'1px solid rgba(223,223,223,.3)', background:'rgba(9,9,9,.25)' }}>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'start', gap:12, flexWrap:'wrap' }}>
      <div><div className="studio-kicker" style={{ color:'var(--signal)' }}>APP STORE PRODUCTION MEDIA</div><b style={{ color:'#ffffff', display:'block', marginTop:4, fontSize:13 }}>Copy Apple-approved media into Creative Lab.</b><p style={{ color:'rgba(240,240,240,.6)', fontSize:10.5, lineHeight:1.5, marginTop:5, maxWidth:660 }}>FloStudio checks the selected app’s App Asset Library in read-only mode. It shows only media that Apple marks <b>APPROVED</b> and that is placed on a <b>PARENT_APPROVED</b> App Store surface. Import copies a selected asset to this app’s library; it does not create or publish anything.</p></div>
      <button type="button" onClick={discover} disabled={disabled || state.loading || state.importing} className="studio-button studio-button--soft" style={{ padding:'8px 10px', fontSize:10, whiteSpace:'nowrap' }}>{state.loading ? 'Checking Apple…' : candidates.length ? 'Refresh approved media' : 'Find approved media →'}</button>
    </div>
    {candidates.length > 0 && <><div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, marginTop:12, flexWrap:'wrap' }}><span style={{ color:'rgba(240,240,240,.58)', fontSize:10.5 }}>{selectionCount} selected · {importableCandidates.length} importable</span><button type="button" onClick={chooseAll} disabled={state.importing || !importableCandidates.length} className="studio-chip" style={{ color:'var(--signal)', fontSize:9 }}>Select all importable</button></div><div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(210px,1fr))', gap:9, marginTop:10 }}>{candidates.flatMap(candidate => (candidate.placements || []).map(placement => {
      const key = selectionKey(candidate, placement)
      const selected = state.selected.includes(key)
      return <label key={key} style={{ overflow:'hidden', border:`1px solid ${selected ? 'var(--signal)' : 'rgba(240,240,240,.14)'}`, background:selected ? 'rgba(223,223,223,.1)' : 'rgba(255,255,255,.025)', cursor:candidate.importable ? 'pointer' : 'not-allowed', opacity:candidate.importable ? 1 : .6 }}><ProductionMediaPreview candidate={candidate} /><div style={{ padding:9 }}><div style={{ display:'flex', justifyContent:'space-between', gap:7, alignItems:'start' }}><b style={{ color:'#ffffff', fontSize:10.5, lineHeight:1.35, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{candidate.referenceName || candidate.fileName || `Apple ${candidate.kind}`}</b><span style={{ color:'var(--signal)', font:'600 8px DM Mono,monospace', whiteSpace:'nowrap' }}>{candidate.kind.toUpperCase()}</span></div><div style={{ color:'rgba(240,240,240,.58)', fontSize:9.5, marginTop:5 }}>{labelForPlacement(placement)} · {bytes(candidate.fileSize)}</div><div style={{ display:'flex', gap:6, alignItems:'center', marginTop:8, color:candidate.importable ? 'rgba(240,240,240,.8)' : '#d9b6b6', fontSize:9.5 }}><input type="checkbox" checked={selected} disabled={!candidate.importable || state.importing} onChange={() => toggle(key)} /><span>{candidate.importable ? 'Approved media · copy to library' : candidate.importBlocker || 'Not importable'}</span></div></div></label>
    }))}</div><div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, flexWrap:'wrap', marginTop:12, paddingTop:11, borderTop:'1px solid rgba(240,240,240,.1)' }}><span style={{ color:'rgba(240,240,240,.53)', fontSize:10 }}>You are confirming an internal library copy for {appName || 'this app'} only.</span><button type="button" onClick={importSelected} disabled={disabled || state.importing || !selectionCount} className="studio-button" style={{ padding:'8px 10px', fontSize:10 }}>{state.importing ? 'Importing selected media…' : `Import ${selectionCount || ''} selected to Creative Lab →`}</button></div></>}
    {state.message && <div style={{ marginTop:11, color:'rgba(240,240,240,.76)', fontSize:10.5, lineHeight:1.5 }}>{state.message}</div>}
    {state.error && <div style={{ marginTop:11, color:'#e0baba', fontSize:10.5, lineHeight:1.5 }}>{state.error}</div>}
    {state.finished && <div style={{ marginTop:8, color:'var(--signal)', fontSize:10.5 }}>Open this app in Creative Lab → Asset Library to use imported media as product-grounded source material.</div>}
  </section>
}
