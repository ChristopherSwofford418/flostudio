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

const PLATFORM_COLORS = { instagram: '#db2777', twitter: '#0284c7', linkedin: '#0369a1', facebook: '#1d4ed8', tiktok: '#0d9488' }
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
    const { data } = await supabase.from('campaign_posts').select('*').gte('scheduled_at', start).lte('scheduled_at', end).order('scheduled_at')
    setPosts(data || [])
    setLoading(false)
  }

  const getPostsForDay = (day) => {
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
        { role: 'system', content: 'You are a social media strategist. Generate a month of posts. Return ONLY a valid JSON array: [{"day":1,"platform":"instagram","content":"...","hashtags":"..."}]' },
        { role: 'user', content: `Brand/context: ${fillPrompt}\nMonth: ${MONTHS[month]} ${year}\nGenerate 12 posts spread across the month. Platforms: instagram, linkedin, twitter, facebook.` }
      ], 2000)
      let generated = []
      try {
        const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim()
        const m = cleanJson.match(/\[[\s\S]*\]/)
        generated = m ? JSON.parse(m[0]) : JSON.parse(cleanJson)
      } catch {
        generated = [
          { day: 2, platform: 'instagram', content: `Excited for what's ahead with ${fillPrompt}! #Growth #FloStudio`, hashtags: '#Launch' },
          { day: 5, platform: 'linkedin', content: `Building scalable workflows for modern creators and teams. #Strategy`, hashtags: '#Business' },
          { day: 8, platform: 'twitter', content: `Big updates rolling out this week! Stay tuned. #Tech #AI`, hashtags: '' },
          { day: 12, platform: 'facebook', content: `How are you scaling your marketing this month? Share below!`, hashtags: '#Community' },
          { day: 15, platform: 'instagram', content: `Behind the scenes of our latest feature release.`, hashtags: '#BehindTheScenes' },
          { day: 18, platform: 'linkedin', content: `Three ways to automate your social presence with AI.`, hashtags: '#Automation' },
        ]
      }
      
      const { data: { user } } = await supabase.auth.getUser()
      for (const post of generated) {
        const dayNum = Math.min(Math.max(1, post.day || 1), daysInMonth)
        const d = new Date(year, month, dayNum)
        d.setHours(9, 0, 0, 0)
        await supabase.from('campaign_posts').insert([{
          user_id: user?.id || null,
          platform: post.platform || 'instagram',
          content: `${post.content || ''}${post.hashtags ? '\n\n' + post.hashtags : ''}`,
          status: 'pending',
          scheduled_at: d.toISOString(),
          created_at: new Date().toISOString()
        }])
      }
      await loadPosts()
    } catch (e) {
      alert(`Error filling calendar: ${e.message}`)
    }
    setGenerating(false)
  }

  const deletePost = async (id) => {
    await supabase.from('campaign_posts').delete().eq('id', id)
    setSelectedPost(null)
    await loadPosts()
  }

  const approvePost = async (id) => {
    await supabase.from('campaign_posts').update({ status: 'approved' }).eq('id', id)
    setSelectedPost(null)
    await loadPosts()
  }

  return (
    <Layout title="AI Calendar">
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div style={{ maxWidth: 1150, margin: '0 auto', animation: 'fadeIn 0.25s ease' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} style={{ width: 36, height: 36, borderRadius: 10, background: '#ffffff', border: '1px solid #e2e8f0', color: '#0f172a', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>‹</button>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', minWidth: 200, textAlign: 'center', letterSpacing: '-0.5px' }}>{MONTHS[month]} {year}</h2>
            <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} style={{ width: 36, height: 36, borderRadius: 10, background: '#ffffff', border: '1px solid #e2e8f0', color: '#0f172a', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>›</button>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>{posts.length} scheduled posts</div>
            <button onClick={() => setShowFillModal(true)} disabled={generating} style={{ padding: '10px 20px', background: generating ? '#f1f5f9' : 'linear-gradient(135deg,#db2777,#7c3aed,#4f46e5)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, cursor: generating ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 15px rgba(219,39,119,0.3)' }}>
              {generating ? <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }}/> : null}
              ✦ AI Fill Month
            </button>
          </div>
        </div>

        {/* Calendar grid */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
            {DAYS.map(d => <div key={d} style={{ padding: '14px 0', textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#64748b', letterSpacing: '0.05em' }}>{d}</div>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
            {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} style={{ minHeight: 120, borderRight: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const dayPosts = getPostsForDay(day)
              const isToday = new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year
              const isSelected = selectedDate === day
              return (
                <div key={day} onClick={() => setSelectedDate(isSelected ? null : day)} style={{ minHeight: 120, borderRight: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', padding: 10, cursor: 'pointer', background: isSelected ? '#fdf2f8' : 'transparent', transition: 'background 0.15s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: isToday ? 800 : 600, color: isToday ? '#db2777' : '#0f172a', width: 26, height: 26, borderRadius: '50%', background: isToday ? '#fdf2f8' : 'transparent', border: isToday ? '1px solid #db2777' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{day}</span>
                    {dayPosts.length > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, color: '#db2777', background: '#fdf2f8', padding: '1px 6px', borderRadius: 10 }}>{dayPosts.length}</span>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {dayPosts.slice(0, 3).map(post => (
                      <div key={post.id} onClick={e => { e.stopPropagation(); setSelectedPost(post) }} style={{ padding: '5px 8px', borderRadius: 6, background: `${PLATFORM_COLORS[post.platform] || '#4f46e5'}10`, borderLeft: `3px solid ${PLATFORM_COLORS[post.platform] || '#4f46e5'}`, fontSize: 11.5, color: '#0f172a', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 800, color: PLATFORM_COLORS[post.platform] || '#4f46e5', marginRight: 4, textTransform: 'uppercase' }}>{post.platform?.substring(0,2)}</span>
                        {post.content.substring(0, 24)}...
                      </div>
                    ))}
                    {dayPosts.length > 3 && <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, paddingLeft: 4 }}>+{dayPosts.length - 3} more</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Post detail modal */}
      {selectedPost && (
        <div onClick={() => setSelectedPost(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(6px)' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 20, padding: 32, maxWidth: 500, width: '90%', animation: 'fadeIn 0.2s ease', boxShadow: '0 20px 50px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ padding: '4px 12px', borderRadius: 20, background: `${PLATFORM_COLORS[selectedPost.platform] || '#4f46e5'}15`, color: PLATFORM_COLORS[selectedPost.platform] || '#4f46e5', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>{selectedPost.platform}</span>
                <span style={{ padding: '4px 12px', borderRadius: 20, background: selectedPost.status === 'approved' ? '#ecfdf5' : '#fef3c7', color: selectedPost.status === 'approved' ? '#059669' : '#d97706', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>{selectedPost.status}</span>
              </div>
              <button onClick={() => setSelectedPost(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 22 }}>×</button>
            </div>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 18px', marginBottom: 18, fontSize: 14, color: '#0f172a', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{selectedPost.content}</div>
            {selectedPost.scheduled_at && <div style={{ fontSize: 12, color: '#64748b', marginBottom: 20, fontWeight: 500 }}>Scheduled: {new Date(selectedPost.scheduled_at).toLocaleString()}</div>}
            <div style={{ display: 'flex', gap: 12 }}>
              {selectedPost.status !== 'approved' && <button onClick={() => approvePost(selectedPost.id)} style={{ flex: 1, padding: '10px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, color: '#059669', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Approve Post</button>}
              <button onClick={() => deletePost(selectedPost.id)} style={{ flex: 1, padding: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#dc2626', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Delete Post</button>
            </div>
          </div>
        </div>
      )}

      {/* Fill month modal */}
      {showFillModal && (
        <div onClick={() => setShowFillModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(6px)' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 20, padding: 32, maxWidth: 500, width: '90%', animation: 'fadeIn 0.2s ease', boxShadow: '0 20px 50px rgba(0,0,0,0.15)' }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>✦ AI Fill Month Calendar</h3>
            <p style={{ fontSize: 13.5, color: '#64748b', marginBottom: 20, lineHeight: 1.6 }}>Describe your brand or campaign. The AI strategist will populate {MONTHS[month]} with tailored posts across multiple platforms.</p>
            <textarea value={fillPrompt} onChange={e => setFillPrompt(e.target.value)} placeholder="e.g. We are a boutique fitness studio in Austin. We want to drive membership signups and promote morning classes." rows={4} style={{ width: '100%', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 12, padding: '14px 16px', color: '#0f172a', fontSize: 14, fontFamily: 'inherit', resize: 'vertical', outline: 'none', marginBottom: 20, boxSizing: 'border-box', lineHeight: 1.6 }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button onClick={() => setShowFillModal(false)} style={{ padding: '10px 18px', background: '#f1f5f9', border: 'none', borderRadius: 10, color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={fillMonth} style={{ padding: '10px 24px', background: 'linear-gradient(135deg,#db2777,#7c3aed,#4f46e5)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 15px rgba(219,39,119,0.3)' }}>Generate Calendar</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
