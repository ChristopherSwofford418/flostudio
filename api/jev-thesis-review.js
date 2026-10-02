import { buildJevReviewPresentation, buildJevThesisReviewRequest } from '../src/lib/jevDecision.js'
import { authenticatedProviderUser, providerKeyError, SUPABASE_ANON_KEY } from './provider-key-vault.js'
import { resolveWorkspaceTypeSafeKey } from './typesafe-key-vault.js'

const SUPABASE_URL = 'https://jtogllurcrxxaguoxeus.supabase.co'

function sendError(res, error) {
  return res.status(error?.status || 500).json({ error:error?.message || 'FloStudio could not request a Jev thesis review.', code:error?.code || 'JEV_REVIEW_ERROR' })
}

function bodyOf(req) {
  if (!req.body) return {}
  if (typeof req.body === 'string') { try { return JSON.parse(req.body) } catch { return {} } }
  return req.body
}

async function scopedRecord({ table, select, id, workspaceId, userId, accessToken }) {
  const params = new URLSearchParams({ select, id:`eq.${id}`, workspace_id:`eq.${workspaceId}`, user_id:`eq.${userId}`, limit:'1' })
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { headers:{ apikey:SUPABASE_ANON_KEY, Authorization:`Bearer ${accessToken}` } })
  const data = await response.json().catch(() => [])
  if (!response.ok || !Array.isArray(data) || !data[0]) throw providerKeyError('JEV_SCOPE_DENIED', 'The selected Jev review record is not available in this app and workspace.', 403)
  return data[0]
}

async function userOwnedRecord({ table, select, id, userId, accessToken }) {
  const params = new URLSearchParams({ select, id:`eq.${id}`, user_id:`eq.${userId}`, limit:'1' })
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { headers:{ apikey:SUPABASE_ANON_KEY, Authorization:`Bearer ${accessToken}` } })
  const data = await response.json().catch(() => [])
  if (!response.ok || !Array.isArray(data) || !data[0]) throw providerKeyError('JEV_SCOPE_DENIED', 'The selected Jev review record is not available to the signed-in owner.', 403)
  return data[0]
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' })
    const { user, accessToken } = await authenticatedProviderUser(req)
    const body = bodyOf(req)
    const workspaceId = String(body.workspaceId || '').trim()
    const productId = String(body.productId || '').trim()
    const campaignId = String(body.campaignId || '').trim()
    const conceptId = String(body.conceptId || '').trim()
    if (![workspaceId, productId, campaignId, conceptId].every(Boolean)) throw providerKeyError('JEV_REVIEW_SCOPE_REQUIRED', 'Select an app, campaign, and thesis before requesting a Jev review.', 400)

    const [product, campaign, concept] = await Promise.all([
      scopedRecord({ table:'products', select:'id,name,description,audience,offer_text,source_facts,brand_id', id:productId, workspaceId, userId:user.id, accessToken }),
      scopedRecord({ table:'campaigns', select:'id,name,objective,platforms,brand_id,product_id', id:campaignId, workspaceId, userId:user.id, accessToken }),
      userOwnedRecord({ table:'campaign_concepts', select:'id,campaign_id,title,angle,hook,proof,cta,visual_recipe', id:conceptId, userId:user.id, accessToken }),
    ])
    if (campaign.product_id !== product.id || concept.campaign_id !== campaign.id) throw providerKeyError('JEV_REVIEW_SCOPE_MISMATCH', 'The selected app, campaign, and thesis must belong to the same Flo Studio workflow.', 400)

    const brand = await scopedRecord({ table:'brands', select:'id,name,brand_dna', id:campaign.brand_id || product.brand_id, workspaceId, userId:user.id, accessToken })
    const apiKey = await resolveWorkspaceTypeSafeKey({ workspaceId, accessToken })
    if (!apiKey) throw providerKeyError('TYPESAFE_PROVIDER_NOT_CONNECTED', 'Connect a workspace TypeSafe / Jev key before requesting a thesis review.', 409)

    const request = buildJevThesisReviewRequest({ product, brand, campaign, concept })
    const response = await fetch('https://api.typesafe.ai/v1/systemone', {
      method:'POST',
      headers:{ Authorization:`Bearer ${apiKey}`, 'Content-Type':'application/json' },
      body:JSON.stringify(request),
      signal:AbortSignal.timeout(20000),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload?.answers) {
      const detail = payload?.detail || payload?.message || payload?.error?.message || 'TypeSafe did not return a structured Jev decision.'
      const status = response.status === 401 ? 401 : response.status === 429 ? 429 : response.status === 529 ? 503 : 422
      throw providerKeyError('JEV_PROVIDER_REQUEST_FAILED', detail, status)
    }
    return res.status(200).json({
      decision:buildJevReviewPresentation(payload),
      policy:{ decision_support_only:true, persisted:false, automatically_publishes:false, advances_momentum:false, requires_human_review:true },
    })
  } catch (error) {
    return sendError(res, error)
  }
}
