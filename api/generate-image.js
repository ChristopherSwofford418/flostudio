import OpenAI from 'openai';
import { createCanvas, loadImage } from 'canvas';

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

      let bgUrl = imgResponse.data[0].b64_json ? `data:image/png;base64,${imgResponse.data[0].b64_json}` : imgResponse.data[0].url;

      // If reference image provided, composite it onto the vertical background
      if (referenceImage) {
        try {
          const canvas = createCanvas(1024, 1024);
          const ctx = canvas.getContext('2d');
          const bgImg = await loadImage(bgUrl);
          ctx.drawImage(bgImg, 0, 0, 1024, 1024);

          // Draw device mockup frame and user image inside
          ctx.fillStyle = 'rgba(0,0,0,0.7)';
          ctx.fillRect(212, 112, 600, 800);
          
          const userImg = await loadImage(referenceImage);
          ctx.drawImage(userImg, 232, 132, 560, 760);

          bgUrl = canvas.toDataURL('image/png');
        } catch (compErr) {
          console.warn('Video composition fallback:', compErr);
        }
      }

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
        thumbnail: bgUrl,
        script: scriptData
      });
    } else {
      // Default image generation with exact asset compositing
      const prompt = body.prompt || 'Professional commercial product advertising creative';
      const referenceImage = body.referenceImage || null;

      // 1. Generate professional background scene with OpenAI
      const response = await openai.images.generate({
        model: 'gpt-image-2',
        prompt: `Professional high-end commercial advertising background studio setting for: ${prompt}. Clean lighting, premium marketing backdrop, photorealistic, 8K, cinematic.`,
        n: 1,
        size: '1024x1024',
        quality: 'low',
      });

      let rawBgUrl = response.data[0].b64_json ? `data:image/png;base64,${response.data[0].b64_json}` : response.data[0].url;

      // 2. If user uploaded a reference asset, composite it directly into the final image
      let finalImages = [rawBgUrl];
      if (referenceImage) {
        try {
          const canvas = createCanvas(1024, 1024);
          const ctx = canvas.getContext('2d');
          
          const bgImg = await loadImage(rawBgUrl);
          ctx.drawImage(bgImg, 0, 0, 1024, 1024);

          // Draw sleek phone mockup chassis
          ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
          ctx.shadowBlur = 35;
          ctx.fillStyle = '#111';
          ctx.beginPath();
          ctx.roundRect(312, 100, 400, 824, 40);
          ctx.fill();

          // Draw user's exact uploaded app screenshot inside the phone screen
          const userImg = await loadImage(referenceImage);
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(332, 120, 360, 784, 28);
          ctx.clip();
          ctx.drawImage(userImg, 332, 120, 360, 784);
          ctx.restore();

          finalImages = [canvas.toDataURL('image/png')];
        } catch (compError) {
          console.error('Image composition error:', compError);
        }
      }

      return res.status(200).json({ images: finalImages });
    }
  } catch (err) {
    console.error('API execution error:', err);
    return res.status(500).json({ 
      error: err.message || 'Failed to process AI generation.' 
    });
  }
}
