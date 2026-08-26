import { useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout'
import { supabase } from '../supabase'
import { listMediaAssets, updateMediaAsset } from '../lib/mediaAssets'
import { generateVisualForPost } from '../lib/postVisuals'
import { useWorkspace } from '../context/WorkspaceContext'
import { recordMemoryEvent } from '../lib/creativeMemory'

const PLATFORM_META = {
  instagram:{ label:'Instagram', accent:'#b462d8', icon:'IG' },
  twitter:{ label:'X', accent:'#1c1f2b', icon:'X' },
  linkedin:{ label:'LinkedIn', accent:'#1677b9', icon:'in' },
  facebook:{ label:'Facebook', accent:'#2372dc', icon:'f' },
  tiktok:{ label:'TikTok', accent:'#111827', icon:'TT' },
}
const STATUS_TABS = ['pending', 'approved', 'published', 'all']

async function callAI({ workspaceId, action, platform, content }) {
  const { data:{ session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Your session expired. Sign in again before requesting AI review.')
  const response = await fetch('/api/review-copy', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}` },
    body:JSON.stringify({ workspaceId, action, platform, content }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'FloStudio could not complete this AI review request.')
  return data
}

function platformMeta(platform) {
  return PLATFORM_META[platform] || { label:platform || 'Channel', accent:'#667085', icon:String(platform || 'P').slice(0, 2).toUpperCase() }
}

function statusLabel(status) {
  return String(status || 'pending').replaceAll('_', ' ')
}

function dateLabel(value) {
  if (!value) return 'Unscheduled'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unscheduled'
  return date.toLocaleDateString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })
}

function AssetThumb({ asset, alt = 'Campaign creative' }) {
  if (!asset) return null
  return asset.kind === 'video'
    ? <video src={asset.asset_url} poster={asset.thumbnail_url || undefined} muted playsInline preload="metadata" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
    : <img src={asset.asset_url} alt={alt} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
}

export default function Pipeline() {
  const { useTokens, apps, activeApp, setActiveApp, workspaceId } = useWorkspace()
  const [posts, setPosts] = useState([])
  const [allPosts, setAllPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [activeTab, setActiveTab] = useState('pending')
  const [scopeMode, setScopeMode] = useState('app')
  const [legacyCount, setLegacyCount] = useState(0)
  const [selectedPost, setSelectedPost] = useState(null)
  const [editContent, setEditContent] = useState('')
  const [aiRewriting, setAiRewriting] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState('')
  const [aiError, setAiError] = useState('')
  const [bulkApproving, setBulkApproving] = useState(false)
  const [aiScoring, setAiScoring] = useState({})
  const [mediaAssets, setMediaAssets] = useState([])
  const [showAssetPicker, setShowAssetPicker] = useState(false)
  const [visualGenerating, setVisualGenerating] = useState({})
  const [batchVisualProgress, setBatchVisualProgress] = useState(null)
  const [publishing, setPublishing] = useState({})
  const [publishErrors, setPublishErrors] = useState({})

  const activeProductId = activeApp?.id || ''

  const loadPosts = async () => {
    setLoading(true)
    setLoadError('')
    try {
      const [postResult, campaignResult, mediaResult] = await Promise.all([
        supabase.from('campaign_posts').select('*').order('scheduled_at', { ascending:true }),
        supabase.from('campaigns').select('id,product_id,name'),
        listMediaAssets(activeProductId).catch(() => []),
      ])
      if (postResult.error) throw postResult.error
      if (campaignResult.error) throw campaignResult.error
      const campaignById = Object.fromEntries((campaignResult.data || []).map(campaign => [campaign.id, campaign]))
      const enriched = (postResult.data || []).map(post => ({ ...post, campaign:campaignById[post.campaign_id] || null }))
      const assigned = enriched.filter(post => post.campaign?.product_id)
      const unassigned = enriched.length - assigned.length
      const scoped = scopeMode === 'app' && activeProductId
        ? enriched.filter(post => post.campaign?.product_id === activeProductId)
        : enriched
      const readyMedia = (mediaResult || []).filter(asset => ['ready', 'completed'].includes(asset.render_status))
      setLegacyCount(unassigned)
      setMediaAssets(readyMedia)
      setAllPosts(scoped)
      setPosts(activeTab === 'all' ? scoped : scoped.filter(post => post.status === activeTab))
    } catch (error) {
      setLoadError(error.message || 'FloStudio could not load this pipeline view.')
      setPosts([])
      setAllPosts([])
      setMediaAssets([])
    } finally { setLoading(false) }
  }

  useEffect(() => { loadPosts() }, [activeTab, activeProductId, scopeMode])

  const counts = useMemo(() => ({
    pending:allPosts.filter(post => post.status === 'pending').length,
    approved:allPosts.filter(post => post.status === 'approved').length,
    published:allPosts.filter(post => post.status === 'published').length,
  }), [allPosts])

  const attachedAssets = postId => mediaAssets.filter(asset => asset.campaign_post_id === postId)
  const availableAssets = mediaAssets.filter(asset => !asset.campaign_post_id)

  const openPost = post => {
    setSelectedPost(post)
    setEditContent(post.content || '')
    setAiSuggestion('')
    setAiError('')
    setShowAssetPicker(false)
  }

  const attachAsset = async asset => {
    if (!selectedPost) return
    await updateMediaAsset(asset.id, { campaign_post_id:selectedPost.id })
    const { data:{ user } } = await supabase.auth.getUser()
    if (user && selectedPost.campaign_id) await recordMemoryEvent({ userId:user.id, campaignId:selectedPost.campaign_id, mediaAssetId:asset.id, eventType:'asset_attached', attributes:{ platform:selectedPost.platform, method:'pipeline_review' } })
    setShowAssetPicker(false)
    await loadPosts()
  }

  const detachAsset = async asset => {
    await updateMediaAsset(asset.id, { campaign_post_id:null })
    await loadPosts()
  }

  const generateVisual = async post => {
    if (visualGenerating[post.id] === 'working') return
    setVisualGenerating(previous => ({ ...previous, [post.id]:'working' }))
    try {
      const authorized = await useTokens(10, 'Campaign visual')
      if (!authorized) return
      await generateVisualForPost(post)
      setVisualGenerating(previous => ({ ...previous, [post.id]:'done' }))
      await loadPosts()
    } catch (error) {
      setVisualGenerating(previous => ({ ...previous, [post.id]:`error:${error.message || 'Generation failed'}` }))
    }
  }

  const generateQueueVisuals = async () => {
    const targets = posts.filter(post => attachedAssets(post.id).length === 0).slice(0, 5)
    if (!targets.length) return
    setBatchVisualProgress({ complete:0, total:targets.length, failed:0 })
    let complete = 0
    let failed = 0
    for (const post of targets) {
      setVisualGenerating(previous => ({ ...previous, [post.id]:'working' }))
      try {
        const authorized = await useTokens(10, 'Campaign visual')
        if (!authorized) break
        await generateVisualForPost(post)
        complete += 1
        setVisualGenerating(previous => ({ ...previous, [post.id]:'done' }))
      } catch (error) {
        failed += 1
        setVisualGenerating(previous => ({ ...previous, [post.id]:`error:${error.message || 'Generation failed'}` }))
      }
      setBatchVisualProgress({ complete, total:targets.length, failed })
    }
    await loadPosts()
  }

  const saveEdit = async () => {
    if (!selectedPost) return
    await supabase.from('campaign_posts').update({ content:editContent }).eq('id', selectedPost.id)
    const { data:{ user } } = await supabase.auth.getUser()
    if (user && selectedPost.campaign_id) await recordMemoryEvent({ userId:user.id, campaignId:selectedPost.campaign_id, eventType:'post_rewritten', attributes:{ platform:selectedPost.platform, changed:Boolean(editContent !== selectedPost.content) } })
    setSelectedPost(null)
    await loadPosts()
  }

  const updateStatus = async (id, status) => {
    if (status === 'published') return
    const post = allPosts.find(item => item.id === id)
    await supabase.from('campaign_posts').update({ status }).eq('id', id)
    const { data:{ user } } = await supabase.auth.getUser()
    if (user && post?.campaign_id && status === 'approved') await recordMemoryEvent({ userId:user.id, campaignId:post.campaign_id, eventType:'post_approved', attributes:{ platform:post.platform, postId:id, status } })
    if (selectedPost?.id === id) setSelectedPost(null)
    await loadPosts()
  }

  const publishPost = async post => {
    if (publishing[post.id]) return
    setPublishing(previous => ({ ...previous, [post.id]:true }))
    setPublishErrors(previous => ({ ...previous, [post.id]:null }))
    try {
      const { data:{ session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Your session expired. Sign in again before publishing.')
      const response = await fetch('/api/social-connect', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}` }, body:JSON.stringify({ platform:post.platform, action:'publish', campaignPostId:post.id }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'FloStudio could not publish this post.')
      const { data:{ user } } = await supabase.auth.getUser()
      if (user && post.campaign_id) await recordMemoryEvent({ userId:user.id, campaignId:post.campaign_id, eventType:'post_published', attributes:{ platform:post.platform, postId:post.id, providerPostId:data.providerPostId || null } })
      await loadPosts()
    } catch (error) {
      setPublishErrors(previous => ({ ...previous, [post.id]:error.message || 'FloStudio could not publish this post.' }))
    } finally { setPublishing(previous => ({ ...previous, [post.id]:false })) }
  }

  const deletePost = async id => {
    await supabase.from('campaign_posts').delete().eq('id', id)
    if (selectedPost?.id === id) setSelectedPost(null)
    await loadPosts()
  }

  const bulkApproveAll = async () => {
    setBulkApproving(true)
    const pendingIds = allPosts.filter(post => post.status === 'pending').map(post => post.id)
    if (pendingIds.length) {
      await supabase.from('campaign_posts').update({ status:'approved' }).in('id', pendingIds)
      const { data:{ user } } = await supabase.auth.getUser()
      if (user) await Promise.all(allPosts.filter(post => pendingIds.includes(post.id) && post.campaign_id).map(post => recordMemoryEvent({ userId:user.id, campaignId:post.campaign_id, eventType:'post_approved', attributes:{ platform:post.platform, postId:post.id, method:'bulk_pipeline_review' } })))
    }
    await loadPosts()
    setBulkApproving(false)
  }

  const aiRewrite = async () => {
    if (!selectedPost || aiRewriting) return
    setAiRewriting(true)
    setAiSuggestion('')
    setAiError('')
    try {
      const result = await callAI({ workspaceId, action:'rewrite', platform:selectedPost.platform, content:editContent })
      setAiSuggestion(String(result.content || '').trim())
    } catch (error) {
      setAiError(error?.message || 'FloStudio could not create a rewrite suggestion.')
    } finally { setAiRewriting(false) }
  }

  const scorePost = async post => {
    if (aiScoring[post.id] === 'loading') return
    setAiScoring(previous => ({ ...previous, [post.id]:'loading' }))
    try {
      const result = await callAI({ workspaceId, action:'score', platform:post.platform, content:String(post.content || '').slice(0, 2400) })
      setAiScoring(previous => ({ ...previous, [post.id]:{ score:result.score, reason:result.reason || '' } }))
    } catch (error) {
      setAiScoring(previous => ({ ...previous, [post.id]:{ error:error?.message || 'FloStudio could not score this post.' } }))
    }
  }

  const changeApp = productId => {
    const next = apps.find(app => app.id === productId)
    if (next) setActiveApp(next)
    setScopeMode('app')
    setSelectedPost(null)
  }

  return <Layout title="Pipeline">
    <style>{`
      @keyframes pipelineIn{from{opacity:0;transform:translateY(9px)}to{opacity:1;transform:translateY(0)}}
      @keyframes pipelineSpin{to{transform:rotate(360deg)}}
      .pipeline-wrap{max-width:1200px;margin:0 auto;padding:0 4px 52px;animation:pipelineIn .28s ease-out}
      .pipeline-hero{position:relative;overflow:hidden;padding:30px;border:1px solid #d9e0eb;border-radius:22px;background:linear-gradient(135deg,#111a33 0%,#1b2450 56%,#513fc2 160%);box-shadow:0 20px 52px rgba(18,29,63,.14)}
      .pipeline-hero:before{content:'';position:absolute;width:460px;height:460px;right:-190px;top:-275px;border-radius:50%;background:radial-gradient(circle,rgba(167,161,255,.4),transparent 67%)}
      .pipeline-hero h1{color:#fff!important;text-shadow:0 2px 18px rgba(4,8,30,.35)}.pipeline-hero h1 .studio-serif{color:#cbc7ff!important}.pipeline-hero p{color:rgba(243,244,255,.8)!important}
      .pipeline-hero:after{content:'';position:absolute;inset:auto 0 0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent)}
      .pipeline-context{display:grid;grid-template-columns:minmax(0,1fr) minmax(270px,.55fr);gap:16px;align-items:end;position:relative;z-index:1;margin-top:26px;padding-top:17px;border-top:1px solid rgba(255,255,255,.14)}
      .pipeline-kicker{font:800 9px 'DM Mono',monospace;letter-spacing:.13em;text-transform:uppercase;color:#bdb9ff}
      .pipeline-stat{padding:15px 16px;border:1px solid #dfe6f0;border-radius:16px;background:#fff;box-shadow:0 9px 22px rgba(20,30,55,.045);cursor:pointer;transition:.18s ease}
      .pipeline-stat:hover{transform:translateY(-2px);border-color:#bcb7ff}.pipeline-stat.active{border-color:#7068ee;box-shadow:0 12px 26px rgba(91,82,226,.13)}
      .pipeline-filter{border:1px solid #e0e6ef;border-radius:14px;background:#fff;padding:5px;display:flex;gap:4px;flex-wrap:wrap}.pipeline-filter button{border:0;background:transparent;color:#65708a;border-radius:10px;padding:8px 12px;font-size:11px;font-weight:800;cursor:pointer}.pipeline-filter button.active{background:#28245a;color:#fff;box-shadow:0 5px 11px rgba(40,36,90,.18)}
      .pipeline-card{display:grid;grid-template-columns:50px 134px minmax(0,1fr) auto;gap:15px;align-items:stretch;padding:16px;border:1px solid #dfe6ef;border-radius:18px;background:#fff;box-shadow:0 7px 20px rgba(16,24,40,.035)}
      .pipeline-card:hover{border-color:#c9c6ff;box-shadow:0 12px 28px rgba(56,50,124,.075)}
      .pipeline-action{border:1px solid #dbe1eb;background:#fff;color:#34405c;border-radius:10px;padding:8px 10px;cursor:pointer;font-size:10.5px;font-weight:800;white-space:nowrap}.pipeline-action:hover{border-color:#9d97f2;background:#f5f4ff;color:#4f48c7}.pipeline-action.primary{background:#5f59e8;color:#fff;border-color:#5f59e8}.pipeline-action.primary:hover{background:#5049d2}.pipeline-action.danger{color:#b64959}.pipeline-action:disabled{opacity:.58;cursor:wait}
      .pipeline-empty{padding:54px 24px;text-align:center;border:1px dashed #cfd8e6;border-radius:18px;background:#fbfcfe;color:#65708a}
      @media(max-width:860px){.pipeline-context{grid-template-columns:1fr}.pipeline-card{grid-template-columns:44px 102px minmax(0,1fr)}.pipeline-actions{grid-column:1/-1;justify-content:flex-start!important}.pipeline-card .pipeline-preview{width:102px!important;min-height:102px!important}}
      @media(max-width:620px){.pipeline-hero{padding:22px 18px}.pipeline-card{grid-template-columns:40px minmax(0,1fr)}.pipeline-preview{display:none}.pipeline-wrap{padding:0 0 36px}}
    `}</style>
    <div className="flo-page pipeline-wrap">
      <section className="pipeline-hero">
        <div style={{ position:'relative', zIndex:1, display:'flex', justifyContent:'space-between', gap:18, alignItems:'flex-start', flexWrap:'wrap' }}>
          <div><div className="pipeline-kicker">FLOSTUDIO / CONTENT PIPELINE</div><h1 style={{ color:'#fff', fontSize:'clamp(34px,4.2vw,56px)', lineHeight:.95, letterSpacing:'-.065em', maxWidth:680, marginTop:10 }}>Turn creative into <span className="studio-serif" style={{ color:'#c7c3ff' }}>confident decisions.</span></h1><p style={{ color:'rgba(243,244,255,.74)', fontSize:12.5, lineHeight:1.7, maxWidth:620, marginTop:13 }}>Review the right work for one app at a time. Attach the app’s real Creative Lab media, tune the copy, and move only approved work forward.</p></div>
          <div style={{ display:'grid', gap:7, minWidth:170, padding:'10px 12px', border:'1px solid rgba(255,255,255,.16)', borderRadius:13, background:'rgba(7,10,29,.25)' }}><span className="pipeline-kicker" style={{ color:'#aaa6ef' }}>IN CURRENT VIEW</span><b style={{ color:'#fff', fontSize:23 }}>{allPosts.length}</b><span style={{ color:'rgba(243,244,255,.66)', fontSize:10.5 }}>post{allPosts.length === 1 ? '' : 's'} in this pipeline</span></div>
        </div>
        <div className="pipeline-context">
          <div><div className="pipeline-kicker">PIPELINE CONTEXT</div><p style={{ color:'rgba(243,244,255,.65)', fontSize:10.5, marginTop:5 }}>Switch apps to scope review posts and available Creative Lab media together. Existing unassigned history remains available from All Portfolio.</p></div>
          <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) auto', gap:8, alignItems:'end' }}><label style={{ display:'grid', gap:5, color:'#c7c4f4', fontSize:9, fontWeight:850, letterSpacing:'.09em', textTransform:'uppercase' }}>Portfolio app<select value={activeApp?.id || ''} onChange={event => changeApp(event.target.value)} style={{ padding:'10px 11px', borderRadius:10, border:'1px solid rgba(255,255,255,.22)', background:'#fff', color:'#20243d', fontWeight:800, textTransform:'none', letterSpacing:0 }}>{apps.map(app => <option key={app.id} value={app.id}>{app.name}{app.category ? ` · ${app.category}` : ''}</option>)}</select></label><button type="button" onClick={() => setScopeMode(mode => mode === 'app' ? 'all' : 'app')} className="pipeline-action" style={{ height:38, color:'#fff', borderColor:'rgba(255,255,255,.25)', background:scopeMode === 'all' ? '#786ff1' : 'rgba(255,255,255,.08)' }}>{scopeMode === 'all' ? 'App view' : 'All portfolio'}</button></div>
        </div>
      </section>

      {legacyCount > 0 && scopeMode === 'app' && <div style={{ marginTop:14, padding:'10px 13px', borderRadius:12, border:'1px solid #e7defd', background:'#faf8ff', color:'#625c7d', fontSize:11, lineHeight:1.55 }}><b style={{ color:'#4e47b8' }}>{legacyCount} legacy pipeline record{legacyCount === 1 ? '' : 's'}</b> cannot yet be matched to a portfolio app and remain preserved in <b>All Portfolio</b>. No records have been removed or changed.</div>}
      {loadError && <div style={{ marginTop:14, padding:'10px 13px', borderRadius:12, border:'1px solid #f0c6cd', background:'#fff7f7', color:'#9b3545', fontSize:11.5 }}>{loadError}</div>}

      <section style={{ display:'grid', gridTemplateColumns:'repeat(3,minmax(0,1fr))', gap:12, marginTop:18 }}>
        {[['pending','Needs review','#6f63d8'],['approved','Approved to ship','#16836b'],['published','Published','#2673c9']].map(([status,label,accent]) => <button key={status} type="button" onClick={() => setActiveTab(status)} className={`pipeline-stat ${activeTab === status ? 'active' : ''}`} style={{ textAlign:'left' }}><div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'center' }}><span style={{ color:'#68738a', fontSize:9, letterSpacing:'.1em', fontWeight:850, textTransform:'uppercase' }}>{label}</span><span style={{ width:8, height:8, borderRadius:'50%', background:accent }}/></div><b style={{ display:'block', color:'#20273d', fontSize:28, letterSpacing:'-.06em', marginTop:7 }}>{counts[status]}</b><span style={{ color:'#7a8498', fontSize:10.5 }}>in {scopeMode === 'all' ? 'all portfolio' : (activeApp?.name || 'selected app')}</span></button>)}
      </section>

      <section style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:14, flexWrap:'wrap', margin:'19px 0 13px' }}>
        <div className="pipeline-filter">{STATUS_TABS.map(tab => <button key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tab === 'all' ? `All (${allPosts.length})` : `${statusLabel(tab)} (${counts[tab]})`}</button>)}</div>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          {counts.pending > 0 && <button type="button" onClick={bulkApproveAll} disabled={bulkApproving} className="pipeline-action primary">{bulkApproving ? 'Approving…' : `Approve ${counts.pending} pending`}</button>}
          <button type="button" onClick={generateQueueVisuals} disabled={Boolean(batchVisualProgress && batchVisualProgress.complete < batchVisualProgress.total)} className="pipeline-action">{batchVisualProgress ? `Creating ${batchVisualProgress.complete}/${batchVisualProgress.total}` : 'Create visuals for next 5'}</button>
        </div>
      </section>

      {loading ? <div className="pipeline-empty"><span style={{ width:28, height:28, border:'3px solid #dde2f0', borderTopColor:'#6159e7', borderRadius:'50%', display:'inline-block', animation:'pipelineSpin .75s linear infinite' }}/></div> : posts.length === 0 ? <div className="pipeline-empty"><div className="pipeline-kicker" style={{ color:'#756fca' }}>CLEAR PIPELINE</div><h2 style={{ color:'#29324b', fontSize:22, letterSpacing:'-.04em', marginTop:7 }}>No {activeTab === 'all' ? '' : statusLabel(activeTab)} posts for {scopeMode === 'all' ? 'this portfolio view' : (activeApp?.name || 'this app')}.</h2><p style={{ maxWidth:490, margin:'8px auto 0', fontSize:11.5, lineHeight:1.6 }}>Create campaigns and visual assets for the selected app, or change the context above to review another part of the portfolio.</p>{scopeMode === 'app' && legacyCount > 0 && <button type="button" onClick={() => setScopeMode('all')} className="pipeline-action" style={{ marginTop:14 }}>View {legacyCount} preserved legacy posts</button>}</div> : <div style={{ display:'grid', gap:11 }}>{posts.map(post => {
        const meta = platformMeta(post.platform)
        const score = aiScoring[post.id]
        const postAssets = attachedAssets(post.id)
        return <article key={post.id} className="pipeline-card">
          <div style={{ width:46, height:46, marginTop:1, borderRadius:13, display:'grid', placeItems:'center', background:`${meta.accent}13`, border:`1px solid ${meta.accent}28`, color:meta.accent, fontSize:10, fontWeight:900 }}>{meta.icon}</div>
          <div className="pipeline-preview" style={{ width:134, minHeight:126, borderRadius:13, overflow:'hidden', background:'#f3f5fa', border:'1px solid #e0e6ef', position:'relative' }}>{postAssets[0] ? <AssetThumb asset={postAssets[0]} /> : <div style={{ height:'100%', padding:12, display:'flex', flexDirection:'column', justifyContent:'space-between', background:'linear-gradient(145deg,#f2f0ff,#f8fbff)' }}><span className="pipeline-kicker" style={{ color:'#7068d8' }}>CREATIVE NEEDED</span><button type="button" onClick={() => generateVisual(post)} disabled={visualGenerating[post.id] === 'working'} className="pipeline-action" style={{ padding:'7px 6px', fontSize:9 }}>{visualGenerating[post.id] === 'working' ? 'CREATING…' : 'Generate visual · 10'}</button></div>}</div>
          <div style={{ minWidth:0 }}><div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}><span style={{ color:meta.accent, fontSize:10, fontWeight:850 }}>{meta.label}</span><span style={{ color:'#7c869a', fontSize:10 }}>{dateLabel(post.scheduled_at)}</span>{post.campaign?.name && <span style={{ maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', padding:'3px 7px', borderRadius:6, color:'#626b82', background:'#f2f4f8', fontSize:9.5 }}>{post.campaign.name}</span>}</div><p style={{ color:'#273149', fontSize:12.5, lineHeight:1.65, fontWeight:600, marginTop:8, whiteSpace:'pre-wrap' }}>{post.content}</p><div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginTop:9 }}><span style={{ padding:'4px 8px', borderRadius:20, background:post.status === 'published' ? '#eaf7f2' : post.status === 'approved' ? '#eef5ff' : '#f3f0ff', color:post.status === 'published' ? '#197d61' : post.status === 'approved' ? '#2870b8' : '#6259c8', fontSize:9.5, fontWeight:850, textTransform:'uppercase' }}>{statusLabel(post.status)}</span>{score && score !== 'loading' && !score.error && <span title={score.reason || ''} style={{ color:'#515d75', fontSize:10.5, fontWeight:800 }}>AI score · {score.score}/10</span>}{score?.error && <span title={score.error} style={{ color:'#b84355', fontSize:10.5 }}>AI review unavailable</span>}{publishErrors[post.id] && <span style={{ color:'#b84355', fontSize:10.5 }}>Publish stopped · {publishErrors[post.id]}</span>}</div></div>
          <div className="pipeline-actions" style={{ display:'flex', flexDirection:'column', gap:7, alignItems:'stretch', justifyContent:'center' }}><button type="button" onClick={() => scorePost(post)} disabled={score === 'loading'} className="pipeline-action">{score === 'loading' ? 'Scoring…' : 'Score'}</button><button type="button" onClick={() => openPost(post)} className="pipeline-action">{postAssets.length ? `Creative ${postAssets.length}` : 'Choose creative'}</button>{post.status === 'pending' && <button type="button" onClick={() => updateStatus(post.id, 'approved')} className="pipeline-action primary">Approve</button>}{post.status === 'approved' && <button type="button" onClick={() => publishPost(post)} disabled={publishing[post.id]} className="pipeline-action primary">{publishing[post.id] ? 'Sending…' : 'Publish'}</button>}<button type="button" onClick={() => deletePost(post.id)} className="pipeline-action danger">Delete</button></div>
        </article>
      })}</div>}
    </div>

    {selectedPost && <div onClick={() => setSelectedPost(null)} style={{ position:'fixed', inset:0, zIndex:1000, display:'grid', placeItems:'center', padding:20, background:'rgba(17,24,39,.54)', backdropFilter:'blur(8px)' }}><section onClick={event => event.stopPropagation()} style={{ width:'min(690px,100%)', maxHeight:'88vh', overflowY:'auto', padding:24, borderRadius:20, background:'#fff', boxShadow:'0 28px 80px rgba(10,15,34,.28)' }}><div style={{ display:'flex', justifyContent:'space-between', gap:14, alignItems:'flex-start' }}><div><div className="pipeline-kicker" style={{ color:'#5f59e8' }}>REVIEW & REFINEMENT</div><h2 style={{ color:'#273149', fontSize:23, letterSpacing:'-.05em', marginTop:6 }}>Shape this {platformMeta(selectedPost.platform).label} post.</h2></div><button type="button" onClick={() => setSelectedPost(null)} className="pipeline-action" style={{ padding:'6px 10px', fontSize:16 }}>×</button></div><textarea value={editContent} onChange={event => setEditContent(event.target.value)} rows={7} style={{ width:'100%', boxSizing:'border-box', marginTop:17, padding:'12px 13px', borderRadius:12, border:'1px solid #dce3ed', background:'#fbfcfe', color:'#273149', font: '500 13px/1.65 inherit', resize:'vertical' }}/><div style={{ marginTop:16, paddingTop:15, borderTop:'1px solid #e6eaf1' }}><div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'center', flexWrap:'wrap' }}><div><div className="pipeline-kicker" style={{ color:'#5f59e8' }}>APP CREATIVE LIBRARY</div><p style={{ color:'#65708a', fontSize:10.5, marginTop:4 }}>Only completed images and videos for <b>{activeApp?.name || 'the selected app'}</b> are available here.</p></div><button type="button" onClick={() => setShowAssetPicker(value => !value)} className="pipeline-action">{showAssetPicker ? 'Close library' : 'Choose Creative Lab asset'}</button></div>{attachedAssets(selectedPost.id).length > 0 && <div style={{ display:'flex', gap:8, marginTop:11, overflowX:'auto' }}>{attachedAssets(selectedPost.id).map(asset => <div key={asset.id} style={{ position:'relative', width:82, height:82, flex:'0 0 auto', overflow:'hidden', borderRadius:10, background:'#eff2f7' }}><AssetThumb asset={asset} /><button type="button" onClick={() => detachAsset(asset)} style={{ position:'absolute', top:5, right:5, border:0, borderRadius:6, background:'rgba(17,24,39,.78)', color:'#fff', padding:'4px 6px', fontSize:9 }}>Remove</button></div>)}</div>}{showAssetPicker && <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(105px,1fr))', gap:8, marginTop:12 }}>{availableAssets.length ? availableAssets.map(asset => <button type="button" key={asset.id} onClick={() => attachAsset(asset)} title="Attach this asset" style={{ padding:0, height:100, overflow:'hidden', border:'1px solid #d8dfe9', borderRadius:10, background:'#f7f9fc', cursor:'pointer', position:'relative' }}><AssetThumb asset={asset} />{asset.kind === 'video' && <span style={{ position:'absolute', left:5, bottom:5, padding:'3px 5px', borderRadius:5, background:'rgba(16,24,42,.8)', color:'#fff', fontSize:8, fontWeight:850 }}>VIDEO</span>}</button>) : <p style={{ gridColumn:'1/-1', color:'#758096', fontSize:11 }}>No unassigned media for this app. Generate or upload it in Creative Lab first.</p>}</div>}</div>{aiError && <div style={{ marginTop:15, padding:11, borderRadius:12, background:'#fff7f7', border:'1px solid #f1cbd0', color:'#9b3545', fontSize:11.5 }}>{aiError}</div>}{aiSuggestion && <div style={{ marginTop:15, padding:13, borderRadius:12, background:'#f4f2ff', border:'1px solid #ddd9ff' }}><div className="pipeline-kicker" style={{ color:'#5f59e8' }}>AI REWRITE SUGGESTION</div><p style={{ color:'#3f4960', whiteSpace:'pre-wrap', fontSize:12, lineHeight:1.6, marginTop:7 }}>{aiSuggestion}</p><button type="button" onClick={() => { setEditContent(aiSuggestion); setAiSuggestion('') }} className="pipeline-action primary" style={{ marginTop:9 }}>Use suggestion</button></div>}<div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'center', flexWrap:'wrap', marginTop:19 }}><button type="button" onClick={aiRewrite} disabled={aiRewriting} className="pipeline-action">{aiRewriting ? 'Writing…' : 'AI rewrite'}</button><div style={{ display:'flex', gap:8 }}><button type="button" onClick={() => setSelectedPost(null)} className="pipeline-action">Cancel</button><button type="button" onClick={saveEdit} className="pipeline-action primary">Save changes</button></div></div></section></div>}
  </Layout>
}
