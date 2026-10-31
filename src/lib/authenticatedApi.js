import { supabase } from '../supabase'

export async function authenticatedHeaders() {
  const { data:{ session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sign in again before continuing.')
  return { Authorization:`Bearer ${session.access_token}` }
}

export async function authenticatedJsonHeaders() {
  return { ...(await authenticatedHeaders()), 'Content-Type':'application/json' }
}
