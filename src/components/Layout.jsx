import { useState, useRef, useEffect } from 'react'
import { runFloAgent } from '../lib/floAgent'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import { useWorkspace } from '../context/WorkspaceContext'

const NAV = [
  { path: '/agent', label: 'Agent HQ', badge: 'AI', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg> },
  { path: '/pricing', label: 'Pricing', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg> },
  { path: '/pipeline', label: 'Pipeline', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
  { path: '/ai-calendar', label: 'AI Calendar', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
  { path: '/images', label: 'Image Studio', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> },
  { path: '/accounts', label: 'Accounts', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg> },
  { path: '/dashboard', label: 'Dashboard', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> },
]

const AVATAR_COLORS = ['#ec4899','#8b5cf6','#6366f1','#06b6d4','#10b981','#f59e0b']
function stringToColor(str) {
  if (!str) return AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function AgentPanel({ onClose }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hello! I am Flo, your agentic AI marketing assistant. I take real actions across your workspace.\n\nTry asking me:\n• Create 5 Instagram posts for my coffee shop\n• Fill my calendar for the next 2 weeks\n• Approve all pending posts\n• Show me my pipeline stats" }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [progressMsg, setProgressMsg] = useState('')
  const [lastActions, setLastActions] = useState([])
  const bottomRef = useRef()
  const conversationRef = useRef([])

  const QUICK_PROMPTS = [
    "Fill my calendar for next week",
    "Create 5 Instagram posts for a fitness brand",
    "Approve all pending posts",
    "Show me my pipeline stats",
  ]

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  const renderContent = (content) => content
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code style="background:rgba(236,72,153,0.15);padding:1px 5px;border-radius:4px;font-size:12px">$1</code>')
    .replace(/\n/g, '<br/>')

  const send = async (text) => {
    const msg = text || input.trim()
    if (!msg || loading) return
    setInput('')
    setLastActions([])
    const userMsg = { role: 'user', content: msg }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)
    setProgressMsg('Flo is thinking...')
    try {
      const history = conversationRef.current
      const { reply, actions } = await runFloAgent(
        history,
        msg,
        (progress) => setProgressMsg(progress),
        (action) => setLastActions(prev => [...prev, action])
      )
      conversationRef.current = [...history, { role: 'user', content: msg }, { role: 'assistant', content: reply }]
      setMessages(prev => [...prev, { role: 'assistant', content: reply, actions }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message || 'Connection failed. Please try again.'}` }])
    }
    setLoading(false)
    setProgressMsg('')
  }

  return (
    <div style={{ position:'fixed', right:0, top:0, bottom:0, width:400, background:'linear-gradient(180deg,#0f172a 0%,#070b19 100%)', borderLeft:'1px solid rgba(236,72,153,0.3)', display:'flex', flexDirection:'column', zIndex:1000, boxShadow:'-20px 0 60px rgba(0,0,0,0.6)', animation:'slideInRight 0.3s ease' }}>
      <style>{`@keyframes slideInRight{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}} @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      {/* Header */}
      <div style={{ padding:'16px 20px', borderBottom:'1px solid rgba(236,72,153,0.2)', display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ width:38, height:38, borderRadius:'50%', background:'linear-gradient(135deg,#ec4899,#8b5cf6,#6366f1)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 20px rgba(236,72,153,0.5)', flexShrink:0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:800, fontSize:14, color:'#f8fafc' }}>Flo - Agentic AI</div>
          <div style={{ fontSize:11, color:'#10b981', display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:'#10b981', display:'inline-block' }}/>
            Active · GPT-4o
          </div>
        </div>
        <button onClick={onClose} style={{ background:'none', border:'none', color:'#94a3b8', cursor:'pointer', padding:4 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflowY:'auto', padding:'16px 16px 8px', display:'flex', flexDirection:'column', gap:12 }}>
        {messages.map((msg, i) => (
          <div key={i}>
            <div style={{ display:'flex', gap:10, alignItems:'flex-start', flexDirection:msg.role==='user'?'row-reverse':'row' }}>
              {msg.role==='assistant' && (
                <div style={{ width:28, height:28, borderRadius:'50%', background:'linear-gradient(135deg,#ec4899,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:2 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
                </div>
              )}
              <div style={{ maxWidth:'82%', padding:'10px 14px', borderRadius:msg.role==='user'?'14px 14px 4px 14px':'4px 14px 14px 14px', background:msg.role==='user'?'linear-gradient(135deg,#ec4899,#8b5cf6,#6366f1)':'rgba(255,255,255,0.05)', border:msg.role==='user'?'none':'1px solid rgba(236,72,153,0.2)', fontSize:13, lineHeight:1.6, color:'#f8fafc' }} dangerouslySetInnerHTML={{ __html: renderContent(msg.content) }} />
            </div>
            {msg.actions?.length > 0 && (
              <div style={{ marginLeft:38, marginTop:6, display:'flex', flexWrap:'wrap', gap:4 }}>
                {msg.actions.map((a, ai) => (
                  <div key={ai} style={{ display:'flex', alignItems:'center', gap:5, padding:'3px 8px', background:'rgba(16,185,129,0.15)', border:'1px solid rgba(16,185,129,0.3)', borderRadius:20, fontSize:11, color:'#34d399', fontWeight:600 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    {a.tool.replace(/_/g,' ')}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
            <div style={{ width:28, height:28, borderRadius:'50%', background:'linear-gradient(135deg,#ec4899,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" style={{ animation:'spin 1s linear infinite' }}><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
            </div>
            <div style={{ padding:'10px 14px', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(236,72,153,0.2)', borderRadius:'4px 14px 14px 14px', fontSize:12, color:'#f472b6', fontStyle:'italic' }}>
              {progressMsg || 'Thinking...'}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {messages.length <= 1 && (
        <div style={{ padding:'0 16px 12px', display:'flex', flexWrap:'wrap', gap:6 }}>
          {QUICK_PROMPTS.map((p, i) => (
            <button key={i} onClick={() => send(p)} style={{ background:'rgba(236,72,153,0.08)', border:'1px solid rgba(236,72,153,0.25)', borderRadius:20, padding:'5px 12px', fontSize:12, color:'#f472b6', cursor:'pointer', fontFamily:'inherit', fontWeight:500 }}>{p}</button>
          ))}
        </div>
      )}

      <div style={{ padding:'12px 16px 16px', borderTop:'1px solid rgba(236,72,153,0.2)' }}>
        <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
          <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}} placeholder="Tell Flo what to do..." rows={2} style={{ flex:1, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(236,72,153,0.25)', borderRadius:10, padding:'10px 14px', color:'#f8fafc', fontSize:13, fontFamily:'inherit', resize:'none', outline:'none', lineHeight:1.5 }} />
          <button onClick={()=>send()} disabled={!input.trim()||loading} style={{ width:40, height:40, borderRadius:10, flexShrink:0, background:input.trim()&&!loading?'linear-gradient(135deg,#ec4899,#8b5cf6,#6366f1)':'rgba(255,255,255,0.06)', border:'none', cursor:input.trim()&&!loading?'pointer':'not-allowed', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:input.trim()&&!loading?'0 4px 15px rgba(236,72,153,0.4)':'none' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
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
  const { tokens, tier } = useWorkspace()

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
  const pageLabel = { '/':'Dashboard', '/compose':'AI Compose', '/approve':'Approve', '/calendar':'Calendar', '/images':'Image Studio', '/accounts':'Accounts', '/pricing':'Pricing', '/agent':'Agent HQ', '/pipeline':'Pipeline', '/ai-calendar':'AI Calendar' }[location.pathname] || title || ''

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'var(--bg)' }}>
      <aside style={{ width:238, background:'linear-gradient(180deg,#0c1326 0%,#070b19 100%)', borderRight:'1px solid rgba(236,72,153,0.15)', display:'flex', flexDirection:'column', position:'fixed', top:0, left:0, bottom:0, zIndex:40 }}>
        <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:'linear-gradient(90deg,#ec4899,#8b5cf6,#6366f1)' }} />
        <div style={{ padding:'24px 18px 20px', borderBottom:'1px solid rgba(236,72,153,0.15)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:11 }}>
            <div style={{ width:38, height:38, background:'linear-gradient(135deg,#ec4899,#8b5cf6,#6366f1)', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:900, color:'#fff', boxShadow:'0 4px 18px rgba(236,72,153,0.4)', flexShrink:0 }}>FS</div>
            <div>
              <div style={{ fontWeight:900, fontSize:16, color:'#f8fafc', letterSpacing:'-0.3px' }}>FloStudio</div>
              <div style={{ fontSize:11, color:'#f472b6', fontWeight:600 }}>AI Marketing Platform</div>
            </div>
          </div>
        </div>

        <nav style={{ flex:1, padding:'16px 12px', display:'flex', flexDirection:'column', gap:3 }}>
          {NAV.map(item => {
            const active = location.pathname === item.path
            const hovered = hoveredNav === item.path
            return (
              <button key={item.path} onClick={()=>navigate(item.path)} onMouseEnter={()=>setHoveredNav(item.path)} onMouseLeave={()=>setHoveredNav(null)} style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'10px 14px', borderRadius:12, border:'none', background:active?'linear-gradient(135deg,rgba(236,72,153,0.2),rgba(139,92,246,0.15))':hovered?'rgba(255,255,255,0.05)':'transparent', color:active?'#f472b6':hovered?'#cbd5e1':'#94a3b8', fontSize:13.5, fontWeight:active?700:500, cursor:'pointer', textAlign:'left', position:'relative', boxShadow:active?'inset 0 0 0 1px rgba(236,72,153,0.4)':'none', fontFamily:'inherit' }}>
                <span style={{ opacity:active?1:0.75, flexShrink:0, color:active?'#ec4899':'inherit' }}>{item.icon}</span>
                <span>{item.label}</span>
                {active && <span style={{ position:'absolute', left:0, top:'50%', transform:'translateY(-50%)', width:4, height:18, background:'linear-gradient(180deg,#ec4899,#8b5cf6)', borderRadius:'0 3px 3px 0', boxShadow:'0 0 10px #ec4899' }} />}
              </button>
            )
          })}

          <div style={{ marginTop:14, paddingTop:14, borderTop:'1px solid rgba(236,72,153,0.15)' }}>
            <button onClick={()=>setShowAgent(!showAgent)} style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'10px 14px', borderRadius:12, border:showAgent?'1px solid rgba(236,72,153,0.5)':'1px solid rgba(236,72,153,0.25)', background:showAgent?'linear-gradient(135deg,rgba(236,72,153,0.25),rgba(139,92,246,0.2))':'rgba(236,72,153,0.08)', color:'#f472b6', fontSize:13.5, fontWeight:700, cursor:'pointer', textAlign:'left', fontFamily:'inherit', boxShadow:showAgent?'0 0 20px rgba(236,72,153,0.35)':'none' }}>
              <span style={{ position:'relative', flexShrink:0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
                <span style={{ position:'absolute', top:-2, right:-2, width:6, height:6, borderRadius:'50%', background:'#10b981', border:'1px solid #070b19' }}/>
              </span>
              <span>Flo AI Agent</span>
            </button>
          </div>
        </nav>

        <div style={{ padding:'12px 12px 18px', borderTop:'1px solid rgba(236,72,153,0.15)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:12, background:'rgba(236,72,153,0.06)', border:'1px solid rgba(236,72,153,0.2)', marginBottom:8 }}>
            <div style={{ width:32, height:32, borderRadius:'50%', background:`linear-gradient(135deg,${avatarColor},#ec4899)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:'#fff', flexShrink:0, boxShadow:'0 2px 10px rgba(236,72,153,0.3)' }}>{avatarLetter}</div>
            <div style={{ minWidth:0, flex:1 }}>
              <div style={{ fontSize:11.5, fontWeight:600, color:'#f8fafc', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{email||'User'}</div>
              <div style={{ fontSize:10, color:'#f472b6', fontWeight:700, textTransform:'uppercase' }}>Tier: {tier} ({tokens} tokens)</div>
            </div>
          </div>
          <button onClick={handleSignOut} style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'9px 12px', borderRadius:10, border:'none', background:'transparent', color:'#94a3b8', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}
            onMouseEnter={e=>{e.currentTarget.style.color='#f87171';e.currentTarget.style.background='rgba(239,68,68,0.1)'}}
            onMouseLeave={e=>{e.currentTarget.style.color='#94a3b8';e.currentTarget.style.background='transparent'}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign out
          </button>
        </div>
      </aside>

      <div style={{ flex:1, display:'flex', flexDirection:'column', marginLeft:238, marginRight:showAgent?400:0, minHeight:'100vh', transition:'margin-right 0.3s ease' }}>
        <div style={{ position:'fixed', top:0, left:238, right:showAgent?400:0, height:3, background:'linear-gradient(90deg,#ec4899,#8b5cf6,#6366f1)', zIndex:30, transition:'right 0.3s ease', boxShadow:'0 0 15px #ec4899' }} />
        <header style={{ padding:'0 32px', height:64, borderBottom:'1px solid rgba(236,72,153,0.15)', background:'rgba(7,11,25,0.9)', backdropFilter:'blur(16px)', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:20, marginTop:3 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ color:'#94a3b8', fontSize:13.5, fontWeight:500 }}>FloStudio</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color:'#ec4899', opacity:0.7 }}><polyline points="9 18 15 12 9 6"/></svg>
            <span style={{ color:'#f8fafc', fontSize:13.5, fontWeight:700 }}>{pageLabel}</span>
          </div>
          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 14px', background:'rgba(236,72,153,0.1)', border:'1px solid rgba(236,72,153,0.3)', borderRadius:10, fontSize:12.5, fontWeight:700, color:'#f472b6' }}>
              <span>Tokens:</span> {tokens}
            </div>
            <button onClick={()=>setShowAgent(!showAgent)} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px', borderRadius:10, background:showAgent?'rgba(236,72,153,0.2)':'rgba(236,72,153,0.1)', border:'1px solid rgba(236,72,153,0.35)', color:'#f472b6', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', boxShadow:showAgent?'0 0 15px rgba(236,72,153,0.3)':'none' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
              Ask Flo
            </button>
            <button onClick={()=>navigate('/pricing')} style={{ background:'linear-gradient(135deg,#ec4899,#8b5cf6,#6366f1)', color:'#fff', border:'none', borderRadius:10, padding:'8px 18px', fontWeight:800, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:6, boxShadow:'0 4px 18px rgba(236,72,153,0.4)', fontFamily:'inherit' }}
              onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-1px)'}}
              onMouseLeave={e=>{e.currentTarget.style.transform='translateY(0)'}}>
              Pricing & Tokens
            </button>
          </div>
        </header>
        <main style={{ flex:1, padding:'32px', overflow:'auto' }}>{children}</main>
      </div>

      {showAgent && <AgentPanel onClose={()=>setShowAgent(false)} />}
    </div>
  )
}
