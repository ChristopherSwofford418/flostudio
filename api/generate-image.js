import { resolveImageProvider } from './media-provider.js';

export const maxDuration = 60;

const SIZE_BY_RATIO = {
  '1:1': '1024x1024',
  '9:16': '1024x1536',
  '16:9': '1536x1024',
};

async function fetchImageAsDataUrl(url) {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  const response = await fetch(url);
  if (!response.ok) throw new Error('The uploaded reference image could not be retrieved. Please upload it again.');
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${response.headers.get('content-type') || 'image/png'};base64,${buffer.toString('base64')}`;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const prompt = String(body.prompt || '').trim();
    if (!prompt && !body.referenceImage) return res.status(400).json({ error: 'Describe the ad creative or upload a product image first.' });

    const size = SIZE_BY_RATIO[body.aspectRatio] || SIZE_BY_RATIO['1:1'];
    // GPT Image can exceed a serverless window when multiple high-resolution outputs are requested together.
    // FloStudio therefore delivers one real creative per take; the next take uses a new visual direction.
    const count = 1;
    const referenceImage = await fetchImageAsDataUrl(body.referenceImage).catch(() => null);
    const provider = resolveImageProvider();
    const creativeAngles = ['direct product proof with a decisive focal point', 'creator-native social framing with candid commercial energy', 'cinematic benefit moment with visual narrative', 'performance-ready split-test concept with a distinct opening composition'];
    const creativeRound = Math.max(1, Number(body.creativeRound) || 1);
    const concepts = [creativeAngles[(creativeRound - 1) % creativeAngles.length]];
    const generated = await provider.create({
      prompt: `Create a finished high-conversion commercial advertising image for creative round ${creativeRound}. Core brief: ${prompt || 'Use the supplied product image as the hero.'}. Variation direction: ${concepts[0]}. ${referenceImage ? 'Use the provided product or app reference as the visual source of truth. Preserve recognisable product details and integrate it naturally into the scene; never simply place it inside a generic phone mockup or artificial frame.' : ''} Use a strong focal point, professional lighting, and a deliberate performance-ad composition. Make this round visually distinct from a generic product mockup. Do not render text unless the brief specifically requests exact on-image copy.`,
      size,
      referenceImage,
      count,
    });
    const images = generated.map((url, index) => ({ url, kind:'image', variation:index + 1, concept:concepts[index] || concepts[0] }));

    return res.status(200).json({ images, size, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Image generation error:', error);
    return res.status(500).json({ error: error?.message || 'Image creation failed. Please try again.' });
  }
}
