import OpenAI from 'openai';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing OPENAI_API_KEY environment variable.' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const prompt = body.prompt || 'Professional modern SaaS software interface mockup';
    const size = body.size === '1024x1792' || body.size === '1792x1024' ? '1024x1024' : (body.size || '1024x1024');

    const openai = new OpenAI({ apiKey });
    const response = await openai.images.generate({
      model: 'dall-e-2',
      prompt,
      n: 1,
      size,
    });

    return res.status(200).json({ images: response.data.map(d => d.url) });
  } catch (err) {
    return res.status(500).json({ 
      error: 'OpenAI generation failed', 
      message: err.message, 
      stack: err.stack 
    });
  }
}
