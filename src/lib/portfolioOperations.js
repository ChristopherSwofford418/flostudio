export async function recordPortfolioRun({ userId, appId, appName, actionType, status, summary }) {
  const record = {
    id: 'run_' + Math.random().toString(36).substring(2, 11),
    userId,
    appId,
    appName,
    actionType, // 'autopilot_sync', 'aso_boost', 'creative_batch', 'publish_dispatch'
    status, // 'success', 'pending_approval', 'failed'
    summary,
    timestamp: new Date().toISOString()
  };
  try {
    const existing = JSON.parse(localStorage.getItem('flostudio_run_history') || '[]');
    const updated = [record, ...existing].slice(0, 50);
    localStorage.setItem('flostudio_run_history', JSON.stringify(updated));
    return record;
  } catch (e) {
    return record;
  }
}

export function getPortfolioRunHistory(appId = null) {
  try {
    const history = JSON.parse(localStorage.getItem('flostudio_run_history') || '[]');
    if (appId) {
      return history.filter(h => h.appId === appId);
    }
    return history;
  } catch (e) {
    return [];
  }
}

export function getAppOperatingQueues(app) {
  return {
    seoQueue: [
      { id: 'seo_1', keyword: `${app.category || 'mobile'} app optimization`, rank: 3, status: 'Active' },
      { id: 'seo_2', keyword: `best ${app.name.toLowerCase()} tool`, rank: 5, status: 'Pending Review' }
    ],
    creativeQueue: [
      { id: 'cr_1', type: 'Cinematic Ad', angle: 'Before / After', status: 'Approved' },
      { id: 'cr_2', type: 'UGC Hook Video', angle: 'Founder Story', status: 'Needs Approval' }
    ],
    approvalQueue: [
      { id: 'app_1', title: `Monthly Autopilot Batch for ${app.name}`, itemsCount: 10, status: 'Ready to Publish' }
    ]
  };
}
