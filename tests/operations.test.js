import { describe, it, expect, beforeEach } from 'vitest';
import { recordPortfolioRun, getPortfolioRunHistory, getAppOperatingQueues } from '../src/lib/portfolioOperations.js';

// Simple localStorage mock for Node test environment
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: key => store[key] || null,
    setItem: (key, value) => { store[key] = value.toString(); },
    clear: () => { store = {}; }
  };
})();
global.localStorage = localStorageMock;

describe('FloStudio Portfolio Operations & Run History', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('records and retrieves durable run history', async () => {
    const run = await recordPortfolioRun({
      userId: 'user_123',
      appId: 'app_456',
      appName: 'ResumeFix AI',
      actionType: 'autopilot_sync',
      status: 'success',
      summary: 'Generated 10 posts and optimized ASO.'
    });

    expect(run.id).toBeTruthy();
    expect(run.appName).toBe('ResumeFix AI');

    const history = getPortfolioRunHistory('app_456');
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].actionType).toBe('autopilot_sync');
  });

  it('generates structured app operating queues', () => {
    const app = { id: 'app_456', name: 'ResumeFix AI', category: 'Productivity' };
    const queues = getAppOperatingQueues(app);

    expect(queues.seoQueue.length).toBe(2);
    expect(queues.creativeQueue.length).toBe(2);
    expect(queues.approvalQueue.length).toBe(1);
  });
});
