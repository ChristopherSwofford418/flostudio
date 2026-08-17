import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import { useWorkspace } from '../context/WorkspaceContext'
import { runFloAgent } from '../lib/floAgent'

const navGroups = [
  {
    label: 'CREATE',
    items: [
      ['agent', 'Agent Studio', '✦'],
      ['images', 'Creative Lab', '◐'],
      ['ai-calendar', 'Campaign Map', '▦'],
    ],
  },
  {
    label: 'MANAGE',
    items: [
      ['pipeline', 'Review Queue', '⌘'],
      ['dashboard', 'Performance', '◌'],
      ['accounts', 'Channels', '↗'],
    ],
  },
]

const pageMeta = {
  '/agent': ['Agent Studio', 'Build a full-funnel campaign from one intelligent brief.'],
  '/images': ['Creative Lab', 'Generate ad creative built to perform across every placement.'],
  '/ai-calendar': ['Campaign Map', 'Turn content strategy into a complete publishing cadence.'],
  '/pipeline': ['Review Queue', 'Decide, refine, and ship your highest-potential ideas.'],
  '/dashboard': ['Performance', 'Your campaign command center.'],
  '/accounts': ['Channels', 'Connect the destinations that turn content into growth.'],
  '/pricing': ['Plans & Tokens', 'Scale your creative output with transparent usage.'],
}

