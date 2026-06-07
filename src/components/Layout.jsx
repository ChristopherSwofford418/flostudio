import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'

const NAV = [
  {
    path: '/', label: 'Dashboard',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
    )
  },
  {
    path: '/compose', label: 'Compose',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
      </svg>
    )
  },
  {
    path: '/approve', label: 'Approve',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    )
  },
  {
    path: '/calendar', label: 'Calendar',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    )
  },
  {
    path: '/images', label: 'Image Bank',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
    )
  },
  {
    path: '/accounts', label: 'Accounts',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
      </svg>
    )
  },
]

const PAGE_LABELS = {
  '/': 'Dashboard',
  '/compose': 'Compose',
  '/approve': 'Approve',
  '/calendar': 'Calendar',
  '/images': 'Image Bank',
  '/accounts': 'Accounts',
}

const AVATAR_COLORS = ['#6366f1','#8b5cf6','#ec4899','#06b6d4','#10b981','#f59e0b']

function stringToColor(str) {
  if (!str) return AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export default function Layout({ children, title }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [user, setUser] = useState(null)
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
  const pageLabel = PAGE_LABELS[location.pathname] || title || ''

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Sidebar */}
      <aside style={{
        width: 228,
        background: 'linear-gradient(180deg, #0d1a2e 0%, #080e1a 100%)',
        borderRight: '1px solid rgba(255,255,255,0.05)',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 40,
        backdropFilter: 'blur(20px)',
      }}>
        {/* Top gradient bar */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #ec4899)',
          borderRadius: '0 0 2px 2px',
        }} />

        {/* Logo */}
        <div style={{ padding: '24px 18px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <div style={{
              width: 36,
              height: 36,
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 800,
              color: '#fff',
              letterSpacing: '-0.5px',
              boxShadow: '0 4px 12px rgba(99,102,241,0.35)',
              flexShrink: 0,
            }}>FS</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#f1f5f9', letterSpacing: '-0.3px' }}>FloStudio</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.02em' }}>AI Social Scheduler</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '14px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map(item => {
            const active = location.pathname === item.path
            const hovered = hoveredNav === item.path
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                onMouseEnter={() => setHoveredNav(item.path)}
                onMouseLeave={() => setHoveredNav(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: 'none',
                  background: active
                    ? 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.12))'
                    : hovered
                    ? 'rgba(255,255,255,0.04)'
                    : 'transparent',
                  color: active ? '#a5b4fc' : hovered ? '#94a3b8' : '#64748b',
                  fontSize: 13.5,
                  fontWeight: active ? 600 : 450,
                  transition: 'all 0.15s',
                  cursor: 'pointer',
                  textAlign: 'left',
                  position: 'relative',
                  boxShadow: active ? 'inset 0 0 0 1px rgba(99,102,241,0.2)' : 'none',
                }}
              >
                <span style={{ opacity: active ? 1 : 0.7, flexShrink: 0 }}>{item.icon}</span>
                <span>{item.label}</span>
                {active && (
                  <span style={{
                    position: 'absolute',
                    left: 0,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 3,
                    height: 16,
                    background: 'linear-gradient(180deg, #6366f1, #8b5cf6)',
                    borderRadius: '0 2px 2px 0',
                  }} />
                )}
              </button>
            )
          })}
        </nav>

        {/* Bottom - user + sign out */}
        <div style={{ padding: '12px 10px 16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: '9px 10px',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.05)',
            marginBottom: 6,
          }}>
            <div style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}cc)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 700,
              color: '#fff',
              flexShrink: 0,
              boxShadow: `0 2px 8px ${avatarColor}40`,
            }}>{avatarLetter}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--text-secondary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>{email || 'Loading...'}</div>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '8px 10px',
              borderRadius: 8,
              border: 'none',
              background: 'transparent',
              color: 'var(--text-muted)',
              fontSize: 12.5,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = 'rgba(239,68,68,0.06)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: 228, minHeight: '100vh' }}>
        {/* Top gradient bar */}
        <div style={{
          position: 'fixed',
          top: 0,
          left: 228,
          right: 0,
          height: 2,
          background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #ec4899)',
          zIndex: 30,
        }} />

        {/* Header */}
        <header style={{
          padding: '0 32px',
          height: 60,
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          background: 'rgba(8,14,26,0.85)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 20,
          marginTop: 2,
        }}>
          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>FloStudio</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>{pageLabel}</span>
          </div>

          {/* New Post CTA */}
          <button
            onClick={() => navigate('/compose')}
            style={{
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff',
              border: 'none',
              borderRadius: 9,
              padding: '8px 16px',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 2px 12px rgba(99,102,241,0.3)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.45)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(99,102,241,0.3)' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Post
          </button>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, padding: '28px 32px', overflow: 'auto' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
