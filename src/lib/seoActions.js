import { supabase } from '../supabase'

export const SEO_ACTION_META = {
  website_brief: { label:'Website brief', action:'Queue website brief', order:'01' },
  app_store_metadata: { label:'App Store metadata', action:'Queue metadata review', order:'02' },
  creative_brief: { label:'Visual search brief', action:'Queue creative brief', order:'03' },
  measurement_plan: { label:'Measurement plan', action:'Queue measurement plan', order:'04' },
}

function asList(value) {
  return Array.isArray(value) ? value : []
}

export function buildSeoActions({ app, blueprint, readyCreative = [] }) {
  const website = blueprint?.website || {}
  const appStore = blueprint?.appStore || {}
  const sources = blueprint?.sources || {}
  const experiments = asList(blueprint?.experiments)
  const screenshots = asList(appStore?.screenshotPlan)
  const appName = String(app?.name || 'Selected app')

  return [
    {
      type:'website_brief',
      title:`${appName} website SEO brief`,
      description:'Create a review task containing the current landing-page draft, internal-link plan, and FAQ starters.',
      payload:{
        landing_url:website.landingSlug || '/', h1:website.h1 || '', title:website.metaTitle || '', description:website.metaDescription || '',
        keyword_themes:asList(website.keywordThemes), internal_links:asList(website.internalLinks), faqs:asList(website.faqs), listing_url:sources.listingUrl || '',
      },
    },
    {
      type:'app_store_metadata',
      title:`${appName} App Store metadata review`,
      description:'Create a review task with the selected app’s grounded subtitle, keyword, and promotional-text drafts.',
      payload:{
        current_title:appStore.currentTitle || '', current_subtitle:appStore.currentSubtitle || '', subtitle_draft:appStore.subtitleDraft || '',
        keyword_candidate:appStore.candidateKeywordString || '', promotional_text:appStore.promotionalText || '',
      },
    },
    {
      type:'creative_brief',
      title:`${appName} visual search brief`,
      description:'Create a review task for screenshot roles and the app’s completed Creative Lab visuals.',
      payload:{
        screenshot_plan:screenshots.map(item => ({ order:item.order, focus:item.focus, alt_text:item.altText || '', url:item.url || '' })),
        creative_lab_asset_count:readyCreative.length,
        creative_lab_assets:readyCreative.slice(0, 20).map(asset => ({ id:asset.id, type:asset.kind || 'image', url:asset.asset_url || '', label:asset.title || asset.prompt || '' })),
      },
    },
    {
      type:'measurement_plan',
      title:`${appName} discovery measurement plan`,
      description:'Create a review task with the selected app’s manual App Store discovery experiment hypotheses and measurement fields.',
      payload:{ experiments:experiments.map(item => ({ title:item.title || '', hypothesis:item.hypothesis || '', variable:item.variable || '', measurement:item.measurement || '' })) },
    },
  ]
}

export async function listSeoActionTasks(productId) {
  if (!productId) return []
  const { data, error } = await supabase.from('seo_action_tasks').select('*').eq('product_id', productId).order('created_at', { ascending:false }).limit(30)
  if (error) throw error
  return data || []
}

export async function createSeoActionTask({ workspaceId, productId, action }) {
  const { data:{ user } } = await supabase.auth.getUser()
  if (!user?.id) throw new Error('Sign in again before creating an SEO action.')
  if (!workspaceId || !productId || !action) throw new Error('Choose a portfolio app before creating an SEO action.')
  const { data, error } = await supabase.from('seo_action_tasks').insert({
    workspace_id:workspaceId,
    user_id:user.id,
    product_id:productId,
    action_type:action.type,
    title:action.title,
    description:action.description,
    payload:action.payload || {},
    status:'ready',
  }).select().single()
  if (error) throw error
  return data
}

export async function setSeoActionTaskStatus(id, status) {
  const update = { status, updated_at:new Date().toISOString(), completed_at:status === 'completed' ? new Date().toISOString() : null }
  const { data, error } = await supabase.from('seo_action_tasks').update(update).eq('id', id).select().single()
  if (error) throw error
  return data
}

export function formatSeoActionTime(value) {
  const time = new Date(value || 0)
  if (Number.isNaN(time.getTime())) return 'Just now'
  return time.toLocaleDateString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })
}
