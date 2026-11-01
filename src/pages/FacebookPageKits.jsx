import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import { useWorkspace } from '../context/WorkspaceContext'
import { buildFacebookPageGraphicSvg, buildFacebookPageKit, buildFacebookPageOnePagerText } from '../lib/facebookPageKits'
import { trackFloEvent } from '../lib/observability'
import FacebookGroupDiscovery from '../components/FacebookGroupDiscovery'

const safeImageUrl = value => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const url = new URL(raw)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''
  } catch {
    return ''
  }
}

const kitFilename = (name, extension) => `${String(name || 'app').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app'}-facebook-page-kit.${extension}`

function AppArtwork({ kit, size = 58 }) {
  const [failed, setFailed] = useState(false)
  const image = safeImageUrl(kit.artworkUrl)
  return <div aria-label={`${kit.appName} artwork`} style={{ width:size, height:size, borderRadius:Math.round(size * .24), overflow:'hidden', flex:'0 0 auto', position:'relative', display:'grid', placeItems:'center', background:'linear-gradient(145deg,#8d85ff,#5148ca)', boxShadow:'0 9px 22px rgba(80,72,202,.22)', color:'#fff', fontSize:Math.round(size * .44), fontWeight:850 }}>
    {!failed && image ? <img src={image} alt={`${kit.appName} App Store artwork`} onError={() => setFailed(true)} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : (kit.appName || 'F').slice(0, 1).toUpperCase()}
  </div>
}

function Availability({ children, tone = 'neutral' }) {
  const colors = {
    neutral:{ color:'#5c5a89', background:'rgba(141,133,255,.10)', border:'rgba(141,133,255,.24)' },
    ready:{ color:'#137f6c', background:'rgba(87,226,194,.13)', border:'rgba(44,178,151,.28)' },
    review:{ color:'#9c5a09', background:'rgba(245,158,11,.13)', border:'rgba(245,158,11,.3)' },
  }
  const style = colors[tone] || colors.neutral
  return <span style={{ display:'inline-flex', alignItems:'center', padding:'5px 8px', borderRadius:999, color:style.color, background:style.background, border:`1px solid ${style.border}`, font:'700 8.5px DM Mono,monospace', letterSpacing:'.08em', textTransform:'uppercase' }}>{children}</span>
}

function SummaryValue({ label, children }) {
  return <div style={{ display:'grid', gap:5, minWidth:0 }}><span style={{ color:'#7c82a0', font:'700 8.5px DM Mono,monospace', letterSpacing:'.1em', textTransform:'uppercase' }}>{label}</span><div style={{ color:'#212440', fontSize:12, lineHeight:1.5, wordBreak:'break-word' }}>{children}</div></div>
}

