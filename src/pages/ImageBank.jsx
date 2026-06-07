import { useState, useEffect, useRef } from 'react'
import Layout from '../components/Layout.jsx'
import { supabase } from '../supabase'

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ImageBank() {
  const [images, setImages] = useState([])
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState('')
  const [dragging, setDragging] = useState(false)
  const [hoveredImg, setHoveredImg] = useState(null)
  const fileRef = useRef()

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
    handleUpload(e.dataTransfer.files)
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

  return (
    <Layout title="Image Bank">
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
