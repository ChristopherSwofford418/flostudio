import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import { useWorkspace } from '../context/WorkspaceContext'
import { generateAppSeoBlueprint, seoBriefToText } from '../lib/portfolioSeo'
import { listMediaAssets } from '../lib/mediaAssets'
import { SEO_ACTION_META, buildSeoActions, createSeoActionTask, formatSeoActionTime, listSeoActionTasks, setSeoActionTaskStatus } from '../lib/seoActions'

function DraftCard({ label, value, note, accent = false }) {
  return <article style={{ padding:14, border:'1px solid rgba(240,240,240,.12)', background:accent ? 'linear-gradient(145deg,rgba(120,113,255,.17),rgba(22,22,36,.54))' : 'rgba(18,18,18,.3)', borderRadius:12, minWidth:0 }}><div className="studio-kicker" style={{ color:accent ? '#cbc8ff' : 'rgba(240,240,240,.52)' }}>{label}</div><p style={{ color:'#fff', fontSize:13, fontWeight:750, lineHeight:1.55, marginTop:7, overflowWrap:'anywhere' }}>{value || 'Add more product context to draft this safely.'}</p>{note && <p style={{ color:'rgba(240,240,240,.55)', fontSize:10.5, lineHeight:1.5, marginTop:8 }}>{note}</p>}</article>
}

function StatusCard({ item }) {
  return <div style={{ display:'flex', gap:10, padding:'10px 0', borderBottom:'1px solid rgba(240,240,240,.09)' }}><span style={{ width:8, height:8, marginTop:5, borderRadius:'50%', background:item.ready ? '#7ee1c5' : '#c6c4da', boxShadow:item.ready ? '0 0 0 4px rgba(126,225,197,.1)' : 'none', flex:'0 0 auto' }} /><div><b style={{ color:'#fff', fontSize:11.5 }}>{item.label}</b><p style={{ color:'rgba(240,240,240,.56)', fontSize:10.5, lineHeight:1.45, marginTop:3 }}>{item.detail}</p></div></div>
}

function SourcePreview({ src, alt, label }) {
  return <div style={{ width:132, flex:'0 0 auto' }}><div style={{ height:92, borderRadius:10, overflow:'hidden', background:'#111427', border:'1px solid rgba(240,240,240,.14)' }}><img src={src} alt={alt} style={{ width:'100%', height:'100%', objectFit:'cover' }} /></div><p style={{ color:'rgba(240,240,240,.56)', fontSize:9.5, lineHeight:1.35, marginTop:5 }}>{label}</p></div>
}

function safeFallbackBlueprint(app = {}) {
  const name = String(app?.name || 'Selected app')
  const category = String(app?.category || app?.sourceFacts?.category || app?.source_facts?.category || 'mobile')
  const description = String(app?.description || 'Add a saved product description before drafting this section.')
  const sourceFacts = app?.sourceFacts || app?.source_facts || {}
  return {
    website:{ landingSlug:'/', metaTitle:`${name} | ${category} app`, metaDescription:description, h1:name, keywordThemes:[], internalLinks:[], faqs:[] },
    appStore:{ currentTitle:name, titleCharacterCount:name.length, currentSubtitle:'', subtitleDraft:'', subtitleCharacterCount:0, candidateKeywordString:'', keywordCharacterCount:0, promotionalText:'', promotionalCharacterCount:0, screenshotPlan:[] },
    experiments:[],
    readiness:[{ label:'Product source data', ready:false, detail:'A legacy source field needs review before FloStudio can create the full SEO plan.' }],
    sources:{ listingUrl:String(app?.product_url || ''), screenshots:[], artwork:'' },
    sourceCoverage:{ publicListing:Boolean(app?.product_url), screenshots:0 },
  }
}

