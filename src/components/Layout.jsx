import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import { useWorkspace } from '../context/WorkspaceContext'
import { runFloAgent } from '../lib/floAgent'
import { executeFloCopilotCommand } from '../lib/floCopilotEngine'
import WorkspaceProviderKey from './WorkspaceProviderKey.jsx'

const navGroups = [
  { label: 'PORTFOLIO', items: [['portfolio', 'My Portfolio', '00']] },
  { label: 'CREATE', items: [['agent', 'Campaign Engine', '01'], ['images', 'Creative Lab', '02'], ['ai-calendar', 'Campaign Map', '03']] },
  { label: 'MANAGE', items: [['pipeline', 'Review Queue', '04'], ['experiments', 'Experiments', '05'], ['dashboard', 'Performance', '06'], ['accounts', 'Channels', '07'], ['insights', 'App Insights', '08']] },
]

const pageMeta = {
  '/portfolio': ['My Portfolio', 'Manage your apps, brand intelligence, and monthly autopilot rules.'],
  '/agent': ['Campaign Engine', 'Turn one product into a connected creative campaign, then render, review, and schedule it.'],
  '/images': ['Creative Lab', 'Generate ad creative built to perform across every placement.'],
  '/ai-calendar': ['Campaign Map', 'Turn content strategy into a complete publishing cadence.'],
  '/pipeline': ['Review Queue', 'Decide, refine, and ship your highest-potential ideas.'],
  '/experiments': ['Experiments', 'Turn creative, listing, and content hypotheses into verified portfolio learning.'],
  '/dashboard': ['Performance', 'Your campaign command center.'],
  '/insights': ['App Insights', 'Verified App Store Connect data for the selected portfolio app.'],
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
      const { data: { user } } = await supabase.auth.getUser()
      const copilotResponse = await executeFloCopilotCommand({ prompt: text, activeApp, userId: user?.id })
      const reply = copilotResponse.message
      historyRef.current = [...historyRef.current, { role: 'user', content: text }, { role: 'assistant', content: reply }]
      setMessages(prev => [...prev, { role: 'assistant', content: reply, actionType: copilotResponse.actionType, result: copilotResponse.result }])
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: `I could not complete that action: ${error?.message || 'please try again.'}` }])
    } finally { setLoading(false); setSteps([]) }
  }

  const approveDraft = async (draft, messageIndex) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sign in to approve posts.')
      const { error } = await supabase.from('campaign_posts').insert([{
        user_id: user.id,
        platform: draft.platform,
        content: draft.content,
        scheduled_at: draft.scheduledAt,
        status: 'pending',
        created_at: new Date().toISOString()
      }])
      if (error) throw error

      setMessages(prev => prev.map((msg, i) => {
        if (i !== messageIndex || !msg.result?.drafts) return msg
        return {
          ...msg,
          result: {
            ...msg.result,
            drafts: msg.result.drafts.map(d => d.id === draft.id ? { ...d, status: 'approved' } : d)
          }
        }
      }))
    } catch (err) {
      alert(`Could not approve post: ${err.message}`)
    }
  }

  const rejectDraft = (draftId, messageIndex) => {
    setMessages(prev => prev.map((msg, i) => {
      if (i !== messageIndex || !msg.result?.drafts) return msg
      return {
        ...msg,
        result: {
          ...msg.result,
          drafts: msg.result.drafts.map(d => d.id === draftId ? { ...d, status: 'rejected' } : d)
        }
      }
    }))
  }

  const approveAllDrafts = async (messageIndex, drafts) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sign in to approve posts.')
      const pendingDrafts = drafts.filter(d => d.status === 'draft')
      if (!pendingDrafts.length) return

      const records = pendingDrafts.map(d => ({
        user_id: user.id,
        platform: d.platform,
        content: d.content,
        scheduled_at: d.scheduledAt,
        status: 'pending',
        created_at: new Date().toISOString()
      }))

      const { error } = await supabase.from('campaign_posts').insert(records)
      if (error) throw error

      setMessages(prev => prev.map((msg, i) => {
        if (i !== messageIndex || !msg.result?.drafts) return msg
        return {
          ...msg,
          result: {
            ...msg.result,
            drafts: msg.result.drafts.map(d => ({ ...d, status: 'approved' }))
          }
        }
      }))
    } catch (err) {
      alert(`Could not approve all posts: ${err.message}`)
    }
  }

  return <aside className="flo-drawer">
    <div className="flo-drawer-head"><div className="flo-drawer-mark">F</div><div style={{ flex:1 }}><div style={{ fontWeight:800, fontSize:15 }}>Flo Copilot</div><div style={{ fontSize:10.5, opacity:.65, marginTop:2, letterSpacing:'.08em', textTransform:'uppercase' }}>AI campaign operator</div></div><button onClick={onClose} className="flo-drawer-close" aria-label="Close Flo Copilot">×</button></div>
    <div className="flo-drawer-chat">
      {messages.map((m, index) => <div key={index} className={`flo-bubble ${m.role}`}>
        <div>{m.content}</div>
        {m.actionType === 'post_drafts' && m.result?.drafts && (
          <div style={{ marginTop:12, display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--signal)', fontWeight:700 }}>Generated Drafts ({m.result.drafts.length})</span>
              <button onClick={() => approveAllDrafts(index, m.result.drafts)} className="studio-chip" style={{ fontSize:10, padding:'3px 8px', background:'var(--signal)', color:'var(--ink-deep)', border:0, fontWeight:700, cursor:'pointer' }}>Approve All</button>
            </div>
            {m.result.drafts.map((draft) => (
              <div key={draft.id} style={{ background:'rgba(16,16,16,.45)', border:'1px solid rgba(240,240,240,.16)', borderRadius:8, padding:10, display:'flex', flexDirection:'column', gap:6 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:9, textTransform:'uppercase', letterSpacing:'.08em', color:'rgba(240,240,240,.65)' }}>{draft.platform} · {new Date(draft.scheduledAt).toLocaleDateString()}</span>
                  <span style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:4, background: draft.status === 'approved' ? 'rgba(155,155,155,.2)' : draft.status === 'rejected' ? 'rgba(104,104,104,.2)' : 'rgba(178,178,178,.2)', color: draft.status === 'approved' ? '#b8b8b8' : draft.status === 'rejected' ? '#8e8e8e' : '#c1c1c1' }}>{draft.status.toUpperCase()}</span>
                </div>
                {draft.mediaUrl && <img src={draft.mediaUrl} alt="Draft visual" style={{ width:'100%', height:90, objectFit:'cover', borderRadius:4 }} />}
                <p style={{ fontSize:11.5, color:'#ffffff', margin:0, lineHeight:1.4 }}>{draft.content}</p>
                {draft.status === 'draft' ? (
                  <div style={{ display:'flex', gap:6, marginTop:4 }}>
                    <button onClick={() => approveDraft(draft, index)} style={{ flex:1, padding:'5px', background:'var(--signal)', color:'var(--ink-deep)', border:0, borderRadius:4, fontSize:10.5, fontWeight:800, cursor:'pointer' }}>Approve & Ship</button>
                    <button onClick={() => rejectDraft(draft.id, index)} style={{ padding:'5px 10px', background:'rgba(255,255,255,.08)', color:'#ffffff', border:'1px solid rgba(255,255,255,.15)', borderRadius:4, fontSize:10.5, fontWeight:600, cursor:'pointer' }}>Discard</button>
                  </div>
                ) : (
                  <div style={{ fontSize:10, color:'rgba(240,240,240,.6)', fontStyle:'italic' }}>{draft.status === 'approved' ? '✓ Saved to Review Queue and Calendar pipeline' : '✕ Discarded'}</div>
                )}
              </div>
            ))}
          </div>
        )}
        {m.actionType === 'seo_blueprint' && m.result && (
          <div style={{ marginTop:10, background:'rgba(16,16,16,.45)', border:'1px solid rgba(240,240,240,.16)', borderRadius:8, padding:10, display:'flex', flexDirection:'column', gap:5 }}>
            <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--signal)', fontWeight:700 }}>SEO & ASO Blueprint</div>
            <div style={{ fontSize:11, color:'#ffffff' }}><b>Title:</b> {m.result.metaTitle}</div>
            <div style={{ fontSize:11, color:'rgba(240,240,240,.8)' }}><b>Keywords:</b> {m.result.targetKeywords.join(', ')}</div>
          </div>
        )}
        {m.actionType === 'ad_created' && m.result && (
          <div style={{ marginTop:10, background:'rgba(16,16,16,.45)', border:'1px solid rgba(240,240,240,.16)', borderRadius:8, padding:10, display:'flex', flexDirection:'column', gap:8 }}>
            <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--signal)', fontWeight:700 }}>Generated Ad Creative</div>
            <img src={m.result.imageUrl} alt="Generated ad" style={{ width:'100%', height:200, objectFit:'cover', borderRadius:6, border:'1px solid rgba(240,240,240,.2)' }} />
            <div style={{ fontSize:11, color:'rgba(240,240,240,.8)' }}><b>Prompt:</b> {m.result.promptUsed}</div>
            <a href={m.result.imageUrl} target="_blank" rel="noreferrer" style={{ textAlign:'center', padding:'6px', background:'var(--signal)', color:'var(--ink-deep)', borderRadius:4, fontSize:11, fontWeight:800, textDecoration:'none' }}>Open Full Resolution →</a>
          </div>
        )}
      </div>)}
      {loading && <div className="flo-bubble assistant"><div style={{ display:'flex', gap:5, alignItems:'center', marginBottom:8 }}>{[0,1,2].map(i => <span key={i} style={{ width:7, height:7, borderRadius:'50%', background:'#b4b4b4', animation:`dot 1.25s ${i*.16}s infinite` }} />)}<span style={{ fontSize:11, marginLeft:4, opacity:.75 }}>Flo is working</span></div>{steps.slice(-3).map((s, i) => <div key={i} style={{ fontSize:11, opacity:i === steps.slice(-3).length - 1 ? 1:.55, marginTop:4 }}>• {s}</div>)}</div>}
      <div ref={endRef}/>
    </div>
    <div className="flo-drawer-footer"><div className="flo-drawer-suggestions">{['Build a campaign', 'Create 5 posts', 'Show pipeline stats'].map(q => <button key={q} onClick={() => send(q)}>{q}</button>)}</div><div className="flo-drawer-compose"><textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if(e.key === 'Enter' && !e.shiftKey){e.preventDefault();send()} }} rows={2} placeholder="Ask Flo to make something…"/><button onClick={() => send()} disabled={!input.trim() || loading} className="flo-drawer-send">GO</button></div></div>
  </aside>
}

