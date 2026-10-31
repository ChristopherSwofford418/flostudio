const DIRECT_FACEBOOK_GROUP = /^https?:\/\/(?:www\.)?facebook\.com\/groups\/([a-z0-9._-]+)\/?$/i
const SAFE_HTTP_URL = /^https?:\/\//i

export function normalizeFacebookGroupUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    const match = `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`.match(DIRECT_FACEBOOK_GROUP)
    if (!match || parsed.username || parsed.password) return ''
    return `https://www.facebook.com/groups/${match[1]}/`
  } catch {
    return ''
  }
}

export function isSafeResearchUrl(value) {
  const raw = String(value || '').trim()
  if (!SAFE_HTTP_URL.test(raw)) return false
  try {
    const parsed = new URL(raw)
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password
  } catch {
    return false
  }
}

export function sortFacebookGroupDiscoveries(rows = []) {
  return [...rows]
    .filter(row => row?.research_status !== 'archived' && normalizeFacebookGroupUrl(row?.group_url) && isSafeResearchUrl(row?.source_url))
    .sort((a, b) => Number(a.rank || 99) - Number(b.rank || 99))
    .slice(0, 20)
}

export async function listFacebookGroupDiscoveries({ workspaceId, userId, productId }) {
  if (!workspaceId || !userId || !productId) return []
  const { supabase } = await import('../supabase.js')
  const { data, error } = await supabase
    .from('facebook_group_discoveries')
    .select('id, group_name, group_url, rank, relevance_summary, evidence_basis, public_access_note, source_url, research_status, researched_at, collected_at')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .eq('product_id', productId)
    .neq('research_status', 'archived')
    .order('rank', { ascending:true })
    .limit(20)
  if (error) throw error
  return sortFacebookGroupDiscoveries(data || [])
}
