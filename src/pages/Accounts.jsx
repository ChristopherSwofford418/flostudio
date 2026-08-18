import { useEffect, useState } from 'react'
import Layout from '../components/Layout.jsx'
import { useWorkspace } from '../context/WorkspaceContext'

const PLATFORMS = [
  { id:'facebook', label:'Facebook Pages', color:'#5b8dff', summary:'Publish approved Page posts only after a Meta-authorized connection.', requirement:'Facebook Login for Business, Page access, secure callback, and Pages publishing permissions.' },
  { id:'instagram', label:'Instagram Professional', color:'#ff7ab6', summary:'Publish feed, Reels, and stories from an authorized professional account.', requirement:'Meta Instagram API, professional account, approved callback, and content publishing permission.' },
  { id:'linkedin', label:'LinkedIn', color:'#83d9ff', summary:'Send approved updates to a connected member or organization.', requirement:'LinkedIn OAuth, organization/member mapping, and approved publishing scopes.' },
  { id:'tiktok', label:'TikTok', color:'#bff5e8', summary:'Create direct posts or drafts using TikTok’s approved posting flow.', requirement:'TikTok Content Posting API approval, OAuth callback, and user-authorized posting scope.' },
  { id:'twitter', label:'X', color:'#d9ff75', summary:'Publish approved updates and threads through an authenticated X account.', requirement:'X OAuth 2.0, registered callback, and user-authorized post scope.' },
]

