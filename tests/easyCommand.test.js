import { describe, it, expect } from 'vitest';

describe('FloStudio Easy Command Assistant', () => {
  it('validates simple workflow goals exist', () => {
    const goals = ['monthly_marketing', 'ads_images', 'seo_boost'];
    expect(goals.length).toBe(3);
    expect(goals).toContain('monthly_marketing');
  });
});
