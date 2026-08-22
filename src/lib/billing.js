import { supabase } from '../supabase'

// Pricing tiers inspired by Creatify AI & Holo AI
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

// Fetch user token balance from Supabase
export async function fetchUserTokens(userId) {
  if (!userId) return { balance: 50, tier: 'free', unlimited: false }
  const { data, error } = await supabase
    .from('user_tokens')
    .select('balance, tier, unlimited')
    .eq('user_id', userId)
    .single()
  
  if (error && error.code !== 'PGRST116') throw error
  if (!data) {
    const { data:created, error:insertError } = await supabase
      .from('user_tokens')
      .insert([{ user_id: userId, balance: 50, tier: 'free', unlimited: false }])
      .select('balance, tier, unlimited')
      .single()
    if (insertError) throw insertError
    return created
  }
  return data
}

// Deduct tokens or trigger progressive payment gate if balance < cost
export async function consumeTokens(userId, cost, actionName) {
  const current = await fetchUserTokens(userId)
  if (current.unlimited) return current.balance
  if (current.balance < cost) {
    throw new Error(`INSUFFICIENT_TOKENS: Need ${cost} tokens for ${actionName}, but you have ${current.balance}. Please top up your token balance to proceed.`)
  }

  const newBalance = current.balance - cost
  await supabase
    .from('user_tokens')
    .update({ balance: newBalance })
    .eq('user_id', userId)

  await supabase
    .from('token_transactions')
    .insert([{ user_id: userId, amount: -cost, action_type: actionName, description: `Executed ${actionName}` }])

  return newBalance
}

// Restore credits only when FloStudio failed before delivering a usable output.
export async function refundTokens(userId, amount, actionName) {
  const credit = Math.max(0, Number(amount) || 0)
  if (!credit) return (await fetchUserTokens(userId)).balance
  const current = await fetchUserTokens(userId)
  if (current.unlimited) return current.balance
  const newBalance = current.balance + credit
  const { error } = await supabase
    .from('user_tokens')
    .update({ balance: newBalance })
    .eq('user_id', userId)
  if (error) throw error
  await supabase
    .from('token_transactions')
    .insert([{ user_id: userId, amount: credit, action_type: 'generation_refund', description: `Restored after unsuccessful ${actionName}` }])
  return newBalance
}

// Simulate Stripe Checkout redirection for web
export async function initiateStripeCheckout(tierId, price, tokens) {
  // In production, this calls backend to create Stripe Checkout Session.
  // For web demo simulation with live Stripe link or hosted checkout:
  const stripeTestLinks = {
    starter: 'https://buy.stripe.com/test_starter_100_tokens',
    pro: 'https://buy.stripe.com/test_pro_500_tokens',
    enterprise: 'https://buy.stripe.com/test_enterprise_2500_tokens'
  }
  
  const paymentUrl = stripeTestLinks[tierId] || 'https://billing.stripe.com/p/login/test'
  
  // Also record a pending transaction in Supabase if user is logged in
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    await supabase.from('token_transactions').insert([{
      user_id: user.id,
      amount: tokens,
      action_type: 'stripe_refill',
      description: `Purchased ${tierId} (${tokens} tokens) for $${price}`
    }])
    
    // Top up balance immediately for seamless UX
    const current = await fetchUserTokens(user.id)
    await supabase.from('user_tokens').update({ balance: current.balance + tokens, tier: tierId }).eq('user_id', user.id)
  }

  return { success: true, tokensAdded: tokens, redirectUrl: paymentUrl }
}
