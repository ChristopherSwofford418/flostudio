import { useState, useEffect, useRef } from 'react'
import Layout from '../components/Layout.jsx'
import { supabase } from '../supabase'

export default function ImageBank() {
  const [images, setImages] = useState([])
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState('')
  const fileRef = useRef()

  useEffect(() => { loadImages() }, [])

  const loadImages = async () => {
    setLoading(true)
    const { data } = await supabase.storage.from('marketing-assets').list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } })
    if (data) {
      setImages(data.filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name)).map(f => ({
        name: f.name,
        url: `https://xxkpvnokhqbpbqefegxa.supabase.co/storage/v1/object/public/marketing-assets/${encodeURIComponent(f.name)}`,
        size: f.metadata?.size
      })))
    }
    setLoading(false)
  }

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setUploading(true)
    for (const file of files) {
      await supabase.storage.from('marketing-assets').upload(file.name, file, { upsert: true })
    }
    await loadImages()
    setUploading(false)
  }

  const copyUrl = async (url, name) => {
    await navigator.clipboard.writeText(url)
    setCopied(name)
    setTimeout(() => setCopied(''), 2000)
  }

  const deleteImage = async (name) => {
    if (!confirm(`Delete ${name}?`)) return
    await supabase.storage.from('marketing-assets').remove([name])
    loadImages()
  }

  return (
    <Layout title="Image Bank">
      {/* Upload area */}
      <div
        onClick={() => fileRef.current.click()}
        style={{ background: '#1e293b', borderRadius: 16, padding: 32, border: '2px dashed rgba(99,102,241,0.3)', textAlign: 'center', cursor: 'pointer', marginBottom: 24, transition: 'all 0.15s' }}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer; if (f) { const input = fileRef.current; input.files = f.files; handleUpload({ target: input }) } }}
      >
        <input ref={fileRef} type="file" multiple accept="image/*" onChange={handleUpload} style={{ display: 'none' }} />
        <div style={{ fontSize: 40, marginBottom: 12 }}>{uploading ? '⏳' : '📤'}</div>
        <p style={{ color: '#94a3b8', fontSize: 15, fontWeight: 500 }}>{uploading ? 'Uploading...' : 'Click or drag images to upload'}</p>
        <p style={{ color: '#475569', fontSize: 13, marginTop: 4 }}>JPG, PNG, WEBP, GIF supported</p>
      </div>

      {/* Images grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#475569' }}>Loading images...</div>
      ) : images.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#475569' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🖼️</div>
          <p>No images yet. Upload your brand assets to get started.</p>
        </div>
      ) : (
        <>
          <p style={{ color: '#475569', fontSize: 13, marginBottom: 16 }}>{images.length} images in your bank</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
            {images.map(img => (
              <div key={img.name} style={{ background: '#1e293b', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
                <img src={img.url} alt={img.name} style={{ width: '100%', height: 150, objectFit: 'cover' }} />
                <div style={{ padding: 12 }}>
                  <p style={{ color: '#94a3b8', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 8 }} title={img.name}>{img.name}</p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => copyUrl(img.url, img.name)}
                      style={{ flex: 1, background: copied === img.name ? 'rgba(16,185,129,0.15)' : 'rgba(99,102,241,0.15)', color: copied === img.name ? '#10b981' : '#a5b4fc', border: 'none', borderRadius: 6, padding: '6px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                      {copied === img.name ? '✓ Copied' : 'Copy URL'}
                    </button>
                    <button onClick={() => deleteImage(img.name)}
                      style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: 'none', borderRadius: 6, padding: '6px 8px', fontSize: 11, cursor: 'pointer' }}>
                      🗑️
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
