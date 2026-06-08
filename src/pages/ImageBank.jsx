import { useState, useEffect, useRef } from 'react'
import Layout from '../components/Layout.jsx'
import { supabase } from '../supabase'

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4a3B2bm9raHFicGJxZWZlZ3hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMDI1NDgsImV4cCI6MjA5MTc3ODU0OH0.OVdLzh2Bvuf4l6F6ITSpj4pWqoc3EoTxs6OCvrMf4JU'

export default function ImageBank() {
  const [images, setImages] = useState([])
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState('')
  const [dragging, setDragging] = useState(false)
  const [hoveredImg, setHoveredImg] = useState(null)
  const fileRef = useRef()
  // AI Image Generator
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiStyle, setAiStyle] = useState('professional')
  const [generatingAI, setGeneratingAI] = useState(false)
  const [aiError, setAiError] = useState('')
  const [generatedImages, setGeneratedImages] = useState([])
  const [referenceImage, setReferenceImage] = useState(null)
  const [draggingToAI, setDraggingToAI] = useState(false)
  const [showImagePicker, setShowImagePicker] = useState(false)

  useEffect(() => { loadImages() }, [])

  const loadImages = async () => {
    setLoading(true)
    const { data } = await supabase.storage
      .from('marketing-assets')
      .list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } })
    if (data) {
      setImages(
        data
          .filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name))
          .map(f => ({
            name: f.name,
            url: `https://xxkpvnokhqbpbqefegxa.supabase.co/storage/v1/object/public/marketing-assets/${encodeURIComponent(f.name)}`,
            size: f.metadata?.size,
          }))
      )
    }
    setLoading(false)
  }

  const handleUpload = async (files) => {
    if (!files || !files.length) return
    setUploading(true)
    for (const file of Array.from(files)) {
      await supabase.storage.from('marketing-assets').upload(file.name, file, { upsert: true })
    }
    await loadImages()
    setUploading(false)
  }

  const onFileChange = (e) => handleUpload(e.target.files)

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    // Only handle file drops, not image URL drags from bank
    if (e.dataTransfer.files?.length > 0) {
      handleUpload(e.dataTransfer.files)
    }
  }

  const copyUrl = async (url, name) => {
    await navigator.clipboard.writeText(url)
    setCopied(name)
    setTimeout(() => setCopied(''), 2000)
  }

  const deleteImage = async (name) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    await supabase.storage.from('marketing-assets').remove([name])
    loadImages()
  }

  const generateAIImage = async () => {
    if (!aiPrompt.trim()) return
    setGeneratingAI(true)
    setAiError('')
    setGeneratedImages([])
    try {
      const styleMap = {
        professional: 'photorealistic, ultra high quality, professional corporate photography, 8K resolution, crisp sharp focus, studio lighting, real people and real environments, no cartoon or illustration, no text overlays',
        social: 'photorealistic, vibrant professional photography, high quality, social media marketing image, natural lighting, real people, no cartoon or illustration, no text overlays',
        minimal: 'photorealistic, minimalist professional photography, clean white studio background, sharp focus, product photography quality, no cartoon or illustration, no text overlays',
        dark: 'photorealistic, modern dark tech aesthetic, professional photography, dramatic lighting, sharp focus, no cartoon or illustration, no text overlays',
      }
      const brandContext = 'This is a marketing image for ClearPass, a credential management platform used by healthcare staffing agencies, travel nurses, and compliance teams. '
      const refNote = referenceImage ? ` Match the composition and visual style of the reference image.` : ''
      const fullPrompt = `${brandContext}${aiPrompt}.${refNote} Style: ${styleMap[aiStyle]}. Make it look like a real premium stock photo, not AI generated.`
      // Single call - gpt-image-1 supports n=2
      const res = await fetch('https://xxkpvnokhqbpbqefegxa.supabase.co/functions/v1/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON}`, 'apikey': ANON },
        body: JSON.stringify({ prompt: fullPrompt, n: 2, size: '1024x1024' })
      })
      const data = await res.json()
      const imgs = data.images || []
      if (imgs.length) {
        setGeneratedImages(imgs)
      } else {
        setAiError(data.error || 'Could not generate images. Please try again.')
      }
    } catch (e) {
      setAiError('Generation failed: ' + e.message)
    }
    setGeneratingAI(false)
  }

  const saveAIImage = async (imageUrl) => {
    try {
      const filename = `ai-generated-${Date.now()}.png`
      let blob
      if (imageUrl.startsWith('data:')) {
        // Base64 image
        const base64 = imageUrl.split(',')[1]
        const bytes = atob(base64)
        const arr = new Uint8Array(bytes.length)
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
        blob = new Blob([arr], { type: 'image/png' })
      } else {
        const res = await fetch(imageUrl)
        blob = await res.blob()
      }
      await supabase.storage.from('marketing-assets').upload(filename, blob, { contentType: 'image/png', upsert: true })
      await loadImages()
      setGeneratedImages([])
      setAiPrompt('')
      alert('Image saved to your bank!')
    } catch (e) {
      alert('Could not save image: ' + e.message)
    }
  }

  return (
    <Layout title="Image Bank">

      {/* AI Image Generator */}
      <div style={{ background: 'linear-gradient(135deg, #0d1a2e, #111827)', borderRadius: 16, padding: 24, border: '1px solid rgba(139,92,246,0.2)', marginBottom: 24, boxShadow: '0 4px 30px rgba(139,92,246,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>✨</div>
          <div>
            <h3 style={{ color: '#fff', fontSize: 15, fontWeight: 700, margin: 0 }}>AI Image Generator</h3>
            <p style={{ color: '#64748b', fontSize: 12, margin: 0 }}>Generate marketing images with DALL-E 3</p>
          </div>
        </div>

        {/* Reference image picker */}
        <div style={{ marginBottom: 12 }}>
          {referenceImage ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 12, padding: '10px 14px' }}>
              <img src={referenceImage} alt="Reference" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8 }} />
              <div style={{ flex: 1 }}>
                <div style={{ color: '#a5b4fc', fontSize: 13, fontWeight: 600 }}>Reference image set</div>
                <div style={{ color: '#64748b', fontSize: 12 }}>AI will match this style</div>
              </div>
              <button onClick={() => setReferenceImage(null)} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, color: '#f87171', cursor: 'pointer', fontSize: 12, padding: '5px 10px', fontWeight: 600 }}>Remove</button>
            </div>
          ) : (
            <button
              onClick={() => setShowImagePicker(true)}
              style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '2px dashed rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 20px', color: '#64748b', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.4)'; e.currentTarget.style.color = '#a5b4fc' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#64748b' }}
            >
              <span style={{ fontSize: 18 }}>🖼️</span>
              <span>Select a reference image from your bank <span style={{ opacity: 0.6 }}>(optional)</span></span>
            </button>
          )}

          {/* Image picker modal */}
          {showImagePicker && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24 }}>
              <div style={{ background: '#0d1525', borderRadius: 16, padding: 24, width: '100%', maxWidth: 600, border: '1px solid rgba(255,255,255,0.08)', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>Select Reference Image</h3>
                  <button onClick={() => setShowImagePicker(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 20 }}>×</button>
                </div>
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    {images.map(img => (
                      <img key={img.name} src={img.url} alt={img.name}
                        onClick={() => { setReferenceImage(img.url); setShowImagePicker(false) }}
                        style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, cursor: 'pointer', border: '2px solid transparent', transition: 'all 0.15s' }}
                        onMouseEnter={e => e.target.style.borderColor = '#6366f1'}
                        onMouseLeave={e => e.target.style.borderColor = 'transparent'}
                      />
                    ))}
                  </div>
                  {images.length === 0 && <p style={{ color: '#64748b', textAlign: 'center', padding: 24 }}>No images in your bank yet. Upload some first.</p>}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Quick prompt suggestions */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          <span style={{ color: '#475569', fontSize: 11, paddingTop: 3 }}>Quick:</span>
          {[
            'Nurse on phone smiling in hospital hallway',
            'Healthcare team meeting in modern office',
            'HR manager reviewing digital documents on tablet',
            'Staffing agency professional at computer',
            'Doctor using smartphone app',
          ].map(s => (
            <button key={s} onClick={() => setAiPrompt(s)}
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, padding: '3px 10px', color: '#64748b', fontSize: 11, cursor: 'pointer' }}
              onMouseEnter={e => { e.target.style.borderColor = 'rgba(99,102,241,0.4)'; e.target.style.color = '#a5b4fc' }}
              onMouseLeave={e => { e.target.style.borderColor = 'rgba(255,255,255,0.07)'; e.target.style.color = '#64748b' }}>
              {s.length > 30 ? s.substring(0, 30) + '...' : s}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, marginBottom: 12 }}>
          <input
            value={aiPrompt}
            onChange={e => setAiPrompt(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && generateAIImage()}
            placeholder="Describe the image... e.g. 'Nurse smiling while using mobile app in hospital'"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '11px 14px', color: '#fff', fontSize: 14 }}
          />
          <select value={aiStyle} onChange={e => setAiStyle(e.target.value)}
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '11px 14px', color: '#e2e8f0', fontSize: 13 }}>
            <option value="professional" style={{ background: '#111827' }}>📸 Corporate Photo</option>
            <option value="social" style={{ background: '#111827' }}>📱 Social/Lifestyle</option>
            <option value="minimal" style={{ background: '#111827' }}>⬜ Clean Studio</option>
            <option value="dark" style={{ background: '#111827' }}>🌙 Dark/Tech</option>
          </select>
          <button onClick={generateAIImage} disabled={generatingAI || !aiPrompt.trim()}
            style={{ background: aiPrompt.trim() ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#1e293b', color: aiPrompt.trim() ? '#fff' : '#475569', border: 'none', borderRadius: 10, padding: '11px 20px', fontWeight: 700, fontSize: 14, cursor: aiPrompt.trim() ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}>
            {generatingAI ? 'Generating...' : '✨ Generate'}
          </button>
        </div>

        {aiError && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>⚠️ {aiError}</div>}

        {generatingAI && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#94a3b8', fontSize: 13, padding: '12px 0' }}>
            <div style={{ width: 18, height: 18, border: '2px solid rgba(99,102,241,0.3)', borderTop: '2px solid #6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            Creating your images with DALL-E 3...
          </div>
        )}

        {generatedImages.length > 0 && (
          <div>
            <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 12 }}>2 images generated. Click to save to your bank:</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {generatedImages.map((imgUrl, i) => (
                <div key={i} style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <img src={imgUrl} alt={`Generated ${i+1}`} style={{ width: '100%', display: 'block' }} />
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.8))', padding: '20px 12px 12px', display: 'flex', gap: 8 }}>
                    <button onClick={() => saveAIImage(imgUrl)}
                      style={{ flex: 1, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                      Save to Bank
                    </button>
                    <a href={imgUrl} target="_blank" rel="noreferrer"
                      style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 12px', fontSize: 13, textDecoration: 'none' }}>
                      Open
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Upload zone */}
      <div
        onClick={() => fileRef.current.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={{
          background: dragging
            ? 'rgba(99,102,241,0.08)'
            : 'rgba(255,255,255,0.015)',
          borderRadius: 16,
          padding: '32px 24px',
          border: `2px dashed ${dragging ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.1)'}`,
          textAlign: 'center',
          cursor: 'pointer',
          marginBottom: 28,
          transition: 'all 0.2s ease',
          boxShadow: dragging ? '0 0 0 4px rgba(99,102,241,0.1)' : 'none',
        }}
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*"
          onChange={onFileChange}
          style={{ display: 'none' }}
        />
        <div style={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: dragging ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${dragging ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.08)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 14px',
          transition: 'all 0.2s',
        }}>
          {uploading ? (
            <div className="spinner" style={{ width: 20, height: 20 }} />
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={dragging ? '#a5b4fc' : '#64748b'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
              <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/>
            </svg>
          )}
        </div>
        <p style={{ color: dragging ? '#a5b4fc' : 'var(--text-secondary)', fontSize: 14, fontWeight: 500, marginBottom: 4, transition: 'color 0.15s' }}>
          {uploading ? 'Uploading...' : dragging ? 'Drop to upload' : 'Click or drag images to upload'}
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          JPG, PNG, WEBP, GIF supported
        </p>
      </div>

      {/* Count badge + grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <div className="spinner" style={{ margin: '0 auto', width: 24, height: 24 }} />
        </div>
      ) : images.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 40px', animation: 'fadeIn 0.3s ease' }}>
          <div style={{ fontSize: 52, marginBottom: 14, opacity: 0.7 }}>🖼️</div>
          <h3 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No images yet</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Upload your brand assets to get started.</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>
              <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>{images.length}</span> image{images.length !== 1 ? 's' : ''} in your bank
            </p>
          </div>

          {/* Masonry-ish grid using CSS columns */}
          <div style={{
            columns: 'auto 220px',
            columnGap: 14,
            animation: 'fadeIn 0.3s ease',
          }}>
            {images.map((img, i) => (
              <div
                key={img.name}
                draggable="true"
                onDragStart={e => {
                  e.dataTransfer.setData('text/plain', img.url)
                  e.dataTransfer.setData('text/uri-list', img.url)
                  e.dataTransfer.setData('URL', img.url)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                onMouseEnter={() => setHoveredImg(img.name)}
                onMouseLeave={() => setHoveredImg(null)}
                style={{
                  position: 'relative',
                  borderRadius: 12,
                  overflow: 'hidden',
                  border: '1px solid var(--border)',
                  marginBottom: 14,
                  breakInside: 'avoid',
                  background: 'var(--card)',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                  transform: hoveredImg === img.name ? 'scale(1.01)' : 'scale(1)',
                  boxShadow: hoveredImg === img.name ? '0 8px 24px rgba(0,0,0,0.3)' : 'none',
                  animation: `fadeIn 0.3s ease ${Math.min(i, 8) * 0.03}s both`,
                }}
              >
                <img
                  src={img.url}
                  alt={img.name}
                  style={{ width: '100%', display: 'block', borderRadius: 0 }}
                  loading="lazy"
                />

                {/* Hover overlay */}
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(to top, rgba(8,14,26,0.92) 0%, rgba(8,14,26,0.4) 50%, transparent 100%)',
                  opacity: hoveredImg === img.name ? 1 : 0,
                  transition: 'opacity 0.18s',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  padding: '12px',
                }}>
                  <p style={{
                    color: 'rgba(255,255,255,0.8)',
                    fontSize: 11.5,
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginBottom: 8,
                  }}>
                    {img.name}
                    {img.size && <span style={{ color: 'rgba(255,255,255,0.45)', marginLeft: 6 }}>{formatBytes(img.size)}</span>}
                  </p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => copyUrl(img.url, img.name)}
                      style={{
                        flex: 1,
                        background: copied === img.name
                          ? 'rgba(16,185,129,0.85)'
                          : 'rgba(99,102,241,0.85)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 7,
                        padding: '7px 10px',
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 5,
                        transition: 'background 0.15s',
                        backdropFilter: 'blur(4px)',
                      }}
                    >
                      {copied === img.name ? (
                        <>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                          Copied
                        </>
                      ) : (
                        <>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                          </svg>
                          Copy URL
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => deleteImage(img.name)}
                      style={{
                        background: 'rgba(239,68,68,0.75)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 7,
                        padding: '7px 10px',
                        fontSize: 11.5,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        fontWeight: 600,
                        transition: 'background 0.15s',
                        backdropFilter: 'blur(4px)',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.95)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.75)'}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                        <path d="M10 11v6"/><path d="M14 11v6"/>
                        <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                      </svg>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Layout>
  )
}
