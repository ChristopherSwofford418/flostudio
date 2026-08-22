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
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#fafafa', color: '#282828', padding: 24, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          <div style={{ maxWidth: 480, width: '100%', background: '#ffffff', border: '1px solid #e7e7e7', borderRadius: 24, padding: 32, boxShadow: '0 20px 40px rgba(0,0,0,0.06)' }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12, color: '#171717' }}>Something needs attention</h2>
            <p style={{ fontSize: 13.5, color: '#727272', lineHeight: 1.6, marginBottom: 24 }}>
              FloStudio caught a temporary rendering issue. Click below to reload your workspace safely.
            </p>
            <div style={{ background: '#f4f4f4', borderRadius: 12, padding: 12, fontSize: 11.5, fontFamily: 'monospace', color: '#4a4a4a', marginBottom: 20, wordBreak: 'break-all' }}>
              {this.state.error?.message || 'Unknown runtime error'}
            </div>
            <button onClick={() => window.location.href = '/auth'} style={{ width: '100%', padding: '14px', borderRadius: 14, background: 'linear-gradient(135deg,#6f6f6f,#717171)', color: '#ffffff', border: 0, fontWeight: 800, fontSize: 13.5, cursor: 'pointer', boxShadow: '0 10px 20px rgba(111,111,111,0.25)' }}>
              Return to secure sign-in →
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
