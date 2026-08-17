import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { supabase } from '../supabase'

const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyZWYiOiJ4eGtwdm5va2hxYnBicWVmZWd4YSIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzc2MjAyNTQ4LCJleHAiOjIwOTc3MDI1NDh9.OVdLzh2Bvuf4l6F6ITSpj4pWqoc3EoTxs6OCvrMf4JU'
const platforms = ['instagram', 'linkedin', 'facebook', 'tiktok', 'twitter']
const platformLabel = { instagram: 'Instagram', linkedin: 'LinkedIn', facebook: 'Facebook', tiktok: 'TikTok', twitter: 'X / Twitter' }
const optimalTimes = { instagram: '09:00', linkedin: '08:00', facebook: '13:00', tiktok: '19:00', twitter: '12:00' }

async function callAI(messages, maxTokens = 1600) {
  const res = await fetch('https://xxkpvnokhqbpbqefegxa.supabase.co/functions/v1/ai-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}`, apikey: ANON },
    body: JSON.stringify({ model: 'gpt-4o', messages, max_tokens: maxTokens })
  })
  const data = await res.json()
  return data?.content || data?.choices?.[0]?.message?.content || ''
}

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
  const [quickTopic, setQuickTopic] = useState('')
  const [quickPlatform, setQuickPlatform] = useState('instagram')
  const [quickRunning, setQuickRunning] = useState(false)
  const [quickSuccess, setQuickSuccess] = useState('')
  const briefRef = useRef(null)
  const liveRef = useRef(null)

  useEffect(() => liveRef.current?.scrollIntoView({ behavior: 'smooth' }), [notes])
  const addNote = (title, body, tone = 'neutral') => setNotes(previous => [...previous, { title, body, tone }])
  const togglePlatform = platform => setSelectedPlatforms(previous => previous.includes(platform) ? previous.filter(x => x !== platform) : [...previous, platform])

  const runAgent = async () => {
    const currentBrand = brand.trim() || 'A premium digital product built for ambitious people'
    const activePlatforms = selectedPlatforms.length ? selectedPlatforms : ['instagram', 'linkedin']
    if (!brand.trim()) setBrand(currentBrand)
    setRunning(true); setActiveStep(0); setNotes([]); setResult(null); setError('')
    try {
      addNote('Brief decoded', 'Flo is translating your market signal into a creative thesis.', 'violet')
      const strategyText = await callAI([
        { role: 'system', content: 'You are a senior social media strategist. Return concise valid JSON only: {"tone":"...","pillars":["...","...","...","..."],"strategy":"..."}.' },
        { role: 'user', content: `Brand: ${currentBrand}\nAudience: ${audience || 'broad prospective customers'}\nGoal: ${goal || 'grow awareness and conversion'}\nPlatforms: ${activePlatforms.join(', ')}` }
      ], 650)
      let strategy = { tone: 'Clear, confident, and human', pillars: ['Useful point of view', 'Customer proof', 'Practical education', 'Offer activation'], strategy: 'Build recognition through specific opinions, useful proof, and a clear next step.' }
      try { const match = strategyText.match(/\{[\s\S]*\}/); if (match) strategy = { ...strategy, ...JSON.parse(match[0]) } } catch {}
      addNote('Creative thesis set', `${strategy.tone} across ${strategy.pillars.length} content pillars.`, 'success')
      setActiveStep(1)
      const total = Math.min(volume * 2, 10)
      addNote('Concepts in production', `Writing ${total} native ideas across your selected channels.`, 'violet')
      const postText = await callAI([
        { role: 'system', content: `Generate exactly ${total} varied social posts. Return ONLY valid JSON array: [{"platform":"instagram","content":"...","hashtags":"#...","post_type":"education"}].` },
        { role: 'user', content: `Brand: ${currentBrand}\nAudience: ${audience || 'general customers'}\nGoal: ${goal || 'grow visibility'}\nRotate platforms: ${activePlatforms.join(', ')}\nTone: ${strategy.tone}\nPillars: ${strategy.pillars.join(', ')}` }
      ], 3200)
      let generated = []
      try { const clean = postText.replace(/```json|```/g, '').trim(); const match = clean.match(/\[[\s\S]*\]/); generated = JSON.parse(match ? match[0] : clean) } catch {}
      if (!generated.length) generated = Array.from({ length: total }, (_, index) => ({ platform: activePlatforms[index % activePlatforms.length], content: `${currentBrand} helps ambitious people move with more clarity, confidence, and momentum. Discover the smarter way forward.`, hashtags: '#Growth #Marketing #FloStudio', post_type: 'brand' }))
      setActiveStep(2)
      addNote('Concept suite complete', `${generated.length} new ideas are ready to be reviewed.`, 'success')
      const now = new Date()
      const scheduled = generated.map((post, index) => { const date = new Date(now); date.setDate(now.getDate() + index + 1); date.setHours(Number((optimalTimes[post.platform] || '10:00').split(':')[0]), 0, 0, 0); return { ...post, scheduled_at: date.toISOString() } })
      setActiveStep(3)
      addNote('Review queue populated', 'Sequencing new creative at each channel’s recommended window.', 'violet')
      const { data: { user } } = await supabase.auth.getUser()
      let saved = 0
      for (const post of scheduled) {
        const { error: insertError } = await supabase.from('campaign_posts').insert([{ user_id: user?.id || null, platform: post.platform, content: `${post.content}${post.hashtags ? `\n\n${post.hashtags}` : ''}`, status: 'pending', scheduled_at: post.scheduled_at, created_at: new Date().toISOString() }])
        if (insertError) throw insertError
        saved += 1
      }
      setResult({ strategy, posts: scheduled, saved })
      addNote('Campaign ready', `${saved} draft posts are waiting in Review Queue.`, 'success')
      setActiveStep(-1)
    } catch (err) {
      setError(err?.message || 'The campaign did not save. Please try again.')
      addNote('Campaign paused', err?.message || 'A save operation did not complete.', 'danger')
      setActiveStep(-1)
    } finally { setRunning(false) }
  }

  const runQuickPost = async () => {
    const topic = quickTopic.trim() || 'A timely update from our brand'
    setQuickRunning(true); setQuickSuccess('')
    try {
      const response = await callAI([
        { role: 'system', content: 'Return valid JSON only: {"content":"...","hashtags":"#..."}' },
        { role: 'user', content: `Write a high-converting ${quickPlatform} post about: ${topic}.` }
      ], 420)
      let post = { content: `A timely update: ${topic}. Discover the next way to move your brand forward.`, hashtags: '#FloStudio #Growth' }
      try { const match = response.match(/\{[\s\S]*\}/); if (match) post = JSON.parse(match[0]) } catch {}
      const { data: { user } } = await supabase.auth.getUser()
      const { error: insertError } = await supabase.from('campaign_posts').insert([{ user_id: user?.id || null, platform: quickPlatform, content: `${post.content}\n\n${post.hashtags || '#FloStudio'}`, status: 'pending', scheduled_at: new Date().toISOString(), created_at: new Date().toISOString() }])
      if (insertError) throw insertError
      setQuickTopic(''); setQuickSuccess(`${platformLabel[quickPlatform]} draft saved to Review Queue.`)
    } catch (err) { setError(`Could not create the post: ${err?.message || 'please try again.'}`) }
    finally { setQuickRunning(false) }
  }

  const stages = [
    ['01', 'Frame the moment', 'Offer, audience, outcome'],
    ['02', 'Find the angle', 'Message and content pillars'],
    ['03', 'Create the work', 'Native channel concepts'],
    ['04', 'Ship deliberately', 'Review and schedule']
  ]

  return <Layout title="Agent Studio">
    <style>{`@keyframes agentEnter{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}} @media(max-width:1040px){.agent-grid{grid-template-columns:1fr!important}.quick-grid{grid-template-columns:1fr!important}.hero-tools{position:static!important;margin-top:28px;justify-content:flex-start!important}.agent-hero{padding:28px!important}.brief-grid{grid-template-columns:1fr!important}}`}</style>
    <div style={{ maxWidth: 1360, margin: '0 auto', animation: 'agentEnter .42s var(--ease-out)' }}>
      <section className="studio-dark agent-hero" style={{ position: 'relative', overflow: 'hidden', minHeight: 358, padding: '40px 44px', marginBottom: 20 }}>
        <div style={{ position: 'absolute', width: 420, height: 420, borderRadius: '50%', right: -145, top: -235, background: 'radial-gradient(circle at center,#ff845f 0%,#ff5b35 24%,rgba(255,91,53,0) 68%)', opacity: .92 }} />
        <div style={{ position: 'absolute', width: 265, height: 265, borderRadius: 48, right: 84, bottom: -122, background: 'linear-gradient(135deg,#d7f267,#73ddca)', transform: 'rotate(28deg)', opacity: .88 }} />
        <div style={{ position: 'relative', maxWidth: 790 }}>
          <div className="studio-kicker" style={{ color: '#d7f267', marginBottom: 18 }}>FloStudio / Campaign direction</div>
          <h1 className="studio-display" style={{ maxWidth: 720 }}>Build the work that <span className="studio-serif" style={{ color: '#ffd3c7' }}>moves the market.</span></h1>
          <p style={{ maxWidth: 580, marginTop: 20, color: 'rgba(255,250,244,.73)', fontSize: 14, lineHeight: 1.75 }}>Flo is your creative operator: one focused brief becomes an organized campaign, native creative concepts, and a review-ready publishing plan.</p>
          <div className="hero-tools" style={{ position: 'absolute', right: -370, bottom: 1, display: 'flex', gap: 8 }}>
            <button onClick={() => briefRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })} className="studio-chip" style={{ background: 'rgba(255,255,255,.12)', borderColor: 'rgba(255,255,255,.22)', color: '#fff' }}>01 Brief</button>
            <button onClick={runAgent} className="studio-chip" style={{ background: '#d7f267', color: '#16131d', borderColor: '#d7f267' }}>02 Generate</button>
            <button onClick={() => navigate('/pipeline')} className="studio-chip" style={{ background: 'rgba(255,255,255,.12)', borderColor: 'rgba(255,255,255,.22)', color: '#fff' }}>03 Review</button>
          </div>
        </div>
      </section>

      <section className="studio-panel" style={{ display: 'grid', gridTemplateColumns: '184px minmax(0,1fr)', minHeight: 164, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ background: '#e9e4dc', padding: '24px 22px', borderRight: '1px solid var(--line)' }}>
          <div className="studio-kicker" style={{ marginBottom: 12 }}>Flash build</div>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.04em', lineHeight: 1.13 }}>Single post,<br/>real momentum.</div>
        </div>
        <div style={{ padding: 22 }}>
          <div className="quick-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 190px auto', gap: 10, alignItems: 'center' }}>
            <input className="studio-input" value={quickTopic} onChange={e => setQuickTopic(e.target.value)} placeholder="Give Flo a thought, announcement, offer, or idea…" />
            <select className="studio-input" value={quickPlatform} onChange={e => setQuickPlatform(e.target.value)}>{platforms.map(platform => <option key={platform} value={platform}>{platformLabel[platform]}</option>)}</select>
            <button onClick={runQuickPost} disabled={quickRunning} className="studio-button studio-button--coral">{quickRunning ? 'Writing…' : 'Make post →'}</button>
          </div>
          <div style={{ marginTop: 15, color: quickSuccess ? '#087963' : '#7b736c', fontSize: 11.5, fontWeight: 650 }}>{quickSuccess || 'Creates one editable pending post in your Review Queue. Nothing publishes without your approval.'}</div>
        </div>
      </section>

      <div className="agent-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.55fr) minmax(320px,.72fr)', gap: 20, alignItems: 'start' }}>
        <section ref={briefRef} className="studio-panel" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '25px 28px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div><span className="studio-kicker">Campaign brief</span><h2 style={{ fontSize: 25, letterSpacing: '-.055em', marginTop: 7 }}>Give your creative a point of view.</h2></div>
            <span className="studio-chip">{selectedPlatforms.length} channels live</span>
          </div>
          <div className="brief-grid" style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 0, marginTop: 25, borderTop: '1px solid var(--line)' }}>
            <div style={{ padding: 22, borderRight: '1px solid var(--line)', background: '#fbf9f5' }}>{stages.map(([number, title, detail], index) => <div key={number} style={{ padding: '12px 0', opacity: activeStep === index || activeStep > index || (activeStep === -1 && index === 0) ? 1 : .42, borderBottom: index < stages.length - 1 ? '1px solid var(--line)' : 'none' }}><div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: index === activeStep ? 'var(--coral)' : 'var(--ink-soft)' }}>{number}</div><div style={{ fontSize: 11.5, fontWeight: 800, marginTop: 3 }}>{title}</div><div style={{ fontSize: 10, color: 'var(--ink-soft)', lineHeight: 1.4, marginTop: 2 }}>{detail}</div></div>)}</div>
            <div style={{ padding: 25, display: 'grid', gap: 20 }}>
              <label style={{ display: 'grid', gap: 8 }}><span style={{ fontSize: 12, fontWeight: 800 }}>What are you building momentum for?</span><textarea className="studio-input" value={brand} onChange={e => setBrand(e.target.value)} rows={4} placeholder="Describe the product, launch, offer, or market moment in your own words." style={{ resize: 'vertical', lineHeight: 1.6 }} /></label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><label style={{ display: 'grid', gap: 8 }}><span style={{ fontSize: 12, fontWeight: 800 }}>Who needs to care?</span><input className="studio-input" value={audience} onChange={e => setAudience(e.target.value)} placeholder="Audience and context" /></label><label style={{ display: 'grid', gap: 8 }}><span style={{ fontSize: 12, fontWeight: 800 }}>What should change?</span><input className="studio-input" value={goal} onChange={e => setGoal(e.target.value)} placeholder="Awareness, leads, revenue…" /></label></div>
              <div><div style={{ fontSize: 12, fontWeight: 800, marginBottom: 9 }}>Select the places this needs to land</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>{platforms.map(platform => <button key={platform} onClick={() => togglePlatform(platform)} className={`studio-chip ${selectedPlatforms.includes(platform) ? 'active' : ''}`}>{platformLabel[platform]}</button>)}</div></div>
              <div style={{ padding: 16, background: '#f1effd', borderRadius: 14, border: '1px solid #e0dcff' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}><span style={{ fontSize: 12, fontWeight: 800 }}>Creative frequency</span><span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--violet)', fontSize: 12 }}>{volume} / week</span></div><input type="range" min={3} max={14} value={volume} onChange={e => setVolume(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--violet)' }} /></div>
              <button onClick={runAgent} disabled={running} className="studio-button" style={{ width: '100%', padding: 15 }}>{running ? 'Flo is building your campaign…' : 'Build complete campaign →'}</button>
              {error && <div style={{ background: '#fff0ec', color: '#b5391e', padding: '11px 12px', borderRadius: 11, fontSize: 11.5, fontWeight: 700 }}>{error}</div>}
            </div>
          </div>
        </section>

        <aside style={{ display: 'grid', gap: 20 }}>
          <section className="studio-dark" style={{ padding: 24, minHeight: 306 }}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}><span className="studio-kicker" style={{ color: '#d7f267' }}>Creative run</span><span className="status-dot" /></div>{notes.length === 0 ? <div><div style={{ fontSize: 25, letterSpacing: '-.06em', fontWeight: 800, maxWidth: 260 }}>Your next campaign starts with a signal.</div><p style={{ fontSize: 12, color: 'rgba(255,250,244,.62)', lineHeight: 1.65, marginTop: 14 }}>Once Flo starts, this panel becomes a live production ledger—not a generic loading screen.</p></div> : <div style={{ display: 'grid', gap: 11, maxHeight: 270, overflowY: 'auto' }}>{notes.map((note, index) => <div key={index} style={{ borderTop: index ? '1px solid rgba(255,255,255,.12)' : 'none', paddingTop: index ? 11 : 0 }}><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ width: 6, height: 6, borderRadius: 99, background: note.tone === 'success' ? '#d7f267' : note.tone === 'danger' ? '#ff8466' : '#73ddca' }} /><b style={{ fontSize: 11.5 }}>{note.title}</b></div><p style={{ fontSize: 10.5, color: 'rgba(255,250,244,.63)', lineHeight: 1.55, marginTop: 4 }}>{note.body}</p></div>)}<div ref={liveRef} /></div>}</section>
          <section className="studio-panel" style={{ padding: 22 }}><span className="studio-kicker">Review state</span>{result ? <><div style={{ fontSize: 40, letterSpacing: '-.08em', fontWeight: 800, marginTop: 8 }}>{result.saved}</div><p style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.55, marginTop: 3 }}>fresh concepts are waiting for a human decision.</p><button onClick={() => navigate('/pipeline')} className="studio-button studio-button--soft" style={{ width: '100%', marginTop: 16 }}>Open Review Queue →</button></> : <><div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.035em', marginTop: 8 }}>Nothing gets published on autopilot.</div><p style={{ fontSize: 11.5, color: 'var(--ink-soft)', lineHeight: 1.55, marginTop: 8 }}>Every post lands in review first, so you can improve, approve, or hold it.</p></>}</section>
        </aside>
      </div>
    </div>
  </Layout>
}