export default function Layout({ children, title }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { tokens, tier, unlimited, activeApp, apps } = useWorkspace()
  const [user, setUser] = useState(null)
  const [copilotOpen, setCopilotOpen] = useState(false)
  const [providerKeyOpen, setProviderKeyOpen] = useState(false)
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
      <div className="flo-sidebar-footer">{!navCollapsed && <div className="flo-fuel"><div className="flo-fuel-label">SIGNAL FUEL</div><div className="flo-fuel-amount"><b>{unlimited ? '∞' : tokens}</b><span>{unlimited ? 'unlimited' : 'tokens'}</span></div></div>}<div className="flo-profile" style={{ justifyContent:navCollapsed ? 'center':'flex-start' }}><div className="flo-avatar">{initial}</div>{!navCollapsed && <div className="flo-profile-copy" style={{ minWidth:0, flex:1 }}><div className="flo-profile-email">{user?.email || 'FloStudio user'}</div><div className="flo-profile-tier">{tier} workspace</div></div>}{!navCollapsed && <button onClick={logout} className="flo-signout" title="Sign out">→</button>}</div></div>
    </aside>
    <main className={`flo-main ${navCollapsed ? 'is-collapsed' : ''}`}>
      <header className="flo-topbar"><div><div className="flo-topbar-crumb">FLOSTUDIO / {meta[0]}</div><div className="flo-topbar-meta">{meta[1]}</div></div><div className="flo-topbar-actions"><span className="signal-stamp">LIVE SYSTEM</span>{location.pathname === '/images' && <button onClick={() => setProviderKeyOpen(true)} className="flo-topbar-copilot">Connect OpenAI</button>}<button onClick={() => setCopilotOpen(true)} className="flo-topbar-copilot">Flo Operator</button><button onClick={() => navigate('/pricing')} className="flo-topbar-tokens">{unlimited ? 'Unlimited' : `${tokens} tokens`}</button></div></header>
      <div style={{ maxWidth:1360, margin:'0 auto' }}>{children}</div>
    </main>
    {copilotOpen && <AgentDrawer onClose={() => setCopilotOpen(false)} activeApp={activeApp} apps={apps} />}
    {providerKeyOpen && <WorkspaceProviderKey onClose={() => setProviderKeyOpen(false)} />}
  </div>
}
