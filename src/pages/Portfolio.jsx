import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import { useWorkspace } from '../context/WorkspaceContext'
import { ensurePersonalWorkspace, savePortfolioApp } from '../lib/portfolio'
import { refreshPortfolioAppIntelligence } from '../lib/appStoreIntelligence'
import { runMonthlyAutopilotForApp } from '../lib/monthlyAutopilot'
import { supabase } from '../supabase'
import AppStoreConnectPanel from '../components/AppStoreConnectPanel'

const defaultAutopilot = { enabled:false, cadence:20, platforms:['instagram'], creativeMix:{ image:70, video:30 }, approvalMode:'review' }
const platforms = ['instagram','facebook','linkedin','tiktok','twitter']
const platformLabel = { instagram:'Instagram', facebook:'Facebook', linkedin:'LinkedIn', tiktok:'TikTok', twitter:'X / Twitter' }
const emptySocialLinks = () => Object.fromEntries(platforms.map(platform => [platform, '']))
const normalizeSocialLinks = (links = {}) => Object.fromEntries(platforms.map(platform => [platform, typeof links?.[platform] === 'string' ? links[platform] : '']))
const safeExternalUrl = value => {
  const candidate = String(value || '').trim()
  if (!candidate) return ''
  try {
    const url = new URL(candidate)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}
const socialLinksForApp = app => platforms
  .map(platform => ({ platform, url:safeExternalUrl(app?.sourceFacts?.socialLinks?.[platform]) }))
  .filter(({ url }) => Boolean(url))
const appArtworkSources = app => {
  const direct = String(app?.imageUrl || '').trim()
  const appId = String(app?.sourceFacts?.appId || '').trim()
  const isAppleArtwork = /^https:\/\/([a-z0-9-]+\.)?mzstatic\.com\//i.test(direct)
  const proxy = isAppleArtwork && /^\d{4,20}$/.test(appId) ? `/api/apple-artwork?id=${encodeURIComponent(appId)}` : ''
  return [...new Set([proxy, direct].filter(Boolean))]
}
function PortfolioAppIcon({ app }) {
  const sources = appArtworkSources(app)
  const [sourceIndex, setSourceIndex] = useState(0)
  const imageSrc = sources[sourceIndex] || ''
  const showFallback = !imageSrc
  return <div style={{ width:42, height:42, borderRadius:3, position:'relative', overflow:'hidden', background:'var(--signal)', display:'grid', placeItems:'center', color:'var(--ink-deep)', fontWeight:900, fontSize:18, border:'1px solid rgba(240,240,240,.15)' }}><span aria-hidden="true">{app.icon}</span>{imageSrc && <img src={imageSrc} alt={`${app.name} app icon`} onError={() => setSourceIndex(index => index + 1)} style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', background:'var(--signal)' }} />}{showFallback && <span className="sr-only">{`${app.name} logo unavailable`}</span>}</div>
}

function emptyForm() { return { productId:null, brandId:null, name:'', websiteUrl:'', category:'', description:'', offerText:'', audience:'', sourceFacts:{ socialLinks:emptySocialLinks() }, brandDna:{ voice:'', visualDirection:'', proofPoints:'', restrictedClaims:'' }, autopilot:{ ...defaultAutopilot, platforms:['instagram'], creativeMix:{ image:70, video:30 } } } }

import { runPortfolioAutopilotAcrossAllApps } from '../lib/monthlyAutopilot'

export default function Portfolio() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { apps: workspaceApps, workspaceId, refreshApps, setActiveApp, workspaceLoading, workspaceError } = useWorkspace()
  const apps = Array.isArray(workspaceApps) ? workspaceApps : []
  const connectProductId = searchParams.get('connectApp') || ''
  const [form, setForm] = useState(emptyForm())
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [learning, setLearning] = useState(false)
  const [learnError, setLearnError] = useState('')
  const [runningAutopilot, setRunningAutopilot] = useState(false)
  const [autopilotReport, setAutopilotReport] = useState(null)
  const [intelligenceRefresh, setIntelligenceRefresh] = useState({ running:false, progress:'', report:null })

  useEffect(() => { setLoading(false) }, [apps])

  const activeCount = useMemo(() => apps.filter(app => app.autopilot?.enabled).length, [apps])
  const portfolioLoading = workspaceLoading || loading
  const openCreate = () => { setForm(emptyForm()); setNotice(''); setOpen(true) }
  const openEdit = app => {
    setForm({ productId:app.id, brandId:app.brand_id, name:app.name || '', websiteUrl:app.product_url || '', category:app.category || '', description:app.description || '', offerText:app.offer_text || '', audience:app.audience || '', sourceFacts:{ ...(app.source_facts || {}), socialLinks:normalizeSocialLinks(app.source_facts?.socialLinks) }, brandDna:{ voice:app.brandDna?.voice || '', visualDirection:app.brandDna?.visualDirection || '', proofPoints:app.brandDna?.proofPoints || '', restrictedClaims:app.brandDna?.restrictedClaims || '' }, autopilot:{ ...defaultAutopilot, ...(app.autopilot || {}), platforms:app.autopilot?.platforms || ['instagram'], creativeMix:{ ...defaultAutopilot.creativeMix, ...(app.autopilot?.creativeMix || {}) } } })
    setNotice(''); setOpen(true)
  }
  const update = (key, value) => setForm(previous => ({ ...previous, [key]:value }))
  const updateDna = (key, value) => setForm(previous => ({ ...previous, brandDna:{ ...previous.brandDna, [key]:value } }))
  const updateAuto = (key, value) => setForm(previous => ({ ...previous, autopilot:{ ...previous.autopilot, [key]:value } }))
  const updateSocialLink = (platform, value) => setForm(previous => ({ ...previous, sourceFacts:{ ...previous.sourceFacts, socialLinks:{ ...normalizeSocialLinks(previous.sourceFacts?.socialLinks), [platform]:value } } }))
  const togglePlatform = platform => setForm(previous => ({ ...previous, autopilot:{ ...previous.autopilot, platforms:previous.autopilot.platforms.includes(platform) ? previous.autopilot.platforms.filter(item => item !== platform) : [...previous.autopilot.platforms, platform] } }))
  const learnAppWithAI = async () => {
    const url = form.websiteUrl.trim()
    if (!url) { setLearnError('Paste an Apple App Store, Google Play, or product URL first.'); return }
    setLearning(true); setLearnError(''); setNotice('')
    try {
      const response = await fetch('/api/ingest-product', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ url }) })
      const details = await response.json()
      if (!response.ok) throw new Error(details.error || 'FloStudio could not read that listing.')
      setForm(previous => ({ ...previous, websiteUrl:details.url || url, name:details.name || details.title || previous.name, category:details.category || previous.category, description:details.description || previous.description, offerText:details.offerText || previous.offerText, audience:details.audience || previous.audience, sourceFacts:{ ...(previous.sourceFacts || {}), ...(details.sourceFacts || {}), sourceType:details.sourceType, source:details.source, image:details.image, screenshots:details.sourceFacts?.screenshots || [], learnedAt:new Date().toISOString() }, brandDna:{ ...previous.brandDna, ...(details.brandDna || {}) } }))
      setNotice(`Flo learned ${details.name || details.title || 'this app'} from ${details.source || 'the public listing'}. Review the populated fields before saving.`)
    } catch (error) { setLearnError(error.message || 'FloStudio could not analyze that link.') }
    finally { setLearning(false) }
  }
  const save = async event => {
    event.preventDefault(); if (!form.name.trim()) return
    const invalidSocialPlatform = platforms.find(platform => {
      const value = form.sourceFacts?.socialLinks?.[platform]?.trim()
      return value && !safeExternalUrl(value)
    })
    if (invalidSocialPlatform) {
      setNotice(`Enter a complete http(s) URL for ${platformLabel[invalidSocialPlatform]}.`)
      return
    }
    setSaving(true); setNotice('')
    try {
      const workspace = workspaceId || await ensurePersonalWorkspace()
      const { data:{ user } } = await supabase.auth.getUser()
      await savePortfolioApp({ workspaceId:workspace, userId:user.id, ...form })
      await refreshApps(form.productId)
      setOpen(false)
      setNotice(form.productId ? 'Portfolio app updated.' : 'Portfolio app added. It is ready for a monthly campaign plan.')
    } catch (error) { setNotice(error.message || 'Could not save this portfolio app.') }
    finally { setSaving(false) }
  }
  const toggleAutopilot = async app => {
    try {
      await supabase.from('products').update({ source_facts:{ ...(app.source_facts || {}), category:app.category, autopilot:{ ...(app.autopilot || defaultAutopilot), enabled:!app.autopilot?.enabled } } }).eq('id', app.id)
      await refreshApps(app.id)
    } catch (error) { setNotice(error.message || 'Could not update autopilot.') }
  }

  const refreshAllStoreIntelligence = async () => {
    if (!apps.length) { setNotice('Add at least one app before refreshing store intelligence.'); return }
    setIntelligenceRefresh({ running:true, progress:'Preparing App Store refresh…', report:null })
    setNotice('')
    try {
      const report = await refreshPortfolioAppIntelligence({
        apps,
        onProgress:({ phase, app, completed, total }) => setIntelligenceRefresh(current => ({ ...current, progress:`${phase === 'public' ? 'Reading public listing' : 'Syncing App Store Connect'} for ${app.name} (${completed + 1}/${total})…` })),
      })
      await refreshApps()
      const publicRefreshes = report.filter(item => item.publicListing?.status === 'refreshed').length
      const privateRefreshes = report.filter(item => item.appStoreConnect?.status === 'refreshed').length
      const privateGaps = report.filter(item => item.appStoreConnect?.status === 'not_connected').length
      setIntelligenceRefresh({ running:false, progress:'', report })
      setNotice(`Store intelligence refreshed for ${publicRefreshes}/${report.length} public listings. ${privateRefreshes} App Store Connect feeds synced${privateGaps ? `; ${privateGaps} still need a secure connection` : ''}.`)
    } catch (error) {
      setIntelligenceRefresh(current => ({ ...current, running:false, progress:'', report:current.report }))
      setNotice(error.message || 'Store intelligence refresh could not complete.')
    }
  }

  const runAutopilotNow = async app => {
    setNotice(`Generating monthly autopilot plan for ${app.name}…`)
    try {
      const { data:{ user } } = await supabase.auth.getUser()
      const result = await runMonthlyAutopilotForApp({ userId:user.id, app })
      setNotice(`Successfully generated ${result.postsCount} scheduled posts for ${app.name}! Check Review Queue or Campaign Map.`)
    } catch (error) {
      setNotice(error.message || 'Could not run monthly autopilot.')
    }
  }

  if (portfolioLoading) return <Layout title="Portfolio"><div className="studio-panel" style={{ padding:30, margin:'28px 30px', color:'rgba(240,240,240,.65)' }}>Loading your secure portfolio workspace…</div></Layout>
  if (workspaceError) return <Layout title="Portfolio"><div className="studio-panel" style={{ padding:30, margin:'28px 30px', color:'rgba(240,240,240,.72)' }}><div className="studio-kicker" style={{ color:'var(--signal)' }}>WORKSPACE CONNECTION</div><p style={{ marginTop:8, lineHeight:1.55 }}>{workspaceError}</p><button type="button" onClick={() => window.location.reload()} className="studio-button" style={{ marginTop:14 }}>Retry portfolio workspace →</button></div></Layout>

  return <Layout title="Portfolio">
    <div className="portfolio-page" style={{ padding:'28px 30px 52px' }}>
      <section className="studio-dark abundance-hero" style={{ padding:'30px 32px', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'relative', zIndex:1, maxWidth:720 }}><div className="studio-kicker">PORTFOLIO CONTROL / YOUR WORKSPACE</div><h1 className="studio-display" style={{ color:'#ffffff', fontSize:'clamp(34px,4.2vw,62px)', marginTop:10 }}>Every app gets its own <span className="studio-serif" style={{ color:'var(--vermilion)' }}>growth system.</span></h1><p style={{ color:'rgba(240,240,240,.72)', maxWidth:610, fontSize:14, lineHeight:1.7, marginTop:13 }}>FloStudio never assumes which products, brands, or audiences belong here. Add your apps once, define the rules, and choose which ones should receive a monthly stream of image, video, and copy work.</p><div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:20 }}><button onClick={openCreate} className="studio-button">Add an app to the portfolio →</button><button onClick={async () => {
          if (!apps.length) { alert('Add at least one app to your portfolio first.'); return; }
          setRunningAutopilot(true); setNotice(''); setAutopilotReport(null);
          try {
            const { data:{ user } } = await supabase.auth.getUser();
            const report = await runPortfolioAutopilotAcrossAllApps({ userId: user.id, apps });
            setAutopilotReport(report);
            setNotice(`Portfolio Autopilot successfully scheduled ${report.totalPosts} total posts across ${report.totalApps} apps! Check Review Queue or Campaign Map.`);
          } catch(err) { setNotice(err.message || 'Portfolio autopilot failed.'); }
          finally { setRunningAutopilot(false); }
        }} disabled={runningAutopilot} className="studio-button" style={{ background:'var(--vermilion)', borderColor:'var(--vermilion)', color:'#ffffff' }}>{runningAutopilot ? 'Running Portfolio Autopilot…' : '⚡ Run Portfolio Autopilot across all apps'}</button><button onClick={refreshAllStoreIntelligence} disabled={intelligenceRefresh.running} className="studio-button studio-button--soft" style={{ borderColor:'rgba(223,223,223,.48)', color:'var(--signal)' }}>{intelligenceRefresh.running ? 'Refreshing App Store data…' : 'Refresh App Store intelligence →'}</button><button onClick={() => navigate('/images')} className="studio-button studio-button--soft" style={{ borderColor:'rgba(223,223,223,.48)', color:'var(--signal)' }}>Open new Creative Lab →</button><div className="studio-chip" style={{ color:'var(--signal)', borderColor:'rgba(223,223,223,.28)', background:'rgba(223,223,223,.08)' }}>{apps.length} app{apps.length === 1 ? '' : 's'} · {activeCount} autopilot</div></div></div><div className="abundance-orb abundance-orb--one"/><div className="abundance-orb abundance-orb--two"/></section>

      {intelligenceRefresh.running && <section className="studio-panel" style={{ marginTop:16, padding:16, borderColor:'rgba(223,223,223,.3)' }}><div className="studio-kicker" style={{ color:'var(--signal)' }}>APP INTELLIGENCE REFRESH</div><p style={{ color:'#ffffff', marginTop:6 }}>{intelligenceRefresh.progress}</p></section>}
      {intelligenceRefresh.report && <section className="studio-panel" style={{ marginTop:16, padding:18, borderColor:'rgba(223,223,223,.24)' }}><div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'start' }}><div><div className="studio-kicker" style={{ color:'var(--signal)' }}>STORE INTELLIGENCE COVERAGE</div><h2 style={{ color:'#ffffff', fontSize:20, marginTop:5 }}>Latest refresh by app.</h2></div><button onClick={() => setIntelligenceRefresh(current => ({ ...current, report:null }))} className="studio-chip">Dismiss</button></div><div style={{ display:'grid', gridTemplateColumns:'repeat(2,minmax(0,1fr))', gap:10, marginTop:14 }}>{intelligenceRefresh.report.map(item => <article key={item.appId} style={{ padding:11, border:'1px solid rgba(240,240,240,.12)', background:'rgba(21,21,21,.32)' }}><b style={{ color:'#ffffff', fontSize:12 }}>{item.name}</b><p style={{ color:item.publicListing?.status === 'refreshed' ? 'var(--signal)' : 'rgba(240,240,240,.58)', fontSize:10.5, marginTop:5 }}>Public listing: {item.publicListing?.status === 'refreshed' ? `${item.publicListing.screenshotCount} screenshots · artwork ${item.publicListing.hasArtwork ? 'found' : 'not returned'}` : item.publicListing?.reason || 'not refreshed'}</p><p style={{ color:item.appStoreConnect?.status === 'refreshed' ? 'var(--signal)' : 'rgba(240,240,240,.58)', fontSize:10.5, marginTop:3 }}>App Store Connect: {item.appStoreConnect?.status === 'refreshed' ? 'synced' : item.appStoreConnect?.status === 'not_connected' ? 'secure key not connected' : 'not available'}</p>{item.errors?.length > 0 && <p style={{ color:'#c5c5c5', fontSize:10, lineHeight:1.4, marginTop:5 }}>{item.errors.join(' · ')}</p>}</article>)}</div></section>}

      {autopilotReport && <section className="studio-panel" style={{ marginTop:16, padding:20, borderColor:'var(--signal)', background:'rgba(223,223,223,.06)' }}><div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}><div className="studio-kicker" style={{ color:'var(--signal)' }}>PORTFOLIO AUTOPILOT EXECUTION REPORT</div><button onClick={() => setAutopilotReport(null)} className="studio-chip">Dismiss</button></div><h3 style={{ color:'#ffffff', fontSize:18, marginTop:6 }}>Successfully synchronized {autopilotReport.totalPosts} posts across {autopilotReport.totalApps} portfolio products.</h3><div style={{ display:'grid', gridTemplateColumns:'repeat(2,minmax(0,1fr))', gap:10, marginTop:12 }}>{autopilotReport.results.map(r => <div key={r.appId} style={{ padding:10, background:'rgba(16,16,16,.4)', border:'1px solid rgba(240,240,240,.12)', borderRadius:3, color:'#ffffff', fontSize:12 }}><b>{r.name}</b>: {r.success ? `${r.postsCount} posts queued for review` : `Error: ${r.error}`}</div>)}</div></section>}

      <section style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginTop:16 }}><div className="studio-panel" style={{ padding:18 }}><div className="studio-kicker">PORTFOLIO SIZE</div><div style={{ color:'#ffffff', fontSize:30, fontWeight:850, marginTop:7 }}>{apps.length}</div><div style={{ color:'rgba(240,240,240,.52)', fontSize:11, marginTop:4 }}>user-owned products</div></div><div className="studio-panel" style={{ padding:18 }}><div className="studio-kicker">MONTHLY AUTOPILOT</div><div style={{ color:'var(--signal)', fontSize:30, fontWeight:850, marginTop:7 }}>{activeCount}</div><div style={{ color:'rgba(240,240,240,.52)', fontSize:11, marginTop:4 }}>apps configured to generate</div></div><div className="studio-panel" style={{ padding:18 }}><div className="studio-kicker" style={{ color:'var(--vermilion)' }}>TENANT MODE</div><div style={{ color:'#ffffff', fontSize:18, fontWeight:850, marginTop:13 }}>Private workspace</div><div style={{ color:'rgba(240,240,240,.52)', fontSize:11, marginTop:4 }}>your data stays yours</div></div></section>

      <section className="studio-panel" style={{ marginTop:16, padding:'18px 20px', display:'grid', gridTemplateColumns:'minmax(0,1fr) auto', gap:18, alignItems:'center', borderColor:'rgba(223,223,223,.34)', background:'linear-gradient(100deg,rgba(223,223,223,.12),rgba(132,132,132,.08))' }}><div><div className="studio-kicker" style={{ color:'var(--signal)' }}>NEW / PORTFOLIO AD ROOM</div><h2 style={{ color:'#ffffff', fontSize:21, letterSpacing:'-.055em', marginTop:5 }}>Create a real campaign visual before your portfolio is full.</h2><p style={{ color:'rgba(240,240,240,.68)', fontSize:12, lineHeight:1.55, marginTop:6, maxWidth:720 }}>The Creative Lab now starts from a proven ad format, campaign objective, and visual lens. Upload a product reference or add an app to make every image product-aware, then send the result to Review Queue.</p></div><button onClick={() => navigate('/images')} className="studio-button" style={{ whiteSpace:'nowrap' }}>Build an ad →</button></section>

      <AppStoreConnectPanel apps={apps} initialProductId={connectProductId} />

      <section style={{ marginTop:30 }}><div style={{ display:'flex', justifyContent:'space-between', alignItems:'end', gap:12, marginBottom:12 }}><div><div className="studio-kicker" style={{ color:'var(--vermilion)' }}>YOUR PRODUCTS</div><h2 style={{ color:'#ffffff', fontSize:24, letterSpacing:'-.05em', marginTop:5 }}>The portfolio, without the hard-coding.</h2></div><button onClick={openCreate} className="studio-button studio-button--soft">+ Add app</button></div>{portfolioLoading ? <div className="studio-panel" style={{ padding:30, color:'rgba(255,255,255,.65)' }}>Loading your workspace…</div> : apps.length === 0 ? <div className="studio-panel" style={{ padding:34, borderStyle:'dashed', textAlign:'center' }}><div style={{ width:56, height:56, borderRadius:3, margin:'0 auto 15px', background:'var(--signal)', display:'grid', placeItems:'center', color:'var(--ink-deep)', fontSize:24, fontWeight:900, boxShadow:'4px 4px 0 var(--vermilion)' }}>+</div><h3 style={{ color:'#ffffff', fontSize:20, margin:0 }}>Your portfolio starts here.</h3><p style={{ color:'rgba(240,240,240,.6)', fontSize:12.5, lineHeight:1.6, maxWidth:430, margin:'10px auto 18px' }}>Add the first app, URL, screenshots, audience, and brand rules. FloStudio will use only the data you provide.</p><button onClick={openCreate} className="studio-button">Add your first app →</button></div> : <div style={{ display:'grid', gridTemplateColumns:'repeat(2,minmax(0,1fr))', gap:14 }}>{apps.map(app => <article key={app.id} className="studio-panel" style={{ padding:20, position:'relative', overflow:'hidden', borderLeft:`4px solid ${app.accentColor || 'var(--signal)'}` }}><div style={{ display:'flex', justifyContent:'space-between', alignItems:'start', gap:12 }}><div style={{ display:'flex', gap:11, alignItems:'center' }}><PortfolioAppIcon app={app} /><div><div style={{ color:'#ffffff', fontWeight:850, fontSize:16 }}>{app.name}</div><div style={{ color:app.accentColor || 'var(--moss)', fontSize:10.5, marginTop:3, fontWeight:600 }}>{app.category}</div></div></div><button onClick={() => toggleAutopilot(app)} className="studio-chip" style={{ color:app.autopilot?.enabled ? 'var(--signal)':'rgba(240,240,240,.65)', borderColor:app.autopilot?.enabled ? 'rgba(223,223,223,.34)':'rgba(240,240,240,.14)', background:app.autopilot?.enabled ? 'rgba(223,223,223,.09)':'rgba(240,240,240,.04)' }}>{app.autopilot?.enabled ? 'AUTOPILOT ON':'AUTOPILOT OFF'}</button></div><p style={{ color:'rgba(240,240,240,.66)', fontSize:12, lineHeight:1.55, minHeight:38, margin:'16px 0 13px' }}>{app.description || 'Add the product story FloStudio should use to create relevant marketing.'}</p>{app.sourceFacts?.storeMetadata?.appStoreId && <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}><span className="studio-chip" style={{ fontSize:9, color:'var(--signal)' }}>APP STORE</span>{app.sourceFacts.storeMetadata.version && <span className="studio-chip" style={{ fontSize:9, color:'rgba(240,240,240,.7)' }}>v{app.sourceFacts.storeMetadata.version}</span>}{app.sourceFacts.storeMetadata.rating != null && <span className="studio-chip" style={{ fontSize:9, color:'rgba(240,240,240,.7)' }}>{Number(app.sourceFacts.storeMetadata.rating).toFixed(1)} ★ · {Number(app.sourceFacts.storeMetadata.ratingCount || 0).toLocaleString()}</span>}<span className="studio-chip" style={{ fontSize:9, color:'rgba(240,240,240,.7)' }}>{app.sourceFacts.storeMetadata.screenshots?.length || 0} screenshots</span></div>}<div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>{(app.autopilot?.platforms || ['instagram']).map(platform => <span key={platform} className="studio-chip" style={{ fontSize:9, color:'var(--teal)' }}>{platformLabel[platform]}</span>)}<span className="studio-chip" style={{ fontSize:9, color:'var(--vermilion)' }}>{app.autopilot?.cadence || 20} posts / month</span></div><>{socialLinksForApp(app).length > 0 && <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center', marginTop:13 }}><span style={{ color:'rgba(240,240,240,.45)', fontSize:10 }}>Quick links</span>{socialLinksForApp(app).map(({ platform, url }) => <a key={platform} href={url} target="_blank" rel="noreferrer" className="studio-chip" style={{ fontSize:9, color:'var(--signal)', textDecoration:'none' }}>{platformLabel[platform]} ↗</a>)}</div>}</><div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:18, paddingTop:12, borderTop:'1px solid rgba(240,240,240,.1)' }}><span style={{ color:'rgba(240,240,240,.45)', fontSize:10 }}>Image {app.autopilot?.creativeMix?.image || 70}% · Video {app.autopilot?.creativeMix?.video || 30}%</span><div style={{ display:'flex', gap:6, flexWrap:'wrap', justifyContent:'flex-end' }}><button onClick={() => { setActiveApp(app); navigate(`/seo?app=${encodeURIComponent(app.id)}`) }} className="studio-button studio-button--soft" style={{ padding:'8px 12px', fontSize:10 }}>SEO plan</button><button onClick={() => runAutopilotNow(app)} className="studio-button" style={{ padding:'8px 12px', fontSize:10 }}>Run Month Plan</button><button onClick={() => openEdit(app)} className="studio-button studio-button--soft" style={{ padding:'8px 12px', fontSize:10 }}>Edit</button></div></div>
</article>)}</div>}</section>

      {notice && <div style={{ marginTop:16, padding:12, borderRadius:12, background:'rgba(197,197,197,.1)', border:'1px solid rgba(197,197,197,.24)', color:'#e9e9e9', fontSize:12 }}>{notice}</div>}
    </div>

    {open && <div role="dialog" aria-modal="true" style={{ position:'fixed', inset:0, zIndex:100, background:'rgba(4,4,4,.72)', backdropFilter:'blur(14px)', display:'grid', placeItems:'center', padding:20 }}><form onSubmit={save} className="studio-dark" style={{ width:'min(760px,100%)', maxHeight:'90vh', overflow:'auto', padding:26, border:'1px solid rgba(226,226,226,.22)' }}><div style={{ display:'flex', justifyContent:'space-between', alignItems:'start', gap:14 }}><div><div className="studio-kicker" style={{ color:'#ededed' }}>{form.productId ? 'EDIT PORTFOLIO APP':'ADD PORTFOLIO APP'}</div><h2 style={{ color:'#ffffff', fontSize:28, letterSpacing:'-.055em', marginTop:6 }}>{form.productId ? 'Refine its growth rules.':'Bring a product into FloStudio.'}</h2></div><button type="button" onClick={() => setOpen(false)} className="flo-drawer-close" aria-label="Close">×</button></div><div style={{ display:'grid', gap:14, marginTop:22 }}><section style={{ padding:16, borderRadius:16, border:'1px solid rgba(226,226,226,.28)', background:'linear-gradient(135deg,rgba(114,114,114,.18),rgba(192,192,192,.08))' }}><div className="studio-kicker" style={{ color:'#ededed' }}>URL-FIRST AI INTAKE</div><div style={{ color:'#ffffff', fontSize:16, fontWeight:800, marginTop:6 }}>Start with the app listing.</div><div style={{ color:'rgba(242,242,242,.64)', fontSize:11.5, lineHeight:1.55, marginTop:5 }}>Paste an Apple App Store, Google Play, or product link. Flo will read the public listing, build the product profile and Brand DNA, then leave every field editable for your approval.</div><div style={{ display:'flex', gap:8, alignItems:'stretch', marginTop:12 }}><input value={form.websiteUrl} onChange={e => { update('websiteUrl',e.target.value); setLearnError('') }} placeholder="https://apps.apple.com/us/app/your-app/id123456789" style={{ flex:1, minWidth:0 }} /><button type="button" onClick={learnAppWithAI} disabled={learning} className="studio-button" style={{ whiteSpace:'nowrap', opacity:learning ? .7 : 1 }}>{learning ? 'Learning…' : 'Learn App with AI'}</button></div>{learnError && <div style={{ color:'#c5c5c5', fontSize:11, lineHeight:1.45, marginTop:9 }}>{learnError}</div>}{form.sourceFacts?.provider && <div style={{ color:'#e9e9e9', fontSize:10.5, marginTop:9 }}>Profile learned from {form.sourceFacts.provider}. Review the fields below before saving.</div>}</section><label className="portfolio-field"><span>App or product name</span><input required value={form.name} onChange={e => update('name',e.target.value)} placeholder="Your product name" /></label><label className="portfolio-field"><span>Category</span><input value={form.category} onChange={e => update('category',e.target.value)} placeholder="Finance, education, fitness…" /></label><label className="portfolio-field"><span>What does it help people do?</span><textarea rows={3} value={form.description} onChange={e => update('description',e.target.value)} placeholder="Plain-language product story and customer outcome" /></label><div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}><label className="portfolio-field"><span>Offer or CTA</span><input value={form.offerText} onChange={e => update('offerText',e.target.value)} placeholder="Download free, start a trial…" /></label><label className="portfolio-field"><span>Primary audience</span><input value={form.audience} onChange={e => update('audience',e.target.value)} placeholder="Who should care?" /></label></div><div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}><label className="portfolio-field"><span>Brand voice</span><input value={form.brandDna.voice} onChange={e => updateDna('voice',e.target.value)} placeholder="Direct, warm, credible…" /></label><label className="portfolio-field"><span>Visual direction</span><input value={form.brandDna.visualDirection} onChange={e => updateDna('visualDirection',e.target.value)} placeholder="Cinematic, bright, editorial…" /></label></div><label className="portfolio-field"><span>Approved proof points and claims to respect</span><textarea rows={3} value={form.brandDna.proofPoints} onChange={e => updateDna('proofPoints',e.target.value)} placeholder="Facts, testimonials, differentiators, pricing, restrictions" /></label><label className="portfolio-field"><span>Claims to avoid</span><textarea rows={2} value={form.brandDna.restrictedClaims} onChange={e => updateDna('restrictedClaims',e.target.value)} placeholder="Unsupported guarantees, prohibited claims, or compliance notes" /></label><section className="portfolio-autopilot" style={{ marginTop:14 }}><div className="studio-kicker" style={{ color:'#c9c9c9' }}>SOCIAL DESTINATIONS</div><div style={{ color:'rgba(242,242,242,.64)', fontSize:11.5, lineHeight:1.55, marginTop:5 }}>Save each app’s profile or post destination. FloStudio shows quick links on the portfolio card so you can open the right channel immediately.</div><div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:12 }}>{platforms.map(platform => <label className="portfolio-field" key={platform}><span>{platformLabel[platform]} URL</span><input type="url" value={form.sourceFacts?.socialLinks?.[platform] || ''} onChange={e => updateSocialLink(platform,e.target.value)} placeholder={`https://www.${platform === 'twitter' ? 'x.com' : platform + '.com'}/your-handle`} /></label>)}</div></section><div className="portfolio-autopilot" style={{ marginTop:14 }}><div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}><div className="studio-kicker" style={{ color:'#c9c9c9' }}>APP STORE CONNECT METRICS CONNECTION</div><button type="button" onClick={async () => {
    try {
      const res = await fetch('/api/sync-asc', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(form.sourceFacts) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Connection test failed');
      setForm(p => ({ ...p, sourceFacts:{ ...p.sourceFacts, ascStatus:'Connected', ascMetrics:data.metrics, ascSyncedAt:new Date().toISOString() } }));
      alert('Successfully connected to App Store Connect! Live metrics synced.');
    } catch(err) { alert('App Store Connect error: ' + err.message); }
  }} className="studio-button" style={{ padding:'6px 10px', fontSize:10, background:'#c9c9c9', color:'#060606' }}>Test & Sync Now</button></div><div style={{ color:'rgba(242,242,242,.64)', fontSize:11.5, lineHeight:1.55, marginTop:5 }}>Connect your App Store Connect API keys so FloStudio can pull first-party downloads, proceeds, active subscriptions, and review ratings for this app.</div><div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:12 }}><label className="portfolio-field"><span>App Store Issuer ID</span><input value={form.sourceFacts?.ascIssuerId || ''} onChange={e => setForm(p => ({ ...p, sourceFacts:{ ...p.sourceFacts, ascIssuerId:e.target.value } }))} placeholder="xxxxxxxx-xxxx-xxxx..." /></label><label className="portfolio-field"><span>App Store Key ID</span><input value={form.sourceFacts?.ascKeyId || ''} onChange={e => setForm(p => ({ ...p, sourceFacts:{ ...p.sourceFacts, ascKeyId:e.target.value } }))} placeholder="ABC123XYZ" /></label></div><label className="portfolio-field" style={{ marginTop:10 }}><span>App Store Private Key (.p8 or JWT Secret)</span><input type="password" value={form.sourceFacts?.ascPrivateKey || ''} onChange={e => setForm(p => ({ ...p, sourceFacts:{ ...p.sourceFacts, ascPrivateKey:e.target.value } }))} placeholder="-----BEGIN PRIVATE KEY----- ..." /></label>{form.sourceFacts?.ascStatus === 'Connected' && <div style={{ marginTop:10, padding:10, borderRadius:8, background:'rgba(201,201,201,.1)', border:'1px solid rgba(201,201,201,.3)', color:'#c9c9c9', fontSize:11 }}>Connected! Last synced downloads: {form.sourceFacts.ascMetrics?.downloadsLast30Days || 0} (30d) · Est. Proceeds: ${form.sourceFacts.ascMetrics?.proceedsEstimatedUsd || 0}</div>}</div><div className="portfolio-autopilot" style={{ marginTop:14 }}><div className="studio-kicker" style={{ color:'#c0c0c0' }}>MONTHLY AUTOPILOT RULES</div><div className="portfolio-switch-row"><span><b>Enable recurring monthly plan</b><small>Flo creates the plan; you choose review or approved automation.</small></span><button type="button" onClick={() => updateAuto('enabled',!form.autopilot.enabled)} className={`portfolio-switch ${form.autopilot.enabled ? 'on':''}`} aria-label="Toggle monthly autopilot"><span/></button></div><div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:14 }}><label className="portfolio-field"><span>Posts per month</span><select value={form.autopilot.cadence} onChange={e => updateAuto('cadence',Number(e.target.value))}><option value={8}>8 posts</option><option value={12}>12 posts</option><option value={20}>20 posts</option><option value={30}>30 posts</option><option value={60}>60 posts</option></select></label><label className="portfolio-field"><span>Approval mode</span><select value={form.autopilot.approvalMode} onChange={e => updateAuto('approvalMode',e.target.value)}><option value="review">Review every post</option><option value="approved">Auto-publish approved rules</option></select></label></div><div style={{ marginTop:14 }}><span style={{ color:'rgba(242,242,242,.66)', fontSize:11 }}>Publish to</span><div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:8 }}>{platforms.map(platform => <button type="button" key={platform} onClick={() => togglePlatform(platform)} className="studio-chip" style={{ color:form.autopilot.platforms.includes(platform) ? '#ffffff':'rgba(242,242,242,.43)', borderColor:form.autopilot.platforms.includes(platform) ? '#909090':'rgba(255,255,255,.13)', background:form.autopilot.platforms.includes(platform) ? 'rgba(114,114,114,.26)':'rgba(255,255,255,.03)' }}>{platformLabel[platform]}</button>)}</div></div><div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:14 }}><label className="portfolio-field"><span>Image share %</span><input type="number" min="0" max="100" value={form.autopilot.creativeMix.image} onChange={e => updateAuto('creativeMix',{ ...form.autopilot.creativeMix, image:Number(e.target.value), video:100-Number(e.target.value) })} /></label><label className="portfolio-field"><span>Video share %</span><input type="number" min="0" max="100" value={form.autopilot.creativeMix.video} onChange={e => updateAuto('creativeMix',{ ...form.autopilot.creativeMix, video:Number(e.target.value), image:100-Number(e.target.value) })} /></label></div></div></div><div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:22 }}><button type="button" onClick={() => setOpen(false)} className="studio-button studio-button--soft">Cancel</button><button disabled={saving} className="studio-button">{saving ? 'Saving…':'Save portfolio app →'}</button></div></form></div>}
  </Layout>
}
