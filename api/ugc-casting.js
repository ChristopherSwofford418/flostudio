const ACTOR_PROFILES = {
  maya:'Cast Maya: a fictional synthetic adult creator with a warm, grounded, friendly on-camera presence. Keep this fictional appearance internally consistent within the video. Never make her resemble a real person or public figure.',
  marco:'Cast Marco: a fictional synthetic adult creator with calm confidence, purposeful product interaction, and natural conversational energy. Keep this fictional appearance internally consistent within the video. Never make him resemble a real person or public figure.',
  nia:'Cast Nia: a fictional synthetic adult creator with poised, credible delivery and a practical, reassuring demeanor. Keep this fictional appearance internally consistent within the video. Never make her resemble a real person or public figure.',
  leo:'Cast Leo: a fictional synthetic adult creator with optimistic, approachable energy and clear product-first demonstration. Keep this fictional appearance internally consistent within the video. Never make him resemble a real person or public figure.',
  sofia:'Cast Sofia: a fictional synthetic adult creator with polished, thoughtful presence and quiet confidence. Keep this fictional appearance internally consistent within the video. Never make her resemble a real person or public figure.',
  alex:'Cast Alex: a fictional synthetic adult creator with a calm, informative, approachable delivery. Keep this fictional appearance internally consistent within the video. Never make them resemble a real person or public figure.',
  darius:'Cast Darius: a fictional synthetic Black adult creator with grounded confidence, a warm product-first delivery, and a practical strategist presence. Keep his appearance internally consistent within the video. Never make him resemble a real person or public figure.',
}

const VOICE_PROFILES = {
  aoede:'If dialogue is present, use a bright, friendly, conversational delivery at a natural pace. The voice must sound original and non-identifiable, never like a named or real person.',
  algieba:'If dialogue is present, use a smooth, confident, conversational delivery at a natural pace. The voice must sound original and non-identifiable, never like a named or real person.',
  kore:'If dialogue is present, use a clear, firm, welcoming delivery at a natural pace. The voice must sound original and non-identifiable, never like a named or real person.',
  puck:'If dialogue is present, use an upbeat, friendly, natural delivery at a lively but clear pace. The voice must sound original and non-identifiable, never like a named or real person.',
  vindemiatrix:'If dialogue is present, use a gentle, polished, thoughtful delivery at a natural pace. The voice must sound original and non-identifiable, never like a named or real person.',
  charon:'If dialogue is present, use a clear, informed, reassuring delivery at a natural pace. The voice must sound original and non-identifiable, never like a named or real person.',
  alnilam:'If dialogue is present, use a confident, warm, grounded delivery at a natural pace. The voice must sound original and non-identifiable, never like a named or real person.',
}

export function castingDirection(actorId, voiceId, creatorMode) {
  if (creatorMode === 'product_only') return 'Do not show an actor or use spoken dialogue. Keep the app and product motion central.'
  return `${ACTOR_PROFILES[actorId] || ACTOR_PROFILES.maya} ${VOICE_PROFILES[voiceId] || VOICE_PROFILES.aoede}`
}
