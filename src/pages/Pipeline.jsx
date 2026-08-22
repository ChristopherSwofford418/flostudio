import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { supabase } from '../supabase'
import { listMediaAssets, updateMediaAsset } from '../lib/mediaAssets'
import { generateVisualForPost } from '../lib/postVisuals'
import { useWorkspace } from '../context/WorkspaceContext'
import { recordMemoryEvent } from '../lib/creativeMemory'

const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4a3B2bm9raHFicGJxZWZlZ3hhIicgLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc3NjIwMjU0OCwiZXhwIjoyMDkxNzc4NTQ4f5.OVdLzh2Bvuf4l6F6ITSpj4pWqoc3EoTxs6OCvrMf4JU'

async function callAI(messages, maxTokens = 800) {
  const res = await fetch('https://xxkpvnokhqbpbqefegxa.supabase.co/functions/v1/ai-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}`, apikey: ANON },
    body: JSON.stringify({ model: 'gpt-4o', messages, max_tokens: maxTokens }),
  })
  const d = await res.json()
  return d?.content || d?.choices?.[0]?.message?.content || ''
}

const PLATFORM_COLORS = { instagram: '#7c7c7c', twitter: '#aaaaaa', linkedin: '#aaaaaa', facebook: '#aaaaaa', tiktok: '#c5c5c5' }
const STATUS_TABS = ['pending', 'approved', 'published', 'all']

