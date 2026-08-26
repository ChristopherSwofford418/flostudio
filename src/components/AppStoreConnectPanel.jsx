import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { appInsightsPath, selectConnectionTarget } from '../lib/appStoreConnectRouting'

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

export default function AppStoreConnectPanel({ apps = [], initialProductId = '' }) {
  const navigate = useNavigate()
  const [productId, setProductId] = useState('')
  const [connection, setConnection] = useState(null)
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState('')
  const [fileEpoch, setFileEpoch] = useState(0)
  const [vendorInput, setVendorInput] = useState('')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ appStoreAppId:'', issuerId:'', keyId:'', keyType:'team', vendorNumber:'', privateKey:'', fileName:'' })

  const selectedApp = useMemo(() => apps.find(app => app.id === productId) || null, [apps, productId])

  useEffect(() => {
    if (!productId) setProductId(selectConnectionTarget(apps))
  }, [apps, productId])

  useEffect(() => {
    const targetProductId = selectConnectionTarget(apps, initialProductId)
    if (!initialProductId || targetProductId !== initialProductId) return
    setProductId(targetProductId)
    setConnection(null)
    setEditing(false)
    setForm({ appStoreAppId:'', issuerId:'', keyId:'', keyType:'team', vendorNumber:'', privateKey:'', fileName:'' })
    setFileEpoch(value => value + 1)
    setMessage(`Ready to connect ${apps.find(app => app.id === targetProductId)?.name || 'the selected app'}. This connection will remain separate from every other portfolio app.`)
  }, [initialProductId, apps])

  useEffect(() => {
    if (!productId) { setConnection(null); setEditing(false); return }
    let active = true
    setLoading(true)
    ascRequest({ action:'status', productId })
      .then(data => { if (active) setConnection(data.connection || null) })
      .catch(error => { if (active) setMessage(error.message) })
      .finally(() => { if (active) setLoading(false) })
    setEditing(false)
    return () => { active = false }
  }, [productId])

  useEffect(() => {
    setVendorInput(connection?.vendor_number || '')
  }, [connection?.product_id, connection?.vendor_number])

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
      setEditing(false)
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

  const saveVendorAndSync = async () => {
    if (!selectedApp || !vendorInput.trim()) { setMessage('Enter the Vendor Number shown in App Store Connect → Reports.'); return }
    setTesting(true); setMessage('Saving the Vendor Number and requesting Apple Sales & Trends data…')
    try {
      await ascRequest({ action:'update_vendor_number', productId:selectedApp.id, vendorNumber:vendorInput.trim() })
      const data = await ascRequest({ action:'sync', productId:selectedApp.id })
      setConnection(current => ({ ...current, vendor_number:vendorInput.trim(), status:'connected', metrics:data.metrics, last_synced_at:data.syncedAt }))
      setMessage('Vendor Number saved. FloStudio pulled the latest Apple reporting response for this app.')
    } catch (error) { setMessage(error.message || 'FloStudio could not save the Vendor Number.') }
    finally { setTesting(false) }
  }

  const openKeyEditor = () => {
    if (!connection) return
    setForm({
      appStoreAppId:connection.app_store_app_id || '',
      issuerId:'',
      keyId:connection.key_id || '',
      keyType:connection.key_type || 'team',
      vendorNumber:connection.vendor_number || '',
      privateKey:'',
      fileName:'',
    })
    setFileEpoch(value => value + 1)
    setEditing(true)
    setMessage('Replace this selected app’s connection with a new Team API key. Re-enter the Issuer ID and upload the replacement `.p8`; the current private key is never shown.')
  }

  const cancelKeyEditor = () => {
    setEditing(false)
    setForm(current => ({ ...current, privateKey:'', fileName:'' }))
    setFileEpoch(value => value + 1)
    setMessage('')
  }

  return <section id="app-store-connect" className="studio-panel" style={{ marginTop:16, padding:20, borderColor:'rgba(197,197,197,.42)', background:'linear-gradient(120deg,rgba(49,49,49,.44),rgba(25,25,25,.48))' }}>
    <style>{`.portfolio-autopilot:has(input[placeholder*="BEGIN PRIVATE KEY"]){display:none!important}`}</style>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16, flexWrap:'wrap' }}>
      <div><div className="studio-kicker" style={{ color:'var(--signal)' }}>APP STORE CONNECT / PRIVATE PER-APP VAULT</div><h2 style={{ color:'#ffffff', fontSize:22, letterSpacing:'-.055em', marginTop:6 }}>Connect the selected app. Keep its data separate.</h2><p style={{ color:'rgba(240,240,240,.68)', fontSize:12, lineHeight:1.55, marginTop:7, maxWidth:680 }}>Upload the API key once. FloStudio encrypts it on the server, validates the exact App Store Connect app, and keeps the result scoped to this portfolio app. The `.p8` file is never placed in local storage or shown again.</p></div>
      {connection?.status === 'connected' && <button onClick={() => navigate(appInsightsPath(productId))} className="studio-button" style={{ whiteSpace:'nowrap' }}>Open {selectedApp?.name || 'app'} Insights →</button>}
    </div>
    <div style={{ display:'grid', gridTemplateColumns:'minmax(220px,.65fr) minmax(0,1.35fr)', gap:14, marginTop:18 }}>
      <label className="portfolio-field"><span>FloStudio portfolio app</span><select value={productId} onChange={event => { setProductId(event.target.value); setMessage('') }}>{apps.map(app => <option key={app.id} value={app.id}>{app.name}</option>)}</select></label>
      <div style={{ padding:'11px 13px', border:'1px solid rgba(240,240,240,.14)', background:'rgba(14,14,14,.34)', color:'rgba(240,240,240,.7)', fontSize:11.5, lineHeight:1.45 }}><b style={{ color:'#ffffff' }}>{selectedApp?.name || 'Select an app'}</b><br/>App Store connection, reporting health, and insights will remain isolated to this product.</div>
    </div>
    {loading ? <div style={{ color:'rgba(240,240,240,.64)', marginTop:15, fontSize:12 }}>Checking secure connection state…</div> : connection?.status === 'connected' && !editing ? <div style={{ marginTop:16, padding:14, border:'1px solid rgba(197,197,197,.34)', background:'rgba(197,197,197,.09)', display:'grid', gridTemplateColumns:'minmax(0,1fr) auto', alignItems:'center', gap:12 }}><div><div className="studio-kicker" style={{ color:'var(--signal)' }}>CONNECTED / SERVER-ENCRYPTED</div><b style={{ color:'#ffffff', display:'block', marginTop:4 }}>{connection.metrics?.catalog?.name || selectedApp?.name}</b><span style={{ color:'rgba(240,240,240,.62)', fontSize:11 }}>Key ending in {connection.key_id?.slice(-4) || '—'} · Last synced {connection.last_synced_at ? new Date(connection.last_synced_at).toLocaleString() : 'just now'}</span><div style={{ display:'flex', gap:8, alignItems:'end', flexWrap:'wrap', marginTop:12 }}><label className="portfolio-field" style={{ minWidth:240, margin:0 }}><span>Apple Vendor Number</span><input value={vendorInput} onChange={event => setVendorInput(event.target.value)} placeholder="Reports → legal entity → Vendor #" /></label><button onClick={saveVendorAndSync} disabled={testing || !vendorInput.trim()} className="studio-button" style={{ whiteSpace:'nowrap' }}>{testing ? 'Pulling…' : 'Save & pull numbers →'}</button></div><p style={{ color:'rgba(240,240,240,.52)', fontSize:10.5, lineHeight:1.45, marginTop:6 }}>Required by Apple for Sales & Trends report downloads. It is not a private key.</p></div><div style={{ display:'grid', gap:8 }}><button onClick={openKeyEditor} disabled={testing} className="studio-button" style={{ whiteSpace:'nowrap', background:'transparent', color:'var(--signal)', border:'1px solid rgba(197,197,197,.45)' }}>Edit / replace key</button><button onClick={runSync} disabled={testing} className="studio-button" style={{ whiteSpace:'nowrap' }}>{testing ? 'Syncing…' : 'Sync app data →'}</button></div></div> : <div style={{ marginTop:16 }}>
      {editing && <div style={{ marginBottom:12, padding:12, border:'1px solid rgba(197,197,197,.45)', background:'rgba(197,197,197,.09)' }}><div className="studio-kicker" style={{ color:'var(--signal)' }}>REPLACE SELECTED APP KEY</div><b style={{ color:'#ffffff', display:'block', marginTop:4 }}>Use a new Team API key with the Finance role.</b><p style={{ color:'rgba(240,240,240,.66)', fontSize:11, lineHeight:1.5, marginTop:5 }}>Apple cannot grant Sales & Trends access to the current key. Re-enter the Issuer ID, Key ID, and upload the new `.p8`; the old private key remains encrypted and is never revealed.</p></div>}<div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}><label className="portfolio-field"><span>App Store Connect App ID</span><input value={form.appStoreAppId} onChange={event => update('appStoreAppId', event.target.value)} placeholder="Apple API app ID" /></label><label className="portfolio-field"><span>Key type</span><select value={form.keyType} onChange={event => update('keyType', event.target.value)}><option value="team">Team API key</option><option value="individual">Individual API key</option></select></label><label className="portfolio-field"><span>Issuer ID {form.keyType === 'individual' ? '(not used for individual keys)' : ''}</span><input disabled={form.keyType === 'individual'} value={form.issuerId} onChange={event => update('issuerId', event.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" /></label><label className="portfolio-field"><span>Key ID</span><input value={form.keyId} onChange={event => update('keyId', event.target.value)} placeholder="ABC123XYZ0" /></label></div>
      <label style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:104, marginTop:12, border:'1px dashed rgba(197,197,197,.6)', background:'rgba(18,18,18,.38)', cursor:'pointer', color:'#ffffff', textAlign:'center', padding:14 }}><b style={{ fontSize:13 }}>{form.fileName ? `Ready: ${form.fileName}` : 'Drop the matching `.p8` file here'}</b><span style={{ color:'rgba(240,240,240,.62)', fontSize:11, marginTop:5 }}>Uploaded only for this encrypted test. The private key is never stored in your browser.</span><input key={fileEpoch} type="file" accept=".p8,application/octet-stream" onChange={event => handleKeyFile(event.target.files?.[0])} style={{ display:'none' }} /></label>
      <details style={{ marginTop:10, color:'rgba(240,240,240,.62)', fontSize:11 }}><summary style={{ cursor:'pointer', color:'var(--signal)' }}>Optional Sales & Trends reporting detail</summary><label className="portfolio-field" style={{ marginTop:9 }}><span>Vendor number</span><input value={form.vendorNumber} onChange={event => update('vendorNumber', event.target.value)} placeholder="Required only for proceeds and Sales & Trends reports" /></label></details>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:14 }}><button type="button" onClick={testAndSync} disabled={testing || !form.privateKey} className="studio-button">{testing ? 'Testing secure connection…' : editing ? 'Validate & replace key →' : 'Test & Sync This App →'}</button>{editing && <button type="button" onClick={cancelKeyEditor} disabled={testing} className="studio-button" style={{ background:'transparent', color:'var(--signal)', border:'1px solid rgba(197,197,197,.45)' }}>Cancel replacement</button>}</div>
    </div>}
    {message && <div style={{ marginTop:13, padding:10, border:'1px solid rgba(240,240,240,.16)', background:'rgba(15,15,15,.42)', color:'rgba(240,240,240,.82)', fontSize:11.5, lineHeight:1.5 }}>{message}</div>}
  </section>
}
