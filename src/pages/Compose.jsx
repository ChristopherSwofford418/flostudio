import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout.jsx'
import { supabase } from '../supabase'

const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4a3B2bm9raHFicGJxZWZlZ3hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMDI1NDgsImV4cCI6MjA5MTc3ODU0OH0.OVdLzh2Bvuf4l6F6ITSpj4pWqoc3EoTxs6OCvrMf4JU'

const PLATFORMS = [
  { id: 'facebook', label: 'Facebook', color: '#1877f2', bg: 'rgba(24,119,242,0.12)', border: 'rgba(24,119,242,0.3)', limit: 2200,
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg> },
  { id: 'instagram', label: 'Instagram', color: '#e1306c', bg: 'rgba(225,48,108,0.12)', border: 'rgba(225,48,108,0.3)', limit: 2200,
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg> },
  { id: 'twitter', label: 'Twitter / X', color: '#1da1f2', bg: 'rgba(29,161,242,0.12)', border: 'rgba(29,161,242,0.3)', limit: 280,
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z"/></svg> },
  { id: 'linkedin', label: 'LinkedIn', color: '#0a66c2', bg: 'rgba(10,102,194,0.12)', border: 'rgba(10,102,194,0.3)', limit: 3000,
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"/><circle cx="4" cy="4" r="2"/></svg> },
]

const BRANDS = [
  { id: 'clearpass', label: 'ClearPass', emoji: '🛡️' },
  { id: 'resumefix', label: 'ResumeFix', emoji: '📄' },
]

function charCountColor(count, limit) {
  const pct = count / limit
  if (pct < 0.7) return '#10b981'
  if (pct < 0.9) return '#f59e0b'
  return '#ef4444'
}

function CharCounter({ count, limit }) {
  const color = charCountColor(count, limit)
  const pct = Math.min(count / limit, 1)
  const over = count > limit
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 80, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct * 100}%`,
          background: color,
          borderRadius: 2,
          transition: 'width 0.2s, background 0.3s',
        }} />
      </div>
      <span style={{ fontSize: 11.5, fontWeight: 600, color, fontVariantNumeric: 'tabular-nums' }}>
        {over ? `-${count - limit}` : `${count} / ${limit}`}
      </span>
    </div>
  )
}

export default function Compose() {
  const navigate = useNavigate()
  const [platform, setPlatform] = useState('facebook')
  const [brand, setBrand] = useState('clearpass')
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
      const urls = data
        .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f.name))
        .map(f => ({
          name: f.name,
          url: `https://xxkpvnokhqbpbqefegxa.supabase.co/storage/v1/object/public/marketing-assets/${encodeURIComponent(f.name)}`,
        }))
      setImages(urls)
    }
  }

  const generateWithAI = async () => {
    if (!topic.trim()) return alert('Enter a topic first.')
    setGenerating(true)
    setGenerated([])
    const plat = PLATFORMS.find(p => p.id === platform)
    try {
      const res = await fetch('https://xxkpvnokhqbpbqefegxa.supabase.co/functions/v1/ai-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}`, apikey: ANON },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: `Write 3 ${tone} social media posts for ${plat.label} about: ${topic}. Max ${plat.limit} chars each. Include relevant hashtags. Return JSON: {"posts": ["post1", "post2", "post3"]}` }],
          max_tokens: 1000,
        }),
      })
      const data = await res.json()
      const text = (data?.content || '').replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
      const parsed = JSON.parse(text)
      setGenerated(parsed.posts || [])
      if (parsed.posts?.[0]) setContent(parsed.posts[0])
    } catch {
      alert('AI generation failed. Please try again.')
    }
    setGenerating(false)
  }

  const savePost = async (status) => {
    if (!content.trim()) return alert('Please write or generate content first.')
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('flo_posts').insert({
      user_id: user.id,
      platform,
      content,
      brand,
      image_url: selectedImage?.url || null,
      scheduled_at: scheduledAt || null,
      status: status === 'draft' ? 'draft' : 'pending',
      created_at: new Date().toISOString(),
    })
    setSaving(false)
    navigate('/')
  }

  const plat = PLATFORMS.find(p => p.id === platform)
  const charCount = content.length
  const overLimit = charCount > plat.limit

  const SectionCard = ({ children, style = {} }) => (
    <div style={{
      background: 'var(--card)',
      borderRadius: 14,
      padding: 20,
      border: '1px solid var(--border)',
      ...style,
    }}>
      {children}
    </div>
  )

  const SectionLabel = ({ children }) => (
    <span className="section-label">{children}</span>
  )

  return (
    <Layout title="Compose Post">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 22, maxWidth: 1100 }}>
        {/* LEFT - Editor */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Brand selector */}
          <SectionCard>
            <SectionLabel>Brand</SectionLabel>
            <div style={{ display: 'flex', gap: 8 }}>
              {BRANDS.map(b => (
                <button
                  key={b.id}
                  onClick={() => setBrand(b.id)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 9,
                    border: `1px solid ${brand === b.id ? '#6366f1' : 'rgba(255,255,255,0.07)'}`,
                    background: brand === b.id ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)',
                    color: brand === b.id ? '#a5b4fc' : 'var(--text-muted)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    transition: 'all 0.15s',
                  }}
                >
                  <span>{b.emoji}</span> {b.label}
                </button>
              ))}
            </div>
          </SectionCard>

          {/* Platform selector */}
          <SectionCard>
            <SectionLabel>Platform</SectionLabel>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {PLATFORMS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setPlatform(p.id)}
                  style={{
                    padding: '8px 15px',
                    borderRadius: 9,
                    border: `1px solid ${platform === p.id ? p.border : 'rgba(255,255,255,0.07)'}`,
                    background: platform === p.id ? p.bg : 'rgba(255,255,255,0.03)',
                    color: platform === p.id ? p.color : 'var(--text-muted)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    transition: 'all 0.15s',
                  }}
                >
                  {p.icon} {p.label}
                </button>
              ))}
            </div>
          </SectionCard>

          {/* AI Generator */}
          <SectionCard>
            <SectionLabel>AI Post Generator</SectionLabel>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input
                value={topic}
                onChange={e => setTopic(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && generateWithAI()}
                placeholder="What's this post about?"
                style={{
                  flex: 1,
                  background: 'var(--surface)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 9,
                  padding: '9px 13px',
                  color: 'var(--text-primary)',
                  fontSize: 13.5,
                }}
              />
              <select
                value={tone}
                onChange={e => setTone(e.target.value)}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 9,
                  padding: '9px 13px',
                  color: 'var(--text-primary)',
                  fontSize: 13.5,
                  cursor: 'pointer',
                }}
              >
                <option value="professional">Professional</option>
                <option value="casual">Casual</option>
                <option value="funny">Funny</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <button
              onClick={generateWithAI}
              disabled={generating}
              style={{
                background: generating
                  ? 'rgba(99,102,241,0.3)'
                  : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: '#fff',
                border: 'none',
                borderRadius: 9,
                padding: '10px 20px',
                fontWeight: 600,
                fontSize: 13.5,
                cursor: generating ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'all 0.15s',
                boxShadow: generating ? 'none' : '0 2px 12px rgba(99,102,241,0.3)',
              }}
              onMouseEnter={e => { if (!generating) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.42)' }}}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = generating ? 'none' : '0 2px 12px rgba(99,102,241,0.3)' }}
            >
              {generating ? (
                <>
                  <div className="spinner" />
                  Generating...
                </>
              ) : (
                <>
                  <span>✨</span> Generate with AI
                </>
              )}
            </button>

            {generated.length > 0 && (
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {generated.map((post, i) => (
                  <button
                    key={i}
                    onClick={() => setContent(post)}
                    style={{
                      background: content === post ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${content === post ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.05)'}`,
                      borderRadius: 10,
                      padding: '11px 13px',
                      color: 'var(--text-primary)',
                      fontSize: 13,
                      textAlign: 'left',
                      cursor: 'pointer',
                      lineHeight: 1.55,
                      transition: 'all 0.15s',
                      animation: `slideIn 0.2s ease ${i * 0.05}s both`,
                    }}
                    onMouseEnter={e => { if (content !== post) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                    onMouseLeave={e => { if (content !== post) e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                  >
                    <span style={{
                      color: '#a5b4fc',
                      fontSize: 10.5,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      display: 'block',
                      marginBottom: 5,
                    }}>
                      Option {i + 1}
                    </span>
                    {post.substring(0, 140)}{post.length > 140 ? '...' : ''}
                  </button>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Content editor */}
          <SectionCard>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <SectionLabel>Content</SectionLabel>
              <CharCounter count={charCount} limit={plat.limit} />
            </div>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder={`Write your ${plat.label} post...`}
              style={{
                width: '100%',
                background: 'var(--surface)',
                border: `1px solid ${overLimit ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 10,
                padding: '13px 14px',
                color: 'var(--text-primary)',
                fontSize: 13.5,
                minHeight: 160,
                resize: 'vertical',
                lineHeight: 1.65,
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
            />
          </SectionCard>

          {/* Schedule */}
          <SectionCard>
            <SectionLabel>Schedule (optional)</SectionLabel>
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
              <span style={{ position: 'absolute', left: 12, color: 'var(--text-muted)', pointerEvents: 'none' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </span>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 9,
                  padding: '9px 13px 9px 36px',
                  color: scheduledAt ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: 13.5,
                  cursor: 'pointer',
                  colorScheme: 'dark',
                }}
              />
            </div>
          </SectionCard>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => savePost('draft')}
              disabled={saving}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.04)',
                color: 'var(--text-secondary)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 11,
                padding: '13px',
                fontWeight: 600,
                fontSize: 13.5,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
            >
              Save Draft
            </button>
            <button
              onClick={() => savePost('scheduled')}
              disabled={saving || overLimit}
              style={{
                flex: 2,
                background: saving || overLimit
                  ? 'rgba(99,102,241,0.3)'
                  : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: '#fff',
                border: 'none',
                borderRadius: 11,
                padding: '13px',
                fontWeight: 700,
                fontSize: 14,
                cursor: saving || overLimit ? 'default' : 'pointer',
                transition: 'all 0.15s',
                boxShadow: saving || overLimit ? 'none' : '0 3px 16px rgba(99,102,241,0.35)',
                position: 'relative',
                overflow: 'hidden',
              }}
              onMouseEnter={e => { if (!saving && !overLimit) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(99,102,241,0.45)' }}}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = saving || overLimit ? 'none' : '0 3px 16px rgba(99,102,241,0.35)' }}
            >
              {saving ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <div className="spinner" /> Saving...
                </span>
              ) : (
                <span>Submit for Approval</span>
              )}
            </button>
          </div>
        </div>

        {/* RIGHT - Preview + Image Bank */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Live Preview */}
          <div style={{
            background: 'var(--card)',
            borderRadius: 14,
            padding: 18,
            border: '1px solid var(--border)',
            position: 'sticky',
            top: 62,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span className="section-label" style={{ marginBottom: 0 }}>Live Preview</span>
              <span style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                fontWeight: 600,
                color: plat.color,
                background: plat.bg,
                padding: '3px 8px',
                borderRadius: 6,
                border: `1px solid ${plat.border}`,
              }}>
                {plat.icon} {plat.label}
              </span>
            </div>
            {selectedImage && (
              <img
                src={selectedImage.url}
                alt="selected"
                style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 9, marginBottom: 10 }}
              />
            )}
            <div style={{
              background: 'var(--surface)',
              borderRadius: 9,
              padding: '11px 13px',
              minHeight: 80,
              fontSize: 13.5,
              color: content ? 'var(--text-primary)' : 'var(--text-muted)',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {content || `Your ${plat.label} post preview will appear here...`}
            </div>
          </div>

          {/* Image Bank */}
          <div style={{
            background: 'var(--card)',
            borderRadius: 14,
            padding: 18,
            border: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span className="section-label" style={{ marginBottom: 0 }}>Image Bank</span>
              {images.length > 0 && (
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  background: 'rgba(255,255,255,0.04)',
                  padding: '2px 8px',
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  {images.length} images
                </span>
              )}
            </div>

            {images.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 12.5, textAlign: 'center', padding: '16px 0' }}>
                No images yet. Upload in Image Bank.
              </p>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 6,
                maxHeight: 320,
                overflowY: 'auto',
              }}>
                {images.map(img => {
                  const sel = selectedImage?.name === img.name
                  return (
                    <div
                      key={img.name}
                      onClick={() => setSelectedImage(sel ? null : img)}
                      style={{
                        position: 'relative',
                        borderRadius: 8,
                        overflow: 'hidden',
                        cursor: 'pointer',
                        border: `2px solid ${sel ? '#6366f1' : 'transparent'}`,
                        transition: 'border-color 0.15s',
                        aspectRatio: '1',
                      }}
                    >
                      <img
                        src={img.url}
                        alt={img.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                      {sel && (
                        <div style={{
                          position: 'absolute',
                          inset: 0,
                          background: 'rgba(99,102,241,0.25)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {selectedImage && (
              <div style={{
                marginTop: 10,
                background: 'rgba(99,102,241,0.08)',
                borderRadius: 7,
                padding: '7px 11px',
                fontSize: 11.5,
                color: '#a5b4fc',
                border: '1px solid rgba(99,102,241,0.15)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                {selectedImage.name.length > 28 ? selectedImage.name.substring(0, 28) + '...' : selectedImage.name}
                <button
                  onClick={() => setSelectedImage(null)}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#a5b4fc', cursor: 'pointer', padding: '0 2px', fontSize: 14, lineHeight: 1 }}
                >
                  &times;
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
