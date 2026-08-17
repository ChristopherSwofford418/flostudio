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
      <div className="flo-page" style={{ display:'flex', flexDirection:'column', gap:28, animation:'fadeIn 0.3s ease', maxWidth:1200, margin:'0 auto' }}>
        <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

        {/* Editorial performance overview */}
        <section className="abundance-shell" style={{ display:'grid', gridTemplateColumns:'1.1fr .9fr', minHeight:270 }}>
          <div style={{ padding:'32px 34px', display:'flex', flexDirection:'column', justifyContent:'space-between' }}>
            <div><div className="studio-kicker" style={{ color:'#d7f267', marginBottom:13 }}>Performance desk / Live signal</div><h2 className="studio-display" style={{ fontSize:'clamp(31px,4vw,49px)', maxWidth:540 }}>Make the next move <span className="studio-serif" style={{ color:'#ffd1c4' }}>with intent.</span></h2></div>
            <div style={{ display:'flex', alignItems:'flex-start', gap:11, maxWidth:540, paddingTop:20, borderTop:'1px solid rgba(255,255,255,.15)' }}><span style={{ width:8, height:8, borderRadius:99, background:'#d7f267', marginTop:5, flexShrink:0 }}/><div><div style={{ fontFamily:'DM Mono, monospace', color:'#d7f267', fontSize:9.5, letterSpacing:'.1em', marginBottom:5 }}>FLO'S LATEST READ</div><div style={{ fontSize:12.5, color:'rgba(255,250,244,.78)', lineHeight:1.6 }}>{insightLoading ? 'Reading your current creative mix…' : aiInsight}</div></div></div>
          </div>
          <div style={{ position:'relative', minHeight:270, overflow:'hidden' }}><img src="/visuals/flo-preview-lifestyle.jpg" alt="Campaign creative in progress" style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'center' }}/><div style={{ position:'absolute', inset:0, background:'linear-gradient(90deg,#1d1254 0%,transparent 34%),linear-gradient(to top,rgba(22,19,65,.7),transparent 45%)' }}/><div className="abundance-glass" style={{ position:'absolute', right:18, bottom:18, color:'#fff', padding:'10px 12px', borderRadius:12, minWidth:126 }}><div style={{ fontFamily:'DM Mono,monospace', fontSize:9, color:'#d9ff75', letterSpacing:'.08em' }}>CREATIVE STATUS</div><div style={{ fontWeight:800, fontSize:12, marginTop:3 }}>{stats.pending} ideas need review</div></div></div>
        </section>

        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
          {STAT_CARDS.map((s, i) => (
            <div key={i} className="abundance-card" style={{ padding:'22px 24px', transition:'all 0.15s' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                <span style={{ fontSize:11.5, fontWeight:700, color:s.color, background:`${s.color}12`, padding:'3px 10px', borderRadius:20 }}>{s.badge}</span>
              </div>
              <div style={{ fontSize:32, fontWeight:800, color:'#fff', lineHeight:1, marginBottom:6, letterSpacing:'-0.5px' }}>{s.value}</div>
              <div style={{ fontSize:12.5, color:'rgba(234,229,255,.64)', fontWeight:600 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Recent posts */}
        <div className="abundance-card" style={{ overflow:'hidden' }}>
          <div style={{ padding:'20px 24px', borderBottom:'1px solid rgba(255,255,255,.12)', display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(255,255,255,.045)' }}>
            <div style={{ fontWeight:800, fontSize:15, color:'#fff' }}>Recent Campaign Posts</div>
            <button onClick={()=>navigate('/pipeline')} style={{ fontSize:13, color:'#db2777', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:700 }}>View full pipeline →</button>
          </div>
          {loading ? (
            <div style={{ padding:50, textAlign:'center', color:'#64748b', fontSize:14 }}>Loading posts...</div>
          ) : recentPosts.length === 0 ? (
            <div style={{ padding:60, textAlign:'center' }}>
              <div style={{ fontSize:15, fontWeight:700, color:'#fff', marginBottom:6 }}>No posts in your pipeline yet</div>
              <div style={{ fontSize:13, color:'rgba(234,229,255,.64)', marginBottom:20 }}>Use Agent HQ or Ask Flo to generate your first campaign.</div>
              <button onClick={()=>navigate('/agent')} style={{ background:'linear-gradient(135deg,#db2777,#7c3aed,#4f46e5)', color:'#fff', border:'none', borderRadius:10, padding:'10px 22px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', boxShadow:'0 4px 15px rgba(219,39,119,0.25)' }}>Launch AI Agent</button>
            </div>
          ) : (
            <div>
              {recentPosts.map((post, i) => (
                <div key={post.id} onClick={()=>navigate('/pipeline')} style={{ padding:'16px 24px', borderBottom:i<recentPosts.length-1?'1px solid rgba(255,255,255,.09)':'none', display:'flex', alignItems:'center', gap:16, cursor:'pointer', transition:'background 0.15s' }}
                  onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,.045)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <div style={{ width:38, height:38, borderRadius:10, background:`${PLATFORM_COLORS[post.platform]||'#4f46e5'}15`, display:'flex', alignItems:'center', justifyContent:'center', color:PLATFORM_COLORS[post.platform]||'#4f46e5', fontWeight:800, fontSize:12, textTransform:'uppercase', flexShrink:0 }}>
                    {post.platform?.substring(0,2)}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, color:'#fff', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:4 }}>{post.content || 'No content'}</div>
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
