import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFrom, mockGetUser } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockGetUser: vi.fn(),
}))

vi.mock('../src/supabase', () => ({
  supabase: {
    from: mockFrom,
    auth: { getUser: mockGetUser },
  },
}))

import { belongsToProduct, listMediaAssets } from '../src/lib/mediaAssets'

describe('Creative Lab product media isolation', () => {
  beforeEach(() => {
    mockFrom.mockReset()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'owner-user' } } })
  })

  it('accepts only assets assigned to the active portfolio app', () => {
    expect(belongsToProduct({ product_id: 'resume-fix' }, 'resume-fix')).toBe(true)
    expect(belongsToProduct({ product_id: 'pocket-lawyer' }, 'resume-fix')).toBe(false)
    expect(belongsToProduct({ product_id: null }, 'resume-fix')).toBe(false)
  })

  it('queries media with both the signed-in user and active app key', async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
    }
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    query.order.mockResolvedValue({ data: [], error: null })
    mockFrom.mockReturnValue(query)

    await expect(listMediaAssets('resume-fix')).resolves.toEqual([])

    expect(mockFrom).toHaveBeenCalledWith('media_assets')
    expect(query.eq).toHaveBeenNthCalledWith(1, 'user_id', 'owner-user')
    expect(query.eq).toHaveBeenNthCalledWith(2, 'product_id', 'resume-fix')
  })

  it('does not query or expose library media until an app is active', async () => {
    await expect(listMediaAssets(null)).resolves.toEqual([])
    expect(mockFrom).not.toHaveBeenCalled()
  })
})
