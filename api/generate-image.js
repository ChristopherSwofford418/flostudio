import OpenAI from 'openai';

export const maxDuration = 60;

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
      const referenceImage = body.referenceImage || null;

      let imageMessageContent = [];
      if (referenceImage) {
        if (referenceImage.startsWith('data:')) {
          imageMessageContent.push({ type: "image_url", image_url: { url: referenceImage } });
        } else {
          try {
            const imgRes = await fetch(referenceImage);
            const arrayBuffer = await imgRes.arrayBuffer();
            const base64 = Buffer.from(arrayBuffer).toString('base64');
            const mime = imgRes.headers.get('content-type') || 'image/png';
            imageMessageContent.push({ type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } });
          } catch (e) {
            console.warn('Failed to fetch reference image for video:', e);
          }
        }
      }

      const scriptCompletion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a TikTok and Reels direct-response video ad director. Provide a 3-scene storyboard JSON with hook, middle, and call to action.' },
          { role: 'user', content: [
            { type: 'text', text: `Create video ad script for: ${prompt}. Voice model: ${voice}. Caption style: ${captionStyle}. Integrate the provided uploaded app screenshot/product faithfully.` },
            ...imageMessageContent
          ] }
        ],
        response_format: { type: 'json_object' }
      });

      let scriptData = {};
      try {
        scriptData = JSON.parse(scriptCompletion.choices[0].message.content);
      } catch (e) {
        scriptData = { title: prompt, scenes: [] };
      }

      let enhancedPrompt = `Cinematic vertical 9:16 mobile video ad thumbnail showcasing the exact uploaded app screenshot and UI interface prominently as the hero subject. Prompt: ${prompt}. High engagement, vibrant lighting, ultra detailed, 8k.`;

      const imgResponse = await openai.images.generate({
        model: 'gpt-image-2',
        prompt: enhancedPrompt,
        n: 1,
        size: '1024x1024',
        quality: 'low',
      });

      const thumbnail = imgResponse.data[0].b64_json ? `data:image/png;base64,${imgResponse.data[0].b64_json}` : imgResponse.data[0].url;

      const stockVideos = [
        "https://assets.mixkit.co/videos/preview/mixkit-woman-holding-a-neon-sign-in-the-streets-41589-large.mp4",
        "https://assets.mixkit.co/videos/preview/mixkit-fashion-model-posing-with-red-lights-42289-large.mp4",
        "https://assets.mixkit.co/videos/preview/mixkit-girl-smiling-while-looking-at-her-smartphone-41584-large.mp4",
        "https://assets.mixkit.co/videos/preview/mixkit-young-woman-looking-at-her-smartphone-in-the-street-41583-large.mp4"
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
      // Default image generation with precise image reference instruction
      const prompt = body.prompt || 'Professional commercial product advertising creative';
      const referenceImage = body.referenceImage || null;

      let finalPrompt = prompt;
      if (referenceImage) {
        finalPrompt = `Commercial marketing ad creative. The user has provided an uploaded app screenshot / product image as the exact visual reference. You MUST faithfully incorporate, feature, and showcase this exact uploaded app screen and interface inside the ad composition (e.g. displayed on a smartphone screen held by a person or floating in a studio). Additional instructions: ${prompt}. Professional studio lighting, commercial branding, photorealistic, 8K.`;
      } else {
        finalPrompt = `Commercial marketing ad creative: ${prompt}. Photorealistic, 8K, cinematic commercial production quality.`;
      }

      const response = await openai.images.generate({
        model: 'gpt-image-2',
        prompt: finalPrompt,
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
  } catch (err) {
    console.error('API execution error:', err);
    return res.status(500).json({ 
      error: err.message || 'Failed to process AI generation.' 
    });
  }
}
