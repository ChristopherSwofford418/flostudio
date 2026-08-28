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
        <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'radial-gradient(circle at 70% 8%,rgba(104,96,255,.28),transparent 28rem),linear-gradient(135deg,#090914,#151528)', color:'#ffffff', padding:24, fontFamily:'Inter, sans-serif' }}>
          <div style={{ maxWidth:500, width:'100%', background:'rgba(20,20,34,.92)', border:'1px solid rgba(240,240,240,.16)', borderRadius:18, padding:30, boxShadow:'0 22px 55px rgba(0,0,0,.4)' }}>
            <div style={{ color:'#9ee8d2', fontSize:10, letterSpacing:'.13em', fontWeight:800 }}>FLOSTUDIO / RECOVERY MODE</div>
            <h2 style={{ fontSize:23, fontWeight:800, margin:'10px 0 9px', color:'#ffffff' }}>This page needs a safe retry.</h2>
            <p style={{ fontSize:13.5, color:'rgba(240,240,240,.68)', lineHeight:1.6, marginBottom:18 }}>FloStudio caught a temporary rendering issue. Retrying keeps you on this page and restores your workspace without changing saved work.</p>
            <div style={{ background:'rgba(0,0,0,.22)', border:'1px solid rgba(240,240,240,.1)', borderRadius:10, padding:11, fontSize:11, fontFamily:'monospace', color:'rgba(240,240,240,.58)', marginBottom:18, wordBreak:'break-word' }}>{this.state.error?.message || 'Unknown runtime error'}</div>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}><button onClick={() => window.location.reload()} style={{ padding:'12px 15px', borderRadius:11, background:'linear-gradient(135deg,#7c74ff,#6259e8)', color:'#ffffff', border:0, fontWeight:800, fontSize:12.5, cursor:'pointer' }}>Retry this page →</button><button onClick={() => window.location.href = '/auth'} style={{ padding:'12px 15px', borderRadius:11, background:'transparent', color:'rgba(240,240,240,.8)', border:'1px solid rgba(240,240,240,.2)', fontWeight:700, fontSize:12.5, cursor:'pointer' }}>Sign in again</button></div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
