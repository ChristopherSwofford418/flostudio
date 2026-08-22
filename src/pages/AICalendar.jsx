import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { supabase } from '../supabase'
import { listMediaAssets } from '../lib/mediaAssets'

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

const PLATFORM_COLORS = { instagram: '#535353', twitter: '#6d6d6d', linkedin: '#575757', facebook: '#4e4e4e', tiktok: '#767676' }
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
  const [mediaAssets, setMediaAssets] = useState([])

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  useEffect(() => { loadPosts() }, [month, year])

  const loadPosts = async () => {
    setLoading(true)
    const start = new Date(year, month, 1).toISOString()
    const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString()
    const [{ data }, mediaResult] = await Promise.all([
      supabase.from('campaign_posts').select('*').gte('scheduled_at', start).lte('scheduled_at', end).order('scheduled_at'),
      listMediaAssets().catch(() => []),
    ])
    setPosts(data || [])
    setMediaAssets(mediaResult.filter(asset => asset.render_status === 'ready' || asset.render_status === 'completed'))
    setLoading(false)
  }

  const getPostsForDay = (day) => {
    return posts.filter(p => {
      if (!p.scheduled_at) return false
      const pd = new Date(p.scheduled_at)
      return pd.getDate() === day && pd.getMonth() === month && pd.getFullYear() === year
    })
  }

  const getMediaForPost = id => mediaAssets.filter(asset => asset.campaign_post_id === id)

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

      <div className="flo-page" style={{ maxWidth: 1150, margin: '0 auto', animation: 'fadeIn 0.25s ease' }}>

        {/* Campaign map header */}
        <section className="abundance-shell" style={{ minHeight:220, marginBottom:22, display:'grid', gridTemplateColumns:'1fr 300px' }}>
          <div style={{ padding:'25px 30px', position:'relative', zIndex:1, display:'flex', flexDirection:'column', justifyContent:'space-between' }}>
            <div><div className="abundance-eyebrow">Campaign map / Publishing rhythm</div><h2 className="abundance-title" style={{ fontSize:'clamp(32px,4vw,48px)', marginTop:8 }}>{MONTHS[month]} <em>{year}</em></h2><p className="abundance-copy" style={{ marginTop:10, maxWidth:520 }}>Your cadence is not a list of dates. It is the sequence that lets a campaign build momentum.</p></div>
            <div style={{ display:'flex', alignItems:'center', gap:9 }}><button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="studio-chip" style={{ width:34, justifyContent:'center', padding:7 }}>←</button><button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="studio-chip" style={{ width:34, justifyContent:'center', padding:7 }}>→</button><span style={{ marginLeft:5, fontFamily:'DM Mono,monospace', fontSize:10, color:'#ededed' }}>{posts.length} scheduled signals</span></div>
          </div>
          <div style={{ position:'relative', overflow:'hidden' }}><img src="/visuals/flo-preview-product.jpg" alt="Campaign planning visual" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }} /><div style={{ position:'absolute', inset:0, background:'linear-gradient(90deg,#202020,transparent 52%)' }} /><button onClick={() => setShowFillModal(true)} disabled={generating} className="studio-button" style={{ position:'absolute', right:18, bottom:18 }}>{generating ? 'Mapping…' : 'Fill the month →'}</button></div>
        </section>

        {/* Calendar grid */}
        <div className="abundance-card" style={{ overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid rgba(255,255,255,.13)', background: 'rgba(255,255,255,.05)' }}>
            {DAYS.map(d => <div key={d} style={{ padding: '14px 0', textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'rgba(232,232,232,.67)', letterSpacing: '0.05em' }}>{d}</div>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
            {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} style={{ minHeight: 120, borderRight: '1px solid rgba(255,255,255,.07)', borderBottom: '1px solid rgba(255,255,255,.07)', background: 'rgba(0,0,0,.12)' }} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const dayPosts = getPostsForDay(day)
              const isToday = new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year
              const isSelected = selectedDate === day
              return (
                <div key={day} onClick={() => setSelectedDate(isSelected ? null : day)} style={{ minHeight: 120, borderRight: '1px solid rgba(255,255,255,.07)', borderBottom: '1px solid rgba(255,255,255,.07)', padding: 10, cursor: 'pointer', background: isSelected ? 'rgba(113,113,113,.2)' : 'transparent', transition: 'background 0.15s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: isToday ? 800 : 600, color: isToday ? '#b3b3b3' : '#ffffff', width: 26, height: 26, borderRadius: '50%', background: isToday ? 'rgba(136,136,136,.16)' : 'transparent', border: isToday ? '1px solid #a9a9a9' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{day}</span>
                    {dayPosts.length > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, color: '#c7c7c7', background: 'rgba(136,136,136,.14)', padding: '1px 6px', borderRadius: 10 }}>{dayPosts.length}</span>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {dayPosts.slice(0, 3).map(post => (
                      <div key={post.id} onClick={e => { e.stopPropagation(); setSelectedPost(post) }} style={{ padding: '5px 8px', borderRadius: 6, background: `${PLATFORM_COLORS[post.platform] || '#535353'}20`, borderLeft: `3px solid ${PLATFORM_COLORS[post.platform] || '#535353'}`, fontSize: 11.5, color: '#ffffff', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 800, color: PLATFORM_COLORS[post.platform] || '#535353', marginRight: 4, textTransform: 'uppercase' }}>{post.platform?.substring(0,2)}</span>
                        {getMediaForPost(post.id).length > 0 && <span style={{ color:'#ededed', marginRight:4 }}>MEDIA</span>}
                        {post.content.substring(0, 24)}...
                      </div>
                    ))}
                    {dayPosts.length > 3 && <div style={{ fontSize: 11, color: '#727272', fontWeight: 600, paddingLeft: 4 }}>+{dayPosts.length - 3} more</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Post detail modal */}
      {selectedPost && (
        <div onClick={() => setSelectedPost(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(23,23,23,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(6px)' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#ffffff', border: '1px solid #e7e7e7', borderRadius: 20, padding: 32, maxWidth: 500, width: '90%', animation: 'fadeIn 0.2s ease', boxShadow: '0 20px 50px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ padding: '4px 12px', borderRadius: 20, background: `${PLATFORM_COLORS[selectedPost.platform] || '#535353'}15`, color: PLATFORM_COLORS[selectedPost.platform] || '#535353', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>{selectedPost.platform}</span>
                <span style={{ padding: '4px 12px', borderRadius: 20, background: selectedPost.status === 'approved' ? '#f9f9f9' : '#f2f2f2', color: selectedPost.status === 'approved' ? '#747474' : '#848484', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>{selectedPost.status}</span>
              </div>
              <button onClick={() => setSelectedPost(null)} style={{ background: 'none', border: 'none', color: '#727272', cursor: 'pointer', fontSize: 22 }}>×</button>
            </div>
            <div style={{ background: '#fafafa', border: '1px solid #e7e7e7', borderRadius: 12, padding: '16px 18px', marginBottom: 18, fontSize: 14, color: '#171717', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{selectedPost.content}</div>
            {getMediaForPost(selectedPost.id).length > 0 && <div style={{ display:'flex', gap:9, overflowX:'auto', marginBottom:16 }}>{getMediaForPost(selectedPost.id).map(asset => <div key={asset.id} style={{ width:112, height:112, borderRadius:10, overflow:'hidden', background:'#e7e7e7', flexShrink:0 }}>{asset.kind === 'video' ? <video src={asset.asset_url} controls playsInline preload="metadata" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <img src={asset.asset_url} alt="Scheduled campaign creative" style={{ width:'100%', height:'100%', objectFit:'cover' }} />}</div>)}</div>}
            {selectedPost.scheduled_at && <div style={{ fontSize: 12, color: '#727272', marginBottom: 20, fontWeight: 500 }}>Scheduled: {new Date(selectedPost.scheduled_at).toLocaleString()}</div>}
            <div style={{ display: 'flex', gap: 12 }}>
              {selectedPost.status !== 'approved' && <button onClick={() => approvePost(selectedPost.id)} style={{ flex: 1, padding: '10px', background: '#f9f9f9', border: '1px solid #e0e0e0', borderRadius: 10, color: '#747474', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Approve Post</button>}
              <button onClick={() => deletePost(selectedPost.id)} style={{ flex: 1, padding: '10px', background: '#f5f5f5', border: '1px solid #d5d5d5', borderRadius: 10, color: '#4d4d4d', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Delete Post</button>
            </div>
          </div>
        </div>
      )}

      {/* Fill month modal */}
      {showFillModal && (
        <div onClick={() => setShowFillModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(23,23,23,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(6px)' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#ffffff', border: '1px solid #e7e7e7', borderRadius: 20, padding: 32, maxWidth: 500, width: '90%', animation: 'fadeIn 0.2s ease', boxShadow: '0 20px 50px rgba(0,0,0,0.15)' }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#171717', marginBottom: 8 }}>AI Fill Month Calendar</h3>
            <p style={{ fontSize: 13.5, color: '#727272', marginBottom: 20, lineHeight: 1.6 }}>Describe your brand or campaign. The AI strategist will populate {MONTHS[month]} with tailored posts across multiple platforms.</p>
            <textarea value={fillPrompt} onChange={e => setFillPrompt(e.target.value)} placeholder="e.g. We are a boutique fitness studio in Austin. We want to drive membership signups and promote morning classes." rows={4} style={{ width: '100%', background: '#fafafa', border: '1px solid #d4d4d4', borderRadius: 12, padding: '14px 16px', color: '#171717', fontSize: 14, fontFamily: 'inherit', resize: 'vertical', outline: 'none', marginBottom: 20, boxSizing: 'border-box', lineHeight: 1.6 }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button onClick={() => setShowFillModal(false)} style={{ padding: '10px 18px', background: '#f4f4f4', border: 'none', borderRadius: 10, color: '#727272', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={fillMonth} style={{ padding: '10px 24px', background: 'linear-gradient(135deg,#535353,#555555,#535353)', border: 'none', borderRadius: 10, color: '#ffffff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 15px rgba(83,83,83,0.3)' }}>Generate Calendar</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
