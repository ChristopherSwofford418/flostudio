import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { supabase } from '../supabase'

const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4a3B2bm9raHFicGJxZWZlZ3hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMDI1NDgsImV4cCI6MjA5MTc3ODU0OH0.OVdLzh2Bvuf4l6F6ITSpj4pWqoc3EoTxs6OCvrMf4JU'

const PLATFORM_COLORS = { instagram:'#db2777', twitter:'#0284c7', linkedin:'#0369a1', facebook:'#1d4ed8', tiktok:'#0d9488' }

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
    const { data } = await supabase.from('campaign_posts').select('*').order('created_at', { ascending: false }).limit(20)
    setPosts(data || [])
    setLoading(false)
  }

  const loadAiInsight = async () => {
    setInsightLoading(true)
    try {
      const { data: posts } = await supabase.from('campaign_posts').select('platform, status, created_at').limit(50)
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
    approved: posts.filter(p => p.status === 'approved').length,
    pending: posts.filter(p => p.status === 'pending').length,
  }

  const recentPosts = posts.slice(0, 5)

  const STAT_CARDS = [
    { label: 'Total Posts', value: stats.total, color: '#4f46e5', badge: 'All Active' },
    { label: 'Approved', value: stats.approved, color: '#059669', badge: 'Ready to Publish' },
    { label: 'Published', value: stats.published, color: '#7c3aed', badge: 'Live in Feed' },
    { label: 'Pending Review', value: stats.pending, color: '#db2777', badge: stats.pending > 0 ? 'Requires Action' : 'All Clear' },
  ]

  return (
    <Layout title="Dashboard">
      <div style={{ display:'flex', flexDirection:'column', gap:28, animation:'fadeIn 0.3s ease', maxWidth:1200, margin:'0 auto' }}>
        <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

        {/* Welcome & AI Insight */}
        <div>
          <h2 style={{ fontSize:24, fontWeight:800, color:'#0f172a', marginBottom:4, letterSpacing:'-0.5px' }}>Workspace Command Center</h2>
          <p style={{ fontSize:13.5, color:'#64748b', marginBottom:18 }}>Real-time overview of your multi-channel AI marketing pipeline.</p>
          
          <div style={{ padding:'18px 22px', background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:16, display:'flex', alignItems:'flex-start', gap:14, boxShadow:'0 1px 3px rgba(0,0,0,0.02)' }}>
            <div style={{ width:38, height:38, borderRadius:'50%', background:'linear-gradient(135deg,#db2777,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
            </div>
            <div>
              <div style={{ fontSize:11, color:'#db2777', fontWeight:800, marginBottom:4, letterSpacing:'0.05em' }}>✦ FLO AI STRATEGIST INSIGHT</div>
              <div style={{ fontSize:13.5, color:'#0f172a', lineHeight:1.6, fontWeight:500 }}>{insightLoading ? 'Analyzing your workspace performance...' : aiInsight}</div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
          {STAT_CARDS.map((s, i) => (
            <div key={i} style={{ background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:16, padding:'22px 24px', boxShadow:'0 1px 3px rgba(0,0,0,0.02)', transition:'all 0.15s' }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor='#cbd5e1';e.currentTarget.style.boxShadow='0 8px 25px rgba(0,0,0,0.05)'}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor='#e2e8f0';e.currentTarget.style.boxShadow='0 1px 3px rgba(0,0,0,0.02)'}}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                <span style={{ fontSize:11.5, fontWeight:700, color:s.color, background:`${s.color}12`, padding:'3px 10px', borderRadius:20 }}>{s.badge}</span>
              </div>
              <div style={{ fontSize:32, fontWeight:800, color:'#0f172a', lineHeight:1, marginBottom:6, letterSpacing:'-0.5px' }}>{s.value}</div>
              <div style={{ fontSize:12.5, color:'#64748b', fontWeight:600 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Recent posts */}
        <div style={{ background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:16, overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ padding:'20px 24px', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center', background:'#f8fafc' }}>
            <div style={{ fontWeight:800, fontSize:15, color:'#0f172a' }}>Recent Campaign Posts</div>
            <button onClick={()=>navigate('/pipeline')} style={{ fontSize:13, color:'#db2777', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:700 }}>View full pipeline →</button>
          </div>
          {loading ? (
            <div style={{ padding:50, textAlign:'center', color:'#64748b', fontSize:14 }}>Loading posts...</div>
          ) : recentPosts.length === 0 ? (
            <div style={{ padding:60, textAlign:'center' }}>
              <div style={{ fontSize:15, fontWeight:700, color:'#0f172a', marginBottom:6 }}>No posts in your pipeline yet</div>
              <div style={{ fontSize:13, color:'#64748b', marginBottom:20 }}>Use Agent HQ or Ask Flo to generate your first campaign.</div>
              <button onClick={()=>navigate('/agent')} style={{ background:'linear-gradient(135deg,#db2777,#7c3aed,#4f46e5)', color:'#fff', border:'none', borderRadius:10, padding:'10px 22px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', boxShadow:'0 4px 15px rgba(219,39,119,0.25)' }}>Launch AI Agent</button>
            </div>
          ) : (
            <div>
              {recentPosts.map((post, i) => (
                <div key={post.id} onClick={()=>navigate('/pipeline')} style={{ padding:'16px 24px', borderBottom:i<recentPosts.length-1?'1px solid #f1f5f9':'none', display:'flex', alignItems:'center', gap:16, cursor:'pointer', transition:'background 0.15s' }}
                  onMouseEnter={e=>e.currentTarget.style.background='#f8fafc'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <div style={{ width:38, height:38, borderRadius:10, background:`${PLATFORM_COLORS[post.platform]||'#4f46e5'}15`, display:'flex', alignItems:'center', justifyContent:'center', color:PLATFORM_COLORS[post.platform]||'#4f46e5', fontWeight:800, fontSize:12, textTransform:'uppercase', flexShrink:0 }}>
                    {post.platform?.substring(0,2)}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, color:'#0f172a', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:4 }}>{post.content || 'No content'}</div>
                    <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                      <span style={{ fontSize:12, color:'#64748b', textTransform:'capitalize', fontWeight:500 }}>{post.platform}</span>
                      <span style={{ fontSize:12, color:'#cbd5e1' }}>·</span>
                      <span style={{ fontSize:12, color:'#64748b' }}>{new Date(post.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <span style={{ fontSize:11.5, fontWeight:700, padding:'4px 12px', borderRadius:20, flexShrink:0, textTransform:'uppercase',
                    background: post.status==='published'?'#e0e7ff':post.status==='approved'?'#ecfdf5':'#fef3c7',
                    color: post.status==='published'?'#4f46e5':post.status==='approved'?'#059669':'#d97706',
                  }}>{post.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
