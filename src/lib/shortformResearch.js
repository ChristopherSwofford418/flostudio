import { supabase } from '../supabase'

export async function listShortformResearchExamples({ workspaceId, userId, productId }) {
  if (!workspaceId || !userId || !productId) return []
  const { data, error } = await supabase
    .from('shortform_research_examples')
    .select('id, platform, source_url, source_creator, format_pattern, observed_evidence, original_adaptation, research_status, researched_at')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .eq('product_id', productId)
    .neq('research_status', 'archived')
    .order('researched_at', { ascending:false })
    .limit(50)
  if (error) throw error
  return data || []
}
