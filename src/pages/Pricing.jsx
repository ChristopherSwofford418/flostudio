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
      await initiateStripeCheckout(tier.id, tier.price, tier.tokens)
      addTokens(tier.tokens)
      alert(`Successfully subscribed to ${tier.name}. Added ${tier.tokens} tokens to your FloStudio account via Stripe.`)
    } catch (err) {
      alert(`Payment error: ${err.message}`)
    } finally {
      setLoadingTier(null)
    }
  }

  return (
    <Layout title="Pricing & Token Economy">
      <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 60, animation: 'fadeIn 0.25s ease' }}>
        <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 14px', background: '#fdf2f8', border: '1px solid rgba(219,39,119,0.2)', borderRadius: 20, fontSize: 11.5, fontWeight: 700, color: '#db2777', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Creatify & Holo AI Competitor Grade
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 900, color: '#0f172a', marginBottom: 12, letterSpacing: '-1px' }}>Token Economy & Subscription Tiers</h1>
          <p style={{ fontSize: 15, color: '#64748b', maxWidth: 640, margin: '0 auto', lineHeight: 1.6 }}>
            Unlock unlimited AI ad actors, high-converting scripts, and multi-channel scheduling with progressive overage protection.
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24, marginBottom: 48 }}>
          {PRICING_TIERS.map(tier => (
            <div key={tier.id} style={{ background: '#ffffff', border: tier.popular ? '2px solid #db2777' : '1px solid #e2e8f0', borderRadius: 24, padding: 32, display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: tier.popular ? '0 20px 40px rgba(219,39,119,0.15)' : '0 1px 3px rgba(0,0,0,0.02)', transition: 'all 0.2s' }}
              onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-3px)'}}
              onMouseLeave={e=>{e.currentTarget.style.transform='translateY(0)'}}>
              
              {tier.popular && (
                <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg,#db2777,#7c3aed,#4f46e5)', color: '#fff', fontSize: 11, fontWeight: 800, padding: '5px 16px', borderRadius: 20, letterSpacing: 0.5, boxShadow: '0 4px 15px rgba(219,39,119,0.3)', textTransform: 'uppercase' }}>
                  Most Popular
                </div>
              )}

              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>{tier.name}</h3>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 14 }}>
                  <span style={{ fontSize: 38, fontWeight: 900, color: '#0f172a' }}>${tier.price}</span>
                  <span style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>/ month</span>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: '#fdf2f8', border: '1px solid rgba(219,39,119,0.2)', borderRadius: 8, fontSize: 12, fontWeight: 700, color: '#db2777' }}>
                  {tier.tokens} tokens included
                </div>
              </div>

              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 20, marginBottom: 28, flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {tier.features.map((feat, fi) => (
                  <div key={fi} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: '#475569', fontWeight: 500 }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <span>{feat}</span>
                  </div>
                ))}
              </div>

              <button onClick={() => handleSubscribe(tier)} disabled={loadingTier === tier.id} style={{ width: '100%', padding: '14px 20px', borderRadius: 12, border: 'none', background: tier.popular ? 'linear-gradient(135deg,#db2777,#7c3aed,#4f46e5)' : '#f1f5f9', color: tier.popular ? '#fff' : '#0f172a', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', boxShadow: tier.popular ? '0 4px 15px rgba(219,39,119,0.3)' : 'none', transition: 'all 0.15s' }}>
                {loadingTier === tier.id ? 'Processing...' : `Get ${tier.name}`}
              </button>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  )
}
