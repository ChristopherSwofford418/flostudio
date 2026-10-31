import { authenticatedProviderUser, assertWorkspaceProduct, providerKeyError } from './provider-key-vault.js'

const PLATFORM_ALLOWLIST = new Set(['instagram', 'facebook', 'linkedin', 'tiktok', 'twitter'])

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const workspaceId = String(body.workspaceId || '').trim()
    const productId = String(body.productId || body.appId || '').trim()
    const { accessToken } = await authenticatedProviderUser(req)
    await assertWorkspaceProduct({ workspaceId, productId, accessToken })

    const appName = String(body.appName || '').trim()
    if (!appName) return res.status(400).json({ error: 'App name is required for batch campaign generation.' })

    const postCount = Math.min(Math.max(Number(body.postCount) || 20, 1), 50)
    const requestedPlatforms = Array.isArray(body.platforms) ? body.platforms.map(value => String(value).toLowerCase()) : []
    const targetPlatforms = requestedPlatforms.filter(platform => PLATFORM_ALLOWLIST.has(platform))
    const platforms = targetPlatforms.length ? targetPlatforms : ['instagram', 'facebook', 'linkedin', 'tiktok']

    const generatedPosts = Array.from({ length:postCount }, (_, index) => {
      const position = index + 1
      const platform = platforms[index % platforms.length]
      return {
        id: `draft_${productId}_${position}_${Date.now()}`,
        productId,
        platform,
        title: `${appName} campaign angle ${position}`,
        content: `Draft a product-grounded ${platform} post for ${appName}. Review the app’s approved facts, claims, and creative before saving to the Review Queue.`,
        status: 'draft_only',
        scheduledTime: null,
        mediaPrompt: `Original ${platform} ad concept for ${appName}, grounded in the selected app’s approved product context.`,
        createdAt: new Date().toISOString(),
      }
    })

    return res.status(200).json({
      success:true,
      workspaceId,
      productId,
      appName,
      totalGenerated:generatedPosts.length,
      posts:generatedPosts,
      message:`Generated ${generatedPosts.length} app-scoped review drafts for ${appName}. Nothing was saved, scheduled, or published.`,
    })
  } catch (error) {
    const status = error?.status || (error?.code === 'AUTH_REQUIRED' ? 401 : 500)
    return res.status(status).json({ error:error?.message || 'Batch campaign generation failed.', code:error?.code || 'BATCH_CAMPAIGN_ERROR' })
  }
}