export default function Pipeline() {
  const { useTokens } = useWorkspace()
  const [posts, setPosts] = useState([])
  const [allPosts, setAllPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('pending')
  const [selectedPost, setSelectedPost] = useState(null)
  const [editContent, setEditContent] = useState('')
  const [aiRewriting, setAiRewriting] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState('')
  const [bulkApproving, setBulkApproving] = useState(false)
  const [aiScoring, setAiScoring] = useState({})
  const [mediaAssets, setMediaAssets] = useState([])
  const [showAssetPicker, setShowAssetPicker] = useState(false)
  const [visualGenerating, setVisualGenerating] = useState({})
  const [batchVisualProgress, setBatchVisualProgress] = useState(null)
  const [publishing, setPublishing] = useState({})
  const [publishErrors, setPublishErrors] = useState({})

  useEffect(() => { loadPosts() }, [activeTab])

  const loadPosts = async () => {
    setLoading(true)
    const [{ data: allData, error }, mediaResult] = await Promise.all([
      supabase.from('campaign_posts').select('*').order('scheduled_at', { ascending: true }),
      listMediaAssets().catch(() => []),
    ])
    setMediaAssets(mediaResult.filter(asset => asset.render_status === 'ready' || asset.render_status === 'completed'))
    if (!error && allData) {
      setAllPosts(allData)
      if (activeTab === 'all') {
        setPosts(allData)
      } else {
        setPosts(allData.filter(p => p.status === activeTab))
      }
    } else {
      setPosts([])
      setAllPosts([])
    }
    setLoading(false)
  }

  const openPost = (post) => {
    setSelectedPost(post)
    setEditContent(post.content)
    setAiSuggestion('')
    setShowAssetPicker(false)
  }

  const attachedAssets = postId => mediaAssets.filter(asset => asset.campaign_post_id === postId)
  const availableAssets = mediaAssets.filter(asset => !asset.campaign_post_id)

  const attachAsset = async asset => {
    if (!selectedPost) return
    await updateMediaAsset(asset.id, { campaign_post_id:selectedPost.id })
    const { data:{ user } } = await supabase.auth.getUser()
    if (user && selectedPost.campaign_id) await recordMemoryEvent({ userId:user.id, campaignId:selectedPost.campaign_id, mediaAssetId:asset.id, eventType:'asset_attached', attributes:{ platform:selectedPost.platform, method:'review_queue' } })
    setShowAssetPicker(false)
    await loadPosts()
    setSelectedPost(previous => previous ? { ...previous } : previous)
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
      if (!authorized) { setVisualGenerating(previous => ({ ...previous, [post.id]:null })); return }
      await generateVisualForPost(post)
      setVisualGenerating(previous => ({ ...previous, [post.id]:'done' }))
      await loadPosts()
    } catch (visualError) {
      setVisualGenerating(previous => ({ ...previous, [post.id]:`error:${visualError.message || 'Generation failed'}` }))
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
      } catch (visualError) {
        failed += 1
        setVisualGenerating(previous => ({ ...previous, [post.id]:`error:${visualError.message || 'Generation failed'}` }))
      }
      setBatchVisualProgress({ complete, total:targets.length, failed })
    }
    await loadPosts()
  }

  const saveEdit = async () => {
    if (!selectedPost) return
    await supabase.from('campaign_posts').update({ content: editContent }).eq('id', selectedPost.id)
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

  const deletePost = async (id) => {
    await supabase.from('campaign_posts').delete().eq('id', id)
    if (selectedPost?.id === id) setSelectedPost(null)
    await loadPosts()
  }

  const bulkApproveAll = async () => {
    setBulkApproving(true)
    const pendingIds = allPosts.filter(p => p.status === 'pending').map(p => p.id)
    if (pendingIds.length > 0) {
      await supabase.from('campaign_posts').update({ status: 'approved' }).in('id', pendingIds)
      const { data:{ user } } = await supabase.auth.getUser()
      if (user) await Promise.all(allPosts.filter(post => pendingIds.includes(post.id) && post.campaign_id).map(post => recordMemoryEvent({ userId:user.id, campaignId:post.campaign_id, eventType:'post_approved', attributes:{ platform:post.platform, postId:post.id, method:'bulk_review' } })))
    }
    await loadPosts()
    setBulkApproving(false)
  }

  const aiRewrite = async () => {
    setAiRewriting(true)
    setAiSuggestion('')
    const text = await callAI([
      { role: 'system', content: 'You are a social media expert. Rewrite the given post to be more engaging, clear, and platform-appropriate. Keep it concise. Return only the rewritten post text, no explanation.' },
      { role: 'user', content: `Platform: ${selectedPost?.platform}\nOriginal post:\n${editContent}` }
    ])
    setAiSuggestion(text.trim())
    setAiRewriting(false)
  }

  const scorePost = async (post) => {
    if (aiScoring[post.id]) return
    setAiScoring(prev => ({ ...prev, [post.id]: 'loading' }))
    const text = await callAI([
      { role: 'system', content: 'Rate this social media post on a scale of 1-10 for engagement potential. Return JSON: {"score":7,"reason":"..."}' },
      { role: 'user', content: `Platform: ${post.platform}\nPost: ${post.content.substring(0, 300)}` }
    ], 200)
    let result = { score: 7, reason: '' }
    try { const m = text.match(/\{[\s\S]*\}/); result = m ? JSON.parse(m[0]) : result } catch {}
    setAiScoring(prev => ({ ...prev, [post.id]: result }))
  }

  const counts = {
    pending: allPosts.filter(p => p.status === 'pending').length,
    approved: allPosts.filter(p => p.status === 'approved').length,
    published: allPosts.filter(p => p.status === 'published').length,
  }

  return (
    <Layout title="Content Pipeline">
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div className="flo-page" style={{ maxWidth: 1100, margin: '0 auto', animation: 'fadeIn 0.25s ease' }}>

        {/* Decision desk */}
        <section className="abundance-shell" style={{ display:'grid', gridTemplateColumns:'1.18fr .82fr', minHeight:230, marginBottom:24 }}>
          <div style={{ padding:'27px 30px', position:'relative', zIndex:1, display:'flex', flexDirection:'column', justifyContent:'space-between' }}>
            <div><div className="abundance-eyebrow">Review queue / Decision desk</div><h1 className="abundance-title" style={{ fontSize:'clamp(32px,4vw,48px)', maxWidth:500, marginTop:10 }}>Strong ideas need a <em>final call.</em></h1><p className="abundance-copy" style={{ marginTop:14, maxWidth:490 }}>Score what is worth shipping, revise what needs a sharper edge, and keep your brand’s creative quality high.</p></div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8, alignItems:'center' }}>{counts.pending > 0 && <button onClick={bulkApproveAll} disabled={bulkApproving} className="studio-button" style={{ alignSelf:'flex-start' }}>{bulkApproving ? 'Approving drafts…' : `Approve all pending (${counts.pending}) →`}</button>}<button onClick={generateQueueVisuals} disabled={Boolean(batchVisualProgress && batchVisualProgress.complete < batchVisualProgress.total)} className="studio-chip" style={{ background:'rgba(255,255,255,.12)', color:'#ffffff', borderColor:'rgba(255,255,255,.25)', padding:'10px 13px' }}>{batchVisualProgress ? `Creating visuals ${batchVisualProgress.complete}/${batchVisualProgress.total}` : 'Create visuals for next 5'}</button></div>
          </div>
          <div style={{ position:'relative', minHeight:230, overflow:'hidden' }}><img src="/visuals/flo-preview-editorial.jpg" alt="Creative review moodboard" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', opacity:.9 }}/><div style={{ position:'absolute', inset:0, background:'linear-gradient(90deg,#272727 0%,rgba(39,39,39,.18) 55%,rgba(8,8,8,.1))' }} /><div className="abundance-glass" style={{ position:'absolute', right:18, bottom:18, color:'#ffffff', padding:'10px 12px', borderRadius:12 }}><div style={{ fontFamily:'DM Mono,monospace', fontSize:9, letterSpacing:'.08em', color:'#c5c5c5' }}>IN REVIEW</div><b style={{ display:'block', marginTop:2, fontSize:12 }}>{counts.pending} decision{counts.pending === 1 ? '' : 's'} waiting</b></div></div>
        </section>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 22 }}>
          {[['pending','Pending Review','#c5c5c5'],['approved','Approved','#939393'],['published','Published','#aaaaaa']].map(([s,label,c]) => (
            <div key={s} onClick={() => setActiveTab(s)} className="abundance-card" style={{ border: `1px solid ${activeTab === s ? c : 'rgba(255,255,255,.13)'}`, padding: '20px 24px', cursor: 'pointer', transition: 'all 0.15s ease', boxShadow: activeTab === s ? `0 8px 28px ${c}28` : undefined }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: activeTab === s ? c : '#ffffff', letterSpacing: '-0.5px' }}>{counts[s] || 0}</div>
              <div style={{ fontSize: 12.5, color: 'rgba(232,232,232,.64)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="abundance-glass" style={{ display: 'flex', gap: 6, marginBottom: 20, borderRadius: 12, padding: 6, width: 'fit-content' }}>
          {STATUS_TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '8px 18px', borderRadius: 8, background: activeTab === tab ? 'linear-gradient(135deg,#7c7c7c,#c5c5c5)' : 'transparent', border: 'none', color: activeTab === tab ? '#111111' : 'rgba(247,247,247,.68)', fontSize: 13, fontWeight: activeTab === tab ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize', transition: 'all 0.15s' }}>{tab}</button>
          ))}
        </div>

        {/* Post list */}
        {loading ? (
          <div className="abundance-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 220 }}>
            <span style={{ width: 30, height: 30, border: '3px solid #e7e7e7', borderTopColor: '#535353', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
          </div>
        ) : posts.length === 0 ? (
          <div className="abundance-card" style={{ textAlign: 'center', padding: '80px 20px' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#ffffff', marginBottom: 6 }}>No {activeTab} posts found</div>
            <div style={{ fontSize: 13, color: 'rgba(232,232,232,.64)' }}>Use Ask Flo or Agent HQ to generate campaign content</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {posts.map(post => {
              const score = aiScoring[post.id]
              const postAssets = attachedAssets(post.id)
              return (
                <div key={post.id} className="abundance-card" style={{ padding: '16px 18px', display: 'flex', gap: 16, alignItems: 'stretch', transition: 'all 0.15s' }}>
                  
                  {/* Platform badge */}
                  <div style={{ width: 42, height: 42, borderRadius: 10, background: `${PLATFORM_COLORS[post.platform] || '#535353'}12`, border: `1px solid ${PLATFORM_COLORS[post.platform] || '#535353'}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: PLATFORM_COLORS[post.platform] || '#535353', textTransform: 'uppercase' }}>{post.platform?.substring(0,2)}</span>
                  </div>

                  <div style={{ width:126, minHeight:126, borderRadius:12, overflow:'hidden', flexShrink:0, background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.14)', position:'relative' }}>{postAssets.length > 0 ? (postAssets[0].kind === 'video' ? <video src={postAssets[0].asset_url} controls playsInline preload="metadata" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <img src={postAssets[0].asset_url} alt="Campaign creative" style={{ width:'100%', height:'100%', objectFit:'cover' }} />) : <div style={{ height:'100%', padding:12, display:'flex', flexDirection:'column', justifyContent:'space-between', background:'linear-gradient(145deg,rgba(170,170,170,.30),rgba(124,124,124,.18))' }}><div style={{ font:'700 9px DM Mono,monospace', letterSpacing:'.08em', color:'#c5c5c5' }}>VISUAL NEEDED</div><button onClick={() => generateVisual(post)} disabled={visualGenerating[post.id] === 'working'} style={{ border:'1px solid rgba(255,255,255,.22)', background:'rgba(17,17,17,.62)', color:'#ffffff', borderRadius:7, padding:'7px 5px', fontSize:10, fontWeight:800, cursor:'pointer' }}>{visualGenerating[post.id] === 'working' ? 'CREATING…' : 'GENERATE · 10'}</button></div>}</div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: '#ffffff', lineHeight: 1.6, marginBottom: 10, fontWeight: 500 }}>{post.content}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                      {post.scheduled_at && <span style={{ fontSize: 12, color: 'rgba(232,232,232,.64)', fontWeight: 500 }}>{new Date(post.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
                      <span style={{ fontSize: 11.5, padding: '3px 10px', borderRadius: 20, background: post.status === 'approved' ? '#f0f0f0' : post.status === 'published' ? '#ededed' : '#f3f3f3', color: post.status === 'approved' ? '#6e6e6e' : post.status === 'published' ? '#6b6b6b' : '#6a6a6a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{post.status}</span>
                      {score && score !== 'loading' && <span style={{ fontSize: 12, fontWeight: 700, color: score.score >= 8 ? '#6e6e6e' : score.score >= 6 ? '#6a6a6a' : '#4d4d4d' }}>AI Score: {score.score}/10</span>}
                    </div>
                    {publishErrors[post.id] && <div style={{ marginTop:9, color:'#c6c6c6', fontSize:11, lineHeight:1.5 }}>Publish stopped: {publishErrors[post.id]} <a href="/accounts" style={{ color:'#ededed', fontWeight:800 }}>Open Channels</a></div>}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => scorePost(post)} title="AI Score" style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.13)', color: '#e7e7e7', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {score === 'loading' ? <span style={{ width: 12, height: 12, border: '2px solid #d4d4d4', borderTopColor: '#838383', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} /> : 'Score'}
                    </button>
                    <button onClick={() => openPost(post)} title="Attach or change campaign creative" style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.13)', color: '#e7e7e7', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>{postAssets.length ? `Creative ${postAssets.length}` : 'Choose Creative'}</button>
                    {post.status === 'pending' && <button onClick={() => updateStatus(post.id, 'approved')} title="Approve" style={{ padding: '8px 16px', borderRadius: 8, background: '#f0f0f0', border: '1px solid #c5c5c5', color: '#585858', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Approve</button>}
                    {post.status === 'approved' && <button onClick={() => publishPost(post)} disabled={publishing[post.id]} title="Publish through connected channel" style={{ padding: '8px 16px', borderRadius: 8, background: '#e7e7e7', border: '1px solid #d3d3d3', color: '#535353', cursor: publishing[post.id] ? 'wait' : 'pointer', fontSize: 13, fontWeight: 700, opacity:publishing[post.id] ? .7 : 1 }}>{publishing[post.id] ? 'Sending…' : 'Publish to channel'}</button>}
                    <button onClick={() => deletePost(post.id)} title="Delete" style={{ padding: '8px 12px', borderRadius: 8, background: '#f5f5f5', border: '1px solid #d5d5d5', color: '#4d4d4d', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Delete</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Edit modal */}
      {selectedPost && (
        <div onClick={() => setSelectedPost(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(23,23,23,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(6px)' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#ffffff', border: '1px solid #e7e7e7', borderRadius: 20, padding: 32, maxWidth: 560, width: '90%', animation: 'fadeIn 0.2s ease', boxShadow: '0 20px 50px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ padding: '4px 12px', borderRadius: 20, background: `${PLATFORM_COLORS[selectedPost.platform] || '#535353'}15`, color: PLATFORM_COLORS[selectedPost.platform] || '#535353', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>{selectedPost.platform}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#171717' }}>Edit Post Content</span>
              </div>
              <button onClick={() => setSelectedPost(null)} style={{ background: 'none', border: 'none', color: '#727272', cursor: 'pointer', fontSize: 22 }}>×</button>
            </div>
            <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={6} style={{ width: '100%', background: '#fafafa', border: '1px solid #d4d4d4', borderRadius: 12, padding: '14px 16px', color: '#171717', fontSize: 14, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: 1.7 }} />
            <div style={{ marginTop:14, borderTop:'1px solid #e7e7e7', paddingTop:14 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}><div><div style={{ fontSize:11, fontWeight:800, color:'#535353', letterSpacing:'.06em' }}>CAMPAIGN MEDIA</div><div style={{ fontSize:12, color:'#727272', marginTop:3 }}>Attach an image or video from your durable Creative Lab library.</div></div><button onClick={() => setShowAssetPicker(value => !value)} style={{ padding:'8px 11px', border:'1px solid #d3d3d3', background:'#f2f2f2', color:'#535353', borderRadius:8, fontSize:12, fontWeight:800 }}>{showAssetPicker ? 'Close media' : 'Add from Creative Lab'}</button></div>
              {attachedAssets(selectedPost.id).length > 0 && <div style={{ display:'flex', gap:8, marginTop:10, overflowX:'auto' }}>{attachedAssets(selectedPost.id).map(asset => <div key={asset.id} style={{ position:'relative', width:74, height:74, flexShrink:0, borderRadius:9, overflow:'hidden', background:'#f4f4f4' }}>{asset.kind === 'video' ? <video src={asset.asset_url} muted playsInline preload="metadata" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <img src={asset.asset_url} alt="Attached creative" style={{ width:'100%', height:'100%', objectFit:'cover' }} />}<button onClick={() => detachAsset(asset)} style={{ position:'absolute', top:4, right:4, border:'none', borderRadius:6, background:'rgba(23,23,23,.76)', color:'#ffffff', fontSize:10, padding:'3px 5px' }}>Remove</button></div>)}</div>}
              {showAssetPicker && <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginTop:12 }}>{availableAssets.length ? availableAssets.map(asset => <button key={asset.id} onClick={() => attachAsset(asset)} style={{ padding:0, height:88, overflow:'hidden', border:'1px solid #d4d4d4', borderRadius:9, background:'#fafafa', cursor:'pointer' }}>{asset.kind === 'video' ? <video src={asset.asset_url} muted playsInline preload="metadata" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <img src={asset.asset_url} alt="Available campaign creative" style={{ width:'100%', height:'100%', objectFit:'cover' }} />}</button>) : <div style={{ gridColumn:'1 / -1', color:'#727272', fontSize:12, padding:'10px 0' }}>No unattached media yet. Generate or upload it in Creative Lab first.</div>}</div>}
            </div>
            {aiSuggestion && (
              <div style={{ marginTop: 14, padding: '14px 16px', background: '#e7e7e7', border: '1px solid #d3d3d3', borderRadius: 12 }}>
                <div style={{ fontSize: 11.5, color: '#b2b2b2', fontWeight: 800, marginBottom: 6, textTransform: 'uppercase' }}>AI Rewritten Suggestion</div>
                <div style={{ fontSize: 13.5, color: '#353535', lineHeight: 1.6, marginBottom: 10, whiteSpace: 'pre-wrap' }}>{aiSuggestion}</div>
                <button onClick={() => { setEditContent(aiSuggestion); setAiSuggestion('') }} style={{ padding: '6px 14px', background: '#535353', border: 'none', borderRadius: 8, color: '#ffffff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Apply Suggestion</button>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 24 }}>
              <button onClick={aiRewrite} disabled={aiRewriting} style={{ padding: '10px 18px', background: '#f5f5f5', border: '1px solid rgba(83,83,83,0.3)', borderRadius: 10, color: '#535353', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}>
                {aiRewriting ? <span style={{ width: 14, height: 14, border: '2px solid rgba(83,83,83,0.2)', borderTopColor: '#535353', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} /> : 'AI Rewrite'}
              </button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setSelectedPost(null)} style={{ padding: '10px 18px', background: '#f4f4f4', border: 'none', borderRadius: 10, color: '#727272', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                <button onClick={saveEdit} style={{ padding: '10px 22px', background: 'linear-gradient(135deg,#535353,#555555,#535353)', border: 'none', borderRadius: 10, color: '#ffffff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 15px rgba(83,83,83,0.3)' }}>Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
