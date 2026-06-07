import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { supabase } from './supabase'
import Auth from './pages/Auth.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Compose from './pages/Compose.jsx'
import Calendar from './pages/Calendar.jsx'
import ImageBank from './pages/ImageBank.jsx'
import Accounts from './pages/Accounts.jsx'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0f172a' }}>
      <div style={{ width: 32, height: 32, border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid #6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  return (
    <Routes>
      <Route path="/auth" element={!session ? <Auth /> : <Navigate to="/" />} />
      <Route path="/" element={session ? <Dashboard /> : <Navigate to="/auth" />} />
      <Route path="/compose" element={session ? <Compose /> : <Navigate to="/auth" />} />
      <Route path="/calendar" element={session ? <Calendar /> : <Navigate to="/auth" />} />
      <Route path="/images" element={session ? <ImageBank /> : <Navigate to="/auth" />} />
      <Route path="/accounts" element={session ? <Accounts /> : <Navigate to="/auth" />} />
    </Routes>
  )
}