export default function FacebookPageKits() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { apps, activeApp, setActiveApp, workspaceLoading, workspaceError } = useWorkspace()
  const requestedId = searchParams.get('app') || ''
  const [selectedId, setSelectedId] = useState(requestedId || activeApp?.id || '')
  const [draft, setDraft] = useState(null)
  const [notice, setNotice] = useState('')
  const [copied, setCopied] = useState(false)
  const onePagerRef = useRef(null)
  const focusRequestRef = useRef(0)
  const handledFocusRequestRef = useRef(0)
  const [focusRequest, setFocusRequest] = useState(null)

  const selectedApp = useMemo(() => apps.find(app => app.id === requestedId) || apps.find(app => app.id === selectedId) || activeApp || apps[0] || null, [activeApp, apps, requestedId, selectedId])
  const generatedKit = useMemo(() => selectedApp ? buildFacebookPageKit(selectedApp) : null, [selectedApp])
  const kit = draft || generatedKit
  const appKits = useMemo(() => apps.map(buildFacebookPageKit), [apps])

  useEffect(() => {
    const requestedApp = apps.find(app => app.id === requestedId)
    if (!requestedApp) return
    if (selectedId !== requestedApp.id) setSelectedId(requestedApp.id)
    if (activeApp?.id !== requestedApp.id) setActiveApp(requestedApp)
  }, [activeApp?.id, apps, requestedId, selectedId, setActiveApp])

  useEffect(() => {
    if (!selectedApp?.id) return
    setSelectedId(selectedApp.id)
    setDraft(buildFacebookPageKit(selectedApp))
    setCopied(false)
  }, [selectedApp?.id])

  useEffect(() => {
    if (!focusRequest || focusRequest.appId !== selectedApp?.id || handledFocusRequestRef.current === focusRequest.id) return
    handledFocusRequestRef.current = focusRequest.id
    const frame = window.requestAnimationFrame(() => {
      const onePager = onePagerRef.current
      if (!onePager) return
      onePager.focus({ preventScroll:true })
      onePager.scrollIntoView({ behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [focusRequest, selectedApp?.id])

  const chooseApp = app => {
    if (!app?.id) return
    if (activeApp?.id !== app.id) setActiveApp(app)
    if (requestedId !== app.id) {
      const nextSearchParams = new URLSearchParams(searchParams)
      nextSearchParams.set('app', app.id)
      setSearchParams(nextSearchParams)
    }
    setSelectedId(app.id)
    setDraft(buildFacebookPageKit(app))
    setNotice('')
    setCopied(false)
    const focusRequestId = focusRequestRef.current + 1
    focusRequestRef.current = focusRequestId
    setFocusRequest({ id:focusRequestId, appId:app.id })
    trackFloEvent('facebook_page_kit_opened', { product_id:app.id, has_artwork:Boolean(buildFacebookPageKit(app).artworkUrl) })
  }

  const updateDraft = (key, value) => setDraft(current => ({ ...(current || generatedKit), [key]:value }))

  const copyOnePager = async () => {
    if (!kit) return
    try {
      await navigator.clipboard.writeText(buildFacebookPageOnePagerText(kit))
      setCopied(true)
      setNotice('One-pager copied. Review it before pasting into Facebook.')
      trackFloEvent('facebook_page_kit_copied', { product_id:kit.productId, has_artwork:Boolean(kit.artworkUrl), review_required:Boolean(kit.requiresReview) })
    } catch {
      setNotice('Copy was blocked by this browser. Select the one-pager text and copy it manually.')
    }
  }

  const downloadGraphic = () => {
    if (!kit?.graphicAvailable) {
      setNotice('Add App Store artwork before downloading this graphic. The one-pager copy is still ready to use.')
      return
    }
    const blob = new Blob([buildFacebookPageGraphicSvg(kit)], { type:'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = kitFilename(kit.appName, 'svg')
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    setNotice('Facebook one-page graphic downloaded. It remains a review-only local export.')
    trackFloEvent('facebook_page_kit_graphic_downloaded', { product_id:kit.productId, graphic_format:'svg', review_required:Boolean(kit.requiresReview) })
  }

  const openPortfolio = () => selectedApp && navigate(`/portfolio?app=${encodeURIComponent(selectedApp.id)}`)

  if (workspaceLoading) return <Layout title="Facebook Page Kits"><div className="studio-panel" style={{ padding:28, color:'#434864' }}>Loading your app-specific Facebook Page Kits…</div></Layout>
  if (workspaceError) return <Layout title="Facebook Page Kits"><div className="studio-panel" style={{ padding:28, color:'#434864' }}><div className="studio-kicker">WORKSPACE CONNECTION</div><h1 style={{ marginTop:8, color:'#20233f' }}>Facebook Page Kits are waiting for your workspace.</h1><p style={{ marginTop:8, color:'#66708a' }}>{workspaceError}</p><button className="studio-button" onClick={() => window.location.reload()} style={{ marginTop:14 }}>Retry workspace loading</button></div></Layout>

  return <Layout title="Facebook Page Kits">
    <div className="facebook-kits-page" style={{ display:'grid', gap:16, paddingBottom:28 }}>
      <section className="facebook-kits-hero studio-dark" style={{ padding:'28px 30px', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'relative', zIndex:1, maxWidth:790 }}>
          <div className="studio-kicker" style={{ color:'#bcb8ff' }}>APP-SCOPED / FACEBOOK SETUP</div>
          <h1 className="studio-display" style={{ color:'#fff', fontSize:'clamp(34px,4.5vw,58px)', marginTop:10 }}>A real one-pager for <span className="studio-serif" style={{ color:'#70e4ca' }}>every app.</span></h1>
          <p style={{ color:'rgba(242,242,255,.76)', fontSize:13.5, lineHeight:1.7, marginTop:12, maxWidth:700 }}>FloStudio has prepared a Facebook Page Kit for each production app from its own saved App Store context, Portfolio facts, Brand DNA, and artwork. Edit, copy, or download a local one-page graphic — nothing here creates a Page, connects Facebook, or publishes content.</p>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:17 }}><Availability tone="ready">{appKits.length} kits ready</Availability><Availability>{appKits.filter(item => item.graphicAvailable).length} graphics ready</Availability><Availability tone="neutral">Manual export only</Availability></div>
        </div>
        <div aria-hidden="true" style={{ position:'absolute', width:280, height:280, borderRadius:'50%', top:-130, right:-65, border:'1px solid rgba(177,173,255,.34)', boxShadow:'0 0 0 30px rgba(141,133,255,.06),0 0 0 60px rgba(87,226,194,.035)' }} />
      </section>

      {!apps.length ? <section className="studio-panel" style={{ padding:28, textAlign:'center' }}><div className="studio-kicker">NO PRODUCTION APPS</div><h2 style={{ color:'#20233f', marginTop:8 }}>Add or refresh an app first.</h2><p style={{ color:'#66708a', margin:'8px auto 0', maxWidth:490 }}>Facebook Page Kits are created from each app’s saved product information. When your app appears in Portfolio, its kit appears here automatically.</p><button className="studio-button" onClick={() => navigate('/portfolio')} style={{ marginTop:16 }}>Open Portfolio</button></section> : <>
        <section className="studio-panel" style={{ padding:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', gap:14, alignItems:'center', flexWrap:'wrap' }}><div><div className="studio-kicker">CHOOSE AN APP</div><h2 style={{ color:'#20233f', fontSize:20, marginTop:4 }}>Each kit stays isolated to its app.</h2></div><select value={selectedApp?.id || ''} onChange={event => chooseApp(apps.find(app => app.id === event.target.value))} aria-label="Choose Facebook Page Kit app" style={{ width:'min(100%,340px)', padding:'10px 12px', borderRadius:9, border:'1px solid #d8d9ed', color:'#242545', background:'#fff', fontWeight:750 }}>{apps.map(app => <option value={app.id} key={app.id}>{app.name}</option>)}</select></div>
          <div className="facebook-kits-tabs" style={{ display:'flex', gap:8, overflowX:'auto', paddingTop:14, marginTop:13, borderTop:'1px solid #e8e9f5' }}>{appKits.map(item => <button type="button" key={item.productId} onClick={() => chooseApp(apps.find(app => app.id === item.productId))} aria-pressed={item.productId === selectedApp?.id} style={{ display:'inline-flex', alignItems:'center', gap:7, flex:'0 0 auto', padding:'7px 9px', borderRadius:9, border:`1px solid ${item.productId === selectedApp?.id ? 'rgba(99,91,255,.44)' : '#e0e2f2'}`, background:item.productId === selectedApp?.id ? 'rgba(99,91,255,.08)' : '#fff', color:item.productId === selectedApp?.id ? '#5148df' : '#59617d', fontSize:10.5, fontWeight:750 }}><span style={{ width:7, height:7, borderRadius:'50%', background:item.graphicAvailable ? '#57cbb0' : '#f59e0b' }} />{item.appName}</button>)}</div>
        </section>

        {kit && <section style={{ display:'grid', gridTemplateColumns:'minmax(0,1.15fr) minmax(320px,.85fr)', gap:16, alignItems:'start' }}>
          <article ref={onePagerRef} tabIndex={-1} role="region" aria-labelledby="facebook-page-one-pager-title" className="studio-panel facebook-kits-one-pager" style={{ padding:22, minWidth:0, scrollMarginTop:20 }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:14, alignItems:'flex-start', flexWrap:'wrap' }}><div style={{ display:'flex', alignItems:'center', gap:13 }}><AppArtwork kit={kit} /><div><div className="studio-kicker">FACEBOOK PAGE ONE-PAGER</div><h2 id="facebook-page-one-pager-title" style={{ color:'#20233f', fontSize:25, letterSpacing:'-.055em', marginTop:4 }}>{kit.appName}</h2><p style={{ color:'#717895', fontSize:11, marginTop:4 }}>Prepared from this app’s saved facts — editable before export.</p></div></div><Availability tone={kit.requiresReview ? 'review' : 'ready'}>{kit.requiresReview ? 'Regulated review' : 'Review ready'}</Availability></div>
            {kit.requiresReview && <div role="note" style={{ marginTop:16, padding:12, borderRadius:10, background:'rgba(245,158,11,.09)', border:'1px solid rgba(245,158,11,.26)', color:'#805016', fontSize:11.5, lineHeight:1.55 }}>This app may involve a regulated or sensitive topic. Verify claims, qualifiers, links, and Page policies before using any copy or graphic externally. FloStudio has not created or published a Facebook Page.</div>}
            <div style={{ display:'grid', gap:13, marginTop:18 }}>
              <label className="facebook-kit-field"><span>Page name</span><input value={kit.appName || ''} onChange={event => updateDraft('appName', event.target.value)} /></label>
              <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)', gap:12 }}><label className="facebook-kit-field"><span>Category</span><input value={kit.category || ''} onChange={event => updateDraft('category', event.target.value)} /></label><label className="facebook-kit-field"><span>Suggested handle</span><input value={kit.handleCandidate || ''} onChange={event => updateDraft('handleCandidate', event.target.value)} /><small>{kit.handleAvailability}</small></label></div>
              <label className="facebook-kit-field"><span>About</span><textarea rows={4} value={kit.about || ''} onChange={event => updateDraft('about', event.target.value)} /></label>
              <label className="facebook-kit-field"><span>Audience</span><textarea rows={2} value={kit.audience || ''} onChange={event => updateDraft('audience', event.target.value)} /></label>
              <label className="facebook-kit-field"><span>Call to action</span><input value={kit.destinationLabel || ''} onChange={event => updateDraft('destinationLabel', event.target.value)} /></label>
            </div>
            <div style={{ display:'flex', gap:9, flexWrap:'wrap', marginTop:18 }}><button className="studio-button" onClick={copyOnePager}>{copied ? 'Copied one-pager' : 'Copy one-pager'}</button><button className="studio-button studio-button--soft" onClick={downloadGraphic} disabled={!kit.graphicAvailable}>Download graphic (SVG)</button><button className="studio-button studio-button--soft" onClick={openPortfolio}>Edit app facts</button></div>
            {!kit.graphicAvailable && <p style={{ color:'#9a650b', fontSize:11, lineHeight:1.5, marginTop:10 }}>Graphic export is unavailable until this app has saved artwork. Its text one-pager is still ready to copy.</p>}
          </article>

          <aside style={{ display:'grid', gap:16, minWidth:0 }}>
            <article className="studio-panel" style={{ padding:18, overflow:'hidden' }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'center' }}><div><div className="studio-kicker">ONE-PAGE GRAPHIC</div><h3 style={{ color:'#20233f', fontSize:17, marginTop:4 }}>Local export preview</h3></div><Availability tone={kit.graphicAvailable ? 'ready' : 'review'}>{kit.graphicAvailable ? 'Artwork found' : 'Artwork needed'}</Availability></div>
              <div style={{ marginTop:13, borderRadius:14, overflow:'hidden', background:'#f1f2fb', border:'1px solid #e0e2f3', aspectRatio:'1 / 1', position:'relative' }}>
                {kit.graphicAvailable ? <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildFacebookPageGraphicSvg(kit))}`} alt={`${kit.appName} Facebook Page Kit graphic preview`} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} /> : <div style={{ height:'100%', display:'grid', placeItems:'center', textAlign:'center', padding:28, color:'#66708b' }}><div><div style={{ width:54, height:54, margin:'0 auto 12px', display:'grid', placeItems:'center', borderRadius:16, background:'#e8e8ff', color:'#6259ed', fontSize:24, fontWeight:850 }}>F</div><b style={{ color:'#323653' }}>Artwork unavailable</b><p style={{ fontSize:11, lineHeight:1.5, marginTop:6 }}>Refresh App Store intelligence or add approved app artwork in Portfolio.</p></div></div>}
              </div>
              <p style={{ color:'#747d96', fontSize:10.5, lineHeight:1.5, marginTop:10 }}>A local SVG export built from this app’s title, approved copy, and saved artwork. No image is uploaded, reused as a Facebook asset, or published from this screen.</p>
            </article>
            <article className="studio-panel" style={{ padding:18 }}><div className="studio-kicker">FACTS + READINESS</div><div style={{ display:'grid', gap:14, marginTop:13 }}><SummaryValue label="Product destination">{kit.destinationUrl ? <a href={kit.destinationUrl} target="_blank" rel="noreferrer" style={{ color:'#5148df', textDecoration:'underline' }}>{kit.destinationUrl}</a> : <span style={{ color:'#a0610c' }}>Add an approved destination in Portfolio.</span>}</SummaryValue><SummaryValue label="Facebook Page reference">{kit.pageUrl ? <a href={kit.pageUrl} target="_blank" rel="noreferrer" style={{ color:'#5148df', textDecoration:'underline' }}>Open existing Page ↗</a> : <span style={{ color:'#7b829b' }}>No Page URL saved. This kit does not create one.</span>}</SummaryValue><SummaryValue label="Approved context">{kit.proofPoints}</SummaryValue><SummaryValue label="Claims to avoid">{kit.restrictedClaims}</SummaryValue><SummaryValue label="Source basis">{kit.sourceNote}</SummaryValue></div></article>
          </aside>
        </section>}

        {selectedApp && <FacebookGroupDiscovery app={selectedApp} workspaceId={selectedApp.workspace_id} />}

        <section className="studio-panel" style={{ padding:18 }}><div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'end', flexWrap:'wrap' }}><div><div className="studio-kicker">ALL APP KITS</div><h2 style={{ color:'#20233f', fontSize:20, marginTop:4 }}>A first kit already exists for every production app.</h2></div><p style={{ color:'#737b95', fontSize:11, maxWidth:370 }}>Choose an app to open its own copy and graphic. These are manual, review-first exports only.</p></div><div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:11, marginTop:15 }}>{appKits.map(item => <article key={item.productId} style={{ border:'1px solid #e1e3f1', background:'#fff', borderRadius:12, padding:13, display:'grid', gap:11 }}><div style={{ display:'flex', alignItems:'center', gap:9, minWidth:0 }}><AppArtwork kit={item} size={38} /><div style={{ minWidth:0 }}><b style={{ display:'block', color:'#242643', fontSize:12, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.appName}</b><span style={{ color:'#7b829d', fontSize:10 }}>{item.category}</span></div></div><div style={{ display:'flex', justifyContent:'space-between', gap:7, alignItems:'center' }}><Availability tone={item.graphicAvailable ? 'ready' : 'review'}>{item.graphicAvailable ? 'Graphic ready' : 'Copy ready'}</Availability><button className="studio-button studio-button--soft" onClick={() => chooseApp(apps.find(app => app.id === item.productId))} style={{ padding:'7px 9px', fontSize:9.5 }}>Open kit</button></div></article>)}</div></section>
      </>}
      {notice && <div role="status" style={{ position:'sticky', bottom:12, zIndex:5, padding:'11px 13px', borderRadius:10, color:'#fff', background:'rgba(24,25,57,.95)', boxShadow:'0 12px 28px rgba(18,19,51,.25)', fontSize:11.5 }}>{notice}</div>}
    </div>
    <style>{`
      .facebook-kits-page{padding:0 0 4px}.flo-main .facebook-kits-hero{background:linear-gradient(132deg,#181932 0%,#29275b 54%,#34307c 100%)!important;border-color:rgba(166,160,255,.36)!important;box-shadow:0 20px 44px rgba(35,31,98,.22),0 1px 0 rgba(255,255,255,.13) inset!important}.flo-main .facebook-kits-hero .studio-display{color:#fff!important}.flo-main .facebook-kits-hero .studio-kicker{color:#bcb8ff!important}.flo-main .facebook-kits-hero p{color:rgba(242,242,255,.76)!important}.facebook-kits-one-pager:focus{outline:3px solid rgba(81,72,223,.48);outline-offset:3px}.facebook-kit-field{display:grid;gap:6px;color:#5f6783;font:700 9px 'DM Mono',monospace;letter-spacing:.08em;text-transform:uppercase}.facebook-kit-field input,.facebook-kit-field textarea{width:100%;border:1px solid #dfe1f0;border-radius:9px;padding:10px 11px;color:#252742;background:#fff;font:500 12.5px 'Bricolage Grotesque',Inter,sans-serif;line-height:1.5;letter-spacing:normal;text-transform:none}.facebook-kit-field textarea{resize:vertical}.facebook-kit-field small{font:500 10px 'Bricolage Grotesque',Inter,sans-serif;line-height:1.4;color:#8a90a9;letter-spacing:normal;text-transform:none}.facebook-kits-tabs::-webkit-scrollbar{height:5px}.facebook-kits-tabs::-webkit-scrollbar-thumb{background:#d8d8ee;border-radius:999px}@media(max-width:960px){.facebook-kits-page>section[style*='grid-template-columns']{grid-template-columns:1fr!important}}@media(max-width:620px){.facebook-kits-hero{padding:22px 18px!important}.facebook-kits-page{padding-bottom:12px}.facebook-kit-field{font-size:8px}}
    `}</style>
  </Layout>
}
