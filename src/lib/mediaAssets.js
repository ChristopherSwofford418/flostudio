import { supabase } from '../supabase'

export async function getCurrentMediaUser() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in before creating or saving media assets.')
  return user
}

export async function listMediaAssets() {
  const user = await getCurrentMediaUser()
  const { data, error } = await supabase
    .from('media_assets')
    .select('*')
    .eq('user_id', user.id)
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
