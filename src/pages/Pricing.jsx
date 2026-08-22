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
      <div className="flo-page" style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 60, animation: 'fadeIn 0.25s ease' }}>
        <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

        {/* Hero */}
        <section className="abundance-shell" style={{ textAlign:'center', padding:'42px 24px', marginBottom:32 }}>
          <div style={{ position:'relative', zIndex:1 }}><div className="abundance-eyebrow">Creative fuel / Usage designed to scale</div><h1 className="abundance-title" style={{ marginTop:12 }}>More momentum. <em>More work in market.</em></h1><p className="abundance-copy" style={{ maxWidth:640, margin:'16px auto 0' }}>Choose the creative fuel your team needs for high-converting ads, polished scripts, and a channel-ready publishing cadence.</p><div className="abundance-rail" style={{ justifyContent:'center', marginTop:20 }}><span className="abundance-pill"><i/> token-based usage</span><span className="abundance-pill">scale when demand arrives</span></div></div>
        </section>

        {/* Pricing Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24, marginBottom: 48 }}>
          {PRICING_TIERS.map(tier => (
            <div key={tier.id} className="abundance-card" style={{ border: tier.popular ? '2px solid #9b9b9b' : '1px solid rgba(255,255,255,.13)', padding: 32, display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: tier.popular ? '0 20px 48px rgba(122,122,122,.2)' : undefined, transition: 'all 0.2s' }}
              onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-3px)'}}
              onMouseLeave={e=>{e.currentTarget.style.transform='translateY(0)'}}>
              
              {tier.popular && (
                <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg,#535353,#555555,#535353)', color: '#ffffff', fontSize: 11, fontWeight: 800, padding: '5px 16px', borderRadius: 20, letterSpacing: 0.5, boxShadow: '0 4px 15px rgba(83,83,83,0.3)', textTransform: 'uppercase' }}>
                  Most Popular
                </div>
              )}

              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 20, fontWeight: 800, color: '#ffffff', marginBottom: 6 }}>{tier.name}</h3>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 14 }}>
                  <span style={{ fontSize: 38, fontWeight: 900, color: '#ffffff' }}>${tier.price}</span>
                  <span style={{ fontSize: 13, color: 'rgba(232,232,232,.62)', fontWeight: 500 }}>/ month</span>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: 'rgba(136,136,136,.13)', border: '1px solid rgba(156,156,156,.3)', borderRadius: 8, fontSize: 12, fontWeight: 700, color: '#c7c7c7' }}>
                  {tier.tokens} tokens included
                </div>
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,.12)', paddingTop: 20, marginBottom: 28, flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {tier.features.map((feat, fi) => (
                  <div key={fi} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: 'rgba(240,240,240,.78)', fontWeight: 500 }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(210,210,210,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ebebeb" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <span>{feat}</span>
                  </div>
                ))}
              </div>

              <button onClick={() => handleSubscribe(tier)} disabled={loadingTier === tier.id} style={{ width: '100%', padding: '14px 20px', borderRadius: 12, border: tier.popular ? 'none' : '1px solid rgba(255,255,255,.15)', background: tier.popular ? 'linear-gradient(135deg,#878787,#727272)' : 'rgba(255,255,255,.08)', color: '#ffffff', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', boxShadow: tier.popular ? '0 10px 22px rgba(122,122,122,.25)' : 'none', transition: 'all 0.15s' }}>
                {loadingTier === tier.id ? 'Processing...' : `Get ${tier.name}`}
              </button>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  )
}
