import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'

const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4a3B2bm9raHFicGJxZWZlZ3hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMDI1NDgsImV4cCI6MjA5MTc3ODU0OH0.OVdLzh2Bvuf4l6F6ITSpj4pWqoc3EoTxs6OCvrMf4JU'

const NAV = [
  { path: '/', label: 'Dashboard', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> },
  { path: '/compose', label: 'AI Compose', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> },
  { path: '/approve', label: 'Approve', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> },
  { path: '/calendar', label: 'Calendar', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
  { path: '/images', label: 'Image Studio', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> },
  { path: '/accounts', label: 'Accounts', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg> },
]

const AVATAR_COLORS = ['#6366f1','#8b5cf6','#ec4899','#06b6d4','#10b981','#f59e0b']
function stringToColor(str) {
  if (!str) return AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function AgentPanel({ onClose }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "👋 I'm **Flo**, your AI social media agent. I can generate content calendars, write posts, analyze your strategy, and more. What would you like to do?" }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef()

  const QUICK_PROMPTS = [
    "Generate a week of posts for Instagram",
    "Best time to post on LinkedIn?",
    "Write 5 post ideas for my brand",
    "Analyze my content strategy",
  ]

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = async (text) => {
    const msg = text || input.trim()
    if (!msg) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setLoading(true)
    try {
      const res = await fetch('https://xxkpvnokhqbpbqefegxa.supabase.co/functions/v1/ai-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}`, apikey: ANON },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: 'You are Flo, an expert AI social media strategist and content creator. Help users create engaging content, plan their social media calendar, and grow their audience. Be concise, actionable, and use emojis sparingly. Format with markdown when helpful.' },
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: msg }
          ],
          max_tokens: 800,
        }),
      })
      const data = await res.json()
      const reply = data?.content || data?.choices?.[0]?.message?.content || 'Sorry, I had trouble responding. Please try again.'
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Connection error. Please try again.' }])
    }
    setLoading(false)
  }

  const renderContent = (content) => content
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code style="background:rgba(99,102,241,0.15);padding:1px 5px;border-radius:4px;font-size:12px">$1</code>')
    .replace(/\n/g, '<br/>')

  return (
    <div style={{ position:'fixed', right:0, top:0, bottom:0, width:380, background:'linear-gradient(180deg,#0a0f1e 0%,#030712 100%)', borderLeft:'1px solid rgba(99,102,241,0.2)', display:'flex', flexDirection:'column', zIndex:1000, boxShadow:'-20px 0 60px rgba(0,0,0,0.5)', animation:'slideInRight 0.3s ease' }}>
      <style>{`@keyframes slideInRight{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
      <div style={{ padding:'16px 20px', borderBottom:'1px solid rgba(99,102,241,0.15)', display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ width:38, height:38, borderRadius:'50%', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 16px rgba(99,102,241,0.4)', flexShrink:0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, fontSize:14, color:'#f1f5f9' }}>Flo AI Agent</div>
          <div style={{ fontSize:11, color:'#10b981', display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:'#10b981', display:'inline-block' }}/>
            Online · GPT-4o powered
          </div>
        </div>
        <button onClick={onClose} style={{ background:'none', border:'none', color:'#64748b', cursor:'pointer', padding:4 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'16px 16px 8px', display:'flex', flexDirection:'column', gap:12 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start', flexDirection:msg.role==='user'?'row-reverse':'row' }}>
            {msg.role==='assistant' && (
              <div style={{ width:28, height:28, borderRadius:'50%', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:2 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
              </div>
            )}
            <div style={{ maxWidth:'82%', padding:'10px 14px', borderRadius:msg.role==='user'?'14px 14px 4px 14px':'4px 14px 14px 14px', background:msg.role==='user'?'linear-gradient(135deg,#6366f1,#8b5cf6)':'rgba(255,255,255,0.04)', border:msg.role==='user'?'none':'1px solid rgba(255,255,255,0.07)', fontSize:13, lineHeight:1.6, color:'#f1f5f9' }} dangerouslySetInnerHTML={{ __html: renderContent(msg.content) }} />
          </div>
        ))}
        {loading && (
          <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
            <div style={{ width:28, height:28, borderRadius:'50%', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
            </div>
            <div style={{ padding:'12px 16px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:'4px 14px 14px 14px', display:'flex', gap:5, alignItems:'center' }}>
              {[0,1,2].map(i => <span key={i} style={{ width:7, height:7, borderRadius:'50%', background:'#6366f1', display:'inline-block', animation:`pulse 1.2s ease ${i*0.2}s infinite` }}/>)}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {messages.length <= 1 && (
        <div style={{ padding:'0 16px 12px', display:'flex', flexWrap:'wrap', gap:6 }}>
          {QUICK_PROMPTS.map((p, i) => (
            <button key={i} onClick={() => send(p)} style={{ background:'rgba(99,102,241,0.08)', border:'1px solid rgba(99,102,241,0.2)', borderRadius:20, padding:'5px 12px', fontSize:12, color:'#a5b4fc', cursor:'pointer', fontFamily:'inherit' }}>{p}</button>
          ))}
        </div>
      )}

      <div style={{ padding:'12px 16px 16px', borderTop:'1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
          <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}} placeholder="Ask Flo anything..." rows={2} style={{ flex:1, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, padding:'10px 14px', color:'#f1f5f9', fontSize:13, fontFamily:'inherit', resize:'none', outline:'none', lineHeight:1.5 }} />
          <button onClick={()=>send()} disabled={!input.trim()||loading} style={{ width:40, height:40, borderRadius:10, flexShrink:0, background:input.trim()?'linear-gradient(135deg,#6366f1,#8b5cf6)':'rgba(255,255,255,0.06)', border:'none', cursor:input.trim()?'pointer':'not-allowed', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
        <div style={{ fontSize:11, color:'#334155', marginTop:6, textAlign:'center' }}>Enter to send · Shift+Enter for new line</div>
      </div>
    </div>
  )
}

export default function Layout({ children, title }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [user, setUser] = useState(null)
  const [showAgent, setShowAgent] = useState(false)
  const [hoveredNav, setHoveredNav] = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data?.user || null))
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/auth')
  }

  const email = user?.email || ''
  const avatarLetter = email.charAt(0).toUpperCase() || '?'
  const avatarColor = stringToColor(email)
  const pageLabel = { '/':'Dashboard', '/compose':'AI Compose', '/approve':'Approve', '/calendar':'Calendar', '/images':'Image Studio', '/accounts':'Accounts' }[location.pathname] || title || ''

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'var(--bg)' }}>
      <aside style={{ width:228, background:'linear-gradient(180deg,#0d1a2e 0%,#080e1a 100%)', borderRight:'1px solid rgba(255,255,255,0.05)', display:'flex', flexDirection:'column', position:'fixed', top:0, left:0, bottom:0, zIndex:40 }}>
        <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'linear-gradient(90deg,#6366f1,#8b5cf6,#ec4899)' }} />
        <div style={{ padding:'24px 18px 20px', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:11 }}>
            <div style={{ width:36, height:36, background:'linear-gradient(135deg,#6366f1,#8b5cf6)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, color:'#fff', boxShadow:'0 4px 12px rgba(99,102,241,0.35)', flexShrink:0 }}>FS</div>
            <div>
              <div style={{ fontWeight:800, fontSize:15, color:'#f1f5f9' }}>FloStudio</div>
              <div style={{ fontSize:10.5, color:'var(--text-muted)', fontWeight:500 }}>AI Social Scheduler</div>
            </div>
          </div>
        </div>

        <nav style={{ flex:1, padding:'14px 10px', display:'flex', flexDirection:'column', gap:2 }}>
          {NAV.map(item => {
            const active = location.pathname === item.path
            const hovered = hoveredNav === item.path
            return (
              <button key={item.path} onClick={()=>navigate(item.path)} onMouseEnter={()=>setHoveredNav(item.path)} onMouseLeave={()=>setHoveredNav(null)} style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'9px 12px', borderRadius:10, border:'none', background:active?'linear-gradient(135deg,rgba(99,102,241,0.2),rgba(139,92,246,0.12))':hovered?'rgba(255,255,255,0.04)':'transparent', color:active?'#a5b4fc':hovered?'#94a3b8':'#64748b', fontSize:13.5, fontWeight:active?600:450, cursor:'pointer', textAlign:'left', position:'relative', boxShadow:active?'inset 0 0 0 1px rgba(99,102,241,0.2)':'none', fontFamily:'inherit' }}>
                <span style={{ opacity:active?1:0.7, flexShrink:0 }}>{item.icon}</span>
                <span>{item.label}</span>
                {active && <span style={{ position:'absolute', left:0, top:'50%', transform:'translateY(-50%)', width:3, height:16, background:'linear-gradient(180deg,#6366f1,#8b5cf6)', borderRadius:'0 2px 2px 0' }} />}
              </button>
            )
          })}

          <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid rgba(255,255,255,0.05)' }}>
            <button onClick={()=>setShowAgent(!showAgent)} style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'9px 12px', borderRadius:10, border:showAgent?'1px solid rgba(99,102,241,0.35)':'1px solid rgba(99,102,241,0.15)', background:showAgent?'linear-gradient(135deg,rgba(99,102,241,0.2),rgba(139,92,246,0.15))':'rgba(99,102,241,0.06)', color:'#a5b4fc', fontSize:13.5, fontWeight:600, cursor:'pointer', textAlign:'left', fontFamily:'inherit', boxShadow:showAgent?'0 0 16px rgba(99,102,241,0.2)':'none' }}>
              <span style={{ position:'relative', flexShrink:0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
                <span style={{ position:'absolute', top:-2, right:-2, width:6, height:6, borderRadius:'50%', background:'#10b981', border:'1px solid #080e1a' }}/>
              </span>
              <span>Flo AI Agent</span>
            </button>
          </div>
        </nav>

        <div style={{ padding:'12px 10px 16px', borderTop:'1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:9, padding:'9px 10px', borderRadius:10, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.05)', marginBottom:6 }}>
            <div style={{ width:30, height:30, borderRadius:'50%', background:`linear-gradient(135deg,${avatarColor},${avatarColor}cc)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff', flexShrink:0 }}>{avatarLetter}</div>
            <div style={{ minWidth:0, flex:1 }}>
              <div style={{ fontSize:12, fontWeight:500, color:'var(--text-secondary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{email||'Loading...'}</div>
            </div>
          </div>
          <button onClick={handleSignOut} style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'8px 10px', borderRadius:8, border:'none', background:'transparent', color:'var(--text-muted)', fontSize:12.5, cursor:'pointer', fontFamily:'inherit' }}
            onMouseEnter={e=>{e.currentTarget.style.color='#f87171';e.currentTarget.style.background='rgba(239,68,68,0.06)'}}
            onMouseLeave={e=>{e.currentTarget.style.color='var(--text-muted)';e.currentTarget.style.background='transparent'}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign out
          </button>
        </div>
      </aside>

      <div style={{ flex:1, display:'flex', flexDirection:'column', marginLeft:228, marginRight:showAgent?380:0, minHeight:'100vh', transition:'margin-right 0.3s ease' }}>
        <div style={{ position:'fixed', top:0, left:228, right:showAgent?380:0, height:2, background:'linear-gradient(90deg,#6366f1,#8b5cf6,#ec4899)', zIndex:30, transition:'right 0.3s ease' }} />
        <header style={{ padding:'0 32px', height:60, borderBottom:'1px solid rgba(255,255,255,0.05)', background:'rgba(8,14,26,0.85)', backdropFilter:'blur(12px)', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:20, marginTop:2 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ color:'var(--text-muted)', fontSize:13 }}>FloStudio</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color:'var(--text-muted)', opacity:0.5 }}><polyline points="9 18 15 12 9 6"/></svg>
            <span style={{ color:'var(--text-primary)', fontSize:13, fontWeight:600 }}>{pageLabel}</span>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={()=>setShowAgent(!showAgent)} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:9, background:showAgent?'rgba(99,102,241,0.15)':'rgba(99,102,241,0.08)', border:'1px solid rgba(99,102,241,0.25)', color:'#a5b4fc', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
              Ask Flo
            </button>
            <button onClick={()=>navigate('/compose')} style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff', border:'none', borderRadius:9, padding:'8px 16px', fontWeight:600, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:6, boxShadow:'0 2px 12px rgba(99,102,241,0.3)', fontFamily:'inherit' }}
              onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-1px)';e.currentTarget.style.boxShadow='0 4px 16px rgba(99,102,241,0.45)'}}
              onMouseLeave={e=>{e.currentTarget.style.transform='translateY(0)';e.currentTarget.style.boxShadow='0 2px 12px rgba(99,102,241,0.3)'}}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Post
            </button>
          </div>
        </header>
        <main style={{ flex:1, padding:'28px 32px', overflow:'auto' }}>{children}</main>
      </div>

      {showAgent && <AgentPanel onClose={()=>setShowAgent(false)} />}
    </div>
  )
}
