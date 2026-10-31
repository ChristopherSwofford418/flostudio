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
    { title: 'Proof and momentum', angle: 'Outcome-led proof', hook: `What can you see when ${app.name} supports this workflow?`, proof: app.description || 'Show one observable product step using the app’s saved product context.', cta: app.offer_text || 'Review the product details', visual_recipe: { direction: 'Confident product demonstration' } },
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

  if (config.approvalMode === 'approved') {
    await supabase.from('campaign_posts').update({ status:'approved' }).eq('campaign_id', campaign.id).eq('user_id', userId)
  }
  await supabase.from('campaigns').update({ status:'ready_for_review' }).eq('id', campaign.id).eq('user_id', userId)
  return { campaign, postsCount: allPosts.length }
}


export async function runPortfolioAutopilotAcrossAllApps({ userId, apps }) {
  const activeApps = apps.filter(app => app.autopilot?.enabled || app.autopilot?.cadence)
  const targets = activeApps.length ? activeApps : apps
  if (!targets.length) throw new Error('No apps found in portfolio. Add at least one app before running autopilot.')
  
  let totalPosts = 0
  const results = []
  for (const app of targets) {
    try {
      const result = await runMonthlyAutopilotForApp({ userId, app })
      totalPosts += result.postsCount || 0
      results.push({ appId: app.id, name: app.name, success: true, postsCount: result.postsCount })
    } catch (err) {
      results.push({ appId: app.id, name: app.name, success: false, error: err.message })
    }
  }
  return { totalApps: targets.length, totalPosts, results }
}
