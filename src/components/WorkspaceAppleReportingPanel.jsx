import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

async function reportingRequest(payload) {
  const { data:{ session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sign in again before managing Apple reporting.')
  const response = await fetch('/api/app-store-connect', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}` },
    body:JSON.stringify(payload),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'FloStudio could not complete the Apple reporting request.')
  return data
}

const initialForm = () => ({ issuerId:'', keyId:'', vendorNumber:'', privateKey:'', fileName:'' })

export default function WorkspaceAppleReportingPanel({ workspaceId, apps = [] }) {
  const [status, setStatus] = useState(null)
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [fileEpoch, setFileEpoch] = useState(0)

  const refreshStatus = async () => {
    if (!workspaceId) { setLoading(false); return }
    setLoading(true)
    try {
      const response = await reportingRequest({ action:'reporting_status', workspaceId })
      setStatus(response.connection || null)
      if (!response.connection?.status && response.vendorNumberHint) {
        setForm(current => current.vendorNumber ? current : { ...current, vendorNumber:response.vendorNumberHint })
      }
    } catch (error) {
      setMessage(error.message || 'Could not check the workspace Apple reporting connection.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refreshStatus() }, [workspaceId])

  const selectKeyFile = async file => {
    if (!file) return
    if (!/\.p8$/i.test(file.name)) { setMessage('Choose the Apple App Store Connect `.p8` file downloaded for FloStudio Production Read Sync.'); return }
    if (file.size > 64 * 1024) { setMessage('That `.p8` file is unexpectedly large. Choose the original App Store Connect key file.'); return }
    const privateKey = await file.text()
    setForm(current => ({ ...current, privateKey, fileName:file.name }))
    setMessage('Private key loaded for this one-time encrypted connection. It is not stored in the browser.')
  }

  const connect = async () => {
    if (!form.privateKey) { setMessage('Choose the original Apple `.p8` file first.'); return }
    setSaving(true)
    setMessage('Encrypting the workspace reporting key and validating its Apple Sales and Reports access…')
    try {
      await reportingRequest({
        action:'reporting_connect',
        workspaceId,
        issuerId:form.issuerId.trim(),
        keyId:form.keyId.trim(),
        vendorNumber:form.vendorNumber.trim(),
        privateKey:form.privateKey,
      })
      setForm(initialForm())
      setFileEpoch(value => value + 1)
      setMessage('Workspace reporting key connected. It is encrypted server-side and cleared from this page. You can now pull Apple-returned sales data across all eligible production apps.')
      await refreshStatus()
    } catch (error) {
      setMessage(error.message || 'FloStudio could not connect the Apple reporting key.')
    } finally {
      setSaving(false)
    }
  }

  const syncAll = async () => {
    setSaving(true)
    setMessage('Requesting the latest completed Apple Sales and Trends report once, then matching only Apple-returned rows to each eligible FloStudio app…')
    try {
      const response = await reportingRequest({ action:'reporting_sync_all', workspaceId })
      setMessage(`Apple reporting refresh complete: ${response.available || 0} app${response.available === 1 ? '' : 's'} with returned sales rows, ${response.noSales || 0} with no recent Apple sales rows, and ${response.skipped || 0} without a verified Apple ID. User counts remain pending until Apple Analytics Reports are generated; FloStudio did not estimate them.`)
      await refreshStatus()
    } catch (error) {
      setMessage(error.message || 'FloStudio could not refresh Apple reporting data.')
    } finally {
      setSaving(false)
    }
  }

  return <section className="studio-panel flo-dark-surface" style={{ marginTop:16, padding:20, borderColor:'rgba(197,197,197,.38)', background:'linear-gradient(120deg,rgba(56,56,95,.45),rgba(22,22,31,.62))' }}>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'start', gap:14, flexWrap:'wrap' }}>
      <div>
        <div className="studio-kicker" style={{ color:'var(--signal)' }}>WORKSPACE APPLE REPORTING / ONE TEAM KEY</div>
        <h2 style={{ color:'#ffffff', fontSize:21, letterSpacing:'-.05em', marginTop:6 }}>Sales and user reporting for every production app.</h2>
        <p style={{ color:'rgba(240,240,240,.68)', fontSize:12, lineHeight:1.6, marginTop:7, maxWidth:760 }}>This is additive: it does not replace any app’s existing App Store Connect, media, or configuration connection. A Sales and Reports Team key can pull Apple’s completed Sales and Trends report once and match its returned rows to each eligible app. User counts require Apple Analytics Reports; FloStudio shows their real Apple status rather than inventing a number.</p>
      </div>
      <span className="studio-chip" style={{ color:'var(--signal)', borderColor:'rgba(223,223,223,.28)', background:'rgba(223,223,223,.08)' }}>{apps.length} active portfolio app{apps.length === 1 ? '' : 's'}</span>
    </div>

    {loading ? <p style={{ color:'rgba(240,240,240,.62)', fontSize:11.5, marginTop:14 }}>Checking encrypted workspace reporting status…</p> : status?.status === 'connected' ? <div style={{ marginTop:15, padding:14, border:'1px solid rgba(197,197,197,.28)', background:'rgba(15,15,20,.34)', display:'grid', gridTemplateColumns:'minmax(0,1fr) auto', gap:12, alignItems:'center' }}>
      <div><div className="studio-kicker" style={{ color:'var(--signal)' }}>CONNECTED / ENCRYPTED SERVER-SIDE</div><b style={{ display:'block', color:'#ffffff', fontSize:13, marginTop:5 }}>Apple Team reporting key ending in {status.key_id?.slice(-4) || '—'}.</b><p style={{ color:'rgba(240,240,240,.58)', fontSize:10.5, lineHeight:1.45, marginTop:5 }}>Vendor number is saved privately for reporting requests. Last connection or refresh: {status.last_synced_at ? new Date(status.last_synced_at).toLocaleString() : 'not yet synced'}.</p></div>
      <button type="button" onClick={syncAll} disabled={saving} className="studio-button" style={{ whiteSpace:'nowrap' }}>{saving ? 'Pulling Apple reports…' : 'Pull Apple reports for all apps →'}</button>
    </div> : <div style={{ marginTop:15, padding:14, border:'1px solid rgba(197,197,197,.28)', background:'rgba(15,15,20,.34)' }}>
      <div className="studio-kicker" style={{ color:'var(--signal)' }}>CONNECT ONCE / KEEP EVERY APP SEPARATE</div>
      <p style={{ color:'rgba(240,240,240,.64)', fontSize:11.5, lineHeight:1.55, marginTop:6 }}>Choose the one-time `.p8` file for the **FloStudio Production Read Sync** Apple Team key. The Issuer ID and Key ID identify the key; the Vendor Number is required by Apple for Sales and Trends downloads. The key is encrypted on the server and the plaintext is cleared from this page after validation.</p>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,minmax(0,1fr))', gap:10, marginTop:12 }}>
        <label className="portfolio-field"><span>Apple Issuer ID</span><input value={form.issuerId} onChange={event => setForm(current => ({ ...current, issuerId:event.target.value }))} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" /></label>
        <label className="portfolio-field"><span>Apple Key ID</span><input value={form.keyId} onChange={event => setForm(current => ({ ...current, keyId:event.target.value }))} placeholder="ABC123XYZ0" /></label>
        <label className="portfolio-field"><span>Apple Vendor Number</span><input value={form.vendorNumber} onChange={event => setForm(current => ({ ...current, vendorNumber:event.target.value }))} placeholder="Reports → legal entity → Vendor #" /></label>
      </div>
      <label style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:98, marginTop:11, border:'1px dashed rgba(197,197,197,.6)', background:'rgba(18,18,18,.38)', cursor:'pointer', color:'#ffffff', textAlign:'center', padding:14 }}><b style={{ fontSize:13 }}>{form.fileName ? `Ready: ${form.fileName}` : 'Choose the FloStudio Production Read Sync `.p8` file'}</b><span style={{ color:'rgba(240,240,240,.62)', fontSize:11, marginTop:5 }}>One-time encrypted upload; the private file is never put in local storage or shown again.</span><input key={fileEpoch} type="file" accept=".p8,application/octet-stream" onChange={event => selectKeyFile(event.target.files?.[0])} style={{ display:'none' }} /></label>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:13 }}><button type="button" onClick={connect} disabled={saving || !form.privateKey} className="studio-button">{saving ? 'Connecting securely…' : 'Connect workspace reporting key →'}</button></div>
    </div>}

    <div style={{ marginTop:12, display:'grid', gridTemplateColumns:'repeat(3,minmax(0,1fr))', gap:9 }}><div style={{ border:'1px solid rgba(240,240,240,.12)', padding:10, background:'rgba(18,18,18,.26)' }}><b style={{ display:'block', color:'#ffffff', fontSize:11 }}>Apple sales units</b><span style={{ color:'rgba(240,240,240,.55)', fontSize:10, lineHeight:1.4, display:'block', marginTop:4 }}>Returned by Apple Sales and Trends. A zero appears only when Apple supplies a zero row.</span></div><div style={{ border:'1px solid rgba(240,240,240,.12)', padding:10, background:'rgba(18,18,18,.26)' }}><b style={{ display:'block', color:'#ffffff', fontSize:11 }}>Purchase & proceeds evidence</b><span style={{ color:'rgba(240,240,240,.55)', fontSize:10, lineHeight:1.4, display:'block', marginTop:4 }}>Matched by Apple app identifier; unmatchable rows are never assigned to an app.</span></div><div style={{ border:'1px solid rgba(240,240,240,.12)', padding:10, background:'rgba(18,18,18,.26)' }}><b style={{ display:'block', color:'#ffffff', fontSize:11 }}>User counts</b><span style={{ color:'rgba(240,240,240,.55)', fontSize:10, lineHeight:1.4, display:'block', marginTop:4 }}>Available only when Apple Analytics has generated a permitted report. No estimates.</span></div></div>
    {message && <p style={{ marginTop:12, padding:10, border:'1px solid rgba(240,240,240,.14)', background:'rgba(14,14,14,.34)', color:'rgba(240,240,240,.8)', fontSize:11.5, lineHeight:1.5 }}>{message}</p>}
  </section>
}
