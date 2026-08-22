import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

async function ascRequest(payload) {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) throw new Error('Sign in again before managing App Store Connect.')
  const response = await fetch('/api/app-store-connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'FloStudio could not complete the App Store Connect request.')
  return body
}

export default function AppStoreConnectPanel({ apps = [] }) {
  const navigate = useNavigate()
  const [productId, setProductId] = useState('')
  const [connection, setConnection] = useState(null)
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState('')
  const [fileEpoch, setFileEpoch] = useState(0)
  const [form, setForm] = useState({ appStoreAppId:'', issuerId:'', keyId:'', keyType:'team', vendorNumber:'', privateKey:'', fileName:'' })

  const selectedApp = useMemo(() => apps.find(app => app.id === productId) || null, [apps, productId])

  useEffect(() => {
    if (!productId && apps[0]?.id) setProductId(apps[0].id)
  }, [apps, productId])

  useEffect(() => {
    if (!productId) { setConnection(null); return }
    let active = true
    setLoading(true)
    ascRequest({ action:'status', productId })
      .then(data => { if (active) setConnection(data.connection || null) })
      .catch(error => { if (active) setMessage(error.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [productId])

  const update = (key, value) => setForm(current => ({ ...current, [key]:value }))

  const handleKeyFile = async file => {
    if (!file) return
    if (!/\.p8$/i.test(file.name)) { setMessage('Choose the original App Store Connect `.p8` key file.'); return }
    if (file.size > 64 * 1024) { setMessage('That `.p8` file is unexpectedly large. Download a new App Store Connect API key and try again.'); return }
    const privateKey = await file.text()
    update('privateKey', privateKey)
    update('fileName', file.name)
    setMessage('Private key loaded for this one-time encrypted test. It is not saved in the browser.')
  }

  const testAndSync = async () => {
    if (!selectedApp) { setMessage('Select a portfolio app first.'); return }
    setTesting(true); setMessage('Validating the signed App Store Connect request…')
    try {
      const data = await ascRequest({ action:'test', productId:selectedApp.id, appStoreAppId:form.appStoreAppId.trim(), issuerId:form.issuerId.trim(), keyId:form.keyId.trim(), keyType:form.keyType, vendorNumber:form.vendorNumber.trim(), privateKey:form.privateKey })
      setConnection({ product_id:selectedApp.id, app_store_app_id:data.appStoreAppId, key_id:form.keyId.trim(), key_type:form.keyType, vendor_number:form.vendorNumber.trim() || null, status:'connected', metrics:data.metrics, last_synced_at:data.syncedAt })
      setForm(current => ({ ...current, privateKey:'', fileName:'' }))
      setFileEpoch(value => value + 1)
      setMessage(`Connected ${data.metrics.catalog?.name || selectedApp.name}. The private key is encrypted server-side and was cleared from this screen.`)
    } catch (error) { setMessage(error.message || 'Connection test failed.') }
    finally { setTesting(false) }
  }

  const runSync = async () => {
    if (!selectedApp) return
    setTesting(true); setMessage('Syncing authorized App Store Connect data…')
    try {
      const data = await ascRequest({ action:'sync', productId:selectedApp.id })
      setConnection(current => ({ ...current, status:'connected', metrics:data.metrics, last_synced_at:data.syncedAt }))
      setMessage('App Store Connect data synced for this app.')
    } catch (error) { setMessage(error.message || 'Sync failed.') }
    finally { setTesting(false) }
  }

  return <section className="studio-panel" style={{ marginTop:16, padding:20, borderColor:'rgba(255,193,59,.42)', background:'linear-gradient(120deg,rgba(112,35,9,.44),rgba(70,13,7,.48))' }}>
    <style>{`.portfolio-autopilot:has(input[placeholder*="BEGIN PRIVATE KEY"]){display:none!important}`}</style>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16, flexWrap:'wrap' }}>
      <div><div className="studio-kicker" style={{ color:'var(--signal)' }}>APP STORE CONNECT / PRIVATE PER-APP VAULT</div><h2 style={{ color:'#fff', fontSize:22, letterSpacing:'-.055em', marginTop:6 }}>Connect the selected app. Keep its data separate.</h2><p style={{ color:'rgba(243,240,231,.68)', fontSize:12, lineHeight:1.55, marginTop:7, maxWidth:680 }}>Upload the API key once. FloStudio encrypts it on the server, validates the exact App Store Connect app, and keeps the result scoped to this portfolio app. The `.p8` file is never placed in local storage or shown again.</p></div>
      {connection?.status === 'connected' && <button onClick={() => navigate('/insights')} className="studio-button" style={{ whiteSpace:'nowrap' }}>Open App Insights →</button>}
    </div>
    <div style={{ display:'grid', gridTemplateColumns:'minmax(220px,.65fr) minmax(0,1.35fr)', gap:14, marginTop:18 }}>
      <label className="portfolio-field"><span>FloStudio portfolio app</span><select value={productId} onChange={event => { setProductId(event.target.value); setMessage('') }}>{apps.map(app => <option key={app.id} value={app.id}>{app.name}</option>)}</select></label>
      <div style={{ padding:'11px 13px', border:'1px solid rgba(243,240,231,.14)', background:'rgba(42,7,3,.34)', color:'rgba(243,240,231,.7)', fontSize:11.5, lineHeight:1.45 }}><b style={{ color:'#fff' }}>{selectedApp?.name || 'Select an app'}</b><br/>App Store connection, reporting health, and insights will remain isolated to this product.</div>
    </div>
    {loading ? <div style={{ color:'rgba(243,240,231,.64)', marginTop:15, fontSize:12 }}>Checking secure connection state…</div> : connection?.status === 'connected' ? <div style={{ marginTop:16, padding:14, border:'1px solid rgba(255,193,59,.34)', background:'rgba(255,193,59,.09)', display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap' }}><div><div className="studio-kicker" style={{ color:'var(--signal)' }}>CONNECTED / SERVER-ENCRYPTED</div><b style={{ color:'#fff', display:'block', marginTop:4 }}>{connection.metrics?.catalog?.name || selectedApp?.name}</b><span style={{ color:'rgba(243,240,231,.62)', fontSize:11 }}>Key ending in {connection.key_id?.slice(-4) || '—'} · Last synced {connection.last_synced_at ? new Date(connection.last_synced_at).toLocaleString() : 'just now'}</span></div><button onClick={runSync} disabled={testing} className="studio-button">{testing ? 'Syncing…' : 'Sync app data →'}</button></div> : <div style={{ marginTop:16 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}><label className="portfolio-field"><span>App Store Connect App ID</span><input value={form.appStoreAppId} onChange={event => update('appStoreAppId', event.target.value)} placeholder="Apple API app ID" /></label><label className="portfolio-field"><span>Key type</span><select value={form.keyType} onChange={event => update('keyType', event.target.value)}><option value="team">Team API key</option><option value="individual">Individual API key</option></select></label><label className="portfolio-field"><span>Issuer ID {form.keyType === 'individual' ? '(not used for individual keys)' : ''}</span><input disabled={form.keyType === 'individual'} value={form.issuerId} onChange={event => update('issuerId', event.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" /></label><label className="portfolio-field"><span>Key ID</span><input value={form.keyId} onChange={event => update('keyId', event.target.value)} placeholder="ABC123XYZ0" /></label></div>
      <label style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:104, marginTop:12, border:'1px dashed rgba(255,193,59,.6)', background:'rgba(54,9,3,.38)', cursor:'pointer', color:'#fff', textAlign:'center', padding:14 }}><b style={{ fontSize:13 }}>{form.fileName ? `Ready: ${form.fileName}` : 'Drop the matching `.p8` file here'}</b><span style={{ color:'rgba(243,240,231,.62)', fontSize:11, marginTop:5 }}>Uploaded only for this encrypted test. The private key is never stored in your browser.</span><input key={fileEpoch} type="file" accept=".p8,application/octet-stream" onChange={event => handleKeyFile(event.target.files?.[0])} style={{ display:'none' }} /></label>
      <details style={{ marginTop:10, color:'rgba(243,240,231,.62)', fontSize:11 }}><summary style={{ cursor:'pointer', color:'var(--signal)' }}>Optional Sales & Trends reporting detail</summary><label className="portfolio-field" style={{ marginTop:9 }}><span>Vendor number</span><input value={form.vendorNumber} onChange={event => update('vendorNumber', event.target.value)} placeholder="Required only for proceeds and Sales & Trends reports" /></label></details>
      <button type="button" onClick={testAndSync} disabled={testing || !form.privateKey} className="studio-button" style={{ marginTop:14 }}>{testing ? 'Testing secure connection…' : 'Test & Sync This App →'}</button>
    </div>}
    {message && <div style={{ marginTop:13, padding:10, border:'1px solid rgba(243,240,231,.16)', background:'rgba(44,8,3,.42)', color:'rgba(243,240,231,.82)', fontSize:11.5, lineHeight:1.5 }}>{message}</div>}
  </section>
}
