import { describe, it, expect } from 'vitest';
import { generateAppSeoBlueprint } from '../src/lib/portfolioSeo.js';

describe('FloStudio Portfolio SEO Intelligence', () => {
  it('generates a complete SEO and ASO blueprint for any portfolio app', async () => {
    const app = {
      name: 'ResumeFix AI',
      category: 'Productivity',
      description: 'AI-powered resume optimization and job application assistant.'
    };

    const blueprint = await generateAppSeoBlueprint(app);

    expect(blueprint.appName).toBe('ResumeFix AI');
    expect(blueprint.targetKeywords.length).toBeGreaterThan(0);
    expect(blueprint.appStoreMetadata.title).toContain('ResumeFix AI');
    expect(blueprint.landingPageMeta.metaTitle).toBeTruthy();
  });
});
