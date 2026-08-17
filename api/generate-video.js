export const maxDuration = 60;

const ALLOWED_SIZES = new Set(['1280x720', '720x1280', '1920x1080', '1080x1920']);

async function parseBody(req) {
  return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
}

async function toReferenceBlob(value) {
  if (!value) return null;
  if (value.startsWith('data:')) {
    const [meta, encoded] = value.split(',');
    const contentType = /data:([^;]+)/.exec(meta)?.[1] || 'image/png';
    return new Blob([Buffer.from(encoded, 'base64')], { type: contentType });
  }
  const response = await fetch(value);
  if (!response.ok) throw new Error('The uploaded video reference image could not be retrieved.');
  return new Blob([await response.arrayBuffer()], { type: response.headers.get('content-type') || 'image/png' });
}

function openAIHeaders(apiKey) {
  return { Authorization: `Bearer ${apiKey}` };
}

export default async function handler(req, res) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Video generation is not configured yet. Add OPENAI_API_KEY to the production environment.' });

  const action = req.method === 'GET' ? req.query?.action : (await parseBody(req)).action;
  const id = req.method === 'GET' ? req.query?.id : null;

  try {
    if (req.method === 'GET' && action === 'status') {
      if (!id) return res.status(400).json({ error: 'Missing video job id.' });
      const response = await fetch(`https://api.openai.com/v1/videos/${encodeURIComponent(id)}`, { headers: openAIHeaders(apiKey) });
      const payload = await response.json();
      if (!response.ok) return res.status(response.status).json({ error: payload?.error?.message || 'Could not read video render status.' });
      return res.status(200).json(payload);
    }

    if (req.method === 'GET' && action === 'content') {
      if (!id) return res.status(400).json({ error: 'Missing video job id.' });
      const variant = ['video', 'thumbnail', 'spritesheet'].includes(req.query?.variant) ? req.query.variant : 'video';
      const response = await fetch(`https://api.openai.com/v1/videos/${encodeURIComponent(id)}/content?variant=${variant}`, { headers: openAIHeaders(apiKey) });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        return res.status(response.status).json({ error: payload?.error?.message || 'Could not download generated video content.' });
      }
      res.setHeader('Content-Type', response.headers.get('content-type') || (variant === 'video' ? 'video/mp4' : 'image/webp'));
      res.setHeader('Cache-Control', 'private, max-age=300');
      return res.status(200).send(Buffer.from(await response.arrayBuffer()));
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const body = await parseBody(req);
    const prompt = String(body.prompt || '').trim();
    if (!prompt) return res.status(400).json({ error: 'Describe the video ad before starting a render.' });
    const size = ALLOWED_SIZES.has(body.size) ? body.size : '720x1280';
    const seconds = ['4', '8', '12', '16', '20'].includes(String(body.seconds)) ? String(body.seconds) : '8';
    const model = body.quality === 'production' ? 'sora-2-pro' : 'sora-2';
    const enhancedPrompt = `Create a finished social advertising video. ${prompt}. Use a clear shot sequence with deliberate camera motion, product focus, brand-safe lighting, and a strong final call-to-action composition. Do not depict real people, public figures, copyrighted characters, or copyrighted music.`;
    const reference = await toReferenceBlob(body.referenceImage).catch(() => null);
    let response;

    if (reference) {
      const form = new FormData();
      form.append('model', model);
      form.append('prompt', enhancedPrompt);
      form.append('size', size);
      form.append('seconds', seconds);
      form.append('input_reference', reference, 'flostudio-product-reference.png');
      response = await fetch('https://api.openai.com/v1/videos', { method: 'POST', headers: openAIHeaders(apiKey), body: form });
    } else {
      response = await fetch('https://api.openai.com/v1/videos', {
        method: 'POST',
        headers: { ...openAIHeaders(apiKey), 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: enhancedPrompt, size, seconds }),
      });
    }

    const payload = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: payload?.error?.message || 'Video render could not be started.' });
    return res.status(200).json(payload);
  } catch (error) {
    console.error('Video generation error:', error);
    return res.status(500).json({ error: error?.message || 'Video creation failed. Please try again.' });
  }
}
