import { describe, it, expect } from 'vitest'

describe('Creative Lab image generation contract', () => {
  it('requires a typed verified selected-app reference rather than a free-form image URL', () => {
    const missingReference = { prompt:'Create an app creative' }
    const appStoreReference = {
      prompt:'Create an app creative',
      reference:{ source:'app_store_listing', url:'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/screenshot.png' },
    }
    const approvedConnectReference = {
      prompt:'Create an app creative',
      reference:{ source:'app_store_connect_import', mediaAssetId:'approved-media-id' },
    }

    const hasVerifiedReference = payload => Boolean(
      payload?.reference?.source === 'app_store_listing' && payload?.reference?.url
      || payload?.reference?.source === 'app_store_connect_import' && payload?.reference?.mediaAssetId
    )

    expect(hasVerifiedReference(missingReference)).toBe(false)
    expect(hasVerifiedReference(appStoreReference)).toBe(true)
    expect(hasVerifiedReference(approvedConnectReference)).toBe(true)
  })

  it('records the verified reference descriptor with each rendered app creative', () => {
    const verifiedReference = { source:'app_store_listing', url:'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/screenshot.png' }
    const asset = {
      source:'ai_image',
      metadata:{
        verifiedReference,
        composedAdWorkspace:true,
      },
    }

    expect(asset.metadata.verifiedReference).toEqual(verifiedReference)
    expect(asset.metadata.composedAdWorkspace).toBe(true)
  })
})
