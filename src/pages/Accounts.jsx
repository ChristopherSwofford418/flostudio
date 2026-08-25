import { useEffect, useState } from 'react'
import Layout from '../components/Layout.jsx'
import { useWorkspace } from '../context/WorkspaceContext'
import { supabase } from '../supabase'
import PerformanceConnectionDesk from '../components/PerformanceConnectionDesk'
import AppSocialStudio from '../components/AppSocialStudio'
import AppAwarePostStudio from '../components/AppAwarePostStudio'

const PLATFORMS = [
  { id:'facebook', label:'Facebook Pages', icon:'F', color:'#8b8b8b', summary:'Authorize a real Meta identity, then choose the Page that FloStudio may publish approved posts to.', requirement:'Requires Facebook Login for Business, Page access, approved Page permissions, and a secure server-side callback.' },
  { id:'instagram', label:'Instagram Professional', icon:'I', color:'#9b9b9b', summary:'Authorize a real Instagram Professional account connected to an eligible Page.', requirement:'Requires Meta app setup, an eligible Professional account, content publishing access, and an approved callback.' },
  { id:'linkedin', label:'LinkedIn', icon:'in', color:'#c9c9c9', summary:'Authorize a real LinkedIn member first. Organization publishing remains unavailable until its separate approval is granted.', requirement:'Requires LinkedIn OAuth and the Share on LinkedIn product with w_member_social.' },
  { id:'tiktok', label:'TikTok', icon:'T', color:'#e9e9e9', summary:'Authorize a real TikTok creator. Direct Post remains media-specific and subject to TikTok’s Content Posting audit.', requirement:'Requires Login Kit, Content Posting API approval, video.publish, and a secure callback.' },
  { id:'twitter', label:'X', icon:'X', color:'#ededed', summary:'Authorize a real X account using OAuth 2.0 with PKCE. Approved posts receive a real remote Post ID only after X accepts them.', requirement:'Requires an approved X developer app, exact callback URI, tweet.write, users.read, and server-side token exchange.' },
]

function labelFor(status) {
  if (status?.live && status?.status === 'connected') return 'CONNECTED'
  if (status?.status === 'needs_reauthorization') return 'REAUTHORIZE'
  if (status?.configured) return 'READY TO AUTHORIZE'
  return 'PROVIDER SETUP NEEDED'
}

function toneFor(status) {
  if (status?.live && status?.status === 'connected') return '#ededed'
  if (status?.status === 'needs_reauthorization') return '#c0c0c0'
  if (status?.configured) return '#c9c9c9'
  return '#d7d7d7'
}

function userFacingStatus(status, platform) {
  if (!status?.error) return status?.requirement || platform.requirement
  if (status.error.includes('SUPABASE_SERVICE_ROLE_KEY') || status.error.includes('SOCIAL_CREDENTIALS_ENCRYPTION_KEY')) return 'FloStudio’s secure channel credential vault is not enabled in production yet. Provider authorization stays blocked until it is available.'
  if (status.code === 'SOCIAL_PROVIDER_NOT_CONFIGURED') return 'FloStudio’s secure credential vault is ready, but this provider’s registered OAuth credentials are not configured yet.'
  return status.error
}

