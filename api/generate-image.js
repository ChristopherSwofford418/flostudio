import OpenAI from 'openai';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing OPENAI_API_KEY environment variable.' });
    }

    const openai = new OpenAI({ apiKey });
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: 'A professional minimalist tech software interface mockup',
      n: 1,
      size: '1024x1024',
      quality: 'standard',
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
