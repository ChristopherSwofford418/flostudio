import { useState, useEffect, useMemo } from 'react'
import Layout from '../components/Layout'
import { supabase } from '../supabase'
import { listMediaAssets } from '../lib/mediaAssets'
import { useWorkspace } from '../context/WorkspaceContext'

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

const PLATFORM_COLORS = { instagram: '#ad4ec8', twitter: '#27324a', linkedin: '#1977ba', facebook: '#2876df', tiktok: '#1b2335' }
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

export default function AICalendar() {
  const { apps, activeApp, setActiveApp, workspaceId } = useWorkspace()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedPost, setSelectedPost] = useState(null)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [fillPrompt, setFillPrompt] = useState('')
  const [showFillModal, setShowFillModal] = useState(false)
  const [mediaAssets, setMediaAssets] = useState([])
  const [scopeMode, setScopeMode] = useState('app')
  const [legacyCount, setLegacyCount] = useState(0)
  const [loadError, setLoadError] = useState('')
  const activeProductId = activeApp?.id || ''

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  useEffect(() => { loadPosts() }, [month, year, activeProductId, scopeMode])

  const loadPosts = async () => {
    setLoading(true)
    setLoadError('')
    const start = new Date(year, month, 1).toISOString()
    const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString()
    try {
      const mediaQuery = scopeMode === 'all'
        ? supabase.from('media_assets').select('*').in('render_status', ['ready','completed']).order('created_at', { ascending:false })
        : listMediaAssets(activeProductId).catch(() => [])
      const [postResult, campaignResult, mediaResult] = await Promise.all([
        supabase.from('campaign_posts').select('*').gte('scheduled_at', start).lte('scheduled_at', end).order('scheduled_at'),
        supabase.from('campaigns').select('id,product_id,name'),
        mediaQuery,
      ])
      if (postResult.error) throw postResult.error
      if (campaignResult.error) throw campaignResult.error
      const campaignById = Object.fromEntries((campaignResult.data || []).map(campaign => [campaign.id, campaign]))
      const enriched = (postResult.data || []).map(post => ({ ...post, campaign:campaignById[post.campaign_id] || null }))
      const unassigned = enriched.filter(post => !post.campaign?.product_id).length
      const scoped = scopeMode === 'app' && activeProductId ? enriched.filter(post => post.campaign?.product_id === activeProductId) : enriched
      setPosts(scoped)
      setLegacyCount(unassigned)
      const mediaRows = Array.isArray(mediaResult) ? mediaResult : (mediaResult?.data || [])
      setMediaAssets(mediaRows.filter(asset => asset.render_status === 'ready' || asset.render_status === 'completed'))
    } catch (error) {
      setLoadError(error.message || 'FloStudio could not load this calendar.')
      setPosts([])
      setMediaAssets([])
    } finally { setLoading(false) }
  }

  const getPostsForDay = (day) => {
    return posts.filter(p => {
      if (!p.scheduled_at) return false
      const pd = new Date(p.scheduled_at)
      return pd.getDate() === day && pd.getMonth() === month && pd.getFullYear() === year
    })
  }

  const getMediaForPost = id => mediaAssets.filter(asset => asset.campaign_post_id === id)
  const counts = useMemo(() => ({ pending:posts.filter(post => post.status === 'pending').length, approved:posts.filter(post => post.status === 'approved').length, published:posts.filter(post => post.status === 'published').length }), [posts])
  const changeApp = productId => {
    const next = apps.find(app => app.id === productId)
    if (next) setActiveApp(next)
    setScopeMode('app')
    setSelectedDate(null)
    setSelectedPost(null)
  }

  const fillMonth = async () => {
    if (!fillPrompt.trim()) return
    if (!activeApp || scopeMode !== 'app') {
      alert('Choose a portfolio app before filling its calendar. All Portfolio is review-only.')
      return
    }
    setGenerating(true)
    setShowFillModal(false)
    try {
      const { data:{ user } } = await supabase.auth.getUser()
      if (!user?.id) throw new Error('Sign in again before creating an app calendar.')
      let campaignResult = await supabase.from('campaigns').select('*').eq('user_id', user.id).eq('product_id', activeApp.id).order('updated_at', { ascending:false }).limit(1).maybeSingle()
      if (campaignResult.error) throw campaignResult.error
      let calendarCampaign = campaignResult.data
      if (!calendarCampaign) {
        if (!activeApp.brand_id) throw new Error('This app needs a brand record before FloStudio can create an app-scoped calendar. Open Campaign Engine once for this app, then try again.')
        const created = await supabase.from('campaigns').insert([{
          user_id:user.id,
          workspace_id:workspaceId || activeApp.workspace_id || null,
          brand_id:activeApp.brand_id,
          product_id:activeApp.id,
          name:`${activeApp.name} · ${MONTHS[month]} ${year} Content Calendar`,
          objective:'content cadence',
          audience:activeApp.audience || null,
          offer_text:activeApp.offer_text || null,
          platforms:['instagram','linkedin','facebook','twitter'],
          brief:fillPrompt.trim(),
          status:'ready_for_review',
        }]).select().single()
        if (created.error) throw created.error
        calendarCampaign = created.data
      }
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
      
      for (const post of generated) {
        const dayNum = Math.min(Math.max(1, post.day || 1), daysInMonth)
        const d = new Date(year, month, dayNum)
        d.setHours(9, 0, 0, 0)
        await supabase.from('campaign_posts').insert([{
          user_id:user.id,
          workspace_id:workspaceId || activeApp.workspace_id || null,
          campaign_id:calendarCampaign.id,
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
      <style>{`
        @keyframes calendarIn{from{opacity:0;transform:translateY(9px)}to{opacity:1;transform:translateY(0)}}
        .calendar-wrap{max-width:1200px;margin:0 auto;padding:0 4px 52px;animation:calendarIn .28s ease-out}.calendar-hero{position:relative;overflow:hidden;padding:29px;border-radius:22px;border:1px solid #d8dfef;background:linear-gradient(135deg,#141d3b 0%,#222a60 60%,#6750d9 155%);box-shadow:0 20px 52px rgba(18,29,63,.14)}.calendar-hero:before{content:'';position:absolute;width:420px;height:420px;top:-250px;right:-135px;border-radius:50%;background:radial-gradient(circle,rgba(185,180,255,.38),transparent 68%)}.calendar-hero h1{color:#fff!important;text-shadow:0 2px 18px rgba(4,8,30,.35)}.calendar-hero h1 .studio-serif{color:#cdc9ff!important}.calendar-hero p{color:rgba(244,245,255,.8)!important}.calendar-kicker{font:800 9px 'DM Mono',monospace;letter-spacing:.13em;text-transform:uppercase;color:#bdb9ff}.calendar-context{position:relative;z-index:1;display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,.65fr);gap:16px;align-items:end;margin-top:24px;padding-top:16px;border-top:1px solid rgba(255,255,255,.14)}.calendar-stat{padding:14px 16px;border:1px solid #dfe6f0;border-radius:16px;background:#fff;box-shadow:0 9px 22px rgba(20,30,55,.045)}.calendar-board{overflow:hidden;border:1px solid #dfe6ef;border-radius:18px;background:#fff;box-shadow:0 9px 26px rgba(22,31,58,.05)}.calendar-filter button{border:0;background:transparent;color:#65708a;border-radius:10px;padding:8px 12px;font-size:10.5px;font-weight:850;cursor:pointer}.calendar-filter button.active{background:#28245a;color:#fff;box-shadow:0 5px 11px rgba(40,36,90,.18)}.calendar-action{border:1px solid rgba(255,255,255,.24);background:rgba(255,255,255,.08);color:#fff;border-radius:10px;padding:9px 11px;cursor:pointer;font-size:10.5px;font-weight:850;white-space:nowrap}.calendar-action.primary{background:#6d63eb;border-color:#6d63eb}.calendar-action:disabled{opacity:.56;cursor:wait}@media(max-width:820px){.calendar-context{grid-template-columns:1fr}.calendar-wrap{padding:0 0 38px}}@media(max-width:620px){.calendar-hero{padding:21px 18px}.calendar-board{overflow-x:auto}.calendar-grid{min-width:760px}}
      `}</style>

      <div className="flo-page calendar-wrap">

        <section className="calendar-hero">
          <div style={{ position:'relative', zIndex:1, display:'flex', justifyContent:'space-between', gap:18, alignItems:'flex-start', flexWrap:'wrap' }}>
            <div><div className="calendar-kicker">FLOSTUDIO / AI CALENDAR</div><h1 style={{ fontSize:'clamp(34px,4.2vw,56px)', lineHeight:.95, letterSpacing:'-.065em', maxWidth:650, marginTop:10 }}>{MONTHS[month]} <span className="studio-serif">{year}</span>.</h1><p style={{ fontSize:12.5, lineHeight:1.7, maxWidth:620, marginTop:13 }}>Plan a deliberate publishing rhythm for one portfolio app at a time. Calendar decisions, Creative Lab media, and review status stay in the same app context.</p></div>
            <div style={{ display:'grid', gap:7, minWidth:165, padding:'10px 12px', border:'1px solid rgba(255,255,255,.16)', borderRadius:13, background:'rgba(7,10,29,.25)' }}><span className="calendar-kicker" style={{ color:'#aaa6ef' }}>THIS MONTH</span><b style={{ color:'#fff', fontSize:23 }}>{posts.length}</b><span style={{ color:'rgba(243,244,255,.66)', fontSize:10.5 }}>scheduled signal{posts.length === 1 ? '' : 's'}</span></div>
          </div>
          <div className="calendar-context"><div><div className="calendar-kicker">PLANNING CONTEXT</div><p style={{ fontSize:10.5, marginTop:5 }}>Switch apps to view that app’s campaign calendar. All Portfolio keeps historic unassigned activity accessible without mixing it into the active app plan.</p><div style={{ display:'flex', alignItems:'center', gap:8, marginTop:12 }}><button type="button" onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="calendar-action" style={{ padding:'6px 9px' }}>←</button><button type="button" onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="calendar-action" style={{ padding:'6px 9px' }}>→</button><span style={{ font:'800 9px DM Mono,monospace', color:'#d1ceff', letterSpacing:'.08em' }}>MONTH NAVIGATION</span></div></div><div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) auto', gap:8, alignItems:'end' }}><label style={{ display:'grid', gap:5, color:'#c7c4f4', fontSize:9, fontWeight:850, letterSpacing:'.09em', textTransform:'uppercase' }}>Portfolio app<select value={activeApp?.id || ''} onChange={event => changeApp(event.target.value)} style={{ padding:'10px 11px', borderRadius:10, border:'1px solid rgba(255,255,255,.22)', background:'#fff', color:'#20243d', fontWeight:800, textTransform:'none', letterSpacing:0 }}>{apps.map(app => <option key={app.id} value={app.id}>{app.name}{app.category ? ` · ${app.category}` : ''}</option>)}</select></label><button type="button" onClick={() => { setScopeMode(value => value === 'app' ? 'all' : 'app'); setSelectedPost(null); setSelectedDate(null) }} className="calendar-action" style={{ height:38, background:scopeMode === 'all' ? '#786ff1' : 'rgba(255,255,255,.08)' }}>{scopeMode === 'all' ? 'App view' : 'All portfolio'}</button></div></div>
        </section>
        {legacyCount > 0 && scopeMode === 'app' && <div style={{ marginTop:14, padding:'10px 13px', borderRadius:12, border:'1px solid #e7defd', background:'#faf8ff', color:'#625c7d', fontSize:11, lineHeight:1.55 }}><b style={{ color:'#4e47b8' }}>{legacyCount} legacy calendar record{legacyCount === 1 ? '' : 's'}</b> cannot yet be matched to a portfolio app and remain preserved in <b>All Portfolio</b>. No records have been removed or changed.</div>}
        {loadError && <div style={{ marginTop:14, padding:'10px 13px', borderRadius:12, border:'1px solid #f0c6cd', background:'#fff7f7', color:'#9b3545', fontSize:11.5 }}>{loadError}</div>}
        <section style={{ display:'grid', gridTemplateColumns:'repeat(3,minmax(0,1fr))', gap:12, margin:'18px 0 14px' }}>{[['pending','Needs review','#6f63d8'],['approved','Approved','#16836b'],['published','Published','#2673c9']].map(([status,label,accent]) => <div key={status} className="calendar-stat"><div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'center' }}><span style={{ color:'#68738a', fontSize:9, letterSpacing:'.1em', fontWeight:850, textTransform:'uppercase' }}>{label}</span><span style={{ width:8, height:8, borderRadius:'50%', background:accent }}/></div><b style={{ display:'block', color:'#20273d', fontSize:27, letterSpacing:'-.06em', marginTop:7 }}>{counts[status]}</b><span style={{ color:'#7a8498', fontSize:10.5 }}>in {scopeMode === 'all' ? 'all portfolio' : (activeApp?.name || 'selected app')}</span></div>)}</section>
        <section style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap', margin:'0 0 12px' }}><div><div className="calendar-kicker" style={{ color:'#5f59e8' }}>MONTHLY PUBLISHING RHYTHM</div><p style={{ color:'#69748b', fontSize:10.5, marginTop:4 }}>{scopeMode === 'all' ? 'Review all preserved calendar activity.' : `Build ${activeApp?.name || 'this app'}’s cadence using its saved product truth and creative library.`}</p></div><button type="button" onClick={() => setShowFillModal(true)} disabled={generating || scopeMode === 'all'} style={{ border:'1px solid #5f59e8', background:'#5f59e8', color:'#fff', borderRadius:10, padding:'10px 13px', fontSize:10.5, fontWeight:850, cursor:scopeMode === 'all' ? 'not-allowed' : 'pointer', opacity:scopeMode === 'all' ? .58 : 1 }}>{generating ? 'Mapping…' : `Fill ${activeApp?.name || 'app'} month →`}</button></section>

        {/* Calendar grid */}
        <div className="calendar-board">
          <div className="calendar-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid #e3e8f0', background: '#f8f9fc' }}>
            {DAYS.map(d => <div key={d} style={{ padding: '13px 0', textAlign: 'center', fontSize: 10, fontWeight:850, color: '#6c768c', letterSpacing: '.08em', textTransform:'uppercase' }}>{d}</div>)}
          </div>
          <div className="calendar-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
            {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} style={{ minHeight: 122, borderRight: '1px solid #e7ebf2', borderBottom: '1px solid #e7ebf2', background: '#fafbfd' }} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const dayPosts = getPostsForDay(day)
              const isToday = new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year
              const isSelected = selectedDate === day
              return (
                <div key={day} onClick={() => setSelectedDate(isSelected ? null : day)} style={{ minHeight: 122, borderRight: '1px solid #e7ebf2', borderBottom: '1px solid #e7ebf2', padding: 10, cursor: 'pointer', background: isSelected ? '#f2f0ff' : '#fff', transition: 'background .15s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: isToday ? 850 : 700, color: isToday ? '#514bc6' : '#535e76', width: 26, height: 26, borderRadius: '50%', background: isToday ? '#e7e4ff' : 'transparent', border: isToday ? '1px solid #a9a4ff' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{day}</span>
                    {dayPosts.length > 0 && <span style={{ fontSize: 9.5, fontWeight:800, color:'#5b55bf', background:'#eeecff', padding:'3px 6px', borderRadius:10 }}>{dayPosts.length}</span>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {dayPosts.slice(0, 3).map(post => (
                      <div key={post.id} onClick={e => { e.stopPropagation(); setSelectedPost(post) }} style={{ padding:'5px 7px', borderRadius:7, background:`${PLATFORM_COLORS[post.platform] || '#667085'}13`, border:'1px solid #e5e8f0', borderLeft:`3px solid ${PLATFORM_COLORS[post.platform] || '#667085'}`, fontSize:10, color:'#344057', fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        <span style={{ fontWeight:850, color:PLATFORM_COLORS[post.platform] || '#667085', marginRight:4, textTransform:'uppercase' }}>{post.platform?.substring(0,2)}</span>
                        {getMediaForPost(post.id).length > 0 && <span style={{ color:'#655ed2', marginRight:4 }}>MEDIA</span>}
                        {post.content.substring(0, 24)}...
                      </div>
                    ))}
                    {dayPosts.length > 3 && <div style={{ fontSize:10, color:'#6e78a0', fontWeight:800, paddingLeft:4 }}>+{dayPosts.length - 3} more</div>}
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
            <div className="calendar-kicker" style={{ color:'#5f59e8' }}>APP-SCOPED CALENDAR</div><h3 style={{ fontSize: 22, fontWeight: 850, color: '#273149', marginTop:7, marginBottom:8 }}>Fill {activeApp?.name || 'this app'}’s month.</h3>
            <p style={{ fontSize: 13, color: '#69748b', marginBottom: 20, lineHeight: 1.6 }}>Describe this app’s campaign. FloStudio will create a new or existing selected-app campaign and schedule {MONTHS[month]} posts beneath it; nothing will be added to another app.</p>
            <textarea value={fillPrompt} onChange={e => setFillPrompt(e.target.value)} placeholder={`e.g. Focus ${activeApp?.name || 'this app'} on a practical outcome, target audience, and this month’s content goal.`} rows={4} style={{ width: '100%', background: '#fafafa', border: '1px solid #d4d4d4', borderRadius: 12, padding: '14px 16px', color: '#171717', fontSize: 14, fontFamily: 'inherit', resize: 'vertical', outline: 'none', marginBottom: 20, boxSizing: 'border-box', lineHeight: 1.6 }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button onClick={() => setShowFillModal(false)} style={{ padding: '10px 18px', background: '#f4f4f4', border: 'none', borderRadius: 10, color: '#727272', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={fillMonth} style={{ padding: '10px 24px', background: 'linear-gradient(135deg,#535353,#555555,#535353)', border: 'none', borderRadius: 10, color: '#ffffff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 15px rgba(83,83,83,0.3)' }}>Generate app calendar</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
