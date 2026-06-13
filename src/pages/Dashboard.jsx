import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { supabase } from '../supabase'

const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4a3B2bm9raHFicGJxZWZlZ3hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMDI1NDgsImV4cCI6MjA5MTc3ODU0OH0.OVdLzh2Bvuf4l6F6ITSpj4pWqoc3EoTxs6OCvrMf4JU'

const PLATFORM_COLORS = { instagram:'#e1306c', twitter:'#1da1f2', linkedin:'#0077b5', facebook:'#1877f2', tiktok:'#ff0050' }
const PLATFORM_ICONS = {
  instagram: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>,
  twitter: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg>,
  linkedin: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>,
  facebook: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>,
  tiktok: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.27 8.27 0 004.84 1.55V6.79a4.85 4.85 0 01-1.07-.1z"/></svg>,
}

function AIInsightCard({ insight, loading }) {
  if (loading) return (
    <div style={{ padding:'16px 20px', background:'linear-gradient(135deg,rgba(99,102,241,0.06),rgba(139,92,246,0.04))', border:'1px solid rgba(99,102,241,0.15)', borderRadius:12, display:'flex', alignItems:'center', gap:12 }}>
      <div style={{ width:36, height:36, borderRadius:'50%', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
      </div>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:11, color:'#6366f1', fontWeight:600, marginBottom:4 }}>FLO AI · ANALYZING</div>
        <div style={{ display:'flex', gap:5, alignItems:'center' }}>
          {[0,1,2].map(i => <span key={i} style={{ width:7, height:7, borderRadius:'50%', background:'#6366f1', display:'inline-block', animation:`pulse 1.2s ease ${i*0.2}s infinite` }}/>)}
        </div>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  )
  return (
    <div style={{ padding:'16px 20px', background:'linear-gradient(135deg,rgba(99,102,241,0.06),rgba(139,92,246,0.04))', border:'1px solid rgba(99,102,241,0.15)', borderRadius:12, display:'flex', alignItems:'flex-start', gap:12 }}>
      <div style={{ width:36, height:36, borderRadius:'50%', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:2 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
      </div>
      <div>
        <div style={{ fontSize:11, color:'#a5b4fc', fontWeight:600, marginBottom:6, letterSpacing:'0.05em' }}>✦ FLO AI INSIGHT</div>
        <div style={{ fontSize:13.5, color:'#e2e8f0', lineHeight:1.65 }}>{insight}</div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [aiInsight, setAiInsight] = useState('')
  const [insightLoading, setInsightLoading] = useState(true)

  useEffect(() => {
    loadPosts()
    loadAiInsight()
  }, [])

  const loadPosts = async () => {
    setLoading(true)
    const { data } = await supabase.from('posts').select('*').order('created_at', { ascending: false }).limit(20)
    setPosts(data || [])
    setLoading(false)
  }

  const loadAiInsight = async () => {
    setInsightLoading(true)
    try {
      const { data: posts } = await supabase.from('posts').select('platform, status, created_at').limit(50)
      const summary = posts?.length ? `User has ${posts.length} posts. Platforms: ${[...new Set(posts.map(p=>p.platform))].join(', ')}. Statuses: ${[...new Set(posts.map(p=>p.status))].join(', ')}.` : 'New user with no posts yet.'
      const res = await fetch('https://xxkpvnokhqbpbqefegxa.supabase.co/functions/v1/ai-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}`, apikey: ANON },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: 'You are Flo, an AI social media strategist. Give one short, specific, actionable insight or tip in 1-2 sentences. Be direct and helpful. No fluff.' },
            { role: 'user', content: `Give me a social media insight based on this: ${summary}` }
          ],
          max_tokens: 120,
        }),
      })
      const d = await res.json()
      setAiInsight(d?.content || d?.choices?.[0]?.message?.content || 'Post consistently at peak times to maximize engagement. Try posting between 9-11am and 6-8pm for best results.')
    } catch {
      setAiInsight('Post consistently at peak times to maximize engagement. Try posting between 9-11am and 6-8pm for best results.')
    }
    setInsightLoading(false)
  }

  const stats = {
    total: posts.length,
    published: posts.filter(p => p.status === 'published').length,
    scheduled: posts.filter(p => p.status === 'scheduled').length,
    pending: posts.filter(p => p.status === 'pending').length,
  }

  const platformCounts = posts.reduce((acc, p) => { acc[p.platform] = (acc[p.platform] || 0) + 1; return acc }, {})

  const recentPosts = posts.slice(0, 5)

  const STAT_CARDS = [
    { label: 'Total Posts', value: stats.total, icon: '📝', color: '#6366f1', change: '+12%' },
    { label: 'Published', value: stats.published, icon: '✅', color: '#10b981', change: '+8%' },
    { label: 'Scheduled', value: stats.scheduled, icon: '🕐', color: '#f59e0b', change: '+3' },
    { label: 'Pending Review', value: stats.pending, icon: '⏳', color: '#ec4899', change: stats.pending > 0 ? 'Needs attention' : 'All clear' },
  ]

  return (
    <Layout title="Dashboard">
      <div style={{ display:'flex', flexDirection:'column', gap:24, animation:'fadeIn 0.3s ease' }}>
        <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

        {/* Welcome + AI Insight */}
        <div>
          <h2 style={{ fontSize:22, fontWeight:800, color:'#f1f5f9', marginBottom:4 }}>Good morning ✦</h2>
          <p style={{ fontSize:14, color:'#64748b', marginBottom:16 }}>Here's what's happening with your social media today.</p>
          <AIInsightCard insight={aiInsight} loading={insightLoading} />
        </div>

        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 }}>
          {STAT_CARDS.map((s, i) => (
            <div key={i} style={{ background:'var(--card)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:14, padding:'18px 20px', transition:'all 0.2s', cursor:'default' }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(255,255,255,0.12)';e.currentTarget.style.transform='translateY(-2px)'}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(255,255,255,0.06)';e.currentTarget.style.transform='translateY(0)'}}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                <span style={{ fontSize:20 }}>{s.icon}</span>
                <span style={{ fontSize:11, fontWeight:600, color:s.color, background:`${s.color}18`, padding:'2px 8px', borderRadius:20 }}>{s.change}</span>
              </div>
              <div style={{ fontSize:30, fontWeight:800, color:'#f1f5f9', lineHeight:1, marginBottom:4 }}>{s.value}</div>
              <div style={{ fontSize:12, color:'#64748b', fontWeight:500 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Main grid */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap:20 }}>
          {/* Recent posts */}
          <div style={{ background:'var(--card)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:14, overflow:'hidden' }}>
            <div style={{ padding:'18px 20px', borderBottom:'1px solid rgba(255,255,255,0.05)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontWeight:700, fontSize:15, color:'#f1f5f9' }}>Recent Posts</div>
              <button onClick={()=>navigate('/approve')} style={{ fontSize:12, color:'#6366f1', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>View all →</button>
            </div>
            {loading ? (
              <div style={{ padding:40, textAlign:'center', color:'#475569' }}>Loading...</div>
            ) : recentPosts.length === 0 ? (
              <div style={{ padding:40, textAlign:'center' }}>
                <div style={{ fontSize:32, marginBottom:12 }}>✦</div>
                <div style={{ fontSize:14, color:'#64748b', marginBottom:16 }}>No posts yet. Let Flo help you get started.</div>
                <button onClick={()=>navigate('/compose')} style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff', border:'none', borderRadius:9, padding:'9px 20px', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>Create First Post</button>
              </div>
            ) : (
              <div>
                {recentPosts.map((post, i) => (
                  <div key={post.id} onClick={()=>navigate('/approve')} style={{ padding:'14px 20px', borderBottom:i<recentPosts.length-1?'1px solid rgba(255,255,255,0.04)':'none', display:'flex', alignItems:'flex-start', gap:12, cursor:'pointer', transition:'background 0.15s' }}
                    onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.02)'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <div style={{ width:34, height:34, borderRadius:9, background:`${PLATFORM_COLORS[post.platform]||'#6366f1'}22`, display:'flex', alignItems:'center', justifyContent:'center', color:PLATFORM_COLORS[post.platform]||'#6366f1', flexShrink:0 }}>
                      {PLATFORM_ICONS[post.platform] || <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13.5, color:'#e2e8f0', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:4 }}>{post.content || 'No content'}</div>
                      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                        <span style={{ fontSize:11, color:'#475569', textTransform:'capitalize' }}>{post.platform}</span>
                        <span style={{ fontSize:11, color:'#334155' }}>·</span>
                        <span style={{ fontSize:11, color:'#475569' }}>{new Date(post.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <span style={{ fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:20, flexShrink:0,
                      background: post.status==='published'?'rgba(16,185,129,0.12)':post.status==='scheduled'?'rgba(99,102,241,0.12)':post.status==='pending'?'rgba(245,158,11,0.12)':'rgba(71,85,105,0.12)',
                      color: post.status==='published'?'#34d399':post.status==='scheduled'?'#a5b4fc':post.status==='pending'?'#fbbf24':'#64748b',
                    }}>{post.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right column */}
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {/* Platform breakdown */}
            <div style={{ background:'var(--card)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:14, padding:'18px 20px' }}>
              <div style={{ fontWeight:700, fontSize:14, color:'#f1f5f9', marginBottom:14 }}>Platform Breakdown</div>
              {Object.keys(platformCounts).length === 0 ? (
                <div style={{ fontSize:13, color:'#475569', textAlign:'center', padding:'12px 0' }}>No data yet</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {Object.entries(platformCounts).sort((a,b)=>b[1]-a[1]).map(([platform, count]) => {
                    const pct = Math.round((count / stats.total) * 100)
                    return (
                      <div key={platform}>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:7, fontSize:12.5, color:'#94a3b8', fontWeight:500, textTransform:'capitalize' }}>
                            <span style={{ color:PLATFORM_COLORS[platform]||'#6366f1' }}>{PLATFORM_ICONS[platform]}</span>
                            {platform}
                          </div>
                          <span style={{ fontSize:12, color:'#64748b' }}>{count} · {pct}%</span>
                        </div>
                        <div style={{ height:4, background:'rgba(255,255,255,0.06)', borderRadius:2, overflow:'hidden' }}>
                          <div style={{ height:'100%', width:`${pct}%`, background:`linear-gradient(90deg,${PLATFORM_COLORS[platform]||'#6366f1'},${PLATFORM_COLORS[platform]||'#6366f1'}88)`, borderRadius:2, transition:'width 0.8s ease' }}/>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Quick actions */}
            <div style={{ background:'var(--card)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:14, padding:'18px 20px' }}>
              <div style={{ fontWeight:700, fontSize:14, color:'#f1f5f9', marginBottom:14 }}>Quick Actions</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {[
                  { label:'✦ AI Generate Post', action:()=>navigate('/compose'), primary:true },
                  { label:'📅 View Calendar', action:()=>navigate('/calendar') },
                  { label:'🖼 Image Studio', action:()=>navigate('/images') },
                  { label:'✅ Review Pending', action:()=>navigate('/approve') },
                ].map((item, i) => (
                  <button key={i} onClick={item.action} style={{ padding:'10px 14px', borderRadius:9, border:item.primary?'1px solid rgba(99,102,241,0.3)':'1px solid rgba(255,255,255,0.06)', background:item.primary?'linear-gradient(135deg,rgba(99,102,241,0.12),rgba(139,92,246,0.08))':'rgba(255,255,255,0.02)', color:item.primary?'#a5b4fc':'#94a3b8', fontSize:13, fontWeight:item.primary?600:500, cursor:'pointer', textAlign:'left', fontFamily:'inherit', transition:'all 0.15s' }}
                    onMouseEnter={e=>{e.currentTarget.style.background=item.primary?'rgba(99,102,241,0.2)':'rgba(255,255,255,0.05)';e.currentTarget.style.color='#f1f5f9'}}
                    onMouseLeave={e=>{e.currentTarget.style.background=item.primary?'linear-gradient(135deg,rgba(99,102,241,0.12),rgba(139,92,246,0.08))':'rgba(255,255,255,0.02)';e.currentTarget.style.color=item.primary?'#a5b4fc':'#94a3b8'}}>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
