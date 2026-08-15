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

    // Use current OpenAI gpt-image-2 model
    const response = await openai.images.generate({
      model: 'gpt-image-2',
      prompt: prompt,
      n: 1,
      size: '1024x1024',
    });

    const imageUrls = response.data.map(d => d.url || d.b64_json);
    return res.status(200).json({ images: imageUrls });
  } catch (err) {
    console.error('OpenAI generation error:', err);
    return res.status(500).json({ 
      error: err.message || 'Failed to generate image with OpenAI.' 
    });
  }
}
