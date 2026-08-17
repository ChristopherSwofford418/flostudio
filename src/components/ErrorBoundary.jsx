import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('FloStudio ErrorBoundary caught error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', color: '#1e293b', padding: 24, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          <div style={{ maxWidth: 480, width: '100%', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 24, padding: 32, boxShadow: '0 20px 40px rgba(0,0,0,0.06)' }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12, color: '#0f172a' }}>Something needs attention</h2>
            <p style={{ fontSize: 13.5, color: '#64748b', lineHeight: 1.6, marginBottom: 24 }}>
              FloStudio caught a temporary rendering issue. Click below to reload your workspace safely.
            </p>
            <div style={{ background: '#f1f5f9', borderRadius: 12, padding: 12, fontSize: 11.5, fontFamily: 'monospace', color: '#e11d48', marginBottom: 20, wordBreak: 'break-all' }}>
              {this.state.error?.message || 'Unknown runtime error'}
            </div>
            <button onClick={() => window.location.href = '/agent'} style={{ width: '100%', padding: '14px', borderRadius: 14, background: 'linear-gradient(135deg,#6366f1,#ec4899)', color: '#fff', border: 0, fontWeight: 800, fontSize: 13.5, cursor: 'pointer', boxShadow: '0 10px 20px rgba(99,102,241,0.25)' }}>
              Return to Agent Studio →
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
