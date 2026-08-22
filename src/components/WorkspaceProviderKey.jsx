import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useWorkspace } from '../context/WorkspaceContext'

function explainProviderError(message) {
  const text = String(message || '')
  if (/credit|quota|billing|insufficient/i.test(text)) return 'OpenAI accepted the request but this key has no available API credits for live rendering. Add provider credits, then try again.'
  return text || 'The provider key could not be connected.'
}

export default function WorkspaceProviderKey({ onClose }) {
  const { workspaceId } = useWorkspace()
  const [status, setStatus] = useState({ loading:true, configured:false, keyLast4:null, error:'' })
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)

  const headers = async () => {
    const { data:{ session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Sign in again before connecting a workspace provider key.')
    return { Authorization:`Bearer ${session.access_token}` }
  }

  const refresh = async () => {
    if (!workspaceId) return setStatus({ loading:false, configured:false, keyLast4:null, error:'Select a workspace before connecting a provider key.' })
    try {
      const response = await fetch(`/api/provider-key?workspaceId=${encodeURIComponent(workspaceId)}`, { headers:await headers() })
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error)
      setStatus({ loading:false, configured:Boolean(data.configured), keyLast4:data.keyLast4 || null, error:'' })
    } catch (error) {
      setStatus({ loading:false, configured:false, keyLast4:null, error:explainProviderError(error.message) })
    }
  }

  useEffect(() => { refresh() }, [workspaceId])

  const save = async () => {
    if (!apiKey.trim() || saving) return
    setSaving(true)
    try {
      const response = await fetch('/api/provider-key', { method:'POST', headers:{ ...(await headers()), 'Content-Type':'application/json' }, body:JSON.stringify({ workspaceId, apiKey:apiKey.trim() }) })
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error)
      setApiKey('')
      setStatus({ loading:false, configured:true, keyLast4:data.keyLast4 || null, error:'' })
    } catch (error) {
      setStatus(current => ({ ...current, error:explainProviderError(error.message) }))
    }
    setSaving(false)
  }

  const disconnect = async () => {
    if (saving) return
    setSaving(true)
    try {
      const response = await fetch('/api/provider-key', { method:'DELETE', headers:{ ...(await headers()), 'Content-Type':'application/json' }, body:JSON.stringify({ workspaceId }) })
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error)
      setStatus({ loading:false, configured:false, keyLast4:null, error:'' })
    } catch (error) {
      setStatus(current => ({ ...current, error:explainProviderError(error.message) }))
    }
    setSaving(false)
  }

  return <div style={{ position:'fixed', inset:0, zIndex:120, background:'rgba(15,23,42,.34)', display:'grid', placeItems:'center', padding:20, backdropFilter:'blur(5px)' }} onClick={onClose}>
    <section className="studio-panel" onClick={event => event.stopPropagation()} style={{ width:'min(100%,540px)', padding:24, background:'#fff', color:'#1c2530', boxShadow:'0 26px 70px rgba(15,23,42,.2)' }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16 }}><div><div className="studio-kicker">OPENAI PROVIDER / WORKSPACE CONNECTION</div><h2 style={{ marginTop:6, fontSize:24, letterSpacing:'-.055em' }}>Connect a funded render key.</h2></div><button onClick={onClose} className="studio-button studio-button--soft" aria-label="Close provider connection" style={{ padding:'7px 10px' }}>Close</button></div>
      <p style={{ color:'#64748b', fontSize:12, lineHeight:1.6, marginTop:10 }}>Use a funded OpenAI API key for this workspace’s live image and video renders. FloStudio encrypts it on the server, never stores it in the browser, and never displays it again after saving.</p>
      <div style={{ marginTop:18, padding:12, background:'#f4f8fd', border:'1px solid #d8e9fe', borderRadius:6, fontSize:11.5, lineHeight:1.5 }}>{status.loading ? 'Checking the workspace connection…' : status.configured ? `Connected securely · current key ending in ${status.keyLast4}. Paste a new value below only to replace it.` : 'No workspace-specific provider key is connected. FloStudio will otherwise use the managed provider key.'}</div>
      <label style={{ display:'grid', gap:7, marginTop:16, fontSize:10, fontWeight:800, letterSpacing:'.08em', color:'#475569' }}>OPENAI API KEY<input className="studio-input" type="password" autoComplete="new-password" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={status.configured ? 'Paste a replacement OpenAI key' : 'sk-…'} /></label>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:14 }}><button onClick={save} disabled={saving || !apiKey.trim() || !workspaceId} className="studio-button">{saving ? 'Checking securely…' : status.configured ? 'Replace secure key' : 'Connect secure key'}</button>{status.configured && <button onClick={disconnect} disabled={saving} className="studio-button studio-button--soft">Disconnect key</button>}</div>
      {status.error && <div style={{ marginTop:12, padding:10, border:'1px solid #bfdbfe', background:'#eff6ff', color:'#1d4ed8', fontSize:11.5, lineHeight:1.5 }}>{status.error}</div>}
      <p style={{ color:'#64748b', fontSize:10.5, lineHeight:1.55, marginTop:14 }}>Your FloStudio owner account remains unlimited for product testing. OpenAI separately bills its connected provider account for completed live API renders.</p>
    </section>
  </div>
}
