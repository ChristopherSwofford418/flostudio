import { describe, it, expect } from 'vitest'
import { executeFloCopilotCommand } from '../src/lib/floCopilotEngine'

describe('Flo Copilot Action Engine', () => {
  it('handles empty prompt gracefully', async () => {
    const res = await executeFloCopilotCommand({ prompt: '', activeApp: { name: 'ResumeFix AI' } })
    expect(res.actionType).toBe('help')
    expect(res.message).toContain('Flo')
  })

  it('generates SEO blueprint on request', async () => {
    const res = await executeFloCopilotCommand({ prompt: 'Generate SEO blueprint for ResumeFix AI', activeApp: { name: 'ResumeFix AI', category: 'Productivity' } })
    expect(res.actionType).toBe('seo_blueprint')
    expect(res.result.appName).toBe('ResumeFix AI')
    expect(res.result.targetKeywords).toBeDefined()
  })

  it('routes analytics requests to verified data workspaces without inventing results', async () => {
    const res = await executeFloCopilotCommand({ prompt: 'Show analytics stats', activeApp: { name: 'ResumeFix AI' } })
    expect(res.actionType).toBe('analytics')
    expect(res.result).toEqual({ appName:'ResumeFix AI' })
    expect(res.message).toContain('does not invent')
  })
})
