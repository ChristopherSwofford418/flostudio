import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import { fetchUserTokens, consumeTokens as backendConsumeTokens, refundTokens as backendRefundTokens } from '../lib/billing'
import { ensurePersonalWorkspace, listPortfolioApps } from '../lib/portfolio'

const WorkspaceContext = createContext(null)

export function WorkspaceProvider({ children }) {
  const [apps, setApps] = useState([])
  const [activeApp, setActiveApp] = useState(null)
  const [workspaceId, setWorkspaceId] = useState(null)
  const [tokens, setTokens] = useState(50)
  const [tier, setTier] = useState('free')
  const [showTopUp, setShowTopUp] = useState(false)
  const [notification, setNotification] = useState(null)
  const [workspaceLoading, setWorkspaceLoading] = useState(true)
  const [workspaceError, setWorkspaceError] = useState('')

  const refreshApps = useCallback(async (preferredId = null) => {
    if (!workspaceId) return []
    const nextApps = await listPortfolioApps(workspaceId)
    setApps(nextApps)
    setActiveApp(current => nextApps.find(app => app.id === preferredId) || nextApps.find(app => app.id === current?.id) || nextApps[0] || null)
    return nextApps
  }, [workspaceId])

  const clearWorkspace = useCallback(() => {
    setApps([])
    setActiveApp(null)
    setWorkspaceId(null)
    setTokens(50)
    setTier('free')
    setWorkspaceError('')
    setWorkspaceLoading(false)
  }, [])

  const initializeWorkspace = useCallback(async user => {
    if (!user) { clearWorkspace(); return }
    setWorkspaceLoading(true)
    setWorkspaceError('')
    try {
      const workspace = await ensurePersonalWorkspace()
      const [tokenState, nextApps] = await Promise.all([fetchUserTokens(user.id), listPortfolioApps(workspace)])
      setWorkspaceId(workspace)
      setTokens(tokenState.balance)
      setTier(tokenState.tier)
      setApps(nextApps)
      setActiveApp(current => nextApps.find(app => app.id === current?.id) || nextApps[0] || null)
    } catch (error) {
      console.error('FloStudio workspace initialization failed', error)
      setWorkspaceError(error?.message || 'We could not finish setting up your workspace. Refresh or sign in again.')
    } finally {
      setWorkspaceLoading(false)
    }
  }, [clearWorkspace])

  useEffect(() => {
    let mounted = true
    const boot = async () => {
      const { data:{ user } } = await supabase.auth.getUser()
      if (mounted) await initializeWorkspace(user)
    }
    boot()
    const { data:{ subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      // Supabase auth callbacks should remain synchronous; defer database work so
      // workspace provisioning cannot block the auth client’s session transition.
      window.setTimeout(() => {
        if (!mounted) return
        if (session?.user) initializeWorkspace(session.user)
        else clearWorkspace()
      }, 0)
    })
    return () => { mounted = false; subscription.unsubscribe() }
  }, [clearWorkspace, initializeWorkspace])

  const notify = (msg) => {
    setNotification(msg)
    setTimeout(() => setNotification(null), 3500)
  }

  const useTokens = async (cost, actionName) => {
    if (tokens < cost) {
      setShowTopUp(true)
      notify(`Token limit reached. Need ${cost} tokens for ${actionName}. Please top up.`)
      return false
    }
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      try {
        const newBal = await backendConsumeTokens(user.id, cost, actionName)
        setTokens(newBal)
        notify(`Used ${cost} tokens for ${actionName} (${newBal} remaining)`)
        return true
      } catch (err) {
        notify(err.message)
        setShowTopUp(true)
        return false
      }
    }
    setTokens(prev => prev - cost)
    notify(`Used ${cost} tokens for ${actionName}`)
    return true
  }

  const refundTokens = async (amount, actionName) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const newBalance = await backendRefundTokens(user.id, amount, actionName)
    setTokens(newBalance)
    notify(`Restored ${amount} tokens because ${actionName} did not produce an output.`)
    return newBalance
  }

  const addTokens = (amount) => {
    setTokens(prev => prev + amount)
    setShowTopUp(false)
    notify(`Successfully added ${amount} tokens to your balance.`)
  }

  return (
      <WorkspaceContext.Provider value={{ apps, activeApp, setActiveApp, workspaceId, refreshApps, workspaceLoading, workspaceError, initializeWorkspace, tokens, tier, useTokens, refundTokens, addTokens, showTopUp, setShowTopUp }}>
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
