import { useState, useEffect } from 'react'
import Layout from '../components/Layout.jsx'
import { supabase } from '../supabase'

const PLATFORM_CONFIG = {
  facebook: { color: '#1877f2', bg: 'rgba(24,119,242,0.1)', label: 'Facebook' },
  instagram: { color: '#e1306c', bg: 'rgba(225,48,108,0.1)', label: 'Instagram' },
  twitter: { color: '#1da1f2', bg: 'rgba(29,161,242,0.1)', label: 'Twitter / X' },
  linkedin: { color: '#0a66c2', bg: 'rgba(10,102,194,0.1)', label: 'LinkedIn' },
}

const BRAND_CONFIG = {
  clearpass: { color: '#10b981', bg: 'rgba(16,185,129,0.1)', label: 'ClearPass' },
  resumefix: { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)', label: 'ResumeFix' },
}

const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4a3B2bm9raHFicGJxZWZlZ3hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMDI1NDgsImV4cCI6MjA5MTc3ODU0OH0.OVdLzh2Bvuf4l6F6ITSpj4pWqoc3EoTxs6OCvrMf4JU'
const BLOTADO_PROXY = 'https://xxkpvnokhqbpbqefegxa.supabase.co/functions/v1/blotado-proxy'

const BLOTADO_ACCOUNTS = {
  facebook: { id: 35715, pageId: 1092443813950741 },
  instagram: { id: 51707 },
  twitter: { id: 19956 },
}

const BLOTADO_RESUMEFIX = {
  facebook: { id: 35715, pageId: 1165218503337980 },
  instagram: { id: 51705 },
  twitter: { id: 19954 },
}

function charColor(count, limit) {
  if (!limit) return 'var(--text-muted)'
  const pct = count / limit
  if (pct < 0.7) return '#10b981'
  if (pct < 0.9) return '#f59e0b'
  return '#ef4444'
}

const CHAR_LIMITS = { facebook: 2200, instagram: 2200, twitter: 280, linkedin: 3000 }

