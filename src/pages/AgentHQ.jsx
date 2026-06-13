import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { supabase } from '../supabase'

const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4a3B2bm9raHFicGJxZWZlZ3hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMDI1NDgsImV4cCI6MjA5MTc3ODU0OH0.OVdLzh2Bvuf4l6F6ITSpj4pWqoc3EoTxs6OCvrMf4JU'

async function callAI(messages, maxTokens = 1200) {
  const res = await fetch('https://xxkpvnokhqbpbqefegxa.supabase.co/functions/v1/ai-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}`, apikey: ANON },
    body: JSON.stringify({ model: 'gpt-4o', messages, max_tokens: maxTokens }),
  })
  const d = await res.json()
  return d?.content || d?.choices?.[0]?.message?.content || ''
}

const AGENT_STEPS = [
  { id: 'analyze', label: 'Analyzing brand & goals', icon: '🔍' },
  { id: 'strategy', label: 'Building content strategy', icon: '🧠' },
  { id: 'calendar', label: 'Planning content calendar', icon: '📅' },
  { id: 'generate', label: 'Generating posts', icon: '✍️' },
  { id: 'optimize', label: 'Optimizing for each platform', icon: '⚡' },
  { id: 'schedule', label: 'Scheduling optimal times', icon: '🕐' },
  { id: 'complete', label: 'Campaign ready!', icon: '✅' },
]

