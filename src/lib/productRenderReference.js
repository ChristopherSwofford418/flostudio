import { supabase } from '../supabase'
import { verifiedProductVisualOptions, referencePayload } from './appVisualReferences'

export async function loadVerifiedProductRenderReference({ workspaceId, productId }) {
  if (!workspaceId || !productId) throw new Error('Select a workspace and portfolio app before rendering.')

  const [productResult, mediaResult] = await Promise.all([
    supabase
      .from('products')
      .select('id,workspace_id,source_facts')
      .eq('id', productId)
      .eq('workspace_id', workspaceId)
      .maybeSingle(),
    supabase
      .from('media_assets')
      .select('id,asset_url,kind,source,asc_asset_id,asc_placement_id,created_at')
      .eq('product_id', productId)
      .eq('workspace_id', workspaceId)
      .eq('kind', 'image')
      .eq('source', 'app_store_connect_import')
      .order('created_at', { ascending:false }),
  ])

  if (productResult.error) throw productResult.error
  if (!productResult.data) throw new Error('This portfolio app is not available in the selected workspace.')
  if (mediaResult.error) throw mediaResult.error

  const reference = verifiedProductVisualOptions({ app:productResult.data, imageAssets:mediaResult.data || [] })[0]
  const payload = referencePayload(reference)
  if (!payload) {
    throw new Error('No verified App Store visual is available for this app. Refresh its App Store listing or import approved App Store Connect media before rendering.')
  }
  return { reference, payload }
}
