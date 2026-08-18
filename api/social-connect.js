const SUPPORTED = ['facebook', 'instagram', 'linkedin', 'tiktok', 'twitter']

function integrationGuide(platform) {
  const guides = {
    facebook:'Meta Facebook Login for Business with an approved callback, Page permissions, and secure server-side token exchange.',
    instagram:'Meta Instagram API publishing with a Professional account, approved callback, and secure server-side token exchange.',
    linkedin:'LinkedIn OAuth with the required member or organization publishing scopes and secure server-side token exchange.',
    tiktok:'TikTok Content Posting API approval, OAuth callback, and user-authorized posting scopes.',
    twitter:'X OAuth 2.0 with a registered callback and user-authorized posting scope.',
  }
  return guides[platform] || 'A provider-approved OAuth application and secure server-side token exchange.'
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error:`Method ${req.method} Not Allowed` })
  }

  const { platform, action } = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
  if (!SUPPORTED.includes(platform)) return res.status(400).json({ error:'Choose a supported social platform.' })

  if (action === 'status') {
    return res.status(200).json({ platform, status:'not_connected', live:false, requirement:integrationGuide(platform) })
  }

  // This endpoint intentionally does not fabricate OAuth URLs, account handles, tokens, or post IDs.
  // Real callbacks must be configured per provider before a connection is surfaced as live.
  if (action === 'connect' || action === 'publish') {
    return res.status(503).json({
      code:'SOCIAL_PROVIDER_NOT_CONFIGURED',
      error:`${platform} is not connected yet. FloStudio will not claim a social account or publish a post until a provider-approved OAuth callback and secure token storage are configured.`,
      platform,
      requestedAction:action,
      requirement:integrationGuide(platform),
    })
  }

  return res.status(400).json({ error:'Unknown social action requested.' })
}
