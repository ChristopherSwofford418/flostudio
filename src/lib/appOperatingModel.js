export function getAppOperatingState(app) {
  return {
    marketingBrief: {
      positioning: app.description || 'Global mobile & web application.',
      audience: app.audience || 'Tech-forward professionals and creators.',
      offer: app.offerText || 'Free tier available / Instant access.',
      primaryKeywords: app.sourceFacts?.keywords || ['mobile app', 'productivity', 'automation']
    },
    asoQueue: {
      status: 'Ready',
      targetKeywordsCount: 15,
      estimatedTrafficScore: 88,
      lastOptimized: app.sourceFacts?.learnedAt || new Date().toISOString()
    },
    creativeQueue: {
      status: 'Active',
      generatedCount: (app.sourceFacts?.screenshots || []).length * 2 + 4,
      pendingApproval: 2,
      lastGenerated: new Date().toISOString()
    },
    destinations: (app.autopilot?.platforms || ['instagram', 'linkedin']).map(p => ({
      platform: p,
      status: 'Connected',
      lastSynced: new Date().toLocaleDateString()
    }))
  };
}
