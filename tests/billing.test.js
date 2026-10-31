import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetUser, mockGetSession } = vi.hoisted(() => ({ mockGetUser:vi.fn(), mockGetSession:vi.fn() }))

vi.mock('../src/supabase', () => ({
  supabase: { auth:{ getUser:mockGetUser, getSession:mockGetSession } },
}))

import { consumeTokens } from '../src/lib/billing'

describe('FloStudio token entitlements', () => {
  beforeEach(() => {
    mockGetUser.mockReset()
    mockGetSession.mockReset()
    global.fetch = vi.fn()
  })

  it('delegates an unlimited owner charge to the server ledger without browser-side writes', async () => {
    mockGetUser.mockResolvedValue({ data:{ user:{ id:'owner-user' } } })
    mockGetSession.mockResolvedValue({ data:{ session:{ access_token:'test-session' } } })
    global.fetch.mockResolvedValue({ ok:true, json:async () => ({ balance:920, unlimited:true, transactionId:null }) })

    const result = await consumeTokens('owner-user', 10, 'AI image creative')

    expect(result).toEqual({ balance:920, unlimited:true, transactionId:null })
    expect(global.fetch).toHaveBeenCalledWith('/api/token-ledger', expect.objectContaining({ method:'POST' }))
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ action:'charge', cost:10, label:'AI image creative' })
  })
})
