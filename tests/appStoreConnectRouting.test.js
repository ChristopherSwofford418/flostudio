import { describe, expect, it } from 'vitest'
import { appStoreConnectPath, selectConnectionTarget } from '../src/lib/appStoreConnectRouting'

describe('App Store Connect selected-app routing', () => {
  const apps = [{ id:'resumefix', name:'ResumeFix AI' }, { id:'another-app', name:'Another App' }]

  it('preserves the selected product in the Portfolio connection URL', () => {
    expect(appStoreConnectPath('another-app')).toBe('/portfolio?connectApp=another-app#app-store-connect')
  })

  it('targets the requested portfolio app rather than defaulting to the first app', () => {
    expect(selectConnectionTarget(apps, 'another-app')).toBe('another-app')
  })

  it('defaults safely when the requested product does not belong to the portfolio', () => {
    expect(selectConnectionTarget(apps, 'unrelated-app')).toBe('resumefix')
    expect(selectConnectionTarget([], 'unrelated-app')).toBe('')
  })
})
