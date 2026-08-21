import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import { useWorkspace } from '../context/WorkspaceContext'
import { runFloAgent } from '../lib/floAgent'

const navGroups = [
  { label: 'PORTFOLIO', items: [['portfolio', 'My Portfolio', '00']] },
  { label: 'CREATE', items: [['agent', 'Campaign Engine', '01'], ['images', 'Creative Lab', '02'], ['ai-calendar', 'Campaign Map', '03']] },
  { label: 'MANAGE', items: [['pipeline', 'Review Queue', '04'], ['experiments', 'Experiments', '05'], ['dashboard', 'Performance', '06'], ['accounts', 'Channels', '07']] },
]

const pageMeta = {
  '/portfolio': ['My Portfolio', 'Manage your apps, brand intelligence, and monthly autopilot rules.'],
  '/agent': ['Campaign Engine', 'Turn one product into a connected creative campaign, then render, review, and schedule it.'],
  '/images': ['Creative Lab', 'Generate ad creative built to perform across every placement.'],
  '/ai-calendar': ['Campaign Map', 'Turn content strategy into a complete publishing cadence.'],
  '/pipeline': ['Review Queue', 'Decide, refine, and ship your highest-potential ideas.'],
  '/experiments': ['Experiments', 'Turn creative, listing, and content hypotheses into verified portfolio learning.'],
  '/dashboard': ['Performance', 'Your campaign command center.'],
  '/accounts': ['Channels', 'Connect the destinations that turn content into growth.'],
  '/pricing': ['Plans & Tokens', 'Scale your creative output with transparent usage.'],
}

