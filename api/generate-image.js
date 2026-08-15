import OpenAI from 'openai';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OpenAI API key is missing on Vercel environment variables.' });
    }

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }

    const prompt = (body && body.prompt) || 'Professional commercial product advertising creative';

    const openai = new OpenAI({ apiKey });

    // Try dall-e-3, then dall-e-2
    let response;
    let lastError = null;

    for (const model of ['dall-e-3', 'dall-e-2']) {
      try {
        response = await openai.images.generate({
          model: model,
          prompt: prompt,
          n: 1,
          size: '1024x1024',
          ...(model === 'dall-e-3' ? { quality: 'standard' } : {})
        });
        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!response || !response.data) {
      throw new Error(lastError?.message || 'Your OpenAI project key does not have access to DALL-E image generation models (dall-e-3 / dall-e-2). Please verify your OpenAI billing and model permissions.');
    }

    const imageUrls = response.data.map(d => d.url);
    return res.status(200).json({ images: imageUrls });
  } catch (err) {
    console.error('OpenAI generation error:', err);
    return res.status(500).json({ 
      error: err.message || 'Failed to generate image with OpenAI.' 
    });
  }
}
