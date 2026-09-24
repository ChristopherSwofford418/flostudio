import { supabase } from '../supabase'

export const PRICING_TIERS = [
  {
    id: 'starter',
    name: 'Starter Pack',
    price: 9.99,
    tokens: 100,
    features: ['100 Monthly Credits', 'No Watermark', 'AI Actor Library (100+)', 'Model Playground', 'Ad Inspiration (200+ templates)', 'Up to 2 minutes video duration', '1 Seat', '1 Brand Space']
  },
  {
    id: 'pro',
    name: 'Pro Growth',
    price: 29.99,
    tokens: 500,
    popular: true,
    features: ['500 - 1,000 Monthly Credits', 'No Watermark', 'AI Actor Library (400+)', 'Model Playground (100+ models)', 'Ad Inspiration (500+ templates)', 'Competitor Ad Tracker (up to 10 brands)', 'AI Agent & Ad Flow', 'Ad Clone & Ad Insights', 'Up to 10 minutes video duration', '1 Seat', '1 Brand Space']
  },
  {
    id: 'enterprise',
    name: 'Enterprise / Custom',
    price: 99.99,
    tokens: 2500,
    features: ['Custom Credits', 'Unlimited AI Actors & Models', 'Competitor Tracker (Custom)', 'AI Performance Agent (Meta/TikTok/AppLovin)', 'AI-powered Creative & Media Buying', 'API Volume-Based Discount', 'Enterprise Security & Privacy', 'Dedicated Account Manager', '24/7 Priority Support']
  }
]

export async function fetchUserTokens(userId) {
  if (!userId) return { balance:50, tier:'free', unlimited:false }
  const { data, error } = await supabase
    .from('user_tokens')
    .select('balance, tier, unlimited')
    .eq('user_id', userId)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  if (!data) {
    const { data:created, error:insertError } = await supabase
      .from('user_tokens')
      .insert([{ user_id:userId, balance:50, tier:'free', unlimited:false }])
      .select('balance, tier, unlimited')
      .single()
    if (insertError) throw insertError
    return created
  }
  return data
}

async function authHeaders() {
  const { data:{ session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sign in to FloStudio before starting a token-billed render.')
  return { Authorization:`Bearer ${session.access_token}` }
}

async function tokenLedger(payload) {
  const response = await fetch('/api/token-ledger', {
    method:'POST',
    headers:{ ...(await authHeaders()), 'Content-Type':'application/json' },
    body:JSON.stringify(payload),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data.error) throw new Error(data.error || 'FloStudio could not update the token ledger.')
  return data
}

// Every debited render is settled by the server with a short-lived lineage id. The browser
// never receives write access to balances, entitlements, positive ledger entries, or tiers.
export async function consumeTokens(userId, cost, actionName) {
  const { data:{ user } } = await supabase.auth.getUser()
  if (!user?.id || user.id !== userId) throw new Error('Sign in to FloStudio before starting a token-billed render.')
  const result = await tokenLedger({ action:'charge', cost:Number(cost), label:actionName })
  return { balance:Number(result.balance), transactionId:result.transactionId || null, unlimited:Boolean(result.unlimited) }
}

// A refund must name the exact debit returned by consumeTokens. The database prevents
// double or over-refunds and associates the compensating credit with that debit.
export async function refundTokens({ transactionId, amount, actionName }) {
  if (!transactionId) throw new Error('FloStudio could not identify the render charge eligible for a refund.')
  const result = await tokenLedger({ action:'refund', transactionId, amount:Number(amount), reason:actionName })
  return { balance:Number(result.balance), unlimited:Boolean(result.unlimited) }
}

// Billing is intentionally not simulated. A real Stripe server route and webhook must be
// configured before an account can receive paid credits or entitlement changes.
export async function initiateStripeCheckout() {
  return {
    success:false,
    code:'CHECKOUT_NOT_CONFIGURED',
    message:'Paid checkout is not configured yet. No payment was started and no FloStudio credits were added.'
  }
}
