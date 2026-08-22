import { describe, expect, it } from 'vitest'
import { buildVideoSourceOptions, resolvedVideoReference } from '../src/lib/videoReferences'

describe('Creative Lab video source selection', () => {
  it('lists only the active app’s saved image creatives and App Store images', () => {
    const sources = buildVideoSourceOptions({
      appStoreScreenshots:['https://cdn.example.com/store.png'],
      imageAssets:[
        { id:'image-1', kind:'image', url:'https://cdn.example.com/ad.png', name:'Install creative' },
        { id:'video-1', kind:'video', url:'https://cdn.example.com/ad.mp4', name:'Existing video' },
      ],
    })

    expect(sources).toEqual([
      { id:'image-1', url:'https://cdn.example.com/ad.png', name:'Install creative', source:'saved_image' },
      { id:null, url:'https://cdn.example.com/store.png', name:'App Store image 1', source:'app_store' },
    ])
  })

  it('uses the chosen video source in preference to a generic pinned image', () => {
    expect(resolvedVideoReference({ url:'https://cdn.example.com/chosen.png' }, 'https://cdn.example.com/other.png')).toBe('https://cdn.example.com/chosen.png')
    expect(resolvedVideoReference(null, 'https://cdn.example.com/pinned.png')).toBe('https://cdn.example.com/pinned.png')
    expect(resolvedVideoReference(null, null)).toBeNull()
  })
})