function AgentDrawer({ onClose }) {
  const [messages, setMessages] = useState([{ role: 'assistant', content: 'I am Flo, your marketing copilot. I can build campaigns, create posts, analyze your pipeline, and answer any growth question.' }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [steps, setSteps] = useState([])
  const historyRef = useRef([])
  const endRef = useRef()
  useEffect(() => { try { endRef.current?.scrollIntoView({ behavior: 'smooth' }) } catch {} }, [messages, loading, steps])

  const send = async (override) => {
    const text = (override || input).trim()
    if (!text || loading) return
    setMessages(prev => [...prev, { role: 'user', content: text }])
    setInput('')
    setLoading(true)
    setSteps(['Reading your workspace signal…'])
    try {
      const result = await runFloAgent(
        historyRef.current,
        text,
        (step) => setSteps(prev => [...prev, typeof step === 'string' ? step : 'Processing...']),
        (action) => setSteps(prev => [...prev, `Completed ${String(action?.tool || 'action').replaceAll('_', ' ')}`])
      )
      const reply = result?.reply || 'I completed that request.'
      historyRef.current = [...historyRef.current, { role: 'user', content: text }, { role: 'assistant', content: reply }]
      setMessages(prev => [...prev, { role: 'assistant', content: reply, actions: Array.isArray(result?.actions) ? result.actions : [] }])
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: `I could not complete that action: ${error?.message || 'please try again.'}` }])
    } finally {
      setLoading(false)
      setSteps([])
    }
  }

  return (
    <aside style={{ position: 'fixed', zIndex: 90, top: 14, bottom: 14, right: 14, width: 410, background: 'rgba(25,16,60,0.97)', color: '#fff', borderRadius: 26, overflow: 'hidden', boxShadow: '-16px 18px 70px rgba(30, 13, 80, 0.38)', border: '1px solid rgba(255,255,255,0.14)', display: 'flex', flexDirection: 'column', animation: 'drawerIn 240ms cubic-bezier(.23,1,.32,1)' }}>
      <style>{`@keyframes drawerIn{from{transform:translateX(24px);opacity:0}to{transform:translateX(0);opacity:1}} @keyframes dot{0%,80%,100%{transform:scale(.55);opacity:.3}40%{transform:scale(1);opacity:1}}`}</style>
      <div style={{ padding: '22px 22px 18px', borderBottom: '1px solid rgba(255,255,255,0.12)', background: 'radial-gradient(circle at 15% -15%, rgba(255,79,163,.5), transparent 10rem), linear-gradient(135deg,rgba(108,44,255,.32),rgba(15,9,42,.3))', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 14, background: 'linear-gradient(135deg,#ff4fa3,#8d55ff,#5c2eff)', display: 'grid', placeItems: 'center', fontWeight: 900, boxShadow: '0 8px 18px rgba(255,79,163,.3)' }}>F</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Flo Copilot</div>
          <div style={{ fontSize: 10.5, opacity: .65, marginTop: 2, letterSpacing: '.08em', textTransform: 'uppercase' }}>AI campaign operator</div>
        </div>
        <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 10, color: '#fff', background: 'rgba(255,255,255,.1)', border: 0, fontSize: 18 }}>×</button>
      </div>
      <div style={{ flex: 1, padding: 18, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {messages.map((m, index) => (
          <div key={index} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '86%', padding: '12px 14px', borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '4px 16px 16px 16px', background: m.role === 'user' ? 'linear-gradient(135deg,#ff4fa3,#8d55ff)' : 'rgba(255,255,255,.1)', border: m.role === 'user' ? 0 : '1px solid rgba(255,255,255,.1)', lineHeight: 1.55, fontSize: 13, whiteSpace: 'pre-wrap' }}>
            {m.content}
            {Array.isArray(m.actions) && m.actions.length > 0 && <div style={{ marginTop: 9, display: 'flex', gap: 5, flexWrap: 'wrap' }}>{m.actions.map((a, i) => <span key={i} style={{ fontSize: 10, fontWeight: 700, background: 'rgba(11,191,154,.16)', color: '#75f0d2', border: '1px solid rgba(117,240,210,.25)', borderRadius: 99, padding: '3px 7px' }}>✓ {String(a?.tool || 'action').replaceAll('_', ' ')}</span>)}</div>}
          </div>
        ))}
        {loading && <div style={{ padding: '12px 14px', maxWidth: '86%', background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.1)', borderRadius: '4px 16px 16px 16px' }}><div style={{ display: 'flex', gap: 5, alignItems: 'center', marginBottom: 8 }}>{[0,1,2].map(i => <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: '#ff8fc4', animation: `dot 1.25s ${i*.16}s infinite` }} />)}<span style={{ fontSize: 11, marginLeft: 4, opacity: .75 }}>Flo is working</span></div>{steps.slice(-3).map((s, i) => <div key={i} style={{ fontSize: 11, opacity: i === steps.slice(-3).length - 1 ? 1 : .55, marginTop: 4 }}>· {s}</div>)}</div>}
        <div ref={endRef}/>
      </div>
      <div style={{ padding: 16, borderTop: '1px solid rgba(255,255,255,.1)' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, overflowX: 'auto' }}>
          {['Build a campaign', 'Create 5 posts', 'Show pipeline stats'].map(q => <button key={q} onClick={() => send(q)} style={{ whiteSpace: 'nowrap', fontSize: 10.5, padding: '6px 9px', borderRadius: 99, border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.06)', color: '#fff' }}>{q}</button>)}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if(e.key === 'Enter' && !e.shiftKey){e.preventDefault();send()} }} rows={2} placeholder="Ask Flo to make something…" style={{ flex: 1, background: 'rgba(255,255,255,.1)', color: '#fff', border: '1px solid rgba(255,255,255,.14)', borderRadius: 13, padding: '10px 12px', resize: 'none', fontSize: 12.5 }} />
          <button onClick={() => send()} disabled={!input.trim() || loading} style={{ width: 42, borderRadius: 13, border: 0, background: 'linear-gradient(135deg,#ff4fa3,#8d55ff)', color: '#fff', fontSize: 16 }}>↗</button>
        </div>
      </div>
    </aside>
  )
}

export default function Layout({ children, title }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { tokens, tier } = useWorkspace()
  const [user, setUser] = useState(null)
  const [copilotOpen, setCopilotOpen] = useState(false)
  const [navCollapsed, setNavCollapsed] = useState(false)

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUser(data?.user || null)) }, [])
  const meta = pageMeta[location.pathname] || [title || 'FloStudio', 'Build what moves your business forward.']
  const initial = (user?.email || 'F').slice(0,1).toUpperCase()

  const logout = async () => { await supabase.auth.signOut(); navigate('/auth') }
  return (
    <div style={{ minHeight: '100vh', display: 'flex', position: 'relative' }}>
      <aside style={{ width: navCollapsed ? 86 : 264, flexShrink: 0, position: 'fixed', zIndex: 50, inset: 0, height: '100vh', background: 'rgba(255,255,255,.78)', backdropFilter: 'blur(22px)', borderRight: '1px solid rgba(49,39,112,.1)', padding: '18px 14px', display: 'flex', flexDirection: 'column', transition: 'width 220ms cubic-bezier(.23,1,.32,1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: navCollapsed ? 'center' : 'space-between', padding: '6px 6px 22px' }}>
          <button onClick={() => navigate('/dashboard')} style={{ display: 'flex', alignItems: 'center', gap: 11, background: 'transparent', border: 0, color: '#17113a', textAlign: 'left' }}>
            <span style={{ width: 40, height: 40, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#ff4fa3,#8d55ff 55%,#5c2eff)', color: '#fff', fontWeight: 900, boxShadow: '0 10px 22px rgba(108,44,255,.25)' }}>F</span>
            {!navCollapsed && <span><strong style={{ display:'block', fontSize: 17, letterSpacing: '-.06em' }}>flo<span style={{ color: '#6c2cff' }}>studio</span></strong><small style={{ color: '#6b648b', fontSize: 9, fontWeight: 800, letterSpacing: '.13em' }}>CREATIVE OS</small></span>}
          </button>
          {!navCollapsed && <button onClick={() => setNavCollapsed(true)} style={{ border: 0, background: '#f0eff8', color: '#5d5781', width: 28, height: 28, borderRadius: 9 }}>‹</button>}
        </div>
        {navCollapsed && <button onClick={() => setNavCollapsed(false)} style={{ border: 0, background: '#f0eff8', color: '#5d5781', width: 28, height: 28, borderRadius: 9, margin: '0 auto 16px' }}>›</button>}
        <button onClick={() => setCopilotOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden', whiteSpace: 'nowrap', padding: navCollapsed ? '12px' : '12px 14px', borderRadius: 15, border: 0, color: '#fff', background: 'linear-gradient(135deg,#6c2cff,#8d55ff 56%,#ff4fa3)', boxShadow: '0 12px 22px rgba(108,44,255,.22)', marginBottom: 18, fontWeight: 800, fontSize: 12.5, justifyContent: navCollapsed ? 'center' : 'flex-start' }}><span style={{ fontSize: 16 }}>✦</span>{!navCollapsed && 'Ask Flo anything'}</button>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, overflowY: 'auto' }}>
          {navGroups.map(group => <div key={group.label}><div style={{ display: navCollapsed ? 'none' : 'block', fontSize: 9, fontWeight: 900, letterSpacing: '.16em', color: '#9b96b5', margin: '0 12px 7px' }}>{group.label}</div>{group.items.map(([route, label, glyph]) => {
            const path = `/${route}`
            const active = location.pathname === path
            return <button key={route} onClick={() => navigate(path)} title={label} style={{ width:'100%', marginBottom: 3, display:'flex', alignItems:'center', gap: 11, justifyContent: navCollapsed ? 'center':'flex-start', border: 0, borderRadius: 12, padding: navCollapsed ? '12px' : '10px 12px', background: active ? 'linear-gradient(90deg,rgba(108,44,255,.14),rgba(255,79,163,.08))' : 'transparent', color: active ? '#5c20d8' : '#5d5781', fontSize: 12.5, fontWeight: active ? 800 : 600, position:'relative' }}><span style={{ width: 19, textAlign: 'center', fontSize: 16, color: active ? '#6c2cff' : '#746e95' }}>{glyph}</span>{!navCollapsed && label}{active && <span style={{ position:'absolute', right: 9, width: 5, height: 5, borderRadius:'50%', background:'#ff4fa3', boxShadow:'0 0 0 4px rgba(255,79,163,.14)' }}/>}</button>
          })}</div>)}
        </nav>
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(49,39,112,.1)' }}>
          {!navCollapsed && <div style={{ margin: '0 5px 10px', padding: '11px 12px', borderRadius: 14, background: 'linear-gradient(135deg,#fff1f7,#f1ecff)', border: '1px solid rgba(108,44,255,.12)' }}><div style={{ fontSize: 9, color: '#6c2cff', fontWeight: 900, letterSpacing: '.12em' }}>CREATIVE FUEL</div><div style={{ display:'flex', alignItems:'baseline', gap:5, marginTop:3 }}><b style={{ color:'#17113a', fontSize:18 }}>{tokens}</b><span style={{ fontSize:10, color:'#6b648b', fontWeight:700 }}>tokens</span></div></div>}
          <div style={{ display:'flex', alignItems:'center', gap:10, padding: navCollapsed ? '8px 4px' : '8px', justifyContent: navCollapsed ? 'center':'flex-start' }}><div style={{ width:32, height:32, borderRadius:11, background:'linear-gradient(135deg,#f7b733,#ff4fa3)', color:'#fff', display:'grid', placeItems:'center', fontWeight:900 }}>{initial}</div>{!navCollapsed && <div style={{ minWidth:0, flex:1 }}><div style={{ fontSize:11, color:'#282148', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight:800 }}>{user?.email || 'FloStudio user'}</div><div style={{ fontSize:9, color:'#807aa1', marginTop:2, fontWeight:700, textTransform:'uppercase' }}>{tier} workspace</div></div>}{!navCollapsed && <button onClick={logout} style={{ background:'transparent', border:0, color:'#807aa1', fontSize:14, padding:4 }} title="Sign out">↪</button>}</div>
        </div>
      </aside>
      <main style={{ flex: 1, minWidth: 0, marginLeft: navCollapsed ? 86 : 264, transition: 'margin-left 220ms cubic-bezier(.23,1,.32,1)', padding: '20px 28px 44px' }}>
        <header style={{ maxWidth: 1360, margin:'0 auto 26px', minHeight: 68, padding:'13px 16px 13px 20px', borderRadius: 18, background:'rgba(255,255,255,.64)', border:'1px solid rgba(255,255,255,.9)', boxShadow:'0 6px 24px rgba(39,26,101,.045)', backdropFilter:'blur(16px)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
          <div><div style={{ fontSize:9, color:'#827ba3', fontWeight:900, letterSpacing:'.16em', textTransform:'uppercase', marginBottom:3 }}>FLOSTUDIO / {meta[0]}</div><div style={{ color:'#17113a', fontSize:13, fontWeight:600 }}>{meta[1]}</div></div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}><button onClick={() => setCopilotOpen(true)} style={{ border:'1px solid rgba(108,44,255,.15)', background:'#fff', color:'#4b3e87', borderRadius:11, padding:'9px 12px', fontWeight:800, fontSize:12 }}>✦ Copilot</button><button onClick={() => navigate('/pricing')} style={{ border:0, background:'#17113a', color:'#fff', borderRadius:11, padding:'9px 13px', fontWeight:800, fontSize:12 }}>{tokens} tokens</button></div>
        </header>
        <div style={{ maxWidth:1360, margin:'0 auto' }}>{children}</div>
      </main>
      {copilotOpen && <AgentDrawer onClose={() => setCopilotOpen(false)} />}
    </div>
  )
}
