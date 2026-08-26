import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import { useWorkspace } from '../context/WorkspaceContext'
import { supabase } from '../supabase'
import { appInsightsPath, appStoreConnectPath } from '../lib/appStoreConnectRouting'

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
  return <div className="studio-panel" style={{ padding:17, background:highlight ? 'linear-gradient(145deg,rgba(62,62,62,.56),rgba(22,22,22,.76))' : 'rgba(26,26,26,.42)', borderColor:highlight ? 'rgba(197,197,197,.36)' : 'rgba(240,240,240,.12)' }}><div className="studio-kicker" style={{ color:highlight ? 'var(--signal)' : 'rgba(240,240,240,.55)' }}>{label}</div><div style={{ color:'#ffffff', fontSize:23, fontWeight:850, letterSpacing:'-.05em', marginTop:8 }}>{value}</div>{note && <p style={{ color:'rgba(240,240,240,.58)', fontSize:10.5, lineHeight:1.45, marginTop:6 }}>{note}</p>}</div>
}

function availabilityLabel(entry) {
  if (!entry) return 'Not available yet'
  if (entry.status === 'not connected') return 'Not connected'
  if (entry.status === 'vendor number needed') return 'Vendor number needed'
  if (entry.status === 'available') return 'Available'
  if (entry.status === 'requires_vendor_number') return 'Vendor number needed'
  if (entry.status === 'requires_sales_or_analytics_report') return 'Apple report needed'
  if (entry.status === 'requires_analytics_report') return 'Analytics report needed'
  if (entry.status === 'unavailable') return 'Apple report unavailable'
  if (entry.status === 'no_sales_in_recent_periods') return 'No recent sales rows'
  if (entry.status === 'requested' || entry.status === 'pending') return 'Apple reports pending'
  if (entry.status === 'requires_admin_analytics_request') return 'Admin key needed once'
  if (entry.status === 'not_authorized') return 'Analytics key access needed'
  return 'Not authorized or unavailable'
}

function formatUnits(value) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits:2 }).format(Number(value || 0))
}

function formatUsd(value) {
  return new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:2 }).format(Number(value || 0))
}

function proceedsSummary(sales) {
  const entries = Object.entries(sales?.proceedsByCurrency || {})
  if (!entries.length) return { value:'—', note:sales?.message || 'Apple has not provided a Sales and Trends report.' }
  const [currency, amount] = entries[0]
  const value = new Intl.NumberFormat('en-US', { style:'currency', currency:currency === 'UNKNOWN' ? 'USD' : currency, maximumFractionDigits:2 }).format(Number(amount || 0))
  return { value, note:entries.length > 1 ? `Estimated developer proceeds by Apple currency: ${entries.map(([code, total]) => `${code} ${Number(total).toFixed(2)}`).join(' · ')}` : `Estimated developer proceeds in ${currency}.` }
}

