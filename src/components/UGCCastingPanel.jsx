import { useEffect, useMemo, useRef, useState } from 'react'
import { SYNTHETIC_ACTORS, SYNTHETIC_VOICES, castingProfile, voiceProfile } from '../lib/ugcCasting'

function Waveform({ active }) {
  return <span aria-hidden="true" style={{ display:'inline-flex', alignItems:'center', gap:2, height:13 }}>
    {[5, 10, 7, 12, 6].map((height, index) => <i key={index} style={{ width:2, height:active ? height : 3, borderRadius:2, background:'currentColor', opacity:active ? .95 : .55, animation:active ? `ugcWave .55s ${index * .07}s ease-in-out infinite alternate` : 'none' }} />)}
  </span>
}

export default function UGCCastingPanel({ actorId, voiceId, onActorChange, onVoiceChange }) {
  const audioRef = useRef(null)
  const [playingVoiceId, setPlayingVoiceId] = useState(null)
  const selectedActor = useMemo(() => castingProfile(actorId), [actorId])
  const selectedVoice = useMemo(() => voiceProfile(voiceId), [voiceId])

  useEffect(() => () => { if (audioRef.current) audioRef.current.pause() }, [])

  const playVoice = voice => {
    const audio = audioRef.current
    if (!audio) return
    if (playingVoiceId === voice.id) {
      audio.pause()
      audio.currentTime = 0
      setPlayingVoiceId(null)
      return
    }
    audio.src = voice.sample
    audio.play().then(() => setPlayingVoiceId(voice.id)).catch(() => setPlayingVoiceId(null))
  }

  const chooseActor = actor => {
    onActorChange(actor.id)
    const matchingVoice = SYNTHETIC_VOICES.find(voice => voice.actorId === actor.id)
    if (matchingVoice) onVoiceChange(matchingVoice.id)
  }

  return <section style={{ marginTop:16, paddingTop:14, borderTop:'1px solid rgba(240,240,240,.14)' }}>
    <style>{`@keyframes ugcWave{from{transform:scaleY(.45)}to{transform:scaleY(1)}}`}</style>
    <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start', flexWrap:'wrap' }}>
      <div>
        <div className="abundance-mini-label">SYNTHETIC CASTING / FACE + VOICE</div>
        <h3 style={{ fontSize:17, letterSpacing:'-.045em', marginTop:4 }}>Choose the on-camera talent before you render.</h3>
        <p style={{ color:'rgba(240,240,240,.58)', fontSize:10.5, lineHeight:1.5, marginTop:5, maxWidth:620 }}>Every profile is a fictional, synthetic adult performer. Use **Play demo** to hear the supplied voice style; the final video uses the selected talent profile as direction, never an imitation of a real person.</p>
      </div>
      <span className="abundance-pill">{selectedActor.name} · {selectedVoice.shortName}</span>
    </div>
    <audio ref={audioRef} preload="none" onEnded={() => setPlayingVoiceId(null)} onPause={() => setPlayingVoiceId(null)} />
    <div style={{ display:'grid', gridTemplateColumns:'repeat(6,minmax(92px,1fr))', gap:8, marginTop:12, overflowX:'auto', paddingBottom:3 }}>
      {SYNTHETIC_ACTORS.map(actor => {
        const selected = actor.id === selectedActor.id
        return <button type="button" key={actor.id} onClick={() => chooseActor(actor)} aria-pressed={selected} style={{ minWidth:92, textAlign:'left', overflow:'hidden', border:selected ? '2px solid var(--signal)' : '1px solid rgba(240,240,240,.17)', borderRadius:9, padding:0, background:selected ? 'rgba(49,130,246,.1)' : 'rgba(240,240,240,.03)', cursor:'pointer', color:'#fff' }}>
          <img src={actor.portrait} alt={`Synthetic actor ${actor.name}`} style={{ display:'block', width:'100%', aspectRatio:'3 / 4', objectFit:'cover', filter:selected ? 'none' : 'saturate(.88)' }} />
          <span style={{ display:'block', padding:'7px 7px 8px' }}><b style={{ display:'block', fontSize:10.5, color:selected ? 'var(--signal)' : '#fff' }}>{actor.name}</b><small style={{ display:'block', marginTop:2, color:'rgba(240,240,240,.58)', lineHeight:1.25, fontSize:9 }}>{actor.role}</small></span>
        </button>
      })}
    </div>
    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,minmax(0,1fr))', gap:8, marginTop:12 }}>
      {SYNTHETIC_VOICES.map(voice => {
        const selected = voice.id === selectedVoice.id
        const playing = voice.id === playingVoiceId
        return <div key={voice.id} style={{ border:selected ? '1px solid rgba(49,130,246,.8)' : '1px solid rgba(240,240,240,.15)', background:selected ? 'rgba(49,130,246,.08)' : 'rgba(240,240,240,.025)', borderRadius:8, padding:9 }}>
          <button type="button" onClick={() => onVoiceChange(voice.id)} aria-pressed={selected} style={{ display:'block', width:'100%', background:'transparent', border:0, padding:0, textAlign:'left', cursor:'pointer', color:'#fff' }}><b style={{ display:'block', fontSize:10.5, color:selected ? 'var(--signal)' : '#fff' }}>{voice.name}</b><span style={{ display:'block', marginTop:3, color:'rgba(240,240,240,.58)', fontSize:9.5, lineHeight:1.3 }}>{voice.detail}</span></button>
          <button type="button" onClick={() => playVoice(voice)} style={{ display:'inline-flex', alignItems:'center', gap:5, marginTop:8, border:'1px solid rgba(240,240,240,.24)', background:playing ? 'rgba(49,130,246,.16)' : 'rgba(240,240,240,.06)', color:playing ? 'var(--signal)' : '#fff', borderRadius:6, padding:'5px 7px', fontSize:9.5, fontWeight:800, cursor:'pointer' }}><Waveform active={playing} /> {playing ? 'Stop demo' : 'Play demo'}</button>
        </div>
      })}
    </div>
  </section>
}
