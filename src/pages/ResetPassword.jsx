import { useState } from 'react'
import { supabase } from '../supabase'
import { useNavigate } from 'react-router-dom'

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) setError(error.message)
    else setDone(true)
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ width: 56, height: 56, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 16px' }}>🌊</div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: '#fff', marginBottom: 4 }}>FloStudio</h1>
          <p style={{ color: '#64748b', fontSize: 15 }}>AI Social Media Scheduler</p>
        </div>

        <div style={{ background: '#1e293b', borderRadius: 20, padding: 32, border: '1px solid rgba(255,255,255,0.07)' }}>
          {done ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
              <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Password updated!</h2>
              <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 24 }}>Your password has been changed successfully.</p>
              <button onClick={() => navigate('/auth')}
                style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 12, padding: '13px 32px', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
                Sign In
              </button>
            </div>
          ) : (
            <>
              <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 700, marginBottom: 24 }}>Set new password</h2>
              {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 14px', color: '#f87171', fontSize: 14, marginBottom: 16 }}>{error}</div>}
              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ color: '#94a3b8', fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>New Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                    style={{ width: '100%', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '11px 14px', color: '#fff', fontSize: 14, boxSizing: 'border-box' }}
                    placeholder="••••••••" />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ color: '#94a3b8', fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>Confirm Password</label>
                  <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required
                    style={{ width: '100%', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '11px 14px', color: '#fff', fontSize: 14, boxSizing: 'border-box' }}
                    placeholder="••••••••" />
                </div>
                <button type="submit" disabled={loading}
                  style={{ width: '100%', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 12, padding: '13px', fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
                  {loading ? 'Updating...' : 'Update Password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
