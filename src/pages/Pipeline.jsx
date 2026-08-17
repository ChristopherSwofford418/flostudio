import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { supabase } from '../supabase'

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

const PLATFORM_COLORS = { instagram: '#db2777', twitter: '#0284c7', linkedin: '#0369a1', facebook: '#1d4ed8', tiktok: '#0d9488' }
const STATUS_TABS = ['pending', 'approved', 'published', 'all']

export default function Pipeline() {
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

  useEffect(() => { loadPosts() }, [activeTab])

  const loadPosts = async () => {
    setLoading(true)
    const { data: allData, error } = await supabase.from('campaign_posts').select('*').order('scheduled_at', { ascending: true })
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
  }

  const saveEdit = async () => {
    if (!selectedPost) return
    await supabase.from('campaign_posts').update({ content: editContent }).eq('id', selectedPost.id)
    setSelectedPost(null)
    await loadPosts()
  }

  const updateStatus = async (id, status) => {
    await supabase.from('campaign_posts').update({ status }).eq('id', id)
    if (selectedPost?.id === id) setSelectedPost(null)
    await loadPosts()
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

      <div style={{ maxWidth: 1100, margin: '0 auto', animation: 'fadeIn 0.25s ease' }}>

        {/* Decision desk */}
        <section style={{ position:'relative', overflow:'hidden', display:'grid', gridTemplateColumns:'1.18fr .82fr', minHeight:210, marginBottom:24, borderRadius:26, background:'#fffdf9', border:'1px solid #ded9d1' }}>
          <div style={{ padding:'27px 30px', position:'relative', zIndex:1, display:'flex', flexDirection:'column', justifyContent:'space-between' }}>
            <div><div className="studio-kicker">Review queue / Decision desk</div><h1 style={{ fontSize:34, lineHeight:1, letterSpacing:'-.065em', color:'#16131d', marginTop:8 }}>Strong ideas need a <span className="studio-serif">final call.</span></h1><p style={{ fontSize:12.5, color:'#5c5666', marginTop:12, maxWidth:490, lineHeight:1.6 }}>Score what is worth shipping, revise what needs a sharper edge, and keep your brand’s creative quality high.</p></div>
            {counts.pending > 0 && <button onClick={bulkApproveAll} disabled={bulkApproving} className="studio-button" style={{ alignSelf:'flex-start', background: bulkApproving ? '#ded9d1' : '#16131d' }}>{bulkApproving ? 'Approving drafts…' : `Approve all pending (${counts.pending}) →`}</button>}
          </div>
          <div style={{ position:'relative', minHeight:210, overflow:'hidden' }}><img src="/visuals/flo-preview-editorial.jpg" alt="Creative review moodboard" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }}/><div style={{ position:'absolute', inset:0, background:'linear-gradient(90deg,#fffdf9 0%,transparent 42%)' }} /><div style={{ position:'absolute', right:18, bottom:18, background:'rgba(22,19,29,.93)', color:'#fffaf4', padding:'10px 12px', borderRadius:12 }}><div style={{ fontFamily:'DM Mono,monospace', fontSize:9, letterSpacing:'.08em', color:'#d7f267' }}>IN REVIEW</div><b style={{ display:'block', marginTop:2, fontSize:12 }}>{counts.pending} decision{counts.pending === 1 ? '' : 's'} waiting</b></div></div>
        </section>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 22 }}>
          {[['pending','Pending Review','#f59e0b'],['approved','Approved','#059669'],['published','Published','#4f46e5']].map(([s,label,c]) => (
            <div key={s} onClick={() => setActiveTab(s)} style={{ background: '#ffffff', border: `1px solid ${activeTab === s ? c : '#e2e8f0'}`, borderRadius: 14, padding: '20px 24px', cursor: 'pointer', transition: 'all 0.15s ease', boxShadow: activeTab === s ? `0 4px 20px ${c}15` : '0 1px 3px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: activeTab === s ? c : '#0f172a', letterSpacing: '-0.5px' }}>{counts[s] || 0}</div>
              <div style={{ fontSize: 12.5, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, background: '#ffffff', borderRadius: 12, padding: 6, width: 'fit-content', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          {STATUS_TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '8px 18px', borderRadius: 8, background: activeTab === tab ? '#fdf2f8' : 'transparent', border: 'none', color: activeTab === tab ? '#db2777' : '#64748b', fontSize: 13, fontWeight: activeTab === tab ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize', transition: 'all 0.15s' }}>{tab}</button>
          ))}
        </div>

        {/* Post list */}
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 220, background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0' }}>
            <span style={{ width: 30, height: 30, border: '3px solid #e2e8f0', borderTopColor: '#db2777', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
          </div>
        ) : posts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>No {activeTab} posts found</div>
            <div style={{ fontSize: 13, color: '#64748b' }}>Use Ask Flo or Agent HQ to generate campaign content</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {posts.map(post => {
              const score = aiScoring[post.id]
              return (
                <div key={post.id} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '20px 24px', display: 'flex', gap: 20, alignItems: 'flex-start', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.05)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.02)' }}>
                  
                  {/* Platform badge */}
                  <div style={{ width: 42, height: 42, borderRadius: 10, background: `${PLATFORM_COLORS[post.platform] || '#4f46e5'}12`, border: `1px solid ${PLATFORM_COLORS[post.platform] || '#4f46e5'}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: PLATFORM_COLORS[post.platform] || '#4f46e5', textTransform: 'uppercase' }}>{post.platform?.substring(0,2)}</span>
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: '#0f172a', lineHeight: 1.6, marginBottom: 10, fontWeight: 500 }}>{post.content}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                      {post.scheduled_at && <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{new Date(post.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
                      <span style={{ fontSize: 11.5, padding: '3px 10px', borderRadius: 20, background: post.status === 'approved' ? '#ecfdf5' : post.status === 'published' ? '#e0e7ff' : '#fef3c7', color: post.status === 'approved' ? '#059669' : post.status === 'published' ? '#4f46e5' : '#d97706', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{post.status}</span>
                      {score && score !== 'loading' && <span style={{ fontSize: 12, fontWeight: 700, color: score.score >= 8 ? '#059669' : score.score >= 6 ? '#d97706' : '#dc2626' }}>AI Score: {score.score}/10</span>}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => scorePost(post)} title="AI Score" style={{ padding: '8px 12px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {score === 'loading' ? <span style={{ width: 12, height: 12, border: '2px solid #cbd5e1', borderTopColor: '#4f46e5', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} /> : '✦ Score'}
                    </button>
                    <button onClick={() => openPost(post)} title="Edit" style={{ padding: '8px 14px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Edit</button>
                    {post.status === 'pending' && <button onClick={() => updateStatus(post.id, 'approved')} title="Approve" style={{ padding: '8px 16px', borderRadius: 8, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#059669', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Approve</button>}
                    {post.status === 'approved' && <button onClick={() => updateStatus(post.id, 'published')} title="Publish" style={{ padding: '8px 16px', borderRadius: 8, background: '#e0e7ff', border: '1px solid #c7d2fe', color: '#4f46e5', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Publish</button>}
                    <button onClick={() => deletePost(post.id)} title="Delete" style={{ padding: '8px 12px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Delete</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Edit modal */}
      {selectedPost && (
        <div onClick={() => setSelectedPost(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(6px)' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 20, padding: 32, maxWidth: 560, width: '90%', animation: 'fadeIn 0.2s ease', boxShadow: '0 20px 50px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ padding: '4px 12px', borderRadius: 20, background: `${PLATFORM_COLORS[selectedPost.platform] || '#4f46e5'}15`, color: PLATFORM_COLORS[selectedPost.platform] || '#4f46e5', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>{selectedPost.platform}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Edit Post Content</span>
              </div>
              <button onClick={() => setSelectedPost(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 22 }}>×</button>
            </div>
            <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={6} style={{ width: '100%', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 12, padding: '14px 16px', color: '#0f172a', fontSize: 14, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: 1.7 }} />
            {aiSuggestion && (
              <div style={{ marginTop: 14, padding: '14px 16px', background: '#e0e7ff', border: '1px solid #c7d2fe', borderRadius: 12 }}>
                <div style={{ fontSize: 11.5, color: '#4f46e5', fontWeight: 800, marginBottom: 6, textTransform: 'uppercase' }}>✦ AI Rewritten Suggestion</div>
                <div style={{ fontSize: 13.5, color: '#312e81', lineHeight: 1.6, marginBottom: 10, whiteSpace: 'pre-wrap' }}>{aiSuggestion}</div>
                <button onClick={() => { setEditContent(aiSuggestion); setAiSuggestion('') }} style={{ padding: '6px 14px', background: '#4f46e5', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Apply Suggestion</button>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 24 }}>
              <button onClick={aiRewrite} disabled={aiRewriting} style={{ padding: '10px 18px', background: '#fdf2f8', border: '1px solid rgba(219,39,119,0.3)', borderRadius: 10, color: '#db2777', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}>
                {aiRewriting ? <span style={{ width: 14, height: 14, border: '2px solid rgba(219,39,119,0.2)', borderTopColor: '#db2777', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} /> : '✦ AI Rewrite'}
              </button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setSelectedPost(null)} style={{ padding: '10px 18px', background: '#f1f5f9', border: 'none', borderRadius: 10, color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                <button onClick={saveEdit} style={{ padding: '10px 22px', background: 'linear-gradient(135deg,#db2777,#7c3aed,#4f46e5)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 15px rgba(219,39,119,0.3)' }}>Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
