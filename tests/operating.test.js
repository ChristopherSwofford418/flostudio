import { describe, it, expect } from 'vitest';
import { getAppOperatingState } from '../src/lib/appOperatingModel.js';

describe('FloStudio App Operating Model', () => {
  it('generates a complete operational state for any portfolio app', () => {
    const app = {
      name: 'ResumeFix AI',
      description: 'AI resume builder',
      audience: 'Job seekers',
      offerText: 'First resume free',
      autopilot: { platforms: ['instagram', 'tiktok'] }
    };

    const state = getAppOperatingState(app);

    expect(state.marketingBrief.positioning).toBe('AI resume builder');
    expect(state.asoQueue.status).toBe('Ready');
    expect(state.creativeQueue.status).toBe('Active');
    expect(state.destinations.length).toBe(2);
    expect(state.destinations[0].platform).toBe('instagram');
  });
});
