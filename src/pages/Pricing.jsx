import { useState } from 'react'
import Layout from '../components/Layout'
import { PRICING_TIERS, initiateStripeCheckout } from '../lib/billing'
import { useWorkspace } from '../context/WorkspaceContext'
import { useNavigate } from 'react-router-dom'

export default function Pricing() {
  const [loadingTier, setLoadingTier] = useState(null)
  const { addTokens } = useWorkspace()
  const navigate = useNavigate()

  const handleSubscribe = async (tier) => {
    setLoadingTier(tier.id)
    try {
      const res = await initiateStripeCheckout(tier.id, tier.price, tier.tokens)
      addTokens(tier.tokens)
      alert(`🎉 Successfully subscribed to ${tier.name}! Added ${tier.tokens} tokens to your FloStudio account via Stripe.`)
    } catch (err) {
      alert(`Payment error: ${err.message}`)
    } finally {
      setLoadingTier(null)
    }
  }

  return (
    <Layout title="Pricing & Token Economy">
      <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 60 }}>
        {/* Top Navigation Bar inside view */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, background: 'rgba(99,102,241,0.08)', padding: '16px 24px', borderRadius: 16, border: '1px solid rgba(99,102,241,0.2)' }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: 1 }}>Token Economy & Billing</span>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', marginTop: 4 }}>Choose Your Growth Plan</h2>
          </div>
          <button onClick={() => navigate('/agent')} style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}>
            <span>←</span> Back to Dashboard / Agent HQ
          </button>
        </div>

        {/* Pricing Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24, marginBottom: 60 }}>
          {PRICING_TIERS.map(tier => (
            <div key={tier.id} style={{ background: tier.popular ? 'linear-gradient(180deg, rgba(99,102,241,0.12) 0%, rgba(15,23,42,0.95) 100%)' : '#0a0f1e', border: tier.popular ? '2px solid #6366f1' : '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: 32, display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: tier.popular ? '0 20px 40px rgba(99,102,241,0.2)' : '0 10px 30px rgba(0,0,0,0.4)' }}>
              {tier.popular && (
                <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 14px', borderRadius: 20, letterSpacing: 0.5, boxShadow: '0 4px 12px rgba(99,102,241,0.4)' }}>
                  MOST POPULAR FOR CREATORS
                </div>
              )}
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 20, fontWeight: 700, color: '#f1f5f9', marginBottom: 6 }}>{tier.name}</h3>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 12 }}>
                  <span style={{ fontSize: 36, fontWeight: 800, color: '#f1f5f9' }}>${tier.price}</span>
                  <span style={{ fontSize: 13, color: '#94a3b8' }}>/ month</span>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'rgba(99,102,241,0.15)', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#a5b4fc' }}>
                  <span>⚡</span> {tier.tokens} Tokens included
                </div>
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 20, marginBottom: 28, flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {tier.features.map((feat, fi) => (
                  <div key={fi} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#cbd5e1' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    <span>{feat}</span>
                  </div>
                ))}
              </div>

              <button onClick={() => handleSubscribe(tier)} disabled={loadingTier === tier.id} style={{ width: '100%', padding: '14px 20px', borderRadius: 12, border: 'none', background: tier.popular ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'rgba(255,255,255,0.1)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', boxShadow: tier.popular ? '0 4px 16px rgba(99,102,241,0.4)' : 'none', transition: 'all 0.2s' }}>
                {loadingTier === tier.id ? 'Connecting to Stripe...' : `Get ${tier.name}`}
              </button>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  )
}
