import { supabase } from '../supabase'

const ENGINES = new Set(['google', 'bing', 'chatgpt', 'claude', 'gemini', 'perplexity', 'other'])

async function currentUser() {
  const { data:{ user } } = await supabase.auth.getUser()
  if (!user?.id) throw new Error('Sign in again before saving visibility evidence.')
  return user
}

function normalizeUrl(value) {
  const candidate = String(value || '').trim()
  if (!candidate) return ''
  try {
    const parsed = new URL(candidate)
    return /^https?:$/.test(parsed.protocol) ? parsed.toString() : ''
  } catch { return '' }
}

export function parseCitationUrls(value) {
  return [...new Set(String(value || '').split(/\n|,/).map(normalizeUrl).filter(Boolean))].slice(0, 12)
}

export async function listSearchVisibilityEvidence(productId) {
  if (!productId) return []
  const { data, error } = await supabase
    .from('search_visibility_evidence')
    .select('id, engine, prompt_text, result_url, cited_urls, notes, evidence_status, observed_at')
    .eq('product_id', productId)
    .neq('evidence_status', 'archived')
    .order('observed_at', { ascending:false })
    .limit(30)
  if (error) throw error
  return data || []
}

export async function createSearchVisibilityEvidence({ workspaceId, productId, engine, promptText, resultUrl, citedUrls, notes }) {
  const user = await currentUser()
  if (!workspaceId || !productId) throw new Error('Choose a portfolio app before saving visibility evidence.')
  const normalizedEngine = ENGINES.has(engine) ? engine : 'other'
  const cleanPrompt = String(promptText || '').trim().slice(0, 1000)
  if (!cleanPrompt) throw new Error('Enter the query or AI prompt you observed.')
  const normalizedResultUrl = normalizeUrl(resultUrl)
  const normalizedCitations = parseCitationUrls(citedUrls)
  const { data, error } = await supabase.from('search_visibility_evidence').insert({
    workspace_id:workspaceId,
    user_id:user.id,
    product_id:productId,
    engine:normalizedEngine,
    prompt_text:cleanPrompt,
    result_url:normalizedResultUrl || null,
    cited_urls:normalizedCitations,
    notes:String(notes || '').trim().slice(0, 2000),
    evidence_status:'observed',
  }).select().single()
  if (error) throw error
  return data
}

export function formatEvidenceTime(value) {
  const date = new Date(value || 0)
  return Number.isNaN(date.getTime()) ? 'Just now' : date.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
}