export default function SEO() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { apps, activeApp, setActiveApp, workspaceId } = useWorkspace()
  const safeApps = Array.isArray(apps) ? apps : []
  const requestedId = searchParams.get('app') || ''
  const [selectedId, setSelectedId] = useState(requestedId || activeApp?.id || '')
  const [creativeAssets, setCreativeAssets] = useState([])
  const [assetError, setAssetError] = useState('')
  const [copied, setCopied] = useState(false)
  const [actionTasks, setActionTasks] = useState([])
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')
  const [actionNotice, setActionNotice] = useState('')
  const [actionPending, setActionPending] = useState('')

  useEffect(() => {
    if (!safeApps.length) return
    const requested = safeApps.find(app => app.id === requestedId)
    const current = safeApps.find(app => app.id === selectedId)
    const fallback = requested || current || safeApps.find(app => app.id === activeApp?.id) || safeApps[0]
    if (fallback?.id && fallback.id !== selectedId) setSelectedId(fallback.id)
  }, [safeApps, requestedId, selectedId, activeApp?.id])

  const selectApp = id => {
    const next = safeApps.find(app => app.id === id)
    if (!next) return
    setSelectedId(id)
    setActiveApp(next)
    setSearchParams({ app:id })
    setCopied(false)
  }

  const app = useMemo(() => safeApps.find(item => item.id === selectedId) || safeApps[0] || null, [safeApps, selectedId])
  const planState = useMemo(() => {
    if (!app) return { blueprint:null, error:'' }
    try { return { blueprint:generateAppSeoBlueprint(app), error:'' } }
    catch (error) { return { blueprint:safeFallbackBlueprint(app), error:error?.message || 'A saved source field could not be parsed.' } }
  }, [app])
  const blueprint = planState.blueprint
  const plannerError = planState.error
  const readyCreative = useMemo(() => creativeAssets.filter(asset => asset?.asset_url && !['failed','queued','in_progress'].includes(asset.render_status)), [creativeAssets])
  const seoActions = useMemo(() => buildSeoActions({ app, blueprint, readyCreative }), [app, blueprint, readyCreative])

  useEffect(() => {
    let cancelled = false
    if (!app?.id) { setCreativeAssets([]); return undefined }
    setAssetError('')
    listMediaAssets(app.id).then(items => {
      if (!cancelled) setCreativeAssets(items || [])
    }).catch(error => {
      if (!cancelled) { setCreativeAssets([]); setAssetError(error?.message || 'Creative Lab assets could not be loaded.') }
    })
    return () => { cancelled = true }
  }, [app?.id])

  useEffect(() => {
    let cancelled = false
    if (!app?.id) { setActionTasks([]); return undefined }
    setActionLoading(true)
    setActionError('')
    listSeoActionTasks(app.id).then(items => {
      if (!cancelled) setActionTasks(items)
    }).catch(error => {
      if (!cancelled) { setActionTasks([]); setActionError(error?.message || 'SEO action history could not be loaded.') }
    }).finally(() => { if (!cancelled) setActionLoading(false) })
    return () => { cancelled = true }
  }, [app?.id])

  const queueSeoAction = async action => {
    if (!app?.id || actionPending) return
    setActionPending(action.type)
    setActionError('')
    setActionNotice('')
    try {
      const task = await createSeoActionTask({ workspaceId, productId:app.id, action })
      setActionTasks(current => [task, ...current])
      setActionNotice(`${SEO_ACTION_META[action.type]?.label || 'SEO action'} is now in ${app.name}'s review queue.`)
    } catch (error) {
      setActionError(error?.message || 'FloStudio could not create this SEO action.')
    } finally { setActionPending('') }
  }

  const updateSeoAction = async (task, status) => {
    if (!task?.id || actionPending) return
    setActionPending(task.id)
    setActionError('')
    try {
      const updated = await setSeoActionTaskStatus(task.id, status)
      setActionTasks(current => current.map(item => item.id === updated.id ? updated : item))
      setActionNotice(status === 'completed' ? 'SEO action marked complete. No external publishing was triggered.' : 'SEO action reopened for review.')
    } catch (error) {
      setActionError(error?.message || 'FloStudio could not update this SEO action.')
    } finally { setActionPending('') }
  }

  const copyBrief = async () => {
    if (!blueprint) return
    try {
      await navigator.clipboard.writeText(seoBriefToText(blueprint))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2200)
    } catch {
      setCopied(false)
    }
  }

  if (!app || !blueprint) return <Layout title="SEO & ASO"><div className="studio-panel" style={{ padding:30, margin:'28px 30px', color:'rgba(240,240,240,.65)' }}>Add a portfolio app before creating an SEO plan.</div></Layout>

  const website = blueprint.website || {}
  const appStore = blueprint.appStore || {}
  const experiments = Array.isArray(blueprint.experiments) ? blueprint.experiments : []
  const readiness = Array.isArray(blueprint.readiness) ? blueprint.readiness : []
  const sources = blueprint.sources || {}
  const sourceCoverage = blueprint.sourceCoverage || {}
  const keywordThemes = Array.isArray(website.keywordThemes) ? website.keywordThemes : []
  const screenshotPlan = Array.isArray(appStore.screenshotPlan) ? appStore.screenshotPlan : []
  const internalLinks = Array.isArray(website.internalLinks) ? website.internalLinks : []
  const faqs = Array.isArray(website.faqs) ? website.faqs : []
  const currentSubtitle = appStore.currentSubtitle || 'No stored subtitle was returned from the selected app listing.'

  return <Layout title="SEO & ASO">
    <style>{`
      .seo-page { padding:28px 30px 54px; }
      .seo-hero-grid { display:grid; grid-template-columns:minmax(0,1.2fr) minmax(270px,.8fr); gap:20px; align-items:end; }
      .seo-grid-2 { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
      .seo-grid-3 { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
      .seo-rail { display:flex; gap:10px; overflow-x:auto; padding:3px 2px 7px; scrollbar-width:thin; scrollbar-color:rgba(203,200,255,.65) transparent; }
      .seo-action-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; }
      .seo-action-card { min-width:0; padding:14px; border:1px solid rgba(240,240,240,.12); border-radius:13px; background:linear-gradient(145deg,rgba(104,96,255,.12),rgba(16,16,27,.48)); }
      .seo-task-row { display:flex; justify-content:space-between; gap:12px; align-items:center; padding:11px 0; border-bottom:1px solid rgba(240,240,240,.09); }
      @media (max-width:1080px) { .seo-action-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
      @media (max-width:960px) { .seo-hero-grid, .seo-grid-2 { grid-template-columns:1fr; } .seo-grid-3 { grid-template-columns:repeat(2,minmax(0,1fr)); } }
      @media (max-width:600px) { .seo-page { padding:20px 16px 42px; } .seo-grid-3, .seo-action-grid { grid-template-columns:1fr; } .seo-task-row { align-items:flex-start; flex-direction:column; } }
    `}</style>
    <div className="seo-page">
      <section className="studio-dark abundance-hero" style={{ padding:'30px 32px', position:'relative', overflow:'hidden' }}>
        <div className="seo-hero-grid" style={{ position:'relative', zIndex:1 }}><div><div className="studio-kicker">DISCOVERABILITY DESK / SEO + ASO</div><h1 className="studio-display" style={{ color:'#fff', fontSize:'clamp(34px,4.1vw,60px)', marginTop:9 }}>Make every app <span className="studio-serif" style={{ color:'var(--signal)' }}>findable on purpose.</span></h1><p style={{ color:'rgba(240,240,240,.7)', fontSize:13, lineHeight:1.7, marginTop:12, maxWidth:690 }}>Build a review-ready website SEO and App Store discovery plan from the selected app’s real product facts, public listing, screenshots, and Creative Lab assets. No fabricated rankings, search volume, customer proof, or automatic publishing.</p><div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:18 }}><button onClick={copyBrief} className="studio-button">{copied ? 'SEO brief copied' : 'Copy SEO review brief →'}</button><button onClick={() => navigate(`/insights?app=${encodeURIComponent(app.id)}`)} className="studio-button studio-button--soft">Open App Insights →</button><a href="https://developers.google.com/search/docs/fundamentals/seo-starter-guide" target="_blank" rel="noreferrer" className="studio-chip" style={{ color:'var(--signal)', textDecoration:'none', alignSelf:'center' }}>Research basis ↗</a></div></div><label className="portfolio-field" style={{ display:'grid', gap:7, minWidth:0 }}><span style={{ color:'rgba(240,240,240,.72)' }}>Active portfolio app</span><select value={app.id} onChange={event => selectApp(event.target.value)}>{safeApps.map(item => <option key={item.id} value={item.id}>{item.name} · {item.category || 'Uncategorized'}</option>)}</select><p style={{ color:'rgba(240,240,240,.54)', fontSize:10.5, lineHeight:1.45 }}>Changing apps refreshes every draft, keyword ledger, visual plan, and readiness check below.</p></label></div><div className="abundance-orb abundance-orb--one"/><div className="abundance-orb abundance-orb--two"/></section>

      {plannerError && <section className="studio-panel" style={{ marginTop:16, padding:14, borderColor:'rgba(215,211,255,.42)', background:'rgba(104,96,255,.1)', color:'rgba(240,240,240,.72)', fontSize:11.5, lineHeight:1.55 }}>FloStudio kept this SEO view safe because one nested legacy source field could not be parsed. The selected app, current listing link, and readiness checklist remain available; update the app’s saved context in Portfolio to restore the full planning draft.</section>}
      <section className="studio-panel" style={{ marginTop:16, padding:'16px 19px', borderColor:'rgba(197,197,197,.28)' }}><div style={{ display:'flex', justifyContent:'space-between', gap:14, alignItems:'start', flexWrap:'wrap' }}><div><div className="studio-kicker" style={{ color:'var(--signal)' }}>SELECTED APP / {app.category || 'UNCLASSIFIED'}</div><h2 style={{ color:'#fff', fontSize:23, marginTop:5 }}>{app.name} SEO and App Store plan</h2><p style={{ color:'rgba(240,240,240,.58)', fontSize:11.5, marginTop:5, lineHeight:1.55 }}>This plan stays review-only. Apply website changes in your web stack and App Store metadata changes in App Store Connect after an owner review.</p></div><div style={{ display:'flex', gap:7, flexWrap:'wrap' }}><span className="studio-chip" style={{ color:sourceCoverage.publicListing ? 'var(--signal)' : 'rgba(240,240,240,.58)' }}>{sourceCoverage.publicListing ? 'PUBLIC LISTING LINKED' : 'LISTING URL NEEDED'}</span><span className="studio-chip" style={{ color:sourceCoverage.screenshots ? 'var(--signal)' : 'rgba(240,240,240,.58)' }}>{sourceCoverage.screenshots} SCREENSHOT{sourceCoverage.screenshots === 1 ? '' : 'S'}</span><span className="studio-chip" style={{ color:readyCreative.length ? 'var(--signal)' : 'rgba(240,240,240,.58)' }}>{readyCreative.length} LAB ASSET{readyCreative.length === 1 ? '' : 'S'}</span></div></div><div style={{ display:'grid', gridTemplateColumns:'repeat(3,minmax(0,1fr))', gap:8, marginTop:16 }}><div style={{ borderTop:'2px solid var(--signal)', paddingTop:8 }}><b style={{ color:'#fff', fontSize:11 }}>01 / GROUND</b><p style={{ color:'rgba(240,240,240,.55)', fontSize:10, lineHeight:1.45, marginTop:4 }}>Use saved product and listing facts only.</p></div><div style={{ borderTop:'2px solid rgba(240,240,240,.3)', paddingTop:8 }}><b style={{ color:'#fff', fontSize:11 }}>02 / REVIEW</b><p style={{ color:'rgba(240,240,240,.55)', fontSize:10, lineHeight:1.45, marginTop:4 }}>Check claims, terminology, and intent.</p></div><div style={{ borderTop:'2px solid rgba(240,240,240,.3)', paddingTop:8 }}><b style={{ color:'#fff', fontSize:11 }}>03 / APPLY</b><p style={{ color:'rgba(240,240,240,.55)', fontSize:10, lineHeight:1.45, marginTop:4 }}>Publish externally only after approval.</p></div></div></section>

      <section className="studio-panel" style={{ marginTop:16, padding:20, borderColor:'rgba(183,178,255,.3)', background:'linear-gradient(130deg,rgba(52,47,116,.28),rgba(16,16,25,.5))' }}><div style={{ display:'flex', justifyContent:'space-between', gap:14, alignItems:'flex-start', flexWrap:'wrap' }}><div><div className="studio-kicker" style={{ color:'var(--signal)' }}>SEO ACTION CONSOLE / {app.name.toUpperCase()}</div><h2 style={{ color:'#fff', fontSize:22, marginTop:6 }}>Move a grounded recommendation into review.</h2><p style={{ color:'rgba(240,240,240,.61)', fontSize:11.5, lineHeight:1.55, marginTop:6, maxWidth:700 }}>Each button captures the selected app’s current grounded SEO or ASO plan as a persistent review task. It does not edit a website, change App Store metadata, or publish content.</p></div><span className="studio-chip" style={{ color:'var(--signal)', borderColor:'rgba(126,225,197,.25)' }}>{actionTasks.filter(item => item.status !== 'completed').length} OPEN ACTION{actionTasks.filter(item => item.status !== 'completed').length === 1 ? '' : 'S'}</span></div>{actionError && <p style={{ marginTop:12, color:'#ffb6c1', fontSize:11 }}>{actionError}</p>}{actionNotice && <p style={{ marginTop:12, color:'#9ee8d2', fontSize:11 }}>{actionNotice}</p>}<div className="seo-action-grid" style={{ marginTop:16 }}>{seoActions.map(action => { const meta = SEO_ACTION_META[action.type] || {}; const alreadyOpen = actionTasks.find(task => task.action_type === action.type && task.status !== 'completed'); return <article className="seo-action-card" key={action.type}><div className="studio-kicker" style={{ color:'rgba(240,240,240,.5)' }}>{meta.order || 'ACTION'} / {meta.label || 'SEO review'}</div><b style={{ display:'block', color:'#fff', fontSize:12.5, lineHeight:1.45, marginTop:7 }}>{action.title}</b><p style={{ color:'rgba(240,240,240,.56)', fontSize:10.5, lineHeight:1.5, marginTop:7, minHeight:47 }}>{action.description}</p>{alreadyOpen && <p style={{ color:'#bdb9ff', fontSize:9.5, marginTop:7 }}>Already queued · {formatSeoActionTime(alreadyOpen.created_at)}</p>}<button type="button" onClick={() => queueSeoAction(action)} disabled={Boolean(actionPending)} className="studio-button studio-button--soft" style={{ marginTop:11, padding:'8px 10px', fontSize:10 }}>{actionPending === action.type ? 'Queuing…' : meta.action || 'Queue action'}</button></article> })}</div><div style={{ marginTop:18, paddingTop:14, borderTop:'1px solid rgba(240,240,240,.1)' }}><div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'center', flexWrap:'wrap' }}><div><div className="studio-kicker" style={{ color:'rgba(240,240,240,.5)' }}>SELECTED APP ACTION HISTORY</div><p style={{ color:'rgba(240,240,240,.52)', fontSize:10.5, marginTop:4 }}>Use this to track review progress for {app.name}; external changes stay manual.</p></div>{actionLoading && <span style={{ color:'rgba(240,240,240,.5)', fontSize:10.5 }}>Loading actions…</span>}</div>{!actionLoading && !actionTasks.length && <p style={{ color:'rgba(240,240,240,.5)', fontSize:11, marginTop:13 }}>No SEO actions have been queued for this app yet.</p>}{actionTasks.slice(0,8).map(task => <div className="seo-task-row" key={task.id}><div style={{ minWidth:0 }}><div style={{ display:'flex', gap:7, alignItems:'center', flexWrap:'wrap' }}><b style={{ color:'#fff', fontSize:11.5 }}>{task.title}</b><span className="studio-chip" style={{ color:task.status === 'completed' ? '#9ee8d2' : '#cbc8ff', fontSize:8 }}>{task.status.replace('_',' ')}</span></div><p style={{ color:'rgba(240,240,240,.52)', fontSize:10, marginTop:4 }}>{task.description} · {formatSeoActionTime(task.created_at)}</p></div><button type="button" onClick={() => updateSeoAction(task, task.status === 'completed' ? 'ready' : 'completed')} disabled={Boolean(actionPending)} className="studio-button studio-button--soft" style={{ padding:'7px 9px', fontSize:9.5 }}>{actionPending === task.id ? 'Saving…' : task.status === 'completed' ? 'Reopen' : 'Mark complete'}</button></div>)}</div></section>

      <section className="seo-grid-2" style={{ marginTop:16 }}><section className="studio-panel" style={{ padding:20, borderColor:'rgba(197,197,197,.25)' }}><div className="studio-kicker" style={{ color:'var(--signal)' }}>WEBSITE SEO / REVIEW DRAFT</div><h2 style={{ color:'#fff', fontSize:22, marginTop:6 }}>One clear landing page, backed by product truth.</h2><p style={{ color:'rgba(240,240,240,.58)', fontSize:11.5, lineHeight:1.55, marginTop:6 }}>These are page-specific, review-ready drafts—not deployed tags or page content.</p><div style={{ display:'grid', gap:9, marginTop:15 }}><DraftCard label={`LANDING URL · ${website.landingSlug}`} value={website.h1} note="Use one clearly differentiated H1 that matches the page’s actual content." accent /><DraftCard label={`TITLE DRAFT · ${website.metaTitle.length}/60`} value={website.metaTitle} note="Keep the visible H1 and document title aligned; avoid boilerplate and repeated terms." /><DraftCard label={`META DESCRIPTION DRAFT · ${website.metaDescription.length}/155`} value={website.metaDescription} note="Write a useful summary of this specific page, not a keyword list." /></div><div style={{ marginTop:15 }}><div className="studio-kicker" style={{ color:'rgba(240,240,240,.5)' }}>CONCEPT THEMES / NOT SEARCH-VOLUME CLAIMS</div><div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:8 }}>{keywordThemes.map(theme => <span className="studio-chip" key={theme} style={{ color:'#dddafe', borderColor:'rgba(183,178,255,.3)', background:'rgba(104,96,255,.14)' }}>{theme}</span>)}</div></div></section>

        <section className="studio-panel" style={{ padding:20, borderColor:'rgba(197,197,197,.25)' }}><div className="studio-kicker" style={{ color:'var(--signal)' }}>APP STORE DISCOVERY / REVIEW DRAFT</div><h2 style={{ color:'#fff', fontSize:22, marginTop:6 }}>Metadata and creative with intent.</h2><p style={{ color:'rgba(240,240,240,.58)', fontSize:11.5, lineHeight:1.55, marginTop:6 }}>Apple App Store search uses relevant product-page metadata and behavior. Candidate terms below must be reviewed in App Store Connect before use.</p><div style={{ display:'grid', gap:9, marginTop:15 }}><DraftCard label={`CURRENT TITLE · ${appStore.titleCharacterCount}/30`} value={appStore.currentTitle || 'No public listing title returned'} note={`Current subtitle: ${currentSubtitle}`} /><DraftCard label={`SUBTITLE DRAFT · ${appStore.subtitleCharacterCount}/30`} value={appStore.subtitleDraft} note="Draft is derived from the saved offer or description; revise for clarity and Apple review compliance." accent /><DraftCard label={`CANDIDATE KEYWORD STRING · ${appStore.keywordCharacterCount}/100`} value={appStore.candidateKeywordString || 'Add more product context before creating an App Store keyword candidate.'} note="Candidate removes current title, subtitle, and category terms where possible. It does not include competitor names or trademarked terms." /><DraftCard label={`PROMOTIONAL TEXT DRAFT · ${appStore.promotionalCharacterCount}/170`} value={appStore.promotionalText} note="Use for current messaging; it is not an App Store ranking field." /></div></section></section>

      <section className="seo-grid-2" style={{ marginTop:16 }}><section className="studio-panel" style={{ padding:20, borderColor:'rgba(197,197,197,.25)' }}><div className="studio-kicker" style={{ color:'var(--signal)' }}>VISUAL SEARCH + CONTENT MAP</div><h2 style={{ color:'#fff', fontSize:22, marginTop:6 }}>Use the assets you already have.</h2><p style={{ color:'rgba(240,240,240,.58)', fontSize:11.5, lineHeight:1.55, marginTop:6 }}>Google benefits from relevant descriptive text near images and videos. Apple search can show the first screenshots or preview, so this gives each asset a defined job.</p>{screenshotPlan.length ? <div className="seo-rail" style={{ marginTop:14 }}>{screenshotPlan.map(item => <SourcePreview key={item.url} src={item.url} alt={item.altText} label={`#${item.order} · ${item.focus}`} />)}</div> : <div style={{ marginTop:14, padding:13, border:'1px dashed rgba(240,240,240,.22)', color:'rgba(240,240,240,.58)', fontSize:11.5, lineHeight:1.55 }}>No App Store screenshots are stored for this app yet. Refresh its public listing or add screenshots in Portfolio before assigning search roles.</div>}<div style={{ marginTop:15, paddingTop:13, borderTop:'1px solid rgba(240,240,240,.1)' }}><div className="studio-kicker" style={{ color:'rgba(240,240,240,.5)' }}>CREATIVE LAB</div><p style={{ color:'#fff', fontSize:12, marginTop:6 }}>{readyCreative.length ? `${readyCreative.length} completed app-scoped image or video asset${readyCreative.length === 1 ? ' is' : 's are'} ready to evaluate for landing pages, social proof, or App Store creative tests.` : 'No completed Creative Lab asset is available for this app yet.'}</p>{assetError && <p style={{ color:'#c5c4d8', fontSize:10.5, marginTop:6 }}>{assetError}</p>}<button onClick={() => navigate('/images')} className="studio-button studio-button--soft" style={{ marginTop:10, padding:'8px 11px', fontSize:10 }}>Open Creative Lab →</button></div></section>

        <section className="studio-panel" style={{ padding:20, borderColor:'rgba(197,197,197,.25)' }}><div className="studio-kicker" style={{ color:'var(--signal)' }}>PAGE CLUSTER + FAQ PLAN</div><h2 style={{ color:'#fff', fontSize:22, marginTop:6 }}>Build supporting pages users can navigate.</h2><p style={{ color:'rgba(240,240,240,.58)', fontSize:11.5, lineHeight:1.55, marginTop:6 }}>Each link is a planning target, not an existing URL. Only create pages with useful, app-specific material.</p><div style={{ display:'grid', gap:8, marginTop:14 }}>{internalLinks.map(link => <div key={link.target} style={{ display:'flex', justifyContent:'space-between', gap:12, padding:'10px 0', borderBottom:'1px solid rgba(240,240,240,.09)' }}><b style={{ color:'#fff', fontSize:11.5 }}>{link.label}</b><code style={{ color:'rgba(240,240,240,.48)', fontSize:10, overflowWrap:'anywhere', textAlign:'right' }}>{link.target}</code></div>)}</div><div style={{ marginTop:14 }}><div className="studio-kicker" style={{ color:'rgba(240,240,240,.5)' }}>FAQ STARTERS</div>{faqs.map(faq => <div key={faq.question} style={{ marginTop:9, padding:11, background:'rgba(18,18,18,.29)', border:'1px solid rgba(240,240,240,.1)', borderRadius:10 }}><b style={{ color:'#fff', fontSize:11.5 }}>{faq.question}</b><p style={{ color:'rgba(240,240,240,.6)', fontSize:10.5, lineHeight:1.55, marginTop:5 }}>{faq.answer}</p></div>)}</div></section></section>

      <section className="seo-grid-2" style={{ marginTop:16 }}><section className="studio-panel" style={{ padding:20, borderColor:'rgba(197,197,197,.25)' }}><div className="studio-kicker" style={{ color:'var(--signal)' }}>DISCOVERY EXPERIMENTS / MANUAL SETUP</div><h2 style={{ color:'#fff', fontSize:22, marginTop:6 }}>Test one message or visual variable at a time.</h2><p style={{ color:'rgba(240,240,240,.58)', fontSize:11.5, lineHeight:1.55, marginTop:6 }}>These experiments must be configured and reviewed in App Store Connect. Flo Studio does not submit App Store metadata or start experiments automatically.</p><div style={{ display:'grid', gap:10, marginTop:15 }}>{experiments.map((experiment, index) => <article key={experiment.title} style={{ padding:13, border:'1px solid rgba(240,240,240,.12)', background:'rgba(18,18,18,.31)', borderRadius:12 }}><div style={{ display:'flex', justifyContent:'space-between', gap:10 }}><b style={{ color:'#fff', fontSize:12 }}>0{index + 1} / {experiment.title}</b><span className="studio-chip" style={{ color:'#dddafe', borderColor:'rgba(183,178,255,.28)' }}>HYPOTHESIS</span></div><p style={{ color:'rgba(240,240,240,.63)', fontSize:10.5, lineHeight:1.55, marginTop:7 }}>{experiment.hypothesis}</p><p style={{ color:'rgba(240,240,240,.48)', fontSize:10, lineHeight:1.45, marginTop:7 }}>Variable: {experiment.variable}<br/>Measure: {experiment.measurement}</p></article>)}</div></section>

        <section className="studio-panel" style={{ padding:20, borderColor:'rgba(197,197,197,.25)' }}><div className="studio-kicker" style={{ color:'var(--signal)' }}>DATA READINESS / {app.name.toUpperCase()}</div><h2 style={{ color:'#fff', fontSize:22, marginTop:6 }}>Know what is grounded before you publish.</h2><p style={{ color:'rgba(240,240,240,.58)', fontSize:11.5, lineHeight:1.55, marginTop:6 }}>This checklist explains why a section is ready or what needs to be added. It does not guess missing details.</p><div style={{ marginTop:12 }}>{readiness.map(item => <StatusCard key={item.label} item={item} />)}</div><div style={{ marginTop:14, padding:12, borderRadius:10, background:'rgba(104,96,255,.12)', border:'1px solid rgba(183,178,255,.24)' }}><b style={{ color:'#e3e1ff', fontSize:11 }}>Review guardrail</b><p style={{ color:'rgba(240,240,240,.62)', fontSize:10.5, lineHeight:1.55, marginTop:4 }}>Verify all performance, comparison, pricing, and customer claims before publishing. Do not use competitor names, unauthorized trademarks, or irrelevant terms in App Store metadata.</p></div><div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:13 }}><button onClick={() => navigate(`/insights?app=${encodeURIComponent(app.id)}`)} className="studio-button studio-button--soft" style={{ padding:'8px 10px', fontSize:10 }}>Check App Insights →</button><button onClick={() => navigate('/portfolio')} className="studio-button studio-button--soft" style={{ padding:'8px 10px', fontSize:10 }}>Edit app context →</button>{sources.listingUrl && <a href={sources.listingUrl} target="_blank" rel="noreferrer" className="studio-button studio-button--soft" style={{ padding:'8px 10px', fontSize:10, textDecoration:'none' }}>Open current listing ↗</a>}</div></section></section>

      <section className="studio-panel" style={{ marginTop:16, padding:16, borderColor:'rgba(197,197,197,.2)', background:'rgba(17,17,17,.28)' }}><p style={{ color:'rgba(240,240,240,.54)', fontSize:10.5, lineHeight:1.6 }}>Method: Google guidance emphasizes useful, unique, page-specific content, descriptive titles and snippets, and relevant image/video context. Apple guidance emphasizes relevant title, subtitle, keywords, category, screenshots, and product-page testing. <a href="https://developers.google.com/search/docs/fundamentals/seo-starter-guide" target="_blank" rel="noreferrer" style={{ color:'var(--signal)' }}>Google SEO guidance ↗</a> · <a href="https://developer.apple.com/app-store/search/" target="_blank" rel="noreferrer" style={{ color:'var(--signal)' }}>Apple App Store search guidance ↗</a></p></section>
    </div>
  </Layout>
}
