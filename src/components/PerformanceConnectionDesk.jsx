import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

const PLATFORMS = [
  { id:'meta_ads', label:'Meta Ads', mark:'M', summary:'Bring campaign, ad-set, ad, and creative results into the app growth loop.' },
  { id:'tiktok_ads', label:'TikTok Ads', mark:'T', summary:'Connect advertiser performance so UGC variants can be measured against installs and spend.' },
  { id:'google_ads', label:'Google Ads', mark:'G', summary:'Connect acquisition performance for search, app, display, and video campaigns.' },
  { id:'ga4', label:'Google Analytics 4', mark:'GA', summary:'Connect web and funnel signals to complement App Store and paid-channel data.' },
]

function statusLabel(status) {
  return ({ connected:'CONNECTED', ready_to_authorize:'READY TO AUTHORIZE', needs_reauthorization:'REAUTHORIZE', error:'ACTION REQUIRED', setup_required:'SECURE SETUP REQUIRED' })[status] || 'CHECKING'
}

function statusColor(status) {
  return status === 'connected' ? '#ededed' : status === 'ready_to_authorize' ? '#d7d7d7' : '#bdbdbd'
}

export default function PerformanceConnectionDesk({ workspaceId }) {
  const [connections, setConnections] = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')

  const request = async (platform, action = 'status') => {
    const { data:{ session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Sign in again before managing performance connections.')
    const response = await fetch('/api/performance-connect', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}` }, body:JSON.stringify({ workspaceId, platform, action }) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(data.error || 'FloStudio could not read paid-performance connection status.')
      error.code = data.code
      throw error
    }
    return data
  }

  const load = async () => {
    if (!workspaceId) return
    setLoading(true)
    try {
      const pairs = await Promise.all(PLATFORMS.map(async platform => {
        try { return [platform.id, await request(platform.id)] }
        catch (error) { return [platform.id, { platform:platform.id, status:'setup_required', configured:false, requirement:error.message, errorCode:error.code }] }
      }))
      setConnections(Object.fromEntries(pairs))
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [workspaceId])

  const initialize = async platform => {
    setBusy(platform); setNotice('')
    try {
      const result = await request(platform, 'initialize')
      setConnections(previous => ({ ...previous, [platform]:result }))
      setNotice(result.configured ? `${result.label} is ready for its provider authorization step.` : `${result.label} requires secure production credentials before authorization can begin. Existing social connections remain unchanged.`)
    } catch (error) { setNotice(error.message) }
    finally { setBusy('') }
  }

  return <section className="studio-panel" style={{ padding:20, marginTop:24, border:'1px solid rgba(201,201,201,.24)' }}>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'start', gap:18, flexWrap:'wrap' }}><div><div className="studio-kicker" style={{ color:'#d7d7d7' }}>GROWTH LOOP / PAID-PERFORMANCE CONNECTIONS</div><h2 style={{ color:'#ffffff', fontSize:25, letterSpacing:'-.05em', marginTop:5 }}>Measure creative against <span className="studio-serif" style={{ color:'#c9c9c9' }}>market response.</span></h2><p style={{ color:'rgba(242,242,242,.64)', fontSize:11.5, lineHeight:1.6, maxWidth:730, marginTop:7 }}>This new connection layer is additive. It does not change your existing Facebook, Instagram, LinkedIn, TikTok, or X publishing destinations. Once connected, these sources will attach real spend and result observations to creative variants.</p></div><span className="studio-chip" style={{ color:'#ededed' }}>READINESS LAYER</span></div>
    {notice && <div style={{ marginTop:14, padding:11, background:'rgba(237,237,237,.08)', border:'1px solid rgba(237,237,237,.17)', color:'#ededed', borderRadius:10, fontSize:11.5 }}>{notice}</div>}
    <div style={{ display:'grid', gridTemplateColumns:'repeat(2,minmax(0,1fr))', gap:10, marginTop:16 }}>{PLATFORMS.map(platform => { const connection = connections[platform.id] || {}; const color = statusColor(connection.status); return <article key={platform.id} style={{ padding:14, border:'1px solid rgba(255,255,255,.12)', background:'rgba(0,0,0,.19)', borderRadius:11 }}><div style={{ display:'flex', justifyContent:'space-between', alignItems:'start', gap:10 }}><div style={{ display:'flex', gap:9, alignItems:'center' }}><div style={{ width:30, height:30, borderRadius:9, display:'grid', placeItems:'center', fontWeight:850, fontSize:platform.mark.length > 1 ? 9 : 12, color:'#ffffff', background:'rgba(255,255,255,.1)' }}>{platform.mark}</div><div><b style={{ color:'#ffffff', fontSize:12 }}>{platform.label}</b><div style={{ color, font:'600 8.5px DM Mono,monospace', letterSpacing:'.06em', marginTop:3 }}>{loading ? 'CHECKING' : statusLabel(connection.status)}</div></div></div></div><p style={{ color:'rgba(242,242,242,.56)', fontSize:10.5, lineHeight:1.55, marginTop:10 }}>{connection.live ? `${connection.connection?.accountName || 'Verified account'} is connected and ready to contribute performance observations.` : platform.summary}</p><p style={{ color:'rgba(242,242,242,.38)', fontSize:9.5, lineHeight:1.45, marginTop:7 }}>{connection.requirement || 'Checking secure setup requirements…'}</p><button type="button" onClick={() => initialize(platform.id)} disabled={loading || busy === platform.id || connection.live} className={connection.live ? 'studio-button studio-button--soft' : 'studio-button'} style={{ padding:'7px 9px', fontSize:9.5, marginTop:10 }}>{busy === platform.id ? 'Checking…' : connection.live ? 'Connected' : connection.configured ? 'Prepare authorization' : 'View setup state'}</button></article> })}</div>
  </section>
}
