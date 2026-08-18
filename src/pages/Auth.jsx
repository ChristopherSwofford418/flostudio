import { useState } from 'react'
import { supabase } from '../supabase'
import { useNavigate } from 'react-router-dom'

export default function Auth() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')
    try {
      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`
        })
        if (error) setError(error.message)
        else setMessage('Password reset email sent! Check your inbox.')
      } else {
        const { data, error } = mode === 'signup'
          ? await supabase.auth.signUp({ email, password })
          : await supabase.auth.signInWithPassword({ email, password })
        if (error) setError(error.message)
        else if (data?.session) navigate('/portfolio', { replace:true })
        else if (mode === 'signup') setError('Your Supabase project currently requires email confirmation. Disable Confirm email in Supabase Auth settings to enable immediate FloStudio access.')
      }
    } catch (e) {
      setError(e.message)
    }
    finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(circle at 76% 12%,rgba(125,89,255,.65),transparent 24rem),radial-gradient(circle at 15% 84%,rgba(255,95,150,.25),transparent 30rem),linear-gradient(135deg,#060518,#110936 55%,#29114b)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, position:'relative', overflow:'hidden' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ width: 56, height: 56, background: 'linear-gradient(135deg, #ff789d, #896bff 55%,#54e0cd)', borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight:900, color:'#fff', margin: '0 auto 16px', boxShadow:'0 14px 30px rgba(137,107,255,.35)' }}>F</div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: '#fff', marginBottom: 4 }}>FloStudio</h1>
          <p style={{ color: 'rgba(226,220,255,.62)', fontSize: 15 }}>AI Social Media Scheduler</p>
        </div>

        <div style={{ background: 'linear-gradient(145deg,rgba(38,29,92,.88),rgba(13,10,42,.88))', borderRadius: 24, padding: 32, border: '1px solid rgba(255,255,255,.14)', boxShadow:'0 28px 70px rgba(0,0,0,.38),inset 0 1px rgba(255,255,255,.1)', backdropFilter:'blur(20px)' }}>
          <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 700, marginBottom: 24 }}>
            {mode === 'signin' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Reset your password'}
          </h2>

          {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 14px', color: '#f87171', fontSize: 14, marginBottom: 16 }}>{error}</div>}
          {message && <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10, padding: '10px 14px', color: '#4ade80', fontSize: 14, marginBottom: 16 }}>{message}</div>}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ color: 'rgba(230,225,255,.7)', fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                style={{ width: '100%', background: 'rgba(3,2,18,.38)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '11px 14px', color: '#fff', fontSize: 14, boxSizing: 'border-box' }}
                placeholder="you@company.com" />
            </div>
            {mode !== 'forgot' && (
              <div style={{ marginBottom: 8 }}>
                <label style={{ color: 'rgba(230,225,255,.7)', fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                  style={{ width: '100%', background: 'rgba(3,2,18,.38)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '11px 14px', color: '#fff', fontSize: 14, boxSizing: 'border-box' }}
                  placeholder="••••••••" />
              </div>
            )}
            {mode === 'signin' && (
              <div style={{ textAlign: 'right', marginBottom: 16 }}>
                <button type="button" onClick={() => { setMode('forgot'); setError(''); setMessage('') }}
                  style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: 13, cursor: 'pointer', padding: 0 }}>
                  Forgot password?
                </button>
              </div>
            )}
            {mode !== 'signin' && <div style={{ marginBottom: 20 }} />}
            <button type="submit" disabled={loading}
              style={{ width: '100%', background: 'linear-gradient(135deg,#ff6198,#7b61ff)', color: '#fff', border: 'none', borderRadius: 12, padding: '13px', fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: loading ? 0.7 : 1, boxShadow:'0 10px 22px rgba(123,97,255,.28)' }}>
              {loading ? 'Please wait...' : mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Email'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: 20 }}>
            {mode === 'forgot' ? (
              <button onClick={() => { setMode('signin'); setError(''); setMessage('') }}
                style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: 14, cursor: 'pointer' }}>
                Back to Sign In
              </button>
            ) : (
              <button onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setMessage('') }}
                style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: 14, cursor: 'pointer' }}>
                {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
