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
        
        await new Promise((resolve) => {
          const reader = new FileReader()
          reader.onload = (e) => {
            const dataUrl = e.target.result
            setReferenceImage(dataUrl)
            setImages(prev => [{ name: fileName, url: dataUrl }, ...prev])
            resolve()
          }
          reader.readAsDataURL(file)
        })

        supabase.storage.from('marketing-assets').upload(fileName, file, { upsert: true }).catch(() => {})
      }
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

  return (
    <Layout title="AI Image & Video Studio">
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .studio-tab { background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.13); color: rgba(234,229,255,.7); padding: 10px 20px; border-radius: 12px; font-weight: 700; font-size: 13px; cursor: pointer; transition: all 0.2s; }
        .studio-tab.active { background: linear-gradient(135deg, #7b61ff, #ef4f9a); color: #fff; border-color: rgba(255,255,255,.22); box-shadow: 0 8px 20px rgba(114,80,255,.32); }
        .style-card { background: rgba(255,255,255,.055); border: 1px solid rgba(255,255,255,.12); border-radius: 12px; padding: 14px; cursor: pointer; transition: all 0.2s; }
        .style-card:hover { border-color: rgba(211,199,255,.42); background: rgba(255,255,255,.09); }
        .style-card.selected { background: rgba(130,99,255,.22); border-color: #a48cff; box-shadow: 0 0 18px rgba(123,97,255,.22); }
      `}</style>

      <div className="flo-page" style={{ maxWidth: 1280, margin: '0 auto', animation: 'fadeIn 0.3s ease-out' }}>
        <section className="abundance-shell" style={{ position: 'relative', minHeight: 270, marginBottom: 22, color: '#fffaf4', display: 'flex', alignItems: 'stretch' }}>
          <img src="/visuals/flo-creative-hero.jpg" alt="FloStudio creative direction" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'right center', opacity: .82 }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(30,19,88,.98) 0%, rgba(30,19,88,.75) 45%, rgba(22,10,61,.1) 100%)' }} />
          <div style={{ position: 'relative', zIndex: 1, padding: '34px 38px', maxWidth: 650 }}>
            <div className="abundance-eyebrow" style={{ marginBottom: 14 }}>Creative Lab / Art direction</div>
            <h1 className="abundance-title" style={{ fontSize: 'clamp(32px,4.5vw,52px)', maxWidth: 560 }}>From product signal to <em>scroll-stopping work.</em></h1>
            <p className="abundance-copy" style={{ marginTop: 14, maxWidth: 520 }}>Bring an app screen, product image, or bare idea. Flo turns it into campaign-ready creative while keeping your visual story coherent.</p>
          </div>
          <div style={{ position: 'relative', zIndex: 1, marginLeft: 'auto', alignSelf: 'flex-end', padding: 20, display: 'flex', gap: 7 }}>
            {['Image', 'Video', 'Assets'].map((item, index) => <span key={item} className="studio-chip" style={{ background: index === 0 ? '#d7f267' : 'rgba(255,255,255,.12)', color: index === 0 ? '#16131d' : '#fff', borderColor: index === 0 ? '#d7f267' : 'rgba(255,255,255,.22)' }}>{item}</span>)}
          </div>
        </section>
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
            <div className="abundance-card" style={{ padding: 28 }}>
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', color: '#eeeaff', fontSize: 13, fontWeight: 700, marginBottom: 8, letterSpacing: '0.05em' }}>AD CREATIVE PROMPT (OPTIONAL IF IMAGE UPLOADED)</label>
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="Describe your ad creative or just upload your app screenshot below..."
                  rows={3}
                  className="studio-input" style={{ minHeight:92, resize: 'vertical', lineHeight: 1.5 }}
                />
              </div>

              {/* Visual Style Presets */}
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', color: '#eeeaff', fontSize: 13, fontWeight: 700, marginBottom: 10, letterSpacing: '0.05em' }}>VISUAL STYLE</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                  {STYLE_PRESETS.map(s => (
                    <div
                      key={s.id}
                      onClick={() => setStylePreset(s.id)}
                      className={`style-card ${stylePreset === s.id ? 'selected' : ''}`}
                    >
                      <div style={{ color: '#fff', fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{s.label}</div>
                      <div style={{ color: 'rgba(234,229,255,.6)', fontSize: 11, lineHeight: 1.3 }}>{s.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Aspect Ratio & Variations */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                <div>
                  <label style={{ display: 'block', color: '#0f172a', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>ASPECT RATIO</label>
                  <select
                    value={aspectRatio}
                    onChange={e => setAspectRatio(e.target.value)}
                    style={{ width: '100%', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 10, padding: 12, color: '#0f172a', fontSize: 13 }}
                  >
                    {ASPECT_RATIOS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', color: '#0f172a', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>VARIATIONS</label>
                  <select
                    value={variationsCount}
                    onChange={e => setVariationsCount(e.target.value)}
                    style={{ width: '100%', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 10, padding: 12, color: '#0f172a', fontSize: 13 }}
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
                <label style={{ display: 'block', color: '#eeeaff', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>TEXT OVERLAY (OPTIONAL)</label>
                <input
                  type="text"
                  value={brandOverlay}
                  onChange={e => setBrandOverlay(e.target.value)}
                  placeholder="e.g. 50% OFF TODAY or JOIN NOW"
                  className="studio-input" style={{ padding:12 }}
                />
              </div>

              {/* Reference Image Picker & Direct Upload */}
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', color: '#eeeaff', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>UPLOAD APP SCREENSHOT OR PRODUCT IMAGE</label>
                {referenceImage ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,100,143,.1)', border: '1px solid rgba(255,125,174,.32)', borderRadius: 12, padding: 10 }}>
                    <img src={referenceImage} alt="Ref" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8 }} />
                    <div style={{ flex: 1, fontSize: 13, color: '#fff', fontWeight: 600 }}>Reference Asset Included in Ad</div>
                    <button onClick={() => setReferenceImage(null)} style={{ background: '#ffeeef', border: 'none', color: '#dc2626', borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Remove</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setShowPicker(true)} style={{ flex: 1, background: 'rgba(255,255,255,.055)', border: '1px dashed rgba(255,255,255,.3)', borderRadius: 12, padding: 12, color: '#eeeaff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                      Select from Bank
                    </button>
                    <label style={{ flex: 1, background: 'linear-gradient(135deg, #db2777, #7c3aed, #4f46e5)', color: '#fff', border: 'none', borderRadius: 12, padding: 12, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', boxShadow: '0 4px 15px rgba(219,39,119,0.25)' }}>
                      {uploading ? 'Uploading...' : 'Upload Image'}
                      <input type="file" accept="image/*" multiple onChange={e => handleUpload(e.target.files)} style={{ display: 'none' }} />
                    </label>
                  </div>
                )}
              </div>

              {error && (
                <div style={{ marginBottom: 20, padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#dc2626', fontSize: 13, fontWeight: 600 }}>
                  {error}
                </div>
              )}

              <button
                onClick={generateAI}
                disabled={generating || (!prompt.trim() && !referenceImage)}
                style={{ width: '100%', padding: '14px', background: generating || (!prompt.trim() && !referenceImage) ? '#e2e8f0' : 'linear-gradient(135deg, #db2777, #7c3aed, #4f46e5)', border: 'none', borderRadius: 12, color: '#fff', fontSize: 14, fontWeight: 800, cursor: generating || (!prompt.trim() && !referenceImage) ? 'not-allowed' : 'pointer', boxShadow: '0 4px 20px rgba(219,39,119,0.3)' }}
              >
                {generating ? 'Generating Ad Creatives...' : 'Generate Ad Creatives (Cost: 10 Tokens)'}
              </button>
            </div>

            {/* Right Output Preview */}
            <div className="abundance-card" style={{ padding: 28, display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 20 }}>Generated Ad Creatives</h3>

              {generating ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, minHeight: 350 }}>
                  <span style={{ width: 36, height: 36, border: '3px solid #e2e8f0', borderTopColor: '#db2777', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Synthesizing High-Conversion Ad Creatives...</div>
                  <div style={{ fontSize: 12, color: 'rgba(234,229,255,.64)' }}>Compositing app screenshot & generating cinematic studio lighting</div>
                </div>
              ) : generatedResults.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: 1, overflowY: 'auto' }}>
                  {generatedResults.map((img, i) => (
                    <div key={i} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', padding: 12 }}>
                      <img src={img.url} alt={`Ad ${i+1}`} style={{ width: '100%', height: 'auto', borderRadius: 10, display: 'block', objectFit: 'contain' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Creative #{i+1}</span>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <a href={img.url} target="_blank" rel="noreferrer" style={{ padding: '6px 12px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, color: '#0f172a', fontSize: 12, fontWeight: 700 }}>Open HD</a>
                          <button onClick={() => saveToBank(img.url)} style={{ padding: '6px 14px', background: '#db2777', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Save to Bank</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="abundance-glass" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 18, borderRadius: 16 }}>
                  <div className="studio-kicker" style={{ marginBottom: 8 }}>Output board</div>
                  <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.045em', color: '#fff', maxWidth: 300 }}>Your next creative set will land here.</div>
                  <div style={{ fontSize: 12, color: 'rgba(234,229,255,.64)', maxWidth: 350, lineHeight: 1.55, marginTop: 7 }}>Use the reference image as your product truth, then choose a direction that feels native to the campaign.</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9, marginTop: 20 }}>
                    {[
                      ['/visuals/flo-preview-product.jpg', 'Product focus'],
                      ['/visuals/flo-preview-lifestyle.jpg', 'Human proof'],
                      ['/visuals/flo-preview-editorial.jpg', 'Editorial pull']
                    ].map(([src, label]) => <div key={label} style={{ position: 'relative', minHeight: 160, borderRadius: 12, overflow: 'hidden', background: '#ddd' }}><img src={src} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} /><div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top,rgba(22,19,29,.78),transparent 58%)' }} /><span style={{ position: 'absolute', left: 8, bottom: 8, color: '#fff', fontSize: 9.5, fontWeight: 800 }}>{label}</span></div>)}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 2. BRAND ASSET BANK TAB */}
        {activeTab === 'library' && (
          <div className="abundance-card" style={{ padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>Brand Asset Bank</h3>
                <p style={{ fontSize: 13, color: 'rgba(234,229,255,.64)', marginTop: 4 }}>Uploaded app screenshots, logos, and generated ad creatives</p>
              </div>
              <label style={{ padding: '10px 20px', background: 'linear-gradient(135deg, #db2777, #7c3aed, #4f46e5)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 15px rgba(219,39,119,0.25)' }}>
                {uploading ? 'Uploading...' : 'Upload New Asset'}
                <input type="file" accept="image/*" multiple onChange={e => handleUpload(e.target.files)} style={{ display: 'none' }} />
              </label>
            </div>

            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 250 }}>
                <span style={{ width: 30, height: 30, border: '3px solid #e2e8f0', borderTopColor: '#db2777', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
              </div>
            ) : images.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '80px 20px' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 6 }}>No assets uploaded yet</div>
                <div style={{ fontSize: 13, color: 'rgba(234,229,255,.64)' }}>Upload app screenshots or product photos to use them in AI ad generation</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
                {images.map((img, i) => (
                  <div key={i} className="abundance-glass" style={{ borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ height: 180, background: 'rgba(0,0,0,.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      <img src={img.url} alt={img.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </div>
                    <div style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,.12)' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>{img.name}</span>
                      <button onClick={() => deleteImage(img.name)} style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 3. AI VIDEO & UGC STUDIO TAB */}
        {activeTab === 'video' && (
          <div className="abundance-card" style={{ padding: 32, textAlign: 'center' }}>
            <div style={{ maxWidth: 600, margin: '0 auto', padding: '40px 0' }}>
              <div style={{ width: 56, height: 56, borderRadius: 18, background: 'rgba(255,100,143,.14)', border:'1px solid rgba(255,125,174,.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#ffb5cf', fontSize: 12, fontWeight: 900, letterSpacing:'.08em' }}>VIDEO</div>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 8 }}>AI Video & UGC Studio</h3>
              <p style={{ fontSize: 14, color: 'rgba(234,229,255,.64)', marginBottom: 24, lineHeight: 1.6 }}>Generate high-converting video ad scripts, AI voiceovers, and dynamic captions from your app screenshots.</p>
              <textarea
                value={videoPrompt}
                onChange={e => setVideoPrompt(e.target.value)}
                placeholder="Describe your video ad concept (e.g. 15s UGC testimonial for a fitness app)..."
                rows={3}
                className="studio-input" style={{ minHeight:92, resize: 'vertical', marginBottom: 20 }}
              />
              <button
                onClick={() => alert('AI Video generation is queued. Ensure your brand asset is uploaded in the Ad Image Studio first!')}
                style={{ padding: '12px 28px', background: 'linear-gradient(135deg, #db2777, #7c3aed, #4f46e5)', border: 'none', borderRadius: 12, color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 15px rgba(219,39,119,0.3)' }}
              >
                Generate AI Video Ad
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Asset Picker Modal */}
      {showPicker && (
        <div onClick={() => setShowPicker(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(6px)' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 20, padding: 32, maxWidth: 680, width: '90%', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Select Brand Asset for Ad</h3>
              <button onClick={() => setShowPicker(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 22, cursor: 'pointer' }}>×</button>
            </div>
            {images.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b', fontSize: 14 }}>No assets found in Bank. Upload one first!</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                {images.map((img, i) => (
                  <div key={i} onClick={() => { setReferenceImage(img.url); setShowPicker(false) }} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', cursor: 'pointer', transition: 'all 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = '#db2777'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e8f0'}>
                    <div style={{ height: 140, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img src={img.url} alt={img.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </div>
                    <div style={{ padding: 10, fontSize: 12, fontWeight: 600, color: '#0f172a', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  )
}
