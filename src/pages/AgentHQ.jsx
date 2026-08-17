import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { supabase } from '../supabase'
import { useWorkspace } from '../context/WorkspaceContext'
import { createCampaign, createCampaignPosts, generateCampaignVariant, listCampaignMedia, loadCampaignWorkspace, saveBrandAndProduct, saveCampaignConcepts, selectCampaignConcept } from '../lib/campaignEngine'

const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyZWYiOiJ4eGtwdm9raHFicGJxZWZlZ3hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMDI1NDgsImV4cCI6MjA5Nzc3MDI1NDh9.OVdLzh2Bvuf4l6F6ITSpj4pWqoc3EoTxs6OCvrMf4JU'
const platforms = ['instagram', 'facebook', 'linkedin', 'tiktok']
const platformLabel = { instagram:'Instagram', facebook:'Facebook', linkedin:'LinkedIn', tiktok:'TikTok' }
const stageOrder = ['intake','dna','angles','board']

const fieldStyle = { width:'100%', boxSizing:'border-box', background:'rgba(5,4,20,.42)', border:'1px solid rgba(255,255,255,.14)', borderRadius:11, color:'#fff', padding:'12px 13px', outline:'none', font:'inherit', fontSize:12.5, lineHeight:1.55 }

async function callAI(messages, maxTokens = 1600) {
  const response = await fetch('https://xxkpvnokhqbpbqefegxa.supabase.co/functions/v1/ai-proxy', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${ANON}`, apikey:ANON }, body:JSON.stringify({ model:'gpt-4o', messages, max_tokens:maxTokens }) })
  const payload = await response.json()
  return payload?.content || payload?.choices?.[0]?.message?.content || ''
}

function fallbackConcepts({ brand, product, offer }) {
  return [
    { title:'The problem becomes simple', angle:'Pain-to-clarity', hook:`Still losing time to ${product || 'the old way'}?`, proof:`${brand} makes the hard part feel clear, focused, and easy to act on.`, cta:offer || 'See the smarter way forward.', visual_recipe:{ direction:'Editorial before-and-after story with bold product focus' } },
    { title:'Proof over promises', angle:'Outcome-led proof', hook:`What changes when ${product || brand} is working for you?`, proof:`A tangible, believable outcome that makes the next step feel worth taking.`, cta:offer || 'Make your move today.', visual_recipe:{ direction:'Confident product demonstration with high-trust visual proof' } },
    { title:'A better daily ritual', angle:'Lifestyle transformation', hook:`Your next favorite routine starts here.`, proof:`${brand} turns a recurring friction point into a more rewarding everyday experience.`, cta:offer || 'Start with the first step.', visual_recipe:{ direction:'Cinematic lifestyle moment with warm human momentum' } },
  ]
}

export default function AgentHQ() {
  const navigate = useNavigate()
  const { activeApp, tokens, useTokens } = useWorkspace()
  const [stage, setStage] = useState('intake')
  const [userId, setUserId] = useState(null)
  const [workspace, setWorkspace] = useState({ brands:[], products:[], campaigns:[], media:[] })
  const [brandName, setBrandName] = useState(activeApp?.name || '')
  const [websiteUrl, setWebsiteUrl] = useState(activeApp?.url || '')
  const [productName, setProductName] = useState(activeApp?.name || '')
  const [description, setDescription] = useState('')
  const [offerText, setOfferText] = useState('')
  const [objective, setObjective] = useState('Drive qualified awareness and conversion')
  const [audience, setAudience] = useState('')
  const [selectedPlatforms, setSelectedPlatforms] = useState(['instagram','facebook'])
  const [brandDna, setBrandDna] = useState({ voice:'Clear, optimistic, and specific', visualDirection:'Editorial product storytelling with confident color', proofPoints:'', audienceMindset:'', restrictedClaims:'' })
  const [sourceFacts, setSourceFacts] = useState({})
  const [urlState, setUrlState] = useState('')
  const [campaign, setCampaign] = useState(null)
  const [concepts, setConcepts] = useState([])
  const [selectedConcept, setSelectedConcept] = useState(null)
  const [campaignPosts, setCampaignPosts] = useState([])
  const [campaignAssets, setCampaignAssets] = useState([])
  const [busy, setBusy] = useState('')
  const [renderProgress, setRenderProgress] = useState(null)
  const [error, setError] = useState('')

  const stageIndex = stageOrder.indexOf(stage)
  const campaignName = useMemo(() => `${brandName || 'New brand'} — ${offerText || objective || 'Campaign'}`, [brandName, offerText, objective])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data:{ user } }) => {
      if (!user) return
      setUserId(user.id)
      try { setWorkspace(await loadCampaignWorkspace(user.id)) } catch {}
    })
  }, [])

  const refreshWorkspace = async () => { if (userId) setWorkspace(await loadCampaignWorkspace(userId)) }
  const togglePlatform = platform => setSelectedPlatforms(previous => previous.includes(platform) ? previous.filter(item => item !== platform) : [...previous, platform])

  const analyzeUrl = async () => {
    if (!websiteUrl.trim()) { setStage('dna'); return }
    setBusy('analyze-url'); setError(''); setUrlState('Reading your public product page…')
    try {
      const response = await fetch('/api/ingest-product', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ url:websiteUrl.trim() }) })
      const details = await response.json()
      if (!response.ok) throw new Error(details.error)
      setSourceFacts(details)
      setBrandName(previous => previous || details.siteName || details.title || activeApp?.name || '')
      setProductName(previous => previous || details.title || activeApp?.name || '')
      setDescription(previous => previous || details.description || '')
      setUrlState('Product facts captured. Review them below before Flo uses them.')
    } catch (intakeError) {
      setUrlState(intakeError.message || 'Flo could not read that page. Continue with your own product details.')
    } finally { setBusy('') }
  }

  const createAngles = async () => {
    if (!brandName.trim() || !productName.trim()) { setError('Add a brand and product name before creating campaign angles.'); return }
    if (!userId) { setError('Your workspace is still loading. Please try again in a moment.'); return }
    setBusy('create-angles'); setError('')
    try {
      const { brand, product } = await saveBrandAndProduct({ userId, brandName:brandName.trim(), websiteUrl:websiteUrl.trim(), productName:productName.trim(), description:description.trim(), offerText:offerText.trim(), audience:audience.trim(), brandDna, sourceFacts })
      const newCampaign = await createCampaign({ userId, brand, product, name:campaignName, objective, audience, offerText, platforms:selectedPlatforms, brief:{ description, sourceFacts, brandDna } })
      const generated = await callAI([
        { role:'system', content:'You are FloStudio’s creative strategy director. Return valid JSON only: an array of exactly 3 campaign concepts. Each object must have title, angle, hook, proof, cta, visual_recipe with a direction field, and script with a 15_second field. Be specific and do not make unsupported claims.' },
        { role:'user', content:`Brand: ${brandName}\nProduct: ${productName}\nDescription: ${description || 'Not provided'}\nOffer: ${offerText || 'Not provided'}\nAudience: ${audience || 'Not provided'}\nObjective: ${objective}\nBrand voice: ${brandDna.voice}\nVisual direction: ${brandDna.visualDirection}\nProof points: ${brandDna.proofPoints || 'Use only prudent generic proof'}\nRestrictions: ${brandDna.restrictedClaims || 'No unsupported claims'}\nCreate three materially different campaign angles.` }
      ], 1800)
      let parsed = []
      try { const match = generated.replace(/```json|```/g, '').match(/\[[\s\S]*\]/); parsed = match ? JSON.parse(match[0]) : [] } catch {}
      if (!Array.isArray(parsed) || parsed.length < 3) parsed = fallbackConcepts({ brand:brandName, product:productName, offer:offerText })
      const stored = await saveCampaignConcepts({ userId, campaignId:newCampaign.id, concepts:parsed.slice(0,3) })
      setCampaign(newCampaign); setConcepts(stored); setStage('angles'); await refreshWorkspace()
    } catch (campaignError) { setError(campaignError.message || 'Flo could not create campaign angles. Please try again.') }
    finally { setBusy('') }
  }

  const chooseConcept = async concept => {
    if (!campaign) return
    setBusy(`choose-${concept.id}`); setError('')
    try {
      const result = await selectCampaignConcept(campaign.id, concept.id)
      const posts = await createCampaignPosts({ userId, campaignId:campaign.id, concept, platforms:selectedPlatforms.length ? selectedPlatforms : ['instagram'] })
      setCampaign(result.campaign); setSelectedConcept(result.concept); setCampaignPosts(posts); setStage('board'); await refreshWorkspace()
    } catch (chooseError) { setError(chooseError.message || 'Flo could not create your campaign board.') }
    finally { setBusy('') }
  }

  const renderVariants = async () => {
    if (!campaign || !selectedConcept || !campaignPosts.length) return
    const targets = campaignPosts.slice(0, 3)
    setRenderProgress({ complete:0, total:targets.length, failed:0 }); setError('')
    const created = []
    let complete = 0; let failed = 0
    for (let index = 0; index < targets.length; index += 1) {
      const authorized = await useTokens(10, `Campaign visual ${index + 1} of ${targets.length}`)
      if (!authorized) break
      try {
        const asset = await generateCampaignVariant({ userId, campaign, concept:selectedConcept, post:targets[index], variation:index + 1 })
        created.push(asset); complete += 1
      } catch (renderError) { failed += 1; setError(renderError.message || 'One campaign visual could not be rendered.') }
      setRenderProgress({ complete, total:targets.length, failed })
    }
    setCampaignAssets(previous => [...created, ...previous]); await refreshWorkspace()
  }

  const openExistingCampaign = async item => {
    setBusy('open-campaign')
    try {
      const conceptsResult = await supabase.from('campaign_concepts').select('*').eq('campaign_id', item.id).order('created_at')
      const postsResult = await supabase.from('campaign_posts').select('*').eq('campaign_id', item.id).order('created_at')
      const assets = await listCampaignMedia(item.id)
      const selected = conceptsResult.data?.find(concept => concept.id === item.selected_concept_id) || conceptsResult.data?.find(concept => concept.status === 'selected') || null
      setCampaign(item); setConcepts(conceptsResult.data || []); setSelectedConcept(selected); setCampaignPosts(postsResult.data || []); setCampaignAssets(assets); setStage(selected ? 'board' : 'angles')
    } catch (openError) { setError(openError.message || 'Flo could not load that campaign.') }
    finally { setBusy('') }
  }

  const startOver = () => { setStage('intake'); setCampaign(null); setConcepts([]); setSelectedConcept(null); setCampaignPosts([]); setCampaignAssets([]); setRenderProgress(null); setError('') }

  return <Layout title="Campaign Engine">
    <style>{`@keyframes engineEnter{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}} @media(max-width:1060px){.engine-grid,.engine-intake-grid,.engine-board-grid{grid-template-columns:1fr!important}.engine-rail{display:none!important}.engine-header{padding:28px!important}.engine-actions{position:static!important;margin-top:20px!important}.engine-stat-grid{grid-template-columns:repeat(2,1fr)!important}} @media(max-width:640px){.engine-stat-grid{grid-template-columns:1fr!important}.engine-fields{grid-template-columns:1fr!important}.engine-hero-title{font-size:38px!important}}`}</style>
    <div className="flo-page" style={{ maxWidth:1360, margin:'0 auto', animation:'engineEnter .42s var(--ease-out)' }}>
      <section className="studio-dark engine-header" style={{ position:'relative', overflow:'hidden', minHeight:296, padding:'37px 42px', marginBottom:18 }}>
        <div style={{ position:'absolute', width:420, height:420, right:-150, top:-230, borderRadius:'50%', background:'radial-gradient(circle,#ff8769 0%,#fa4fa2 32%,rgba(250,79,162,0) 70%)', opacity:.88 }} />
        <div style={{ position:'absolute', width:240, height:240, right:120, bottom:-130, borderRadius:42, background:'linear-gradient(140deg,#d7f267,#72ddc9)', transform:'rotate(24deg)', opacity:.72 }} />
        <div style={{ position:'relative', maxWidth:800 }}>
          <div className="studio-kicker" style={{ color:'#d9ff75', marginBottom:15 }}>FloStudio / Product-to-campaign engine</div>
          <h1 className="studio-display engine-hero-title" style={{ maxWidth:760 }}>Turn a product into a <span className="studio-serif" style={{ color:'#ffd3c7' }}>creative program.</span></h1>
          <p style={{ maxWidth:630, marginTop:16, color:'rgba(255,250,244,.74)', fontSize:13.5, lineHeight:1.7 }}>Flo learns the product and its rules first, then creates campaign angles, review-ready platform posts, and real creative variants that stay connected to the campaign.</p>
          <div className="engine-actions" style={{ position:'absolute', right:-335, bottom:3, display:'flex', gap:8 }}><span className="studio-chip" style={{ background:'rgba(255,255,255,.1)', borderColor:'rgba(255,255,255,.2)', color:'#fff' }}>{tokens} creative tokens</span><button onClick={startOver} className="studio-chip" style={{ background:'#d7f267', borderColor:'#d7f267', color:'#171326' }}>New campaign</button></div>
        </div>
      </section>

      <div className="engine-stat-grid" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:18 }}>
        {[[workspace.brands.length,'Brand profiles','#d9ff75'],[workspace.products.length,'Products','#83d9ff'],[workspace.campaigns.length,'Campaigns','#ffb5cf'],[workspace.media.length,'Creative assets','#ffd480']].map(([value,label,color]) => <div key={label} className="abundance-card" style={{ padding:'16px 18px' }}><div style={{ fontSize:25, fontWeight:850, color:'#fff', letterSpacing:'-.07em' }}>{value}</div><div style={{ color, font:'600 9.5px DM Mono,monospace', letterSpacing:'.08em', marginTop:4 }}>{label.toUpperCase()}</div></div>)}
      </div>

      <div className="engine-grid" style={{ display:'grid', gridTemplateColumns:'178px minmax(0,1fr) 290px', gap:18, alignItems:'start' }}>
        <aside className="engine-rail studio-panel" style={{ padding:'16px', background:'linear-gradient(160deg,#1e173e,#110d28)', borderColor:'rgba(255,255,255,.13)' }}>
          <div className="studio-kicker" style={{ color:'#d9ff75', marginBottom:14 }}>Campaign run</div>
          {[["01",'Product intake','Bring the offer into focus'],["02",'Brand DNA','Define what must stay true'],["03",'Campaign angles','Choose the creative thesis'],["04",'Creative board','Render, review, and ship']].map(([number,title,detail], index => <button key={number} onClick={() => index <= stageIndex && setStage(stageOrder[index])} style={{ width:'100%', textAlign:'left', padding:'12px 0', border:'none', borderTop:index ? '1px solid rgba(255,255,255,.1)' : 'none', background:'transparent', cursor:index <= stageIndex ? 'pointer' : 'default', opacity:index <= stageIndex ? 1 : .38, fontFamily:'inherit' }}><div style={{ font:'500 9px DM Mono,monospace', color:index === stageIndex ? '#ff9a7d' : '#a699d9' }}>{number}</div><div style={{ color:'#fff', fontSize:11.5, fontWeight:800, marginTop:3 }}>{title}</div><div style={{ color:'rgba(234,229,255,.55)', fontSize:9.5, lineHeight:1.4, marginTop:3 }}>{detail}</div></button>))}
          <div style={{ marginTop:16, paddingTop:14, borderTop:'1px solid rgba(255,255,255,.1)', color:'rgba(234,229,255,.54)', fontSize:10.5, lineHeight:1.55 }}>Every output is attached to a campaign record, not lost in a prompt history.</div>
        </aside>

        <main className="studio-panel" style={{ overflow:'hidden', background:'linear-gradient(145deg,#1d173d,#100d26)', borderColor:'rgba(201,184,255,.18)' }}>
          {stage === 'intake' && <section style={{ padding:'26px 28px' }}>
            <div className="studio-kicker" style={{ color:'#d9ff75' }}>01 / Product intake</div><h2 style={{ color:'#fff', fontSize:27, letterSpacing:'-.06em', marginTop:7 }}>What are we taking to market?</h2><p style={{ color:'rgba(234,229,255,.62)', fontSize:12, lineHeight:1.65, marginTop:8, maxWidth:650 }}>Start with a live product page, app listing, or your own facts. Flo uses only the details you confirm in the next step.</p>
            <div style={{ display:'grid', gap:16, marginTop:23 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:10 }}><input value={websiteUrl} onChange={event => setWebsiteUrl(event.target.value)} placeholder="https://your-product.com or app listing URL" style={fieldStyle} /><button onClick={analyzeUrl} disabled={busy === 'analyze-url'} className="studio-button studio-button--soft">{busy === 'analyze-url' ? 'Reading…' : 'Learn URL'}</button></div>
              {urlState && <div style={{ padding:'10px 12px', borderRadius:10, background:'rgba(115,221,202,.1)', border:'1px solid rgba(115,221,202,.23)', color:'#bff5e8', fontSize:11.5 }}>{urlState}</div>}
              <div className="engine-fields" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}><label style={{ display:'grid', gap:7 }}><span style={{ color:'#fff', fontWeight:750, fontSize:11.5 }}>Brand / company</span><input value={brandName} onChange={event => setBrandName(event.target.value)} placeholder="FloStudio, BoothProfit, your brand…" style={fieldStyle} /></label><label style={{ display:'grid', gap:7 }}><span style={{ color:'#fff', fontWeight:750, fontSize:11.5 }}>Product or offer</span><input value={productName} onChange={event => setProductName(event.target.value)} placeholder="What customers actually buy" style={fieldStyle} /></label></div>
              <label style={{ display:'grid', gap:7 }}><span style={{ color:'#fff', fontWeight:750, fontSize:11.5 }}>Describe the product in plain language</span><textarea value={description} onChange={event => setDescription(event.target.value)} rows={4} placeholder="Who it helps, the moment it matters, and what changes for them." style={{ ...fieldStyle, resize:'vertical' }} /></label>
              <div className="engine-fields" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}><label style={{ display:'grid', gap:7 }}><span style={{ color:'#fff', fontWeight:750, fontSize:11.5 }}>Offer or CTA</span><input value={offerText} onChange={event => setOfferText(event.target.value)} placeholder="Try it free, book a demo, download now…" style={fieldStyle} /></label><label style={{ display:'grid', gap:7 }}><span style={{ color:'#fff', fontWeight:750, fontSize:11.5 }}>Business objective</span><input value={objective} onChange={event => setObjective(event.target.value)} placeholder="Awareness, leads, activation…" style={fieldStyle} /></label></div>
              <button onClick={() => setStage('dna')} className="studio-button" style={{ justifySelf:'start', padding:'12px 19px' }}>Continue to Brand DNA →</button>
            </div>
          </section>}

          {stage === 'dna' && <section style={{ padding:'26px 28px' }}>
            <div className="studio-kicker" style={{ color:'#d9ff75' }}>02 / Brand DNA</div><h2 style={{ color:'#fff', fontSize:27, letterSpacing:'-.06em', marginTop:7 }}>Set the rules Flo should never forget.</h2><p style={{ color:'rgba(234,229,255,.62)', fontSize:12, lineHeight:1.65, marginTop:8 }}>This is the durable context that will travel with your campaigns, not a one-time prompt preference.</p>
            <div style={{ display:'grid', gap:15, marginTop:23 }}>
              <div className="engine-fields" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}><label style={{ display:'grid', gap:7 }}><span style={{ color:'#fff', fontWeight:750, fontSize:11.5 }}>Brand voice</span><input value={brandDna.voice} onChange={event => setBrandDna(previous => ({ ...previous, voice:event.target.value }))} style={fieldStyle} /></label><label style={{ display:'grid', gap:7 }}><span style={{ color:'#fff', fontWeight:750, fontSize:11.5 }}>Visual direction</span><input value={brandDna.visualDirection} onChange={event => setBrandDna(previous => ({ ...previous, visualDirection:event.target.value }))} style={fieldStyle} /></label></div>
              <label style={{ display:'grid', gap:7 }}><span style={{ color:'#fff', fontWeight:750, fontSize:11.5 }}>Who is this for?</span><textarea value={audience} onChange={event => setAudience(event.target.value)} rows={3} placeholder="Describe their role, mindset, friction, and what makes them ready to act." style={{ ...fieldStyle, resize:'vertical' }} /></label>
              <label style={{ display:'grid', gap:7 }}><span style={{ color:'#fff', fontWeight:750, fontSize:11.5 }}>Approved proof points</span><textarea value={brandDna.proofPoints} onChange={event => setBrandDna(previous => ({ ...previous, proofPoints:event.target.value }))} rows={3} placeholder="Customer results, product facts, features, testimonials, pricing—only claims you can stand behind." style={{ ...fieldStyle, resize:'vertical' }} /></label>
              <label style={{ display:'grid', gap:7 }}><span style={{ color:'#fff', fontWeight:750, fontSize:11.5 }}>Claims or language to avoid</span><input value={brandDna.restrictedClaims} onChange={event => setBrandDna(previous => ({ ...previous, restrictedClaims:event.target.value }))} placeholder="e.g. no guaranteed results, no medical claims, no discount language" style={fieldStyle} /></label>
              <div><div style={{ color:'#fff', fontWeight:750, fontSize:11.5, marginBottom:8 }}>Where should this campaign land?</div><div style={{ display:'flex', flexWrap:'wrap', gap:7 }}>{platforms.map(platform => <button key={platform} onClick={() => togglePlatform(platform)} className="studio-chip" style={{ background:selectedPlatforms.includes(platform) ? 'linear-gradient(135deg,#7b61ff,#ed569f)' : 'rgba(255,255,255,.06)', color:'#fff', borderColor:selectedPlatforms.includes(platform) ? 'transparent' : 'rgba(255,255,255,.14)' }}>{platformLabel[platform]}</button>)}</div></div>
              <div style={{ display:'flex', gap:9, flexWrap:'wrap' }}><button onClick={() => setStage('intake')} className="studio-button studio-button--soft">← Product</button><button onClick={createAngles} disabled={busy === 'create-angles'} className="studio-button">{busy === 'create-angles' ? 'Finding angles…' : 'Create campaign angles →'}</button></div>
            </div>
          </section>}

          {stage === 'angles' && <section style={{ padding:'26px 28px' }}>
            <div className="studio-kicker" style={{ color:'#d9ff75' }}>03 / Campaign angles</div><h2 style={{ color:'#fff', fontSize:27, letterSpacing:'-.06em', marginTop:7 }}>Choose the story worth turning into a campaign.</h2><p style={{ color:'rgba(234,229,255,.62)', fontSize:12, lineHeight:1.65, marginTop:8 }}>These are deliberate creative theses. Select one to generate review-ready platform posts and a connected campaign board.</p>
            <div style={{ display:'grid', gap:11, marginTop:22 }}>{concepts.map((concept, index) => <article key={concept.id} style={{ padding:'17px 18px', borderRadius:14, border:'1px solid rgba(255,255,255,.13)', background:index === 0 ? 'linear-gradient(120deg,rgba(123,97,255,.22),rgba(255,91,53,.1))' : 'rgba(255,255,255,.035)' }}><div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:15 }}><div><div style={{ color:'#d9ff75', font:'600 9px DM Mono,monospace', letterSpacing:'.1em' }}>ANGLE 0{index + 1} / {concept.angle}</div><h3 style={{ color:'#fff', fontSize:18, letterSpacing:'-.05em', marginTop:5 }}>{concept.title}</h3><div style={{ color:'#ffd3c7', fontFamily:'Playfair Display,serif', fontSize:17, marginTop:10 }}>“{concept.hook}”</div><p style={{ color:'rgba(234,229,255,.7)', fontSize:11.5, lineHeight:1.6, marginTop:8, maxWidth:610 }}>{concept.proof}</p><div style={{ color:'#bff5e8', fontSize:11, fontWeight:750, marginTop:9 }}>CTA: {concept.cta}</div></div><button onClick={() => chooseConcept(concept)} disabled={busy === `choose-${concept.id}`} className="studio-button" style={{ flexShrink:0 }}>{busy === `choose-${concept.id}` ? 'Building…' : 'Choose angle'}</button></div></article>)}</div>
          </section>}

          {stage === 'board' && <section style={{ padding:'26px 28px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:16, alignItems:'flex-start', flexWrap:'wrap' }}><div><div className="studio-kicker" style={{ color:'#d9ff75' }}>04 / Campaign board</div><h2 style={{ color:'#fff', fontSize:27, letterSpacing:'-.06em', marginTop:7 }}>{campaign?.name}</h2><p style={{ color:'rgba(234,229,255,.62)', fontSize:12, lineHeight:1.65, marginTop:8 }}>One selected concept, connected posts, and real creative variants. Everything here follows the campaign into review and planning.</p></div><div style={{ display:'flex', gap:8, flexWrap:'wrap' }}><button onClick={renderVariants} disabled={Boolean(renderProgress && renderProgress.complete < renderProgress.total)} className="studio-button">{renderProgress ? `Rendering ${renderProgress.complete}/${renderProgress.total}` : 'Render 3 campaign visuals · 30'}</button><button onClick={() => navigate('/pipeline')} className="studio-button studio-button--soft">Open Review Queue →</button></div></div>
            {selectedConcept && <div style={{ padding:'15px 16px', marginTop:20, borderRadius:13, background:'rgba(124,97,255,.16)', border:'1px solid rgba(203,189,255,.18)' }}><div style={{ color:'#d9ff75', font:'600 9px DM Mono,monospace', letterSpacing:'.1em' }}>SELECTED CREATIVE THESIS</div><div style={{ color:'#fff', fontSize:17, fontWeight:800, marginTop:5 }}>{selectedConcept.title}</div><div style={{ color:'#ffd3c7', fontFamily:'Playfair Display,serif', fontSize:18, marginTop:6 }}>“{selectedConcept.hook}”</div><div style={{ color:'rgba(234,229,255,.68)', fontSize:11.5, marginTop:8, lineHeight:1.55 }}>{selectedConcept.visual_recipe?.direction}</div></div>}
            <div className="engine-board-grid" style={{ display:'grid', gridTemplateColumns:'1fr .94fr', gap:15, marginTop:17 }}><div style={{ border:'1px solid rgba(255,255,255,.11)', borderRadius:13, overflow:'hidden' }}><div style={{ padding:'12px 14px', borderBottom:'1px solid rgba(255,255,255,.1)', color:'#fff', fontSize:12, fontWeight:800 }}>Platform delivery plan</div>{campaignPosts.map(post => <div key={post.id} style={{ display:'flex', justifyContent:'space-between', gap:12, padding:'13px 14px', borderBottom:'1px solid rgba(255,255,255,.08)' }}><div><div style={{ color:'#bff5e8', font:'600 9px DM Mono,monospace', letterSpacing:'.08em' }}>{platformLabel[post.platform]?.toUpperCase() || post.platform}</div><div style={{ color:'rgba(234,229,255,.76)', fontSize:11, lineHeight:1.48, marginTop:4, maxWidth:360 }}>{post.content}</div></div><span style={{ color:'#d9ff75', fontSize:10, fontWeight:750, flexShrink:0 }}>{post.status}</span></div>)}</div><div style={{ border:'1px solid rgba(255,255,255,.11)', borderRadius:13, overflow:'hidden' }}><div style={{ padding:'12px 14px', borderBottom:'1px solid rgba(255,255,255,.1)', color:'#fff', fontSize:12, fontWeight:800 }}>Creative variants</div>{campaignAssets.length ? <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:7, padding:10 }}>{campaignAssets.map(asset => <div key={asset.id} style={{ aspectRatio:'4/5', borderRadius:9, overflow:'hidden', background:'rgba(255,255,255,.07)' }}><img src={asset.asset_url} alt="Campaign creative variant" style={{ width:'100%', height:'100%', objectFit:'cover' }} /></div>)}</div> : <div style={{ padding:20, minHeight:180, display:'grid', placeItems:'center', textAlign:'center', color:'rgba(234,229,255,.55)', fontSize:11.5, lineHeight:1.55 }}>Your selected campaign angle is ready for visual production. Render the first three real image variants when you are ready to spend 30 tokens.</div>}</div></div>
          </section>}
          {error && <div style={{ margin:'0 28px 24px', padding:'10px 12px', borderRadius:10, background:'rgba(255,91,53,.15)', color:'#ffc7b9', border:'1px solid rgba(255,91,53,.25)', fontSize:11.5 }}>{error}</div>}
        </main>

        <aside style={{ display:'grid', gap:18 }}>
          <section className="studio-dark" style={{ padding:20 }}><div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}><span className="studio-kicker" style={{ color:'#d9ff75' }}>Engine status</span><span className="status-dot" /></div><div style={{ color:'#fff', fontSize:21, fontWeight:850, letterSpacing:'-.06em', marginTop:15 }}>{stage === 'intake' ? 'Start with what is true.' : stage === 'dna' ? 'Set the creative guardrails.' : stage === 'angles' ? 'Choose the strongest point of view.' : 'The work is connected now.'}</div><p style={{ color:'rgba(255,250,244,.65)', fontSize:11.5, lineHeight:1.65, marginTop:10 }}>{stage === 'board' ? 'Post copy, assets, render jobs, and campaign context now share one durable record system.' : 'Flo keeps inputs visible so you can correct the strategy before it turns into expensive production.'}</p></section>
          <section className="studio-panel" style={{ padding:18, background:'rgba(255,255,255,.74)' }}><div className="studio-kicker">Recent campaign memory</div>{workspace.campaigns.length ? <div style={{ display:'grid', gap:9, marginTop:12 }}>{workspace.campaigns.slice(0,4).map(item => <button key={item.id} onClick={() => openExistingCampaign(item)} style={{ textAlign:'left', background:'transparent', border:'none', borderTop:'1px solid rgba(22,19,29,.11)', padding:'10px 0', cursor:'pointer', fontFamily:'inherit' }}><div style={{ fontSize:11.5, color:'#18152a', fontWeight:800, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name}</div><div style={{ fontSize:9.5, color:'#746f80', marginTop:3 }}>{item.status.replaceAll('_',' ')} · {new Date(item.created_at).toLocaleDateString()}</div></button>)}</div> : <p style={{ color:'#746f80', fontSize:11.5, lineHeight:1.55, marginTop:10 }}>The campaigns you build here become reusable institutional memory for each brand and product.</p>}</section>
        </aside>
      </div>
    </div>
  </Layout>
}
