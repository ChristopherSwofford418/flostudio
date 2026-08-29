import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'

const PLATFORM_LABELS = {
  bluesky:'Bluesky', facebook:'Facebook', gmb:'Google Business', instagram:'Instagram', linkedin:'LinkedIn', pinterest:'Pinterest', reddit:'Reddit', snapchat:'Snapchat', telegram:'Telegram', threads:'Threads', tiktok:'TikTok', twitter:'X', youtube:'YouTube',
}

const OWNER_TEST_PLATFORMS = ['facebook', 'instagram', 'linkedin', 'tiktok', 'threads', 'youtube', 'pinterest', 'reddit', 'bluesky', 'gmb', 'telegram', 'snapchat']
const APP_ISOLATED_PLATFORMS = ['facebook', 'instagram', 'twitter']
const OWNER_TEST_CHANNEL_LIMIT = 3

function itemsFrom(value) {
  return String(value || '').split('\n').map(item => item.trim()).filter(Boolean)
}

function textFrom(value) {
  return Array.isArray(value) ? value.join('\n') : ''
}

export default function AppSocialStudio({ apps = [], workspaceId, activeAppId: controlledAppId = '', onAppChange }) {
  const [localAppId, setLocalAppId] = useState('')
  const activeAppId = controlledAppId || localAppId
  const changeApp = appId => {
    setLocalAppId(appId)
    onAppChange?.(appId)
  }
  const [connectPlatforms, setConnectPlatforms] = useState(['facebook'])
  const [status, setStatus] = useState(null)
  const [config, setConfig] = useState(null)
  const [agent, setAgent] = useState({ agentName:'', brandVoice:'', primaryAudience:'', valuePropositions:'', proofPoints:'', approvedTopics:'', prohibitedClaims:'', defaultHashtags:'' })
  const [channelDrafts, setChannelDrafts] = useState({})
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')

  const toggleConnectPlatform = platform => {
    setNotice('')
    setConnectPlatforms(previous => {
      if (previous.includes(platform)) return previous.filter(item => item !== platform)
      if (previous.length >= OWNER_TEST_CHANNEL_LIMIT) {
        setNotice(`Choose up to ${OWNER_TEST_CHANNEL_LIMIT} channels for this owner test. You can return to add or map more later.`)
        return previous
      }
      return [...previous, platform]
    })
  }

  const activeApp = useMemo(() => apps.find(app => app.id === activeAppId) || apps[0] || null, [apps, activeAppId])

  const api = async body => {
    const { data:{ session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Sign in again before configuring the app-aware social studio.')
    const response = await fetch('/api/unified-social', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}` }, body:JSON.stringify(body) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'FloStudio could not complete this social studio request.')
    return data
  }

  const loadStatus = async productId => {
    const result = await api({ action:'status', productId:productId || undefined })
    setStatus(result)
    return result
  }

  const loadAppConfig = async (appId, accountsOverride = null) => {
    if (!appId) return
    const result = await api({ action:'app_config', productId:appId })
    setConfig(result)
    const saved = result.agent || {}
    setAgent({
      agentName:saved.agent_name || `${result.product?.name || 'Your app'} Brand Agent`,
      brandVoice:saved.brand_voice || result.context?.brandDna?.voice || '',
      primaryAudience:saved.primary_audience || result.context?.audience || '',
      valuePropositions:textFrom(saved.value_propositions),
      proofPoints:textFrom(saved.proof_points),
      approvedTopics:textFrom(saved.approved_topics),
      prohibitedClaims:textFrom(saved.prohibited_claims),
      defaultHashtags:textFrom(saved.default_hashtags),
    })
    const byPlatform = Object.fromEntries((result.channels || []).map(channel => [channel.platform, channel]))
    // A legacy owner profile is not a reusable app identity. Only show those accounts
    // where a destination has already been mapped to this exact portfolio app.
    const currentAccounts = accountsOverride || status?.accounts || []
    const scopedAccounts = status?.isolationMode === 'per_app'
      ? currentAccounts
      : currentAccounts.filter(account => Boolean(byPlatform[account.platform]))
    const accountDrafts = Object.fromEntries(scopedAccounts.map(account => {
      const savedChannel = byPlatform[account.platform] || {}
      return [account.platform, {
        platform:account.platform,
        enabled:Boolean(savedChannel.enabled),
        providerAccountId:savedChannel.provider_account_id || account.providerAccountId,
        providerAccountName:savedChannel.provider_account_name || account.accountName,
        providerHandle:savedChannel.provider_handle || account.handle || '',
        approvalMode:savedChannel.approval_mode || 'review',
        tone:savedChannel.tone || '',
        audience:savedChannel.audience || '',
        defaultCta:savedChannel.default_cta || '',
        preferredFormats:savedChannel.preferred_formats || [],
        hashtagRules:savedChannel.hashtag_rules || { count:5, avoidDuplicates:true },
        schedulePreferences:savedChannel.schedule_preferences || {},
      }]
    }))
    setChannelDrafts(accountDrafts)
  }

  useEffect(() => {
    if (apps.length && !activeAppId) changeApp(apps[0].id)
  }, [apps, activeAppId])
  useEffect(() => {
    if (activeAppId) loadStatus(activeAppId).catch(error => setNotice(error.message))
  }, [activeAppId])
  useEffect(() => {
    if (activeAppId && status) loadAppConfig(activeAppId).catch(error => setNotice(error.message))
  }, [activeAppId, status?.profile?.id, status?.isolationMode])

  const connectAccounts = async () => {
    if (!activeApp) { setNotice('Choose a portfolio app before connecting social channels.'); return }
    if (!connectPlatforms.length) { setNotice('Select at least one social channel to connect.'); return }
    setBusy('connect'); setNotice('')
    try {
      const result = await api({ action:'begin_connect', workspaceId, productId:activeApp.id, allowedSocial:connectPlatforms })
      if (!result.authorizationUrl) throw new Error('The social provider did not return an account-linking URL.')
      window.location.assign(result.authorizationUrl)
    } catch (error) { setNotice(error.message) }
    finally { setBusy('') }
  }

  const syncAccounts = async () => {
    if (!activeApp) { setNotice('Choose a portfolio app before syncing social channels.'); return }
    if (!connectPlatforms.length) { setNotice('Select at least one social channel to verify and map.'); return }
    setBusy('sync'); setNotice('')
    try {
      const result = await api({ action:'sync', productId:activeApp.id, requestedPlatforms:connectPlatforms })
      setStatus(previous => ({ ...(previous || {}), configured:result.configured, profile:result.profile ? { id:result.profile.id, title:result.profile.profile_title || result.profile.profileTitle, status:result.profile.status, connectedPlatforms:result.profile.connected_platforms || result.profile.connectedPlatforms || [], lastSyncedAt:result.profile.last_synced_at || result.profile.lastSyncedAt } : previous?.profile, accounts:result.accounts || [] }))
      await loadAppConfig(activeApp.id, result.accounts || [])
      const verified = (result.appChannels || []).map(channel => PLATFORM_LABELS[channel.platform] || channel.platform)
      const selectedLabels = connectPlatforms.map(platform => PLATFORM_LABELS[platform] || platform)
      setNotice(verified.length ? `${verified.join(', ')} ${verified.length === 1 ? 'is' : 'are'} verified and mapped to ${activeApp.name} in review-only mode. Configure each policy below before any post can be approved.` : result.accounts?.some(account => connectPlatforms.includes(account.platform)) ? `${selectedLabels.join(', ')} ${selectedLabels.length === 1 ? 'was' : 'were'} synced. Their app mappings will appear after the next configuration refresh.` : `No connected account was returned for ${selectedLabels.join(', ')}. Complete authorization at the provider, then verify again.`)
    } catch (error) { setNotice(error.message) }
    finally { setBusy('') }
  }

  const studyApp = async () => {
    if (!activeApp) return
    setBusy('study'); setNotice('')
    try {
      const result = await api({ action:'save_brand_agent', workspaceId, productId:activeApp.id, agent:{
        agentName:agent.agentName,
        brandVoice:agent.brandVoice,
        primaryAudience:agent.primaryAudience,
        valuePropositions:itemsFrom(agent.valuePropositions),
        proofPoints:itemsFrom(agent.proofPoints),
        approvedTopics:itemsFrom(agent.approvedTopics),
        prohibitedClaims:itemsFrom(agent.prohibitedClaims),
        defaultHashtags:itemsFrom(agent.defaultHashtags),
      } })
      setConfig(previous => ({ ...previous, agent:result.agent, context:result.context }))
      setNotice(`${activeApp.name} is now grounded as a dedicated brand agent. Future posts use its product, App Store, audience, proof, and policy context.`)
    } catch (error) { setNotice(error.message) }
    finally { setBusy('') }
  }

  const updateChannel = (platform, updates) => setChannelDrafts(previous => ({ ...previous, [platform]:{ ...(previous[platform] || { platform }), ...updates } }))

  const saveChannel = async platform => {
    if (!activeApp || !channelDrafts[platform]) return
    setBusy(`channel:${platform}`); setNotice('')
    try {
      await api({ action:'save_channel', workspaceId, productId:activeApp.id, channel:channelDrafts[platform] })
      setNotice(`${PLATFORM_LABELS[platform] || platform} is now configured for ${activeApp.name}. Content will remain in review until you explicitly approve it.`)
      await loadAppConfig(activeApp.id)
    } catch (error) { setNotice(error.message) }
    finally { setBusy('') }
  }

  const appFacts = config?.context || {}
  const connectedAccounts = status?.accounts || []
  const appIsolated = status?.isolationMode === 'per_app'
  const mappedPlatforms = new Set((config?.channels || []).filter(channel => channel.enabled || channel.provider_account_id).map(channel => channel.platform))
  const scopedConnectedAccounts = appIsolated
    ? connectedAccounts
    : connectedAccounts.filter(account => mappedPlatforms.has(account.platform))
  const hasLegacyAppMapping = !appIsolated && scopedConnectedAccounts.length > 0
  const selectablePlatforms = APP_ISOLATED_PLATFORMS
  const connectedPlatforms = new Set(scopedConnectedAccounts.map(account => account.platform))
  const selectedChannelLabel = connectPlatforms.map(platform => PLATFORM_LABELS[platform] || platform).join(', ')

  return <section className="studio-panel" style={{ marginTop:22, padding:24, border:'1px solid rgba(99,91,255,.26)', background:'linear-gradient(145deg,rgba(255,255,255,.98),rgba(244,246,255,.94))' }}>
    <div style={{ display:'flex', justifyContent:'space-between', gap:16, alignItems:'flex-start', flexWrap:'wrap' }}>
      <div><div className="studio-kicker">APP-AWARE SOCIAL OS</div><h2 style={{ marginTop:6, fontSize:27, letterSpacing:'-.055em', color:'#171a32' }}>Connect channels. Then let each app’s <span className="studio-serif" style={{ color:'#5f59e8' }}>brand agent</span> create with context.</h2><p style={{ maxWidth:710, color:'#596079', fontSize:12, lineHeight:1.65, marginTop:8 }}>{appIsolated ? 'Each FloStudio app has its own isolated provider profile. Its Facebook Page, Instagram Professional account, and X account can only be used by that app’s review and publishing workflow.' : 'Owner test mode uses one shared primary provider profile to prove the connection workflow. App-specific publishing identity requires the isolated-profile setup shown here when you are ready to scale.'}</p></div>
      <div className="studio-chip" style={{ borderColor:status?.configured ? 'rgba(35,176,143,.45)' : 'rgba(216,151,53,.48)', color:status?.configured ? '#13856d' : '#a86211', background:status?.configured ? 'rgba(35,176,143,.1)' : 'rgba(216,151,53,.11)' }}>{status?.configured ? (appIsolated ? 'PER-APP PROFILES READY' : 'PER-APP SETUP REQUIRED') : 'PROVIDER SETUP REQUIRED'}</div>
    </div>

    {notice && <div style={{ marginTop:16, padding:12, borderRadius:12, background:'rgba(95,89,232,.08)', border:'1px solid rgba(95,89,232,.18)', color:'#35325f', fontSize:12, lineHeight:1.6 }}>{notice}</div>}

    <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1.25fr) minmax(290px,.75fr)', gap:16, marginTop:20 }}>
      <div className="flo-dark-surface" style={{ borderRadius:16, padding:18, background:'#15182d', color:'#fff' }}><div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'center' }}><div className="studio-kicker" style={{ color:'rgba(185,181,255,.9)' }}>01 / SELECT APP, THEN CONNECT</div><span className="studio-chip" style={{ color:'#c9c7ff', borderColor:'rgba(185,181,255,.42)', background:'rgba(118,108,255,.16)', fontSize:9 }}>{appIsolated ? `${connectPlatforms.length}/3 SELECTED` : 'ISOLATION CHECK'}</span></div><label style={{ display:'grid', gap:5, marginTop:10, color:'rgba(237,239,255,.72)', fontSize:10, fontWeight:850, letterSpacing:'.08em', textTransform:'uppercase' }}>Portfolio app<select value={activeApp?.id || ''} onChange={event => changeApp(event.target.value)} style={{ padding:'9px 11px', borderRadius:10, border:'1px solid rgba(255,255,255,.18)', background:'#242845', color:'#fff', fontWeight:750, textTransform:'none', letterSpacing:0 }}>{apps.map(app => <option key={app.id} value={app.id}>{app.name}</option>)}</select></label><h3 style={{ fontSize:19, marginTop:13 }}>{activeApp ? (appIsolated ? `Connect Facebook, Instagram, and X for ${activeApp.name}.` : hasLegacyAppMapping ? `${activeApp.name} has a preserved legacy Facebook mapping.` : `${activeApp.name} is ready for its own social profile.`) : 'Choose an app before connecting.'}</h3><p style={{ color:'rgba(237,239,255,.7)', fontSize:11.5, lineHeight:1.6, marginTop:7 }}>{appIsolated ? 'This app has its own provider profile. Choose Facebook, Instagram, and X below, then connect only this app’s pages and accounts. Other FloStudio apps cannot use this profile or publish through its destinations.' : hasLegacyAppMapping ? 'This app has an existing legacy owner-test mapping. It remains review-only and is preserved, but it cannot be reused for another app. Activate isolated profiles before adding Facebook, Instagram, or X to a different app.' : 'This app does not have a social destination yet. The legacy owner-test profile is intentionally locked so it cannot be reused across your portfolio. Activate isolated per-app profiles before connecting this app’s Facebook, Instagram, or X account.'}</p><div style={{ display:'flex', gap:7, flexWrap:'wrap', marginTop:13 }}>{selectablePlatforms.map(platform => { const selected = connectPlatforms.includes(platform); const linked = connectedPlatforms.has(platform); return <button key={platform} type="button" onClick={() => toggleConnectPlatform(platform)} className="studio-chip" style={{ cursor:'pointer', color:selected ? '#fff' : 'rgba(237,239,255,.75)', borderColor:selected ? 'rgba(185,181,255,.8)' : linked ? 'rgba(61,209,167,.52)' : 'rgba(255,255,255,.18)', background:selected ? 'rgba(118,108,255,.58)' : linked ? 'rgba(43,178,143,.14)' : 'rgba(255,255,255,.06)' }}>{linked ? '● ' : ''}{selected ? '✓ ' : ''}{PLATFORM_LABELS[platform]}</button> })}</div><div style={{ color:'rgba(202,205,230,.68)', fontSize:10.5, marginTop:10, minHeight:16 }}>{appIsolated ? (connectPlatforms.length ? `Selected: ${selectedChannelLabel}. Click a selected channel to remove it.` : 'Select Facebook, Instagram, or X to begin.') : hasLegacyAppMapping ? 'The existing mapping stays intact. New app connections are intentionally paused until each app has its own provider profile.' : 'No channel can be connected to this app yet because the shared owner profile cannot be reused across brands.'}</div><div style={{ display:'flex', gap:9, flexWrap:'wrap', marginTop:12 }}>{appIsolated ? <><button onClick={connectAccounts} disabled={busy === 'connect' || !activeApp || !connectPlatforms.length} className="studio-button" style={{ padding:'10px 13px', fontSize:11 }}>{busy === 'connect' ? 'Opening consent flow…' : `Connect ${selectedChannelLabel || 'selected channels'} →`}</button><button onClick={syncAccounts} disabled={busy === 'sync' || !activeApp || !connectPlatforms.length} className="studio-button studio-button--soft" style={{ padding:'10px 13px', fontSize:11 }}>{busy === 'sync' ? 'Verifying…' : `Verify ${selectedChannelLabel || 'selected channels'}`}</button></> : <><span className="studio-chip" style={{ color:'#d8d5ff', borderColor:'rgba(185,181,255,.42)', background:'rgba(118,108,255,.16)' }}>SEPARATE APP PROFILE REQUIRED</span>{hasLegacyAppMapping && <button onClick={syncAccounts} disabled={busy === 'sync'} className="studio-button studio-button--soft" style={{ padding:'10px 13px', fontSize:11 }}>{busy === 'sync' ? 'Checking verified status…' : 'Refresh existing app status'}</button>}</>}</div></div>
      <div className="flo-light-surface" style={{ borderRadius:16, padding:18, border:'1px solid rgba(26,31,57,.1)', background:'rgba(255,255,255,.75)' }}><div className="studio-kicker">VERIFIED DESTINATIONS FOR THIS APP</div><div style={{ marginTop:10, display:'grid', gap:8 }}>{scopedConnectedAccounts.length ? scopedConnectedAccounts.map(account => <div key={`${account.platform}:${account.providerAccountId}`} style={{ display:'flex', gap:9, alignItems:'center', padding:'8px 10px', borderRadius:10, background:'#f4f5fb' }}><span style={{ width:8, height:8, borderRadius:'50%', background:'#25b08f', flex:'0 0 auto' }} /><div style={{ minWidth:0 }}><b style={{ display:'block', color:'#252a44', fontSize:11 }}>{PLATFORM_LABELS[account.platform] || account.platform} · {account.accountName}</b><span style={{ display:'block', color:'#747b94', fontSize:10, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{account.handle || account.profileUrl || 'Connected account'}</span></div></div>) : <p style={{ color:'#727991', fontSize:11.5, lineHeight:1.6 }}>{status?.ownerMode ? 'No destination is mapped to this app yet. Its Facebook, Instagram, and X connections stay locked until FloStudio has an isolated provider profile for this app.' : 'No unified accounts synced yet. Connect this app’s channels above; they will appear here after authorization completes.'}</p>}</div></div>
    </div>

    <div style={{ marginTop:22, paddingTop:20, borderTop:'1px solid rgba(31,37,63,.1)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'end', flexWrap:'wrap' }}><div><div className="studio-kicker">02 / APP BRAND AGENT</div><h3 style={{ color:'#1d213b', fontSize:20, marginTop:6 }}>Teach {activeApp?.name || 'this app'} before it writes.</h3></div><div className="studio-chip" style={{ color:'#5552bf', borderColor:'rgba(95,89,232,.22)', background:'rgba(95,89,232,.07)' }}>CURRENT APP · {activeApp?.name || 'NONE'}</div></div>
      {activeApp && <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1.15fr) minmax(300px,.85fr)', gap:15, marginTop:15 }}>
        <div style={{ padding:16, borderRadius:15, background:'#f7f7fc', border:'1px solid #e4e5f0' }}><div style={{ display:'flex', alignItems:'center', gap:10 }}><div style={{ width:38, height:38, overflow:'hidden', borderRadius:11, background:'#e9e9f7', display:'grid', placeItems:'center', color:'#5f59e8', fontWeight:900 }}>{activeApp.imageUrl ? <img src={activeApp.imageUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : activeApp.icon}</div><div><b style={{ color:'#20243d' }}>{activeApp.name}</b><span style={{ display:'block', color:'#737a94', fontSize:10, marginTop:2 }}>{appFacts.category || activeApp.category || 'Portfolio app'} · {appFacts.store?.screenshots?.length || activeApp.sourceFacts?.screenshots?.length || 0} store screenshots · {appFacts.reviewThemes?.length || 0} review signals</span></div></div><p style={{ color:'#626983', fontSize:11.5, lineHeight:1.6, marginTop:12 }}>{appFacts.description || activeApp.description || 'Add product intelligence in Portfolio to deepen this app’s grounded content context.'}</p><div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:12 }}>{(appFacts.store?.keywords || []).slice(0,7).map(keyword => <span key={keyword} className="studio-chip" style={{ fontSize:9, color:'#5552bf', borderColor:'rgba(95,89,232,.22)', background:'rgba(95,89,232,.07)' }}>{keyword}</span>)}</div></div>
        <div style={{ padding:16, borderRadius:15, background:'#fff', border:'1px solid #e4e5f0' }}><label style={{ display:'grid', gap:5, color:'#59617c', fontSize:10, fontWeight:800, letterSpacing:'.08em', textTransform:'uppercase' }}>Agent name<input value={agent.agentName} onChange={event => setAgent(previous => ({ ...previous, agentName:event.target.value }))} /></label><label style={{ display:'grid', gap:5, marginTop:10, color:'#59617c', fontSize:10, fontWeight:800, letterSpacing:'.08em', textTransform:'uppercase' }}>Brand voice<textarea value={agent.brandVoice} onChange={event => setAgent(previous => ({ ...previous, brandVoice:event.target.value }))} rows="2" placeholder="Clear, grounded, playful, technical…" /></label><button onClick={studyApp} disabled={busy === 'study'} className="studio-button" style={{ marginTop:12, padding:'9px 12px', fontSize:10.5 }}>{busy === 'study' ? 'Saving product context…' : 'Study this app & save agent →'}</button></div>
      </div>}
      {activeApp && <details style={{ marginTop:13, border:'1px solid #e0e2ec', borderRadius:13, background:'#fff', padding:'12px 14px' }}><summary style={{ cursor:'pointer', color:'#414964', fontSize:11, fontWeight:850 }}>Advanced brand agent context, proof policy, and default hashtags</summary><div style={{ display:'grid', gridTemplateColumns:'repeat(2,minmax(0,1fr))', gap:12, marginTop:14 }}><label className="portfolio-field"><span>Primary audience</span><textarea rows="3" value={agent.primaryAudience} onChange={event => setAgent(previous => ({ ...previous, primaryAudience:event.target.value }))} /></label><label className="portfolio-field"><span>Value propositions (one per line)</span><textarea rows="3" value={agent.valuePropositions} onChange={event => setAgent(previous => ({ ...previous, valuePropositions:event.target.value }))} /></label><label className="portfolio-field"><span>Supportable proof points (one per line)</span><textarea rows="3" value={agent.proofPoints} onChange={event => setAgent(previous => ({ ...previous, proofPoints:event.target.value }))} /></label><label className="portfolio-field"><span>Claims to avoid (one per line)</span><textarea rows="3" value={agent.prohibitedClaims} onChange={event => setAgent(previous => ({ ...previous, prohibitedClaims:event.target.value }))} /></label><label className="portfolio-field"><span>Approved content themes (one per line)</span><textarea rows="3" value={agent.approvedTopics} onChange={event => setAgent(previous => ({ ...previous, approvedTopics:event.target.value }))} /></label><label className="portfolio-field"><span>Default hashtags (one per line, without #)</span><textarea rows="3" value={agent.defaultHashtags} onChange={event => setAgent(previous => ({ ...previous, defaultHashtags:event.target.value }))} /></label></div></details>}
    </div>

    <div style={{ marginTop:22, paddingTop:20, borderTop:'1px solid rgba(31,37,63,.1)' }}><div className="studio-kicker">03 / APP CHANNEL POLICIES</div><h3 style={{ color:'#1d213b', fontSize:20, marginTop:6 }}>Decide exactly which account represents each app.</h3><p style={{ color:'#68708a', fontSize:11.5, lineHeight:1.6, marginTop:6 }}>Enable a connected destination only after you choose its tone, audience, approval method, CTA, and hashtag guardrails for the selected app. Connected accounts remain dormant until explicitly mapped.</p><div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(270px,1fr))', gap:12, marginTop:14 }}>{scopedConnectedAccounts.length ? scopedConnectedAccounts.map(account => { const draft = channelDrafts[account.platform] || { platform:account.platform, enabled:false, providerAccountId:account.providerAccountId, providerAccountName:account.accountName, providerHandle:account.handle || '', approvalMode:'review', tone:'', audience:'', defaultCta:'', preferredFormats:[], hashtagRules:{ count:5, avoidDuplicates:true }, schedulePreferences:{} }; return <article key={`${account.platform}:${account.providerAccountId}`} style={{ padding:15, borderRadius:14, border:`1px solid ${draft.enabled ? 'rgba(95,89,232,.36)' : '#e2e4ef'}`, background:draft.enabled ? 'rgba(95,89,232,.045)' : '#fff' }}><div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'center' }}><div><b style={{ color:'#222842', fontSize:13 }}>{PLATFORM_LABELS[account.platform] || account.platform}</b><span style={{ display:'block', color:'#737a93', fontSize:10, marginTop:2 }}>{account.accountName}{account.handle ? ` · ${account.handle}` : ''}</span></div><button type="button" onClick={() => updateChannel(account.platform, { enabled:!draft.enabled })} className="studio-chip" style={{ color:draft.enabled ? '#4c46cd' : '#737a93', borderColor:draft.enabled ? 'rgba(95,89,232,.35)' : '#d9dce7', background:draft.enabled ? 'rgba(95,89,232,.12)' : '#f7f8fb' }}>{draft.enabled ? 'ENABLED' : 'OFF'}</button></div><label style={{ display:'grid', gap:4, color:'#6a718a', fontSize:9.5, fontWeight:850, letterSpacing:'.08em', textTransform:'uppercase', marginTop:12 }}>Channel tone<input value={draft.tone || ''} onChange={event => updateChannel(account.platform, { tone:event.target.value })} placeholder="Creator-native, expert, playful…" /></label><label style={{ display:'grid', gap:4, color:'#6a718a', fontSize:9.5, fontWeight:850, letterSpacing:'.08em', textTransform:'uppercase', marginTop:9 }}>Approval mode<select value={draft.approvalMode || 'review'} onChange={event => updateChannel(account.platform, { approvalMode:event.target.value })}><option value="review">Review every post</option><option value="scheduled_draft">Schedule as draft</option><option value="approved_rule">Use approved rule</option></select></label><label style={{ display:'grid', gap:4, color:'#6a718a', fontSize:9.5, fontWeight:850, letterSpacing:'.08em', textTransform:'uppercase', marginTop:9 }}>Default CTA<input value={draft.defaultCta || ''} onChange={event => updateChannel(account.platform, { defaultCta:event.target.value })} placeholder="Try the app today" /></label><button onClick={() => saveChannel(account.platform)} disabled={busy === `channel:${account.platform}`} className="studio-button studio-button--soft" style={{ marginTop:12, padding:'8px 10px', fontSize:10 }}>{busy === `channel:${account.platform}` ? 'Saving…' : `Save ${PLATFORM_LABELS[account.platform]} policy`}</button></article> }) : <div style={{ gridColumn:'1/-1', padding:18, borderRadius:14, border:'1px dashed #cfd3e1', color:'#6e758d', fontSize:12 }}>This app has no mapped social destination yet. Its brand agent and draft writer are ready; Facebook, Instagram, and X remain review-only until an isolated app profile is connected and explicitly mapped.</div>}</div></div>
  </section>
}
