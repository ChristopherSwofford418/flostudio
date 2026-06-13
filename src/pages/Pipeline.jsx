import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { supabase } from '../supabase'

const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4a3B2bm9raHFicGJxZWZlZ3hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMDI1NDgsImV4cCI6MjA5MTc3ODU0OH0.OVdLzh2Bvuf4l6F6ITSpj4pWqoc3EoTxs6OCvrMf4JU'

async function callAI(messages, maxTokens = 800) {
  const res = await fetch('https://xxkpvnokhqbpbqefegxa.supabase.co/functions/v1/ai-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}`, apikey: ANON },
    body: JSON.stringify({ model: 'gpt-4o', messages, max_tokens: maxTokens }),
  })
  const d = await res.json()
  return d?.content || d?.choices?.[0]?.message?.content || ''
}

const PLATFORM_COLORS = { instagram: '#e1306c', twitter: '#1da1f2', linkedin: '#0077b5', facebook: '#1877f2', tiktok: '#69c9d0' }
const STATUS_TABS = ['pending', 'approved', 'published', 'all']

export default function Pipeline() {
  const [posts, setPosts] = useState([])
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
    let q = supabase.from('posts').select('*').order('scheduled_at', { ascending: true })
    if (activeTab !== 'all') q = q.eq('status', activeTab)
    const { data } = await q
    setPosts(data || [])
    setLoading(false)
  }

  const openPost = (post) => {
    setSelectedPost(post)
    setEditContent(post.content)
    setAiSuggestion('')
  }

  const saveEdit = async () => {
    await supabase.from('posts').update({ content: editContent }).eq('id', selectedPost.id)
    setSelectedPost(null)
    await loadPosts()
  }

  const updateStatus = async (id, status) => {
    await supabase.from('posts').update({ status }).eq('id', id)
    if (selectedPost?.id === id) setSelectedPost(null)
    await loadPosts()
  }

  const deletePost = async (id) => {
    await supabase.from('posts').delete().eq('id', id)
    if (selectedPost?.id === id) setSelectedPost(null)
    await loadPosts()
  }

  const bulkApproveAll = async () => {
    setBulkApproving(true)
    const pending = posts.filter(p => p.status === 'pending')
    for (const post of pending) {
      await supabase.from('posts').update({ status: 'approved' }).eq('id', post.id)
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

  const filteredPosts = posts

  const counts = { pending: posts.filter(p=>p.status==='pending').length, approved: posts.filter(p=>p.status==='approved').length, published: posts.filter(p=>p.status==='published').length }

  return (
    <Layout title="Content Pipeline">
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div style={{ maxWidth: 1100, margin: '0 auto', animation: 'fadeIn 0.3s ease' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9' }}>Content Pipeline</h1>
            <p style={{ fontSize: 13, color: '#64748b', marginTop: 3 }}>Review, edit, and approve AI-generated posts</p>
          </div>
          {activeTab === 'pending' && counts.pending > 0 && (
            <button onClick={bulkApproveAll} disabled={bulkApproving} style={{ padding: '9px 18px', background: bulkApproving ? 'rgba(255,255,255,0.06)' : 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 9, color: '#34d399', fontSize: 13, fontWeight: 700, cursor: bulkApproving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 7 }}>
              {bulkApproving ? <><span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#34d399', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }}/> Approving...</> : `✓ Approve All (${counts.pending})`}
            </button>
          )}
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
          {[['pending','⏳','#f59e0b'],['approved','✅','#10b981'],['published','🚀','#6366f1']].map(([s,icon,c]) => (
            <div key={s} onClick={() => setActiveTab(s)} style={{ background: activeTab === s ? `${c}12` : 'var(--card)', border: `1px solid ${activeTab === s ? `${c}30` : 'rgba(255,255,255,0.06)'}`, borderRadius: 12, padding: '16px 20px', cursor: 'pointer', transition: 'all 0.15s' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: activeTab === s ? c : '#f1f5f9' }}>{counts[s] || 0}</div>
              <div style={{ fontSize: 12, color: '#64748b', textTransform: 'capitalize', marginTop: 2 }}>{icon} {s}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--card)', borderRadius: 10, padding: 4, width: 'fit-content', border: '1px solid rgba(255,255,255,0.06)' }}>
          {STATUS_TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '7px 16px', borderRadius: 7, background: activeTab === tab ? 'rgba(99,102,241,0.15)' : 'transparent', border: `1px solid ${activeTab === tab ? 'rgba(99,102,241,0.3)' : 'transparent'}`, color: activeTab === tab ? '#a5b4fc' : '#64748b', fontSize: 12.5, fontWeight: activeTab === tab ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize', transition: 'all 0.15s' }}>{tab}</button>
          ))}
        </div>

        {/* Post list */}
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
            <span style={{ width: 28, height: 28, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#6366f1', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
          </div>
        ) : filteredPosts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#475569' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>No {activeTab} posts</div>
            <div style={{ fontSize: 13 }}>Run the AI Agent to generate content</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredPosts.map(post => {
              const score = aiScoring[post.id]
              return (
                <div key={post.id} style={{ background: 'var(--card)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '16px 20px', display: 'flex', gap: 16, alignItems: 'flex-start', transition: 'border 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}>
                  {/* Platform dot */}
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: `${PLATFORM_COLORS[post.platform] || '#6366f1'}18`, border: `1px solid ${PLATFORM_COLORS[post.platform] || '#6366f1'}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: PLATFORM_COLORS[post.platform] || '#a5b4fc', textTransform: 'capitalize' }}>{post.platform?.substring(0,2).toUpperCase()}</span>
                  </div>
                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, color: '#e2e8f0', lineHeight: 1.6, marginBottom: 8, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{post.content}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      {post.scheduled_at && <span style={{ fontSize: 11.5, color: '#475569' }}>📅 {new Date(post.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
                      <span style={{ fontSize: 11.5, padding: '2px 9px', borderRadius: 20, background: post.status === 'approved' ? 'rgba(16,185,129,0.1)' : post.status === 'published' ? 'rgba(99,102,241,0.1)' : 'rgba(245,158,11,0.1)', color: post.status === 'approved' ? '#34d399' : post.status === 'published' ? '#a5b4fc' : '#fbbf24', fontWeight: 600, textTransform: 'capitalize' }}>{post.status}</span>
                      {score && score !== 'loading' && <span style={{ fontSize: 11.5, color: score.score >= 8 ? '#34d399' : score.score >= 6 ? '#fbbf24' : '#f87171' }}>AI Score: {score.score}/10</span>}
                    </div>
                  </div>
                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => scorePost(post)} title="AI Score" style={{ width: 32, height: 32, borderRadius: 7, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: '#64748b', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {score === 'loading' ? <span style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#a5b4fc', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} /> : '✦'}
                    </button>
                    <button onClick={() => openPost(post)} title="Edit" style={{ width: 32, height: 32, borderRadius: 7, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: '#64748b', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✎</button>
                    {post.status === 'pending' && <button onClick={() => updateStatus(post.id, 'approved')} title="Approve" style={{ width: 32, height: 32, borderRadius: 7, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)', color: '#34d399', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</button>}
                    {post.status === 'approved' && <button onClick={() => updateStatus(post.id, 'published')} title="Mark Published" style={{ width: 32, height: 32, borderRadius: 7, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)', color: '#a5b4fc', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🚀</button>}
                    <button onClick={() => deletePost(post.id)} title="Delete" style={{ width: 32, height: 32, borderRadius: 7, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.1)', color: '#f87171', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Edit modal */}
      {selectedPost && (
        <div onClick={() => setSelectedPost(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#111c2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 28, maxWidth: 540, width: '90%', animation: 'fadeIn 0.2s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ padding: '4px 12px', borderRadius: 20, background: `${PLATFORM_COLORS[selectedPost.platform] || '#6366f1'}20`, color: PLATFORM_COLORS[selectedPost.platform] || '#a5b4fc', fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>{selectedPost.platform}</span>
                <span style={{ fontSize: 13, color: '#64748b' }}>Edit Post</span>
              </div>
              <button onClick={() => setSelectedPost(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 20 }}>×</button>
            </div>
            <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={6} style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '12px 14px', color: '#f1f5f9', fontSize: 13.5, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: 1.7 }} />
            {aiSuggestion && (
              <div style={{ marginTop: 12, padding: '12px 14px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 10 }}>
                <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 700, marginBottom: 8 }}>✦ AI SUGGESTION</div>
                <div style={{ fontSize: 13, color: '#c7d2fe', lineHeight: 1.7, marginBottom: 10, whiteSpace: 'pre-wrap' }}>{aiSuggestion}</div>
                <button onClick={() => { setEditContent(aiSuggestion); setAiSuggestion('') }} style={{ padding: '6px 14px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 7, color: '#a5b4fc', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Use This Version</button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={aiRewrite} disabled={aiRewriting} style={{ flex: 1, padding: '10px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 9, color: '#a5b4fc', fontSize: 13, fontWeight: 600, cursor: aiRewriting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {aiRewriting ? <><span style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#a5b4fc', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }}/> Rewriting...</> : '✦ AI Rewrite'}
              </button>
              <button onClick={saveEdit} style={{ flex: 1, padding: '10px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', borderRadius: 9, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
