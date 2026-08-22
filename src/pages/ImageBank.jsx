import { useEffect, useMemo, useRef, useState } from 'react'
import Layout from '../components/Layout.jsx'
import { supabase } from '../supabase'
import { useWorkspace } from '../context/WorkspaceContext'
import { belongsToProduct, createMediaAsset, listMediaAssets, removeMediaAsset, updateMediaAsset } from '../lib/mediaAssets'
import { buildVideoSourceOptions, resolvedVideoReference } from '../lib/videoReferences'

const STYLE_PRESETS = [
  { id: 'product', label: 'Product hero', desc: 'Sculptural product focus with commercial light' },
  { id: 'ugc', label: 'UGC energy', desc: 'Native, direct-response social creative' },
  { id: 'editorial', label: 'Editorial pull', desc: 'Art-directed fashion and launch language' },
  { id: 'motion', label: 'Motion-first', desc: 'Dynamic composition built for vertical placements' },
]

const ASPECT_RATIOS = [
  { id: '1:1', label: 'Square feed', visual: '1:1' },
  { id: '9:16', label: 'Stories & reels', visual: '9:16' },
  { id: '16:9', label: 'Landscape placement', visual: '16:9' },
]

const VIDEO_FORMATS = [
  { id: '720x1280', label: 'Vertical 9:16', detail: 'Reels / Shorts' },
  { id: '1280x720', label: 'Landscape 16:9', detail: 'YouTube / display' },
]

const CREATOR_MODES = [
  { id:'creator_demo', label:'UGC talk-to-camera', detail:'Original adult creator hooks, reacts, and uses the app.' },
  { id:'professional', label:'Professional at work', detail:'Original adult professional uses the product in context.' },
  { id:'customer_moment', label:'Customer moment', detail:'Original adult customer shows a credible before-and-after moment.' },
  { id:'product_only', label:'Product only', detail:'No person; keep the app screen and product motion central.' },
]

const UGC_STORY_SHAPES = [
  { id:'problem_solution', label:'Problem → product → payoff', detail:'Direct-response UGC structure with a clear outcome.' },
  { id:'testimonial', label:'Creator discovery', detail:'Natural “I found this” creator reaction with proof.' },
  { id:'screen_demo', label:'Screen-led walkthrough', detail:'Creator introduces the product, then the app does the selling.' },
]

const AD_RUNBOOKS = [
  { id:'showcase', label:'Product showcase', type:'PRODUCT HERO', style:'product', description:'Close visual proof with one clear payoff.', prompt:'Show the product as the undisputed hero. Use a strong opening composition, one concrete benefit, and a clear action moment.', video:'Premium product showcase with intentional camera movement, feature detail, and a decisive final product frame.' },
  { id:'creator', label:'Creator testimony', type:'CREATOR FORMAT', style:'ugc', description:'Natural, direct-response proof that feels native.', prompt:'Creator-led social ad with credible personal context, natural light, and an immediate problem-to-payoff story.', video:'Creator-style performance ad. Start with a natural spoken hook, show the product in use, then land the proof and direct call to action.' },
  { id:'appdemo', label:'UI walkthrough', type:'APP FORMAT', style:'motion', description:'Put the app experience directly inside the story.', prompt:'Show the supplied app or product screen as the product truth. Make the workflow legible in a fast, compelling sequence built for installs.', video:'App walkthrough ad with a clean screen-first hook, visible interaction beats, and a concise benefit-led voiceover direction.' },
  { id:'reveal', label:'Unboxing / reveal', type:'REVEAL FORMAT', style:'editorial', description:'Make the first product encounter feel worth watching.', prompt:'Build a tactile reveal moment around the product. Use anticipation, detail, and a final feature payoff instead of generic lifestyle filler.', video:'Product reveal sequence with close detail, a deliberate opening reveal, and a final hero composition built for social cutdowns.' },
  { id:'contrast', label:'Before / after', type:'PROOF FORMAT', style:'product', description:'Turn a customer friction point into visible contrast.', prompt:'Use a clear before-and-after story. Make the starting friction and final change visually unmistakable, credible, and product-led.', video:'Before-and-after ad built around a fast visual contrast, product intervention, and calm outcome reveal.' },
]

const CAMPAIGN_OBJECTIVES = [
  { id:'acquire', label:'Acquire', detail:'Make the first promise and earn the click.', prompt:'Prioritize a fast, category-clear first impression that makes a new prospect want to learn more.' },
  { id:'convert', label:'Convert', detail:'Make the value feel specific and ready now.', prompt:'Lead with a concrete product payoff, an objection-breaking proof point, and a decisive action moment.' },
  { id:'activate', label:'Activate', detail:'Show how the product changes the next session.', prompt:'Make product use feel immediately achievable and rewarding for a customer who already knows the category.' },
  { id:'announce', label:'Announce', detail:'Give a launch, update, or offer a reason to matter.', prompt:'Frame the product moment as timely, distinctive, and worth sharing without fabricated urgency.' },
]

const VISUAL_LENSES = [
  { id:'product-in-use', label:'Product in use', detail:'Show the app or product inside a believable moment.', prompt:'Integrate the product naturally into a lived-in use moment; preserve clear visual evidence of the experience.' },
  { id:'proof-led', label:'Transformation proof', detail:'Make the contrast and evidence unmistakable.', prompt:'Center credible before-and-after or problem-to-payoff contrast without relying on unsupported claims.' },
  { id:'creator-native', label:'Creator-native', detail:'Make it feel platform fluent, not overproduced.', prompt:'Use an authentic creator-led framing, natural light, and a direct response visual language.' },
  { id:'editorial', label:'Editorial aspiration', detail:'Build a premium, intentional desire state.', prompt:'Use art-directed composition, texture, light, and quiet confidence while retaining clear product truth.' },
]

function createStoryboard(runbook = AD_RUNBOOKS[0], productName = 'the product') {
  return [
    { id:'hook', label:'STOP THE SCROLL', purpose:'Interrupt the viewer with the problem or promise.', visual:`Open on ${productName} in a high-contrast, instantly legible frame.`, caption:'The first visual promise', voiceover:'Start with the sharpest honest hook.' },
    { id:'proof', label:'SHOW THE PROOF', purpose:'Make the product truth visible before asking for belief.', visual:`Show ${productName} in use with one clear feature or outcome moment.`, caption:'A specific product moment', voiceover:'Name the product detail that earns attention.' },
    { id:'payoff', label:'LAND THE PAYOFF', purpose:'Turn the product moment into a clear benefit.', visual:'Use a deliberate camera move or transformation that makes the payoff easy to understand.', caption:'Why this matters now', voiceover:'Connect the visible product action to the customer payoff.' },
    { id:'cta', label:'CLOSE WITH ACTION', purpose:'Give the viewer one next step without invented urgency.', visual:`End on a clean hero frame of ${productName} with a confident, uncluttered finish.`, caption:'Take the next step', voiceover:'Close with one direct, credible action.' },
  ].map(beat => ({ ...beat, runbook:runbook.id }))
}

function extensionFor(type) {
  if (type.includes('webp')) return 'webp'
  if (type.includes('jpeg')) return 'jpg'
  if (type.includes('mp4')) return 'mp4'
  return 'png'
}

function kindFromName(name) {
  return /\.(mp4|webm|mov)$/i.test(name) ? 'video' : 'image'
}

function presentProviderError(message, kind = 'render') {
  const text = String(message || '')
  if (/credit|quota|billing|insufficient/i.test(text)) {
    return `The connected OpenAI provider key has no available API credits for this live ${kind}. Your FloStudio testing entitlement remains unlimited. Add provider API credits or replace the workspace key, then retry.`
  }
  return text || `The ${kind} could not be started.`
}

function AssetVisual({ asset, compact = false }) {
  if (asset.kind === 'video') return <video src={asset.url} muted playsInline preload="metadata" controls={!compact} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
  return <img src={asset.url} alt={asset.name || 'Generated FloStudio creative'} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
}

