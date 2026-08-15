  const generateAIVideo = async () => {
    if (!videoPrompt.trim()) return
    setGeneratingVideo(true)
    setError('')
    setGeneratedVideo(null)

    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'video',
          prompt: videoPrompt,
          voice: videoVoice,
          captionStyle: videoCaptionStyle
        })
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to generate AI video ad.')
      }
      setGeneratedVideo({
        title: data.title || videoPrompt,
        voice: data.voice || videoVoice,
        captions: data.captions || videoCaptionStyle,
        duration: data.duration || '15s',
        previewUrl: data.previewUrl,
        thumbnail: data.thumbnail,
        script: data.script
      })
      
      if (tokenBalance >= 25) {
        setTokenBalance(prev => Math.max(0, prev - 25))
      }
    } catch (e) {
      setError('Video generation failed: ' + e.message)
    }
    setGeneratingVideo(false)
  }
