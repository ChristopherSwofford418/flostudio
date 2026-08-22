import { describe, it, expect } from 'vitest';

describe('FloStudio Portfolio Autopilot & Automation', () => {
  it('verifies multi-app batch processing logic', () => {
    const apps = [
      { id: 'app-1', name: 'ResumeFix AI', autopilot: { enabled: true, cadence: 20, platforms: ['instagram', 'linkedin'] } },
      { id: 'app-2', name: 'ClearPass', autopilot: { enabled: false, cadence: 10, platforms: ['instagram'] } }
    ];

    const activeApps = apps.filter(app => app.autopilot?.enabled);
    const targets = activeApps.length ? activeApps : apps;

    expect(targets.length).toBe(1);
    expect(targets[0].name).toBe('ResumeFix AI');
    expect(targets[0].autopilot.cadence).toBe(20);
  });

  it('verifies fallback to all apps when no specific autopilot enabled flag is set', () => {
    const apps = [
      { id: 'app-1', name: 'App One' },
      { id: 'app-2', name: 'App Two' }
    ];

    const activeApps = apps.filter(app => app.autopilot?.enabled);
    const targets = activeApps.length ? activeApps : apps;

    expect(targets.length).toBe(2);
  });
});