export default function ImageBank() {
  const { useTokens, refundTokens, activeApp, apps, setActiveApp, workspaceId } = useWorkspace()
  const [activeTab, setActiveTab] = useState('generate')
  const [assets, setAssets] = useState([])
  const [loadingAssets, setLoadingAssets] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [referenceImage, setReferenceImage] = useState(null)
  const [videoSource, setVideoSource] = useState(null)
  const [prompt, setPrompt] = useState('')
  const [textOverlay, setTextOverlay] = useState('')
  const [stylePreset, setStylePreset] = useState('product')
  const [aspectRatio, setAspectRatio] = useState('1:1')
  const [variations, setVariations] = useState(2)
  const [generating, setGenerating] = useState(false)
  const [generatedResults, setGeneratedResults] = useState([])
  const [creativeRound, setCreativeRound] = useState(0)
  const [error, setError] = useState('')
  const [videoPrompt, setVideoPrompt] = useState('')
  const [videoFormat, setVideoFormat] = useState('720x1280')
  const [videoSeconds, setVideoSeconds] = useState('8')
  const [videoQuality, setVideoQuality] = useState('draft')
  const [creatorMode, setCreatorMode] = useState('creator_demo')
  const [ugcStoryShape, setUgcStoryShape] = useState('problem_solution')
  const [storyboard, setStoryboard] = useState(() => createStoryboard(AD_RUNBOOKS[0]))
  const [videoJob, setVideoJob] = useState(null)
  const [videoError, setVideoError] = useState('')
  const [providerConnection, setProviderConnection] = useState({ loading:true, configured:false, keyLast4:null, error:'' })
  const [providerKeyInput, setProviderKeyInput] = useState('')
  const [savingProviderKey, setSavingProviderKey] = useState(false)
  const [runbookId, setRunbookId] = useState('showcase')
  const [hook, setHook] = useState('')
  const [proof, setProof] = useState('')
  const [objectiveId, setObjectiveId] = useState('acquire')
  const [lensId, setLensId] = useState('product-in-use')
  const [handoffState, setHandoffState] = useState({ status:'idle', message:'' })
  const assetLoadVersion = useRef(0)

  const imageAssets = useMemo(() => assets.filter(asset => asset.kind === 'image'), [assets])
  const videoAssets = useMemo(() => assets.filter(asset => asset.kind === 'video'), [assets])

  const appStoreScreenshots = useMemo(() => {
    if (!activeApp) return []
    const facts = activeApp.source_facts || activeApp.sourceFacts || {}
    const rawScreens = facts.screenshots || facts.screenshotUrls || activeApp.screenshots || []
    const icon = facts.image || facts.artworkUrl || activeApp.image_url || null
    const list = [...rawScreens]
    if (icon && !list.includes(icon)) list.unshift(icon)
    return list
  }, [activeApp])
  const videoSourceOptions = useMemo(() => buildVideoSourceOptions({ appStoreScreenshots, imageAssets }), [appStoreScreenshots, imageAssets])
  const selectedStyle = STYLE_PRESETS.find(style => style.id === stylePreset)
  const selectedRunbook = AD_RUNBOOKS.find(runbook => runbook.id === runbookId) || AD_RUNBOOKS[0]
  const selectedObjective = CAMPAIGN_OBJECTIVES.find(objective => objective.id === objectiveId) || CAMPAIGN_OBJECTIVES[0]
  const selectedLens = VISUAL_LENSES.find(lens => lens.id === lensId) || VISUAL_LENSES[0]

  useEffect(() => {
    setVideoPrompt(current => current || selectedRunbook.video)
  }, [selectedRunbook.id])

  const selectRunbook = runbook => {
    setRunbookId(runbook.id)
    setStylePreset(runbook.style)
    if (!prompt.trim()) setPrompt(runbook.prompt)
    if (!videoPrompt.trim()) setVideoPrompt(runbook.video)
    setStoryboard(createStoryboard(runbook, activeApp?.name || 'the product'))
  }

  const chooseVideoSource = source => {
    if (!source?.url) return
    setVideoSource(source)
    setReferenceImage(source.url)
    setVideoError('')
  }

  const clearVideoSource = () => {
    setVideoSource(null)
    setVideoError('')
  }

  const updateStoryboardBeat = (index, field, value) => {
    setStoryboard(current => current.map((beat, beatIndex) => beatIndex === index ? { ...beat, [field]:value } : beat))
  }

  const loadAssets = async (productId = activeApp?.id) => {
    const requestVersion = ++assetLoadVersion.current
    setLoadingAssets(true)
    if (!productId) {
      setAssets([])
      setLoadingAssets(false)
      return
    }
    try {
      const records = await listMediaAssets(productId)
      if (requestVersion !== assetLoadVersion.current) return
      setAssets(records.filter(record => belongsToProduct(record, productId)).map(record => ({
        ...record,
        name: record.storage_path?.split('/').pop() || `${record.kind}-asset`,
        url: record.asset_url,
        kind: record.kind,
        createdAt: record.created_at,
      })).filter(asset => asset.url))
    } catch (loadError) {
      if (requestVersion === assetLoadVersion.current) setError(loadError.message || 'Your media library could not be loaded.')
    }
    if (requestVersion === assetLoadVersion.current) setLoadingAssets(false)
  }

  const providerHeaders = async () => {
    const { data:{ session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Sign in again before using the connected workspace provider key.')
    return { Authorization:`Bearer ${session.access_token}` }
  }

  const loadProviderConnection = async () => {
    if (!workspaceId) {
      setProviderConnection({ loading:false, configured:false, keyLast4:null, error:'' })
      return
    }
    setProviderConnection(current => ({ ...current, loading:true, error:'' }))
    try {
      const headers = await providerHeaders()
      const response = await fetch(`/api/provider-key?workspaceId=${encodeURIComponent(workspaceId)}`, { headers })
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || 'The workspace provider connection could not be checked.')
      setProviderConnection({ loading:false, configured:Boolean(data.configured), keyLast4:data.keyLast4 || null, error:'' })
    } catch (connectionError) {
      setProviderConnection({ loading:false, configured:false, keyLast4:null, error:connectionError.message || 'The workspace provider connection could not be checked.' })
    }
  }

  const saveProviderKey = async () => {
    if (!providerKeyInput.trim()) return
    setSavingProviderKey(true)
    setProviderConnection(current => ({ ...current, error:'' }))
    try {
      const headers = await providerHeaders()
      const response = await fetch('/api/provider-key', { method:'POST', headers:{ ...headers, 'Content-Type':'application/json' }, body:JSON.stringify({ workspaceId, apiKey:providerKeyInput.trim() }) })
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || 'The OpenAI provider key could not be connected.')
      setProviderKeyInput('')
      setProviderConnection({ loading:false, configured:true, keyLast4:data.keyLast4 || null, error:'' })
    } catch (connectionError) {
      setProviderConnection(current => ({ ...current, error:presentProviderError(connectionError.message, 'provider connection') }))
    }
    setSavingProviderKey(false)
  }

  const disconnectProviderKey = async () => {
    setSavingProviderKey(true)
    try {
      const headers = await providerHeaders()
      const response = await fetch('/api/provider-key', { method:'DELETE', headers:{ ...headers, 'Content-Type':'application/json' }, body:JSON.stringify({ workspaceId }) })
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || 'The workspace provider key could not be removed.')
      setProviderConnection({ loading:false, configured:false, keyLast4:null, error:'' })
    } catch (connectionError) {
      setProviderConnection(current => ({ ...current, error:connectionError.message || 'The workspace provider key could not be removed.' }))
    }
    setSavingProviderKey(false)
  }

  useEffect(() => {
    setReferenceImage(null)
    setVideoSource(null)
    setGeneratedResults([])
    setHandoffState({ status:'idle', message:'' })
    loadAssets(activeApp?.id)
  }, [activeApp?.id])
  useEffect(() => { loadProviderConnection() }, [workspaceId])
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('flostudio_active_video_render') || 'null')
      const storedProductId = stored?.productAppId || stored?.metadata?.productAppId
      if (stored?.id && storedProductId === activeApp?.id && ['queued', 'in_progress'].includes(stored.status)) setVideoJob(stored)
      else setVideoJob(null)
    } catch {}
  }, [activeApp?.id])

  const uploadAsset = async (file, namePrefix = 'source', details = {}) => {
    const { data:{ user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Sign in before uploading or saving media.')
    if (!activeApp?.id) throw new Error('Select a portfolio app before saving media.')
    const extension = extensionFor(file.type || file.name || '')
    const storagePath = `${user.id}/${namePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${extension}`
    const { error: uploadError } = await supabase.storage.from('marketing-assets').upload(storagePath, file, { contentType:file.type || undefined, upsert:true })
    if (uploadError) throw uploadError
    const { data } = supabase.storage.from('marketing-assets').getPublicUrl(storagePath)
    const kind = details.kind || kindFromName(storagePath)
    if (details.persistRecord === false) return { name:storagePath.split('/').pop(), url:data.publicUrl, kind, storage_path:storagePath }
    const record = await createMediaAsset({
      kind,
      product_id: activeApp.id,
      workspace_id: workspaceId || null,
      source: details.source || 'upload',
      provider: details.provider || null,
      render_status: details.renderStatus || 'ready',
      prompt: details.prompt || null,
      asset_url: data.publicUrl,
      storage_path: storagePath,
      reference_asset_id: details.referenceAssetId || null,
      metadata: { ...details.metadata, productAppId:activeApp.id, fileName:file.name, contentType:file.type || null, sizeBytes:file.size || null },
      completed_at: details.renderStatus === 'ready' ? new Date().toISOString() : null,
    })
    return { ...record, name:storagePath.split('/').pop(), url:data.publicUrl, kind, createdAt:record.created_at }
  }

  const handleUpload = async files => {
    const input = Array.from(files || [])
    if (!input.length) return
    setUploading(true); setError('')
    try {
      const [first] = input
      if (first.size > 10 * 1024 * 1024) throw new Error('Please choose a reference image smaller than 10MB.')
      const reader = new FileReader()
      const reference = await new Promise((resolve, reject) => { reader.onload = event => resolve(event.target.result); reader.onerror = reject; reader.readAsDataURL(first) })
      setReferenceImage(reference)
      for (const file of input) await uploadAsset(file, 'brand-source', { source:'upload', kind:'image' })
      await loadAssets()
    } catch (uploadError) { setError(uploadError.message || 'The image could not be uploaded.') }
    setUploading(false)
  }

  const persistRemoteOutput = async (url, prefix, fallbackKind = 'image', details = {}) => {
    const { requestHeaders, ...assetDetails } = details
    const response = await fetch(url, requestHeaders ? { headers:requestHeaders } : undefined)
    if (!response.ok) throw new Error('A generated output could not be saved to your asset bank.')
    const blob = await response.blob()
    const saved = await uploadAsset(new File([blob], `${prefix}.${extensionFor(blob.type)}`, { type:blob.type }), prefix, { kind:fallbackKind, ...assetDetails })
    return { ...saved, kind:fallbackKind }
  }

  const generateImages = async () => {
    if (!prompt.trim() && !referenceImage) { setError('Describe the creative or upload a product image first.'); return }
    setGenerating(true); setError(''); setGeneratedResults([]); setHandoffState({ status:'idle', message:'' })
    let chargedTokens = 0
    try {
      const tokenCost = 10
      const authorized = await useTokens(tokenCost, 'AI image creative')
      if (!authorized) { setGenerating(false); return }
      chargedTokens = tokenCost
      const brandContext = activeApp?.brand_dna ? `Brand DNA: ${typeof activeApp.brand_dna === 'string' ? activeApp.brand_dna : JSON.stringify(activeApp.brand_dna).slice(0, 1200)}.` : ''
      const productContext = activeApp ? `Product: ${activeApp.name}. Category: ${activeApp.category || 'not specified'}. Description: ${activeApp.description || 'not specified'}. Audience: ${activeApp.audience || 'not specified'}. ${brandContext}` : ''
      const brief = `Ad format: ${selectedRunbook.label}. Campaign objective: ${selectedObjective.label}. ${selectedObjective.prompt} Visual lens: ${selectedLens.label}. ${selectedLens.prompt} ${prompt || selectedRunbook.prompt} Hook: ${hook || 'derive an honest scroll-stopping hook from the supplied product truth.'} Proof: ${proof || 'use only credible product details and avoid unsupported claims.'} ${productContext} Style: ${selectedStyle?.label || 'Product hero'} — ${selectedStyle?.desc || ''}`
      const nextRound = creativeRound + 1
      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), 70000)
      const authHeaders = await providerHeaders()
      const response = await fetch('/api/generate-image', { method:'POST', signal:controller.signal, headers:{ ...authHeaders, 'Content-Type':'application/json' }, body:JSON.stringify({ prompt:brief, textOverlay, aspectRatio, variations:1, referenceImage, creativeRound:nextRound, workspaceId }) }).finally(() => window.clearTimeout(timeout))
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || 'Image generation failed.')
      const saved = await Promise.all((data.images || []).map((image, index) => persistRemoteOutput(image.url, `ai-image-${nextRound}-${index + 1}`, 'image', { source:'ai_image', provider:'openai', prompt:brief, metadata:{ aspectRatio, stylePreset, textOverlay, variation:index + 1, creativeRound:nextRound, concept:image.concept || null, runbook:runbookId, objective:objectiveId, visualLens:lensId, productAppId:activeApp?.id || null, hook, proof } })))
      setGeneratedResults(saved)
      setCreativeRound(nextRound)
      await loadAssets()
    } catch (generationError) {
      if (chargedTokens) await refundTokens(chargedTokens, 'the AI image render').catch(() => {})
      setError(generationError.name === 'AbortError' ? 'The render took too long to finish. Your FloStudio tokens were restored—try one creative or a shorter brief.' : presentProviderError(generationError.message, 'image render'))
    }
    setGenerating(false)
  }

  const sendCreativeToReview = async asset => {
    if (!asset || handoffState.status === 'working') return
    setHandoffState({ status:'working', message:'Creating a review draft…' })
    try {
      const { data:{ user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sign in before sending a creative to review.')
      if (asset.campaign_post_id) throw new Error('This creative is already attached to a review draft.')
      const metadata = asset.metadata || {}
      const fallbackCopy = `${metadata.runbook || selectedRunbook.label}: ${activeApp?.name || 'Your product'} — ${selectedObjective.detail}`
      const content = [metadata.hook || hook || fallbackCopy, metadata.proof || proof || '', metadata.textOverlay || textOverlay || ''].filter(Boolean).join('\n\n')
      const { data: post, error: postError } = await supabase.from('campaign_posts').insert([{
        user_id:user.id,
        platform:'instagram',
        content,
        scheduled_at:new Date().toISOString(),
        status:'pending',
        created_at:new Date().toISOString(),
      }]).select().single()
      if (postError) throw postError
      const attached = await updateMediaAsset(asset.id, { campaign_post_id:post.id })
      if (!attached) throw new Error('The review draft was created but the creative could not be attached.')
      setHandoffState({ status:'done', message:'Creative is now in the Review Queue as a pending Instagram draft.' })
    } catch (handoffError) {
      setHandoffState({ status:'error', message:handoffError.message || 'The creative could not be sent to review.' })
    }
  }

  const startVideo = async () => {
    if (!videoPrompt.trim()) { setVideoError('Describe the motion, product, setting, and camera direction first.'); return }
    if (!activeApp?.id) { setVideoError('Select a portfolio app before rendering a video.'); return }
    setVideoError('')
    const productContext = activeApp ? ` Product: ${activeApp.name}. ${activeApp.description || ''}` : ''
    const storyboardPrompt = storyboard.map((beat, index) => `Shot ${index + 1} — ${beat.label}. Purpose: ${beat.purpose}. Visual: ${beat.visual}. On-screen copy: ${beat.caption}. Voiceover: ${beat.voiceover}.`).join(' ')
    const runbookPrompt = `${selectedRunbook.label} format. ${videoPrompt || selectedRunbook.video} Hook: ${hook || 'derive a clear, credible hook.'} Proof: ${proof || 'show only supportable product truth.'}${productContext} Structured storyboard: ${storyboardPrompt}`
    const sourceReference = resolvedVideoReference(videoSource, referenceImage)
    const request = { prompt:runbookPrompt, size:videoFormat, seconds:videoSeconds, quality:videoQuality === 'production' ? 'production' : 'draft', referenceImage:sourceReference, creatorMode, ugcStoryShape, storyboard }
    let renderAsset = null
    let chargedTokens = 0
    try {
      const tokenCost = videoQuality === 'production' ? 60 : 30
      const authorized = await useTokens(tokenCost, 'AI video render')
      if (!authorized) return
      chargedTokens = tokenCost
      renderAsset = await createMediaAsset({
        kind:'video', source:'ai_video', provider:'openai', render_status:'queued', prompt:runbookPrompt,
        product_id:activeApp.id, workspace_id:workspaceId || null,
        reference_asset_id:videoSource?.id || null,
        metadata:{ size:videoFormat, seconds:videoSeconds, quality:videoQuality, creatorMode, ugcStoryShape, referenceIncluded:Boolean(sourceReference), referenceSource:videoSource?.source || (sourceReference ? 'pinned_reference' : null), referenceName:videoSource?.name || null, storyboard, runbook:runbookId, objective:objectiveId, visualLens:lensId, productAppId:activeApp.id },
      })
      const authHeaders = await providerHeaders()
      const response = await fetch('/api/generate-video', { method:'POST', headers:{ ...authHeaders, 'Content-Type':'application/json' }, body:JSON.stringify({ ...request, workspaceId }) })
      const job = await response.json()
      if (!response.ok || job.error) throw new Error(job.error || 'Video render could not be started.')
      const persisted = await updateMediaAsset(renderAsset.id, { provider_job_id:job.id, render_status:job.status || 'queued', metadata:{ ...renderAsset.metadata, providerModel:job.model || null, size:videoFormat, seconds:videoSeconds, quality:videoQuality } })
      const normalized = { ...job, mediaAssetId:persisted.id, productAppId:activeApp.id, prompt:runbookPrompt, storyboard, size:videoFormat, seconds:videoSeconds, status:job.status || 'queued', createdAt:Date.now() }
      if (normalized.status === 'completed') {
        await completeVideo(normalized)
      } else {
        setVideoJob(normalized)
        localStorage.setItem('flostudio_active_video_render', JSON.stringify(normalized))
        await loadAssets()
      }
    } catch (startError) {
      if (renderAsset?.id) await updateMediaAsset(renderAsset.id, { render_status:'failed', error_message:startError.message || 'Video render could not be started.' }).catch(() => {})
      if (chargedTokens) await refundTokens(chargedTokens, 'the AI video render that did not start').catch(() => {})
      setVideoError(presentProviderError(startError.message, 'video render'))
    }
  }

  const completeVideo = async job => {
    const authHeaders = await providerHeaders()
    const workspaceQuery = `&workspaceId=${encodeURIComponent(workspaceId || '')}`
    const [video, thumbnail] = await Promise.all([
      persistRemoteOutput(`/api/generate-video?action=content&id=${encodeURIComponent(job.id)}&variant=video${workspaceQuery}`, 'ai-video', 'video', { persistRecord:false, requestHeaders:authHeaders, source:'ai_video', provider:'openai', prompt:job.prompt, metadata:{ providerJobId:job.id, role:'completed-video' } }),
      persistRemoteOutput(`/api/generate-video?action=content&id=${encodeURIComponent(job.id)}&variant=thumbnail${workspaceQuery}`, 'ai-video-thumbnail', 'image', { persistRecord:false, requestHeaders:authHeaders, source:'ai_video', provider:'openai', prompt:job.prompt, metadata:{ providerJobId:job.id, role:'video-thumbnail' } }),
    ])
    if (job.mediaAssetId) {
      await updateMediaAsset(job.mediaAssetId, { render_status:'completed', asset_url:video.url, storage_path:video.storage_path, thumbnail_url:thumbnail.url, thumbnail_path:thumbnail.storage_path, completed_at:new Date().toISOString(), error_message:null })
    }
    const completed = { ...job, status:'completed', progress:100, videoUrl:video.url, thumbnailUrl:thumbnail.url, savedAt:Date.now() }
    setVideoJob(completed); localStorage.removeItem('flostudio_active_video_render'); await loadAssets()
  }

  useEffect(() => {
    if (!videoJob?.id || !['queued', 'in_progress'].includes(videoJob.status)) return undefined
    const timer = setTimeout(async () => {
      try {
        const authHeaders = await providerHeaders()
        const response = await fetch(`/api/generate-video?action=status&id=${encodeURIComponent(videoJob.id)}&workspaceId=${encodeURIComponent(workspaceId || '')}`, { headers:authHeaders })
        const status = await response.json()
        if (!response.ok || status.error) throw new Error(status.error || 'Video render status could not be retrieved.')
        const next = { ...videoJob, ...status }
        setVideoJob(next); localStorage.setItem('flostudio_active_video_render', JSON.stringify(next))
        if (status.status === 'completed') await completeVideo(next)
        if (status.status === 'failed') {
          localStorage.removeItem('flostudio_active_video_render')
          if (videoJob.mediaAssetId) await updateMediaAsset(videoJob.mediaAssetId, { render_status:'failed', error_message:status.error?.message || 'The video provider declined this render.' })
          setVideoError(presentProviderError(status.error?.message, 'video render'))
          await loadAssets()
        }
      } catch (pollError) { setVideoError(pollError.message) }
    }, 10000)
    return () => clearTimeout(timer)
  }, [videoJob])

  const deleteAsset = async asset => {
    if (!window.confirm(`Delete ${asset.name}?`)) return
    await removeMediaAsset(asset); await loadAssets()
  }

  const tabs = [{ id:'generate', label:'Image ads', count:imageAssets.length }, { id:'video', label:'Video ads', count:videoAssets.length }, { id:'library', label:'Asset library', count:assets.length }]

  return <Layout title="Creative Lab">
    <style>{`
      .creative-tab{border:0;border-bottom:2px solid transparent;background:transparent;color:rgba(240,240,240,.56);padding:9px 3px;margin-right:16px;font:500 10px 'DM Mono',monospace;letter-spacing:.09em;text-transform:uppercase}.creative-tab.active{border-color:var(--signal);color:var(--signal)}
      .ad-room-hero{padding:28px 30px 0;position:relative;overflow:hidden;border:1px solid rgba(240,240,240,.18);background:linear-gradient(120deg,#323232 0%,#3d3d3d 62%,#2a2a2a 100%)}.ad-room-hero::after{content:'';position:absolute;width:330px;height:330px;right:-150px;top:-155px;background:radial-gradient(circle,rgba(223,223,223,.38),transparent 67%);border-radius:50%}.ad-room-hero__top{position:relative;z-index:1;display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:22px;align-items:end}.ad-room-hero__title{max-width:700px;font-size:clamp(38px,4.7vw,66px);font-weight:750;line-height:.9;letter-spacing:-.08em}.ad-room-hero__title em{font-family:'Instrument Serif',Georgia,serif;color:var(--vermilion);font-weight:400}.product-truth{position:relative;z-index:1;display:flex;align-items:center;gap:10px;padding:12px 0;border-top:1px solid rgba(240,240,240,.17);margin-top:23px}.product-truth__label{font:500 9px 'DM Mono',monospace;letter-spacing:.13em;color:var(--signal);text-transform:uppercase;white-space:nowrap}.product-truth select{flex:1;max-width:360px;background:transparent;border:0;color:var(--mineral);font:600 12px 'Bricolage Grotesque',sans-serif;outline:0}.product-truth option{background:#2f2f2f;color:var(--mineral)}.product-truth__status{margin-left:auto;color:rgba(240,240,240,.62);font:500 9px 'DM Mono',monospace;letter-spacing:.06em}.media-rail{display:grid;grid-template-columns:repeat(8,minmax(112px,1fr));gap:7px;overflow-x:auto;padding:16px 0 20px;position:relative;z-index:1}.media-rail-item{height:142px;position:relative;overflow:hidden;border-radius:2px;border:1px solid rgba(240,240,240,.18);background:rgba(16,16,16,.35)}.media-rail-item::after{content:'OUTPUT';position:absolute;left:6px;top:6px;padding:3px 5px;border-radius:0;background:rgba(21,21,21,.78);color:rgba(240,240,240,.86);font:500 8px 'DM Mono',monospace;letter-spacing:.08em}.media-rail-item.video::after{content:'VIDEO';color:var(--signal)}.asset-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.asset-card{min-height:240px;overflow:hidden;position:relative;background:rgba(16,16,16,.35);border:1px solid rgba(240,240,240,.14);border-radius:3px}.asset-card .asset-footer{position:absolute;inset:auto 0 0 0;padding:10px;background:linear-gradient(transparent,rgba(18,18,18,.95) 48%);padding-top:35px;display:flex;align-items:flex-end;justify-content:space-between;gap:8px;color:#ffffff}.asset-card video,.asset-card img{min-height:240px}.format-card{border:1px solid rgba(240,240,240,.16);border-radius:3px;padding:12px;background:rgba(240,240,240,.04);color:rgba(240,240,240,.72);text-align:left}.format-card.active{border-color:var(--signal);background:rgba(223,223,223,.1);color:#ffffff}.format-card small{display:block;margin-top:3px;color:rgba(240,240,240,.5)}.runbook-shelf{display:grid;grid-template-columns:repeat(5,minmax(128px,1fr));gap:8px;margin:18px 0}.runbook-card{min-height:112px;padding:12px;border:1px solid rgba(240,240,240,.16);border-radius:3px;background:rgba(16,16,16,.28);color:var(--mineral);text-align:left}.runbook-card.active{background:var(--signal);border-color:var(--signal);color:var(--ink-deep);box-shadow:4px 4px 0 rgba(132,132,132,.75)}.runbook-card__type{font:500 8px 'DM Mono',monospace;letter-spacing:.1em;color:var(--moss)}.runbook-card.active .runbook-card__type{color:rgba(32,32,32,.7)}.runbook-card b{display:block;margin-top:8px;font-size:13px;letter-spacing:-.035em}.runbook-card small{display:block;margin-top:5px;line-height:1.35;color:rgba(240,240,240,.55);font-size:10px}.runbook-card.active small{color:rgba(32,32,32,.76)}.ad-blueprint{display:grid;grid-template-columns:74px 1fr 1fr;gap:9px;align-items:stretch;padding:11px;border:1px solid rgba(223,223,223,.28);background:rgba(223,223,223,.055);margin-top:15px}.ad-blueprint__label{font:500 8px 'DM Mono',monospace;letter-spacing:.12em;color:var(--signal);padding-top:3px}.ad-blueprint input{min-width:0;background:rgba(16,16,16,.35);border:1px solid rgba(240,240,240,.17);border-radius:2px;color:var(--mineral);padding:9px;font-size:11px}.ad-blueprint input::placeholder{color:rgba(240,240,240,.42)}@media(max-width:1000px){.creative-workspace{grid-template-columns:1fr!important}.asset-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.media-rail{grid-template-columns:repeat(8,142px)}.runbook-shelf{grid-template-columns:repeat(3,1fr)}}@media(max-width:620px){.asset-grid{grid-template-columns:1fr 1fr}.media-rail{grid-template-columns:repeat(8,128px)}.ad-room-hero{padding:22px 18px 0}.ad-room-hero__top{grid-template-columns:1fr}.ad-room-hero__title{font-size:40px}.product-truth{align-items:flex-start;flex-wrap:wrap}.product-truth select{max-width:none;flex-basis:100%}.product-truth__status{margin-left:0}.runbook-shelf{grid-template-columns:1fr 1fr}.ad-blueprint{grid-template-columns:1fr}.ad-blueprint__label{padding:0}}
    `}</style>
    <style>{`
      .flo-app-shell:has(.arcads-studio){--signal:#f6f6f6;--vermilion:#b8b8b8;--ink-deep:#090909;--mineral:#f4f4f4;--moss:#a7a7a7;background:#080808!important;color:#f4f4f4}
      .flo-app-shell:has(.arcads-studio) .flo-sidebar{background:#050505!important;border-right:1px solid #242424!important}
      .flo-app-shell:has(.arcads-studio) .flo-main{background:#080808!important}
      .flo-app-shell:has(.arcads-studio) .flo-topbar{background:#080808!important;border-bottom:1px solid #242424!important}
      .flo-app-shell:has(.arcads-studio) .flo-brand-mark{background:#f4f4f4!important;color:#080808!important;border-color:#f4f4f4!important}
      .flo-app-shell:has(.arcads-studio) .flo-nav-item.active{background:#f4f4f4!important;color:#080808!important}
      .flo-app-shell:has(.arcads-studio) .flo-nav-item.active .flo-nav-mark,.flo-app-shell:has(.arcads-studio) .flo-nav-item.active .flo-nav-text{color:#080808!important}
      .flo-app-shell:has(.arcads-studio) .flo-fuel,.flo-app-shell:has(.arcads-studio) .flo-profile{background:#111111!important;border-color:#2a2a2a!important}
      .arcads-studio{padding:0 22px 34px;color:#f4f4f4}
      .arcads-studio .ad-room-hero{background:#0e0e0e!important;border-color:#303030!important;box-shadow:none!important}
      .arcads-studio .ad-room-hero::after{width:100%;height:1px;right:0;top:56%;border-radius:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.2),transparent)!important}
      .arcads-studio .product-truth{border-color:#2b2b2b!important}.arcads-studio .product-truth option{background:#111111!important;color:#f4f4f4!important}
      .arcads-studio .media-rail-item,.arcads-studio .asset-card{background:#111111!important;border-color:#2f2f2f!important}.arcads-studio .media-rail-item::after{background:#050505!important;color:#dcdcdc!important}.arcads-studio .asset-card .asset-footer{background:linear-gradient(transparent,rgba(4,4,4,.97) 48%)!important}
      .arcads-studio .abundance-card,.arcads-studio .abundance-glass{background:#101010!important;border-color:#2d2d2d!important;box-shadow:none!important}.arcads-studio .abundance-pill{background:#151515!important;border-color:#343434!important;color:#e6e6e6!important}
      .arcads-studio .format-card{background:#121212!important;border-color:#303030!important;color:#d8d8d8!important}.arcads-studio .format-card.active{background:#f4f4f4!important;border-color:#f4f4f4!important;color:#0b0b0b!important}.arcads-studio .format-card.active small{color:#464646!important}.arcads-studio .format-card small{color:#949494!important}
      .arcads-studio .runbook-card{background:#111111!important;border-color:#303030!important;color:#e9e9e9!important}.arcads-studio .runbook-card.active{background:#f4f4f4!important;border-color:#f4f4f4!important;color:#0b0b0b!important;box-shadow:4px 4px 0 #4a4a4a!important}.arcads-studio .runbook-card__type{color:#a7a7a7!important}.arcads-studio .runbook-card.active .runbook-card__type,.arcads-studio .runbook-card.active small{color:#4c4c4c!important}
      .arcads-studio .ad-blueprint{border-color:#363636!important;background:#121212!important}.arcads-studio .ad-blueprint input,.arcads-studio .studio-input{background:#080808!important;border-color:#343434!important;color:#f4f4f4!important}.arcads-studio .ad-blueprint input::placeholder,.arcads-studio .studio-input::placeholder{color:#7c7c7c!important}
      .arcads-studio button.studio-button{background:#f4f4f4!important;color:#080808!important;border-color:#f4f4f4!important}.arcads-studio button.studio-chip{background:#151515!important;color:#e8e8e8!important;border-color:#404040!important}
      .arcads-studio [style*="rgba(255,193,59"],.arcads-studio [style*="rgba(255,93,50"],.arcads-studio [style*="rgba(65,13,6"]{border-color:#3a3a3a!important;background-color:#141414!important}
      @media(max-width:700px){.arcads-studio{padding:0 12px 24px}.arcads-studio [style*="grid-template-columns:repeat(4,minmax(0,1fr))"]{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
    `}</style>
    <style>{`
      /* The product workspace follows the global white canvas; media remains naturally full-color. */
      .flo-app-shell:has(.arcads-studio){--signal:#3182f6!important;--signal-soft:rgba(49,130,246,.12)!important;--ink-deep:#13202d!important;--mineral:#1c2530!important;--moss:#64748b!important;background:#f7f8fa!important;color:#1c2530!important}
      .flo-app-shell:has(.arcads-studio) .flo-sidebar{background:rgba(255,255,255,.94)!important;border-right-color:#e2e8f0!important}
      .flo-app-shell:has(.arcads-studio) .flo-main,.flo-app-shell:has(.arcads-studio) .flo-topbar{background:#f7f8fa!important;border-color:#e2e8f0!important}
      .flo-app-shell:has(.arcads-studio) .flo-brand-mark{background:#3182f6!important;color:#fff!important;border-color:#3182f6!important}
      .flo-app-shell:has(.arcads-studio) .flo-nav-item.active{background:#eaf3ff!important;color:#1764c0!important;border-color:#9dccff!important}
      .flo-app-shell:has(.arcads-studio) .flo-nav-item.active .flo-nav-mark,.flo-app-shell:has(.arcads-studio) .flo-nav-item.active .flo-nav-text{color:#1764c0!important}
      .flo-app-shell:has(.arcads-studio) .flo-fuel,.flo-app-shell:has(.arcads-studio) .flo-profile{background:#f4f8fd!important;border-color:#d8e9fe!important}
      .arcads-studio{padding:0 22px 34px;color:#1c2530!important}
      .arcads-studio .ad-room-hero{background:#fff!important;border-color:#e1e8f0!important;box-shadow:0 16px 34px rgba(15,23,42,.045)!important}
      .arcads-studio .ad-room-hero::after{width:100%!important;height:1px!important;right:0!important;top:56%!important;border-radius:0!important;background:linear-gradient(90deg,transparent,rgba(49,130,246,.24),transparent)!important}
      .arcads-studio .ad-room-hero__title,.arcads-studio h1,.arcads-studio h2,.arcads-studio h3,.arcads-studio b{color:#1c2530!important}.arcads-studio .ad-room-hero__title em{color:#2563c5!important}.arcads-studio .abundance-copy,.arcads-studio .abundance-mini-label,.arcads-studio .product-truth__status{color:#64748b!important}
      .arcads-studio .product-truth{border-color:#e5edf5!important}.arcads-studio .product-truth option{background:#fff!important;color:#1c2530!important}
      .arcads-studio .media-rail-item,.arcads-studio .asset-card{background:#fff!important;border-color:#dce5ef!important}.arcads-studio .media-rail-item::after{background:rgba(255,255,255,.92)!important;color:#2563c5!important;border:1px solid #d8e9fe!important}.arcads-studio .asset-card .asset-footer{background:linear-gradient(transparent,rgba(255,255,255,.96) 48%)!important;color:#1c2530!important}
      .arcads-studio .abundance-card,.arcads-studio .abundance-glass{background:#fff!important;border-color:#e1e8f0!important;box-shadow:0 8px 20px rgba(15,23,42,.035)!important}.arcads-studio .abundance-pill{background:#f8fafc!important;border-color:#d9e4ef!important;color:#526174!important}
      .arcads-studio .format-card,.arcads-studio .runbook-card{background:#fff!important;border-color:#dce5ef!important;color:#334155!important}.arcads-studio .format-card small,.arcads-studio .runbook-card small,.arcads-studio .runbook-card__type{color:#64748b!important}.arcads-studio .format-card.active,.arcads-studio .runbook-card.active{background:#eaf3ff!important;border-color:#9dccff!important;color:#1764c0!important;box-shadow:none!important}.arcads-studio .format-card.active small,.arcads-studio .runbook-card.active .runbook-card__type,.arcads-studio .runbook-card.active small{color:#2563c5!important}
      .arcads-studio .ad-blueprint{border-color:#cfe3ff!important;background:#f4f8fd!important}.arcads-studio .ad-blueprint input,.arcads-studio .studio-input{background:#fff!important;border-color:#d8e2ed!important;color:#1c2530!important}.arcads-studio .ad-blueprint input::placeholder,.arcads-studio .studio-input::placeholder{color:#94a3b8!important}
      .arcads-studio button.studio-button{background:#3182f6!important;color:#fff!important;border-color:#3182f6!important}.arcads-studio button.studio-chip{background:#fff!important;color:#2563c5!important;border-color:#b9d7ff!important}
    `}</style>
    <div className="flo-page arcads-studio" style={{ maxWidth:1280, margin:'0 auto', animation:'fadeIn .3s ease-out' }}>
      <section className="ad-room-hero" style={{ marginBottom:20 }}>
        <div className="ad-room-hero__top"><div><div className="abundance-eyebrow">Portfolio Ad Room / Production desk</div><h1 className="ad-room-hero__title" style={{ marginTop:10 }}>Build the ad. <em>Not the prompt.</em></h1><p className="abundance-copy" style={{ marginTop:13, maxWidth:640 }}>Choose the proven format, ground it in your actual product, direct the hook and proof, then render an ad set you can review and scale.</p></div><div className="abundance-glass" style={{ padding:15, borderRadius:3 }}><div className="abundance-mini-label">PRODUCTION LIBRARY</div><div style={{ display:'flex', alignItems:'baseline', gap:7, marginTop:5 }}><b style={{ fontSize:31, letterSpacing:'-.06em' }}>{assets.length}</b><span style={{ color:'rgba(240,240,240,.65)', fontSize:12 }}>real outputs</span></div><div style={{ display:'flex', gap:7, marginTop:10 }}><span className="abundance-pill"><i/>{imageAssets.length} images</span><span className="abundance-pill">{videoAssets.length} video</span></div></div></div>
        <div className="product-truth"><span className="product-truth__label">Product Truth</span>{apps.length ? <select value={activeApp?.id || ''} onChange={event => setActiveApp(apps.find(app => app.id === event.target.value) || null)}>{apps.map(app => <option value={app.id} key={app.id}>{app.name}{app.category ? ` / ${app.category}` : ''}</option>)}</select> : <span style={{ color:'rgba(240,240,240,.66)', fontSize:12 }}>Add a portfolio app to pin real product context into every render.</span>}<span className="product-truth__status">{activeApp ? `${activeApp.name} / ACTIVE` : 'NO PRODUCT SELECTED'}</span></div>
        <div className="media-rail">
          {appStoreScreenshots.map((url, idx) => (
            <div key={idx} onClick={() => setReferenceImage(url)} className="media-rail-item" style={{ cursor:'pointer', border: referenceImage === url ? '2px solid var(--signal)' : '1px solid rgba(240,240,240,.18)' }}>
              <img src={url} alt="App Store screenshot" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
            </div>
          ))}
          {assets.slice(0,8).map(asset => <div key={asset.name} className={`media-rail-item ${asset.kind}`}><AssetVisual asset={asset} compact /></div>)}
          {!appStoreScreenshots.length && !assets.length && <div className="abundance-glass" style={{ gridColumn:'1 / -1', padding:16, borderRadius:3, color:'rgba(240,240,240,.68)', fontSize:12 }}>Select your app above to instantly load Apple App Store screenshots and product artwork into the production media rail.</div>}
        </div>
      </section>

      <div style={{ display:'flex', gap:8, flexWrap:'wrap', margin:'0 0 4px' }}>{tabs.map(tab => <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`creative-tab ${activeTab === tab.id ? 'active':''}`}>{tab.label} <span style={{ opacity:.72 }}>({tab.count})</span></button>)}</div>
      {activeTab === 'video' && <section className="abundance-card" style={{ marginTop:18, padding:'16px 18px', borderColor:'rgba(197,197,197,.42)', position:'sticky', top:12, zIndex:5 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'start', gap:14, flexWrap:'wrap' }}>
          <div>
            <div className="abundance-mini-label">SOURCE IMAGE / FIRST FRAME</div>
            <h2 style={{ fontSize:18, letterSpacing:'-.05em', marginTop:4 }}>Choose the image that should become this video ad.</h2>
            <p style={{ color:'rgba(240,240,240,.62)', fontSize:11.5, lineHeight:1.5, marginTop:5, maxWidth:650 }}>Choose any saved image for {activeApp?.name || 'the active app'} or its imported App Store artwork. FloStudio sends it as the video’s first-frame reference and records the relationship on the finished video.</p>
          </div>
          {videoSource && <button onClick={clearVideoSource} className="studio-chip">Use text only</button>}
        </div>
        {videoSource ? <div style={{ marginTop:12, display:'flex', gap:10, alignItems:'center', padding:9, border:'1px solid rgba(197,197,197,.32)', background:'rgba(197,197,197,.08)' }}>
          <img src={videoSource.url} alt="Selected video source" style={{ width:56, height:56, objectFit:'cover' }} />
          <div><b style={{ color:'#ffffff', fontSize:12 }}>Selected: {videoSource.name}</b><div style={{ color:'rgba(240,240,240,.6)', fontSize:10.5, marginTop:4 }}>This image is locked as the video’s starting frame.</div></div>
        </div> : <div style={{ marginTop:12, color:'rgba(240,240,240,.58)', fontSize:11.5 }}>No source image selected. The video will be generated from the written direction only.</div>}
        <div style={{ display:'flex', gap:8, overflowX:'auto', paddingTop:13, paddingBottom:2 }}>
          {videoSourceOptions.map(source => <button key={`${source.source}-${source.id || source.url}`} onClick={() => chooseVideoSource(source)} aria-pressed={videoSource?.url === source.url} title={`Use ${source.name} as the source image`} style={{ width:82, minWidth:82, height:104, padding:0, overflow:'hidden', position:'relative', border:videoSource?.url === source.url ? '2px solid var(--signal)' : '1px solid rgba(240,240,240,.24)', background:'rgba(16,16,16,.54)', cursor:'pointer' }}>
            <img src={source.url} alt={source.name} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
            <span style={{ position:'absolute', inset:'auto 0 0', padding:'6px 5px', background:'rgba(14,14,14,.88)', color:'#ffffff', fontSize:8, lineHeight:1.2, textAlign:'left' }}>{source.source === 'saved_image' ? 'SAVED AD' : 'STORE IMAGE'}</span>
          </button>)}
        </div>
        {!videoSourceOptions.length && <div style={{ marginTop:12, padding:11, border:'1px dashed rgba(240,240,240,.22)', color:'rgba(240,240,240,.62)', fontSize:11.5 }}>Create an image ad or add an App Store link in Portfolio to choose a real source frame here.</div>}
        <div style={{ marginTop:14, paddingTop:13, borderTop:'1px solid rgba(240,240,240,.14)' }}><div className="abundance-mini-label">ON-CAMERA DIRECTION / ORIGINAL ADULT TALENT</div><div style={{ display:'grid', gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:7, marginTop:8 }}>{CREATOR_MODES.map(mode => <button key={mode.id} onClick={() => setCreatorMode(mode.id)} className={`format-card ${creatorMode === mode.id ? 'active':''}`} style={{ padding:9 }}><b style={{ display:'block', fontSize:10.5 }}>{mode.label}</b><small>{mode.detail}</small></button>)}</div><div style={{ display:'grid', gridTemplateColumns:'160px minmax(0,1fr)', gap:10, alignItems:'center', marginTop:11 }}><div className="abundance-mini-label">UGC STORY SHAPE</div><select className="studio-input" value={ugcStoryShape} onChange={event => setUgcStoryShape(event.target.value)}>{UGC_STORY_SHAPES.map(shape => <option value={shape.id} key={shape.id}>{shape.label} — {shape.detail}</option>)}</select></div><p style={{ color:'rgba(240,240,240,.54)', fontSize:10.5, lineHeight:1.45, marginTop:8 }}>Creator modes use original, non-identifiable adult talent. FloStudio never asks the model to imitate a real person. The selected app screen remains the canonical product reference.</p></div>
      </section>}
      {activeTab !== 'library' && <section><div className="abundance-mini-label" style={{ marginTop:18 }}>FORMAT SHELF / START FROM THE AD YOU WANT TO MAKE</div><div className="runbook-shelf">{AD_RUNBOOKS.map(runbook => <button key={runbook.id} onClick={() => selectRunbook(runbook)} className={`runbook-card ${runbookId === runbook.id ? 'active':''}`}><span className="runbook-card__type">{runbook.type}</span><b>{runbook.label}</b><small>{runbook.description}</small></button>)}</div></section>}

      {activeTab === 'generate' && <div className="creative-workspace" style={{ display:'grid', gridTemplateColumns:'minmax(0,1.12fr) minmax(360px,.88fr)', gap:20 }}>
        <section className="abundance-card" style={{ padding:25 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, marginBottom:20 }}><div><div className="abundance-mini-label">IMAGE AD / {selectedRunbook.type}</div><h2 style={{ fontSize:23, letterSpacing:'-.055em', marginTop:5 }}>{selectedRunbook.label}. Make it perform.</h2></div><span className="abundance-pill">10 tokens / take</span></div>
          <label style={{ display:'block', color:'#ffffff', fontSize:12, fontWeight:800, marginBottom:8 }}>CREATIVE DIRECTION</label>
          <textarea className="studio-input" value={prompt} onChange={event => setPrompt(event.target.value)} rows={4} placeholder={selectedRunbook.prompt} style={{ resize:'vertical', lineHeight:1.6 }} />
          <div className="ad-blueprint"><div className="ad-blueprint__label">AD BLUEPRINT</div><input value={hook} onChange={event => setHook(event.target.value)} placeholder="Opening hook / what stops the scroll?" /><input value={proof} onChange={event => setProof(event.target.value)} placeholder="Proof / what makes the claim believable?" /></div>
          <div style={{ marginTop:18 }}><div className="abundance-mini-label">CREATIVE RECIPE / THE BUSINESS JOB AND VISUAL EXECUTION</div><div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginTop:10 }}><div><div style={{ color:'#ffffff', fontSize:11, fontWeight:800, marginBottom:7 }}>CAMPAIGN OBJECTIVE</div><div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7 }}>{CAMPAIGN_OBJECTIVES.map(objective => <button key={objective.id} onClick={() => setObjectiveId(objective.id)} className={`format-card ${objectiveId === objective.id ? 'active':''}`} style={{ padding:10 }}><b style={{ display:'block', fontSize:11 }}>{objective.label}</b><small>{objective.detail}</small></button>)}</div></div><div><div style={{ color:'#ffffff', fontSize:11, fontWeight:800, marginBottom:7 }}>VISUAL LENS</div><div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7 }}>{VISUAL_LENSES.map(lens => <button key={lens.id} onClick={() => setLensId(lens.id)} className={`format-card ${lensId === lens.id ? 'active':''}`} style={{ padding:10 }}><b style={{ display:'block', fontSize:11 }}>{lens.label}</b><small>{lens.detail}</small></button>)}</div></div></div></div>
          <div style={{ marginTop:18 }}><div style={{ color:'#ffffff', fontSize:12, fontWeight:800, marginBottom:9 }}>CREATIVE TREATMENT</div><div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:9 }}>{STYLE_PRESETS.map(style => <button key={style.id} onClick={() => setStylePreset(style.id)} className={`format-card ${stylePreset === style.id ? 'active':''}`}><b style={{ display:'block', fontSize:12 }}>{style.label}</b><small>{style.desc}</small></button>)}</div></div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:18 }}><div><div style={{ color:'#ffffff', fontSize:12, fontWeight:800, marginBottom:8 }}>PLACEMENT</div><select className="studio-input" value={aspectRatio} onChange={event => setAspectRatio(event.target.value)}>{ASPECT_RATIOS.map(ratio => <option key={ratio.id} value={ratio.id}>{ratio.label} / {ratio.visual}</option>)}</select></div><div><div style={{ color:'#ffffff', fontSize:12, fontWeight:800, marginBottom:8 }}>CREATIVE DELIVERY</div><div className="studio-input" style={{ minHeight:39, display:'flex', alignItems:'center', color:'rgba(240,240,240,.76)', fontSize:11 }}>One original image per take. New take = new composition.</div></div></div>
          <div style={{ marginTop:18 }}><div style={{ color:'#ffffff', fontSize:12, fontWeight:800, marginBottom:8 }}>OPTIONAL ON-IMAGE MESSAGE</div><input className="studio-input" value={textOverlay} onChange={event => setTextOverlay(event.target.value)} placeholder="e.g. EARLY ACCESS IS OPEN" /></div>
          <div style={{ marginTop:18 }}>
            <div style={{ color:'#ffffff', fontSize:12, fontWeight:800, marginBottom:8 }}>PRODUCT REFERENCE</div>
            {referenceImage ? (
              <div className="abundance-glass" style={{ padding:10, borderRadius:13, display:'flex', alignItems:'center', gap:10 }}>
                <img src={referenceImage} alt="Product reference" style={{ width:50, height:50, objectFit:'cover', borderRadius:9 }} />
                <div style={{ flex:1, color:'rgba(255,255,255,.78)', fontSize:12 }}>Your selected screenshot is pinned as product reference truth.</div>
                <button onClick={() => setReferenceImage(null)} className="studio-chip">Clear</button>
              </div>
            ) : (
              <div>
                {appStoreScreenshots.length > 0 && (
                  <div style={{ marginBottom:10 }}>
                    <div style={{ color:'rgba(240,240,240,.62)', fontSize:11, marginBottom:6 }}>Click an app store screenshot to pin it:</div>
                    <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:4 }}>
                      {appStoreScreenshots.map((url, i) => (
                        <div key={i} onClick={() => setReferenceImage(url)} style={{ width:52, height:64, borderRadius:6, overflow:'hidden', cursor:'pointer', border:'1px solid rgba(240,240,240,.25)', flexShrink:0, background:'#111111' }}>
                          <img src={url} alt="Store screenshot" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <label style={{ position:'relative', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', minHeight:54, border:'1px dashed rgba(255,255,255,.32)', borderRadius:13, color:'rgba(241,241,241,.72)', fontSize:12, cursor:'pointer', background:'rgba(255,255,255,.04)' }}>
                  {uploading ? 'Uploading source...' : 'Or upload custom image / artwork'}
                  <input aria-label="Upload custom image or artwork" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => handleUpload(event.target.files)} style={{ position:'absolute', inset:0, width:'100%', height:'100%', opacity:0.01, cursor:'pointer' }} />
                </label>
              </div>
            )}
          </div>
          {error && <div style={{ marginTop:15, padding:'11px 13px', color:'#cccccc', fontSize:12, border:'1px solid rgba(136,136,136,.32)', background:'rgba(136,136,136,.1)', borderRadius:11 }}>{error}</div>}
          <button onClick={generateImages} disabled={generating || (!prompt.trim() && !referenceImage && !activeApp)} className="studio-button" style={{ width:'100%', marginTop:20, padding:14 }}>{generating ? 'Rendering your original creative...' : `Render ${selectedRunbook.label.toLowerCase()} creative · 10 tokens`}</button>
        </section>
        <section className="abundance-card" style={{ padding:22, minHeight:530, display:'flex', flexDirection:'column' }}><div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}><div><div className="abundance-mini-label">LIVE OUTPUT BOARD</div><h2 style={{ fontSize:20, letterSpacing:'-.05em', marginTop:4 }}>Generated creatives</h2></div><span className="abundance-pill">{creativeRound ? `round ${creativeRound}` : 'saved automatically'}</span></div>{generating ? <div style={{ flex:1, display:'grid', placeItems:'center', textAlign:'center' }}><div><span className="spinner" style={{ width:34, height:34, borderWidth:3 }} /><div style={{ color:'#ffffff', fontWeight:800, marginTop:15 }}>Rendering a new creative round</div><div style={{ color:'rgba(232,232,232,.64)', fontSize:12, marginTop:6 }}>Each pass uses a different performance-ad concept and adds the real output to your library.</div></div></div> : generatedResults.length ? <><div style={{ display:'grid', gridTemplateColumns:generatedResults.length > 1 ? '1fr 1fr' : '1fr', gap:12 }}>{generatedResults.map((asset, index) => <div key={asset.name} style={{ minHeight:240, borderRadius:3, overflow:'hidden', position:'relative', background:'rgba(255,255,255,.06)' }}><AssetVisual asset={asset} /><div style={{ position:'absolute', left:0, right:0, bottom:0, padding:'28px 10px 10px', background:'linear-gradient(transparent,rgba(18,18,18,.9))', display:'flex', alignItems:'end', justifyContent:'space-between', gap:8 }}><span style={{ color:'var(--signal)', font:'500 8px DM Mono,monospace', letterSpacing:'.09em' }}>CONCEPT {String(index + 1).padStart(2,'0')}</span><a href={asset.url} target="_blank" rel="noreferrer" className="abundance-pill">Open</a></div></div>)}</div><button onClick={generateImages} disabled={generating} className="studio-chip" style={{ marginTop:13, alignSelf:'flex-start', background:'var(--signal)', borderColor:'var(--signal)', color:'var(--ink-deep)' }}>Create a different take →</button><p style={{ color:'rgba(232,232,232,.58)', fontSize:10.5, lineHeight:1.55, marginTop:8 }}>A new round changes the visual concept; it does not overwrite the outputs already saved in your production library.</p></> : <div className="abundance-glass" style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'flex-end', minHeight:390, padding:18, borderRadius:3, background:'linear-gradient(150deg,rgba(223,223,223,.13),rgba(132,132,132,.09))' }}><div className="abundance-mini-label">REAL OUTPUT, NOT A PLACEHOLDER</div><h3 style={{ fontSize:24, lineHeight:1.05, letterSpacing:'-.06em', maxWidth:300, marginTop:7 }}>Your first changing creative round starts here.</h3><p style={{ color:'rgba(232,232,232,.65)', fontSize:12, lineHeight:1.6, marginTop:10, maxWidth:370 }}>Render a format to create real AI images. Create another take when you want a different visual idea, not the same placeholder rearranged.</p></div>}</section>
      </div>}

      {activeTab === 'generate' && generatedResults.length > 0 && <section className="abundance-card" style={{ marginTop:20, padding:'18px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:16, flexWrap:'wrap', borderColor:'rgba(223,223,223,.34)' }}><div><div className="abundance-mini-label">REVIEW HANDOFF / TURN A REAL OUTPUT INTO A DECISION</div><h3 style={{ fontSize:18, letterSpacing:'-.05em', marginTop:5 }}>Send this creative straight to the review queue.</h3><p style={{ color:'rgba(240,240,240,.62)', fontSize:11.5, lineHeight:1.5, marginTop:5, maxWidth:590 }}>FloStudio creates a real pending Instagram draft using your hook and proof, then attaches this saved creative so it is ready for an approval decision.</p>{handoffState.message && <div style={{ marginTop:8, fontSize:11.5, color:handoffState.status === 'done' ? 'var(--signal)' : handoffState.status === 'error' ? '#c3c3c3' : 'rgba(240,240,240,.76)' }}>{handoffState.message}</div>}</div><button onClick={() => sendCreativeToReview(generatedResults[0])} disabled={handoffState.status === 'working' || handoffState.status === 'done'} className="studio-button" style={{ whiteSpace:'nowrap' }}>{handoffState.status === 'working' ? 'Creating review draft…' : handoffState.status === 'done' ? 'Sent to review' : 'Send to review queue →'}</button></section>}

      {activeTab === 'video' && <div className="creative-workspace" style={{ display:'grid', gridTemplateColumns:'minmax(0,1.05fr) minmax(360px,.95fr)', gap:20 }}>
        <section className="abundance-card" style={{ padding:25 }}><div className="abundance-mini-label">VIDEO AD / {selectedRunbook.type}</div><h2 style={{ fontSize:27, letterSpacing:'-.06em', marginTop:5 }}>{selectedRunbook.label} in motion.</h2><p style={{ color:'rgba(232,232,232,.64)', fontSize:12, lineHeight:1.6, marginTop:10, maxWidth:560 }}>A real render job, built from the same format, product truth, hook, and proof as the image ad. Direct camera movement and production pacing; the Ad Room handles the render queue.</p><textarea className="studio-input" value={videoPrompt} onChange={event => setVideoPrompt(event.target.value)} rows={5} placeholder={selectedRunbook.video} style={{ resize:'vertical', lineHeight:1.6, marginTop:18 }} /><div className="ad-blueprint"><div className="ad-blueprint__label">AD BLUEPRINT</div><input value={hook} onChange={event => setHook(event.target.value)} placeholder="Opening hook / what stops the scroll?" /><input value={proof} onChange={event => setProof(event.target.value)} placeholder="Proof / what makes the claim believable?" /></div><div style={{ marginTop:20, paddingTop:16, borderTop:'1px solid rgba(240,240,240,.14)' }}><div className="abundance-mini-label">STORYBOARD / EDIT THE BEATS BEFORE RENDER</div><p style={{ color:'rgba(232,232,232,.58)', fontSize:11, lineHeight:1.5, margin:'7px 0 11px' }}>FloStudio sends these four editable beats to the real video provider. Keep every shot specific, product-led, and supportable.</p><div style={{ display:'grid', gap:9 }}>{storyboard.map((beat, index) => <div key={beat.id} style={{ padding:11, border:'1px solid rgba(240,240,240,.14)', background:'rgba(240,240,240,.035)', borderRadius:3 }}><div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'center', marginBottom:8 }}><span style={{ color:'var(--signal)', font:'500 9px DM Mono,monospace', letterSpacing:'.1em' }}>{String(index + 1).padStart(2,'0')} / {beat.label}</span><span style={{ color:'rgba(240,240,240,.45)', fontSize:10 }}>editable beat</span></div><div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}><textarea className="studio-input" value={beat.visual} onChange={event => updateStoryboardBeat(index, 'visual', event.target.value)} rows={2} placeholder="What should the viewer see?" style={{ resize:'vertical', fontSize:11 }} /><textarea className="studio-input" value={beat.voiceover} onChange={event => updateStoryboardBeat(index, 'voiceover', event.target.value)} rows={2} placeholder="What should the voiceover say?" style={{ resize:'vertical', fontSize:11 }} /></div><input className="studio-input" value={beat.caption} onChange={event => updateStoryboardBeat(index, 'caption', event.target.value)} placeholder="On-screen copy / caption" style={{ marginTop:8, fontSize:11 }} /></div>)}</div></div><div style={{ marginTop:18 }}><div style={{ color:'#ffffff', fontSize:12, fontWeight:800, marginBottom:9 }}>VIDEO PLACEMENT</div><div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:9 }}>{VIDEO_FORMATS.map(format => <button key={format.id} onClick={() => setVideoFormat(format.id)} className={`format-card ${videoFormat === format.id ? 'active':''}`}><b>{format.label}</b><small>{format.detail}</small></button>)}</div></div><div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:18 }}><div><div style={{ color:'#ffffff', fontSize:12, fontWeight:800, marginBottom:8 }}>DURATION</div><select className="studio-input" value={videoSeconds} onChange={event => setVideoSeconds(event.target.value)}>{['4','8','12'].map(seconds => <option key={seconds} value={seconds}>{seconds} seconds</option>)}</select></div><div><div style={{ color:'#ffffff', fontSize:12, fontWeight:800, marginBottom:8 }}>RENDER INTENT</div><select className="studio-input" value={videoQuality} onChange={event => setVideoQuality(event.target.value)}><option value="draft">Fast test / 30 tokens</option><option value="production">Polished launch / 60 tokens</option></select></div></div>{videoError && <div style={{ marginTop:15, padding:'11px 13px', color:'#cccccc', fontSize:12, border:'1px solid rgba(136,136,136,.32)', background:'rgba(136,136,136,.1)', borderRadius:11 }}>{videoError}</div>}<div style={{ color:'rgba(232,232,232,.52)', fontSize:10.5, lineHeight:1.55, marginTop:14 }}>Providers can decline prompts involving real people, copyrighted characters, music, or reference images with human faces. Failed starts return the charged tokens automatically. Finished MP4s are saved to the production library.</div><button onClick={startVideo} disabled={['queued','in_progress'].includes(videoJob?.status)} className="studio-button" style={{ width:'100%', marginTop:18, padding:14 }}>{['queued','in_progress'].includes(videoJob?.status) ? 'Video render in progress...' : `Render ${selectedRunbook.label.toLowerCase()} video`}</button></section>
        <section className="abundance-card" style={{ padding:22, minHeight:530, display:'flex', flexDirection:'column' }}><div className="abundance-mini-label">RENDER MONITOR</div>{videoJob?.status === 'completed' && videoJob.videoUrl ? <div style={{ marginTop:15 }}><div style={{ borderRadius:15, overflow:'hidden', background:'#080808', aspectRatio:videoJob.size === '720x1280' ? '9 / 16':'16 / 9' }}><video src={videoJob.videoUrl} poster={videoJob.thumbnailUrl} controls playsInline style={{ width:'100%', height:'100%', objectFit:'cover' }} /></div><div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:12 }}><div><b style={{ display:'block', fontSize:14 }}>Video render complete</b><span style={{ color:'rgba(232,232,232,.6)', fontSize:11 }}>{videoJob.seconds || videoSeconds}s / saved to Asset Library</span></div><a href={videoJob.videoUrl} target="_blank" rel="noreferrer" className="abundance-pill">Open MP4</a></div></div> : videoJob ? <div style={{ flex:1, display:'grid', placeItems:'center', textAlign:'center' }}><div><div style={{ fontSize:42, fontWeight:800, letterSpacing:'-.08em', color:'#ededed' }}>{Math.max(0, Number(videoJob.progress || 0))}%</div><div style={{ color:'#ffffff', fontWeight:800, marginTop:6 }}>{videoJob.status === 'queued' ? 'Render queued' : 'Rendering your ad'}</div><div style={{ color:'rgba(232,232,232,.62)', fontSize:12, lineHeight:1.6, maxWidth:310, margin:'8px auto 0' }}>FloStudio is checking this real video job every ten seconds. You can leave the page; the job ID is retained locally for monitoring when you return.</div><div style={{ height:7, background:'rgba(255,255,255,.1)', borderRadius:999, overflow:'hidden', marginTop:18 }}><div style={{ height:'100%', width:`${Math.max(4, Number(videoJob.progress || 4))}%`, background:'linear-gradient(90deg,#878787,#727272,#ededed)', borderRadius:999 }} /></div></div></div> : <div className="abundance-glass" style={{ flex:1, marginTop:15, borderRadius:16, padding:20, display:'flex', flexDirection:'column', justifyContent:'flex-end', background:'linear-gradient(160deg,rgba(136,136,136,.13),rgba(114,114,114,.21))' }}><div className="abundance-mini-label">NO FAKE VIDEO PREVIEWS</div><h3 style={{ fontSize:26, letterSpacing:'-.065em', lineHeight:1.05, marginTop:8 }}>Your real campaign film will appear here.</h3><p style={{ color:'rgba(232,232,232,.65)', fontSize:12, lineHeight:1.6, marginTop:10 }}>The preview board stays honest: it only becomes a playable video when a render job actually completes.</p></div>}</section>
      </div>}

      {activeTab === 'library' && <section className="abundance-card" style={{ padding:23 }}><div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', gap:16, marginBottom:18 }}><div><div className="abundance-mini-label">ASSET LIBRARY</div><h2 style={{ fontSize:26, letterSpacing:'-.06em', marginTop:5 }}>Every real output, ready for the next campaign.</h2></div><label className="studio-button" style={{ display:'inline-flex', alignItems:'center', justifyContent:'center' }}>{uploading ? 'Uploading...' : 'Add brand asset'}<input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={event => handleUpload(event.target.files)} style={{ display:'none' }} /></label></div>{handoffState.message && <div style={{ margin:'0 0 14px', color:handoffState.status === 'done' ? 'var(--signal)' : handoffState.status === 'error' ? '#c3c3c3' : 'rgba(240,240,240,.76)', fontSize:12 }}>{handoffState.message}</div>}{loadingAssets ? <div style={{ minHeight:280, display:'grid', placeItems:'center' }}><span className="spinner" /></div> : assets.length ? <div className="asset-grid">{assets.map(asset => <div key={asset.name} className="asset-card"><AssetVisual asset={asset} compact /><div className="asset-footer"><div style={{ minWidth:0 }}><div style={{ font:'500 9px DM Mono,monospace', color:asset.kind === 'video' ? '#ededed':'#c7c7c7', letterSpacing:'.09em' }}>{asset.kind === 'video' ? 'VIDEO RENDER' : 'IMAGE CREATIVE'}</div><div style={{ fontSize:11, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:110, marginTop:3 }}>{asset.name}</div></div><div style={{ display:'flex', gap:5 }}><button onClick={() => sendCreativeToReview(asset)} disabled={Boolean(asset.campaign_post_id) || handoffState.status === 'working'} style={{ border:'1px solid rgba(223,223,223,.55)', background:'rgba(223,223,223,.18)', color:'var(--signal)', borderRadius:8, padding:'6px 8px', fontSize:10, fontWeight:800 }}>{asset.campaign_post_id ? 'In review' : 'Review'}</button><button onClick={() => deleteAsset(asset)} style={{ border:'1px solid rgba(255,255,255,.18)', background:'rgba(8,8,8,.72)', color:'#ffffff', borderRadius:8, padding:'6px 8px', fontSize:10, fontWeight:700 }}>Delete</button></div></div></div>)}</div> : <div className="abundance-glass" style={{ minHeight:260, display:'grid', placeItems:'center', borderRadius:16, color:'rgba(232,232,232,.68)', textAlign:'center', padding:20 }}>Upload your product visual or make the first image ad. FloStudio will keep real assets here for reuse across image and video campaigns.</div>}</section>}
    </div>
  </Layout>
}