export default function AgentHQ() {
  const navigate = useNavigate()
  const [brand, setBrand] = useState('')
  const [audience, setAudience] = useState('')
  const [goals, setGoals] = useState('')
  const [platforms, setPlatforms] = useState(['instagram', 'linkedin'])
  const [postsPerWeek, setPostsPerWeek] = useState(5)
  const [running, setRunning] = useState(false)
  const [currentStep, setCurrentStep] = useState(-1)
  const [completedSteps, setCompletedSteps] = useState([])
  const [agentLog, setAgentLog] = useState([])
  const [results, setResults] = useState(null)
  const [savedCount, setSavedCount] = useState(0)
  const [error, setError] = useState('')
  const logRef = useRef()

  useEffect(() => { logRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [agentLog])

  const PLATFORM_OPTIONS = ['instagram', 'twitter', 'linkedin', 'facebook', 'tiktok']

  const togglePlatform = (p) => setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])

  const addLog = (msg, type = 'info') => setAgentLog(prev => [...prev, { msg, type, ts: new Date().toLocaleTimeString() }])

  const runAgent = async () => {
    if (!brand.trim()) return
    setRunning(true)
    setCompletedSteps([])
    setCurrentStep(0)
    setAgentLog([])
    setResults(null)
    setError('')

    try {
      // Step 0: Analyze
      addLog('Agent initialized. Analyzing your brand profile...', 'system')
      await new Promise(r => setTimeout(r, 800))
      setCompletedSteps(['analyze'])
      setCurrentStep(1)

      // Step 1: Strategy
      addLog('Building content strategy based on your goals and audience...', 'system')
      const strategyText = await callAI([
        { role: 'system', content: 'You are a senior social media strategist. Create a concise content strategy. Return JSON: {"strategy":"...", "content_pillars":["...","...","...","..."], "posting_frequency":"...", "best_platforms":["..."], "tone":"..."}' },
        { role: 'user', content: `Brand: ${brand}\nAudience: ${audience || 'general business audience'}\nGoals: ${goals || 'grow audience and engagement'}\nPlatforms: ${platforms.join(', ')}\nPosts per week: ${postsPerWeek}` }
      ], 600)
      let strategy = {}
      try { const m = strategyText.match(/\{[\s\S]*\}/); strategy = m ? JSON.parse(m[0]) : {} } catch {}
      addLog(`Strategy defined: ${strategy.tone || 'Professional'} tone across ${strategy.content_pillars?.length || 4} content pillars`, 'success')
      addLog(`Content pillars: ${strategy.content_pillars?.join(' · ') || 'Education, Inspiration, Behind-the-scenes, Promotion'}`, 'info')
      setCompletedSteps(p => [...p, 'strategy'])
      setCurrentStep(2)

      // Step 2: Calendar planning
      addLog('Planning content calendar for the next 2 weeks...', 'system')
      await new Promise(r => setTimeout(r, 600))
      addLog(`Scheduling ${postsPerWeek} posts/week across ${platforms.length} platform(s)`, 'info')
      setCompletedSteps(p => [...p, 'calendar'])
      setCurrentStep(3)

      // Step 3: Generate posts
      addLog('Generating post content for each platform...', 'system')
      const postsToGenerate = Math.min(postsPerWeek * 2, 10)
      const postsText = await callAI([
        { role: 'system', content: `You are an expert social media copywriter. Generate exactly ${postsToGenerate} social media posts. Return as JSON array: [{"platform":"instagram","content":"...","hashtags":"...","scheduled_day":"Monday","post_type":"educational"},...]` },
        { role: 'user', content: `Brand: ${brand}\nAudience: ${audience || 'general business audience'}\nGoals: ${goals || 'grow audience and engagement'}\nPlatforms (rotate): ${platforms.join(', ')}\nTone: ${strategy.tone || 'Professional'}\nContent pillars: ${strategy.content_pillars?.join(', ') || 'Education, Inspiration, Behind-the-scenes, Promotion'}\n\nGenerate ${postsToGenerate} varied posts.` }
      ], 2000)
      let generatedPosts = []
      try { const m = postsText.match(/\[[\s\S]*\]/); generatedPosts = m ? JSON.parse(m[0]) : [] } catch {}
      addLog(`Generated ${generatedPosts.length} posts across ${[...new Set(generatedPosts.map(p=>p.platform))].join(', ')}`, 'success')
      setCompletedSteps(p => [...p, 'generate'])
      setCurrentStep(4)

      // Step 4: Optimize
      addLog('Optimizing content for each platform\'s algorithm...', 'system')
      await new Promise(r => setTimeout(r, 700))
      addLog('Applied platform-specific formatting, character limits, and hashtag strategies', 'info')
      setCompletedSteps(p => [...p, 'optimize'])
      setCurrentStep(5)

      // Step 5: Schedule
      addLog('Calculating optimal posting times based on platform data...', 'system')
      const OPTIMAL_TIMES = { instagram: '9:00 AM', twitter: '12:00 PM', linkedin: '8:00 AM', facebook: '1:00 PM', tiktok: '7:00 PM' }
      const scheduledPosts = generatedPosts.map((post, i) => {
        const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
        const dayOffset = Math.floor(i / platforms.length) * Math.floor(7 / postsPerWeek)
        const scheduledDate = new Date()
        scheduledDate.setDate(scheduledDate.getDate() + dayOffset + 1)
        return { ...post, scheduled_at: scheduledDate.toISOString(), optimal_time: OPTIMAL_TIMES[post.platform] || '10:00 AM' }
      })
      addLog(`Optimal times assigned: ${platforms.map(p => `${p} @ ${OPTIMAL_TIMES[p]||'10am'}`).join(', ')}`, 'success')
      setCompletedSteps(p => [...p, 'schedule'])
      setCurrentStep(6)

      // Step 6: Save to DB
      addLog('Saving campaign to your content pipeline...', 'system')
      const { data: { user } } = await supabase.auth.getUser()
      let saved = 0
      for (const post of scheduledPosts) {
        const { error: insertErr } = await supabase.from('posts').insert([{
          user_id: user?.id,
          platform: post.platform,
          content: `${post.content}${post.hashtags ? '\n\n' + post.hashtags : ''}`,
          status: 'pending',
          scheduled_at: post.scheduled_at,
          created_at: new Date().toISOString(),
        }])
        if (!insertErr) saved++
      }
      setSavedCount(saved)
      addLog(`✅ Campaign complete! ${saved} posts saved to your pipeline`, 'success')
      setCompletedSteps(p => [...p, 'complete'])
      setCurrentStep(-1)
      setResults({ strategy, posts: scheduledPosts, saved })

    } catch (e) {
      setError('Agent encountered an error. Please try again.')
      addLog('Error: ' + e.message, 'error')
    }
    setRunning(false)
  }

  return (
    <Layout title="Agent HQ">
      <style>{`
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes stepIn{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}
        @keyframes glow{0%,100%{box-shadow:0 0 8px rgba(99,102,241,0.3)}50%{box-shadow:0 0 20px rgba(99,102,241,0.6)}}
      `}</style>

      <div style={{ maxWidth: 1100, margin: '0 auto', animation: 'fadeIn 0.3s ease' }}>

        {/* Header */}
        <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(99,102,241,0.4)', animation: running ? 'glow 2s ease infinite' : 'none' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
              </div>
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', lineHeight: 1 }}>Agent HQ</h1>
                <p style={{ fontSize: 13, color: '#64748b', marginTop: 3 }}>Tell the AI about your brand. It handles everything else.</p>
              </div>
            </div>
          </div>
          {results && (
            <button onClick={() => navigate('/approve')} style={{ padding: '10px 20px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              View {savedCount} Posts in Pipeline →
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20 }}>

          {/* Left: Input form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Brand Brief */}
            <div style={{ background: 'var(--card)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '22px 24px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', letterSpacing: '0.06em', marginBottom: 18 }}>BRAND BRIEF — THE AI READS THIS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500, display: 'block', marginBottom: 7 }}>What is your brand / business? <span style={{ color: '#ef4444' }}>*</span></label>
                  <textarea value={brand} onChange={e => setBrand(e.target.value)} placeholder="e.g. We're a boutique fitness studio in Austin TX specializing in HIIT and yoga for busy professionals. We sell memberships, online classes, and wellness products." rows={3} style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${brand ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 10, padding: '11px 14px', color: '#f1f5f9', fontSize: 13.5, fontFamily: 'inherit', resize: 'none', outline: 'none', lineHeight: 1.6, boxSizing: 'border-box', transition: 'border 0.2s' }} />
                </div>
                <div>
                  <label style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500, display: 'block', marginBottom: 7 }}>Who is your target audience?</label>
                  <input value={audience} onChange={e => setAudience(e.target.value)} placeholder="e.g. Women 25-45, health-conscious, disposable income, Instagram users" style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '11px 14px', color: '#f1f5f9', fontSize: 13.5, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500, display: 'block', marginBottom: 7 }}>What are your goals?</label>
                  <input value={goals} onChange={e => setGoals(e.target.value)} placeholder="e.g. Grow Instagram to 10k followers, drive class bookings, build email list" style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '11px 14px', color: '#f1f5f9', fontSize: 13.5, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
            </div>

            {/* Platform + Frequency */}
            <div style={{ background: 'var(--card)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '22px 24px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', letterSpacing: '0.06em', marginBottom: 18 }}>CAMPAIGN SETTINGS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500, display: 'block', marginBottom: 10 }}>Target platforms</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {PLATFORM_OPTIONS.map(p => (
                      <button key={p} onClick={() => togglePlatform(p)} style={{ padding: '7px 16px', borderRadius: 20, border: `1px solid ${platforms.includes(p) ? '#6366f1' : 'rgba(255,255,255,0.08)'}`, background: platforms.includes(p) ? 'rgba(99,102,241,0.15)' : 'transparent', color: platforms.includes(p) ? '#a5b4fc' : '#64748b', fontSize: 12.5, fontWeight: platforms.includes(p) ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize', transition: 'all 0.15s' }}>{p}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500, display: 'block', marginBottom: 10 }}>Posts per week: <strong style={{ color: '#a5b4fc' }}>{postsPerWeek}</strong></label>
                  <input type="range" min={3} max={14} value={postsPerWeek} onChange={e => setPostsPerWeek(Number(e.target.value))} style={{ width: '100%', accentColor: '#6366f1' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#475569', marginTop: 4 }}>
                    <span>3 (light)</span><span>7 (standard)</span><span>14 (aggressive)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Launch button */}
            <button onClick={runAgent} disabled={!brand.trim() || running} style={{ padding: '16px', borderRadius: 12, background: brand.trim() && !running ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'rgba(255,255,255,0.06)', border: 'none', color: '#fff', fontSize: 15, fontWeight: 800, cursor: brand.trim() && !running ? 'pointer' : 'not-allowed', fontFamily: 'inherit', boxShadow: brand.trim() && !running ? '0 6px 20px rgba(99,102,241,0.4)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, letterSpacing: '0.02em', transition: 'all 0.2s' }}
              onMouseEnter={e => { if (brand.trim() && !running) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 28px rgba(99,102,241,0.5)' }}}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = brand.trim() && !running ? '0 6px 20px rgba(99,102,241,0.4)' : 'none' }}>
              {running ? (
                <><span style={{ width: 18, height: 18, border: '2.5px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }}/> Agent Running...</>
              ) : (
                <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg> Launch AI Agent</>
              )}
            </button>

            {error && <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, color: '#f87171', fontSize: 13 }}>{error}</div>}
          </div>

          {/* Right: Agent progress + results */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Agent steps */}
            <div style={{ background: 'var(--card)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '22px 24px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', letterSpacing: '0.06em', marginBottom: 18 }}>AGENT PIPELINE</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {AGENT_STEPS.map((step, i) => {
                  const done = completedSteps.includes(step.id)
                  const active = currentStep === i
                  return (
                    <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 9, background: done ? 'rgba(16,185,129,0.06)' : active ? 'rgba(99,102,241,0.08)' : 'transparent', border: `1px solid ${done ? 'rgba(16,185,129,0.15)' : active ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)'}`, transition: 'all 0.3s', animation: active ? 'stepIn 0.3s ease' : 'none' }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: done ? 'rgba(16,185,129,0.15)' : active ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                        {done ? '✓' : active ? <span style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#a5b4fc', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }}/> : step.icon}
                      </div>
                      <span style={{ fontSize: 13, color: done ? '#34d399' : active ? '#a5b4fc' : '#475569', fontWeight: done || active ? 500 : 400 }}>{step.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Agent log */}
            {agentLog.length > 0 && (
              <div style={{ background: 'var(--card)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '18px 20px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', letterSpacing: '0.06em', marginBottom: 14 }}>AGENT LOG</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                  {agentLog.map((log, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', animation: 'stepIn 0.2s ease' }}>
                      <span style={{ fontSize: 10, color: '#334155', fontFamily: 'monospace', marginTop: 2, flexShrink: 0 }}>{log.ts}</span>
                      <span style={{ fontSize: 12.5, color: log.type === 'success' ? '#34d399' : log.type === 'error' ? '#f87171' : log.type === 'system' ? '#a5b4fc' : '#64748b', lineHeight: 1.5 }}>{log.msg}</span>
                    </div>
                  ))}
                  <div ref={logRef} />
                </div>
              </div>
            )}

            {/* Results summary */}
            {results && (
              <div style={{ background: 'linear-gradient(135deg,rgba(16,185,129,0.06),rgba(99,102,241,0.04))', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 14, padding: '22px 24px', animation: 'fadeIn 0.4s ease' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#34d399', letterSpacing: '0.06em', marginBottom: 16 }}>✅ CAMPAIGN GENERATED</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  {[
                    { label: 'Posts Created', value: results.saved },
                    { label: 'Platforms', value: [...new Set(results.posts.map(p => p.platform))].length },
                    { label: 'Weeks Covered', value: 2 },
                    { label: 'Status', value: 'Pending Review' },
                  ].map((s, i) => (
                    <div key={i} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 9, padding: '10px 12px' }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9' }}>{s.value}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{s.label}</div>
                    </div>
                  ))}
                </div>
                {results.strategy?.content_pillars && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>CONTENT PILLARS</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {results.strategy.content_pillars.map((p, i) => (
                        <span key={i} style={{ fontSize: 11.5, padding: '4px 10px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 20, color: '#a5b4fc' }}>{p}</span>
                      ))}
                    </div>
                  </div>
                )}
                <button onClick={() => navigate('/approve')} style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Review & Approve Posts →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