export default function Approve() {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState('')

  useEffect(() => { loadPending() }, [])

  const loadPending = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('flo_posts')
      .select('*')
      .in('status', ['pending', 'draft'])
      .order('created_at', { ascending: false })
    setPosts(data || [])
    setLoading(false)
  }

  const approvePost = async (post) => {
    setProcessing(post.id)
    try {
      const accounts = post.brand === 'resumefix' ? BLOTADO_RESUMEFIX : BLOTADO_ACCOUNTS
      const acc = accounts[post.platform]
      if (acc) {
        const scheduledAt = post.scheduled_at
          ? new Date(post.scheduled_at).toISOString()
          : new Date(Date.now() + 60000).toISOString()
        const payload = {
          post: {
            accountId: acc.id,
            content: { text: post.content, mediaUrls: post.image_url ? [post.image_url] : [], platform: post.platform },
            target: { targetType: post.platform },
          },
          scheduledTime: scheduledAt,
        }
        if (post.platform === 'facebook' && acc.pageId) payload.post.target.pageId = acc.pageId
        const res = await fetch(BLOTADO_PROXY, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}`, apikey: ANON },
          body: JSON.stringify({ endpoint: 'posts', payload }),
        })
        const result = await res.json()
        if (res.ok && result.ok) {
          await supabase.from('flo_posts').update({ status: 'scheduled' }).eq('id', post.id)
        } else {
          throw new Error('Blotado error')
        }
      } else {
        await supabase.from('flo_posts').update({ status: 'scheduled' }).eq('id', post.id)
      }
      loadPending()
    } catch {
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
        <div style={{ textAlign: 'center', padding: 56 }}>
          <div className="spinner" style={{ margin: '0 auto', width: 24, height: 24 }} />
        </div>
      ) : posts.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '72px 40px',
          animation: 'fadeIn 0.3s ease',
        }}>
          <div style={{
            width: 72,
            height: 72,
            background: 'rgba(16,185,129,0.1)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            fontSize: 30,
          }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          <h3 style={{ color: 'var(--text-primary)', fontSize: 17, fontWeight: 700, marginBottom: 6 }}>
            All caught up!
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>No posts pending approval right now.</p>
        </div>
      ) : (
        <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 12.5, marginBottom: 2 }}>
            <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>{posts.length}</span>{' '}
            post{posts.length !== 1 ? 's' : ''} waiting for review
          </p>
          {posts.map((post, i) => (
            <PostCard
              key={post.id}
              post={post}
              processing={processing}
              onApprove={approvePost}
              onReject={rejectPost}
              onEdit={editPost}
              index={i}
            />
          ))}
        </div>
      )}
    </Layout>
  )
}

function PostCard({ post, processing, onApprove, onReject, onEdit, index }) {
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(post.content)
  const [selectedImage, setSelectedImage] = useState(post.image_url || null)
  const [images, setImages] = useState([])
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [loadingImages, setLoadingImages] = useState(false)
  const [scheduleTime, setScheduleTime] = useState(
    post.scheduled_at
      ? new Date(post.scheduled_at).toISOString().slice(0, 16)
      : new Date(Date.now() + 3600000).toISOString().slice(0, 16)
  )

  const platCfg = PLATFORM_CONFIG[post.platform] || { color: '#6366f1', bg: 'rgba(99,102,241,0.1)', label: post.platform }
  const brandCfg = BRAND_CONFIG[post.brand]

  const loadImages = async () => {
    if (images.length > 0) { setShowImagePicker(!showImagePicker); return }
    setLoadingImages(true)
    const { data } = await supabase.storage.from('marketing-assets').list('', { limit: 50 })
    if (data) setImages(data.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f.name)).map(f => ({
      name: f.name,
      url: `https://xxkpvnokhqbpbqefegxa.supabase.co/storage/v1/object/public/marketing-assets/${encodeURIComponent(f.name)}`
    })))
    setLoadingImages(false)
    setShowImagePicker(true)
  }
  const limit = CHAR_LIMITS[post.platform]
  const editLen = editContent.length

  return (
    <div style={{
      background: 'var(--card)',
      borderRadius: 16,
      border: '1px solid var(--border)',
      overflow: 'hidden',
      transition: 'border-color 0.15s',
      animation: `fadeIn 0.25s ease ${index * 0.05}s both`,
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
    >
      {/* Header row */}
      <div style={{
        padding: '14px 18px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'rgba(255,255,255,0.01)',
      }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '3px 10px',
          borderRadius: 6,
          fontSize: 11.5,
          fontWeight: 600,
          background: platCfg.bg,
          color: platCfg.color,
          border: `1px solid ${platCfg.color}25`,
        }}>
          {platCfg.label}
        </span>
        {brandCfg && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '3px 10px',
            borderRadius: 6,
            fontSize: 11.5,
            fontWeight: 600,
            background: brandCfg.bg,
            color: brandCfg.color,
            border: `1px solid ${brandCfg.color}25`,
          }}>
            {brandCfg.label}
          </span>
        )}
        <span className={`badge ${post.status === 'pending' ? 'badge-pending' : 'badge-draft'}`} style={{ marginLeft: 'auto' }}>
          {post.status === 'pending' ? 'Pending' : 'Draft'}
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: '16px 18px' }}>
        {post.image_url && (
          <img
            src={post.image_url}
            alt=""
            style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 10, marginBottom: 14 }}
          />
        )}

        {editing ? (
          <div style={{ marginBottom: 12 }}>
            <textarea
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--surface)',
                border: '1px solid rgba(99,102,241,0.35)',
                borderRadius: 10,
                padding: '11px 13px',
                color: 'var(--text-primary)',
                fontSize: 13.5,
                minHeight: 110,
                resize: 'vertical',
                lineHeight: 1.6,
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 5 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: charColor(editLen, limit) }}>
                {editLen}{limit ? ` / ${limit}` : ''}
              </span>
            </div>
          </div>
        ) : (
          <p style={{
            color: 'var(--text-primary)',
            fontSize: 13.5,
            lineHeight: 1.7,
            marginBottom: 12,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {post.content}
          </p>
        )}

        {post.scheduled_at && (
          <p style={{
            color: 'var(--text-muted)',
            fontSize: 11.5,
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            Scheduled for {new Date(post.scheduled_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </p>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          {editing ? (
            <>
              <button
                onClick={() => { onEdit(post, editContent); setEditing(false) }}
                style={{
                  flex: 1,
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '9px',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                  boxShadow: '0 2px 10px rgba(99,102,241,0.3)',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
              >
                Save Changes
              </button>
              <button
                onClick={() => { setEditing(false); setEditContent(post.content) }}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  color: 'var(--text-secondary)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8,
                  padding: '9px 16px',
                  fontSize: 13,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              {/* Image upload */}
              <div style={{ width: '100%', marginBottom: 10 }}>
                {selectedImage ? (
                  <div style={{ position: 'relative' }}>
                    <img src={selectedImage} alt="" onClick={() => window.open(selectedImage, '_blank')} style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 8, display: 'block', cursor: 'zoom-in' }} />
                    <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4 }}>
                      <button onClick={() => window.open(selectedImage, '_blank')} style={{ background: 'rgba(0,0,0,0.65)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 11, padding: '3px 8px', cursor: 'pointer' }}>⛶ Expand</button>
                      <button onClick={async () => { setSelectedImage(null); await supabase.from('flo_posts').update({ image_url: null }).eq('id', post.id) }} style={{ background: 'rgba(0,0,0,0.65)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, padding: '3px 8px', cursor: 'pointer', fontWeight: 600 }}>✕</button>
                    </div>
                  </div>
                ) : (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', color: '#a5b4fc', fontSize: 13, fontWeight: 500 }}>
                    <span>🖼️</span> Add Image
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async e => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      try {
                        // Upload to Supabase storage
                        const filename = `post-images/${post.id}-${Date.now()}.${file.name.split('.').pop()}`
                        const { error } = await supabase.storage.from('marketing-assets').upload(filename, file, { upsert: true })
                        if (error) throw error
                        const url = `https://xxkpvnokhqbpbqefegxa.supabase.co/storage/v1/object/public/marketing-assets/${filename}`
                        // Save URL to post record
                        await supabase.from('flo_posts').update({ image_url: url }).eq('id', post.id)
                        setSelectedImage(url)
                      } catch {
                        // Fallback to base64 preview only
                        const reader = new FileReader()
                        reader.onload = ev => setSelectedImage(ev.target.result)
                        reader.readAsDataURL(file)
                      }
                    }} />
                  </label>
                )}
              </div>

              {/* Schedule time picker */}
              <div style={{ width: '100%', marginBottom: 10 }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Schedule For</div>
                <input
                  type="datetime-local"
                  value={scheduleTime}
                  onChange={e => setScheduleTime(e.target.value)}
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 12px', color: '#e2e8f0', fontSize: 13, width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <button
                onClick={() => onApprove({ ...post, scheduled_at: new Date(scheduleTime).toISOString(), image_url: selectedImage })}
                disabled={processing === post.id}
                style={{
                  flex: 1,
                  background: processing === post.id
                    ? 'rgba(16,185,129,0.25)'
                    : 'linear-gradient(135deg, #10b981, #059669)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '9px',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: processing === post.id ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  boxShadow: processing === post.id ? 'none' : '0 2px 10px rgba(16,185,129,0.28)',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (processing !== post.id) e.currentTarget.style.transform = 'translateY(-1px)' }}
                onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
              >
                {processing === post.id ? (
                  <><div className="spinner" /> Scheduling...</>
                ) : (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    Approve
                  </>
                )}
              </button>

              <button
                onClick={() => setEditing(true)}
                style={{
                  background: 'rgba(99,102,241,0.1)',
                  color: '#a5b4fc',
                  border: '1px solid rgba(99,102,241,0.2)',
                  borderRadius: 8,
                  padding: '9px 14px',
                  fontSize: 13,
                  cursor: 'pointer',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.17)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(99,102,241,0.1)'}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>
                Edit
              </button>

              <button
                onClick={() => onReject(post.id)}
                style={{
                  background: 'rgba(239,68,68,0.07)',
                  color: '#f87171',
                  border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: 8,
                  padding: '9px 14px',
                  fontSize: 13,
                  cursor: 'pointer',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.13)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.35)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.07)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
                Reject
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
