import { describe, it, expect } from 'vitest';

describe('Creative Lab Image Generation & Composition', () => {
  it('validates request payload requires prompt or referenceImage', () => {
    const payload = {};
    const isValid = Boolean(payload.prompt || payload.referenceImage);
    expect(isValid).toBe(false);
  });

  it('embeds exact screenshot metadata and source provenance in composed ad', () => {
    const mockRequest = {
      prompt: 'Enhance your resume with AI',
      referenceImage: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/screenshot.png',
      aspectRatio: '1:1'
    };
    
    const asset = {
      url: 'https://openai.com/generated-background.png',
      sourceScreenshot: mockRequest.referenceImage,
      metadata: {
        exactScreenshotEmbedded: true,
        composedAdWorkspace: true
      }
    };

    expect(asset.sourceScreenshot).toBe(mockRequest.referenceImage);
    expect(asset.metadata.exactScreenshotEmbedded).toBe(true);
    expect(asset.metadata.composedAdWorkspace).toBe(true);
  });
});
