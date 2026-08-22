import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { useWorkspace } from '../context/WorkspaceContext'
import { supabase } from '../supabase'

async function ascRequest(payload) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) throw new Error('Sign in again before opening App Insights.')
  const response = await fetch('/api/app-store-connect', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` }, body:JSON.stringify(payload) })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'FloStudio could not load App Store Connect data.')
  return data
}

function StatusCard({ label, value, note, highlight = false }) {
  return <div className="studio-panel" style={{ padding:17, background:highlight ? 'linear-gradient(145deg,rgba(151,41,11,.56),rgba(67,10,7,.76))' : 'rgba(71,14,7,.42)', borderColor:highlight ? 'rgba(255,193,59,.36)' : 'rgba(243,240,231,.12)' }}><div className="studio-kicker" style={{ color:highlight ? 'var(--signal)' : 'rgba(243,240,231,.55)' }}>{label}</div><div style={{ color:'#fff', fontSize:23, fontWeight:850, letterSpacing:'-.05em', marginTop:8 }}>{value}</div>{note && <p style={{ color:'rgba(243,240,231,.58)', fontSize:10.5, lineHeight:1.45, marginTop:6 }}>{note}</p>}</div>
}

function availabilityLabel(entry) {
  if (!entry) return 'Not available yet'
  if (entry.status === 'available') return 'Available'
  if (entry.status === 'requires_vendor_number') return 'Vendor number needed'
  if (entry.status === 'requires_sales_or_analytics_report') return 'Apple report needed'
  if (entry.status === 'requires_analytics_report') return 'Analytics report needed'
  return 'Not authorized or unavailable'
}

export default function AppInsights() {
  const navigate = useNavigate()
  const { apps, activeApp, setActiveApp } = useWorkspace()
  const [selectedId, setSelectedId] = useState(activeApp?.id || '')
  const [connection, setConnection] = useState(null)
  const [state, setState] = useState({ loading:true, syncing:false, error:'' })
  const selectedApp = useMemo(() => apps.find(app => app.id === selectedId) || null, [apps, selectedId])
  const metrics = connection?.metrics || {}

  useEffect(() => {
    if (!selectedId && apps[0]?.id) setSelectedId(apps[0].id)
  }, [apps, selectedId])

  useEffect(() => {
    if (!selectedId) { setConnection(null); setState(current => ({ ...current, loading:false })); return }
    let alive = true
    setState({ loading:true, syncing:false, error:'' })
    ascRequest({ action:'status', productId:selectedId })
      .then(data => { if (alive) setConnection(data.connection || null) })
      .catch(error => { if (alive) setState({ loading:false, syncing:false, error:error.message }) })
      .finally(() => { if (alive) setState(current => ({ ...current, loading:false })) })
    return () => { alive = false }
  }, [selectedId])

  const selectApp = id => { setSelectedId(id); const app = apps.find(item => item.id === id); if (app) setActiveApp(app) }
  const sync = async () => {
    if (!selectedApp) return
    setState(current => ({ ...current, syncing:true, error:'' }))
    try {
      const data = await ascRequest({ action:'sync', productId:selectedApp.id })
      setConnection(current => ({ ...current, status:'connected', metrics:data.metrics, last_synced_at:data.syncedAt }))
    } catch (error) { setState(current => ({ ...current, error:error.message })) }
    finally { setState(current => ({ ...current, syncing:false })) }
  }

  if (!apps.length) return <Layout title="App Insights"><div className="page-shell" style={{ padding:'32px 30px' }}><section className="studio-panel" style={{ padding:30, textAlign:'center' }}><div className="studio-kicker">APP INSIGHTS</div><h1 style={{ color:'#fff', marginTop:8 }}>Add a portfolio app first.</h1><p style={{ color:'rgba(243,240,231,.62)', marginTop:8 }}>App Insights is always scoped to a real portfolio app, never a generic account.</p><button onClick={() => navigate('/portfolio')} className="studio-button" style={{ marginTop:16 }}>Go to portfolio →</button></section></div></Layout>

  return <Layout title="App Insights"><div className="page-shell" style={{ padding:'28px 30px 52px' }}>
    <section className="studio-dark abundance-hero" style={{ padding:'27px 30px', position:'relative', overflow:'hidden' }}><div style={{ position:'relative', zIndex:1, display:'flex', justifyContent:'space-between', gap:18, alignItems:'end', flexWrap:'wrap' }}><div><div className="studio-kicker">MANAGE / APP INSIGHTS</div><h1 className="studio-display" style={{ color:'#fff', fontSize:'clamp(32px,4vw,54px)', marginTop:9 }}>Apple performance, <span className="studio-serif" style={{ color:'var(--signal)' }}>one app at a time.</span></h1><p style={{ color:'rgba(243,240,231,.68)', fontSize:13, maxWidth:660, lineHeight:1.6, marginTop:10 }}>FloStudio shows only data returned by the connected App Store Connect key for the portfolio app selected below. Missing reports remain visibly unavailable—not estimated.</p></div><div style={{ minWidth:250 }}><div className="studio-kicker" style={{ color:'var(--signal)' }}>ACTIVE APP</div><select value={selectedId} onChange={event => selectApp(event.target.value)} style={{ width:'100%', marginTop:7 }}>{apps.map(app => <option key={app.id} value={app.id}>{app.name}</option>)}</select></div></div></section>
    {state.loading ? <section className="studio-panel" style={{ marginTop:16, padding:28, color:'rgba(243,240,231,.65)' }}>Loading this app’s secured reporting state…</section> : !connection?.status || connection.status !== 'connected' ? <section className="studio-panel" style={{ marginTop:16, padding:26, borderColor:'rgba(255,193,59,.3)', background:'rgba(112,35,9,.3)' }}><div className="studio-kicker" style={{ color:'var(--signal)' }}>APP STORE CONNECT NOT YET CONNECTED</div><h2 style={{ color:'#fff', fontSize:23, marginTop:7 }}>{selectedApp?.name} has no performance feed yet.</h2><p style={{ color:'rgba(243,240,231,.66)', fontSize:12, lineHeight:1.6, marginTop:8, maxWidth:700 }}>Open the portfolio connection panel, enter this app’s App Store Connect App ID and API Key ID, then drop the matching `.p8` file. FloStudio will validate the key, encrypt it server-side, and begin showing only authorized results here.</p><button onClick={() => navigate('/portfolio')} className="studio-button" style={{ marginTop:15 }}>Connect this app →</button></section> : <>
      <section style={{ display:'grid', gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:12, marginTop:16 }}><StatusCard label="APP STORE RATING" value={metrics.reviews?.averageRating ? `${metrics.reviews.averageRating} / 5` : '—'} note={metrics.reviews?.sampledReviewCount ? `${metrics.reviews.sampledReviewCount} authorized review records sampled` : 'No review records returned by Apple'} highlight /><StatusCard label="LATEST VERSION" value={metrics.catalog?.latestVersion || '—'} note={metrics.catalog?.latestVersionState || 'No App Store version returned'} /><StatusCard label="DOWNLOADS" value="—" note={metrics.availability?.downloads?.message || 'Sales or Analytics report required'} /><StatusCard label="PROCEEDS" value="—" note={metrics.availability?.proceeds?.message || 'Vendor number and report required'} /></section>
      <section className="studio-panel" style={{ marginTop:16, padding:20, display:'flex', justifyContent:'space-between', alignItems:'center', gap:16, flexWrap:'wrap', borderColor:'rgba(255,193,59,.25)' }}><div><div className="studio-kicker" style={{ color:'var(--signal)' }}>REPORTING HEALTH</div><b style={{ color:'#fff', display:'block', marginTop:5 }}>{metrics.catalog?.name || selectedApp?.name} · {metrics.catalog?.bundleId || 'bundle ID pending'}</b><span style={{ color:'rgba(243,240,231,.58)', fontSize:11 }}>Last secure sync: {connection.last_synced_at ? new Date(connection.last_synced_at).toLocaleString() : 'not available'}</span></div><button onClick={sync} disabled={state.syncing} className="studio-button">{state.syncing ? 'Syncing…' : 'Pull latest app data →'}</button></section>
      <section style={{ display:'grid', gridTemplateColumns:'minmax(0,1.1fr) minmax(290px,.9fr)', gap:16, marginTop:16 }}><div className="studio-panel" style={{ padding:20 }}><div className="studio-kicker" style={{ color:'var(--signal)' }}>CUSTOMER FEEDBACK / AUTHORIZED APP STORE REVIEWS</div><h2 style={{ color:'#fff', fontSize:21, marginTop:6 }}>What reviewers are saying.</h2>{metrics.reviews?.latest?.length ? <div style={{ display:'grid', gap:10, marginTop:14 }}>{metrics.reviews.latest.map(review => <article key={review.id} style={{ padding:12, background:'rgba(61,11,5,.45)', border:'1px solid rgba(243,240,231,.11)' }}><div style={{ display:'flex', justifyContent:'space-between', gap:10, color:'var(--signal)', fontSize:11, fontWeight:800 }}><span>{review.rating ? `${review.rating} / 5` : 'Rating not returned'}</span><span style={{ color:'rgba(243,240,231,.46)', fontWeight:500 }}>{review.createdDate ? new Date(review.createdDate).toLocaleDateString() : ''}</span></div>{review.title && <b style={{ color:'#fff', display:'block', fontSize:12, marginTop:6 }}>{review.title}</b>}{review.body && <p style={{ color:'rgba(243,240,231,.7)', lineHeight:1.5, fontSize:11.5, marginTop:5 }}>{review.body}</p>}</article>)}</div> : <p style={{ color:'rgba(243,240,231,.58)', fontSize:12, lineHeight:1.6, marginTop:13 }}>Apple did not return review records for this authorized key/app combination.</p>}</div><div className="studio-panel" style={{ padding:20 }}><div className="studio-kicker" style={{ color:'var(--signal)' }}>DATA READINESS</div><h2 style={{ color:'#fff', fontSize:20, marginTop:6 }}>What Apple has made available.</h2><div style={{ display:'grid', gap:9, marginTop:15 }}>{[['Catalog', { status:'available', message:'App identity and release metadata returned directly from App Store Connect.' }], ['Versions', metrics.availability?.versions], ['Reviews', metrics.availability?.reviews], ['Downloads', metrics.availability?.downloads], ['Proceeds', metrics.availability?.proceeds], ['Subscriptions', metrics.availability?.subscriptions]].map(([label, entry]) => <div key={label} style={{ padding:'9px 10px', border:'1px solid rgba(243,240,231,.12)', background:'rgba(61,11,5,.35)' }}><div style={{ display:'flex', justifyContent:'space-between', gap:8, alignItems:'start' }}><b style={{ color:'#fff', fontSize:11 }}>{label}</b><span style={{ color:entry?.status === 'available' ? 'var(--signal)' : '#ffbd65', fontSize:9, textTransform:'uppercase', letterSpacing:'.06em', textAlign:'right' }}>{availabilityLabel(entry)}</span></div>{entry?.message && <p style={{ color:'rgba(243,240,231,.52)', fontSize:10, lineHeight:1.4, marginTop:4 }}>{entry.message}</p>}</div>)}</div></div></section>
    </>}
    {state.error && <div style={{ marginTop:14, padding:11, border:'1px solid rgba(255,107,55,.45)', background:'rgba(122,24,7,.28)', color:'#ffd1b3', fontSize:12 }}>{state.error}</div>}
  </div></Layout>
}
