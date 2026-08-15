import OpenAI from 'openai';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { prompt, size = '1024x1024' } = body;
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'OpenAI API key not configured on server.' });
    }

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required.' });
    }

    const openai = new OpenAI({ apiKey });

    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size,
      quality: 'standard',
    });

    const imageUrls = response.data.map(d => d.url);
    return res.status(200).json({ images: imageUrls });
  } catch (err) {
    console.error('OpenAI image generation error:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate image with OpenAI.' });
  }
}
