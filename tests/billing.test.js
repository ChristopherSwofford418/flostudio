import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))

vi.mock('../src/supabase', () => ({
  supabase: {
    from: mockFrom,
    auth: { getUser: vi.fn() },
  },
}))

import { consumeTokens } from '../src/lib/billing'

describe('FloStudio token entitlements', () => {
  beforeEach(() => {
    mockFrom.mockReset()
  })

  it('does not deduct balance or write a debit for an unlimited owner', async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      single: vi.fn(),
    }
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    query.single.mockResolvedValue({
      data: { balance: 920, tier: 'owner_unlimited', unlimited: true },
      error: null,
    })
    mockFrom.mockReturnValue(query)

    const balance = await consumeTokens('owner-user', 10, 'AI image creative')

    expect(balance).toBe(920)
    expect(mockFrom).toHaveBeenCalledTimes(1)
    expect(mockFrom).toHaveBeenCalledWith('user_tokens')
    expect(query.select).toHaveBeenCalledWith('balance, tier, unlimited')
  })
})
