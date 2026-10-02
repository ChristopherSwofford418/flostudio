import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'

export default function JevFormatShortlist({ workspaceId, productId, productName, hasResearch, onUseOriginalBrief }) {
  const [connection, setConnection] = useState({ loading:true, configured:false, error:'' })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [shortlist, setShortlist] = useState(null)

  const headers = async () => {
    const { data:{ session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Sign in again before using Jev decision support.')
    return { Authorization:`Bearer ${session.access_token}` }
  }
  const loadConnection = async () => {
    if (!workspaceId) { setConnection({ loading:false, configured:false, error:'' }); return }
    try {
      const response = await fetch(`/api/typesafe-key?workspaceId=${encodeURIComponent(workspaceId)}`, { headers:await headers() })
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || 'Could not check the Jev connection.')
      setConnection({ loading:false, configured:Boolean(data.configured), error:'' })
    } catch (error) { setConnection({ loading:false, configured:false, error:error.message || 'Could not check the Jev connection.' }) }
  }
  useEffect(() => { loadConnection() }, [workspaceId])

  const runShortlist = async () => {
    setBusy(true); setNotice(''); setShortlist(null)
    try {
      const response = await fetch('/api/jev-format-shortlist', { method:'POST', headers:{ ...(await headers()), 'Content-Type':'application/json' }, body:JSON.stringify({ workspaceId, productId }) })
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || 'Jev did not return a format shortlist.')
      setShortlist(data.shortlist)
      setNotice('Jev selected one source-safe format fit for this app. It is not a performance ranking or permission to copy the source.')
    } catch (error) { setNotice(error.message || 'Jev did not return a format shortlist.') }
    finally { setBusy(false) }
  }
  const applyBrief = () => {
    if (!shortlist?.original_brief) return
    onUseOriginalBrief?.(shortlist.original_brief)
    setNotice('Original brief added to Creative Lab. It has not generated, rendered, scheduled, or published anything.')
  }

  return <section style={{ marginTop:13, padding:13, border:'1px solid rgba(174,220,255,.32)', background:'linear-gradient(135deg,rgba(69,123,169,.14),rgba(17,18,38,.28))', borderRadius:3 }}><div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'flex-start', flexWrap:'wrap' }}><div><div className="abundance-mini-label" style={{ color:'#bfe4ff' }}>JEV / ORIGINAL FORMAT SHORTLIST</div><h3 style={{ color:'#fff', fontSize:15, letterSpacing:'-.035em', marginTop:4 }}>Find a best-fit format, then make it yours.</h3><p style={{ color:'rgba(242,247,255,.68)', fontSize:10.5, lineHeight:1.5, marginTop:5, maxWidth:700 }}>Jev compares only this app’s attributed public format metadata against its saved product facts. It does not claim a source is the highest-performing ad, copy the ad, or generate from it. The result is a reviewable original brief.</p></div><span className="abundance-pill" style={{ color:'#bfe4ff', borderColor:'rgba(191,228,255,.28)' }}>{connection.loading ? 'checking' : connection.configured ? 'Jev connected' : 'connect Jev first'}</span></div>
    {!hasResearch && <p style={{ color:'rgba(242,247,255,.62)', fontSize:10, lineHeight:1.45, marginTop:10 }}>This app has no ranked source-safe examples yet. Add public format research first; Flo will not invent a source or performance signal.</p>}
    {!connection.loading && !connection.configured && <p style={{ color:'rgba(242,247,255,.62)', fontSize:10, lineHeight:1.45, marginTop:10 }}>Connect the optional TypeSafe / Jev workspace key in the Campaign Engine’s Jev Decision Check, then return here.</p>}
    {connection.error && <p role="alert" style={{ color:'#ffcbd1', fontSize:9.5, marginTop:8 }}>{connection.error}</p>}
    <button type="button" onClick={runShortlist} disabled={!workspaceId || !productId || !hasResearch || !connection.configured || busy} className="studio-button" style={{ marginTop:10, padding:'8px 10px', fontSize:9.5 }}>{busy ? 'Finding format fit…' : `Find ${productName || 'app'} format fit`}</button>
    {notice && <p role="status" style={{ color:'#cceaff', fontSize:9.5, lineHeight:1.45, marginTop:9 }}>{notice}</p>}
    {shortlist && <div style={{ marginTop:11, paddingTop:11, borderTop:'1px solid rgba(191,228,255,.16)' }}><div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) auto', gap:10, alignItems:'start' }}><div><div style={{ color:'#bfe4ff', font:'700 8.5px DM Mono,monospace', letterSpacing:'.08em' }}>SELECTED FORMAT FIT</div><b style={{ display:'block', color:'#fff', fontSize:12, marginTop:4 }}>{shortlist.source.title}</b><p style={{ color:'rgba(242,247,255,.62)', fontSize:9.5, lineHeight:1.45, marginTop:5 }}>{shortlist.source.format_pattern}</p></div><a href={shortlist.source.source_url} target="_blank" rel="noreferrer" className="studio-chip" style={{ padding:'6px 8px', color:'#e9f6ff', textDecoration:'none' }}>Open attributed source ↗</a></div><div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:7, marginTop:10 }}><div style={{ padding:9, border:'1px solid rgba(191,228,255,.16)', background:'rgba(255,255,255,.045)' }}><div style={{ color:'rgba(191,228,255,.75)', fontSize:8.5 }}>ORIGINAL STRUCTURE TO STUDY</div><b style={{ display:'block', color:'#fff', fontSize:10.5, marginTop:4 }}>{shortlist.original_brief.selected_structure}</b></div><div style={{ padding:9, border:'1px solid rgba(191,228,255,.16)', background:'rgba(255,255,255,.045)' }}><div style={{ color:'rgba(191,228,255,.75)', fontSize:8.5 }}>HUMAN REVIEW</div><b style={{ display:'block', color:'#fff', fontSize:10.5, marginTop:4 }}>{shortlist.human_review_attention >= .5 ? 'Extra attention recommended' : 'Still required before production'}</b></div></div><div style={{ marginTop:9, padding:10, border:'1px solid rgba(191,228,255,.15)', background:'rgba(255,255,255,.035)' }}><div style={{ color:'#bfe4ff', font:'700 8.5px DM Mono,monospace', letterSpacing:'.08em' }}>ORIGINAL CREATIVE BRIEF</div><p style={{ color:'rgba(242,247,255,.67)', fontSize:9.5, lineHeight:1.5, marginTop:5 }}>{shortlist.original_brief.direction}</p><p style={{ color:'rgba(242,247,255,.48)', fontSize:8.8, lineHeight:1.45, marginTop:6 }}>{shortlist.original_brief.non_copying_rules}</p><button type="button" onClick={applyBrief} className="studio-button" style={{ marginTop:9, padding:'7px 9px', fontSize:9 }}>Use original brief in Creative Lab</button></div></div>}
  </section>
}
