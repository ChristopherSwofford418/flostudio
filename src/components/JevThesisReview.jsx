import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'

const inputStyle = { width:'100%', boxSizing:'border-box', background:'rgba(7,8,20,.32)', border:'1px solid rgba(212,208,255,.2)', borderRadius:8, color:'#fff', padding:'9px 10px', font:'inherit', fontSize:10.5, lineHeight:1.5 }

export default function JevThesisReview({ workspaceId, productId, campaign, selectedConcept }) {
  const [connection, setConnection] = useState({ loading:true, configured:false, keyLast4:null, error:'' })
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [decision, setDecision] = useState(null)

  const headers = async () => {
    const { data:{ session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Sign in again before using the workspace TypeSafe / Jev connection.')
    return { Authorization:`Bearer ${session.access_token}` }
  }
  const loadConnection = async () => {
    if (!workspaceId) { setConnection({ loading:false, configured:false, keyLast4:null, error:'' }); return }
    setConnection(current => ({ ...current, loading:true, error:'' }))
    try {
      const response = await fetch(`/api/typesafe-key?workspaceId=${encodeURIComponent(workspaceId)}`, { headers:await headers() })
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || 'Could not check the TypeSafe connection.')
      setConnection({ loading:false, configured:Boolean(data.configured), keyLast4:data.keyLast4 || null, error:'' })
    } catch (error) { setConnection({ loading:false, configured:false, keyLast4:null, error:error.message || 'Could not check the TypeSafe connection.' }) }
  }
  useEffect(() => { loadConnection() }, [workspaceId])

  const connect = async () => {
    if (!apiKey.trim()) return
    setBusy('connect'); setNotice('')
    try {
      const response = await fetch('/api/typesafe-key', { method:'POST', headers:{ ...(await headers()), 'Content-Type':'application/json' }, body:JSON.stringify({ workspaceId, apiKey:apiKey.trim() }) })
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || 'Could not connect TypeSafe.')
      setApiKey('')
      setConnection({ loading:false, configured:true, keyLast4:data.keyLast4 || null, error:'' })
      setNotice('TypeSafe / Jev connected securely to this workspace. The key is never shown again.')
    } catch (error) { setNotice(error.message || 'Could not connect TypeSafe.') }
    finally { setBusy('') }
  }
  const disconnect = async () => {
    setBusy('disconnect'); setNotice(''); setDecision(null)
    try {
      const response = await fetch('/api/typesafe-key', { method:'DELETE', headers:{ ...(await headers()), 'Content-Type':'application/json' }, body:JSON.stringify({ workspaceId }) })
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || 'Could not disconnect TypeSafe.')
      setConnection({ loading:false, configured:false, keyLast4:null, error:'' })
      setNotice('TypeSafe / Jev disconnected from this workspace.')
    } catch (error) { setNotice(error.message || 'Could not disconnect TypeSafe.') }
    finally { setBusy('') }
  }
  const runReview = async () => {
    if (!campaign?.id || !selectedConcept?.id || !productId) return
    setBusy('review'); setNotice(''); setDecision(null)
    try {
      const response = await fetch('/api/jev-thesis-review', { method:'POST', headers:{ ...(await headers()), 'Content-Type':'application/json' }, body:JSON.stringify({ workspaceId, productId, campaignId:campaign.id, conceptId:selectedConcept.id }) })
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || 'Jev did not return a review.')
      setDecision(data.decision)
      setNotice('Jev returned decision support for this exact app and thesis. Review the source record before changing anything.')
    } catch (error) { setNotice(error.message || 'Jev did not return a review.') }
    finally { setBusy('') }
  }

  const scopeReady = Boolean(workspaceId && productId && campaign?.id && selectedConcept?.id)
  return <section style={{ marginTop:15, padding:14, borderRadius:13, border:'1px solid rgba(160,210,255,.28)', background:'linear-gradient(135deg,rgba(57,115,157,.16),rgba(31,29,69,.24))' }}>
    <div style={{ display:'flex', justifyContent:'space-between', gap:12, flexWrap:'wrap', alignItems:'start' }}><div><div className="studio-kicker" style={{ color:'#aedcff' }}>JEV / TYPESAFE DECISION CHECK</div><h3 style={{ color:'#fff', fontSize:14, marginTop:5 }}>Review the thesis before production.</h3><p style={{ color:'rgba(242,247,255,.67)', fontSize:10, lineHeight:1.55, marginTop:4, maxWidth:690 }}>Jev evaluates supplied text as typed decisions. It can surface evidence, claim, audience, and controlled-test review priorities; it does not write copy, approve claims, publish posts, spend Flo tokens, or advance Momentum.</p></div><span style={{ color:'#bfe4ff', border:'1px solid rgba(191,228,255,.25)', borderRadius:99, padding:'5px 7px', fontSize:8.5, fontWeight:800 }}>{connection.loading ? 'CHECKING' : connection.configured ? 'CONNECTED' : 'OPTIONAL'}</span></div>
    {!scopeReady && <p style={{ color:'rgba(242,247,255,.65)', fontSize:10, lineHeight:1.5, marginTop:10 }}>Select an app, create or open its campaign, and choose a thesis to make an app-scoped Jev review available.</p>}
    {connection.loading ? <p style={{ color:'rgba(242,247,255,.65)', fontSize:10, marginTop:10 }}>Checking the workspace connection…</p> : !connection.configured ? <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) auto', gap:8, marginTop:11 }}><input type="password" autoComplete="off" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder="Paste TypeSafe API key to connect this workspace" style={inputStyle}/><button onClick={connect} disabled={!workspaceId || !apiKey.trim() || busy === 'connect'} className="studio-button" style={{ padding:'8px 10px', fontSize:9.5 }}>{busy === 'connect' ? 'Connecting…' : 'Connect Jev'}</button><p style={{ gridColumn:'1/-1', color:'rgba(242,247,255,.5)', fontSize:9.5, lineHeight:1.45 }}>Workspace administrators only. The key is encrypted server-side; it is never stored in the browser, creative records, exports, or logs.</p></div> : <div style={{ marginTop:11 }}><div style={{ display:'flex', justifyContent:'space-between', gap:9, alignItems:'center', flexWrap:'wrap' }}><span style={{ color:'rgba(242,247,255,.63)', fontSize:9.5 }}>Secure workspace connection ••••{connection.keyLast4}</span><button onClick={disconnect} disabled={busy === 'disconnect'} className="studio-chip" style={{ color:'#f6c9ce', borderColor:'rgba(246,201,206,.28)' }}>{busy === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}</button></div><button onClick={runReview} disabled={!scopeReady || busy === 'review'} className="studio-button" style={{ marginTop:10, padding:'8px 10px', fontSize:9.5 }}>{busy === 'review' ? 'Reviewing supplied thesis…' : 'Run Jev thesis review'}</button></div>}
    {connection.error && <p role="alert" style={{ color:'#ffcbd1', fontSize:9.5, marginTop:8 }}>{connection.error}</p>}
    {notice && <p role="status" style={{ color:'#cceaff', fontSize:9.5, marginTop:8, lineHeight:1.45 }}>{notice}</p>}
    {decision && <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(165px,1fr))', gap:8, marginTop:12 }}>{decision.cards.map((card, index) => <article key={`${card.label}-${index}`} style={{ padding:10, borderRadius:9, background:'rgba(255,255,255,.055)', border:'1px solid rgba(191,228,255,.17)' }}><div style={{ color:'#bfe4ff', font:'700 8.5px DM Mono,monospace', letterSpacing:'.08em' }}>{card.label?.toUpperCase()}</div><b style={{ display:'block', color:'#fff', fontSize:10.5, marginTop:5 }}>{card.value}</b><p style={{ color:'rgba(242,247,255,.58)', fontSize:8.8, lineHeight:1.45, marginTop:5 }}>{card.detail}</p></article>)}</div>}
    {decision && <p style={{ color:'rgba(242,247,255,.48)', fontSize:8.8, lineHeight:1.45, marginTop:10 }}>Model: {decision.model}. Jev probabilities are decision support, not proof. Keep or change this thesis only after reviewing your product facts and claim boundaries.</p>}
  </section>
}
