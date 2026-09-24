import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabase'
import { fetchUserTokens, consumeTokens as backendConsumeTokens, refundTokens as backendRefundTokens } from '../lib/billing'
import { ensurePersonalWorkspace, getWorkspaceRole, listPortfolioApps } from '../lib/portfolio'

const WorkspaceContext = createContext(null)
const ACTIVE_APP_STORAGE_KEY = 'flostudio.active_app_id'

export function WorkspaceProvider({ children }) {
  const [apps, setApps] = useState([])
  const [activeApp, setActiveApp] = useState(null)
  const [workspaceId, setWorkspaceId] = useState(null)
  const [workspaceRole, setWorkspaceRole] = useState('none')
  const [tokens, setTokens] = useState(50)
  const [tier, setTier] = useState('free')
  const [unlimited, setUnlimited] = useState(false)
  const [showTopUp, setShowTopUp] = useState(false)
  const [notification, setNotification] = useState(null)
  const [workspaceLoading, setWorkspaceLoading] = useState(true)
  const [workspaceError, setWorkspaceError] = useState('')
  const initializationRef = useRef(0)
  const latestTokenChargeRef = useRef(null)

  const refreshApps = useCallback(async (preferredId = null) => {
    if (!workspaceId) return []
    const nextApps = await listPortfolioApps(workspaceId)
    setApps(nextApps)
    setActiveApp(current => nextApps.find(app => app.id === preferredId) || nextApps.find(app => app.id === current?.id) || nextApps[0] || null)
    return nextApps
  }, [workspaceId])

  const clearWorkspace = useCallback(() => {
    initializationRef.current += 1
    setApps([])
    setActiveApp(null)
    setWorkspaceId(null)
    setWorkspaceRole('none')
    setTokens(50)
    setTier('free')
    setUnlimited(false)
    setWorkspaceError('')
    setWorkspaceLoading(false)
  }, [])

  const initializeWorkspace = useCallback(async user => {
    if (!user) { clearWorkspace(); return }
    const initializationId = initializationRef.current + 1
    initializationRef.current = initializationId
    setWorkspaceLoading(true)
    setWorkspaceError('')
    try {
      const workspace = await ensurePersonalWorkspace()
      const [tokenState, nextApps, role] = await Promise.all([fetchUserTokens(user.id), listPortfolioApps(workspace), getWorkspaceRole(workspace)])
      if (initializationRef.current !== initializationId) return
      setWorkspaceId(workspace)
      setWorkspaceRole(role)
      setTokens(tokenState.balance)
      setTier(tokenState.tier)
      setUnlimited(Boolean(tokenState.unlimited))
      const availableApps = Array.isArray(nextApps) ? nextApps : []
      const savedActiveAppId = typeof window !== 'undefined' ? window.localStorage.getItem(ACTIVE_APP_STORAGE_KEY) : null
      setApps(availableApps)
      setActiveApp(current => availableApps.find(app => app.id === current?.id) || availableApps.find(app => app.id === savedActiveAppId) || availableApps[0] || null)
    } catch (error) {
      if (initializationRef.current !== initializationId) return
      console.error('FloStudio workspace initialization failed', error)
      setWorkspaceError(error?.message || 'We could not finish setting up your workspace. Retry loading this page.')
    } finally {
      if (initializationRef.current === initializationId) setWorkspaceLoading(false)
    }
  }, [clearWorkspace])

  useEffect(() => {
    if (activeApp?.id && typeof window !== 'undefined') window.localStorage.setItem(ACTIVE_APP_STORAGE_KEY, activeApp.id)
  }, [activeApp?.id])

  useEffect(() => {
    let mounted = true
    const boot = async () => {
      try {
        const { data:{ user }, error } = await supabase.auth.getUser()
        if (error) throw error
        if (mounted) await initializeWorkspace(user)
      } catch (error) {
        if (!mounted) return
        console.error('FloStudio workspace boot failed', error)
        setWorkspaceError(error?.message || 'We could not restore this workspace. Retry the page.')
        setWorkspaceLoading(false)
      }
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
    if (unlimited) {
      notify(`Unlimited owner access active for ${actionName}.`)
      return true
    }
    if (tokens < cost) {
      setShowTopUp(true)
      notify(`Token limit reached. Need ${cost} tokens for ${actionName}. Please top up.`)
      return false
    }
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      try {
        const result = await backendConsumeTokens(user.id, cost, actionName)
        latestTokenChargeRef.current = result.transactionId ? { transactionId:result.transactionId, amount:Number(cost), actionName } : null
        setTokens(result.balance)
        notify(`Used ${cost} tokens for ${actionName} (${result.balance} remaining)`)
        return true
      } catch (err) {
        notify(err.message)
        setShowTopUp(true)
        return false
      }
    }
    notify('Sign in to FloStudio before starting a token-billed render.')
    return false
  }

  const refundTokens = async (amount, actionName) => {
    const charge = latestTokenChargeRef.current
    if (!charge?.transactionId) return null
    const result = await backendRefundTokens({ transactionId:charge.transactionId, amount, actionName })
    latestTokenChargeRef.current = null
    setTokens(result.balance)
    notify(`Restored ${amount} tokens because ${actionName} did not produce an output.`)
    return result.balance
  }

  const addTokens = () => {
    setShowTopUp(false)
    notify('Paid credits are not configured yet. No FloStudio tokens were added.')
  }

  return (
      <WorkspaceContext.Provider value={{ apps, activeApp, setActiveApp, workspaceId, workspaceRole, refreshApps, workspaceLoading, workspaceError, initializeWorkspace, tokens, tier, unlimited, useTokens, refundTokens, addTokens, showTopUp, setShowTopUp }}>
      {children}
      {notification && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'rgba(23,23,23, 0.95)', border: '1px solid rgba(111,111,111,0.3)', color: '#f4f4f4', padding: '12px 20px', borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, backdropFilter: 'blur(10px)' }}>
          <span>{notification}</span>
        </div>
      )}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  return useContext(WorkspaceContext)
}
