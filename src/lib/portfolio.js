import { supabase } from '../supabase'

export async function claimWorkspaceInvitation() {
  const { data, error } = await supabase.rpc('claim_workspace_invitation')
  if (error) throw error
  return data || null
}

export async function ensureWorkspaceForUser() {
  const invitedWorkspaceId = await claimWorkspaceInvitation()
  if (invitedWorkspaceId) return invitedWorkspaceId
  const { data, error } = await supabase.rpc('ensure_personal_workspace')
  if (error) throw error
  return data
}

export async function ensurePersonalWorkspace() {
  return ensureWorkspaceForUser()
}

export async function getWorkspaceRole(workspaceId) {
  if (!workspaceId) return 'none'
  const { data, error } = await supabase.rpc('get_workspace_role', { target_workspace_id: workspaceId })
  if (error) throw error
  return data || 'none'
}

export async function listPortfolioApps(workspaceId) {
  if (!workspaceId) return []
  const { data, error } = await supabase
    .from('products')
    .select('id, workspace_id, user_id, brand_id, name, product_url, description, offer_text, audience, source_facts, created_at, updated_at, brands:brand_id(name, brand_dna)')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(product => {
    const facts = product.source_facts || {}
    const imageUrl = facts.image || facts.artworkUrl || ''
    return {
      ...product,
      brandName: product.brands?.name || product.name,
      brandDna: product.brands?.brand_dna || {},
      category: facts.category || 'Product portfolio',
      icon: (product.name || 'A').slice(0, 1).toUpperCase(),
      imageUrl,
      accentColor: facts.accentColor || (imageUrl ? '#ff8769' : '#7b61ff'),
      url: product.product_url || '',
      autopilot: facts.autopilot || { enabled:false, cadence:20, platforms:['instagram'], creativeMix:{ image:70, video:30 }, approvalMode:'review' },
      sourceFacts: {
        ...facts,
        screenshots: facts.screenshots || facts.screenshotUrls || [],
      },
    }
  })
}

export async function savePortfolioApp({ workspaceId, userId, productId, brandId, name, websiteUrl, description, offerText, audience, category, autopilot, brandDna, sourceFacts }) {
  if (!workspaceId || !userId || !name.trim()) throw new Error('An app name is required.')
  const { ascPrivateKey, ascIssuerId, ascKeyId, ascKeyType, ascVendorNumber, ascStatus, ascMetrics, ascSyncedAt, ...publicSourceFacts } = sourceFacts || {}
  const facts = { ...publicSourceFacts, category:category?.trim() || 'Product portfolio', autopilot: autopilot || { enabled:false, cadence:20, platforms:['instagram'], creativeMix:{ image:70, video:30 }, approvalMode:'review' } }
  const brandPayload = { name:name.trim(), brand_dna:brandDna || { voice:'', visualDirection:'', proofPoints:'', restrictedClaims:'' }, workspace_id:workspaceId, user_id:userId }
  let brand
  if (brandId) {
    const { data, error } = await supabase.from('brands').update(brandPayload).eq('id', brandId).select().single()
    if (error) throw error
    brand = data
  } else {
    const { data, error } = await supabase.from('brands').insert([brandPayload]).select().single()
    if (error) throw error
    brand = data
  }
  const productPayload = { workspace_id:workspaceId, user_id:userId, brand_id:brand.id, name:name.trim(), product_url:websiteUrl?.trim() || null, description:description?.trim() || '', offer_text:offerText?.trim() || '', audience:audience?.trim() || '', source_facts:facts }
  if (productId) {
    const { data, error } = await supabase.from('products').update(productPayload).eq('id', productId).select().single()
    if (error) throw error
    return data
  }
  const { data, error } = await supabase.from('products').insert([productPayload]).select().single()
  if (error) throw error
  return data
}

export async function archivePortfolioApp(productId) {
  const { error } = await supabase.from('products').update({ source_facts:{ archived:true } }).eq('id', productId)
  if (error) throw error
}
