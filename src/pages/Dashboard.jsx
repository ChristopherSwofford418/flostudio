import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { supabase } from '../supabase'
import { listMediaAssets } from '../lib/mediaAssets'

const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4a3B2bm9raHFicGJxZWZlZ3hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMDI1NDgsImV4cCI6MjA5MTc3ODU0OH0.OVdLzh2Bvuf4l6F6ITSpj4pWqoc3EoTxs6OCvrMf4JU'

const PLATFORM_COLORS = { instagram:'#535353', twitter:'#6d6d6d', linkedin:'#575757', facebook:'#4e4e4e', tiktok:'#767676' }

export default function Dashboard() {
  const navigate = useNavigate()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [aiInsight, setAiInsight] = useState('')
  const [insightLoading, setInsightLoading] = useState(true)
  const [mediaAssets, setMediaAssets] = useState([])

  useEffect(() => {
    loadPosts()
    loadAiInsight()
  }, [])

  const loadPosts = async () => {
    setLoading(true)
    const [{ data }, mediaResult] = await Promise.all([
      supabase.from('campaign_posts').select('*').order('created_at', { ascending: false }).limit(20),
      listMediaAssets().catch(() => []),
    ])
    setPosts(data || [])
    setMediaAssets(mediaResult)
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
  const completedMedia = mediaAssets.filter(asset => asset.render_status === 'ready' || asset.render_status === 'completed')
  const imageMedia = completedMedia.filter(asset => asset.kind === 'image')
  const videoMedia = completedMedia.filter(asset => asset.kind === 'video')

  const STAT_CARDS = [
    { label: 'Total Posts', value: stats.total, color: '#535353', badge: 'All Active' },
    { label: 'Approved', value: stats.approved, color: '#747474', badge: 'Ready to Publish' },
    { label: 'Published', value: stats.published, color: '#555555', badge: 'Live in Feed' },
    { label: 'Pending Review', value: stats.pending, color: '#535353', badge: stats.pending > 0 ? 'Requires Action' : 'All Clear' },
  ]

  return (
    <Layout title="Dashboard">
      <div className="flo-page" style={{ display:'flex', flexDirection:'column', gap:28, animation:'fadeIn 0.3s ease', maxWidth:1200, margin:'0 auto' }}>
        <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

        {/* Editorial performance overview */}
        <section className="abundance-shell" style={{ display:'grid', gridTemplateColumns:'1.1fr .9fr', minHeight:270 }}>
          <div style={{ padding:'32px 34px', display:'flex', flexDirection:'column', justifyContent:'space-between' }}>
            <div><div className="studio-kicker" style={{ color:'#e2e2e2', marginBottom:13 }}>Performance desk / Live signal</div><h2 className="studio-display" style={{ fontSize:'clamp(31px,4vw,49px)', maxWidth:540 }}>Make the next move <span className="studio-serif" style={{ color:'#dadada' }}>with intent.</span></h2></div>
            <div style={{ display:'flex', alignItems:'flex-start', gap:11, maxWidth:540, paddingTop:20, borderTop:'1px solid rgba(255,255,255,.15)' }}><span style={{ width:8, height:8, borderRadius:99, background:'#e2e2e2', marginTop:5, flexShrink:0 }}/><div><div style={{ fontFamily:'DM Mono, monospace', color:'#e2e2e2', fontSize:9.5, letterSpacing:'.1em', marginBottom:5 }}>FLO'S LATEST READ</div><div style={{ fontSize:12.5, color:'rgba(251,251,251,.78)', lineHeight:1.6 }}>{insightLoading ? 'Reading your current creative mix…' : aiInsight}</div></div></div>
          </div>
          <div style={{ position:'relative', minHeight:270, overflow:'hidden' }}><img src="/visuals/flo-preview-lifestyle.jpg" alt="Campaign creative in progress" style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'center' }}/><div style={{ position:'absolute', inset:0, background:'linear-gradient(90deg,#191919 0%,transparent 34%),linear-gradient(to top,rgba(23,23,23,.7),transparent 45%)' }}/><div className="abundance-glass" style={{ position:'absolute', right:18, bottom:18, color:'#ffffff', padding:'10px 12px', borderRadius:12, minWidth:126 }}><div style={{ fontFamily:'DM Mono,monospace', fontSize:9, color:'#ededed', letterSpacing:'.08em' }}>CREATIVE STATUS</div><div style={{ fontWeight:800, fontSize:12, marginTop:3 }}>{stats.pending} ideas need review</div></div></div>
        </section>

        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
          {STAT_CARDS.map((s, i) => (
            <div key={i} className="abundance-card" style={{ padding:'22px 24px', transition:'all 0.15s' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                <span style={{ fontSize:11.5, fontWeight:700, color:s.color, background:`${s.color}12`, padding:'3px 10px', borderRadius:20 }}>{s.badge}</span>
              </div>
              <div style={{ fontSize:32, fontWeight:800, color:'#ffffff', lineHeight:1, marginBottom:6, letterSpacing:'-0.5px' }}>{s.value}</div>
              <div style={{ fontSize:12.5, color:'rgba(232,232,232,.64)', fontWeight:600 }}>{s.label}</div>
            </div>
          ))}
        </div>

        <section className="abundance-card" style={{ padding:'20px 22px', overflow:'hidden' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16, marginBottom:16 }}><div><div className="abundance-mini-label">CREATIVE INVENTORY</div><h3 style={{ color:'#ffffff', fontSize:20, letterSpacing:'-.05em', marginTop:4 }}>Real media, ready to move into market.</h3></div><button onClick={()=>navigate('/images')} className="studio-button">Open Creative Lab</button></div>
          <div style={{ display:'grid', gridTemplateColumns:'145px 145px 1fr', gap:12, alignItems:'stretch' }}><div className="abundance-glass" style={{ padding:14, borderRadius:13 }}><div style={{ color:'#c7c7c7', font:'500 9px DM Mono,monospace', letterSpacing:'.08em' }}>IMAGE ADS</div><b style={{ display:'block', color:'#ffffff', fontSize:30, letterSpacing:'-.07em', marginTop:5 }}>{imageMedia.length}</b></div><div className="abundance-glass" style={{ padding:14, borderRadius:13 }}><div style={{ color:'#ededed', font:'500 9px DM Mono,monospace', letterSpacing:'.08em' }}>VIDEO ADS</div><b style={{ display:'block', color:'#ffffff', fontSize:30, letterSpacing:'-.07em', marginTop:5 }}>{videoMedia.length}</b></div><div style={{ display:'flex', gap:8, overflowX:'auto', minHeight:78 }}>{completedMedia.slice(0,6).map(asset => <div key={asset.id} style={{ width:78, height:78, flexShrink:0, borderRadius:11, overflow:'hidden', border:'1px solid rgba(255,255,255,.16)', background:'rgba(255,255,255,.07)' }}>{asset.kind === 'video' ? <video src={asset.asset_url} muted playsInline preload="metadata" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <img src={asset.asset_url} alt="Creative library asset" style={{ width:'100%', height:'100%', objectFit:'cover' }} />}</div>)}{!completedMedia.length && <div style={{ color:'rgba(232,232,232,.58)', fontSize:12, display:'grid', placeItems:'center', padding:'0 12px' }}>No creative outputs yet. Start a real image or video render in Creative Lab.</div>}</div></div>
        </section>

        {/* Recent posts */}
        <div className="abundance-card" style={{ overflow:'hidden' }}>
          <div style={{ padding:'20px 24px', borderBottom:'1px solid rgba(255,255,255,.12)', display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(255,255,255,.045)' }}>
            <div style={{ fontWeight:800, fontSize:15, color:'#ffffff' }}>Recent Campaign Posts</div>
            <button onClick={()=>navigate('/pipeline')} style={{ fontSize:13, color:'#535353', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:700 }}>View full pipeline →</button>
          </div>
          {loading ? (
            <div style={{ padding:50, textAlign:'center', color:'#727272', fontSize:14 }}>Loading posts...</div>
          ) : recentPosts.length === 0 ? (
            <div style={{ padding:60, textAlign:'center' }}>
              <div style={{ fontSize:15, fontWeight:700, color:'#ffffff', marginBottom:6 }}>No posts in your pipeline yet</div>
              <div style={{ fontSize:13, color:'rgba(232,232,232,.64)', marginBottom:20 }}>Use Agent HQ or Ask Flo to generate your first campaign.</div>
              <button onClick={()=>navigate('/agent')} style={{ background:'linear-gradient(135deg,#535353,#555555,#535353)', color:'#ffffff', border:'none', borderRadius:10, padding:'10px 22px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', boxShadow:'0 4px 15px rgba(83,83,83,0.25)' }}>Launch AI Agent</button>
            </div>
          ) : (
            <div>
              {recentPosts.map((post, i) => (
                <div key={post.id} onClick={()=>navigate('/pipeline')} style={{ padding:'16px 24px', borderBottom:i<recentPosts.length-1?'1px solid rgba(255,255,255,.09)':'none', display:'flex', alignItems:'center', gap:16, cursor:'pointer', transition:'background 0.15s' }}
                  onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,.045)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <div style={{ width:38, height:38, borderRadius:10, background:`${PLATFORM_COLORS[post.platform]||'#535353'}15`, display:'flex', alignItems:'center', justifyContent:'center', color:PLATFORM_COLORS[post.platform]||'#535353', fontWeight:800, fontSize:12, textTransform:'uppercase', flexShrink:0 }}>
                    {post.platform?.substring(0,2)}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, color:'#ffffff', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:4 }}>{post.content || 'No content'}</div>
                    <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                      <span style={{ fontSize:12, color:'#727272', textTransform:'capitalize', fontWeight:500 }}>{post.platform}</span>
                      <span style={{ fontSize:12, color:'#d4d4d4' }}>·</span>
                      <span style={{ fontSize:12, color:'#727272' }}>{new Date(post.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <span style={{ fontSize:11.5, fontWeight:700, padding:'4px 12px', borderRadius:20, flexShrink:0, textTransform:'uppercase',
                    background: post.status==='published'?'#e7e7e7':post.status==='approved'?'#f9f9f9':'#f2f2f2',
                    color: post.status==='published'?'#535353':post.status==='approved'?'#747474':'#848484',
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
