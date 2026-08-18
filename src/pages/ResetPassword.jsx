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

  useEffect(() => {
    let mounted = true
    const checkRecovery = async () => {
      const { data:{ session } } = await supabase.auth.getSession()
      if (!mounted) return
      if (session) setRecoveryReady(true)
      else setError('This recovery link is missing or expired. Request a new reset email and open the newest link in this browser.')
    }
    checkRecovery()
    const { data:{ subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      if (event === 'PASSWORD_RECOVERY' || session) { setRecoveryReady(true); setError('') }
    })
    return () => { mounted = false; subscription.unsubscribe() }
  }, [])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (password !== confirm) { setError('The passwords do not match.'); return }
    if (password.length < 6) { setError('Use at least six characters.'); return }
    if (!recoveryReady) { setError('Open a valid recovery link before updating your password.'); return }
    setLoading(true); setError('')
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) setError(updateError.message)
    else setDone(true)
    setLoading(false)
  }

  return (
    <main className="auth-ledger">
      <div className="auth-ledger__measure" aria-hidden="true">ACCOUNT RECOVERY / SECURE ACCESS</div>
      <section className="auth-ledger__panel">
        <header className="auth-ledger__brand"><div className="auth-ledger__mark">F</div><div><div className="auth-ledger__eyebrow">FLOSTUDIO / SIGNAL LEDGER</div><h1>FloStudio</h1></div></header>
        {done ? <div className="auth-ledger__complete"><span className="signal-stamp">UPDATED</span><h2>Access restored.</h2><p>Your password has changed. Return to FloStudio to continue operating your portfolio.</p><button className="auth-ledger__submit" onClick={() => navigate('/auth')}>Return to sign in</button></div> : <><div className="auth-ledger__intro"><span className="signal-stamp">RECOVERY ROUTE</span><h2>Set a new password.</h2><p>Use a strong password to protect your private creative workspace.</p></div>{error && <div className="auth-ledger__notice auth-ledger__notice--error">{error}</div>}<form onSubmit={handleSubmit} className="auth-ledger__form"><label>New password<input className="auth-ledger__input" type="password" value={password} onChange={event => setPassword(event.target.value)} required placeholder="••••••••" /></label><label>Confirm password<input className="auth-ledger__input" type="password" value={confirm} onChange={event => setConfirm(event.target.value)} required placeholder="••••••••" /></label><button className="auth-ledger__submit" type="submit" disabled={loading || !recoveryReady}>{loading ? 'Updating access…' : recoveryReady ? 'Update password' : 'Waiting for recovery link'}</button></form></>}</section>
    </main>
  )
}
