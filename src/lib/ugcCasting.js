export const SYNTHETIC_ACTORS = [
  {
    id:'maya',
    name:'Maya',
    role:'Friendly product finder',
    portrait:'/visuals/casting/maya-chen.webp',
    defaultVoice:'aoede',
    tags:['Candid', 'Warm', 'Lifestyle'],
    prompt:'Maya is a fictional synthetic adult creator with a warm, grounded, friendly on-camera presence. Keep her appearance internally consistent within the video. She must not resemble any real person or public figure.',
  },
  {
    id:'marco',
    name:'Marco',
    role:'Confident routine builder',
    portrait:'/visuals/casting/marco-rivera.webp',
    defaultVoice:'aljieba',
    tags:['Confident', 'Direct', 'Tech'],
    prompt:'Marco is a fictional synthetic adult creator with calm confidence, purposeful product interaction, and natural conversational energy. Keep his appearance internally consistent within the video. He must not resemble any real person or public figure.',
  },
  {
    id:'nia',
    name:'Nia',
    role:'Credible guide',
    portrait:'/visuals/casting/nia-okafor.webp',
    defaultVoice:'kore',
    tags:['Credible', 'Clear', 'Premium'],
    prompt:'Nia is a fictional synthetic adult creator with poised, credible delivery and a practical, reassuring demeanor. Keep her appearance internally consistent within the video. She must not resemble any real person or public figure.',
  },
  {
    id:'leo',
    name:'Leo',
    role:'Upbeat explainer',
    portrait:'/visuals/casting/leo-patel.webp',
    defaultVoice:'puck',
    tags:['Energetic', 'Friendly', 'Demo'],
    prompt:'Leo is a fictional synthetic adult creator with optimistic, approachable energy and clear product-first demonstration. Keep his appearance internally consistent within the video. He must not resemble any real person or public figure.',
  },
  {
    id:'sofia',
    name:'Sofia',
    role:'Thoughtful tastemaker',
    portrait:'/visuals/casting/sofia-marin.webp',
    defaultVoice:'vindemiatrix',
    tags:['Polished', 'Thoughtful', 'Editorial'],
    prompt:'Sofia is a fictional synthetic adult creator with polished, thoughtful presence and quiet confidence. Keep her appearance internally consistent within the video. She must not resemble any real person or public figure.',
  },
  {
    id:'alex',
    name:'Alex',
    role:'Practical expert',
    portrait:'/visuals/casting/alex-morgan.webp',
    defaultVoice:'charon',
    tags:['Informative', 'Calm', 'Trust'],
    prompt:'Alex is a fictional synthetic adult creator with a calm, informative, approachable delivery. Keep their appearance internally consistent within the video. They must not resemble any real person or public figure.',
  },
  {
    id:'darius',
    name:'Darius',
    role:'Grounded product strategist',
    portrait:'/visuals/casting/darius-cole.webp',
    defaultVoice:'alnilam',
    tags:['Grounded', 'Confident', 'Trust'],
    prompt:'Darius is a fictional synthetic Black adult creator with a grounded, confident, warm on-camera presence. Keep his appearance internally consistent within the video. He must not resemble any real person or public figure.',
  },
]

export const SYNTHETIC_VOICES = [
  {
    id:'aoede',
    name:'Breezy bright',
    shortName:'Breezy',
    sample:'/visuals/casting/maya-aoede-demo.wav',
    actorId:'maya',
    detail:'Warm discovery energy with a friendly lift.',
    prompt:'If dialogue is present, use a bright, friendly, conversational delivery at a natural pace. It should sound original and non-identifiable, never like a named or real person.',
  },
  {
    id:'aljieba',
    name:'Smooth confident',
    shortName:'Smooth',
    sample:'/visuals/casting/marco-algieba-demo.wav',
    actorId:'marco',
    detail:'Calm confidence for a clear routine or result.',
    prompt:'If dialogue is present, use a smooth, confident, conversational delivery at a natural pace. It should sound original and non-identifiable, never like a named or real person.',
  },
  {
    id:'kore',
    name:'Clear credible',
    shortName:'Clear',
    sample:'/visuals/casting/nia-kore-demo.wav',
    actorId:'nia',
    detail:'Precise, credible explanation without pressure.',
    prompt:'If dialogue is present, use a clear, firm, welcoming delivery at a natural pace. It should sound original and non-identifiable, never like a named or real person.',
  },
  {
    id:'puck',
    name:'Upbeat finder',
    shortName:'Upbeat',
    sample:'/visuals/casting/leo-puck-demo.wav',
    actorId:'leo',
    detail:'Optimistic, friendly, and native to a quick demo.',
    prompt:'If dialogue is present, use an upbeat, friendly, natural delivery at a lively but clear pace. It should sound original and non-identifiable, never like a named or real person.',
  },
  {
    id:'vindemiatrix',
    name:'Gentle polished',
    shortName:'Polished',
    sample:'/visuals/casting/sofia-vindemiatrix-demo.wav',
    actorId:'sofia',
    detail:'Thoughtful premium tone for considered creative.',
    prompt:'If dialogue is present, use a gentle, polished, thoughtful delivery at a natural pace. It should sound original and non-identifiable, never like a named or real person.',
  },
  {
    id:'charon',
    name:'Informative steady',
    shortName:'Steady',
    sample:'/visuals/casting/alex-charon-demo.wav',
    actorId:'alex',
    detail:'Reassuring product explanation with authority.',
    prompt:'If dialogue is present, use a clear, informed, reassuring delivery at a natural pace. It should sound original and non-identifiable, never like a named or real person.',
  },
  {
    id:'alnilam',
    name:'Grounded confident',
    shortName:'Grounded',
    sample:'/visuals/casting/darius-alnilam-demo.wav',
    actorId:'darius',
    detail:'Warm, assured product guidance with an original baritone.',
    prompt:'If dialogue is present, use a confident, warm, grounded delivery at a natural pace. It should sound original and non-identifiable, never like a named or real person.',
  },
]

export function castingProfile(actorId) {
  return SYNTHETIC_ACTORS.find(actor => actor.id === actorId) || SYNTHETIC_ACTORS[0]
}

export function voiceProfile(voiceId) {
  return SYNTHETIC_VOICES.find(voice => voice.id === voiceId) || SYNTHETIC_VOICES[0]
}
