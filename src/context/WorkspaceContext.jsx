import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import { fetchUserTokens, consumeTokens as backendConsumeTokens } from '../lib/billing'
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

  const refreshApps = useCallback(async (preferredId = null) => {
    if (!workspaceId) return []
    const nextApps = await listPortfolioApps(workspaceId)
    setApps(nextApps)
    setActiveApp(current => nextApps.find(app => app.id === preferredId) || nextApps.find(app => app.id === current?.id) || nextApps[0] || null)
    return nextApps
  }, [workspaceId])

  useEffect(() => {
    let mounted = true
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!mounted || !user) return
      try {
        const [workspace, tokenState] = await Promise.all([ensurePersonalWorkspace(), fetchUserTokens(user.id)])
        if (!mounted) return
        setWorkspaceId(workspace)
        setTokens(tokenState.balance)
        setTier(tokenState.tier)
        const nextApps = await listPortfolioApps(workspace)
        if (!mounted) return
        setApps(nextApps)
        setActiveApp(nextApps[0] || null)
      } catch (error) {
        console.error('FloStudio workspace initialization failed', error)
      }
    })
    return () => { mounted = false }
  }, [])

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

  const addTokens = (amount) => {
    setTokens(prev => prev + amount)
    setShowTopUp(false)
    notify(`Successfully added ${amount} tokens to your balance.`)
  }

  return (
    <WorkspaceContext.Provider value={{ apps, activeApp, setActiveApp, workspaceId, refreshApps, tokens, tier, useTokens, addTokens, showTopUp, setShowTopUp }}>
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
