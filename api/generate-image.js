import OpenAI from 'openai';

export const maxDuration = 60;

const SIZE_BY_RATIO = {
  '1:1': '1024x1024',
  '9:16': '1024x1536',
  '16:9': '1536x1024',
};

function escapeXml(value = '') {
  return String(value).replace(/[<>&"']/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]);
}

async function fetchImageAsDataUrl(url) {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  const response = await fetch(url);
  if (!response.ok) throw new Error('The uploaded reference image could not be retrieved. Please upload it again.');
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${response.headers.get('content-type') || 'image/png'};base64,${buffer.toString('base64')}`;
}

function createReferenceComposition(background, referenceImage, headline, accent, size) {
  const [width, height] = size.split('x').map(Number);
  const phoneWidth = Math.round(width * 0.42);
  const phoneHeight = Math.round(height * 0.72);
  const phoneX = Math.round((width - phoneWidth) / 2);
  const phoneY = Math.round(height * 0.1);
  const safeHeadline = escapeXml(headline.slice(0, 74));
  const barHeight = Math.max(68, Math.round(height * 0.075));
  const barY = height - barHeight - Math.round(height * 0.045);
  return `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="${Math.round(height * .025)}" stdDeviation="${Math.round(width * .03)}" flood-color="#000" flood-opacity=".72"/></filter>
      <linearGradient id="wash" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#090618" stop-opacity=".20"/><stop offset="1" stop-color="${accent}" stop-opacity=".30"/></linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="#090618"/>
    <image href="${background}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" opacity=".68"/>
    <rect width="${width}" height="${height}" fill="url(#wash)"/>
    <circle cx="${Math.round(width * .13)}" cy="${Math.round(height * .15)}" r="${Math.round(width * .25)}" fill="${accent}" opacity=".24"/>
    <g filter="url(#shadow)"><rect x="${phoneX}" y="${phoneY}" width="${phoneWidth}" height="${phoneHeight}" rx="${Math.round(width * .045)}" fill="#15151b" stroke="#ffffff" stroke-opacity=".24" stroke-width="3"/><rect x="${phoneX + Math.round(width * .018)}" y="${phoneY + Math.round(width * .018)}" width="${phoneWidth - Math.round(width * .036)}" height="${phoneHeight - Math.round(width * .036)}" rx="${Math.round(width * .032)}" fill="#000"/><image href="${referenceImage}" x="${phoneX + Math.round(width * .018)}" y="${phoneY + Math.round(width * .018)}" width="${phoneWidth - Math.round(width * .036)}" height="${phoneHeight - Math.round(width * .036)}" preserveAspectRatio="xMidYMid slice"/></g>
    <rect x="${Math.round(width * .08)}" y="${barY}" width="${Math.round(width * .84)}" height="${barHeight}" rx="${Math.round(width * .018)}" fill="#0b0922" fill-opacity=".84" stroke="#ffffff" stroke-opacity=".2" stroke-width="2"/>
    <text x="${width / 2}" y="${barY + Math.round(barHeight * .62)}" fill="#ffffff" font-family="Arial, sans-serif" font-size="${Math.max(20, Math.round(width * .026))}" font-weight="700" text-anchor="middle">${safeHeadline}</text>
  </svg>`).toString('base64')}`;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Image generation is not configured yet. Add OPENAI_API_KEY to the production environment.' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const prompt = String(body.prompt || '').trim();
    if (!prompt && !body.referenceImage) return res.status(400).json({ error: 'Describe the ad creative or upload a product image first.' });

    const size = SIZE_BY_RATIO[body.aspectRatio] || SIZE_BY_RATIO['1:1'];
    const count = Math.max(1, Math.min(Number(body.variations) || 2, 4));
    const referenceImage = await fetchImageAsDataUrl(body.referenceImage).catch(() => null);
    const openai = new OpenAI({ apiKey });
    const creativeAngles = ['bold product hero composition', 'editorial lifestyle campaign composition', 'direct-response social ad composition', 'premium launch announcement composition'];
    const images = [];

    for (let index = 0; index < count; index += 1) {
      const response = await openai.images.generate({
        model: 'gpt-image-2',
        prompt: `Create a finished, high-conversion commercial advertising image. Core brief: ${prompt || 'Use the supplied product image as the hero.'}. Art direction: ${creativeAngles[index]}. The creative must have a strong focal point, professional studio lighting, a deliberate brand-safe composition, and no generic stock aesthetic. Do not render text unless the brief specifically requests exact on-image copy.`,
        n: 1,
        size,
        quality: 'low',
      });
      const generated = response.data?.[0]?.b64_json ? `data:image/png;base64,${response.data[0].b64_json}` : response.data?.[0]?.url;
      if (!generated) throw new Error('The image provider returned no creative output.');
      const composed = referenceImage
        ? createReferenceComposition(generated, referenceImage, body.textOverlay || prompt || 'Made for your next move', index % 2 ? '#ff6696' : '#7d61ff', size)
        : generated;
      images.push({ url: composed, kind: 'image', variation: index + 1 });
    }

    return res.status(200).json({ images, size, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Image generation error:', error);
    return res.status(500).json({ error: error?.message || 'Image creation failed. Please try again.' });
  }
}
