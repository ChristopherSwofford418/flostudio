import { describe, expect, it } from 'vitest'
import { buildVideoSourceOptions, resolvedVideoReference } from '../src/lib/videoReferences'

describe('Creative Lab video source selection', () => {
  it('lists only the active app’s App Store images and approved App Store Connect imports', () => {
    const sources = buildVideoSourceOptions({
      appStoreScreenshots:['https://cdn.example.com/store.png'],
      imageAssets:[
        { id:'approved-1', kind:'image', source:'app_store_connect_import', asset_url:'https://cdn.example.com/apple-approved.png', asc_asset_id:'apple-asset', asc_placement_id:'apple-placement', name:'Approved store media' },
        { id:'upload-1', kind:'image', source:'upload', asset_url:'https://cdn.example.com/upload.png', name:'Custom upload' },
        { id:'image-1', kind:'image', source:'ai_image', asset_url:'https://cdn.example.com/ad.png', name:'Generated creative' },
      ],
    })

    expect(sources).toEqual([
      { id:'approved-1', url:'https://cdn.example.com/apple-approved.png', name:'Approved store media', source:'app_store_connect_import' },
      { id:null, url:'https://cdn.example.com/store.png', name:'App Store image 1', source:'app_store_listing' },
    ])
  })

  it('returns a verified chosen source and never falls back to an arbitrary pinned image', () => {
    expect(resolvedVideoReference({ url:'https://cdn.example.com/chosen.png' })).toBe('https://cdn.example.com/chosen.png')
    expect(resolvedVideoReference(null)).toBeNull()
  })
})
