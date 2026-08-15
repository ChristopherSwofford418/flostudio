import { useState } from 'react'
import Layout from '../components/Layout'
import { PRICING_TIERS, initiateStripeCheckout } from '../lib/billing'
import { useWorkspace } from '../context/WorkspaceContext'

export default function Pricing() {
  const [loadingTier, setLoadingTier] = useState(null)
  const { addTokens } = useWorkspace()

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
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 20, fontSize: 12, fontWeight: 600, color: '#a5b4fc', marginBottom: 16 }}>
            <span>⚡</span> Creatify AI & Holo AI Competitor Model
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 800, color: '#f1f5f9', marginBottom: 12, letterSpacing: '-0.5px' }}>
            Flexible Token-Based Pricing for All Your Apps
          </h1>
          <p style={{ fontSize: 15, color: '#94a3b8', maxWidth: 640, margin: '0 auto', lineHeight: 1.6 }}>
            Generate high-converting ad scripts, AI product images, and automated social campaigns across your entire app portfolio. Pay only for what you use, with progressive overage protection.
          </p>
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

              <button onClick={() => handleSubscribe(tier)} disabled={loadingTier === tier.id} style={{ width: '100%', padding: '12px 20px', borderRadius: 12, border: 'none', background: tier.popular ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'rgba(255,255,255,0.08)', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', boxShadow: tier.popular ? '0 4px 16px rgba(99,102,241,0.4)' : 'none', transition: 'all 0.2s' }}
                onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-1px)'}}
                onMouseLeave={e=>{e.currentTarget.style.transform='translateY(0)'}}>
                {loadingTier === tier.id ? 'Processing Stripe Checkout...' : 'Select Plan'}
              </button>
            </div>
          ))}
        </div>

        {/* FAQ & Progressive Overage Section */}
        <div style={{ background: '#0a0f1e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 32 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9', marginBottom: 16 }}>Frequently Asked Questions & Token Rules</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
            <div>
              <h4 style={{ fontSize: 14, fontWeight: 600, color: '#a5b4fc', marginBottom: 6 }}>How does progressive overage work?</h4>
              <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>
                If your monthly token credit drops below 50 tokens or runs out during an active campaign, FloStudio pauses right before completion and prompts a 1-click token reload or progressive tier upgrade so you never lose work.
              </p>
            </div>
            <div>
              <h4 style={{ fontSize: 14, fontWeight: 600, color: '#a5b4fc', marginBottom: 6 }}>How are tokens consumed?</h4>
              <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>
                Social posts consume 1 token, AI image studio generations consume 5 tokens, and full multi-app campaign packs consume 15 tokens. All tracked securely in your Supabase ledger.
              </p>
            </div>
            <div>
              <h4 style={{ fontSize: 14, fontWeight: 600, color: '#a5b4fc', marginBottom: 6 }}>Can I manage multiple apps?</h4>
              <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>
                Yes! Switch seamlessly between BoothProfit, DailyPromise, PocketLawyer, GymGuard, and Syllabus Agent using the sidebar app selector.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
