import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { supabase } from '../supabase'

const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4a3B2bm9raHFicGJxZWZlZ3hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMDI1NDgsImV4cCI6MjA5MTc3ODU0OH0.OVdLzh2Bvuf4l6F6ITSpj4pWqoc3EoTxs6OCvrMf4JU'

async function callAI(messages, maxTokens = 1500) {
  const res = await fetch('https://xxkpvnokhqbpbqefegxa.supabase.co/functions/v1/ai-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}`, apikey: ANON },
    body: JSON.stringify({ model: 'gpt-4o', messages, max_tokens: maxTokens }),
  })
  const d = await res.json()
  return d?.content || d?.choices?.[0]?.message?.content || ''
}

const PLATFORM_COLORS = { instagram: '#e1306c', twitter: '#1da1f2', linkedin: '#0077b5', facebook: '#1877f2', tiktok: '#69c9d0' }
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

export default function AICalendar() {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedPost, setSelectedPost] = useState(null)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [fillPrompt, setFillPrompt] = useState('')
  const [showFillModal, setShowFillModal] = useState(false)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  useEffect(() => { loadPosts() }, [month, year])

  const loadPosts = async () => {
    setLoading(true)
    const start = new Date(year, month, 1).toISOString()
    const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString()
    const { data } = await supabase.from('posts').select('*').gte('scheduled_at', start).lte('scheduled_at', end).order('scheduled_at')
    setPosts(data || [])
    setLoading(false)
  }

  const getPostsForDay = (day) => {
    const d = new Date(year, month, day)
    return posts.filter(p => {
      if (!p.scheduled_at) return false
      const pd = new Date(p.scheduled_at)
      return pd.getDate() === day && pd.getMonth() === month && pd.getFullYear() === year
    })
  }

  const fillMonth = async () => {
    if (!fillPrompt.trim()) return
    setGenerating(true)
    setShowFillModal(false)
    try {
      const text = await callAI([
        { role: 'system', content: 'You are a social media strategist. Generate a month of posts. Return JSON array: [{"day":1,"platform":"instagram","content":"...","hashtags":"...","post_type":"educational"},...]' },
        { role: 'user', content: `Brand/context: ${fillPrompt}\nMonth: ${MONTHS[month]} ${year}\nGenerate 12-16 posts spread across the month. Use varied platforms (instagram, linkedin, twitter, facebook). Vary post types: educational, inspirational, promotional, behind-the-scenes, engagement.` }
      ], 3000)
      let generated = []
      try { const m = text.match(/\[[\s\S]*\]/); generated = m ? JSON.parse(m[0]) : [] } catch {}
      const { data: { user } } = await supabase.auth.getUser()
      for (const post of generated) {
        const d = new Date(year, month, Math.min(post.day, daysInMonth))
        const hour = post.platform === 'linkedin' ? 8 : post.platform === 'instagram' ? 9 : post.platform === 'twitter' ? 12 : 10
        d.setHours(hour, 0, 0, 0)
        await supabase.from('posts').insert([{ user_id: user?.id, platform: post.platform, content: `${post.content}${post.hashtags ? '\n\n' + post.hashtags : ''}`, status: 'pending', scheduled_at: d.toISOString(), created_at: new Date().toISOString() }])
      }
      await loadPosts()
    } catch (e) { console.error(e) }
    setGenerating(false)
  }

  const deletePost = async (id) => {
    await supabase.from('posts').delete().eq('id', id)
    setSelectedPost(null)
    await loadPosts()
  }

  const approvePost = async (id) => {
    await supabase.from('posts').update({ status: 'approved' }).eq('id', id)
    setSelectedPost(null)
    await loadPosts()
  }

  return (
    <Layout title="AI Calendar">
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div style={{ maxWidth: 1100, margin: '0 auto', animation: 'fadeIn 0.3s ease' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--card)', border: '1px solid rgba(255,255,255,0.06)', color: '#94a3b8', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9', minWidth: 180, textAlign: 'center' }}>{MONTHS[month]} {year}</h2>
            <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--card)', border: '1px solid rgba(255,255,255,0.06)', color: '#94a3b8', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ fontSize: 13, color: '#64748b' }}>{posts.length} posts this month</div>
            <button onClick={() => setShowFillModal(true)} disabled={generating} style={{ padding: '9px 18px', background: generating ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', borderRadius: 9, color: '#fff', fontSize: 13, fontWeight: 700, cursor: generating ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 7 }}>
              {generating ? <><span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }}/> Filling...</> : '✦ AI Fill Month'}
            </button>
          </div>
        </div>

        {/* Calendar grid */}
        <div style={{ background: 'var(--card)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden' }}>
          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {DAYS.map(d => <div key={d} style={{ padding: '12px 0', textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: '#475569', letterSpacing: '0.05em' }}>{d}</div>)}
          </div>
          {/* Cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
            {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} style={{ minHeight: 110, borderRight: '1px solid rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(0,0,0,0.1)' }} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const dayPosts = getPostsForDay(day)
              const isToday = new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year
              const isSelected = selectedDate === day
              return (
                <div key={day} onClick={() => setSelectedDate(isSelected ? null : day)} style={{ minHeight: 110, borderRight: '1px solid rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)', padding: '8px', cursor: 'pointer', background: isSelected ? 'rgba(99,102,241,0.06)' : 'transparent', transition: 'background 0.15s' }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: isToday ? 800 : 500, color: isToday ? '#a5b4fc' : '#94a3b8', width: 24, height: 24, borderRadius: '50%', background: isToday ? 'rgba(99,102,241,0.2)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{day}</span>
                    {dayPosts.length > 0 && <span style={{ fontSize: 10, color: '#64748b' }}>{dayPosts.length}</span>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {dayPosts.slice(0, 3).map(post => (
                      <div key={post.id} onClick={e => { e.stopPropagation(); setSelectedPost(post) }} style={{ padding: '3px 7px', borderRadius: 5, background: `${PLATFORM_COLORS[post.platform] || '#6366f1'}18`, borderLeft: `2px solid ${PLATFORM_COLORS[post.platform] || '#6366f1'}`, fontSize: 11, color: '#94a3b8', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: post.status === 'approved' ? '#10b981' : post.status === 'published' ? '#6366f1' : '#f59e0b', flexShrink: 0 }} />
                        {post.content.substring(0, 28)}...
                      </div>
                    ))}
                    {dayPosts.length > 3 && <div style={{ fontSize: 10, color: '#475569', paddingLeft: 7 }}>+{dayPosts.length - 3} more</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, marginTop: 14, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#475569' }}>STATUS:</span>
          {[['#f59e0b','Pending'],['#10b981','Approved'],['#6366f1','Published']].map(([c,l]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />
              <span style={{ fontSize: 11, color: '#64748b' }}>{l}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Post detail modal */}
      {selectedPost && (
        <div onClick={() => setSelectedPost(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#111c2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 28, maxWidth: 480, width: '90%', animation: 'fadeIn 0.2s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ padding: '4px 12px', borderRadius: 20, background: `${PLATFORM_COLORS[selectedPost.platform] || '#6366f1'}20`, color: PLATFORM_COLORS[selectedPost.platform] || '#a5b4fc', fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>{selectedPost.platform}</span>
                <span style={{ padding: '4px 12px', borderRadius: 20, background: selectedPost.status === 'approved' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', color: selectedPost.status === 'approved' ? '#34d399' : '#fbbf24', fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>{selectedPost.status}</span>
              </div>
              <button onClick={() => setSelectedPost(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 20 }}>×</button>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '14px 16px', marginBottom: 16, fontSize: 13.5, color: '#e2e8f0', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{selectedPost.content}</div>
            {selectedPost.scheduled_at && <div style={{ fontSize: 12, color: '#64748b', marginBottom: 20 }}>📅 Scheduled: {new Date(selectedPost.scheduled_at).toLocaleString()}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              {selectedPost.status !== 'approved' && <button onClick={() => approvePost(selectedPost.id)} style={{ flex: 1, padding: '10px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 9, color: '#34d399', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>✓ Approve</button>}
              <button onClick={() => deletePost(selectedPost.id)} style={{ flex: 1, padding: '10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 9, color: '#f87171', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Fill month modal */}
      {showFillModal && (
        <div onClick={() => setShowFillModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#111c2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 28, maxWidth: 460, width: '90%', animation: 'fadeIn 0.2s ease' }}>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: '#f1f5f9', marginBottom: 8 }}>✦ AI Fill Month</h3>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 18, lineHeight: 1.6 }}>Tell the AI about your brand and it will fill {MONTHS[month]} with a full content calendar automatically.</p>
            <textarea value={fillPrompt} onChange={e => setFillPrompt(e.target.value)} placeholder="e.g. We're a local coffee shop in Denver. We want to promote our new seasonal menu, drive foot traffic, and build community. Tone: warm, friendly, local." rows={4} style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '12px 14px', color: '#f1f5f9', fontSize: 13.5, fontFamily: 'inherit', resize: 'none', outline: 'none', boxSizing: 'border-box', lineHeight: 1.6 }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => setShowFillModal(false)} style={{ flex: 1, padding: '11px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 9, color: '#94a3b8', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={fillMonth} disabled={!fillPrompt.trim()} style={{ flex: 2, padding: '11px', background: fillPrompt.trim() ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 9, color: '#fff', fontSize: 13, fontWeight: 700, cursor: fillPrompt.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>Generate {MONTHS[month]} →</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
