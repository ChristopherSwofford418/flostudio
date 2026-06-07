import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout.jsx'
import { supabase } from '../supabase'

const PLATFORM_COLORS = {
  facebook: '#1877f2',
  instagram: '#e1306c',
  twitter: '#1da1f2',
  linkedin: '#0a66c2',
}

const PLATFORM_ICONS = {
  facebook: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/>
    </svg>
  ),
  instagram: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/>
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
    </svg>
  ),
  twitter: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z"/>
    </svg>
  ),
  linkedin: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"/><circle cx="4" cy="4" r="2"/>
    </svg>
  ),
}

const STATUS_CONFIG = {
  published: { label: 'Published', className: 'badge-published' },
  scheduled: { label: 'Scheduled', className: 'badge-scheduled' },
  pending: { label: 'Pending', className: 'badge-pending' },
  draft: { label: 'Draft', className: 'badge-draft' },
  rejected: { label: 'Rejected', className: 'badge-rejected' },
}

const QUICK_ACTIONS = [
  { platform: 'facebook', label: 'Facebook', color: '#1877f2', bg: 'rgba(24,119,242,0.1)', path: '/compose' },
  { platform: 'instagram', label: 'Instagram', color: '#e1306c', bg: 'rgba(225,48,108,0.1)', path: '/compose' },
  { platform: 'twitter', label: 'Twitter / X', color: '#1da1f2', bg: 'rgba(29,161,242,0.1)', path: '/compose' },
  { platform: 'linkedin', label: 'LinkedIn', color: '#0a66c2', bg: 'rgba(10,102,194,0.1)', path: '/compose' },
]

const STAT_DEFS = [
  {
    label: 'Total Posts',
    key: 'total',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
    color: '#6366f1',
    bg: 'rgba(99,102,241,0.12)',
  },
  {
    label: 'Pending Approval',
    key: 'pending',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    ),
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.12)',
  },
  {
    label: 'Published',
    key: 'published',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    ),
    color: '#10b981',
    bg: 'rgba(16,185,129,0.12)',
  },
  {
    label: 'Drafts',
    key: 'drafts',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
      </svg>
    ),
    color: '#64748b',
    bg: 'rgba(100,116,139,0.12)',
  },
]

function StatCard({ def, value, index }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--card)',
        borderRadius: 16,
        padding: '20px 22px',
        border: `1px solid ${hovered ? def.color + '33' : 'var(--border)'}`,
        transition: 'all 0.2s ease',
        boxShadow: hovered ? `0 4px 24px ${def.color}18` : 'none',
        animation: `fadeIn 0.3s ease ${index * 0.05}s both`,
        cursor: 'default',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {hovered && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: `linear-gradient(90deg, ${def.color}, ${def.color}88)`,
          borderRadius: '16px 16px 0 0',
        }} />
      )}
      <div style={{
        width: 38,
        height: 38,
        borderRadius: 10,
        background: def.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: def.color,
        marginBottom: 14,
        transition: 'transform 0.2s',
        transform: hovered ? 'scale(1.08)' : 'scale(1)',
      }}>
        {def.icon}
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1, marginBottom: 5 }}>
        {value}
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: 12.5, fontWeight: 500 }}>{def.label}</div>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [posts, setPosts] = useState([])
  const [stats, setStats] = useState({ total: 0, scheduled: 0, published: 0, drafts: 0, pending: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadPosts() }, [])

  const loadPosts = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase
      .from('flo_posts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)
    const p = data || []
    setPosts(p)
    setStats({
      total: p.length,
      scheduled: p.filter(x => x.status === 'scheduled').length,
      published: p.filter(x => x.status === 'published').length,
      drafts: p.filter(x => x.status === 'draft').length,
      pending: p.filter(x => x.status === 'pending').length,
    })
    setLoading(false)
  }

  const statValues = [stats.total, stats.pending, stats.published, stats.drafts]

  return (
    <Layout title="Dashboard">
      {/* Quick Actions */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
          Quick Compose
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {QUICK_ACTIONS.map((qa, i) => (
            <button
              key={qa.platform}
              onClick={() => navigate(qa.path)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '7px 14px',
                borderRadius: 9,
                border: `1px solid ${qa.color}22`,
                background: qa.bg,
                color: qa.color,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s',
                animation: `fadeIn 0.3s ease ${i * 0.04}s both`,
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 4px 12px ${qa.color}22` }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}
            >
              <span style={{ opacity: 0.9 }}>{PLATFORM_ICONS[qa.platform]}</span>
              {qa.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {STAT_DEFS.map((def, i) => (
          <StatCard key={def.key} def={def} value={statValues[i]} index={i} />
        ))}
      </div>

      {/* Recent posts */}
      <div style={{
        background: 'var(--card)',
        borderRadius: 16,
        border: '1px solid var(--border)',
        animation: 'fadeIn 0.35s ease 0.1s both',
      }}>
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Recent Posts</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 1 }}>Last 10 posts across all platforms</p>
          </div>
          <button
            onClick={() => navigate('/compose')}
            style={{
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '7px 14px',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(99,102,241,0.3)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(99,102,241,0.4)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(99,102,241,0.3)' }}
          >
            + New Post
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : posts.length === 0 ? (
          <div style={{ padding: '56px 40px', textAlign: 'center', animation: 'fadeIn 0.3s ease' }}>
            <div style={{ fontSize: 52, marginBottom: 14, opacity: 0.8 }}>✍️</div>
            <h3 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No posts yet</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 13.5, marginBottom: 22, lineHeight: 1.6 }}>
              Create your first AI-generated post and start growing your audience.
            </p>
            <button
              onClick={() => navigate('/compose')}
              style={{
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                padding: '11px 26px',
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(99,102,241,0.35)',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(99,102,241,0.45)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)' }}
            >
              Create your first post
            </button>
          </div>
        ) : (
          <div>
            {posts.map((post, i) => {
              const platformColor = PLATFORM_COLORS[post.platform] || '#6366f1'
              const statusCfg = STATUS_CONFIG[post.status] || STATUS_CONFIG.draft
              return (
                <div
                  key={post.id}
                  style={{
                    padding: '14px 24px',
                    borderBottom: i < posts.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    transition: 'background 0.12s',
                    animation: `fadeIn 0.25s ease ${i * 0.03}s both`,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  {/* Platform icon */}
                  <div style={{
                    width: 34,
                    height: 34,
                    borderRadius: 9,
                    background: `${platformColor}18`,
                    border: `1px solid ${platformColor}28`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: platformColor,
                    flexShrink: 0,
                  }}>
                    {PLATFORM_ICONS[post.platform] || (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
                      </svg>
                    )}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      color: 'var(--text-primary)',
                      fontSize: 13.5,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      marginBottom: 3,
                      fontWeight: 450,
                    }}>
                      {post.content}
                    </p>
                    <p style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>
                      <span style={{ textTransform: 'capitalize' }}>{post.platform}</span>
                      {post.brand && <span> &middot; <span style={{ textTransform: 'capitalize' }}>{post.brand}</span></span>}
                      {post.scheduled_at && <span> &middot; {new Date(post.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
                    </p>
                  </div>

                  {/* Status badge */}
                  <span className={`badge ${statusCfg.className}`} style={{ flexShrink: 0 }}>
                    {statusCfg.label}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Layout>
  )
}
