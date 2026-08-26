import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'

const PLATFORM_OPTIONS = [
  ['instagram','Instagram'], ['tiktok','TikTok'], ['linkedin','LinkedIn'], ['facebook','Facebook'], ['twitter','X'], ['threads','Threads'], ['youtube','YouTube'], ['pinterest','Pinterest'], ['reddit','Reddit'], ['bluesky','Bluesky'], ['gmb','Google Business'], ['snapchat','Snapchat'], ['telegram','Telegram'],
]

function trim(value, max = 1800) { return String(value || '').trim().slice(0, max) }

function displayHashtags(values) { return (values || []).map(value => `#${String(value).replace(/^#/, '')}`).join(' ') }

function isPublicMediaUrl(value) { return /^https:\/\//i.test(String(value || '').trim()) }

export default function AppAwarePostStudio({ apps = [], workspaceId }) {
  const [appId, setAppId] = useState('')
  const [platform, setPlatform] = useState('instagram')
  const [mediaKind, setMediaKind] = useState('image')
  const [mediaUrl, setMediaUrl] = useState('')
  const [mediaDescription, setMediaDescription] = useState('')
  const [purpose, setPurpose] = useState('Launch a credible benefit-led post that makes the product feel useful today.')
  const [drafts, setDrafts] = useState([])
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const [enabledPlatforms, setEnabledPlatforms] = useState([])
  const [publishConfirmId, setPublishConfirmId] = useState('')

  const app = useMemo(() => apps.find(item => item.id === appId) || apps[0] || null, [apps, appId])
  const sourceImages = useMemo(() => {
    if (!app) return []
    const facts = app.sourceFacts || app.source_facts || {}
    return Array.from(new Set([facts.image, facts.artworkUrl, ...(facts.screenshots || facts.screenshotUrls || [])].filter(Boolean)))
  }, [app])

  const api = async (url, body) => {
    const { data:{ session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Sign in again before using the app-aware social writer.')
    const response = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}` }, body:JSON.stringify(body) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'FloStudio could not generate the social draft.')
    return data
  }

  const loadConfig = async productId => {
    if (!productId) return
    try {
      const data = await api('/api/unified-social', { action:'app_config', productId })
      const enabled = (data.channels || []).filter(channel => channel.enabled).map(channel => channel.platform)
      setEnabledPlatforms(enabled)
      setDrafts(data.drafts || [])
      setPlatform(current => enabled.includes(current) ? current : (enabled[0] || current))
    } catch (error) { setNotice(error.message) }
  }

  useEffect(() => { if (apps.length && !appId) setAppId(apps[0].id) }, [apps, appId])
  useEffect(() => { if (app?.id) loadConfig(app.id) }, [app?.id])
  useEffect(() => { if (!mediaUrl && sourceImages[0]) setMediaUrl(sourceImages[0]) }, [sourceImages, mediaUrl])

  const generate = async targetPlatform => {
    if (!app) return
    setBusy(targetPlatform); setNotice('')
    try {
      const result = await api('/api/generate-social-post', { workspaceId, productId:app.id, platform:targetPlatform, mediaKind, mediaUrl:trim(mediaUrl, 1600), mediaDescription:trim(mediaDescription, 1200), purpose:trim(purpose, 600) })
      setDrafts(previous => [result.draft, ...previous.filter(draft => draft.id !== result.draft.id)])
      setNotice(`${result.product.name} now has a ${targetPlatform} draft grounded in its saved product, App Store, audience, and brand-agent context. It is ready for review—not posted automatically.`)
    } catch (error) { setNotice(error.message) }
    finally { setBusy('') }
  }

  const generatePack = async () => {
    const targets = enabledPlatforms.length ? enabledPlatforms : [platform]
    if (targets.length > 4) { setNotice('For a focused first pass, enable or select up to four priority channels for this app.'); return }
    setBusy('pack'); setNotice('')
    const generated = []
    for (const target of targets) {
      try {
        const result = await api('/api/generate-social-post', { workspaceId, productId:app.id, platform:target, mediaKind, mediaUrl:trim(mediaUrl, 1600), mediaDescription:trim(mediaDescription, 1200), purpose:trim(purpose, 600) })
        generated.push(result.draft)
      } catch (error) { setNotice(`${target}: ${error.message}`) }
    }
    if (generated.length) {
      setDrafts(previous => [...generated, ...previous])
      setNotice(`Created ${generated.length} channel-aware draft${generated.length === 1 ? '' : 's'} for ${app.name}. Every draft stays in review until a user approves it.`)
    }
    setBusy('')
  }

  const publishDraft = async draft => {
    setBusy(`publish:${draft.id}`); setNotice('')
    try {
      const result = await api('/api/unified-social', { action:'publish_draft', draftId:draft.id })
      const published = result.draft
      setDrafts(previous => previous.map(item => item.id === published.id ? published : item))
      setPublishConfirmId('')
      setNotice(published.provider_post_url ? `Facebook accepted the post. The verified remote post is now published and available to open.` : 'Facebook accepted the post. FloStudio recorded the verified provider post ID.')
    } catch (error) { setNotice(error.message) }
    finally { setBusy('') }
  }

  return <section className="studio-panel" style={{ marginTop:22, padding:24, background:'linear-gradient(145deg,rgba(21,24,45,.98),rgba(37,40,83,.96))', borderColor:'rgba(167,161,255,.38)' }}>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'start', gap:16, flexWrap:'wrap' }}><div><div className="studio-kicker" style={{ color:'rgba(204,200,255,.88)' }}>APP-AWARE AI POST STUDIO</div><h2 style={{ color:'#fff', fontSize:27, letterSpacing:'-.055em', marginTop:6 }}>Write the post <span className="studio-serif" style={{ color:'#c9c6ff' }}>your app can prove.</span></h2><p style={{ color:'rgba(239,240,255,.7)', maxWidth:690, fontSize:12, lineHeight:1.65, marginTop:8 }}>Choose an app, attach an image or video, and generate a caption, hook, accessible media description, call to action, and platform-specific hashtags. The writing agent uses the app’s product truth—not generic AI filler.</p></div><span className="studio-chip" style={{ background:'rgba(104,96,255,.2)', borderColor:'rgba(183,178,255,.35)', color:'#dddafe' }}>{enabledPlatforms.length ? `${enabledPlatforms.length} CHANNEL${enabledPlatforms.length === 1 ? '' : 'S'} ENABLED` : 'REVIEW-FIRST WORKFLOW'}</span></div>
    {notice && <div style={{ marginTop:16, padding:12, borderRadius:11, background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.13)', color:'#f3f4ff', fontSize:11.5, lineHeight:1.6 }}>{notice}</div>}
    <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) minmax(300px,.85fr)', gap:17, marginTop:20 }}>
      <div style={{ display:'grid', gap:12 }}>
        <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) 150px 150px', gap:10 }}><label style={{ display:'grid', gap:5, color:'rgba(228,229,255,.8)', fontSize:9.5, fontWeight:850, letterSpacing:'.09em', textTransform:'uppercase' }}>Portfolio app<select value={app?.id || ''} onChange={event => setAppId(event.target.value)} style={{ padding:'9px 11px', borderRadius:10, color:'#222842', background:'#fff' }}>{apps.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label style={{ display:'grid', gap:5, color:'rgba(228,229,255,.8)', fontSize:9.5, fontWeight:850, letterSpacing:'.09em', textTransform:'uppercase' }}>Channel<select value={platform} onChange={event => setPlatform(event.target.value)} style={{ padding:'9px 11px', borderRadius:10, color:'#222842', background:'#fff' }}>{PLATFORM_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label style={{ display:'grid', gap:5, color:'rgba(228,229,255,.8)', fontSize:9.5, fontWeight:850, letterSpacing:'.09em', textTransform:'uppercase' }}>Asset type<select value={mediaKind} onChange={event => setMediaKind(event.target.value)} style={{ padding:'9px 11px', borderRadius:10, color:'#222842', background:'#fff' }}><option value="image">Image post</option><option value="video">Video post</option><option value="text">Text-led post</option></select></label></div>
        <label style={{ display:'grid', gap:5, color:'rgba(228,229,255,.8)', fontSize:9.5, fontWeight:850, letterSpacing:'.09em', textTransform:'uppercase' }}>Campaign intent<textarea rows="2" value={purpose} onChange={event => setPurpose(event.target.value)} style={{ padding:'10px 11px', borderRadius:10, color:'#222842', background:'#fff' }} /></label>
        <label style={{ display:'grid', gap:5, color:'rgba(228,229,255,.8)', fontSize:9.5, fontWeight:850, letterSpacing:'.09em', textTransform:'uppercase' }}>What the attached image or video shows<textarea rows="3" value={mediaDescription} onChange={event => setMediaDescription(event.target.value)} placeholder="Describe the frame, product moment, on-screen proof, or the video’s opening hook…" style={{ padding:'10px 11px', borderRadius:10, color:'#222842', background:'#fff' }} /></label>
        <label style={{ display:'grid', gap:5, color:'rgba(228,229,255,.8)', fontSize:9.5, fontWeight:850, letterSpacing:'.09em', textTransform:'uppercase' }}>Media URL (optional, used as the review reference)<input value={mediaUrl} onChange={event => setMediaUrl(event.target.value)} placeholder="Paste a FloStudio image or video URL" style={{ padding:'10px 11px', borderRadius:10, color:'#222842', background:'#fff' }} /></label>
        {isPublicMediaUrl(mediaUrl) && <div style={{ display:'grid', gridTemplateColumns:'112px minmax(0,1fr)', gap:11, alignItems:'center', padding:10, borderRadius:12, background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.16)' }}><div style={{ height:76, borderRadius:9, overflow:'hidden', background:'#101226' }}>{mediaKind === 'video' ? <video src={mediaUrl} muted controls style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <img src={mediaUrl} alt={mediaDescription || `${app?.name || 'Selected'} creative preview`} style={{ width:'100%', height:'100%', objectFit:'cover' }} />}</div><div><div className="studio-kicker" style={{ color:'rgba(204,200,255,.88)' }}>SELECTED CREATIVE</div><p style={{ marginTop:5, color:'#fff', fontSize:11.5, lineHeight:1.5 }}>{mediaKind === 'video' ? 'This video will appear with the approved post.' : 'This image will appear with the approved post.'}</p><button type="button" onClick={() => setMediaUrl('')} className="studio-button studio-button--soft" style={{ marginTop:8, padding:'6px 9px', fontSize:9.5 }}>Choose another asset</button></div></div>}
        {sourceImages.length > 0 && <div style={{ display:'flex', gap:7, overflowX:'auto', paddingBottom:3 }}>{sourceImages.slice(0,12).map(url => <button key={url} type="button" onClick={() => setMediaUrl(url)} title="Use this app asset" style={{ width:64, height:64, flex:'0 0 auto', padding:0, borderRadius:10, overflow:'hidden', border:`2px solid ${url === mediaUrl ? '#b9b5ff' : 'rgba(255,255,255,.16)'}`, background:'#111' }}><img src={url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /></button>)}</div>}
        <div style={{ display:'flex', gap:9, flexWrap:'wrap', marginTop:2 }}><button onClick={() => generate(platform)} disabled={Boolean(busy)} className="studio-button" style={{ padding:'10px 13px', fontSize:10.5 }}>{busy === platform ? 'Writing grounded draft…' : `Write ${PLATFORM_OPTIONS.find(item => item[0] === platform)?.[1] || platform} post →`}</button><button onClick={generatePack} disabled={Boolean(busy)} className="studio-button studio-button--soft" style={{ padding:'10px 13px', fontSize:10.5 }}>{busy === 'pack' ? 'Writing content pack…' : 'Create enabled-channel pack'}</button></div>
      </div>
      <div style={{ padding:17, borderRadius:16, background:'rgba(255,255,255,.07)', border:'1px solid rgba(255,255,255,.13)' }}><div className="studio-kicker" style={{ color:'rgba(204,200,255,.88)' }}>AGENT CONTEXT IN USE</div><h3 style={{ color:'#fff', fontSize:18, marginTop:8 }}>{app?.name || 'Choose an app'} Brand Agent</h3><div style={{ display:'grid', gap:8, marginTop:13 }}>{[['Product description',Boolean(app?.description)], ['App Store screenshots',sourceImages.length], ['Audience & offer',Boolean(app?.audience || app?.offer_text)], ['Saved brand DNA',Boolean(app?.brandDna && Object.keys(app.brandDna).length)], ['Configured channels',enabledPlatforms.length]].map(([label, value]) => <div key={label} style={{ display:'flex', justifyContent:'space-between', gap:8, color:'rgba(237,238,255,.72)', fontSize:11 }}><span>{label}</span><b style={{ color:value ? '#8ee5cc' : '#c5c4d8' }}>{value ? 'READY' : 'ADD CONTEXT'}</b></div>)}</div><p style={{ color:'rgba(237,238,255,.54)', fontSize:10.5, lineHeight:1.6, marginTop:14 }}>The writer does not fabricate ratings, customer proof, features, or outcomes. Strengthen this app’s agent in Channels to add approval rules, proof points, claim exclusions, and default hashtags.</p></div>
    </div>
    {drafts.length > 0 && <div style={{ marginTop:22, paddingTop:18, borderTop:'1px solid rgba(255,255,255,.13)' }}><div className="studio-kicker" style={{ color:'rgba(204,200,255,.88)' }}>REVIEW-READY DRAFTS</div><div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(290px,1fr))', gap:12, marginTop:12 }}>{drafts.map(draft => { const publishable = draft.platform === 'facebook' && draft.status === 'ready_for_review' && enabledPlatforms.includes('facebook'); const confirming = publishConfirmId === draft.id; const publishing = busy === `publish:${draft.id}`; return <article key={draft.id} style={{ padding:15, borderRadius:14, background:'#fff', color:'#20243d' }}><div style={{ display:'flex', justifyContent:'space-between', gap:8, alignItems:'center' }}><b style={{ fontSize:12, textTransform:'capitalize' }}>{draft.platform}</b><span className="studio-chip" style={{ color:draft.status === 'published' ? '#157d57' : '#4c46cd', background:draft.status === 'published' ? 'rgba(21,125,87,.08)' : 'rgba(95,89,232,.08)', borderColor:draft.status === 'published' ? 'rgba(21,125,87,.2)' : 'rgba(95,89,232,.2)' }}>{draft.status?.replaceAll('_',' ')}</span></div>{isPublicMediaUrl(draft.media_url) && <div style={{ marginTop:11, height:164, borderRadius:10, overflow:'hidden', background:'#12152c' }}>{draft.media_kind === 'video' ? <video src={draft.media_url} controls style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <img src={draft.media_url} alt="Selected social creative" style={{ width:'100%', height:'100%', objectFit:'cover' }} />}</div>}{draft.hook && <p style={{ color:'#525973', fontWeight:800, fontSize:12, lineHeight:1.45, marginTop:10 }}>{draft.hook}</p>}<p style={{ color:'#30364f', fontSize:12, lineHeight:1.65, whiteSpace:'pre-wrap', marginTop:9 }}>{draft.caption}</p><p style={{ color:'#5f59e8', fontSize:10.5, lineHeight:1.6, marginTop:10 }}>{displayHashtags(draft.hashtags)}</p>{draft.call_to_action && <div style={{ marginTop:10, paddingTop:9, borderTop:'1px solid #e7e8ef', color:'#6b7288', fontSize:10.5 }}>CTA · {draft.call_to_action}</div>}{draft.status === 'published' && <div style={{ marginTop:12, fontSize:10.5, color:'#157d57', fontWeight:800 }}>{draft.provider_post_url ? <a href={draft.provider_post_url} target="_blank" rel="noreferrer" style={{ color:'#157d57' }}>Open verified Facebook post ↗</a> : `Facebook post ID · ${draft.provider_post_id || 'recorded'}`}</div>}{publishable && !confirming && <button type="button" onClick={() => setPublishConfirmId(draft.id)} className="studio-button" style={{ marginTop:13, width:'100%', padding:'10px 12px', fontSize:10.5 }}>Review approval to push to Facebook →</button>}{publishable && confirming && <div style={{ marginTop:13, padding:11, borderRadius:10, background:'#fff5e6', border:'1px solid #f0cf91' }}><b style={{ color:'#795100', fontSize:10.5 }}>This sends the image and caption to the verified Facebook destination now.</b><div style={{ display:'flex', gap:8, marginTop:9, flexWrap:'wrap' }}><button type="button" onClick={() => publishDraft(draft)} disabled={Boolean(busy)} className="studio-button" style={{ padding:'8px 10px', fontSize:10 }}>{publishing ? 'Pushing to Facebook…' : 'Confirm & push to Facebook now'}</button><button type="button" onClick={() => setPublishConfirmId('')} className="studio-button studio-button--soft" style={{ padding:'8px 10px', fontSize:10 }}>Cancel</button></div></div>}</article>})}</div></div>}
  </section>
}
