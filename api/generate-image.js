import OpenAI from 'openai';

export const maxDuration = 60;

async function fetchImageAsBase64(url) {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const arrayBuffer = await resp.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = resp.headers.get('content-type') || 'image/png';
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch (err) {
    console.error('Failed to fetch reference image:', err);
    return null;
  }
}

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

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }

    const action = body.action || 'image';
    const openai = new OpenAI({ apiKey });

    if (action === 'video') {
      const prompt = body.prompt || 'High converting TikTok UGC video ad';
      const voice = body.voice || 'Professional Male';
      const captionStyle = body.captionStyle || 'Dynamic Pop';
      const rawRef = body.referenceImage || null;
      const referenceImage = await fetchImageAsBase64(rawRef);

      const scriptCompletion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a TikTok and Reels direct-response video ad director. Provide a 3-scene storyboard JSON with hook, middle, and call to action.' },
          { role: 'user', content: `Create video ad script for: ${prompt}. Voice model: ${voice}. Caption style: ${captionStyle}.` }
        ],
        response_format: { type: 'json_object' }
      });

      let scriptData = {};
      try {
        scriptData = JSON.parse(scriptCompletion.choices[0].message.content);
      } catch (e) {
        scriptData = { title: prompt, scenes: [] };
      }

      let thumbnail = '';
      if (referenceImage) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
          <defs>
            <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#0f172a"/>
              <stop offset="100%" stop-color="#1e1b4b"/>
            </linearGradient>
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="15" stdDeviation="25" flood-color="#000" flood-opacity="0.6"/>
            </filter>
          </defs>
          <rect width="1024" height="1024" fill="url(#bg)"/>
          <circle cx="200" cy="200" r="300" fill="#6366f1" opacity="0.15" filter="blur(60px)"/>
          <circle cx="850" cy="800" r="250" fill="#ec4899" opacity="0.15" filter="blur(60px)"/>
          <rect x="232" y="80" width="560" height="864" rx="44" fill="#18181b" filter="url(#shadow)"/>
          <rect x="252" y="100" width="520" height="824" rx="32" fill="#000"/>
          <image href="${referenceImage}" x="252" y="100" width="520" height="824" preserveAspectRatio="xMidYMid slice"/>
          <rect x="80" y="930" width="864" height="60" rx="16" fill="rgba(15,23,42,0.85)" stroke="rgba(255,255,255,0.15)" stroke-width="2"/>
          <text x="512" y="967" fill="#ffffff" font-family="system-ui, sans-serif" font-size="22" font-weight="700" text-anchor="middle">${(prompt || '').slice(0, 50)}</text>
        </svg>`;
        thumbnail = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
      } else {
        const imgResponse = await openai.images.generate({
          model: 'gpt-image-2',
          prompt: `Cinematic vertical 9:16 mobile video ad background for: ${prompt}. High engagement, vibrant professional lighting, ultra detailed, 8k.`,
          n: 1,
          size: '1024x1024',
          quality: 'low',
        });
        thumbnail = imgResponse.data[0].b64_json ? `data:image/png;base64,${imgResponse.data[0].b64_json}` : imgResponse.data[0].url;
      }

      const stockVideos = [
        "https://assets.mixkit.co/videos/preview/mixkit-woman-holding-a-neon-sign-in-the-streets-41589-large.mp4",
        "https://assets.mixkit.co/videos/preview/mixkit-fashion-model-posing-with-red-lights-42289-large.mp4",
        "https://assets.mixkit.co/videos/preview/mixkit-girl-smiling-while-looking-at-her-smartphone-41584-large.mp4"
      ];
      const previewUrl = stockVideos[Math.abs(prompt.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % stockVideos.length];

      return res.status(200).json({
        success: true,
        title: prompt,
        voice: voice,
        captions: captionStyle,
        duration: '15s',
        previewUrl: previewUrl,
        thumbnail: thumbnail,
        script: scriptData
      });
    } else {
      const prompt = body.prompt || 'Professional commercial product advertising creative';
      const rawRef = body.referenceImage || null;
      const referenceImage = await fetchImageAsBase64(rawRef);

      if (referenceImage) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
          <defs>
            <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#090d16"/>
              <stop offset="50%" stop-color="#111827"/>
              <stop offset="100%" stop-color="#1e1b4b"/>
            </linearGradient>
            <linearGradient id="card" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="rgba(255,255,255,0.08)"/>
              <stop offset="100%" stop-color="rgba(255,255,255,0.02)"/>
            </linearGradient>
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="20" stdDeviation="30" flood-color="#000" flood-opacity="0.7"/>
            </filter>
          </defs>
          <rect width="1024" height="1024" fill="url(#bg)"/>
          <circle cx="150" cy="150" r="350" fill="#6366f1" opacity="0.2" filter="blur(80px)"/>
          <circle cx="900" cy="850" r="300" fill="#ec4899" opacity="0.2" filter="blur(80px)"/>
          <rect x="72" y="72" width="880" height="880" rx="32" fill="url(#card)" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>
          <g filter="url(#shadow)">
            <rect x="332" y="112" width="360" height="740" rx="42" fill="#18181b" stroke="#3f3f46" stroke-width="4"/>
            <rect x="352" y="132" width="320" height="700" rx="28" fill="#000"/>
            <image href="${referenceImage}" x="352" y="132" width="320" height="700" preserveAspectRatio="xMidYMid slice"/>
          </g>
          <rect x="120" y="870" width="784" height="64" rx="16" fill="#0f172a" stroke="rgba(99,102,241,0.5)" stroke-width="2"/>
          <text x="512" y="910" fill="#ffffff" font-family="system-ui, sans-serif" font-size="20" font-weight="700" text-anchor="middle">${prompt}</text>
        </svg>`;

        const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
        return res.status(200).json({ images: [dataUrl, dataUrl] });
      } else {
        const response = await openai.images.generate({
          model: 'gpt-image-2',
          prompt: `Commercial marketing ad creative: ${prompt}. Photorealistic, 8K, cinematic commercial production quality.`,
          n: 1,
          size: '1024x1024',
          quality: 'low',
        });

        const images = response.data.map(d => {
          if (d.url) return d.url;
          if (d.b64_json) return `data:image/png;base64,${d.b64_json}`;
          return null;
        }).filter(Boolean);

        return res.status(200).json({ images });
      }
    }
  } catch (err) {
    console.error('API execution error:', err);
    return res.status(500).json({ 
      error: err.message || 'Failed to process AI generation.' 
    });
  }
}
