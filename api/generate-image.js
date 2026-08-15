import OpenAI from 'openai';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    if (!body || Object.keys(body).length === 0) {
      const buffers = [];
      try {
        for await (const chunk of req) {
          buffers.push(chunk);
        }
        const raw = Buffer.concat(buffers).toString();
        if (raw) body = JSON.parse(raw);
      } catch (streamErr) {
        console.warn('Stream read note:', streamErr);
      }
    }

    const prompt = (body && body.prompt) || 'Professional commercial product advertising creative';
    let size = (body && body.size) || '1024x1024';
    if (size !== '1024x1024' && size !== '1024x1792' && size !== '1792x1024') {
      size = '1024x1024';
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing OPENAI_API_KEY environment variable.' });
    }

    const openai = new OpenAI({ apiKey });

    let response;
    try {
      response = await openai.images.generate({
        model: 'dall-e-3',
        prompt: prompt,
        n: 1,
        size: size,
        quality: 'standard',
      });
    } catch (e3) {
      console.warn('DALL-E 3 failed, trying DALL-E 2:', e3.message);
      try {
        response = await openai.images.generate({
          model: 'dall-e-2',
          prompt: prompt,
          n: 1,
          size: '1024x1024',
        });
      } catch (e2) {
        console.warn('DALL-E 2 failed as well:', e2.message);
        throw new Error(`OpenAI image generation failed: ${e3.message} | ${e2.message}`);
      }
    }

    const imageUrls = response.data.map(d => d.url);
    return res.status(200).json({ images: imageUrls });
  } catch (err) {
    console.error('Serverless image generation error:', err);
    return res.status(500).json({ 
      error: err.message || 'Failed to generate image with OpenAI.' 
    });
  }
}
