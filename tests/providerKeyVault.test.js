import { afterEach, describe, expect, it, vi } from 'vitest'
import { decryptProviderKey, encryptProviderKey } from '../api/provider-key-vault.js'
import { resolveVideoProvider } from '../api/media-provider.js'

const originalVaultKey = process.env.OPENAI_PROVIDER_VAULT_KEY
const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalVaultKey === undefined) delete process.env.OPENAI_PROVIDER_VAULT_KEY
  else process.env.OPENAI_PROVIDER_VAULT_KEY = originalVaultKey
})

describe('workspace OpenAI provider vault', () => {
  it('encrypts a connected provider key and can only recover it with the server vault key', () => {
    process.env.OPENAI_PROVIDER_VAULT_KEY = 'test-workspace-provider-vault-key'
    const envelope = encryptProviderKey('sk-workspace-funded-key-123456789')

    expect(envelope).toMatchObject({ version:1, algorithm:'aes-256-gcm' })
    expect(JSON.stringify(envelope)).not.toContain('sk-workspace-funded-key-123456789')
    expect(decryptProviderKey(envelope)).toBe('sk-workspace-funded-key-123456789')
  })

  it('uses a workspace-supplied OpenAI key ahead of the shared provider key', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id:'video_workspace', status:'queued' }), { status:200, headers:{ 'Content-Type':'application/json' } }))

    await resolveVideoProvider({ apiKey:'sk-workspace-funded-key-123456789' }).create({ model:'sora-2', prompt:'A valid app video', size:'720x1280', seconds:'4' })

    expect(globalThis.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer sk-workspace-funded-key-123456789')
  })
})
