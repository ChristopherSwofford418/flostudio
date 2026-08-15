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

      const imgResponse = await openai.images.generate({
        model: 'gpt-image-2',
        prompt: `Cinematic vertical 9:16 mobile video ad background for: ${prompt}. High engagement, vibrant professional lighting, ultra detailed, 8k.`,
        n: 1,
        size: '1024x1024',
        quality: 'low',
      });

      let thumbnail = imgResponse.data[0].b64_json ? `data:image/png;base64,${imgResponse.data[0].b64_json}` : imgResponse.data[0].url;
      if (referenceImage) {
        thumbnail = referenceImage; // use uploaded app screenshot as direct preview thumbnail
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

      // Generate 2 variations using OpenAI gpt-image-2
      const response1 = await openai.images.generate({
        model: 'gpt-image-2',
        prompt: `Commercial marketing ad creative: ${prompt}. Photorealistic, high-end studio lighting, 8K, cinematic commercial production quality.`,
        n: 1,
        size: '1024x1024',
        quality: 'low',
      });

      const response2 = await openai.images.generate({
        model: 'gpt-image-2',
        prompt: `High converting social media ad banner: ${prompt}. Vibrant professional lighting, sleek product showcase, modern design.`,
        n: 1,
        size: '1024x1024',
        quality: 'low',
      });

      const img1 = response1.data[0].b64_json ? `data:image/png;base64,${response1.data[0].b64_json}` : response1.data[0].url;
      const img2 = response2.data[0].b64_json ? `data:image/png;base64,${response2.data[0].b64_json}` : response2.data[0].url;

      // Return ONLY newly generated AI ad creatives
      const images = [img1, img2];

      return res.status(200).json({ images });
    }
  } catch (err) {
    console.error('API execution error:', err);
    return res.status(500).json({ 
      error: err.message || 'Failed to process AI generation.' 
    });
  }
}
