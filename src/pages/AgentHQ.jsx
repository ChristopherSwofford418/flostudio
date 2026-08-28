import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { supabase } from '../supabase'
import { useWorkspace } from '../context/WorkspaceContext'
import { createCampaign, createCampaignPosts, generateCampaignVariant, listCampaignMedia, loadCampaignWorkspace, saveBrandAndProduct, saveCampaignConcepts, selectCampaignConcept, updateCampaignConcept } from '../lib/campaignEngine'
import { buildNextBestCreative, recordMemoryEvent } from '../lib/creativeMemory'

const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyZWYiOiJ4eGtwdm9raHFicGJxZWZlZ3hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMDI1NDgsImV4cCI6MjA5Nzc3MDI1NDh9.OVdLzh2Bvuf4l6F6ITSpj4pWqoc3EoTxs6OCvrMf4JU'
const platforms = ['instagram', 'facebook', 'linkedin', 'tiktok']
const platformLabel = { instagram:'Instagram', facebook:'Facebook', linkedin:'LinkedIn', tiktok:'TikTok' }
const stageOrder = ['intake','dna','angles','board']
const riskyClaimPattern = /(?:\b(?:guaranteed|proven|superior|best|#1|number one|more features|customers report|increased|boosted|saved)\b|\b\d+(?:\.\d+)?\s*%|\b\d+(?:\.\d+)?x\b|\b(?:better|more|faster)\b[\w\s]{0,35}\bthan\b)/i
const safeProof = 'Show the product making a specific, observable step easier for the intended audience.'
const safeCta = 'Explore the next step.'

function normalizeConceptClaims(concept, trustedText) {
  const trusted = String(trustedText || '').toLowerCase()
  const safe = value => {
    const text = String(value || '').trim()
    return text && (!riskyClaimPattern.test(text) || (trusted && text.toLowerCase().includes(trusted))) ? text : ''
  }
  const hook = safe(concept.hook) || 'What would a clearer next step feel like?'
  const proof = safe(concept.proof) || safeProof
  const cta = safe(concept.cta) || safeCta
  const script = { ...(concept.script || {}) }
  const scriptKey = script.fifteen_second !== undefined ? 'fifteen_second' : script['15_second'] !== undefined ? '15_second' : 'fifteen_second'
  script[scriptKey] = safe(script[scriptKey]) || `Hook: ${hook}\nProof: ${safeProof}\nCTA: ${cta}`
  return { ...concept, hook, proof, cta, script }
}

const fieldStyle = { width:'100%', boxSizing:'border-box', background:'rgba(16,16,16,.48)', border:'1px solid rgba(247,247,247,.18)', borderRadius:3, color:'#ffffff', padding:'12px 13px', outline:'none', font:'inherit', fontSize:12.5, lineHeight:1.55 }

async function callAI(messages, maxTokens = 1600) {
  const response = await fetch('https://xxkpvnokhqbpbqefegxa.supabase.co/functions/v1/ai-proxy', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${ANON}`, apikey:ANON }, body:JSON.stringify({ model:'gpt-4o', messages, max_tokens:maxTokens }) })
  const payload = await response.json()
  return payload?.content || payload?.choices?.[0]?.message?.content || ''
}

function fallbackConcepts({ brand, product, offer }) {
  const briefs = [
    ['The problem becomes simple','Pain-to-clarity',`Still losing time to ${product || 'the old way'}?`,'Editorial before-and-after story with bold product focus.'],
    ['Proof over promises','Outcome-led proof',`What changes when ${product || brand} is working for you?`,'Confident product demonstration with high-trust visual proof.'],
    ['A better daily ritual','Lifestyle transformation','Your next favorite routine starts here.','Cinematic lifestyle moment with warm human momentum.'],
    ['The switch worth making','Alternative comparison',`There is a simpler way to handle ${product || 'this'}.`,'Clean side-by-side contrast between friction and the better path.'],
    ['One feature, fully felt','Feature spotlight',`The ${product || 'feature'} detail you notice every day.`,'Macro product detail with a deliberate, tactile editorial frame.'],
    ['The skeptical first look','Objection reversal',`I did not expect ${product || brand} to make this much difference.`,'Creator-native first-impression scene with honest visual restraint.'],
    ['The fast-start moment','Speed and ease',`From blank page to useful outcome in minutes.`,'Energetic screen-led walkthrough with clear sequential proof.'],
    ['Built for the busy day','Audience identity',`For people who need the useful part without the ceremony.`,'Human-in-context product use inside a focused everyday routine.'],
    ['The future state','Aspirational identity',`This is what a more confident ${product || 'workflow'} feels like.`,'Premium lifestyle aspiration grounded by visible product evidence.'],
    ['The reason to act now','Activation and CTA',`Your next step is smaller than you think.`,'High-contrast announcement composition with one decisive action.'],
  ]
  return briefs.map(([title, angle, hook, direction]) => ({ title, angle, hook, proof:`${brand || 'This product'} turns a real moment of friction into a clearer, more useful next step without unsupported promises.`, cta:offer || 'See the next step.', visual_recipe:{ direction }, script:{ fifteen_second:`Hook: ${hook}\nProof: Show the product making the outcome concrete.\nCTA: ${offer || 'See the next step.'}` } }))
}

export default function AgentHQ() {
  const navigate = useNavigate()
  const { activeApp, tokens, useTokens } = useWorkspace()
  const [stage, setStage] = useState('intake')
  const [userId, setUserId] = useState(null)
  const [workspace, setWorkspace] = useState({ brands:[], products:[], campaigns:[], media:[] })
  const [activeBrandId, setActiveBrandId] = useState(null)
  const [memoryBrief, setMemoryBrief] = useState(null)
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
  const [editingConcept, setEditingConcept] = useState(null)
  const [scriptDraft, setScriptDraft] = useState('')
  const [savingConcept, setSavingConcept] = useState(false)

  const stageIndex = stageOrder.indexOf(stage)
  const campaignName = useMemo(() => `${brandName || 'New brand'} — ${offerText || objective || 'Campaign'}`, [brandName, offerText, objective])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data:{ user } }) => {
      if (!user) return
      setUserId(user.id)
      try {
        const loaded = await loadCampaignWorkspace(user.id)
        setWorkspace(loaded)
        if (loaded.brands[0]) {
          setActiveBrandId(loaded.brands[0].id)
          setMemoryBrief(await buildNextBestCreative({ userId:user.id, brandId:loaded.brands[0].id }))
        }
      } catch {}
    })
  }, [])

  const refreshWorkspace = async () => { if (userId) setWorkspace(await loadCampaignWorkspace(userId)) }
  const refreshMemory = async brandId => {
    if (!userId || !brandId) return
    try { setMemoryBrief(await buildNextBestCreative({ userId, brandId })) } catch {}
  }
  const togglePlatform = platform => setSelectedPlatforms(previous => previous.includes(platform) ? previous.filter(item => item !== platform) : [...previous, platform])
  const beginEditConcept = concept => { setEditingConcept({ ...concept, visual_recipe:{ ...(concept.visual_recipe || {}) }, script:{ ...(concept.script || {}) } }); setScriptDraft(concept.script?.fifteen_second || concept.script?.['15_second'] || '') }
  const cancelEditConcept = () => { setEditingConcept(null); setScriptDraft('') }
  const saveConceptEdit = async () => {
    if (!editingConcept || !userId) return
    setSavingConcept(true); setError('')
    try {
      const updates = { hook:editingConcept.hook, proof:editingConcept.proof, cta:editingConcept.cta, visual_recipe:{ ...(editingConcept.visual_recipe || {}) }, script:{ ...(editingConcept.script || {}), fifteen_second:scriptDraft } }
      const saved = await updateCampaignConcept({ userId, conceptId:editingConcept.id, updates })
      setConcepts(previous => previous.map(concept => concept.id === saved.id ? saved : concept))
      setSelectedConcept(previous => previous?.id === saved.id ? saved : previous)
      cancelEditConcept()
    } catch (editError) { setError(editError.message || 'Flo could not save this creative edit.') }
    finally { setSavingConcept(false) }
  }

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
        { role:'system', content:'You are FloStudio’s creative strategy director. Return valid JSON only: an array of exactly 10 materially different campaign concepts. Each object must have title, angle, hook, proof, cta, visual_recipe with a direction field, and script with a fifteen_second field containing a concise 15-second spoken script with Hook, Proof, and CTA beats. Vary the angles across pain-to-clarity, outcome proof, lifestyle transformation, comparison, feature spotlight, objection reversal, speed, audience identity, aspiration, and activation. Be specific and do not make unsupported claims.' },
        { role:'user', content:`Brand: ${brandName}\nProduct: ${productName}\nDescription: ${description || 'Not provided'}\nOffer: ${offerText || 'Not provided'}\nAudience: ${audience || 'Not provided'}\nObjective: ${objective}\nBrand voice: ${brandDna.voice}\nVisual direction: ${brandDna.visualDirection}\nProof points: ${brandDna.proofPoints || 'Use only prudent generic proof'}\nRestrictions: ${brandDna.restrictedClaims || 'No unsupported claims'}\nCreate ten materially different campaign angles. Use only the supplied description, audience, offer, source facts, and approved proof points. If no verified numeric or comparative proof is supplied, do not invent it.` }
      ], 1800)
      let parsed = []
      try { const match = generated.replace(/```json|```/g, '').match(/\[[\s\S]*\]/); parsed = match ? JSON.parse(match[0]) : [] } catch {}
      if (!Array.isArray(parsed) || parsed.length < 10) parsed = fallbackConcepts({ brand:brandName, product:productName, offer:offerText })
      const trustedText = `${description}\n${sourceFacts}\n${brandDna.proofPoints || ''}`
      const normalized = parsed.slice(0,10).map(concept => normalizeConceptClaims(concept, trustedText))
      const stored = await saveCampaignConcepts({ userId, campaignId:newCampaign.id, concepts:normalized })
      setActiveBrandId(brand.id); setCampaign(newCampaign); setConcepts(stored); setStage('angles'); await refreshWorkspace(); await refreshMemory(brand.id)
    } catch (campaignError) { setError(campaignError.message || 'Flo could not create campaign angles. Please try again.') }
    finally { setBusy('') }
  }

  const chooseConcept = async concept => {
    if (!campaign) return
    setBusy(`choose-${concept.id}`); setError('')
    try {
      const result = await selectCampaignConcept(campaign.id, concept.id)
      const posts = await createCampaignPosts({ userId, campaignId:campaign.id, concept, platforms:selectedPlatforms.length ? selectedPlatforms : ['instagram'] })
      await recordMemoryEvent({ userId, brandId:result.campaign.brand_id, campaignId:campaign.id, conceptId:concept.id, eventType:'concept_selected', attributes:{ title:concept.title, angle:concept.angle, hook:concept.hook } })
      setCampaign(result.campaign); setSelectedConcept(result.concept); setCampaignPosts(posts); setStage('board'); await refreshWorkspace(); await refreshMemory(result.campaign.brand_id)
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
    setCampaignAssets(previous => [...created, ...previous]); await refreshWorkspace(); await refreshMemory(campaign.brand_id)
  }

  const openExistingCampaign = async item => {
    setBusy('open-campaign')
    try {
      const conceptsResult = await supabase.from('campaign_concepts').select('*').eq('campaign_id', item.id).order('created_at')
      const postsResult = await supabase.from('campaign_posts').select('*').eq('campaign_id', item.id).order('created_at')
      const assets = await listCampaignMedia(item.id)
      const selected = conceptsResult.data?.find(concept => concept.id === item.selected_concept_id) || conceptsResult.data?.find(concept => concept.status === 'selected') || null
      setActiveBrandId(item.brand_id); setCampaign(item); setConcepts(conceptsResult.data || []); setSelectedConcept(selected); setCampaignPosts(postsResult.data || []); setCampaignAssets(assets); setStage(selected ? 'board' : 'angles'); await refreshMemory(item.brand_id)
    } catch (openError) { setError(openError.message || 'Flo could not load that campaign.') }
    finally { setBusy('') }
  }

  const startOver = () => { setStage('intake'); setCampaign(null); setConcepts([]); setSelectedConcept(null); setCampaignPosts([]); setCampaignAssets([]); setRenderProgress(null); setError('') }

  return <Layout title="Campaign Engine">
    <style>{`
      @keyframes engineEnter{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
      /* Campaign Engine is an intentional dark production workspace; keep its defined hierarchy instead of inheriting generic light panels. */
      .engine-ledger .engine-header{background:linear-gradient(132deg,#181932 0%,#29275b 54%,#34307c 100%)!important;border-color:rgba(166,160,255,.36)!important}.flo-main .engine-ledger .studio-dark.engine-header :is(h1,h2,h3,h4){color:#fff!important}.flo-main .engine-ledger .studio-dark.engine-header .studio-serif{color:#cbc7ff!important}.flo-main .engine-ledger .studio-dark.engine-header .studio-kicker{color:#b8b4ff!important}.flo-main .engine-ledger .studio-dark.engine-header p{color:rgba(244,245,255,.80)!important}.engine-ledger .engine-actions{position:static!important;right:auto!important;bottom:auto!important;flex-wrap:wrap;margin-top:20px}.engine-ledger .engine-actions .studio-chip{background:rgba(255,255,255,.10)!important;border-color:rgba(255,255,255,.20)!important;color:#fff!important}.engine-ledger .engine-actions .studio-chip:last-child{background:linear-gradient(135deg,#837afc,#6259ed)!important;border-color:#8179f9!important;color:#fff!important}
      .engine-ledger .engine-stat-grid .abundance-card{background:linear-gradient(145deg,#202144,#16172f)!important;border-color:rgba(173,168,255,.22)!important;box-shadow:0 14px 28px rgba(24,25,62,.14)!important}.engine-ledger .engine-stat-grid .abundance-card>div:first-child{color:#fff!important}
      .engine-ledger .engine-rail,.engine-ledger main.studio-panel,.engine-ledger .engine-memory,.engine-ledger .engine-recent{background:linear-gradient(160deg,#202144,#121329)!important;border-color:rgba(255,255,255,.13)!important;box-shadow:0 16px 30px rgba(18,18,50,.12)!important}.engine-ledger .engine-memory,.engine-ledger .engine-recent{background:linear-gradient(160deg,#252650,#15162f)!important}.engine-ledger .engine-rail .studio-kicker{color:#b8b4ff!important}.engine-ledger .engine-rail>div:last-child{color:rgba(240,241,255,.68)!important}.engine-ledger .engine-rail button>div:nth-child(2){color:#fff!important}.engine-ledger .engine-rail button>div:nth-child(3){color:rgba(240,241,255,.66)!important}
      @media(max-width:1060px){.engine-grid,.engine-intake-grid,.engine-board-grid{grid-template-columns:1fr!important}.engine-rail{display:none!important}.engine-header{padding:28px!important}.engine-stat-grid{grid-template-columns:repeat(2,1fr)!important}} @media(max-width:640px){.engine-stat-grid{grid-template-columns:1fr!important}.engine-fields{grid-template-columns:1fr!important}.engine-hero-title{font-size:38px!important}}
    `}</style>
    <div className="flo-page engine-ledger" style={{ maxWidth:1360, margin:'0 auto', animation:'engineEnter .42s var(--ease-out)' }}>
      <section className="studio-dark flo-dark-surface engine-header" style={{ position:'relative', overflow:'hidden', minHeight:296, padding:'37px 42px', marginBottom:18 }}>
        <div style={{ position:'absolute', width:420, height:420, right:-150, top:-230, borderRadius:'50%', background:'radial-gradient(circle,#c5c5c5 0%,#868686 32%,rgba(134,134,134,0) 70%)', opacity:.70 }} />
        <div style={{ position:'absolute', width:240, height:240, right:120, bottom:-130, borderRadius:3, background:'linear-gradient(140deg,#c5c5c5,#7c7c7c)', transform:'rotate(24deg)', opacity:.76 }} />
        <div style={{ position:'relative', maxWidth:800 }}>
          <div className="studio-kicker" style={{ marginBottom:15 }}>FloStudio / Product-to-campaign engine</div>
          <h1 className="studio-display engine-hero-title" style={{ maxWidth:760 }}>Turn a product into a <span className="studio-serif" style={{ color:'var(--vermilion)' }}>creative program.</span></h1>
          <p style={{ maxWidth:630, marginTop:16, color:'rgba(240,240,240,.74)', fontSize:13.5, lineHeight:1.7 }}>Flo learns the product and its rules first, then creates campaign angles, review-ready platform posts, and real creative variants that stay connected to the campaign.</p>
          <div className="engine-actions" style={{ position:'absolute', right:-335, bottom:3, display:'flex', gap:8 }}><span className="studio-chip" style={{ background:'rgba(240,240,240,.1)', borderColor:'rgba(240,240,240,.2)', color:'#ffffff' }}>{tokens} creative tokens</span><button onClick={startOver} className="studio-chip" style={{ background:'var(--signal)', borderColor:'var(--signal)', color:'var(--ink-deep)' }}>New campaign</button></div>
        </div>
      </section>

      <div className="engine-stat-grid" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:18 }}>
        {[[workspace.brands.length,'Brand profiles','var(--signal)'],[workspace.products.length,'Products','var(--teal)'],[workspace.campaigns.length,'Campaigns','var(--vermilion)'],[workspace.media.length,'Creative assets','var(--yellow)']].map(([value,label,color]) => <div key={label} className="abundance-card" style={{ padding:'16px 18px' }}><div style={{ fontSize:25, fontWeight:850, color:'#ffffff', letterSpacing:'-.07em' }}>{value}</div><div style={{ color, font:'600 9.5px DM Mono,monospace', letterSpacing:'.08em', marginTop:4 }}>{label.toUpperCase()}</div></div>)}
      </div>

      <div className="engine-grid" style={{ display:'grid', gridTemplateColumns:'178px minmax(0,1fr) 290px', gap:18, alignItems:'start' }}>
        <aside className="engine-rail studio-panel" style={{ padding:'16px', background:'linear-gradient(160deg,#292929,#111111)', borderColor:'rgba(247,247,247,.15)' }}>
          <div className="studio-kicker" style={{ color:'#c5c5c5', marginBottom:14 }}>Campaign run</div>
          {[["01",'Product intake','Bring the offer into focus'],["02",'Brand DNA','Define what must stay true'],["03",'Campaign angles','Choose the creative thesis'],["04",'Creative board','Render, review, and ship']].map(([number,title,detail], index) => <button key={number} onClick={() => index <= stageIndex && setStage(stageOrder[index])} style={{ width:'100%', textAlign:'left', padding:'12px 0', border:'none', borderTop:index ? '1px solid rgba(255,255,255,.1)' : 'none', background:'transparent', cursor:index <= stageIndex ? 'pointer' : 'default', opacity:index <= stageIndex ? 1 : .38, fontFamily:'inherit' }}><div style={{ font:'500 9px DM Mono,monospace', color:index === stageIndex ? '#adadad' : '#a0a0a0' }}>{number}</div><div style={{ color:'#ffffff', fontSize:11.5, fontWeight:800, marginTop:3 }}>{title}</div><div style={{ color:'rgba(232,232,232,.55)', fontSize:9.5, lineHeight:1.4, marginTop:3 }}>{detail}</div></button>)}
          <div style={{ marginTop:16, paddingTop:14, borderTop:'1px solid rgba(255,255,255,.1)', color:'rgba(232,232,232,.54)', fontSize:10.5, lineHeight:1.55 }}>Every output is attached to a campaign record, not lost in a prompt history.</div>
        </aside>

        <main className="studio-panel" style={{ overflow:'hidden', background:'linear-gradient(145deg,#2f2f2f,#121212)', borderColor:'rgba(197,197,197,.28)' }}>
          {stage === 'intake' && <section style={{ padding:'26px 28px' }}>
            <div className="studio-kicker" style={{ color:'#c5c5c5' }}>01 / Product intake</div><h2 style={{ color:'#ffffff', fontSize:27, letterSpacing:'-.06em', marginTop:7 }}>What are we taking to market?</h2><p style={{ color:'rgba(247,247,247,.68)', fontSize:12, lineHeight:1.65, marginTop:8, maxWidth:650 }}>Start with a live product page, app listing, or your own facts. Flo uses only the details you confirm in the next step.</p>
            <div style={{ display:'grid', gap:16, marginTop:23 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:10 }}><input value={websiteUrl} onChange={event => setWebsiteUrl(event.target.value)} placeholder="https://your-product.com or app listing URL" style={fieldStyle} /><button onClick={analyzeUrl} disabled={busy === 'analyze-url'} className="studio-button studio-button--soft">{busy === 'analyze-url' ? 'Reading…' : 'Learn URL'}</button></div>
              {urlState && <div style={{ padding:'10px 12px', borderRadius:10, background:'rgba(170,170,170,.12)', border:'1px solid rgba(170,170,170,.30)', color:'#cacaca', fontSize:11.5 }}>{urlState}</div>}
              <div className="engine-fields" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}><label style={{ display:'grid', gap:7 }}><span style={{ color:'#ffffff', fontWeight:750, fontSize:11.5 }}>Brand / company</span><input value={brandName} onChange={event => setBrandName(event.target.value)} placeholder="FloStudio, BoothProfit, your brand…" style={fieldStyle} /></label><label style={{ display:'grid', gap:7 }}><span style={{ color:'#ffffff', fontWeight:750, fontSize:11.5 }}>Product or offer</span><input value={productName} onChange={event => setProductName(event.target.value)} placeholder="What customers actually buy" style={fieldStyle} /></label></div>
              <label style={{ display:'grid', gap:7 }}><span style={{ color:'#ffffff', fontWeight:750, fontSize:11.5 }}>Describe the product in plain language</span><textarea value={description} onChange={event => setDescription(event.target.value)} rows={4} placeholder="Who it helps, the moment it matters, and what changes for them." style={{ ...fieldStyle, resize:'vertical' }} /></label>
              <div className="engine-fields" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}><label style={{ display:'grid', gap:7 }}><span style={{ color:'#ffffff', fontWeight:750, fontSize:11.5 }}>Offer or CTA</span><input value={offerText} onChange={event => setOfferText(event.target.value)} placeholder="Try it free, book a demo, download now…" style={fieldStyle} /></label><label style={{ display:'grid', gap:7 }}><span style={{ color:'#ffffff', fontWeight:750, fontSize:11.5 }}>Business objective</span><input value={objective} onChange={event => setObjective(event.target.value)} placeholder="Awareness, leads, activation…" style={fieldStyle} /></label></div>
              <button onClick={() => setStage('dna')} className="studio-button" style={{ justifySelf:'start', padding:'12px 19px' }}>Continue to Brand DNA →</button>
            </div>
          </section>}

          {stage === 'dna' && <section style={{ padding:'26px 28px' }}>
            <div className="studio-kicker" style={{ color:'#ededed' }}>02 / Brand DNA</div><h2 style={{ color:'#ffffff', fontSize:27, letterSpacing:'-.06em', marginTop:7 }}>Set the rules Flo should never forget.</h2><p style={{ color:'rgba(232,232,232,.62)', fontSize:12, lineHeight:1.65, marginTop:8 }}>This is the durable context that will travel with your campaigns, not a one-time prompt preference.</p>
            <div style={{ display:'grid', gap:15, marginTop:23 }}>
              <div className="engine-fields" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}><label style={{ display:'grid', gap:7 }}><span style={{ color:'#ffffff', fontWeight:750, fontSize:11.5 }}>Brand voice</span><input value={brandDna.voice} onChange={event => setBrandDna(previous => ({ ...previous, voice:event.target.value }))} style={fieldStyle} /></label><label style={{ display:'grid', gap:7 }}><span style={{ color:'#ffffff', fontWeight:750, fontSize:11.5 }}>Visual direction</span><input value={brandDna.visualDirection} onChange={event => setBrandDna(previous => ({ ...previous, visualDirection:event.target.value }))} style={fieldStyle} /></label></div>
              <label style={{ display:'grid', gap:7 }}><span style={{ color:'#ffffff', fontWeight:750, fontSize:11.5 }}>Who is this for?</span><textarea value={audience} onChange={event => setAudience(event.target.value)} rows={3} placeholder="Describe their role, mindset, friction, and what makes them ready to act." style={{ ...fieldStyle, resize:'vertical' }} /></label>
              <label style={{ display:'grid', gap:7 }}><span style={{ color:'#ffffff', fontWeight:750, fontSize:11.5 }}>Approved proof points</span><textarea value={brandDna.proofPoints} onChange={event => setBrandDna(previous => ({ ...previous, proofPoints:event.target.value }))} rows={3} placeholder="Customer results, product facts, features, testimonials, pricing—only claims you can stand behind." style={{ ...fieldStyle, resize:'vertical' }} /></label>
              <label style={{ display:'grid', gap:7 }}><span style={{ color:'#ffffff', fontWeight:750, fontSize:11.5 }}>Claims or language to avoid</span><input value={brandDna.restrictedClaims} onChange={event => setBrandDna(previous => ({ ...previous, restrictedClaims:event.target.value }))} placeholder="e.g. no guaranteed results, no medical claims, no discount language" style={fieldStyle} /></label>
              <div><div style={{ color:'#ffffff', fontWeight:750, fontSize:11.5, marginBottom:8 }}>Where should this campaign land?</div><div style={{ display:'flex', flexWrap:'wrap', gap:7 }}>{platforms.map(platform => <button key={platform} onClick={() => togglePlatform(platform)} className="studio-chip" style={{ background:selectedPlatforms.includes(platform) ? 'linear-gradient(135deg,#7c7c7c,#c5c5c5)' : 'rgba(255,255,255,.06)', color:'#ffffff', borderColor:selectedPlatforms.includes(platform) ? 'transparent' : 'rgba(255,255,255,.14)' }}>{platformLabel[platform]}</button>)}</div></div>
              <div style={{ display:'flex', gap:9, flexWrap:'wrap' }}><button onClick={() => setStage('intake')} className="studio-button studio-button--soft">← Product</button><button onClick={createAngles} disabled={busy === 'create-angles'} className="studio-button">{busy === 'create-angles' ? 'Finding angles…' : 'Create campaign angles →'}</button></div>
            </div>
          </section>}

                        {stage === 'angles' && <section style={{ padding:'26px 28px' }}>
            <div className="studio-kicker" style={{ color:'#ededed' }}>03 / Campaign angles & batch creator</div><h2 style={{ color:'#ffffff', fontSize:27, letterSpacing:'-.06em', marginTop:7 }}>Build a creative matrix before you spend on renders.</h2><p style={{ color:'rgba(232,232,232,.62)', fontSize:12, lineHeight:1.65, marginTop:8 }}>Flo now produces ten distinct campaign theses from one product intake. Edit the hook, proof, CTA, visual direction, and 15-second script before selecting the angle that should become your production board.</p><div style={{ display:'grid', gap:11, marginTop:22 }}>{concepts.map((concept, index) => <article key={concept.id} style={{ padding:'17px 18px', borderRadius:14, border:'1px solid rgba(255,255,255,.13)', background:index === 0 ? 'linear-gradient(120deg,rgba(114,114,114,.22),rgba(123,123,123,.1))' : 'rgba(255,255,255,.035)' }}><div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:15 }}><div style={{ flex:1, minWidth:0 }}><div style={{ color:'#ededed', font:'600 9px DM Mono,monospace', letterSpacing:'.1em' }}>ANGLE {String(index + 1).padStart(2,'0')} / {concept.angle}</div><h3 style={{ color:'#ffffff', fontSize:18, letterSpacing:'-.05em', marginTop:5 }}>{concept.title}</h3><div style={{ color:'#dbdbdb', fontFamily:'Playfair Display,serif', fontSize:17, marginTop:10 }}>“{concept.hook}”</div><p style={{ color:'rgba(232,232,232,.7)', fontSize:11.5, lineHeight:1.6, marginTop:8, maxWidth:610 }}>{concept.proof}</p><div style={{ color:'#e9e9e9', fontSize:11, fontWeight:750, marginTop:9 }}>CTA: {concept.cta}</div><div style={{ color:'rgba(232,232,232,.5)', fontSize:10.5, marginTop:8 }}>Visual lens: {concept.visual_recipe?.direction || 'Editorial product story'}</div></div><div style={{ display:'grid', gap:7, flexShrink:0 }}><button onClick={() => beginEditConcept(concept)} className="studio-button studio-button--soft" style={{ fontSize:10 }}>{editingConcept?.id === concept.id ? 'Editing' : 'Edit script & hook'}</button><button onClick={() => chooseConcept(concept)} disabled={busy === `choose-${concept.id}`} className="studio-button" style={{ fontSize:10 }}>{busy === `choose-${concept.id}` ? 'Building…' : 'Choose angle'}</button></div></div>{editingConcept?.id === concept.id && <div style={{ display:'grid', gap:10, marginTop:16, paddingTop:15, borderTop:'1px solid rgba(255,255,255,.12)' }}><div style={{ color:'#ededed', font:'600 9px DM Mono,monospace', letterSpacing:'.1em' }}>EDITABLE CREATIVE DIRECTION</div><input value={editingConcept.hook || ''} onChange={event => setEditingConcept(previous => ({ ...previous, hook:event.target.value }))} placeholder="Opening hook" style={fieldStyle} /><textarea value={editingConcept.proof || ''} onChange={event => setEditingConcept(previous => ({ ...previous, proof:event.target.value }))} rows={2} placeholder="Proof beat" style={{ ...fieldStyle, resize:'vertical' }} /><input value={editingConcept.cta || ''} onChange={event => setEditingConcept(previous => ({ ...previous, cta:event.target.value }))} placeholder="Call to action" style={fieldStyle} /><input value={editingConcept.visual_recipe?.direction || ''} onChange={event => setEditingConcept(previous => ({ ...previous, visual_recipe:{ ...(previous.visual_recipe || {}), direction:event.target.value } }))} placeholder="Visual direction" style={fieldStyle} /><textarea value={scriptDraft} onChange={event => setScriptDraft(event.target.value)} rows={5} placeholder="Hook: ...\nProof: ...\nCTA: ..." style={{ ...fieldStyle, resize:'vertical' }} /><div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}><button onClick={cancelEditConcept} className="studio-button studio-button--soft" style={{ fontSize:10 }}>Cancel</button><button onClick={saveConceptEdit} disabled={savingConcept} className="studio-button" style={{ fontSize:10 }}>{savingConcept ? 'Saving…' : 'Save creative direction'}</button></div></div>}</article>)}</div>
          </section>}

          {stage === 'board' && <section style={{ padding:'26px 28px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:16, alignItems:'flex-start', flexWrap:'wrap' }}><div><div className="studio-kicker" style={{ color:'#ededed' }}>04 / Campaign board</div><h2 style={{ color:'#ffffff', fontSize:27, letterSpacing:'-.06em', marginTop:7 }}>{campaign?.name}</h2><p style={{ color:'rgba(232,232,232,.62)', fontSize:12, lineHeight:1.65, marginTop:8 }}>One selected concept, connected posts, and real creative variants. Everything here follows the campaign into review and planning.</p></div><div style={{ display:'flex', gap:8, flexWrap:'wrap' }}><button onClick={renderVariants} disabled={Boolean(renderProgress && renderProgress.complete < renderProgress.total)} className="studio-button">{renderProgress ? `Rendering ${renderProgress.complete}/${renderProgress.total}` : 'Render 3 campaign visuals · 30'}</button><button onClick={() => navigate('/pipeline')} className="studio-button studio-button--soft">Open Review Queue →</button></div></div>
            {selectedConcept && <div style={{ padding:'15px 16px', marginTop:20, borderRadius:13, background:'rgba(114,114,114,.16)', border:'1px solid rgba(197,197,197,.18)' }}><div style={{ color:'#ededed', font:'600 9px DM Mono,monospace', letterSpacing:'.1em' }}>SELECTED CREATIVE THESIS</div><div style={{ color:'#ffffff', fontSize:17, fontWeight:800, marginTop:5 }}>{selectedConcept.title}</div><div style={{ color:'#dbdbdb', fontFamily:'Playfair Display,serif', fontSize:18, marginTop:6 }}>“{selectedConcept.hook}”</div><div style={{ color:'rgba(232,232,232,.68)', fontSize:11.5, marginTop:8, lineHeight:1.55 }}>{selectedConcept.visual_recipe?.direction}</div></div>}
            <div className="engine-board-grid" style={{ display:'grid', gridTemplateColumns:'1fr .94fr', gap:15, marginTop:17 }}><div style={{ border:'1px solid rgba(255,255,255,.11)', borderRadius:13, overflow:'hidden' }}><div style={{ padding:'12px 14px', borderBottom:'1px solid rgba(255,255,255,.1)', color:'#ffffff', fontSize:12, fontWeight:800 }}>Platform delivery plan</div>{campaignPosts.map(post => <div key={post.id} style={{ display:'flex', justifyContent:'space-between', gap:12, padding:'13px 14px', borderBottom:'1px solid rgba(255,255,255,.08)' }}><div><div style={{ color:'#e9e9e9', font:'600 9px DM Mono,monospace', letterSpacing:'.08em' }}>{platformLabel[post.platform]?.toUpperCase() || post.platform}</div><div style={{ color:'rgba(232,232,232,.76)', fontSize:11, lineHeight:1.48, marginTop:4, maxWidth:360 }}>{post.content}</div></div><span style={{ color:'#ededed', fontSize:10, fontWeight:750, flexShrink:0 }}>{post.status}</span></div>)}</div><div style={{ border:'1px solid rgba(255,255,255,.11)', borderRadius:13, overflow:'hidden' }}><div style={{ padding:'12px 14px', borderBottom:'1px solid rgba(255,255,255,.1)', color:'#ffffff', fontSize:12, fontWeight:800 }}>Creative variants</div>{campaignAssets.length ? <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:7, padding:10 }}>{campaignAssets.map(asset => <div key={asset.id} style={{ aspectRatio:'4/5', borderRadius:9, overflow:'hidden', background:'rgba(255,255,255,.07)' }}><img src={asset.asset_url} alt="Campaign creative variant" style={{ width:'100%', height:'100%', objectFit:'cover' }} /></div>)}</div> : <div style={{ padding:20, minHeight:180, display:'grid', placeItems:'center', textAlign:'center', color:'rgba(232,232,232,.55)', fontSize:11.5, lineHeight:1.55 }}>Your selected campaign angle is ready for visual production. Render the first three real image variants when you are ready to spend 30 tokens.</div>}</div></div>
          </section>}
          {error && <div style={{ margin:'0 28px 24px', padding:'10px 12px', borderRadius:10, background:'rgba(123,123,123,.15)', color:'#d2d2d2', border:'1px solid rgba(123,123,123,.25)', fontSize:11.5 }}>{error}</div>}
        </main>

        <aside style={{ display:'grid', gap:18 }}>
          <section className="studio-dark" style={{ padding:20 }}><div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}><span className="studio-kicker" style={{ color:'#ededed' }}>Engine status</span><span className="status-dot" /></div><div style={{ color:'#ffffff', fontSize:21, fontWeight:850, letterSpacing:'-.06em', marginTop:15 }}>{stage === 'intake' ? 'Start with what is true.' : stage === 'dna' ? 'Set the creative guardrails.' : stage === 'angles' ? 'Choose the strongest point of view.' : 'The work is connected now.'}</div><p style={{ color:'rgba(251,251,251,.65)', fontSize:11.5, lineHeight:1.65, marginTop:10 }}>{stage === 'board' ? 'Post copy, assets, render jobs, and campaign context now share one durable record system.' : 'Flo keeps inputs visible so you can correct the strategy before it turns into expensive production.'}</p></section>
          <section className="studio-panel engine-memory" style={{ padding:18, background:'linear-gradient(145deg,#282828,#373737)', borderColor:'rgba(170,170,170,.38)' }}><div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}><div className="studio-kicker" style={{ color:'#cacaca' }}>Creative Memory</div><span style={{ width:8, height:8, borderRadius:'50%', background:'#aaaaaa', boxShadow:'0 0 14px #aaaaaa' }} /></div>{memoryBrief ? <><div style={{ color:'#ffffff', fontSize:15, fontWeight:850, letterSpacing:'-.045em', marginTop:12, lineHeight:1.25 }}>{memoryBrief.headline}</div><div style={{ color:'#cacaca', fontSize:10.5, fontWeight:800, marginTop:10, lineHeight:1.5 }}>{memoryBrief.state}</div><p style={{ color:'rgba(246,246,246,.76)', fontSize:10.5, lineHeight:1.55, marginTop:7 }}>{memoryBrief.nextAction}</p><div style={{ borderTop:'1px solid rgba(255,255,255,.11)', marginTop:12, paddingTop:10, color:'rgba(246,246,246,.58)', fontSize:9.5, lineHeight:1.5 }}>{memoryBrief.rationale}</div>{memoryBrief.evidence?.length ? <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginTop:10 }}>{memoryBrief.evidence.map(item => <span key={item} style={{ border:'1px solid rgba(170,170,170,.32)', color:'#e4e4e4', background:'rgba(170,170,170,.11)', padding:'4px 6px', borderRadius:6, fontSize:8.5 }}>{item}</span>)}</div> : null}</> : <p style={{ color:'rgba(246,246,246,.66)', fontSize:10.5, lineHeight:1.55, marginTop:10 }}>Flo will show evidence-linked creative guidance here after the first brand, campaign, or review decision.</p>}</section>
          <section className="studio-panel engine-recent" style={{ padding:18, background:'rgba(41,41,41,.86)', borderColor:'rgba(247,247,247,.13)' }}><div className="studio-kicker" style={{ color:'#c5c5c5' }}>Recent campaign memory</div>{workspace.campaigns.length ? <div style={{ display:'grid', gap:9, marginTop:12 }}>{workspace.campaigns.slice(0,4).map(item => <button key={item.id} onClick={() => openExistingCampaign(item)} style={{ textAlign:'left', background:'transparent', border:'none', borderTop:'1px solid rgba(255,255,255,.1)', padding:'10px 0', cursor:'pointer', fontFamily:'inherit' }}><div style={{ fontSize:11.5, color:'#ffffff', fontWeight:800, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name}</div><div style={{ fontSize:9.5, color:'rgba(247,247,247,.61)', marginTop:3 }}>{item.status.replaceAll('_',' ')} · {new Date(item.created_at).toLocaleDateString()}</div></button>)}</div> : <p style={{ color:'rgba(247,247,247,.61)', fontSize:11, lineHeight:1.55, marginTop:10 }}>The campaigns you build here become reusable institutional memory for each brand and product.</p>}</section>
        </aside>
      </div>
    </div>
  </Layout>
}
