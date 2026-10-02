import { buildJevFormatCandidates, buildJevFormatShortlistRequest, presentJevFormatShortlist, resolveJevFormatCandidate } from '../src/lib/jevFormatAdaptation.js'
import { authenticatedProviderUser, providerKeyError, SUPABASE_ANON_KEY } from './provider-key-vault.js'
import { resolveWorkspaceTypeSafeKey } from './typesafe-key-vault.js'

const SUPABASE_URL = 'https://jtogllurcrxxaguoxeus.supabase.co'

function bodyOf(req) {
  if (!req.body) return {}
  if (typeof req.body === 'string') { try { return JSON.parse(req.body) } catch { return {} } }
  return req.body
}

function sendError(res, error) {
  return res.status(error?.status || 500).json({ error:error?.message || 'FloStudio could not request a Jev format shortlist.', code:error?.code || 'JEV_FORMAT_ERROR' })
}

async function scopedProduct({ productId, workspaceId, userId, accessToken }) {
  const params = new URLSearchParams({ select:'id,name,description,audience,offer_text,source_facts', id:`eq.${productId}`, workspace_id:`eq.${workspaceId}`, user_id:`eq.${userId}`, limit:'1' })
  const response = await fetch(`${SUPABASE_URL}/rest/v1/products?${params}`, { headers:{ apikey:SUPABASE_ANON_KEY, Authorization:`Bearer ${accessToken}` } })
  const data = await response.json().catch(() => [])
  if (!response.ok || !Array.isArray(data) || !data[0]) throw providerKeyError('JEV_FORMAT_SCOPE_DENIED', 'The selected app is not available in this workspace.', 403)
  return data[0]
}

async function scopedExamples({ productId, workspaceId, userId, accessToken }) {
  const params = new URLSearchParams({
    select:'id,platform,source_url,source_creator,format_pattern,observed_evidence,platform_rank,preview_title,evidence_basis',
    workspace_id:`eq.${workspaceId}`,
    user_id:`eq.${userId}`,
    product_id:`eq.${productId}`,
    research_status:'neq.archived',
    platform_rank:'gte.1',
    order:'platform.asc,platform_rank.asc',
    limit:'24',
  })
  const response = await fetch(`${SUPABASE_URL}/rest/v1/shortform_research_examples?${params}`, { headers:{ apikey:SUPABASE_ANON_KEY, Authorization:`Bearer ${accessToken}` } })
  const data = await response.json().catch(() => [])
  if (!response.ok) throw providerKeyError('JEV_FORMAT_RESEARCH_UNAVAILABLE', 'FloStudio could not load the selected app’s public format research.', 422)
  return data || []
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' })
    const { user, accessToken } = await authenticatedProviderUser(req)
    const body = bodyOf(req)
    const workspaceId = String(body.workspaceId || '').trim()
    const productId = String(body.productId || '').trim()
    if (!workspaceId || !productId) throw providerKeyError('JEV_FORMAT_SCOPE_REQUIRED', 'Select an app before asking Jev to shortlist a format.', 400)

    const [product, examples] = await Promise.all([
      scopedProduct({ productId, workspaceId, userId:user.id, accessToken }),
      scopedExamples({ productId, workspaceId, userId:user.id, accessToken }),
    ])
    const candidates = buildJevFormatCandidates(examples)
    if (!candidates.length) throw providerKeyError('JEV_FORMAT_RESEARCH_REQUIRED', 'This app needs ranked public format research before Jev can shortlist an original direction.', 409)
    const apiKey = await resolveWorkspaceTypeSafeKey({ workspaceId, accessToken })
    if (!apiKey) throw providerKeyError('TYPESAFE_PROVIDER_NOT_CONNECTED', 'Connect a workspace TypeSafe / Jev key before requesting a format shortlist.', 409)

    const request = buildJevFormatShortlistRequest({ product, examples:candidates })
    const response = await fetch('https://api.typesafe.ai/v1/systemone', {
      method:'POST',
      headers:{ Authorization:`Bearer ${apiKey}`, 'Content-Type':'application/json' },
      body:JSON.stringify(request),
      signal:AbortSignal.timeout(20000),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload?.answers?.best_format?.choice) {
      const detail = payload?.detail || payload?.message || payload?.error?.message || 'TypeSafe did not return a structured format choice.'
      const status = response.status === 401 ? 401 : response.status === 429 ? 429 : response.status === 529 ? 503 : 422
      throw providerKeyError('JEV_FORMAT_PROVIDER_FAILED', detail, status)
    }
    const source = resolveJevFormatCandidate(candidates, payload.answers.best_format.choice)
    if (!source) throw providerKeyError('JEV_FORMAT_RESPONSE_INVALID', 'TypeSafe returned a format choice outside the app-scoped candidate set.', 422)
    return res.status(200).json({
      shortlist:presentJevFormatShortlist({ response:payload, source, product }),
      policy:{ decision_support_only:true, persisted:false, performance_ranking:false, copies_source:false, automatically_renders:false, automatically_publishes:false, requires_human_review:true },
    })
  } catch (error) {
    return sendError(res, error)
  }
}