export default function AppInsights() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { apps, activeApp, setActiveApp } = useWorkspace()
  const [selectedId, setSelectedId] = useState('')
  const [fleet, setFleet] = useState([])
  const [fleetLoading, setFleetLoading] = useState(false)
  const [connection, setConnection] = useState(null)
  const [vendorInput, setVendorInput] = useState('')
  const [state, setState] = useState({ loading:true, syncing:false, error:'', notice:'' })
  const selectedApp = useMemo(() => apps.find(app => app.id === selectedId) || null, [apps, selectedId])
  const metrics = connection?.metrics || {}
  const sales = metrics.sales || null
  const analytics = metrics.analytics || null
  const analyticsReady = analytics?.status === 'available'
  const subscriptions = metrics.subscriptions || null
  const subscriptionsReady = subscriptions?.status === 'available'
  const configuration = metrics.configuration || null
  const configurationReady = configuration?.status === 'available'
  const proceeds = proceedsSummary(sales)
  const sourceFacts = selectedApp?.sourceFacts || selectedApp?.source_facts || {}
  const requestedId = searchParams.get('app') || ''
  const analyticsHasActivity = analyticsReady && [analytics.firstTimeDownloads, analytics.redownloads, analytics.impressions, analytics.productPageViews, analytics.updates].some(value => Number(value || 0) > 0)
  const fleetSummary = useMemo(() => ({
    total:apps.length,
    connected:fleet.filter(item => item.connection?.status === 'connected').length,
    analyticsReady:fleet.filter(item => item.connection?.metrics?.analytics?.status === 'available').length,
    salesReady:fleet.filter(item => item.connection?.metrics?.sales?.status === 'available').length,
    missing:fleet.filter(item => item.connection?.status !== 'connected').length,
  }), [apps.length, fleet])

  useEffect(() => {
    const requested = apps.some(app => app.id === requestedId) ? requestedId : ''
    const preferred = requested || activeApp?.id || apps[0]?.id || ''
    if (preferred && (!selectedId || requested)) {
      setSelectedId(preferred)
      const app = apps.find(item => item.id === preferred)
      if (app) setActiveApp(app)
    }
  }, [apps, activeApp?.id, requestedId, selectedId, setActiveApp])

  useEffect(() => {
    if (!apps.length) { setFleet([]); return }
    let alive = true
    setFleetLoading(true)
    Promise.all(apps.map(async app => {
      try { const data = await ascRequest({ action:'status', productId:app.id }); return { app, connection:data.connection || null } }
      catch (error) { return { app, connection:null, error:error.message || 'Status unavailable' } }
    })).then(rows => { if (alive) setFleet(rows) }).finally(() => { if (alive) setFleetLoading(false) })
    return () => { alive = false }
  }, [apps])

  useEffect(() => {
    if (!selectedId) { setConnection(null); setVendorInput(''); setState(current => ({ ...current, loading:false })); return }
    let alive = true
    setState({ loading:true, syncing:false, error:'' })
    ascRequest({ action:'status', productId:selectedId })
      .then(data => { if (alive) { setConnection(data.connection || null); setVendorInput(data.connection?.vendor_number || '') } })
      .catch(error => { if (alive) setState({ loading:false, syncing:false, error:error.message }) })
      .finally(() => { if (alive) setState(current => ({ ...current, loading:false })) })
    return () => { alive = false }
  }, [selectedId])

  const selectApp = id => {
    setSelectedId(id)
    const app = apps.find(item => item.id === id)
    if (app) setActiveApp(app)
    navigate(appInsightsPath(id), { replace:true })
  }
  const sync = async () => {
    if (!selectedApp) return
    setState(current => ({ ...current, syncing:true, error:'', notice:'' }))
    try {
      const data = await ascRequest({ action:'sync', productId:selectedApp.id })
      const refreshed = { status:'connected', metrics:data.metrics, last_synced_at:data.syncedAt }
      setConnection(current => ({ ...current, ...refreshed }))
      setFleet(current => current.map(item => item.app.id === selectedApp.id ? { ...item, connection:{ ...item.connection, ...refreshed } } : item))
      setState(current => ({ ...current, notice:'Apple reporting data refreshed for the selected app.' }))
    } catch (error) { setState(current => ({ ...current, error:error.message })) }
    finally { setState(current => ({ ...current, syncing:false })) }
  }

  const saveVendorAndSync = async () => {
    if (!selectedApp || !vendorInput.trim()) { setState(current => ({ ...current, error:'Enter the Vendor Number shown in App Store Connect → Reports.' })); return }
    setState(current => ({ ...current, syncing:true, error:'', notice:'' }))
    try {
      await ascRequest({ action:'update_vendor_number', productId:selectedApp.id, vendorNumber:vendorInput.trim() })
      const data = await ascRequest({ action:'sync', productId:selectedApp.id })
      const refreshed = { vendor_number:vendorInput.trim(), status:'connected', metrics:data.metrics, last_synced_at:data.syncedAt }
      setConnection(current => ({ ...current, ...refreshed }))
      setFleet(current => current.map(item => item.app.id === selectedApp.id ? { ...item, connection:{ ...item.connection, ...refreshed } } : item))
      setState(current => ({ ...current, notice:'Vendor Number saved for this app and its latest Apple report was requested.' }))
    } catch (error) { setState(current => ({ ...current, error:error.message })) }
    finally { setState(current => ({ ...current, syncing:false })) }
  }

  if (!apps.length) return <Layout title="App Insights"><div className="page-shell" style={{ padding:'32px 30px' }}><section className="studio-panel" style={{ padding:30, textAlign:'center' }}><div className="studio-kicker">APP INSIGHTS</div><h1 style={{ color:'#ffffff', marginTop:8 }}>Add a portfolio app first.</h1><p style={{ color:'rgba(240,240,240,.62)', marginTop:8 }}>App Insights is always scoped to a real portfolio app, never a generic account.</p><button onClick={() => navigate('/portfolio')} className="studio-button" style={{ marginTop:16 }}>Go to portfolio →</button></section></div></Layout>

  return <Layout title="App Insights"><div className="page-shell" style={{ padding:'28px 30px 52px' }}>
    <section className="studio-dark abundance-hero" style={{ padding:'27px 30px', position:'relative', overflow:'hidden' }}><div style={{ position:'relative', zIndex:1, display:'flex', justifyContent:'space-between', gap:18, alignItems:'end', flexWrap:'wrap' }}><div><div className="studio-kicker">MANAGE / APP INSIGHTS</div><h1 className="studio-display" style={{ color:'#ffffff', fontSize:'clamp(32px,4vw,54px)', marginTop:9 }}>Apple performance, <span className="studio-serif" style={{ color:'var(--signal)' }}>one app at a time.</span></h1><p style={{ color:'rgba(240,240,240,.68)', fontSize:13, maxWidth:660, lineHeight:1.6, marginTop:10 }}>FloStudio shows only data returned by the connected App Store Connect key for the portfolio app selected below. Missing reports remain visibly unavailable—not estimated.</p></div><div style={{ minWidth:250 }}><div className="studio-kicker" style={{ color:'var(--signal)' }}>ACTIVE APP</div><select value={selectedId} onChange={event => selectApp(event.target.value)} style={{ width:'100%', marginTop:7 }}>{apps.map(app => <option key={app.id} value={app.id}>{app.name}</option>)}</select></div></div></section>
    <section className="studio-panel" style={{ marginTop:16, padding:20, borderColor:'rgba(197,197,197,.25)' }}><div style={{ display:'flex', justifyContent:'space-between', gap:16, alignItems:'start', flexWrap:'wrap' }}><div><div className="studio-kicker" style={{ color:'var(--signal)' }}>PORTFOLIO CONNECTION HEALTH</div><h2 style={{ color:'#fff', fontSize:22, marginTop:6 }}>What is live across all {fleetSummary.total} apps.</h2><p style={{ color:'rgba(240,240,240,.6)', fontSize:11.5, lineHeight:1.55, marginTop:5, maxWidth:720 }}>This view checks each app’s own encrypted App Store Connect record. A zero is shown only when Apple returned a report with zero activity; an unavailable report remains labeled with its exact Apple readiness state.</p></div><div style={{ display:'grid', gridTemplateColumns:'repeat(4,minmax(74px,1fr))', gap:8, minWidth:330 }}>{[['CONNECTED',fleetSummary.connected],['ANALYTICS',fleetSummary.analyticsReady],['SALES READY',fleetSummary.salesReady],['NEEDS KEY',fleetSummary.missing]].map(([label,value]) => <div key={label} style={{ padding:'9px 10px', border:'1px solid rgba(240,240,240,.13)', background:'rgba(18,18,18,.35)' }}><div className="studio-kicker" style={{ color:'rgba(240,240,240,.48)', fontSize:8 }}>{label}</div><b style={{ display:'block', color:'#fff', fontSize:20, marginTop:4 }}>{fleetLoading ? '—' : value}</b></div>)}</div></div><div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(196px,1fr))', gap:8, marginTop:15 }}>{fleet.map(item => { const connected = item.connection?.status === 'connected'; const analyticsStatus = item.connection?.metrics?.analytics?.status || 'not connected'; const salesStatus = item.connection?.metrics?.sales?.status || 'vendor number needed'; return <button key={item.app.id} type="button" onClick={() => selectApp(item.app.id)} style={{ textAlign:'left', padding:'10px 11px', cursor:'pointer', border:`1px solid ${item.app.id === selectedId ? 'rgba(197,197,197,.62)' : 'rgba(240,240,240,.12)'}`, background:item.app.id === selectedId ? 'rgba(197,197,197,.11)' : 'rgba(18,18,18,.28)', color:'#fff' }}><div style={{ display:'flex', justifyContent:'space-between', gap:8 }}><b style={{ fontSize:11.5 }}>{item.app.name}</b><span style={{ color:connected ? 'var(--signal)' : '#d7d7d7', fontSize:9, fontWeight:850, textTransform:'uppercase' }}>{connected ? 'Connected' : 'Needs key'}</span></div><p style={{ color:'rgba(240,240,240,.56)', fontSize:9.5, lineHeight:1.45, marginTop:5 }}>Analytics: {availabilityLabel({ status:analyticsStatus })}<br/>Sales: {availabilityLabel({ status:salesStatus })}</p></button> })}</div></section>
    {state.loading ? <section className="studio-panel" style={{ marginTop:16, padding:28, color:'rgba(240,240,240,.65)' }}>Loading this app’s secured reporting state…</section> : !connection?.status || connection.status !== 'connected' ? <section className="studio-panel" style={{ marginTop:16, padding:26, borderColor:'rgba(197,197,197,.3)', background:'rgba(49,49,49,.3)' }}><div className="studio-kicker" style={{ color:'var(--signal)' }}>APP STORE CONNECT NOT YET CONNECTED</div><h2 style={{ color:'#ffffff', fontSize:23, marginTop:7 }}>{selectedApp?.name} has no performance feed yet.</h2><p style={{ color:'rgba(240,240,240,.66)', fontSize:12, lineHeight:1.6, marginTop:8, maxWidth:700 }}>Open the portfolio connection panel, enter this app’s App Store Connect App ID and API Key ID, then drop the matching `.p8` file. FloStudio will validate the key, encrypt it server-side, and begin showing only authorized results here.</p><button onClick={() => navigate(appStoreConnectPath(selectedApp?.id))} className="studio-button" style={{ marginTop:15 }}>Connect {selectedApp?.name || 'this app'} →</button></section> : <>
      <section style={{ display:'grid', gridTemplateColumns:'repeat(3,minmax(0,1fr))', gap:12, marginTop:16 }}><StatusCard label="FIRST-TIME DOWNLOADS" value={analyticsReady ? formatUnits(analytics.firstTimeDownloads) : '—'} note={analyticsReady ? `Apple App Analytics · last ${analytics.periodDays} days` : metrics.availability?.analytics?.message || 'Apple App Analytics report required'} highlight /><StatusCard label="REDOWNLOADS" value={analyticsReady ? formatUnits(analytics.redownloads) : '—'} note={analyticsReady ? `Apple App Analytics · last ${analytics.periodDays} days` : metrics.availability?.analytics?.message || 'Apple App Analytics report required'} /><StatusCard label="CONVERSION RATE" value={analyticsReady && analytics.conversionRate !== null ? `${analytics.conversionRate}%` : '—'} note={analyticsReady ? 'Total downloads divided by Apple-reported impressions.' : metrics.availability?.analytics?.message || 'Apple App Analytics report required'} /><StatusCard label="IMPRESSIONS" value={analyticsReady ? formatUnits(analytics.impressions) : '—'} note={analyticsReady ? 'Unique App Store discovery impressions in the analytics window.' : metrics.availability?.analytics?.message || 'Apple App Analytics report required'} /><StatusCard label="PRODUCT PAGE VIEWS" value={analyticsReady ? formatUnits(analytics.productPageViews) : '—'} note={analyticsReady ? 'Apple-reported product page views in the analytics window.' : metrics.availability?.analytics?.message || 'Apple App Analytics report required'} /><StatusCard label="UPDATES" value={analyticsReady ? formatUnits(analytics.updates) : '—'} note={analyticsReady ? 'Manual and automatic updates reported by Apple.' : metrics.availability?.analytics?.message || 'Apple App Analytics report required'} /><StatusCard label="APP STORE RATING" value={metrics.reviews?.averageRating ? `${metrics.reviews.averageRating} / 5` : '—'} note={metrics.reviews?.sampledReviewCount ? `${metrics.reviews.sampledReviewCount} authorized review records sampled` : 'No review records returned by Apple'} /><StatusCard label="LATEST VERSION" value={metrics.catalog?.latestVersion || '—'} note={metrics.catalog?.latestVersionState || 'No App Store version returned'} /><StatusCard label="EST. PROCEEDS" value={sales?.status === 'available' ? proceeds.value : '—'} note={sales?.status === 'available' ? proceeds.note : metrics.availability?.proceeds?.message || 'Vendor number and Sales report required'} /></section>
      <section className="studio-panel" style={{ marginTop:16, padding:20, borderColor:'rgba(197,197,197,.25)' }}><div style={{ display:'grid', gridTemplateColumns:'minmax(0,1.1fr) minmax(260px,.9fr)', gap:18, alignItems:'start' }}><div><div className="studio-kicker" style={{ color:'var(--signal)' }}>APPLE REPORT INTERPRETATION</div><h2 style={{ color:'#fff', fontSize:21, marginTop:6 }}>{analyticsReady ? (analyticsHasActivity ? 'Apple returned measurable activity for this app.' : 'Apple returned reporting, but no activity rows in the current window.') : 'Apple has not supplied a complete analytics report for this app yet.'}</h2><p style={{ color:'rgba(240,240,240,.63)', fontSize:11.5, lineHeight:1.6, marginTop:7 }}>{analyticsReady ? `The cards above reflect Apple’s ${analytics.periodDays}-day report window. A displayed 0 is an Apple-reported zero, not a FloStudio estimate. ${analytics.processingDates?.downloads || analytics.processingDates?.engagement ? `Latest report processing dates: downloads ${analytics.processingDates?.downloads || 'not supplied'} · engagement ${analytics.processingDates?.engagement || 'not supplied'}.` : 'Apple returned the report type but did not attach a processing date for every data stream.'}` : metrics.availability?.analytics?.message || 'Use the selected app’s connection panel to request or authorize the required Apple Analytics reports.'}</p></div><div style={{ padding:'12px', border:'1px solid rgba(240,240,240,.12)', background:'rgba(18,18,18,.3)' }}><div className="studio-kicker" style={{ color:'var(--signal)' }}>PUBLIC APP STORE CONTEXT</div><div style={{ display:'flex', gap:10, marginTop:8, alignItems:'center' }}>{sourceFacts.image ? <img src={sourceFacts.image} alt="Selected app artwork" style={{ width:46, height:46, objectFit:'cover', borderRadius:11, border:'1px solid rgba(240,240,240,.15)' }} /> : null}<div><b style={{ color:'#fff', fontSize:12 }}>{sourceFacts.storeMetadata?.trackName || metrics.catalog?.name || selectedApp?.name}</b><p style={{ color:'rgba(240,240,240,.58)', fontSize:10.5, marginTop:3 }}>{sourceFacts.category || sourceFacts.storeMetadata?.primaryGenreName || 'App Store listing context'} · {(sourceFacts.screenshots || []).length} saved screenshot{(sourceFacts.screenshots || []).length === 1 ? '' : 's'}</p></div></div><p style={{ color:'rgba(240,240,240,.52)', fontSize:10, lineHeight:1.45, marginTop:9 }}>{sourceFacts.storeMetadata?.sellerName ? `Seller: ${sourceFacts.storeMetadata.sellerName}` : 'Public listing data is retained separately from Apple’s private reporting feeds.'}</p></div></div></section>
      <section className="studio-panel" style={{ marginTop:16, padding:20, display:'flex', justifyContent:'space-between', alignItems:'end', gap:16, flexWrap:'wrap', borderColor:'rgba(197,197,197,.25)' }}><div><div className="studio-kicker" style={{ color:'var(--signal)' }}>REPORTING HEALTH / SELECTED APP</div><b style={{ color:'#ffffff', display:'block', marginTop:5 }}>{metrics.catalog?.name || selectedApp?.name} · {metrics.catalog?.bundleId || 'bundle ID pending'}</b><span style={{ color:'rgba(240,240,240,.58)', fontSize:11 }}>Last secure sync: {connection.last_synced_at ? new Date(connection.last_synced_at).toLocaleString() : 'not available'}</span><label className="portfolio-field" style={{ display:'block', marginTop:13, minWidth:280 }}><span>Apple Vendor Number for {selectedApp?.name}</span><input value={vendorInput} onChange={event => setVendorInput(event.target.value)} placeholder="Reports → legal entity → Vendor #" /></label><p style={{ color:'rgba(240,240,240,.52)', fontSize:10.5, lineHeight:1.45, marginTop:6 }}>This applies only to the selected FloStudio app. Apple requires it to download that app’s Sales & Trends report.</p></div><div style={{ display:'flex', gap:8, flexWrap:'wrap' }}><button onClick={() => navigate(appStoreConnectPath(selectedApp?.id))} disabled={state.syncing} className="studio-button" style={{ background:'transparent', color:'var(--signal)', border:'1px solid rgba(197,197,197,.45)' }}>Edit / replace connection key →</button><button onClick={saveVendorAndSync} disabled={state.syncing || !vendorInput.trim()} className="studio-button">{state.syncing ? 'Pulling…' : 'Save & pull numbers →'}</button><button onClick={sync} disabled={state.syncing} className="studio-button" style={{ background:'transparent', color:'var(--signal)', border:'1px solid rgba(197,197,197,.45)' }}>{state.syncing ? 'Syncing…' : 'Pull latest data →'}</button></div></section>
      <section className="studio-panel" style={{ marginTop:16, padding:20, borderColor:'rgba(197,197,197,.25)' }}><div className="studio-kicker" style={{ color:'var(--signal)' }}>SUBSCRIPTIONS / APPLE-REPORTED</div><h2 style={{ color:'#ffffff', fontSize:21, marginTop:6 }}>Recurring revenue and subscriber health.</h2><p style={{ color:'rgba(240,240,240,.6)', fontSize:11.5, lineHeight:1.55, marginTop:5, maxWidth:760 }}>{subscriptionsReady ? subscriptions.note : metrics.availability?.subscriptions?.message || 'Apple subscription reports are not available yet for this selected app.'}</p><div style={{ display:'grid', gridTemplateColumns:'repeat(3,minmax(0,1fr))', gap:12, marginTop:15 }}><StatusCard label="ACTIVE PAID PLANS" value={subscriptionsReady ? formatUnits(subscriptions.activePaidPlans) : '—'} note={subscriptionsReady ? `Subscription State · latest ${subscriptions.stateWindowDays}-day Apple snapshot` : 'Apple report pending'} highlight /><StatusCard label="FREE TRIALS" value={subscriptionsReady ? formatUnits(subscriptions.freeTrials) : '—'} note={subscriptionsReady ? 'Active trials in the Apple subscription state report.' : 'Apple report pending'} /><StatusCard label="RENEWALS" value={subscriptionsReady ? formatUnits(subscriptions.renewals) : '—'} note={subscriptionsReady ? `Apple subscription events · last ${subscriptions.eventWindowDays} days` : 'Apple report pending'} /><StatusCard label="TRIAL → PAID" value={subscriptionsReady ? formatUnits(subscriptions.trialToPaid) : '—'} note={subscriptionsReady ? `Apple subscription conversions · last ${subscriptions.eventWindowDays} days` : 'Apple report pending'} /><StatusCard label="VOLUNTARY CHURN" value={subscriptionsReady ? formatUnits(subscriptions.voluntaryChurn) : '—'} note={subscriptionsReady ? `Apple subscription events · last ${subscriptions.eventWindowDays} days` : 'Apple report pending'} /><StatusCard label="IN-APP PROCEEDS" value={subscriptionsReady ? formatUsd(subscriptions.inAppPurchaseProceedsUsd) : '—'} note={subscriptionsReady ? `Apple in-app purchase proceeds · last ${subscriptions.purchaseWindowDays} days · USD` : 'Apple report pending'} /></div></section>
      <section className="studio-panel" style={{ marginTop:16, padding:20, borderColor:'rgba(197,197,197,.25)' }}><div className="studio-kicker" style={{ color:'var(--signal)' }}>STORE CONFIGURATION SNAPSHOT / SELECTED APP</div><h2 style={{ color:'#ffffff', fontSize:21, marginTop:6 }}>Live paywall and App Store settings.</h2><p style={{ color:'rgba(240,240,240,.6)', fontSize:11.5, lineHeight:1.55, marginTop:5 }}>{configurationReady ? configuration.message : metrics.availability?.configuration?.message || 'App Store configuration has not been returned for this selected app yet.'}</p>{configurationReady ? <><div style={{ display:'grid', gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:10, marginTop:14 }}><StatusCard label="APPLE APP ID" value={configuration.app?.appleId || '—'} note="Selected app only" /><StatusCard label="BUNDLE ID" value={configuration.app?.bundleId || '—'} note={configuration.app?.primaryLocale || 'Locale not returned'} /><StatusCard label="SUBSCRIPTION GROUPS" value={formatUnits(configuration.subscriptionGroups?.length)} note="Configured in App Store Connect" /><StatusCard label="IN-APP PRODUCTS" value={formatUnits(configuration.inAppPurchases?.length)} note="Configured in App Store Connect" /></div><div style={{ display:'grid', gridTemplateColumns:'repeat(2,minmax(0,1fr))', gap:14, marginTop:16 }}><div><div className="studio-kicker" style={{ color:'var(--signal)' }}>AUTO-RENEWABLE SUBSCRIPTIONS</div><div style={{ display:'grid', gap:9, marginTop:8 }}>{configuration.subscriptionGroups?.flatMap(group => group.subscriptions.map(subscription => <article key={subscription.id} style={{ padding:12, border:'1px solid rgba(240,240,240,.12)', background:'rgba(21,21,21,.35)' }}><div style={{ display:'flex', justifyContent:'space-between', gap:10 }}><b style={{ color:'#ffffff', fontSize:12 }}>{subscription.name}</b><span style={{ color:'var(--signal)', fontSize:12, fontWeight:800 }}>{subscription.price?.customerPrice ? `$${subscription.price.customerPrice} USD` : 'Price not returned'}</span></div><p style={{ color:'rgba(240,240,240,.57)', fontSize:10.5, marginTop:5 }}>{subscription.productId || 'Product ID not returned'} · {subscription.period || 'Period not returned'} · {subscription.state || 'State not returned'}{subscription.price?.preserved ? ' · Preserved price' : ''}</p>{subscription.introductoryOffers?.length ? <p style={{ color:'#d3d3d3', fontSize:10.5, marginTop:5 }}>{subscription.introductoryOffers.length} introductory offer{subscription.introductoryOffers.length === 1 ? '' : 's'} configured</p> : null}</article>)) || <p style={{ color:'rgba(240,240,240,.56)', fontSize:11 }}>No subscription products returned for this app.</p>}</div></div><div><div className="studio-kicker" style={{ color:'var(--signal)' }}>IN-APP PURCHASE PAYWALL PRODUCTS</div><div style={{ display:'grid', gap:9, marginTop:8 }}>{configuration.inAppPurchases?.length ? configuration.inAppPurchases.map(purchase => <article key={purchase.id} style={{ padding:12, border:'1px solid rgba(240,240,240,.12)', background:'rgba(21,21,21,.35)' }}><div style={{ display:'flex', justifyContent:'space-between', gap:10 }}><b style={{ color:'#ffffff', fontSize:12 }}>{purchase.name}</b><span style={{ color:'var(--signal)', fontSize:12, fontWeight:800 }}>{purchase.price?.customerPrice ? `$${purchase.price.customerPrice} USD` : 'Price not returned'}</span></div><p style={{ color:'rgba(240,240,240,.57)', fontSize:10.5, marginTop:5 }}>{purchase.productId || 'Product ID not returned'} · {purchase.type || 'Type not returned'} · {purchase.state || 'State not returned'}{purchase.familySharable ? ' · Family sharing' : ''}</p></article>) : <p style={{ color:'rgba(240,240,240,.56)', fontSize:11 }}>No in-app purchase products returned for this app.</p>}</div></div></div></> : <p style={{ color:'rgba(240,240,240,.56)', fontSize:12, marginTop:14 }}>Use a Team API key with App Manager, Admin, or Account Holder access to retrieve the live configuration snapshot.</p>}</section>
      <section style={{ display:'grid', gridTemplateColumns:'minmax(0,1.1fr) minmax(290px,.9fr)', gap:16, marginTop:16 }}><div className="studio-panel" style={{ padding:20 }}><div className="studio-kicker" style={{ color:'var(--signal)' }}>CUSTOMER FEEDBACK / AUTHORIZED APP STORE REVIEWS</div><h2 style={{ color:'#ffffff', fontSize:21, marginTop:6 }}>What reviewers are saying.</h2>{metrics.reviews?.latest?.length ? <div style={{ display:'grid', gap:10, marginTop:14 }}>{metrics.reviews.latest.map(review => <article key={review.id} style={{ padding:12, background:'rgba(21,21,21,.45)', border:'1px solid rgba(240,240,240,.11)' }}><div style={{ display:'flex', justifyContent:'space-between', gap:10, color:'var(--signal)', fontSize:11, fontWeight:800 }}><span>{review.rating ? `${review.rating} / 5` : 'Rating not returned'}</span><span style={{ color:'rgba(240,240,240,.46)', fontWeight:500 }}>{review.createdDate ? new Date(review.createdDate).toLocaleDateString() : ''}</span></div>{review.title && <b style={{ color:'#ffffff', display:'block', fontSize:12, marginTop:6 }}>{review.title}</b>}{review.body && <p style={{ color:'rgba(240,240,240,.7)', lineHeight:1.5, fontSize:11.5, marginTop:5 }}>{review.body}</p>}</article>)}</div> : <p style={{ color:'rgba(240,240,240,.58)', fontSize:12, lineHeight:1.6, marginTop:13 }}>Apple did not return review records for this authorized key/app combination.</p>}</div><div className="studio-panel" style={{ padding:20 }}><div className="studio-kicker" style={{ color:'var(--signal)' }}>DATA READINESS</div><h2 style={{ color:'#ffffff', fontSize:20, marginTop:6 }}>What Apple has made available.</h2><div style={{ display:'grid', gap:9, marginTop:15 }}>{[['Catalog', { status:'available', message:'App identity and release metadata returned directly from App Store Connect.' }], ['Store configuration', metrics.availability?.configuration], ['App Analytics', metrics.availability?.analytics], ['Versions', metrics.availability?.versions], ['Reviews', metrics.availability?.reviews], ['Downloads', metrics.availability?.downloads], ['Proceeds', metrics.availability?.proceeds], ['Subscriptions', metrics.availability?.subscriptions]].map(([label, entry]) => <div key={label} style={{ padding:'9px 10px', border:'1px solid rgba(240,240,240,.12)', background:'rgba(21,21,21,.35)' }}><div style={{ display:'flex', justifyContent:'space-between', gap:8, alignItems:'start' }}><b style={{ color:'#ffffff', fontSize:11 }}>{label}</b><span style={{ color:entry?.status === 'available' ? 'var(--signal)' : '#c5c5c5', fontSize:9, textTransform:'uppercase', letterSpacing:'.06em', textAlign:'right' }}>{availabilityLabel(entry)}</span></div>{entry?.message && <p style={{ color:'rgba(240,240,240,.52)', fontSize:10, lineHeight:1.4, marginTop:4 }}>{entry.message}</p>}</div>)}</div></div></section>
    </>}
    {state.error && <div style={{ marginTop:14, padding:11, border:'1px solid rgba(135,135,135,.45)', background:'rgba(44,44,44,.28)', color:'#d9d9d9', fontSize:12 }}>{state.error}</div>}
    {state.notice && <div style={{ marginTop:14, padding:11, border:'1px solid rgba(197,197,197,.35)', background:'rgba(197,197,197,.08)', color:'#f0f0f0', fontSize:12 }}>{state.notice}</div>}
  </div></Layout>
}