function AgentDrawer({ onClose, activeApp, apps }) {
  const [messages, setMessages] = useState([{ role: 'assistant', content: activeApp ? `I am Flo, your marketing copilot. I see your active portfolio app is **${activeApp.name}**. I can build campaigns, create exact post quantities, schedule content, and analyze your pipeline.` : 'I am Flo, your marketing copilot. I can build campaigns, create posts, analyze your pipeline, and answer any growth question.' }])
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
    setSteps([activeApp ? `Targeting ${activeApp.name}...` : 'Reading your portfolio workspace...'])
    try {
      const result = await runFloAgent(historyRef.current, text, (step) => setSteps(prev => [...prev, typeof step === 'string' ? step : 'Processing...']), (action) => setSteps(prev => [...prev, `Completed ${String(action?.tool || 'action').replaceAll('_', ' ')}`]), activeApp, apps)
      const reply = result?.reply || 'I completed that request.'
      historyRef.current = [...historyRef.current, { role: 'user', content: text }, { role: 'assistant', content: reply }]
      setMessages(prev => [...prev, { role: 'assistant', content: reply, actions: Array.isArray(result?.actions) ? result.actions : [] }])
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: `I could not complete that action: ${error?.message || 'please try again.'}` }])
    } finally { setLoading(false); setSteps([]) }
  }

  return <aside className="flo-drawer">
    <div className="flo-drawer-head"><div className="flo-drawer-mark">F</div><div style={{ flex:1 }}><div style={{ fontWeight:800, fontSize:15 }}>Flo Copilot</div><div style={{ fontSize:10.5, opacity:.65, marginTop:2, letterSpacing:'.08em', textTransform:'uppercase' }}>AI campaign operator</div></div><button onClick={onClose} className="flo-drawer-close" aria-label="Close Flo Copilot">×</button></div>
    <div className="flo-drawer-chat">
      {messages.map((m, index) => <div key={index} className={`flo-bubble ${m.role}`}>
        {m.content}
        {Array.isArray(m.actions) && m.actions.length > 0 && <div style={{ marginTop:9, display:'flex', gap:5, flexWrap:'wrap' }}>{m.actions.map((a, i) => <span key={i} style={{ fontSize:10, fontWeight:700, background:'rgba(112,238,216,.16)', color:'#a7ffec', border:'1px solid rgba(112,238,216,.25)', borderRadius:99, padding:'3px 7px' }}>DONE · {String(a?.tool || 'action').replaceAll('_', ' ')}</span>)}</div>}
      </div>)}
      {loading && <div className="flo-bubble assistant"><div style={{ display:'flex', gap:5, alignItems:'center', marginBottom:8 }}>{[0,1,2].map(i => <span key={i} style={{ width:7, height:7, borderRadius:'50%', background:'#ff9cc3', animation:`dot 1.25s ${i*.16}s infinite` }} />)}<span style={{ fontSize:11, marginLeft:4, opacity:.75 }}>Flo is working</span></div>{steps.slice(-3).map((s, i) => <div key={i} style={{ fontSize:11, opacity:i === steps.slice(-3).length - 1 ? 1:.55, marginTop:4 }}>• {s}</div>)}</div>}
      <div ref={endRef}/>
    </div>
    <div className="flo-drawer-footer"><div className="flo-drawer-suggestions">{['Build a campaign', 'Create 5 posts', 'Show pipeline stats'].map(q => <button key={q} onClick={() => send(q)}>{q}</button>)}</div><div className="flo-drawer-compose"><textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if(e.key === 'Enter' && !e.shiftKey){e.preventDefault();send()} }} rows={2} placeholder="Ask Flo to make something…"/><button onClick={() => send()} disabled={!input.trim() || loading} className="flo-drawer-send">GO</button></div></div>
  </aside>
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

  return <div className="flo-app-shell">
    <aside className={`flo-sidebar ${navCollapsed ? 'is-collapsed' : ''}`}>
      <div className="flo-brand-row">
        <button onClick={() => navigate('/dashboard')} className="flo-brand"><span className="flo-brand-mark">F</span>{!navCollapsed && <span className="flo-brand-copy"><strong className="flo-brand-name">flo<em>studio</em></strong><small className="flo-brand-caption">SIGNAL LEDGER</small></span>}</button>
        {!navCollapsed && <button onClick={() => setNavCollapsed(true)} className="flo-collapse" aria-label="Collapse navigation">‹</button>}
      </div>
      {navCollapsed && <button onClick={() => setNavCollapsed(false)} className="flo-collapse" style={{ margin:'0 auto 16px' }} aria-label="Expand navigation">›</button>}
      <button onClick={() => setCopilotOpen(true)} className="flo-ask" style={{ justifyContent:navCollapsed ? 'center':'flex-start', padding:navCollapsed ? '12px':'12px 14px' }}><span className="flo-ask-mark">F</span>{!navCollapsed && <span className="flo-ask-copy">Open Flo operator</span>}</button>
      <nav className="flo-nav">{navGroups.map(group => <div key={group.label}>{!navCollapsed && <div className="flo-nav-label">{group.label}</div>}{group.items.map(([route, label, mark]) => { const path = `/${route}`; const active = location.pathname === path; return <button key={route} onClick={() => navigate(path)} title={label} className={`flo-nav-item ${active ? 'active':''}`} style={{ justifyContent:navCollapsed ? 'center':'flex-start', padding:navCollapsed ? '12px':'10px 12px' }}><span className="flo-nav-mark">{mark}</span>{!navCollapsed && <span className="flo-nav-text">{label}</span>}{active && <span className="flo-nav-pulse"/>}</button> })}</div>)}</nav>
      <div className="flo-sidebar-footer">{!navCollapsed && <div className="flo-fuel"><div className="flo-fuel-label">SIGNAL FUEL</div><div className="flo-fuel-amount"><b>{tokens}</b><span>tokens</span></div></div>}<div className="flo-profile" style={{ justifyContent:navCollapsed ? 'center':'flex-start' }}><div className="flo-avatar">{initial}</div>{!navCollapsed && <div className="flo-profile-copy" style={{ minWidth:0, flex:1 }}><div className="flo-profile-email">{user?.email || 'FloStudio user'}</div><div className="flo-profile-tier">{tier} workspace</div></div>}{!navCollapsed && <button onClick={logout} className="flo-signout" title="Sign out">→</button>}</div></div>
    </aside>
    <main className={`flo-main ${navCollapsed ? 'is-collapsed' : ''}`}>
      <header className="flo-topbar"><div><div className="flo-topbar-crumb">FLOSTUDIO / {meta[0]}</div><div className="flo-topbar-meta">{meta[1]}</div></div><div className="flo-topbar-actions"><span className="signal-stamp">LIVE SYSTEM</span><button onClick={() => setCopilotOpen(true)} className="flo-topbar-copilot">Flo Operator</button><button onClick={() => navigate('/pricing')} className="flo-topbar-tokens">{tokens} tokens</button></div></header>
      <div style={{ maxWidth:1360, margin:'0 auto' }}>{children}</div>
    </main>
    {copilotOpen && <AgentDrawer onClose={() => setCopilotOpen(false)} activeApp={activeApp} apps={apps} />}
  </div>
}
