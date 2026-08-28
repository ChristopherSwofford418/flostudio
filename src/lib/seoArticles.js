import { supabase } from '../supabase'

async function currentUser() {
  const { data:{ user } } = await supabase.auth.getUser()
  if (!user?.id) throw new Error('Sign in again before using the SEO Library.')
  return user
}

export async function getSeoDestination(productId) {
  if (!productId) return null
  const { data, error } = await supabase.from('seo_destinations').select('*').eq('product_id', productId).maybeSingle()
  if (error) throw error
  return data || null
}

export async function saveSeoDestination({ workspaceId, productId, websiteUrl, blogBasePath, destinationType, publishMode, notes }) {
  const user = await currentUser()
  if (!workspaceId || !productId) throw new Error('Choose an app before saving its SEO destination.')
  const { data, error } = await supabase.from('seo_destinations').upsert({
    workspace_id:workspaceId,
    user_id:user.id,
    product_id:productId,
    website_url:String(websiteUrl || '').trim(),
    blog_base_path:String(blogBasePath || '/blog').trim() || '/blog',
    destination_type:destinationType || 'manual_export',
    publish_mode:publishMode || 'review_only',
    status:String(websiteUrl || '').trim() ? 'ready_for_review' : 'needs_setup',
    notes:String(notes || '').trim(),
    updated_at:new Date().toISOString(),
  }, { onConflict:'user_id,product_id' }).select().single()
  if (error) throw error
  return data
}

export async function listSeoArticles(productId) {
  if (!productId) return []
  const { data, error } = await supabase.from('seo_articles').select('*').eq('product_id', productId).order('created_at', { ascending:false }).limit(20)
  if (error) throw error
  return data || []
}

export async function createSeoArticle({ workspaceId, productId, destinationId, article }) {
  const user = await currentUser()
  if (!workspaceId || !productId || !article) throw new Error('Choose an app and generate an article before saving.')
  const { data, error } = await supabase.from('seo_articles').insert({
    workspace_id:workspaceId,
    user_id:user.id,
    product_id:productId,
    destination_id:destinationId || null,
    title:article.title || '',
    slug:article.slug || '',
    excerpt:article.excerpt || '',
    meta_title:article.metaTitle || '',
    meta_description:article.metaDescription || '',
    focus_keyword:article.focusKeyword || '',
    content_markdown:article.contentMarkdown || '',
    internal_links:Array.isArray(article.internalLinks) ? article.internalLinks : [],
    faqs:Array.isArray(article.faqs) ? article.faqs : [],
    source_snapshot:article.sourceSnapshot || {},
    status:'ready_for_review',
    push_mode:'review_only',
  }).select().single()
  if (error) throw error
  return data
}

export async function updateSeoArticleStatus(id, status) {
  if (!id) return null
  const update = { status, updated_at:new Date().toISOString() }
  if (status === 'queued') update.push_mode = 'approved_push'
  const { data, error } = await supabase.from('seo_articles').update(update).eq('id', id).select().single()
  if (error) throw error
  return data
}

export function articleSlug(value) {
  return String(value || 'seo-article').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'seo-article'
}
