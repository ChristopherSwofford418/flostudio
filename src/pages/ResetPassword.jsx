import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useNavigate } from 'react-router-dom'

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [recoveryReady, setRecoveryReady] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (!recoveryReady) { setError('Open a valid password recovery link before updating your password.'); return }
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) setError(error.message)
    else setDone(true)
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(circle at 76% 12%,rgba(125,89,255,.65),transparent 24rem),radial-gradient(circle at 15% 84%,rgba(255,95,150,.25),transparent 30rem),linear-gradient(135deg,#060518,#110936 55%,#29114b)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ width: 56, height: 56, background: 'linear-gradient(135deg,#ff789d,#896bff 55%,#54e0cd)', borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight:900, color:'#fff', margin: '0 auto 16px', boxShadow:'0 14px 30px rgba(137,107,255,.35)' }}>F</div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: '#fff', marginBottom: 4 }}>FloStudio</h1>
          <p style={{ color: 'rgba(226,220,255,.62)', fontSize: 15 }}>AI Social Media Scheduler</p>
        </div>

        <div style={{ background: 'linear-gradient(145deg,rgba(38,29,92,.88),rgba(13,10,42,.88))', borderRadius: 24, padding: 32, border: '1px solid rgba(255,255,255,.14)', boxShadow:'0 28px 70px rgba(0,0,0,.38),inset 0 1px rgba(255,255,255,.1)', backdropFilter:'blur(20px)' }}>
          {done ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width:48, height:48, borderRadius:16, display:'grid', placeItems:'center', margin:'0 auto 16px', background:'rgba(112,238,216,.15)', border:'1px solid rgba(112,238,216,.35)', color:'#a7ffec', fontSize:14, fontWeight:900 }}>OK</div>
              <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Password updated!</h2>
              <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 24 }}>Your password has been changed successfully.</p>
              <button onClick={() => navigate('/auth')}
                style={{ background: 'linear-gradient(135deg,#ff6198,#7b61ff)', color: '#fff', border: 'none', borderRadius: 12, padding: '13px 32px', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
                Sign In
              </button>
            </div>
          ) : (
            <>
              <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 700, marginBottom: 24 }}>Set new password</h2>
              {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 14px', color: '#f87171', fontSize: 14, marginBottom: 16 }}>{error}</div>}
              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ color: 'rgba(230,225,255,.7)', fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>New Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                    style={{ width: '100%', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '11px 14px', color: '#fff', fontSize: 14, boxSizing: 'border-box' }}
                    placeholder="••••••••" />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ color: 'rgba(230,225,255,.7)', fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>Confirm Password</label>
                  <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required
                    style={{ width: '100%', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '11px 14px', color: '#fff', fontSize: 14, boxSizing: 'border-box' }}
                    placeholder="••••••••" />
                </div>
                <button type="submit" disabled={loading || !recoveryReady}
                  style={{ width: '100%', background: 'linear-gradient(135deg,#ff6198,#7b61ff)', color: '#fff', border: 'none', borderRadius: 12, padding: '13px', fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
                  {loading ? 'Updating...' : recoveryReady ? 'Update Password' : 'Waiting for recovery link'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
  useEffect(() => {
    let mounted = true
    const checkRecovery = async () => {
      const { data:{ session } } = await supabase.auth.getSession()
      if (!mounted) return
      if (session) setRecoveryReady(true)
      else setError('This password reset link is missing or expired. Request a new reset email and open the newest link in this browser.')
    }
    checkRecovery()
    const { data:{ subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      if (event === 'PASSWORD_RECOVERY' || session) { setRecoveryReady(true); setError('') }
    })
    return () => { mounted = false; subscription.unsubscribe() }
  }, [])
