import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { fetchUserTokens, consumeTokens as backendConsumeTokens } from '../lib/billing'

const PORTFOLIO_APPS = [
  { id: 'boothprofit', name: 'BoothProfit', category: 'Salon & Stylist SaaS', icon: '✂️', desc: 'Booth-renter profit & inventory forecasting', url: 'https://apps.apple.com/us/app/boothprofit/id6780448901' },
  { id: 'dailypromise', name: 'DailyPromise', category: 'Faith & Devotional', icon: '📖', desc: 'Daily Bible verse & faith reminders', url: 'https://apps.apple.com/us/app/dailypromise-bible-verse/id6780448901' },
  { id: 'pocketlawyer', name: 'PocketLawyer', category: 'AI Legal Assistant', icon: '⚖️', desc: 'Legal health audits & document analysis', url: 'https://apps.apple.com/us/app/pocketlawyer/id6780260927' },
  { id: 'gymguard', name: 'GymGuard', category: 'Fitness & Safety', icon: '🛡️', desc: 'AI gym safety & workout tracker', url: 'https://apps.apple.com/us/app/gymguard/id6780260926' },
  { id: 'syllabusagent', name: 'Syllabus Agent', category: 'Education & Study', icon: '📚', desc: 'AI study companion & flashcard generator', url: 'https://apps.apple.com/us/app/syllabusagent/id6780260925' },
]

const WorkspaceContext = createContext(null)

export function WorkspaceProvider({ children }) {
  const [activeApp, setActiveApp] = useState(PORTFOLIO_APPS[0])
  const [tokens, setTokens] = useState(50)
  const [tier, setTier] = useState('free')
  const [showTopUp, setShowTopUp] = useState(false)
  const [notification, setNotification] = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        try {
          const res = await fetchUserTokens(user.id)
          setTokens(res.balance)
          setTier(res.tier)
        } catch (e) {
          console.error(e)
        }
      }
    })
  }, [])

  const notify = (msg) => {
    setNotification(msg)
    setTimeout(() => setNotification(null), 3500)
  }

  const useTokens = async (cost, actionName) => {
    if (tokens < cost) {
      setShowTopUp(true)
      notify(`⚠️ Token limit reached! Need ${cost} tokens for ${actionName}. Please top up.`)
      return false
    }
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      try {
        const newBal = await backendConsumeTokens(user.id, cost, actionName)
        setTokens(newBal)
        notify(`⚡ Used ${cost} tokens for ${actionName} (${newBal} remaining)`)
        return true
      } catch (err) {
        notify(`⚠️ ${err.message}`)
        setShowTopUp(true)
        return false
      }
    } else {
      // Local fallback
      setTokens(prev => prev - cost)
      notify(`⚡ Used ${cost} tokens for ${actionName}`)
      return true
    }
  }

  const addTokens = (amount) => {
    setTokens(prev => prev + amount)
    setShowTopUp(false)
    notify(`🎉 Successfully added ${amount} tokens to your balance!`)
  }

  return (
    <WorkspaceContext.Provider value={{ apps: PORTFOLIO_APPS, activeApp, setActiveApp, tokens, tier, useTokens, addTokens, showTopUp, setShowTopUp }}>
      {children}
      {notification && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(99,102,241,0.3)', color: '#f1f5f9', padding: '12px 20px', borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, backdropFilter: 'blur(10px)' }}>
          <span>{notification}</span>
        </div>
      )}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  return useContext(WorkspaceContext)
}
