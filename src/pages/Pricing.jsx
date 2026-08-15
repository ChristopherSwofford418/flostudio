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
      alert(`🎉 Successfully subscribed to ${tier.name}! Added ${tier.tokens} tokens to your FloStudio account via Stripe.`)
    } catch (err) {
      alert(`Payment error: ${err.message}`)
    } finally {
      setLoadingTier(null)
    }
  }

  return (
    <Layout title="Pricing & Token Economy">
      <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 80, animation: 'fadeIn 0.4s ease' }}>
        <style>{`
          @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes pulseGlow { 0%, 100% { box-shadow: 0 0 30px rgba(99,102,241,0.3); } 50% { box-shadow: 0 0 50px rgba(236,72,153,0.5); } }
        `}</style>

        {/* Top Header Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40, background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(236,72,153,0.1))', padding: '20px 28px', borderRadius: 20, border: '1px solid rgba(99,102,241,0.3)', backdropFilter: 'blur(12px)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: 'rgba(236,72,153,0.15)', border: '1px solid rgba(236,72,153,0.3)', borderRadius: 20, fontSize: 11, fontWeight: 700, color: '#f472b6', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
              <span>✨</span> Creatify & Holo AI Competitor Grade
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: '#ffffff', letterSpacing: '-0.5px' }}>Token Economy & Subscription Tiers</h1>
          </div>
          <button onClick={() => navigate('/dashboard')} style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6,#ec4899)', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 12, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 6px 20px rgba(99,102,241,0.4)', transition: 'all 0.2s' }}
            onMouseEnter={e=>e.currentTarget.style.transform='translateY(-2px)'}
            onMouseLeave={e=>e.currentTarget.style.transform='translateY(0)'}>
            <span>←</span> Back to Dashboard
          </button>
        </div>

        {/* Hero Banner */}
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <h2 style={{ fontSize: 42, fontWeight: 900, color: '#ffffff', marginBottom: 16, letterSpacing: '-1px', background: 'linear-gradient(135deg, #ffffff 30%, #a5b4fc 70%, #f472b6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Scale Your AI Marketing Across All Apps
          </h2>
          <p style={{ fontSize: 16, color: '#94a3b8', maxWidth: 680, margin: '0 auto', lineHeight: 1.7 }}>
            Unlock unlimited AI ad actors, high-converting scripts, and multi-channel scheduling with progressive overage protection. Pay per token or subscribe for maximum volume discounts.
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 28, marginBottom: 64 }}>
          {PRICING_TIERS.map(tier => (
            <div key={tier.id} style={{ background: tier.popular ? 'linear-gradient(180deg, rgba(99,102,241,0.18) 0%, rgba(10,15,30,0.98) 100%)' : 'linear-gradient(180deg, rgba(15,23,42,0.9) 0%, rgba(8,12,22,0.98) 100%)', border: tier.popular ? '2px solid #ec4899' : '1px solid rgba(255,255,255,0.1)', borderRadius: 28, padding: 36, display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: tier.popular ? '0 25px 60px rgba(236,72,153,0.25)' : '0 15px 40px rgba(0,0,0,0.5)', transition: 'all 0.3s ease' }}
              onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-4px)'}}
              onMouseLeave={e=>{e.currentTarget.style.transform='translateY(0)'}}>
              
              {tier.popular && (
                <div style={{ position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg,#ec4899,#8b5cf6,#6366f1)', color: '#fff', fontSize: 11, fontWeight: 800, padding: '6px 18px', borderRadius: 20, letterSpacing: 0.8, boxShadow: '0 6px 20px rgba(236,72,153,0.5)', textTransform: 'uppercase' }}>
                  🔥 Most Popular For Growth
                </div>
              )}

              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 22, fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>{tier.name}</h3>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 16 }}>
                  <span style={{ fontSize: 42, fontWeight: 900, color: '#ffffff' }}>${tier.price}</span>
                  <span style={{ fontSize: 14, color: '#94a3b8', fontWeight: 500 }}>/ month</span>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: tier.popular ? 'rgba(236,72,153,0.15)' : 'rgba(99,102,241,0.15)', border: tier.popular ? '1px solid rgba(236,72,153,0.3)' : '1px solid rgba(99,102,241,0.3)', borderRadius: 10, fontSize: 13, fontWeight: 700, color: tier.popular ? '#f472b6' : '#a5b4fc' }}>
                  <span>⚡</span> {tier.tokens} Tokens included
                </div>
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 24, marginBottom: 32, flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {tier.features.map((feat, fi) => (
                  <div key={fi} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13.5, color: '#cbd5e1', fontWeight: 450 }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <span>{feat}</span>
                  </div>
                ))}
              </div>

              <button onClick={() => handleSubscribe(tier)} disabled={loadingTier === tier.id} style={{ width: '100%', padding: '16px 24px', borderRadius: 14, border: 'none', background: tier.popular ? 'linear-gradient(135deg,#ec4899,#8b5cf6,#6366f1)' : 'linear-gradient(135deg,rgba(255,255,255,0.12),rgba(255,255,255,0.06))', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit', boxShadow: tier.popular ? '0 8px 25px rgba(236,72,153,0.4)' : '0 4px 15px rgba(0,0,0,0.3)', transition: 'all 0.2s' }}
                onMouseEnter={e=>{e.currentTarget.style.transform='scale(1.02)'}}
                onMouseLeave={e=>{e.currentTarget.style.transform='scale(1)'}}>
                {loadingTier === tier.id ? 'Processing Stripe Checkout...' : `Get ${tier.name}`}
              </button>
            </div>
          ))}
        </div>

        {/* FAQ & Progressive Overage Section */}
        <div style={{ background: 'linear-gradient(180deg, rgba(15,23,42,0.8) 0%, rgba(8,12,22,0.95) 100%)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 28, padding: 40, boxShadow: '0 20px 50px rgba(0,0,0,0.6)' }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: '#ffffff', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>💡</span> Frequently Asked Questions & Token Rules
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 28 }}>
            <div>
              <h4 style={{ fontSize: 15, fontWeight: 700, color: '#f472b6', marginBottom: 8 }}>How does progressive overage work?</h4>
              <p style={{ fontSize: 13.5, color: '#94a3b8', lineHeight: 1.6 }}>
                If your monthly token credit drops below 50 tokens or runs out during an active multi-app campaign, FloStudio pauses right before completion and prompts a 1-click token reload or progressive tier upgrade so you never lose work.
              </p>
            </div>
            <div>
              <h4 style={{ fontSize: 15, fontWeight: 700, color: '#a5b4fc', marginBottom: 8 }}>How are tokens consumed?</h4>
              <p style={{ fontSize: 13.5, color: '#94a3b8', lineHeight: 1.6 }}>
                Social posts consume 1 token, AI image studio generations consume 5 tokens, and full multi-app campaign packs consume 15 tokens. All tracked securely in your dedicated Supabase token ledger.
              </p>
            </div>
            <div>
              <h4 style={{ fontSize: 15, fontWeight: 700, color: '#38bdf8', marginBottom: 8 }}>Can I manage multiple apps?</h4>
              <p style={{ fontSize: 13.5, color: '#94a3b8', lineHeight: 1.6 }}>
                Yes! Switch seamlessly between BoothProfit, DailyPromise, PocketLawyer, GymGuard, and Syllabus Agent using the sidebar app workspace selector.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
