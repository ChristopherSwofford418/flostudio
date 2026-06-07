import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'

const NAV = [
  { path: '/', icon: '📊', label: 'Dashboard' },
  { path: '/compose', icon: '✍️', label: 'Compose' },
  { path: '/approve', icon: '🔔', label: 'Approve' },
  { path: '/calendar', icon: '📅', label: 'Calendar' },
  { path: '/images', icon: '🖼️', label: 'Image Bank' },
  { path: '/accounts', icon: '🔗', label: 'Accounts' },
]

export default function Layout({ children, title }) {
  const navigate = useNavigate()
  const location = useLocation()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/auth')
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0f172a' }}>
      {/* Sidebar */}
      <div style={{ width: 220, background: '#1e293b', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', padding: '24px 0' }}>
        {/* Logo */}
        <div style={{ padding: '0 20px 28px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🌊</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#fff' }}>FloStudio</div>
              <div style={{ fontSize: 11, color: '#475569' }}>AI Social Scheduler</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '16px 12px' }}>
          {NAV.map(item => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '10px 12px', borderRadius: 10, border: 'none', marginBottom: 4,
                background: location.pathname === item.path ? 'rgba(99,102,241,0.2)' : 'transparent',
                color: location.pathname === item.path ? '#a5b4fc' : '#64748b',
                fontSize: 14, fontWeight: location.pathname === item.path ? 600 : 400,
                transition: 'all 0.15s',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Sign out */}
        <div style={{ padding: '16px 12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={handleSignOut}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', borderRadius: 10, border: 'none', background: 'transparent', color: '#475569', fontSize: 14, cursor: 'pointer' }}
          >
            <span>🚪</span> Sign Out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ padding: '20px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>{title}</h1>
          <button
            onClick={() => navigate('/compose')}
            style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 18px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
          >
            + New Post
          </button>
        </header>
        <main style={{ flex: 1, overflow: 'auto', padding: 32 }}>
          {children}
        </main>
      </div>
    </div>
  )
}
