import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { supabase } from './supabase'
import { WorkspaceProvider } from './context/WorkspaceContext.jsx'
import { identifyFloUser, initializeObservability, resetFloIdentity, trackFloEvent } from './lib/observability'
import Auth from './pages/Auth.jsx'
import Dashboard from './pages/Dashboard.jsx'
import ImageBank from './pages/ImageBank.jsx'
import Accounts from './pages/Accounts.jsx'
import AgentHQ from './pages/AgentHQ.jsx'
import AICalendar from './pages/AICalendar.jsx'
import Pipeline from './pages/Pipeline.jsx'
import ResetPassword from './pages/ResetPassword.jsx'
import Pricing from './pages/Pricing.jsx'
import Portfolio from './pages/Portfolio.jsx'
import Experiments from './pages/Experiments.jsx'
import AppInsights from './pages/AppInsights.jsx'
import SEO from './pages/SEO.jsx'
import EasyCommand from './pages/EasyCommand.jsx'
import FacebookPageKits from './pages/FacebookPageKits.jsx'
import EmailCampaigns from './pages/EmailCampaigns.jsx'
import FacebookDailyDrafts from './pages/FacebookDailyDrafts.jsx'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [bootMessage, setBootMessage] = useState('Restoring your secure workspace…')
  const location = useLocation()

  useEffect(() => { initializeObservability() }, [])

  useEffect(() => {
    if (session?.user) identifyFloUser(session.user)
    else resetFloIdentity()
  }, [session?.user?.id])

  useEffect(() => {
    if (!session?.user || loading) return
    trackFloEvent('flo_page_viewed', { path:location.pathname, route:location.pathname === '/' ? 'root' : location.pathname.slice(1) })
  }, [location.pathname, loading, session?.user?.id])

  useEffect(() => {
    let active = true
    const restoreSession = async () => {
      try {
        const result = await Promise.race([
          supabase.auth.getSession(),
          new Promise((_, reject) => window.setTimeout(() => reject(new Error('session_restore_timeout')), 3500)),
        ])
        if (!active) return
        setSession(result?.data?.session || null)
      } catch (error) {
        if (!active) return
        console.warn('FloStudio session restore fell back to sign-in.', error)
        setSession(null)
        setBootMessage('Taking you to secure sign-in…')
      } finally {
        if (active) setLoading(false)
      }
    }
    restoreSession()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession || null)
      setLoading(false)
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  if (loading) return (
    <div style={{ display: 'flex', flexDirection:'column', gap:16, alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'radial-gradient(circle at 70% 12%,rgba(109,109,109,.55),transparent 24rem),linear-gradient(135deg,#070707,#0e0e0e 55%,#1a1a1a)', color:'#ffffff', fontFamily:'Inter, sans-serif' }}>
      <div style={{ width: 34, height: 34, border: '3px solid rgba(255,255,255,0.16)', borderTop: '3px solid #939393', borderRadius: '50%', animation: 'flo-spin 0.8s linear infinite' }} />
      <strong style={{ fontSize:16 }}>FloStudio</strong>
      <span style={{ color:'rgba(255,255,255,.65)', fontSize:13 }}>{bootMessage}</span>
      <style>{`@keyframes flo-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  return (
    <WorkspaceProvider>
      <Routes>
        <Route path="/auth" element={!session ? <Auth /> : <Navigate to="/portfolio" />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/" element={session ? <Navigate to="/portfolio" /> : <Navigate to="/auth" />} />
        {/* Agentic AI pages */}
        <Route path="/agent" element={session ? <AgentHQ /> : <Navigate to="/auth" />} />
        <Route path="/pipeline" element={session ? <Pipeline /> : <Navigate to="/auth" />} />
        <Route path="/pricing" element={session ? <Pricing /> : <Navigate to="/auth" />} />
        <Route path="/portfolio" element={session ? <Portfolio /> : <Navigate to="/auth" />} />
        <Route path="/experiments" element={session ? <Experiments /> : <Navigate to="/auth" />} />
        <Route path="/ai-calendar" element={session ? <AICalendar /> : <Navigate to="/auth" />} />
        {/* Legacy URLs remain available but now use the current app-scoped workflows. */}
        <Route path="/compose" element={session ? <Navigate to="/agent" replace /> : <Navigate to="/auth" />} />
        <Route path="/calendar" element={session ? <Navigate to="/ai-calendar" replace /> : <Navigate to="/auth" />} />
        <Route path="/images" element={session ? <ImageBank /> : <Navigate to="/auth" />} />
        <Route path="/accounts" element={session ? <Accounts /> : <Navigate to="/auth" />} />
        <Route path="/approve" element={session ? <Navigate to="/pipeline" replace /> : <Navigate to="/auth" />} />
        <Route path="/facebook-kits" element={session ? <FacebookPageKits /> : <Navigate to="/auth" />} />
        <Route path="/dashboard" element={session ? <Dashboard /> : <Navigate to="/auth" />} />
        <Route path="/insights" element={session ? <AppInsights /> : <Navigate to="/auth" />} />
        <Route path="/seo" element={session ? <SEO /> : <Navigate to="/auth" />} />
        <Route path="/easy-growth" element={session ? <EasyCommand /> : <Navigate to="/auth" />} />
        <Route path="/email-campaigns" element={session ? <EmailCampaigns /> : <Navigate to="/auth" />} />
        <Route path="/facebook-drafts" element={session ? <FacebookDailyDrafts /> : <Navigate to="/auth" />} />
        <Route path="*" element={<Navigate to={session ? '/portfolio' : '/auth'} replace />} />
      </Routes>
    </WorkspaceProvider>
  )
}