export default function Accounts() {
  const { apps } = useWorkspace()
  const [statuses, setStatuses] = useState({})
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState('')
  const [notice, setNotice] = useState('')

  const loadStatuses = async () => {
    setLoading(true)
    try {
      const pairs = await Promise.all(PLATFORMS.map(async platform => {
        const response = await fetch('/api/social-connect', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ platform:platform.id, action:'status' }) })
        const data = await response.json().catch(() => ({}))
        return [platform.id, { ...data, httpStatus:response.status }]
      }))
      setStatuses(Object.fromEntries(pairs))
    } catch { setNotice('FloStudio could not read provider connection status. Refresh and try again.') }
    finally { setLoading(false) }
  }

  useEffect(() => { loadStatuses() }, [])

  const requestConnection = async platform => {
    setChecking(platform.id); setNotice('')
    try {
      const response = await fetch('/api/social-connect', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ platform:platform.id, action:'connect' }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setNotice(data.error || `${platform.label} requires provider setup before a connection can begin.`)
        return
      }
      setNotice(`${platform.label} is ready to authorize.`)
      await loadStatuses()
    } catch { setNotice(`FloStudio could not start ${platform.label} authorization.`) }
    finally { setChecking('') }
  }

  return <Layout title="Channels">
    <div className="flo-page" style={{ maxWidth:1080, margin:'0 auto', padding:'28px 30px 56px' }}>
      <section className="studio-dark abundance-hero" style={{ minHeight:230, padding:'28px 30px', display:'grid', gridTemplateColumns:'minmax(0,1fr) 270px', gap:24, alignItems:'center', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'relative', zIndex:1 }}><div className="studio-kicker" style={{ color:'#d9ff75' }}>DISTRIBUTION DESK / CONNECTION HEALTH</div><h1 className="studio-display" style={{ color:'#fff', fontSize:'clamp(34px,4vw,54px)', marginTop:10 }}>Publish only when the <span className="studio-serif" style={{ color:'#ffaccb' }}>connection is real.</span></h1><p style={{ maxWidth:620, marginTop:13, color:'rgba(255,250,244,.72)', fontSize:13, lineHeight:1.7 }}>FloStudio never invents a social account, token, callback, or post ID. Every channel must complete its provider-approved OAuth flow and map to the correct account before any content can publish.</p></div>
        <div className="studio-panel" style={{ position:'relative', zIndex:1, padding:18, background:'rgba(10,7,28,.48)', borderColor:'rgba(215,242,103,.22)' }}><div className="studio-kicker" style={{ color:'#d9ff75' }}>PORTFOLIO SCOPE</div><div style={{ color:'#fff', fontSize:26, fontWeight:850, marginTop:8 }}>{apps.length}</div><div style={{ color:'rgba(244,240,255,.6)', fontSize:11, lineHeight:1.5, marginTop:5 }}>apps ready to receive their own verified channel mappings</div></div>
        <div className="abundance-orb abundance-orb--one"/><div className="abundance-orb abundance-orb--two"/>
      </section>

      <section style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginTop:16 }}>
        <div className="studio-panel" style={{ padding:17 }}><div className="studio-kicker" style={{ color:'#83d9ff' }}>01 / AUTHORIZE</div><p style={{ color:'rgba(244,240,255,.68)', fontSize:11.5, lineHeight:1.55, marginTop:8 }}>Authenticate with the platform through its approved OAuth flow.</p></div>
        <div className="studio-panel" style={{ padding:17 }}><div className="studio-kicker" style={{ color:'#ffaccb' }}>02 / MAP</div><p style={{ color:'rgba(244,240,255,.68)', fontSize:11.5, lineHeight:1.55, marginTop:8 }}>Choose the page, profile, or organization that belongs to a portfolio app.</p></div>
        <div className="studio-panel" style={{ padding:17 }}><div className="studio-kicker" style={{ color:'#d9ff75' }}>03 / PUBLISH</div><p style={{ color:'rgba(244,240,255,.68)', fontSize:11.5, lineHeight:1.55, marginTop:8 }}>FloStudio validates media, permissions, provider limits, and approval mode first.</p></div>
      </section>

      {notice && <div style={{ marginTop:16, padding:12, borderRadius:11, background:'rgba(255,180,206,.1)', border:'1px solid rgba(255,180,206,.25)', color:'#ffd0df', fontSize:11.5, lineHeight:1.55 }}>{notice}</div>}
      <section style={{ marginTop:26 }}><div className="studio-kicker" style={{ color:'#ffaccb' }}>CHANNEL READINESS</div><h2 style={{ color:'#fff', fontSize:25, letterSpacing:'-.05em', marginTop:5 }}>No false connections. No phantom publishing.</h2>
        <div style={{ display:'grid', gap:12, marginTop:15 }}>{PLATFORMS.map(platform => { const status = statuses[platform.id]; const ready = status?.live === true && status?.status === 'connected'; return <article key={platform.id} className="studio-panel" style={{ padding:20, borderLeft:`4px solid ${platform.color}` }}><div style={{ display:'flex', alignItems:'center', gap:15, flexWrap:'wrap' }}><div style={{ width:44, height:44, borderRadius:13, color:platform.color, background:`${platform.color}1c`, border:`1px solid ${platform.color}48`, display:'grid', placeItems:'center', fontWeight:900, fontSize:14 }}>{platform.label.slice(0,1)}</div><div style={{ flex:1, minWidth:240 }}><div style={{ display:'flex', alignItems:'center', gap:9, flexWrap:'wrap' }}><h3 style={{ color:'#fff', fontSize:16, fontWeight:850 }}>{platform.label}</h3><span className="studio-chip" style={{ color:ready ? '#d9ff75':'#ffd480', borderColor:ready ? 'rgba(215,242,103,.32)' : 'rgba(255,212,128,.32)', background:ready ? 'rgba(215,242,103,.08)' : 'rgba(255,212,128,.08)' }}>{ready ? 'VERIFIED' : 'SETUP REQUIRED'}</span></div><p style={{ color:'rgba(244,240,255,.66)', fontSize:11.5, lineHeight:1.55, marginTop:5 }}>{platform.summary}</p><div style={{ color:'rgba(244,240,255,.45)', fontSize:10, marginTop:7 }}><b style={{ color:'rgba(244,240,255,.7)' }}>Requirement:</b> {status?.requirement || platform.requirement}</div></div><button onClick={() => requestConnection(platform)} disabled={checking === platform.id} className="studio-button studio-button--soft" style={{ padding:'9px 12px', fontSize:10.5, whiteSpace:'nowrap' }}>{checking === platform.id ? 'Checking…' : ready ? 'View mapping' : 'Check setup'}</button></div></article> })}</div>
      </section>
    </div>
  </Layout>
}
