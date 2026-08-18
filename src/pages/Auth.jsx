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

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true); setError(''); setMessage('')
    try {
      if (mode === 'forgot') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })
        if (resetError) setError(resetError.message)
        else setMessage('Password reset email sent. Open the newest email in this browser to continue.')
      } else {
        const { data, error: authError } = mode === 'signup'
          ? await supabase.auth.signUp({ email, password })
          : await supabase.auth.signInWithPassword({ email, password })
        if (authError) setError(authError.message)
        else if (data?.session) navigate('/portfolio', { replace:true })
        else if (mode === 'signup') setError('This workspace requires an email-confirmation setting change before new accounts can enter immediately.')
      }
    } catch (requestError) { setError(requestError.message) }
    finally { setLoading(false) }
  }

  const title = mode === 'signin' ? 'Enter the ledger.' : mode === 'signup' ? 'Open a workspace.' : 'Recover access.'
  const helper = mode === 'signin' ? 'A private operating system for portfolio-scale creative work.' : mode === 'signup' ? 'Create a private workspace for the products you own.' : 'We will send a secure recovery route to your inbox.'

  return (
    <main className="auth-ledger">
      <div className="auth-ledger__measure" aria-hidden="true">PORTFOLIO MARKETING OS / SIGNAL LEDGER</div>
      <section className="auth-ledger__panel">
        <header className="auth-ledger__brand">
          <div className="auth-ledger__mark">F</div>
          <div><div className="auth-ledger__eyebrow">FLOSTUDIO / SIGNAL LEDGER</div><h1>FloStudio</h1></div>
        </header>
        <div className="auth-ledger__intro"><span className="signal-stamp">PRIVATE WORKSPACE</span><h2>{title}</h2><p>{helper}</p></div>
        {error && <div className="auth-ledger__notice auth-ledger__notice--error">{error}</div>}
        {message && <div className="auth-ledger__notice auth-ledger__notice--success">{message}</div>}
        <form onSubmit={handleSubmit} className="auth-ledger__form">
          <label>Email<input className="auth-ledger__input" type="email" value={email} onChange={event => setEmail(event.target.value)} required placeholder="you@company.com" /></label>
          {mode !== 'forgot' && <label>Password<input className="auth-ledger__input" type="password" value={password} onChange={event => setPassword(event.target.value)} required placeholder="••••••••" /></label>}
          {mode === 'signin' && <button className="auth-ledger__link" type="button" onClick={() => { setMode('forgot'); setError(''); setMessage('') }}>Forgot password?</button>}
          <button className="auth-ledger__submit" type="submit" disabled={loading}>{loading ? 'Checking workspace…' : mode === 'signin' ? 'Enter FloStudio' : mode === 'signup' ? 'Create workspace' : 'Send recovery email'}</button>
        </form>
        <footer className="auth-ledger__footer">
          {mode === 'forgot'
            ? <button className="auth-ledger__link" onClick={() => { setMode('signin'); setError(''); setMessage('') }}>Return to sign in</button>
            : <button className="auth-ledger__link" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setMessage('') }}>{mode === 'signin' ? 'Create a new workspace' : 'I already have a workspace'}</button>}
        </footer>
      </section>
    </main>
  )
}
