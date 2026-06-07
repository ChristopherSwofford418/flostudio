import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout.jsx'
import { supabase } from '../supabase'

const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4a3B2bm9raHFicGJxZWZlZ3hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMDI1NDgsImV4cCI6MjA5MTc3ODU0OH0.OVdLzh2Bvuf4l6F6ITSpj4pWqoc3EoTxs6OCvrMf4JU'

const PLATFORMS = [
  { id: 'facebook', label: 'Facebook', emoji: '📘', limit: 2200 },
  { id: 'instagram', label: 'Instagram', emoji: '📸', limit: 2200 },
  { id: 'twitter', label: 'Twitter / X', emoji: '🐦', limit: 280 },
  { id: 'linkedin', label: 'LinkedIn', emoji: '💼', limit: 3000 },
]

export default function Compose() {
  const navigate = useNavigate()
  const [platform, setPlatform] = useState('facebook')
  const [content, setContent] = useState('')
  const [topic, setTopic] = useState('')
  const [tone, setTone] = useState('professional')
  const [images, setImages] = useState([])
  const [selectedImage, setSelectedImage] = useState(null)
  const [scheduledAt, setScheduledAt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generated, setGenerated] = useState([])

  useEffect(() => { loadImages() }, [])

  const loadImages = async () => {
    const { data } = await supabase.storage.from('marketing-assets').list('', { limit: 50 })
    if (data) {
      const urls = data.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f.name)).map(f => ({
        name: f.name,
        url: `https://xxkpvnokhqbpbqefegxa.supabase.co/storage/v1/object/public/marketing-assets/${encodeURIComponent(f.name)}`
      }))
      setImages(urls)
    }
  }

  const generateWithAI = async () => {
    if (!topic.trim()) return alert('Enter a topic first.')
    setGenerating(true)
    const plat = PLATFORMS.find(p => p.id === platform)
    try {
      const res = await fetch('https://xxkpvnokhqbpbqefegxa.supabase.co/functions/v1/ai-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}`, apikey: ANON },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: `Write 3 ${tone} social media posts for ${plat.label} about: ${topic}. Max ${plat.limit} chars each. Include relevant hashtags. Return JSON: {"posts": ["post1", "post2", "post3"]}` }],
          max_tokens: 1000
        })
      })
      const data = await res.json()
      const text = (data?.content || '').replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
      const parsed = JSON.parse(text)
      setGenerated(parsed.posts || [])
      if (parsed.posts?.[0]) setContent(parsed.posts[0])
    } catch { alert('AI generation failed. Please try again.') }
    setGenerating(false)
  }

  const savePost = async (status) => {
    if (!content.trim()) return alert('Please write or generate content first.')
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('flo_posts').insert({
      user_id: user.id, platform, content,
      image_url: selectedImage?.url || null,
      scheduled_at: scheduledAt || null,
      status: status === 'draft' ? 'draft' : 'pending',
      created_at: new Date().toISOString()
    })
    setSaving(false)
    navigate('/')
  }

  const plat = PLATFORMS.find(p => p.id === platform)
  const charCount = content.length
  const overLimit = charCount > plat.limit

  return (
    <Layout title="Compose Post">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 24, maxWidth: 1100 }}>
        {/* Left - compose */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Platform selector */}
          <div style={{ background: '#1e293b', borderRadius: 16, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
            <label style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 12 }}>Platform</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {PLATFORMS.map(p => (
                <button key={p.id} onClick={() => setPlatform(p.id)}
                  style={{ padding: '8px 16px', borderRadius: 10, border: `1px solid ${platform === p.id ? '#6366f1' : 'rgba(255,255,255,0.08)'}`, background: platform === p.id ? 'rgba(99,102,241,0.15)' : 'transparent', color: platform === p.id ? '#a5b4fc' : '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  {p.emoji} {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* AI Generator */}
          <div style={{ background: '#1e293b', borderRadius: 16, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
            <label style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 12 }}>AI Post Generator</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="What's this post about?"
                style={{ flex: 1, background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 14 }} />
              <select value={tone} onChange={e => setTone(e.target.value)}
                style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 14 }}>
                <option value="professional">Professional</option>
                <option value="casual">Casual</option>
                <option value="funny">Funny</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <button onClick={generateWithAI} disabled={generating}
              style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: generating ? 0.7 : 1 }}>
              {generating ? 'Generating...' : '✨ Generate with AI'}
            </button>

            {generated.length > 0 && (
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {generated.map((post, i) => (
                  <button key={i} onClick={() => setContent(post)}
                    style={{ background: content === post ? 'rgba(99,102,241,0.15)' : '#0f172a', border: `1px solid ${content === post ? '#6366f1' : 'rgba(255,255,255,0.06)'}`, borderRadius: 10, padding: 12, color: '#e2e8f0', fontSize: 13, textAlign: 'left', cursor: 'pointer', lineHeight: 1.5 }}>
                    <span style={{ color: '#6366f1', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>Option {i + 1}</span>
                    {post.substring(0, 120)}{post.length > 120 ? '...' : ''}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Content editor */}
          <div style={{ background: '#1e293b', borderRadius: 16, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <label style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Content</label>
              <span style={{ fontSize: 12, color: overLimit ? '#ef4444' : '#475569' }}>{charCount} / {plat.limit}</span>
            </div>
            <textarea value={content} onChange={e => setContent(e.target.value)}
              placeholder={`Write your ${plat.label} post...`}
              style={{ width: '100%', background: '#0f172a', border: `1px solid ${overLimit ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 12, padding: 14, color: '#fff', fontSize: 14, minHeight: 160, resize: 'vertical', lineHeight: 1.6 }} />
          </div>

          {/* Schedule */}
          <div style={{ background: '#1e293b', borderRadius: 16, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
            <label style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 12 }}>Schedule (optional)</label>
            <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
              style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 14 }} />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => savePost('draft')} disabled={saving}
              style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '13px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
              Save Draft
            </button>
            <button onClick={() => savePost('scheduled')} disabled={saving || overLimit}
              style={{ flex: 2, background: '#6366f1', color: '#fff', border: 'none', borderRadius: 12, padding: '13px', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: (saving || overLimit) ? 0.7 : 1 }}>
  {saving ? 'Saving...' : '📤 Submit for Approval'}
            </button>
          </div>
        </div>

        {/* Right - image bank */}
        <div style={{ background: '#1e293b', borderRadius: 16, padding: 20, border: '1px solid rgba(255,255,255,0.06)', height: 'fit-content', position: 'sticky', top: 0 }}>
          <label style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 12 }}>Image Bank</label>
          {images.length === 0 ? (
            <p style={{ color: '#475569', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No images yet. Upload in Image Bank.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, maxHeight: 400, overflowY: 'auto' }}>
              {images.map(img => (
                <img key={img.name} src={img.url} alt={img.name}
                  onClick={() => setSelectedImage(selectedImage?.name === img.name ? null : img)}
                  style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, cursor: 'pointer', border: `2px solid ${selectedImage?.name === img.name ? '#6366f1' : 'transparent'}` }} />
              ))}
            </div>
          )}
          {selectedImage && (
            <div style={{ marginTop: 12, background: 'rgba(99,102,241,0.1)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#a5b4fc' }}>
              Selected: {selectedImage.name.substring(0, 30)}...
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
