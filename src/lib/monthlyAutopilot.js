import { supabase } from '../supabase'
import { createCampaign, saveCampaignConcepts, selectCampaignConcept, createCampaignPosts } from './campaignEngine'

export async function runMonthlyAutopilotForApp({ userId, app }) {
  const brand = { id: app.brand_id, workspace_id: app.workspace_id, name: app.brandName || app.name }
  const product = { id: app.id, workspace_id: app.workspace_id, name: app.name }
  const config = app.autopilot || { cadence: 20, platforms: ['instagram'], approvalMode: 'review' }
  const platforms = config.platforms?.length ? config.platforms : ['instagram']
  const cadence = config.cadence || 20

  const campaign = await createCampaign({
    userId,
    brand,
    product,
    name: `${app.name} - Monthly Autopilot Plan`,
    objective: 'Autonomous portfolio scaling & engagement',
    audience: app.audience || 'Target users seeking reliable outcomes',
    offerText: app.offer_text || 'Learn more today',
    platforms,
    brief: `Automated monthly content plan for ${app.name} (${app.description || 'Core product offer'}). Cadence: ${cadence} posts across ${platforms.join(', ')}.`
  })

  const concepts = [
    { title: 'The core transformation story', angle: 'Pain-to-clarity', hook: `How ${app.name} changes the daily workflow.`, proof: app.description || 'Reliable execution without friction.', cta: app.offer_text || 'Get started now', visual_recipe: { direction: 'Clean editorial product focus' } },
    { title: 'Proof and momentum', angle: 'Outcome-led proof', hook: `What happens when you let ${app.name} run the process.`, proof: 'Clear gains in consistency and peace of mind.', cta: app.offer_text || 'Try it today', visual_recipe: { direction: 'Confident product demonstration' } },
    { title: 'The smarter daily habit', angle: 'Lifestyle transformation', hook: `A better way to handle your workflow starting today.`, proof: 'Turn a routine bottleneck into your biggest advantage.', cta: app.offer_text || 'Explore features', visual_recipe: { direction: 'Warm human momentum' } }
  ]

  const storedConcepts = await saveCampaignConcepts({ userId, campaignId: campaign.id, concepts })
  const chosenConcept = storedConcepts[0]
  await selectCampaignConcept(campaign.id, chosenConcept.id)
  
  const allPosts = []
  for (let i = 0; i < cadence; i++) {
    const platform = platforms[i % platforms.length]
    const concept = storedConcepts[i % storedConcepts.length]
    const posts = await createCampaignPosts({ userId, campaignId: campaign.id, concept, platforms: [platform] })
    allPosts.push(...posts)
  }

  await supabase.from('campaigns').update({ status: config.approvalMode === 'approved' ? 'published' : 'ready_for_review' }).eq('id', campaign.id)
  return { campaign, postsCount: allPosts.length }
}
