import { supabase } from '../supabase'

export async function getCurrentMediaUser() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in before creating or saving media assets.')
  return user
}

export function belongsToProduct(asset, productId) {
  return Boolean(productId) && asset?.product_id === productId
}

export async function listMediaAssets(productId) {
  if (!productId) return []
  const user = await getCurrentMediaUser()
  const { data, error } = await supabase
    .from('media_assets')
    .select('*')
    .eq('user_id', user.id)
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createMediaAsset(values) {
  const user = await getCurrentMediaUser()
  const { data, error } = await supabase
    .from('media_assets')
    .insert([{ user_id: user.id, ...values }])
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateMediaAsset(id, values) {
  const { data, error } = await supabase
    .from('media_assets')
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function removeMediaAsset(asset) {
  if (asset.storage_path) {
    const { error: storageError } = await supabase.storage.from('marketing-assets').remove([asset.storage_path])
    if (storageError) throw storageError
  }
  const paths = [asset.thumbnail_path].filter(Boolean)
  if (paths.length) await supabase.storage.from('marketing-assets').remove(paths)
  const { error } = await supabase.from('media_assets').delete().eq('id', asset.id)
  if (error) throw error
}
