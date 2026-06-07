import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout.jsx'
import { supabase } from '../supabase'

const PLATFORM_COLORS = { facebook: '#1877f2', instagram: '#e1306c', twitter: '#1da1f2', linkedin: '#0a66c2' }
const PLATFORM_EMOJI = { facebook: '📘', instagram: '📸', twitter: '🐦', linkedin: '💼' }

export default function Dashboard() {
  const navigate = useNavigate()
  const [posts, setPosts] = useState([])
  const [stats, setStats] = useState({ total: 0, scheduled: 0, published: 0, drafts: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadPosts() }, [])

  const loadPosts = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('flo_posts').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10)
    const posts = data || []
    setPosts(posts)
    setStats({
      total: posts.length,
      scheduled: posts.filter(p => p.status === 'scheduled').length,
      published: posts.filter(p => p.status === 'published').length,
      drafts: posts.filter(p => p.status === 'draft').length,
    })
    setLoading(false)
  }

  const STAT_CARDS = [
    { label: 'Total Posts', value: stats.total, icon: '📝', color: '#6366f1' },
    { label: 'Scheduled', value: stats.scheduled, icon: '⏰', color: '#f59e0b' },
    { label: 'Published', value: stats.published, icon: '✅', color: '#10b981' },
    { label: 'Drafts', value: stats.drafts, icon: '📄', color: '#64748b' },
  ]

  return (
    <Layout title="Dashboard">
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {STAT_CARDS.map(card => (
          <div key={card.label} style={{ background: '#1e293b', borderRadius: 16, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>{card.icon}</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: card.color }}>{card.value}</div>
            <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Recent posts */}
      <div style={{ background: '#1e293b', borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Recent Posts</h2>
          <button onClick={() => navigate('/compose')} style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ New Post</button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#475569' }}>Loading...</div>
        ) : posts.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✍️</div>
            <p style={{ color: '#64748b', fontSize: 15, marginBottom: 20 }}>No posts yet. Create your first post!</p>
            <button onClick={() => navigate('/compose')} style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 24px', fontWeight: 600, cursor: 'pointer' }}>Create Post</button>
          </div>
        ) : (
          <div>
            {posts.map(post => (
              <div key={post.id} style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ fontSize: 20 }}>{PLATFORM_EMOJI[post.platform] || '📱'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: '#e2e8f0', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.content}</p>
                  <p style={{ color: '#475569', fontSize: 12, marginTop: 2 }}>{post.platform} · {post.scheduled_at ? new Date(post.scheduled_at).toLocaleDateString() : 'Draft'}</p>
                </div>
                <span style={{
                  background: post.status === 'published' ? 'rgba(16,185,129,0.15)' : post.status === 'scheduled' ? 'rgba(245,158,11,0.15)' : 'rgba(100,116,139,0.15)',
                  color: post.status === 'published' ? '#10b981' : post.status === 'scheduled' ? '#f59e0b' : '#64748b',
                  borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 600
                }}>{post.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
