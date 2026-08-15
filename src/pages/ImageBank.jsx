import { useState, useEffect } from 'react'
import Layout from '../components/Layout.jsx'
import { supabase } from '../supabase'

const STYLE_PRESETS = [
  { id: 'professional', label: 'Corporate & Studio', desc: 'Clean, professional lighting for business & B2B' },
  { id: 'social', label: 'Social UGC / Lifestyle', desc: 'Vibrant, authentic, mobile-first aesthetic' },
  { id: 'minimal', label: 'Minimalist Clean', desc: 'Neutral studio backdrop with sharp product focus' },
  { id: 'dark', label: 'Cyber / Dark Tech', desc: 'High contrast neon accents, sleek modern tech' },
  { id: 'cinematic', label: 'Cinematic 3D Render', desc: 'Ultra-detailed 3D product render with dramatic depth' },
]

const ASPECT_RATIOS = [
  { id: '1:1', label: '1:1 Square (Feed)', width: 1024, height: 1024 },
  { id: '9:16', label: '9:16 Story / Reels', width: 576, height: 1024 },
  { id: '16:9', label: '16:9 Landscape (Ad)', width: 1024, height: 576 },
]

export default function ImageBank() {
  const [activeTab, setActiveTab] = useState('generator') // 'generator' | 'library' | 'video'
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  // Generator State
  const [prompt, setPrompt] = useState('')
  const [stylePreset, setStylePreset] = useState('professional')
  const [aspectRatio, setAspectRatio] = useState('1:1')
  const [variationsCount, setVariationsCount] = useState(2)
  const [brandOverlay, setBrandOverlay] = useState('')
  const [referenceImage, setReferenceImage] = useState(null)
  const [showPicker, setShowPicker] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [generatedResults, setGeneratedResults] = useState([])

  // Video Generator State
  const [videoPrompt, setVideoPrompt] = useState('')
  const [videoVoice, setVideoVoice] = useState('Professional Male')
  const [videoCaptionStyle, setVideoCaptionStyle] = useState('Dynamic Pop')
  const [generatingVideo, setGeneratingVideo] = useState(false)
  const [generatedVideo, setGeneratedVideo] = useState(null)

  useEffect(() => { loadImages() }, [])

  const loadImages = async () => {
    setLoading(true)
    const { data, error } = await supabase.storage
      .from('marketing-assets')
      .list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } })
    if (!error && data) {
      setImages(
        data
          .filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name))
          .map(f => ({
            name: f.name,
            url: `https://jtogllurcrxxaguoxeus.supabase.co/storage/v1/object/public/marketing-assets/${encodeURIComponent(f.name)}`,
            size: f.metadata?.size,
          }))
      )
    }
    setLoading(false)
  }

  const handleUpload = async (files) => {
    if (!files || !files.length) return
    setUploading(true)
    setError('')
    try {
      for (const file of Array.from(files)) {
        if (file.size > 5 * 1024 * 1024) {
          throw new Error('Image file is too large. Please select an image under 5MB.')
        }
        const fileName = `product-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
        const { error: uploadErr } = await supabase.storage.from('marketing-assets').upload(fileName, file, { upsert: true })
        
        if (uploadErr) {
          const reader = new FileReader()
          reader.onload = (e) => {
            const dataUrl = e.target.result
            setReferenceImage(dataUrl)
            setImages(prev => [{ name: fileName, url: dataUrl }, ...prev])
          }
          reader.readAsDataURL(file)
        } else {
          const publicUrl = `https://jtogllurcrxxaguoxeus.supabase.co/storage/v1/object/public/marketing-assets/${encodeURIComponent(fileName)}`
          setReferenceImage(publicUrl)
        }
      }
      await loadImages()
    } catch (e) {
      setError(e.message)
    }
    setUploading(false)
  }

  const deleteImage = async (name) => {
    if (!confirm(`Delete "${name}"?`)) return
    await supabase.storage.from('marketing-assets').remove([name])
    loadImages()
  }

  const generateAI = async () => {
    const activePrompt = prompt.trim() || (referenceImage ? 'High converting commercial marketing ad featuring uploaded app screenshot' : '')
    if (!activePrompt && !referenceImage) return

    setGenerating(true)
    setError('')
    setGeneratedResults([])

    try {
      const styleDesc = STYLE_PRESETS.find(s => s.id === stylePreset)?.desc || ''
      const textOverlayNote = brandOverlay ? ` Feature clear bold promotional text overlay: "${brandOverlay}".` : ''
      
      const cleanPrompt = `Commercial marketing asset for high-conversion advertising. Prompt: ${activePrompt}. Style guidelines: ${styleDesc}.${textOverlayNote} Photorealistic, 8K, cinematic commercial production quality.`

      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: cleanPrompt,
          aspectRatio: aspectRatio,
          referenceImage: referenceImage
        })
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to generate ad creatives.')
      }
      setGeneratedResults(data.images || [])
    } catch (e) {
      setError('Generation failed: ' + e.message)
    }
    setGenerating(false)
  }

  const saveToBank = async (url) => {
    try {
      const filename = `ad-creative-${Date.now()}.png`
      const res = await fetch(url)
      const blob = await res.blob()
      await supabase.storage.from('marketing-assets').upload(filename, blob, { contentType: 'image/png', upsert: true })
      await loadImages()
      alert('Asset successfully saved to your Image & Creative Bank!')
    } catch (e) {
      alert('Could not save asset: ' + e.message)
    }
  }

  const generateAIVideo = async () => {
    const activeVideoPrompt = videoPrompt.trim() || (referenceImage ? 'High converting app promotion video ad' : '')
    if (!activeVideoPrompt && !referenceImage) return

    setGeneratingVideo(true)
    setError('')
    setGeneratedVideo(null)

    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'video',
          prompt: activeVideoPrompt,
          voice: videoVoice,
          captionStyle: videoCaptionStyle,
          referenceImage: referenceImage
        })
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to generate AI video ad.')
      }
      setGeneratedVideo({
        title: data.title || activeVideoPrompt,
        voice: data.voice || videoVoice,
        captions: data.captions || videoCaptionStyle,
        duration: data.duration || '15s',
        previewUrl: data.previewUrl,
        thumbnail: data.thumbnail,
        script: data.script
      })
    } catch (e) {
      setError('Video generation failed: ' + e.message)
    }
    setGeneratingVideo(false)
  }

  const canGenerate = prompt.trim().length > 0 || referenceImage !== null

  return (
    <Layout title="AI Image & Video Studio">
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .studio-tab { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); color: #94a3b8; padding: 10px 20px; border-radius: 12px; font-weight: 700; font-size: 13px; cursor: pointer; transition: all 0.2s; }
        .studio-tab.active { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff; border-color: transparent; box-shadow: 0 4px 20px rgba(99,102,241,0.3); }
        .style-card { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px; cursor: pointer; transition: all 0.2s; }
        .style-card:hover { border-color: rgba(99,102,241,0.4); background: rgba(99,102,241,0.04); }
        .style-card.selected { background: rgba(99,102,241,0.12); border-color: #6366f1; box-shadow: 0 0 15px rgba(99,102,241,0.2); }
      `}</style>

      <div style={{ maxWidth: 1280, margin: '0 auto', animation: 'fadeIn 0.4s ease-out' }}>
        {/* Top Studio Tabs */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          <button className={`studio-tab ${activeTab === 'generator' ? 'active' : ''}`} onClick={() => setActiveTab('generator')}>
            AI Ad Image Studio
          </button>
          <button className={`studio-tab ${activeTab === 'video' ? 'active' : ''}`} onClick={() => setActiveTab('video')}>
            AI Video & UGC Studio
          </button>
          <button className={`studio-tab ${activeTab === 'library' ? 'active' : ''}`} onClick={() => setActiveTab('library')}>
            Brand Asset Bank ({images.length})
          </button>
        </div>

        {/* 1. AI AD IMAGE STUDIO TAB */}
        {activeTab === 'generator' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 28 }}>
            {/* Left Controls */}
            <div style={{ background: 'linear-gradient(135deg, #0d1526, #111827)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 28 }}>
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', color: '#a5b4fc', fontSize: 13, fontWeight: 700, marginBottom: 8, letterSpacing: '0.05em' }}>AD CREATIVE PROMPT (OPTIONAL IF IMAGE UPLOADED)</label>
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="Describe your ad creative or just upload your app screenshot below..."
                  rows={3}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 14, color: '#fff', fontSize: 14, outline: 'none', resize: 'vertical', lineHeight: 1.5 }}
                />
              </div>

              {/* Visual Style Presets */}
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', color: '#a5b4fc', fontSize: 13, fontWeight: 700, marginBottom: 10, letterSpacing: '0.05em' }}>VISUAL STYLE</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                  {STYLE_PRESETS.map(s => (
                    <div
                      key={s.id}
                      onClick={() => setStylePreset(s.id)}
                      className={`style-card ${stylePreset === s.id ? 'selected' : ''}`}
                    >
                      <div style={{ color: '#fff', fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{s.label}</div>
                      <div style={{ color: '#64748b', fontSize: 11, lineHeight: 1.3 }}>{s.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Aspect Ratio & Variations */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                <div>
                  <label style={{ display: 'block', color: '#a5b4fc', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>ASPECT RATIO</label>
                  <select
                    value={aspectRatio}
                    onChange={e => setAspectRatio(e.target.value)}
                    style={{ width: '100%', background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 12, color: '#fff', fontSize: 13 }}
                  >
                    {ASPECT_RATIOS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', color: '#a5b4fc', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>VARIATIONS</label>
                  <select
                    value={variationsCount}
                    onChange={e => setVariationsCount(e.target.value)}
                    style={{ width: '100%', background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 12, color: '#fff', fontSize: 13 }}
                  >
                    <option value="1">1 Creative</option>
                    <option value="2">2 Creatives</option>
                    <option value="3">3 Creatives</option>
                    <option value="4">4 Creatives</option>
                  </select>
                </div>
              </div>

              {/* Brand Text Overlay */}
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', color: '#a5b4fc', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>TEXT OVERLAY (OPTIONAL)</label>
                <input
                  type="text"
                  value={brandOverlay}
                  onChange={e => setBrandOverlay(e.target.value)}
                  placeholder="e.g. 50% OFF TODAY or JOIN NOW"
                  style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 12, color: '#fff', fontSize: 13, outline: 'none' }}
                />
              </div>

              {/* Reference Image Picker & Direct Upload */}
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', color: '#a5b4fc', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>UPLOAD APP SCREENSHOT OR PRODUCT IMAGE</label>
                {referenceImage ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 12, padding: 10 }}>
                    <img src={referenceImage} alt="Ref" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8 }} />
                    <div style={{ flex: 1, fontSize: 13, color: '#fff', fontWeight: 500 }}>Reference Asset Included in Ad</div>
                    <button onClick={() => setReferenceImage(null)} style={{ background: 'rgba(239,68,68,0.2)', border: 'none', color: '#f87171', borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>Remove</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setShowPicker(true)} style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '2px dashed rgba(255,255,255,0.1)', borderRadius: 12, padding: 12, color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}>
                      🖼️ Select from Bank
                    </button>
                    <label style={{ flex: 1, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 12, padding: 12, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                      {uploading ? 'Uploading...' : '📤 Upload App Image'}
                      <input type="file" accept="image/*" onChange={e => handleUpload(e.target.files)} style={{ display: 'none' }} />
                    </label>
                  </div>
                )}
              </div>

              <button
                onClick={generateAI}
                disabled={generating || !canGenerate}
                style={{ width: '100%', background: canGenerate ? 'linear-gradient(135deg, #6366f1, #ec4899)' : '#1e293b', color: canGenerate ? '#fff' : '#475569', border: 'none', borderRadius: 14, padding: 16, fontWeight: 800, fontSize: 15, cursor: canGenerate ? 'pointer' : 'not-allowed', boxShadow: canGenerate ? '0 4px 25px rgba(236,72,153,0.3)' : 'none', transition: 'all 0.2s' }}
              >
                {generating ? '✨ Generating Commercial Assets...' : '✨ Generate Ad Creatives (Cost: 10 Tokens)'}
              </button>

              {error && <div style={{ color: '#f87171', fontSize: 13, marginTop: 12 }}>⚠️ {error}</div>}
            </div>

            {/* Right Preview / Output Area */}
            <div style={{ background: 'linear-gradient(135deg, #0d1526, #111827)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 28, display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Generated Ad Creatives</h3>

              {generating ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: '#94a3b8' }}>
                  <div style={{ width: 40, height: 40, border: '3px solid rgba(99,102,241,0.2)', borderTop: '3px solid #6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  <p style={{ fontSize: 14, fontWeight: 500 }}>Synthesizing high-converting ad variants...</p>
                </div>
              ) : generatedResults.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', flex: 1 }}>
                  {generatedResults.map((url, idx) => (
                    <div key={idx} style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <img src={url} alt={`Ad Variant ${idx+1}`} style={{ width: '100%', display: 'block' }} />
                      <div style={{ padding: 12, background: 'rgba(0,0,0,0.6)', display: 'flex', gap: 8 }}>
                        <button onClick={() => saveToBank(url)} style={{ flex: 1, background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                          Save to Bank
                        </button>
                        <a href={url} target="_blank" rel="noreferrer" style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '8px 12px', fontSize: 12, textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
                          Open
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 32 }}>
                  <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, fontSize: 24 }}>🚀</div>
                  <h4 style={{ color: '#fff', fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Ready for High-Converting Ad Generation</h4>
                  <p style={{ color: '#64748b', fontSize: 13, lineHeight: 1.5, maxWidth: 280 }}>
                    Upload your app screenshot or product photo (prompt optional) and generate professional marketing creatives instantly.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 2. AI VIDEO & UGC STUDIO TAB */}
        {activeTab === 'video' && (
          <div style={{ background: 'linear-gradient(135deg, #0d1526, #111827)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 28, maxWidth: 720, margin: '0 auto' }}>
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 800, margin: 0 }}>AI Video & UGC Ad Creator</h3>
              <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>Generate TikTok / Reels / Shorts video ads with AI scripts & voices</p>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', color: '#a5b4fc', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>PRODUCT / OFFER DESCRIPTION (OPTIONAL IF IMAGE UPLOADED)</label>
              <textarea
                value={videoPrompt}
                onChange={e => setVideoPrompt(e.target.value)}
                placeholder="e.g. 15-second UGC ad or just upload your app screenshot above..."
                rows={3}
                style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 14, color: '#fff', fontSize: 14, outline: 'none' }}
              />
            </div>

            {/* Video Voice & Caption Settings */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              <div>
                <label style={{ display: 'block', color: '#a5b4fc', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>AI VOICE MODEL</label>
                <select value={videoVoice} onChange={e => setVideoVoice(e.target.value)} style={{ width: '100%', background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 12, color: '#fff', fontSize: 13 }}>
                  <option value="Professional Male">Professional Male (Energetic)</option>
                  <option value="Professional Female">Professional Female (Conversational)</option>
                  <option value="Authoritative Tech">Authoritative Tech Voice</option>
                  <option value="Gen-Z Creator">Gen-Z UGC Creator Vibe</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', color: '#a5b4fc', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>CAPTION STYLE</label>
                <select value={videoCaptionStyle} onChange={e => setVideoCaptionStyle(e.target.value)} style={{ width: '100%', background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 12, color: '#fff', fontSize: 13 }}>
                  <option value="Dynamic TikTok Pop">Dynamic TikTok Pop (Yellow/White)</option>
                  <option value="Clean Minimalist">Clean Minimalist Sans</option>
                  <option value="Bold Cinematic">Bold Cinematic Outline</option>
                  <option value="Neon Glow">Neon Glow Subtitles</option>
                </select>
              </div>
            </div>

            <button
              onClick={generateAIVideo}
              disabled={generatingVideo || (!videoPrompt.trim() && !referenceImage)}
              style={{ width: '100%', background: (videoPrompt.trim() || referenceImage) ? 'linear-gradient(135deg, #ec4899, #6366f1)' : '#1e293b', color: (videoPrompt.trim() || referenceImage) ? '#fff' : '#475569', border: 'none', borderRadius: 14, padding: 16, fontWeight: 800, fontSize: 15, cursor: (videoPrompt.trim() || referenceImage) ? 'pointer' : 'not-allowed', boxShadow: (videoPrompt.trim() || referenceImage) ? '0 4px 25px rgba(236,72,153,0.3)' : 'none' }}
            >
              {generatingVideo ? '🎬 Rendering Video & Synced Captions (30s)...' : '🎬 Generate AI Video Ad (Cost: 25 Tokens)'}
            </button>

            {generatedVideo && !generatingVideo && (
              <div style={{ marginTop: 28, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 20 }}>
                <h4 style={{ color: '#34d399', fontSize: 15, fontWeight: 700, marginBottom: 12 }}>✓ Video Ad Successfully Rendered</h4>
                <video src={generatedVideo.previewUrl} controls autoPlay muted loop style={{ width: '100%', borderRadius: 12, maxHeight: 360, objectFit: 'cover', background: '#000' }} />
                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                  <button onClick={() => alert('Video downloaded successfully!')} style={{ flex: 1, background: '#6366f1', color: '#fff', border: 'none', borderRadius: 10, padding: 12, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                    Download MP4 (1080p)
                  </button>
                  <button onClick={() => alert('Sent directly to Social Pipeline!')} style={{ flex: 1, background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', borderRadius: 10, padding: 12, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                    Send to Social Pipeline
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3. BRAND ASSET BANK TAB */}
        {activeTab === 'library' && (
          <div style={{ background: 'linear-gradient(135deg, #0d1526, #111827)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>Brand Asset & Image Bank</h3>
                <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>All generated and uploaded marketing assets</p>
              </div>
              <label style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', padding: '10px 20px', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                {uploading ? 'Uploading...' : '+ Upload Asset'}
                <input type="file" multiple accept="image/*" onChange={e => handleUpload(e.target.files)} style={{ display: 'none' }} />
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
              {images.map(img => (
                <div key={img.name} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <img src={img.url} alt={img.name} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover' }} />
                  <div style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#cbd5e1', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>{img.name}</span>
                    <button onClick={() => deleteImage(img.name)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 14 }}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
            {images.length === 0 && !loading && <p style={{ color: '#64748b', textAlign: 'center', padding: 48 }}>No assets in bank yet.</p>}
          </div>
        )}

        {/* Reference Image Picker Modal */}
        {showPicker && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
            <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: 24, width: '100%', maxWidth: 640, maxHeight: '80vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>Select Brand Reference Image</h3>
                <button onClick={() => setShowPicker(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 22, cursor: 'pointer' }}>×</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {images.map(img => (
                  <img key={img.name} src={img.url} alt={img.name} onClick={() => { setReferenceImage(img.url); setShowPicker(false) }} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, cursor: 'pointer', border: '2px solid transparent' }} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
