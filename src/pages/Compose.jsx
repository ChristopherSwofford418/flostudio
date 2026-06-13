import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { supabase } from '../supabase'

const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4a3B2bm9raHFicGJxZWZlZ3hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMDI1NDgsImV4cCI6MjA5MTc3ODU0OH0.OVdLzh2Bvuf4l6F6ITSpj4pWqoc3EoTxs6OCvrMf4JU'

const PLATFORMS = [
  { id:'instagram', label:'Instagram', color:'#e1306c', maxChars:2200 },
  { id:'twitter', label:'Twitter/X', color:'#1da1f2', maxChars:280 },
  { id:'linkedin', label:'LinkedIn', color:'#0077b5', maxChars:3000 },
  { id:'facebook', label:'Facebook', color:'#1877f2', maxChars:63206 },
  { id:'tiktok', label:'TikTok', color:'#ff0050', maxChars:2200 },
]

const TONES = ['Professional','Casual','Humorous','Inspirational','Educational','Promotional','Storytelling','Urgent']
const POST_TYPES = ['Announcement','Behind the scenes','Tips & tricks','Product showcase','Question/Poll','User story','Industry news','Motivational']

export default function Compose() {
  const navigate = useNavigate()
  const [platform, setPlatform] = useState('instagram')
  const [content, setContent] = useState('')
  const [topic, setTopic] = useState('')
  const [tone, setTone] = useState('Professional')
  const [postType, setPostType] = useState('Announcement')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [variants, setVariants] = useState([])
  const [selectedVariant, setSelectedVariant] = useState(null)
  const [scheduleDate, setScheduleDate] = useState('')
  const [saved, setSaved] = useState(false)

  const selectedPlatform = PLATFORMS.find(p => p.id === platform)
  const charCount = content.length
  const charLimit = selectedPlatform?.maxChars || 2200
  const charPct = Math.min((charCount / charLimit) * 100, 100)

  const generateContent = async () => {
    if (!topic.trim()) return
    setGenerating(true)
    setVariants([])
    setSelectedVariant(null)
    try {
      const res = await fetch('https://xxkpvnokhqbpbqefegxa.supabase.co/functions/v1/ai-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}`, apikey: ANON },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: `You are an expert social media copywriter. Generate exactly 3 distinct post variants for ${platform}. Each variant should be different in approach. Format your response as JSON array: [{"variant":1,"content":"...","hashtags":"...","hook":"..."},{"variant":2,...},{"variant":3,...}]. Keep content within ${charLimit} characters. Include relevant emojis. Make each variant genuinely different.` },
            { role: 'user', content: `Platform: ${platform}\nTopic: ${topic}\nTone: ${tone}\nPost type: ${postType}\n\nGenerate 3 variants.` }
          ],
          max_tokens: 1200,
        }),
      })
      const d = await res.json()
      const text = d?.content || d?.choices?.[0]?.message?.content || ''
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        setVariants(parsed)
        setContent(parsed[0]?.content || '')
        setSelectedVariant(0)
      } else {
        setContent(text)
      }
    } catch (e) {
      setContent(`✨ ${topic}\n\nHere's a great ${tone.toLowerCase()} post about ${topic} for ${platform}!\n\n#${topic.replace(/\s+/g,'').toLowerCase()} #socialmedia #content`)
    }
    setGenerating(false)
  }

  const selectVariant = (idx) => {
    setSelectedVariant(idx)
    setContent(variants[idx]?.content || '')
  }

  const savePost = async (status) => {
    if (!content.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const postData = {
      user_id: user?.id,
      platform,
      content,
      status,
      scheduled_at: scheduleDate ? new Date(scheduleDate).toISOString() : null,
      created_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('posts').insert([postData])
    setSaving(false)
    if (!error) {
      setSaved(true)
      setTimeout(() => { setSaved(false); navigate('/approve') }, 1500)
    }
  }

  return (
    <Layout title="AI Compose">
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}} @keyframes spin{to{transform:rotate(360deg)}} @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}`}</style>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 360px', gap:20, animation:'fadeIn 0.3s ease' }}>

        {/* Left: Compose area */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

          {/* Platform selector */}
          <div style={{ background:'var(--card)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:14, padding:'18px 20px' }}>
            <div style={{ fontSize:12, fontWeight:600, color:'#64748b', marginBottom:12, letterSpacing:'0.05em' }}>SELECT PLATFORM</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {PLATFORMS.map(p => (
                <button key={p.id} onClick={()=>setPlatform(p.id)} style={{ padding:'8px 16px', borderRadius:20, border:`1px solid ${platform===p.id?p.color:'rgba(255,255,255,0.08)'}`, background:platform===p.id?`${p.color}18`:'transparent', color:platform===p.id?p.color:'#64748b', fontSize:13, fontWeight:platform===p.id?600:400, cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s' }}>{p.label}</button>
              ))}
            </div>
          </div>

          {/* AI Generator */}
          <div style={{ background:'var(--card)', border:'1px solid rgba(99,102,241,0.2)', borderRadius:14, padding:'18px 20px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
              <div style={{ width:28, height:28, borderRadius:'50%', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
              </div>
              <div style={{ fontWeight:700, fontSize:14, color:'#a5b4fc' }}>✦ AI Content Generator</div>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div>
                <label style={{ fontSize:12, color:'#64748b', fontWeight:500, display:'block', marginBottom:6 }}>What's your post about?</label>
                <input value={topic} onChange={e=>setTopic(e.target.value)} onKeyDown={e=>e.key==='Enter'&&generateContent()} placeholder="e.g. New product launch, company milestone, tips for entrepreneurs..." style={{ width:'100%', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:9, padding:'10px 14px', color:'#f1f5f9', fontSize:13.5, fontFamily:'inherit', outline:'none', boxSizing:'border-box' }} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div>
                  <label style={{ fontSize:12, color:'#64748b', fontWeight:500, display:'block', marginBottom:6 }}>Tone</label>
                  <select value={tone} onChange={e=>setTone(e.target.value)} style={{ width:'100%', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:9, padding:'9px 12px', color:'#f1f5f9', fontSize:13, fontFamily:'inherit', outline:'none', cursor:'pointer' }}>
                    {TONES.map(t => <option key={t} value={t} style={{ background:'#0d1a2e' }}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:12, color:'#64748b', fontWeight:500, display:'block', marginBottom:6 }}>Post Type</label>
                  <select value={postType} onChange={e=>setPostType(e.target.value)} style={{ width:'100%', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:9, padding:'9px 12px', color:'#f1f5f9', fontSize:13, fontFamily:'inherit', outline:'none', cursor:'pointer' }}>
                    {POST_TYPES.map(t => <option key={t} value={t} style={{ background:'#0d1a2e' }}>{t}</option>)}
                  </select>
                </div>
              </div>
              <button onClick={generateContent} disabled={!topic.trim()||generating} style={{ padding:'11px 20px', borderRadius:10, background:topic.trim()?'linear-gradient(135deg,#6366f1,#8b5cf6)':'rgba(255,255,255,0.06)', border:'none', color:'#fff', fontSize:13.5, fontWeight:700, cursor:topic.trim()?'pointer':'not-allowed', display:'flex', alignItems:'center', justifyContent:'center', gap:8, fontFamily:'inherit', boxShadow:topic.trim()?'0 4px 14px rgba(99,102,241,0.35)':'none' }}>
                {generating ? <><span style={{ width:14, height:14, border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%', display:'inline-block', animation:'spin 0.7s linear infinite' }}/> Generating 3 variants...</> : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg> Generate with AI</>}
              </button>
            </div>
          </div>

          {/* Variants */}
          {variants.length > 0 && (
            <div style={{ background:'var(--card)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:14, padding:'18px 20px' }}>
              <div style={{ fontSize:12, fontWeight:600, color:'#64748b', marginBottom:12, letterSpacing:'0.05em' }}>AI GENERATED VARIANTS — SELECT ONE</div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {variants.map((v, i) => (
                  <div key={i} onClick={()=>selectVariant(i)} style={{ padding:'12px 14px', borderRadius:10, border:`1px solid ${selectedVariant===i?'rgba(99,102,241,0.4)':'rgba(255,255,255,0.06)'}`, background:selectedVariant===i?'rgba(99,102,241,0.08)':'rgba(255,255,255,0.02)', cursor:'pointer', transition:'all 0.15s' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                      <span style={{ fontSize:11, fontWeight:700, color:selectedVariant===i?'#a5b4fc':'#64748b', letterSpacing:'0.05em' }}>VARIANT {i+1}</span>
                      {v.hook && <span style={{ fontSize:11, color:'#475569', fontStyle:'italic' }}>Hook: {v.hook}</span>}
                    </div>
                    <div style={{ fontSize:13, color:'#94a3b8', lineHeight:1.5, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>{v.content}</div>
                    {v.hashtags && <div style={{ fontSize:11, color:'#6366f1', marginTop:6 }}>{v.hashtags}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Content editor */}
          <div style={{ background:'var(--card)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:14, padding:'18px 20px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <div style={{ fontSize:12, fontWeight:600, color:'#64748b', letterSpacing:'0.05em' }}>POST CONTENT</div>
              <span style={{ fontSize:12, color:charPct>90?'#f87171':charPct>75?'#fbbf24':'#64748b' }}>{charCount} / {charLimit}</span>
            </div>
            <textarea value={content} onChange={e=>setContent(e.target.value)} placeholder="Write your post here, or use the AI generator above..." rows={8} style={{ width:'100%', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:10, padding:'12px 14px', color:'#f1f5f9', fontSize:14, fontFamily:'inherit', resize:'vertical', outline:'none', lineHeight:1.65, boxSizing:'border-box' }} />
            <div style={{ height:3, background:'rgba(255,255,255,0.05)', borderRadius:2, marginTop:8, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${charPct}%`, background:charPct>90?'#ef4444':charPct>75?'#f59e0b':'linear-gradient(90deg,#6366f1,#8b5cf6)', borderRadius:2, transition:'width 0.3s, background 0.3s' }}/>
            </div>
          </div>
        </div>

        {/* Right: Schedule + Actions */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {/* Schedule */}
          <div style={{ background:'var(--card)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:14, padding:'18px 20px' }}>
            <div style={{ fontSize:12, fontWeight:600, color:'#64748b', marginBottom:14, letterSpacing:'0.05em' }}>SCHEDULE</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', padding:'10px 12px', borderRadius:9, border:'1px solid rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.02)' }}>
                <input type="radio" name="schedule" checked={!scheduleDate} onChange={()=>setScheduleDate('')} style={{ accentColor:'#6366f1' }} />
                <div>
                  <div style={{ fontSize:13, color:'#e2e8f0', fontWeight:500 }}>Post immediately</div>
                  <div style={{ fontSize:11, color:'#475569' }}>Publish right away</div>
                </div>
              </label>
              <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', padding:'10px 12px', borderRadius:9, border:'1px solid rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.02)' }}>
                <input type="radio" name="schedule" checked={!!scheduleDate} onChange={()=>setScheduleDate(new Date(Date.now()+3600000).toISOString().slice(0,16))} style={{ accentColor:'#6366f1' }} />
                <div>
                  <div style={{ fontSize:13, color:'#e2e8f0', fontWeight:500 }}>Schedule for later</div>
                  <div style={{ fontSize:11, color:'#475569' }}>Pick a date & time</div>
                </div>
              </label>
              {scheduleDate && (
                <input type="datetime-local" value={scheduleDate} onChange={e=>setScheduleDate(e.target.value)} style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(99,102,241,0.25)', borderRadius:9, padding:'9px 12px', color:'#f1f5f9', fontSize:13, fontFamily:'inherit', outline:'none', width:'100%', boxSizing:'border-box' }} />
              )}
            </div>
          </div>

          {/* AI Optimal time tip */}
          <div style={{ padding:'14px 16px', background:'rgba(16,185,129,0.06)', border:'1px solid rgba(16,185,129,0.15)', borderRadius:12 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'#34d399', marginBottom:5 }}>✦ AI OPTIMAL TIME</div>
            <div style={{ fontSize:12.5, color:'#94a3b8', lineHeight:1.5 }}>
              {platform==='instagram'?'Best times: Tue-Fri 9-11am, 6-8pm':platform==='twitter'?'Best times: Weekdays 9am, 12pm, 5-6pm':platform==='linkedin'?'Best times: Tue-Thu 8-10am, 12pm':platform==='facebook'?'Best times: Wed 11am-1pm, Thu-Fri 1-4pm':'Best times: Tue-Fri 7-9am, 7-9pm'}
            </div>
          </div>

          {/* Actions */}
          <div style={{ background:'var(--card)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:14, padding:'18px 20px', display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ fontSize:12, fontWeight:600, color:'#64748b', marginBottom:4, letterSpacing:'0.05em' }}>ACTIONS</div>
            {saved ? (
              <div style={{ padding:'14px', borderRadius:10, background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.25)', textAlign:'center', color:'#34d399', fontSize:14, fontWeight:600 }}>✓ Post saved!</div>
            ) : (
              <>
                <button onClick={()=>savePost('pending')} disabled={!content.trim()||saving} style={{ padding:'12px', borderRadius:10, background:'linear-gradient(135deg,#6366f1,#8b5cf6)', border:'none', color:'#fff', fontSize:14, fontWeight:700, cursor:content.trim()?'pointer':'not-allowed', fontFamily:'inherit', boxShadow:'0 4px 14px rgba(99,102,241,0.35)', opacity:content.trim()?1:0.5 }}>
                  {saving?'Saving...':'✦ Save for Review'}
                </button>
                <button onClick={()=>savePost('scheduled')} disabled={!content.trim()||saving||!scheduleDate} style={{ padding:'12px', borderRadius:10, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', color:'#94a3b8', fontSize:14, fontWeight:600, cursor:(content.trim()&&scheduleDate)?'pointer':'not-allowed', fontFamily:'inherit', opacity:(content.trim()&&scheduleDate)?1:0.4 }}>
                  📅 Schedule Post
                </button>
                <button onClick={()=>savePost('published')} disabled={!content.trim()||saving} style={{ padding:'12px', borderRadius:10, background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.2)', color:'#34d399', fontSize:14, fontWeight:600, cursor:content.trim()?'pointer':'not-allowed', fontFamily:'inherit', opacity:content.trim()?1:0.4 }}>
                  ✅ Publish Now
                </button>
              </>
            )}
          </div>

          {/* Preview */}
          {content && (
            <div style={{ background:'var(--card)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:14, padding:'18px 20px' }}>
              <div style={{ fontSize:12, fontWeight:600, color:'#64748b', marginBottom:12, letterSpacing:'0.05em' }}>PREVIEW</div>
              <div style={{ background:'rgba(255,255,255,0.03)', borderRadius:10, padding:'14px', border:'1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                  <div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff' }}>Y</div>
                  <div>
                    <div style={{ fontSize:12.5, fontWeight:600, color:'#e2e8f0' }}>Your Account</div>
                    <div style={{ fontSize:11, color:'#475569' }}>Just now · {selectedPlatform?.label}</div>
                  </div>
                </div>
                <div style={{ fontSize:13, color:'#94a3b8', lineHeight:1.6, whiteSpace:'pre-wrap' }}>{content}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
