import { useState, useEffect } from 'react'
import Layout from '../components/Layout.jsx'
import { supabase } from '../supabase'

const PLATFORM_EMOJI = { facebook: '📘', instagram: '📸', twitter: '🐦', linkedin: '💼' }
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4a3B2bm9raHFicGJxZWZlZ3hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMDI1NDgsImV4cCI6MjA5MTc3ODU0OH0.OVdLzh2Bvuf4l6F6ITSpj4pWqoc3EoTxs6OCvrMf4JU'
const BLOTADO_PROXY = 'https://xxkpvnokhqbpbqefegxa.supabase.co/functions/v1/blotado-proxy'
const BLOTADO_ACCOUNTS = {
  facebook: { id: 35362, pageId: 1092443813950741 },
  instagram: { id: 51495 },
  twitter: { id: 19886 },
}

export default function Approve() {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState('')

  useEffect(() => { loadPending() }, [])

  const loadPending = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('flo_posts').select('*')
      .in('status', ['pending', 'draft'])
      .order('created_at', { ascending: false })
    setPosts(data || [])
    setLoading(false)
  }

  const approvePost = async (post) => {
    setProcessing(post.id)
    try {
      // Schedule via Blotado
      const acc = BLOTADO_ACCOUNTS[post.platform]
      if (acc) {
        const scheduledAt = post.scheduled_at
          ? new Date(post.scheduled_at).toISOString()
          : new Date(Date.now() + 60000).toISOString() // 1 min from now if no schedule

        const payload = {
          post: {
            accountId: acc.id,
            content: { text: post.content, mediaUrls: post.image_url ? [post.image_url] : [], platform: post.platform },
            target: { targetType: post.platform }
          },
          scheduledTime: scheduledAt
        }
        if (post.platform === 'facebook' && acc.pageId) payload.post.target.pageId = acc.pageId

        const res = await fetch(BLOTADO_PROXY, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON}`, 'apikey': ANON },
          body: JSON.stringify({ endpoint: 'posts', payload })
        })
        const result = await res.json()

        if (res.ok && result.ok) {
          await supabase.from('flo_posts').update({ status: 'scheduled' }).eq('id', post.id)
        } else {
          throw new Error('Blotado error')
        }
      } else {
        // No Blotado account — just mark approved
        await supabase.from('flo_posts').update({ status: 'scheduled' }).eq('id', post.id)
      }
      loadPending()
    } catch (e) {
      alert('Could not schedule post. Please try again.')
    }
    setProcessing('')
  }

  const rejectPost = async (id) => {
    await supabase.from('flo_posts').update({ status: 'rejected' }).eq('id', id)
    loadPending()
  }

  const editPost = async (post, newContent) => {
    await supabase.from('flo_posts').update({ content: newContent, status: 'pending' }).eq('id', post.id)
    loadPending()
  }

  return (
    <Layout title="Approve Posts">
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#475569' }}>Loading...</div>
      ) : posts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <p style={{ color: '#64748b', fontSize: 16 }}>No posts pending approval. All caught up!</p>
        </div>
      ) : (
        <div style={{ maxWidth: 700, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ color: '#64748b', fontSize: 14 }}>{posts.length} post{posts.length !== 1 ? 's' : ''} waiting for review</p>
          {posts.map(post => (
            <PostCard key={post.id} post={post} processing={processing} onApprove={approvePost} onReject={rejectPost} onEdit={editPost} />
          ))}
        </div>
      )}
    </Layout>
  )
}

function PostCard({ post, processing, onApprove, onReject, onEdit }) {
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(post.content)

  return (
    <div style={{ background: '#1e293b', borderRadius: 16, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 20 }}>{PLATFORM_EMOJI[post.platform] || '📱'}</span>
        <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>{post.platform}</span>
        <span style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, marginLeft: 'auto' }}>
          {post.status === 'pending' ? 'Pending Approval' : 'Draft'}
        </span>
      </div>

      {post.image_url && (
        <img src={post.image_url} alt="" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 10, marginBottom: 12 }} />
      )}

      {editing ? (
        <textarea
          value={editContent}
          onChange={e => setEditContent(e.target.value)}
          style={{ width: '100%', background: '#0f172a', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 10, padding: 12, color: '#fff', fontSize: 14, minHeight: 100, resize: 'vertical', marginBottom: 10 }}
        />
      ) : (
        <p style={{ color: '#e2e8f0', fontSize: 14, lineHeight: 1.7, marginBottom: 14, whiteSpace: 'pre-wrap' }}>{post.content}</p>
      )}

      {post.scheduled_at && (
        <p style={{ color: '#475569', fontSize: 12, marginBottom: 14 }}>
          Scheduled: {new Date(post.scheduled_at).toLocaleString()}
        </p>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        {editing ? (
          <>
            <button onClick={() => { onEdit(post, editContent); setEditing(false) }}
              style={{ flex: 1, background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '8px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              Save Edit
            </button>
            <button onClick={() => setEditing(false)}
              style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button onClick={() => onApprove(post)} disabled={processing === post.id}
              style={{ flex: 1, background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, padding: '8px', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: processing === post.id ? 0.7 : 1 }}>
              {processing === post.id ? 'Scheduling...' : '✅ Approve & Schedule'}
            </button>
            <button onClick={() => setEditing(true)}
              style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>
              ✏️ Edit
            </button>
            <button onClick={() => onReject(post.id)}
              style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>
              ✕
            </button>
          </>
        )}
      </div>
    </div>
  )
}