export default function Accounts() {
  const { apps, workspaceId } = useWorkspace()
  const [statuses, setStatuses] = useState({})
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState('')
  const [notice, setNotice] = useState('')
  const [destinationSelection, setDestinationSelection] = useState(null)

  const api = async (body) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Sign in again before managing social channel connections.')
    const response = await fetch('/api/social-connect', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}` },
      body:JSON.stringify(body),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(data.error || 'FloStudio could not complete this channel request.')
      error.code = data.code
      error.requirement = data.requirement
      throw error
    }
    return data
  }

  const loadStatuses = async () => {
    setLoading(true)
    try {
      const pairs = await Promise.all(PLATFORMS.map(async platform => {
        try { return [platform.id, await api({ platform:platform.id, action:'status' })] }
        catch (error) { return [platform.id, { platform:platform.id, status:'not_connected', live:false, configured:false, error:error.message, code:error.code, requirement:error.requirement || platform.requirement }] }
      }))
      setStatuses(Object.fromEntries(pairs))
    } catch { setNotice('FloStudio could not read provider connection status. Refresh and try again.') }
    finally { setLoading(false) }
  }

  const recoverCallbackState = async () => {
    const params = new URLSearchParams(window.location.search)
    const platform = params.get('platform')
    const oauthStateId = params.get('oauth')
    const connected = params.get('connected')
    const issue = params.get('channelError')
    if (connected && platform) setNotice(`${PLATFORMS.find(item => item.id === platform)?.label || 'Channel'} is now connected. FloStudio saved the selected destination without exposing its provider token to the browser.`)
    if (issue && platform) setNotice(`${PLATFORMS.find(item => item.id === platform)?.label || 'Channel'} authorization did not complete: ${issue.replaceAll('_', ' ')}.`)
    if (oauthStateId && platform) {
      try {
        const data = await api({ platform, action:'pending_destinations', oauthStateId })
        setDestinationSelection({ platform, oauthStateId, destinations:data.destinations || [] })
      } catch (error) { setNotice(error.message) }
    }
    if (connected || issue || oauthStateId) window.history.replaceState({}, '', '/accounts')
  }

  useEffect(() => { loadStatuses().then(recoverCallbackState) }, [])

  const requestConnection = async platform => {
    const status = statuses[platform.id]
    if (status?.live) {
      setChecking(platform.id)
      try {
        await api({ platform:platform.id, action:'disconnect' })
        setNotice(`${platform.label} has been disconnected. FloStudio no longer retains a publishing credential for that destination.`)
        await loadStatuses()
      } catch (error) { setNotice(error.message) }
      finally { setChecking('') }
      return
    }
    setChecking(platform.id); setNotice('')
    try {
      const data = await api({ platform:platform.id, action:'connect' })
      if (!data.authorizationUrl) throw new Error(`${platform.label} did not return an authorization URL.`)
      window.location.assign(data.authorizationUrl)
    } catch (error) {
      const friendly = error.message?.includes('SUPABASE_SERVICE_ROLE_KEY') || error.message?.includes('SOCIAL_CREDENTIALS_ENCRYPTION_KEY')
        ? 'FloStudio’s secure channel credential vault is not enabled in production yet. Provider authorization remains blocked until it is configured.'
        : error.message
      setNotice(`${friendly}${error.requirement ? ` Requirement: ${error.requirement}` : ''}`)
      setChecking('')
    }
  }

  const selectDestination = async destination => {
    if (!destinationSelection) return
    setChecking(destinationSelection.platform)
    try {
      const result = await api({ platform:destinationSelection.platform, action:'select_destination', oauthStateId:destinationSelection.oauthStateId, destinationId:destination.id })
      setDestinationSelection(null)
      setNotice(`${result.connection?.accountName || 'The selected destination'} is connected. FloStudio can now use it only for approved publishing actions.`)
      await loadStatuses()
    } catch (error) { setNotice(error.message) }
    finally { setChecking('') }
  }

  return <Layout title="Channels">
    <div className="flo-page" style={{ maxWidth:1080, margin:'0 auto', padding:'28px 30px 56px' }}>
      <section className="studio-dark abundance-hero" style={{ minHeight:230, padding:'28px 30px', display:'grid', gridTemplateColumns:'minmax(0,1fr) 270px', gap:24, alignItems:'center', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'relative', zIndex:1 }}><div className="studio-kicker" style={{ color:'#ededed' }}>DISTRIBUTION DESK / CONNECTION HEALTH</div><h1 className="studio-display" style={{ color:'#ffffff', fontSize:'clamp(34px,4vw,54px)', marginTop:10 }}>Publish only when the <span className="studio-serif" style={{ color:'#c0c0c0' }}>connection is real.</span></h1><p style={{ maxWidth:620, marginTop:13, color:'rgba(251,251,251,.72)', fontSize:13, lineHeight:1.7 }}>FloStudio routes every connection through the provider’s real consent screen. It does not accept pasted tokens, fake account handles, or browser-side secret exchange—and it only marks a post published after a provider returns a real remote post ID.</p></div>
        <div className="studio-panel" style={{ position:'relative', zIndex:1, padding:18, background:'rgba(9,9,9,.48)', borderColor:'rgba(226,226,226,.22)' }}><div className="studio-kicker" style={{ color:'#ededed' }}>PORTFOLIO SCOPE</div><div style={{ color:'#ffffff', fontSize:26, fontWeight:850, marginTop:8 }}>{apps.length}</div><div style={{ color:'rgba(242,242,242,.6)', fontSize:11, lineHeight:1.5, marginTop:5 }}>apps ready for their own verified social destinations</div></div>
        <div className="abundance-orb abundance-orb--one"/><div className="abundance-orb abundance-orb--two"/>
      </section>

      <section style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginTop:16 }}>
        <div className="studio-panel" style={{ padding:17 }}><div className="studio-kicker" style={{ color:'#c9c9c9' }}>01 / AUTHORIZE</div><p style={{ color:'rgba(242,242,242,.68)', fontSize:11.5, lineHeight:1.55, marginTop:8 }}>FloStudio opens the provider’s real consent screen, then completes the code exchange only on the server.</p></div>
        <div className="studio-panel" style={{ padding:17 }}><div className="studio-kicker" style={{ color:'#c0c0c0' }}>02 / MAP</div><p style={{ color:'rgba(242,242,242,.68)', fontSize:11.5, lineHeight:1.55, marginTop:8 }}>When a provider returns several destinations, choose the specific Page or Professional account FloStudio may use.</p></div>
        <div className="studio-panel" style={{ padding:17 }}><div className="studio-kicker" style={{ color:'#ededed' }}>03 / PUBLISH</div><p style={{ color:'rgba(242,242,242,.68)', fontSize:11.5, lineHeight:1.55, marginTop:8 }}>Only an approved Review Queue post can start a real publish attempt. Provider success—not UI state—creates published status.</p></div>
      </section>

      {notice && <div style={{ marginTop:16, padding:13, borderRadius:11, background:'rgba(198,198,198,.1)', border:'1px solid rgba(198,198,198,.25)', color:'#dbdbdb', fontSize:11.5, lineHeight:1.6 }}>{notice}</div>}
      <section style={{ marginTop:26 }}><div className="studio-kicker" style={{ color:'#c0c0c0' }}>CHANNEL CONTROL</div><h2 style={{ color:'#ffffff', fontSize:25, letterSpacing:'-.05em', marginTop:5 }}>Authorize a channel. Then map the <span className="studio-serif" style={{ color:'#c0c0c0' }}>real destination.</span></h2>
        <div style={{ display:'grid', gap:12, marginTop:15 }}>{PLATFORMS.map(platform => {
          const status = statuses[platform.id]
          const ready = status?.live === true && status?.status === 'connected'
          const color = toneFor(status)
          const actionLabel = checking === platform.id ? 'Opening provider…' : ready ? 'Disconnect' : status?.configured ? `Connect with ${platform.id === 'facebook' || platform.id === 'instagram' ? 'Meta' : platform.label}` : 'Secure setup required'
          return <article key={platform.id} className="studio-panel" style={{ padding:20, borderLeft:`4px solid ${platform.color}` }}><div style={{ display:'flex', alignItems:'center', gap:15, flexWrap:'wrap' }}><div style={{ width:44, height:44, borderRadius:13, color:platform.color, background:`${platform.color}1c`, border:`1px solid ${platform.color}48`, display:'grid', placeItems:'center', fontWeight:900, fontSize:platform.icon.length > 1 ? 12 : 14 }}>{platform.icon}</div><div style={{ flex:1, minWidth:240 }}><div style={{ display:'flex', alignItems:'center', gap:9, flexWrap:'wrap' }}><h3 style={{ color:'#ffffff', fontSize:16, fontWeight:850 }}>{platform.label}</h3><span className="studio-chip" style={{ color, borderColor:`${color}52`, background:`${color}12` }}>{loading ? 'CHECKING' : labelFor(status)}</span></div><p style={{ color:'rgba(242,242,242,.66)', fontSize:11.5, lineHeight:1.55, marginTop:5 }}>{ready ? <><b style={{ color:'#ffffff' }}>{status.connection?.accountName}</b>{status.connection?.accountHandle ? ` · ${status.connection.accountHandle}` : ''} is the verified FloStudio publishing destination.</> : platform.summary}</p><div style={{ color:'rgba(242,242,242,.45)', fontSize:10, marginTop:7 }}><b style={{ color:'rgba(242,242,242,.7)' }}>{status?.error ? 'Status:' : 'Requirement:'}</b> {userFacingStatus(status, platform)}</div></div><button onClick={() => requestConnection(platform)} disabled={checking === platform.id || loading} className={ready ? 'studio-button studio-button--soft' : 'studio-button'} style={{ padding:'9px 12px', fontSize:10.5, whiteSpace:'nowrap', opacity:(checking === platform.id || loading) ? .65 : 1 }}>{actionLabel}</button></div></article>
        })}</div>
      </section>

      <AppSocialStudio apps={apps} workspaceId={workspaceId} />

      <AppAwarePostStudio apps={apps} workspaceId={workspaceId} />

      <PerformanceConnectionDesk workspaceId={workspaceId} />

      {destinationSelection && <div style={{ position:'fixed', inset:0, zIndex:100, background:'rgba(15,15,15,.76)', backdropFilter:'blur(9px)', display:'grid', placeItems:'center', padding:20 }}><section className="studio-panel" style={{ width:'min(620px,100%)', padding:25, background:'#2e2e2e', borderColor:'rgba(255,255,255,.18)' }}><div className="studio-kicker" style={{ color:'#ededed' }}>META DESTINATION SELECTION</div><h2 style={{ color:'#ffffff', fontSize:28, letterSpacing:'-.05em', marginTop:8 }}>Choose where FloStudio may <span className="studio-serif" style={{ color:'#c0c0c0' }}>publish.</span></h2><p style={{ color:'rgba(242,242,242,.66)', marginTop:9, fontSize:12, lineHeight:1.65 }}>Meta returned these eligible destinations. FloStudio will save the one you select and keep its provider credential in the server-side credential vault.</p><div style={{ display:'grid', gap:9, marginTop:18 }}>{destinationSelection.destinations.map(destination => <button key={destination.id} onClick={() => selectDestination(destination)} disabled={checking === destinationSelection.platform} style={{ textAlign:'left', padding:'14px 16px', borderRadius:10, border:'1px solid rgba(255,255,255,.17)', background:'rgba(255,255,255,.06)', color:'#ffffff', cursor:'pointer' }}><div style={{ fontSize:14, fontWeight:850 }}>{destination.accountName}</div><div style={{ color:'rgba(242,242,242,.58)', fontSize:11, marginTop:4 }}>{destination.accountType}{destination.accountHandle ? ` · ${destination.accountHandle}` : ''}</div></button>)}</div><button onClick={() => setDestinationSelection(null)} className="studio-button studio-button--soft" style={{ marginTop:16, padding:'9px 12px', fontSize:11 }}>Cancel selection</button></section></div>}
    </div>
  </Layout>
}
