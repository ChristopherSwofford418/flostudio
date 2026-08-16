import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { supabase } from '../supabase'

const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdWJhc2UiLCJyZWYiOiJ4eGtwdm5va2hxYnBicWVmZWd4YSIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzc2MjAyNTQ4LCJleHAiOjIwOTc3MDI1NDh9.OVdLzh2Bvuf4l6F6ITSpj4pWqoc3EoTxs6OCvrMf4JU'

async function callAI(messages, maxTokens = 1600) {
  const res = await fetch('https://xxkpvnokhqbpbqefegxa.supabase.co/functions/v1/ai-proxy', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}`, apikey: ANON }, body: JSON.stringify({ model: 'gpt-4o', messages, max_tokens: maxTokens }) })
  const data = await res.json()
  return data?.content || data?.choices?.[0]?.message?.content || ''
}

const steps = [
  ['01', 'Positioning signal', 'Reading your offer, audience, and ambition'],
  ['02', 'Content architecture', 'Defining audience angles and pillars'],
  ['03', 'Creative production', 'Writing platform-native concepts'],
  ['04', 'Publishing plan', 'Sequencing and scheduling the campaign'],
]
const platforms = ['instagram', 'linkedin', 'facebook', 'tiktok', 'twitter']
const platformShort = { instagram: 'IG', linkedin: 'LI', facebook: 'FB', tiktok: 'TT', twitter: 'X' }
const optimalTimes = { instagram: '09:00', linkedin: '08:00', facebook: '13:00', tiktok: '19:00', twitter: '12:00' }

export default function AgentHQ() {
  const navigate = useNavigate()
  const [brand, setBrand] = useState('')
  const [audience, setAudience] = useState('')
  const [goal, setGoal] = useState('')
  const [selectedPlatforms, setSelectedPlatforms] = useState(['instagram', 'linkedin'])
  const [volume, setVolume] = useState(5)
  const [running, setRunning] = useState(false)
  const [activeStep, setActiveStep] = useState(-1)
  const [notes, setNotes] = useState([])
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const liveRef = useRef(null)
  useEffect(() => liveRef.current?.scrollIntoView({ behavior: 'smooth' }), [notes])

  const togglePlatform = (p) => setSelectedPlatforms(previous => previous.includes(p) ? previous.filter(x => x !== p) : [...previous, p])
  const addNote = (title, body, tone = 'neutral') => setNotes(previous => [...previous, { title, body, tone }])

  const runAgent = async () => {
    if (!brand.trim() || !selectedPlatforms.length) return
    setRunning(true); setActiveStep(0); setNotes([]); setResult(null); setError('')
    try {
      addNote('Brief locked', 'Flo is translating your signal into campaign direction.', 'violet')
      const strategyText = await callAI([{ role: 'system', content: 'You are a senior social media strategist. Return concise valid JSON: {"tone":"...","pillars":["...","...","...","..."],"strategy":"..."}.' }, { role: 'user', content: `Brand: ${brand}\nAudience: ${audience || 'broad prospective customers'}\nGoal: ${goal || 'grow awareness and conversion'}\nPlatforms: ${selectedPlatforms.join(', ')}` }], 650)
      let strategy = { tone: 'Confident and human', pillars: ['Expert point of view', 'Customer proof', 'Practical education', 'Offer activation'], strategy: 'Build recognition through clear opinions, useful proof, and a strong call to action.' }
      try { const match = strategyText.match(/\{[\s\S]*\}/); if (match) strategy = { ...strategy, ...JSON.parse(match[0]) } } catch {}
      addNote('Campaign strategy ready', `${strategy.tone} voice across ${strategy.pillars.length} content pillars.`, 'success')
      setActiveStep(1)
      const total = Math.min(volume * 2, 10)
      addNote('Creative engine engaged', `Writing ${total} platform-aware pieces of content now.`, 'violet')
      const postText = await callAI([{ role: 'system', content: `Generate exactly ${total} varied social posts. Return ONLY valid JSON array: [{"platform":"instagram","content":"...","hashtags":"#...","post_type":"education"}].` }, { role: 'user', content: `Brand: ${brand}\nAudience: ${audience || 'general customers'}\nGoal: ${goal || 'grow visibility'}\nRotate platforms: ${selectedPlatforms.join(', ')}\nTone: ${strategy.tone}\nPillars: ${strategy.pillars.join(', ')}` }], 3200)
      let generated = []
      try { const clean = postText.replace(/```json|```/g, '').trim(); const match = clean.match(/\[[\s\S]*\]/); generated = JSON.parse(match ? match[0] : clean) } catch {}
      if (!generated.length) generated = Array.from({ length: total }, (_, i) => ({ platform: selectedPlatforms[i % selectedPlatforms.length], content: `${brand} is built for people ready to move with more clarity, confidence, and momentum. Discover what is possible when the right solution meets the right ambition.`, hashtags: '#Growth #Marketing #FloStudio', post_type: 'brand' }))
      setActiveStep(2)
      addNote('Creative set complete', `${generated.length} concepts are ready for review.`, 'success')
      const now = new Date()
      const scheduled = generated.map((post, index) => { const date = new Date(now); date.setDate(now.getDate() + index + 1); date.setHours(Number((optimalTimes[post.platform] || '10:00').split(':')[0]), 0, 0, 0); return { ...post, scheduled_at: date.toISOString() } })
      setActiveStep(3)
      addNote('Publishing map built', 'Sequencing concepts at platform-specific high-intent hours.', 'violet')
      const { data: { user } } = await supabase.auth.getUser()
      let saved = 0
      for (const post of scheduled) {
        const { error: insertError } = await supabase.from('campaign_posts').insert([{ user_id: user?.id || null, platform: post.platform, content: `${post.content}${post.hashtags ? `\n\n${post.hashtags}` : ''}`, status: 'pending', scheduled_at: post.scheduled_at, created_at: new Date().toISOString() }])
        if (insertError) throw insertError
        saved += 1
      }
      addNote('Campaign in review queue', `${saved} pieces were saved to your workspace.`, 'success')
      setResult({ strategy, posts: scheduled, saved })
      setActiveStep(-1)
    } catch (err) { setError(err?.message || 'The campaign did not save. Please try again.'); addNote('Campaign interrupted', err?.message || 'A save operation was not completed.', 'danger'); setActiveStep(-1) }
    setRunning(false)
  }

  return <Layout title="Agent Studio">
    <style>{`@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}} @keyframes glowpulse{0%,100%{box-shadow:0 12px 28px rgba(108,44,255,.2)}50%{box-shadow:0 18px 42px rgba(255,79,163,.32)}}`}</style>
    <div style={{ animation: 'rise .4s cubic-bezier(.23,1,.32,1)', maxWidth: 1280, margin: '0 auto' }}>
      <section style={{ borderRadius: 30, overflow: 'hidden', minHeight: 212, padding: '32px 36px', color: '#fff', position: 'relative', background: 'linear-gradient(122deg,#1f1749,#5c2eff 52%,#ff4fa3)', boxShadow: '0 24px 48px rgba(78,33,194,.22)', marginBottom: 24 }}>
        <div style={{ position: 'absolute', width: 390, height: 390, borderRadius: '50%', right: -120, top: -190, background: 'radial-gradient(circle,rgba(255,199,228,.56),rgba(255,255,255,0))' }} />
        <div style={{ position: 'relative', maxWidth: 710 }}><div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.16em', opacity: .74, marginBottom: 14 }}>AI CAMPAIGN ARCHITECT</div><h1 style={{ fontSize: 'clamp(30px,4vw,46px)', lineHeight: 1.04, letterSpacing: '-.06em', marginBottom: 12 }}>One brief. A complete <span style={{ color: '#ffd4e9' }}>creative system.</span></h1><p style={{ fontSize: 14, opacity: .82, maxWidth: 540, lineHeight: 1.7 }}>Give Flo your market signal. It will translate it into a strategy, content architecture, publishable posts, and a ready-to-review campaign map.</p></div>
        <div style={{ position:'absolute', right:32, bottom:26, display:'flex', gap:8 }}>{['Position','Create','Schedule','Review'].map((tag, i) => <span key={tag} style={{ padding:'6px 9px', borderRadius:99, border:'1px solid rgba(255,255,255,.24)', background:i===0?'rgba(255,255,255,.18)':'rgba(23,17,58,.16)', fontSize:10, fontWeight:800 }}>{tag}</span>)}</div>
      </section>
      <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1.5fr) minmax(310px,.85fr)', gap:24, alignItems:'start' }}>
        <section style={{ background:'rgba(255,255,255,.82)', border:'1px solid rgba(255,255,255,.9)', borderRadius:26, padding:26, boxShadow:'0 16px 32px rgba(39,26,101,.07)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24 }}><div><span className="section-label">CAMPAIGN SIGNAL</span><h2 style={{ fontSize:22, letterSpacing:'-.045em' }}>Shape the assignment</h2></div><span style={{ padding:'6px 9px', borderRadius:99, background:'#eee9ff', color:'#6230dc', fontWeight:800, fontSize:10 }}>STEP 1 OF 1</span></div>
          <div style={{ display:'grid', gap:16 }}>
            <label style={{ display:'grid', gap:7 }}><span style={{ fontSize:12, fontWeight:800, color:'#39315f' }}>What are you building momentum for? <b style={{ color:'#ff4fa3' }}>*</b></span><textarea value={brand} onChange={e=>setBrand(e.target.value)} placeholder="Describe your product, offer, or brand in your own words." rows={4} style={{ width:'100%', border:'1px solid #dedaf0', background:'#fbfaff', borderRadius:15, padding:'13px 15px', color:'#17113a', fontSize:13.5, lineHeight:1.6, resize:'vertical' }} /></label>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}><label style={{ display:'grid', gap:7 }}><span style={{ fontSize:12, fontWeight:800, color:'#39315f' }}>Who should care?</span><input value={audience} onChange={e=>setAudience(e.target.value)} placeholder="Audience, context, and mindset" style={{ border:'1px solid #dedaf0', background:'#fbfaff', borderRadius:13, padding:'12px 13px', color:'#17113a', fontSize:13 }} /></label><label style={{ display:'grid', gap:7 }}><span style={{ fontSize:12, fontWeight:800, color:'#39315f' }}>What should change?</span><input value={goal} onChange={e=>setGoal(e.target.value)} placeholder="Awareness, revenue, leads…" style={{ border:'1px solid #dedaf0', background:'#fbfaff', borderRadius:13, padding:'12px 13px', color:'#17113a', fontSize:13 }} /></label></div>
            <div style={{ paddingTop:5 }}><div style={{ fontSize:12, fontWeight:800, color:'#39315f', marginBottom:10 }}>Channels to activate</div><div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>{platforms.map(p=>{const active=selectedPlatforms.includes(p);return <button key={p} onClick={()=>togglePlatform(p)} style={{ border:`1px solid ${active?'#6c2cff':'#ddd9ef'}`, background:active?'#f0eaff':'#fff', color:active?'#5c20d8':'#645d85', padding:'8px 11px', borderRadius:11, fontSize:11, fontWeight:800, display:'flex', alignItems:'center', gap:7 }}><span style={{ width:18,height:18,borderRadius:6,background:active?'#6c2cff':'#f0eff8',color:active?'#fff':'#756e95',display:'grid',placeItems:'center',fontSize:9 }}>{platformShort[p]}</span>{p}</button>})}</div></div>
            <div style={{ padding:'18px', borderRadius:17, background:'linear-gradient(135deg,#f6f3ff,#fff6fb)', border:'1px solid #e8e0fb' }}><div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:12 }}><span style={{ fontSize:12,fontWeight:800,color:'#39315f' }}>Weekly creative cadence</span><b style={{ color:'#6c2cff',fontSize:19 }}>{volume} <span style={{fontSize:10}}>POSTS / WEEK</span></b></div><input type="range" min={3} max={14} value={volume} onChange={e=>setVolume(Number(e.target.value))} style={{ width:'100%', accentColor:'#6c2cff' }}/><div style={{ display:'flex', justifyContent:'space-between', color:'#8b84a7',fontSize:10,fontWeight:700,marginTop:5 }}><span>Focused</span><span>Balanced</span><span>Always on</span></div></div>
            <button onClick={runAgent} disabled={running || !brand.trim() || !selectedPlatforms.length} className="btn-primary" style={{ width:'100%', padding:'16px 20px', fontSize:14, animation:running?'glowpulse 1.8s infinite':'none', opacity:(!brand.trim()||!selectedPlatforms.length)? .5:1 }}>{running ? 'Building your campaign system…' : 'Generate campaign system  →'}</button>
            {error && <div style={{ background:'#fff0f1', border:'1px solid #ffd4d8', borderRadius:13, padding:'10px 12px', color:'#bf3b4d', fontSize:12 }}>{error}</div>}
          </div>
        </section>
        <aside style={{ display:'grid', gap:18 }}>
          <section style={{ background:'#17113a', color:'#fff', padding:23, borderRadius:24, boxShadow:'0 20px 38px rgba(37,20,93,.18)' }}><div style={{ color:'#c6baff',letterSpacing:'.14em',fontWeight:900,fontSize:10,marginBottom:17 }}>FLO’S BUILD PLAN</div><div style={{ display:'grid',gap:8 }}>{steps.map(([number,title,detail],index)=>{const active=activeStep===index;const done=activeStep>index||!!result;return <div key={number} style={{ display:'grid',gridTemplateColumns:'30px 1fr',gap:10,padding:'10px 0',borderTop:index?'1px solid rgba(255,255,255,.09)':'none',opacity:active||done?1:.42 }}><span style={{color:done?'#85f4dc':active?'#ff9acb':'#9e94c4',fontWeight:900,fontSize:11 }}>{done?'✓':number}</span><div><div style={{ fontSize:12,fontWeight:800 }}>{title}</div><div style={{fontSize:10.5,lineHeight:1.5,color:'#b6aed0',marginTop:2}}>{detail}</div></div></div>})}</div></section>
          <section style={{ background:'rgba(255,255,255,.82)', border:'1px solid rgba(255,255,255,.9)', borderRadius:24, padding:21, boxShadow:'0 14px 30px rgba(39,26,101,.06)' }}><span className="section-label">LIVE BUILD LOG</span>{notes.length===0?<div style={{ color:'#827ba3',fontSize:12,lineHeight:1.65,padding:'4px 0 12px' }}>Your campaign activity will appear here as Flo creates it in real time.</div>:<div style={{ display:'grid',gap:10,maxHeight:260,overflowY:'auto' }}>{notes.map((note,index)=><div key={index} style={{ padding:'10px 0',borderTop:index?'1px solid #edeaf8':'none' }}><div style={{display:'flex',gap:7,alignItems:'center'}}><span style={{width:7,height:7,borderRadius:'50%',background:note.tone==='success'?'#0bbf9a':note.tone==='danger'?'#ef6071':'#8d55ff'}}/><b style={{fontSize:11.5,color:'#39315f'}}>{note.title}</b></div><p style={{fontSize:11,color:'#746e95',lineHeight:1.55,margin:'4px 0 0 14px'}}>{note.body}</p></div>)}<div ref={liveRef}/></div>}</section>
          {result && <section style={{ padding:21,borderRadius:24,background:'linear-gradient(135deg,#e7fff7,#eff0ff)',border:'1px solid #ccebdd' }}><div style={{ color:'#07735e',fontWeight:900,fontSize:10,letterSpacing:'.14em' }}>CAMPAIGN READY</div><div style={{fontSize:28,fontWeight:900,letterSpacing:'-.06em',color:'#17113a',margin:'5px 0'}}>{result.saved} ideas in review</div><div style={{fontSize:11.5,color:'#5e6880',lineHeight:1.55,marginBottom:13}}>The campaign is now waiting in your review queue.</div><button onClick={()=>navigate('/pipeline')} style={{width:'100%',padding:'10px',borderRadius:12,border:0,background:'#17113a',color:'#fff',fontWeight:800,fontSize:12}}>Open review queue →</button></section>}
        </aside>
      </div>
    </div>
  </Layout>
}
