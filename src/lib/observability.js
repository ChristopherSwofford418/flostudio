const env = import.meta.env

const MIXPANEL_TOKEN = String(env.VITE_MIXPANEL_TOKEN || '').trim()
const FIREBASE_CONFIG = {
  apiKey: String(env.VITE_FIREBASE_API_KEY || '').trim(),
  authDomain: String(env.VITE_FIREBASE_AUTH_DOMAIN || '').trim(),
  projectId: String(env.VITE_FIREBASE_PROJECT_ID || '').trim(),
  appId: String(env.VITE_FIREBASE_APP_ID || '').trim(),
  measurementId: String(env.VITE_FIREBASE_MEASUREMENT_ID || '').trim(),
}

let mixpanelClient = null
let firebaseAnalytics = null
let initialization = null

export function observabilityStatus() {
  return {
    mixpanelConfigured: Boolean(MIXPANEL_TOKEN),
    firebaseConfigured: Boolean(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.authDomain && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.appId),
  }
}

export async function initializeObservability() {
  if (initialization) return initialization
  initialization = (async () => {
    const { mixpanelConfigured, firebaseConfigured } = observabilityStatus()
    const tasks = []

    if (mixpanelConfigured) {
      tasks.push(import('mixpanel-browser').then(({ default: mixpanel }) => {
        mixpanel.init(MIXPANEL_TOKEN, {
          autocapture: false,
          track_pageview: false,
          persistence: 'localStorage',
          ignore_dnt: false,
          api_host: 'https://api-js.mixpanel.com',
        })
        mixpanelClient = mixpanel
      }).catch(() => null))
    }

    if (firebaseConfigured) {
      tasks.push(Promise.all([import('firebase/app'), import('firebase/analytics')]).then(([appModule, analyticsModule]) => {
        const app = appModule.getApps().length ? appModule.getApp() : appModule.initializeApp(FIREBASE_CONFIG)
        if (analyticsModule.isSupported) return analyticsModule.isSupported().then(supported => {
          if (supported) firebaseAnalytics = analyticsModule.getAnalytics(app)
        })
        firebaseAnalytics = analyticsModule.getAnalytics(app)
      }).catch(() => null))
    }

    await Promise.all(tasks)
    return observabilityStatus()
  })()
  return initialization
}

function safeProperties(properties = {}) {
  return Object.fromEntries(Object.entries(properties).filter(([key, value]) => {
    if (value === undefined || value === null || value === '') return false
    return !/email|phone|token|secret|password|private.?key|message|description|prompt/i.test(key)
  }).map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 160) : value]))
}

export async function trackFloEvent(name, properties = {}) {
  await initializeObservability()
  const safeName = String(name || '').replace(/[^a-zA-Z0-9_ -]/g, '').slice(0, 80)
  if (!safeName) return
  const safe = safeProperties(properties)
  try { mixpanelClient?.track(safeName, safe) } catch { /* observability must never interrupt product work */ }
  try { firebaseAnalytics && (await import('firebase/analytics')).logEvent(firebaseAnalytics, safeName.replaceAll(' ', '_'), safe) } catch { /* observability must never interrupt product work */ }
}

export async function identifyFloUser(user) {
  if (!user?.id) return
  await initializeObservability()
  try { mixpanelClient?.identify(user.id) } catch { /* no-op */ }
  try { mixpanelClient?.people?.set_once({ first_seen_at:new Date().toISOString() }) } catch { /* no-op */ }
}

export async function resetFloIdentity() {
  try { mixpanelClient?.reset() } catch { /* no-op */ }
}
