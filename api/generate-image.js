import OpenAI from 'openai';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing OPENAI_API_KEY environment variable.' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const prompt = body.prompt || 'Professional commercial product advertising creative';
    const size = '1024x1024';

    const openai = new OpenAI({ apiKey });
    
    // Use dall-e-2 which is universally available on all OpenAI project keys
    const response = await openai.images.generate({
      model: 'dall-e-2',
      prompt: prompt,
      n: 1,
      size: size,
    });

    const imageUrls = response.data.map(d => d.url);
    return res.status(200).json({ images: imageUrls });
  } catch (err) {
    console.error('OpenAI image generation error:', err);
    return res.status(500).json({ 
      error: err.message || 'Failed to generate image with OpenAI.' 
    });
  }
}
