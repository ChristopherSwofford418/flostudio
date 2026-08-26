import crypto from 'node:crypto'

export const config = { maxDuration: 30 }

const SUPABASE_URL = 'https://jtogllurcrxxaguoxeus.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0b2dsbHVyY3J4eGFndW94ZXVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4MDE2OTEsImV4cCI6MjEwMjM3NzY5MX0.2BanYaDFNpDMrwaBfz4vSa-CroeOhynemXh7m5YmBYM'
const PROVIDER_BASE = 'https://api.ayrshare.com/api'
const PLATFORMS = ['bluesky', 'facebook', 'gmb', 'instagram', 'linkedin', 'pinterest', 'reddit', 'snapchat', 'telegram', 'threads', 'tiktok', 'twitter', 'youtube']

function bodyOf(req) {
  if (!req.body) return {}
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body) } catch { return {} }
  }
  return req.body
}

function apiError(code, message, status = 400, details = {}) {
  const error = new Error(message)
  error.code = code
  error.status = status
  error.details = details
  return error
}

function sendError(res, error) {
  return res.status(error?.status || 500).json({
    error: error?.message || 'FloStudio could not complete this social publishing request.',
    code: error?.code || 'UNIFIED_SOCIAL_ERROR',
    ...(error?.details || {}),
  })
}

function required(value, label) {
  if (!value) throw apiError('UNIFIED_SOCIAL_SETUP_REQUIRED', `${label} is not configured in FloStudio production yet.`, 503)
  return value
}

function vaultKey() {
  const source = process.env.UNIFIED_SOCIAL_VAULT_KEY || process.env.SOCIAL_CREDENTIALS_ENCRYPTION_KEY || process.env.OPENAI_PROVIDER_VAULT_KEY
  return crypto.createHash('sha256').update(required(source, 'UNIFIED_SOCIAL_VAULT_KEY')).digest()
}

function encrypt(value) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', vaultKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()])
  return { version:1, algorithm:'aes-256-gcm', iv:iv.toString('base64'), tag:cipher.getAuthTag().toString('base64'), ciphertext:ciphertext.toString('base64') }
}

function decrypt(envelope) {
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', vaultKey(), Buffer.from(envelope.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    throw apiError('UNIFIED_SOCIAL_PROFILE_KEY_INVALID', 'FloStudio could not read the protected social connection profile. Reconnect the unified social account to continue.', 409)
  }
}

function providerSetup() {
  const apiKey = process.env.AYRSHARE_API_KEY
  const domain = process.env.AYRSHARE_DOMAIN
  const privateKey = process.env.AYRSHARE_PRIVATE_KEY
  const secureStorage = Boolean(process.env.UNIFIED_SOCIAL_VAULT_KEY || process.env.SOCIAL_CREDENTIALS_ENCRYPTION_KEY || process.env.OPENAI_PROVIDER_VAULT_KEY)
  // An owner-primary test never stores a provider profile key or OAuth credential in FloStudio.
  // It only stores a non-secret sentinel and lets Ayrshare retain the account connections.
  const configured = Boolean(apiKey)
  const connectionConfigured = Boolean(configured && secureStorage && domain && privateKey)
  return {
    configured,
    connectionConfigured,
    ownerMode: Boolean(configured && !connectionConfigured),
    apiKey,
    domain,
    privateKey,
    secureStorage,
    requirement: 'Add AYRSHARE_API_KEY in FloStudio production to test the owner account. Add UNIFIED_SOCIAL_VAULT_KEY, AYRSHARE_DOMAIN, and AYRSHARE_PRIVATE_KEY later to activate member-managed embedded account linking.',
  }
}

async function authenticatedUser(req) {
  const authorization = req.headers.authorization || ''
  const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!accessToken) throw apiError('AUTH_REQUIRED', 'Sign in to FloStudio before managing social connections.', 401)
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers:{ Authorization:`Bearer ${accessToken}`, apikey:SUPABASE_ANON_KEY } })
  const user = await response.json().catch(() => null)
  if (!response.ok || !user?.id) throw apiError('AUTH_REQUIRED', 'Your FloStudio session expired. Sign in again and retry.', 401)
  return { user, accessToken }
}

async function db(accessToken, path, { method='GET', body, prefer='return=representation' } = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers:{ apikey:SUPABASE_ANON_KEY, Authorization:`Bearer ${accessToken}`, 'Content-Type':'application/json', Prefer:prefer },
    ...(body !== undefined ? { body:JSON.stringify(body) } : {}),
  })
  const text = await response.text()
  const payload = text ? (() => { try { return JSON.parse(text) } catch { return text } })() : null
  if (!response.ok) throw apiError('UNIFIED_SOCIAL_DATABASE_ERROR', payload?.message || 'FloStudio could not update the protected social configuration.', response.status === 401 || response.status === 403 ? response.status : 500, { providerStatus:response.status })
  return payload
}

async function productForUser(userId, productId, accessToken) {
  if (!productId) throw apiError('PRODUCT_REQUIRED', 'Choose a portfolio app first.')
  const params = new URLSearchParams({ select:'id,workspace_id,user_id,brand_id,name,product_url,description,offer_text,audience,source_facts,brands:brand_id(name,brand_dna)', id:`eq.${productId}`, user_id:`eq.${userId}`, limit:'1' })
  const rows = await db(accessToken, `products?${params.toString()}`)
  const product = rows?.[0]
  if (!product) throw apiError('PRODUCT_NOT_FOUND', 'FloStudio could not find that portfolio app in your workspace.', 404)
  return product
}

function sourceContext(product) {
  const facts = product.source_facts || {}
  const metadata = facts.storeMetadata || {}
  const reviews = Array.isArray(metadata.reviews) ? metadata.reviews.slice(0, 12) : []
  return {
    productName:product.name,
    category:facts.category || metadata.genre || '',
    description:product.description || metadata.description || '',
    offer:product.offer_text || '',
    audience:product.audience || '',
    brandDna:product.brands?.brand_dna || {},
    sourceUrl:product.product_url || facts.sourceUrl || '',
    store:{ subtitle:metadata.subtitle || facts.subtitle || '', keywords:metadata.keywords || facts.keywords || [], rating:metadata.averageUserRating || facts.rating || null, ratingCount:metadata.userRatingCount || facts.ratingCount || null, whatsNew:metadata.whatsNew || '', screenshots:facts.screenshots || [] },
    reviewThemes:reviews.map(review => ({ rating:review.rating || null, title:review.title || '', body:String(review.body || '').slice(0, 280) })),
    assetHints:{ artwork:facts.image || facts.artworkUrl || '', screenshots:facts.screenshots || facts.screenshotUrls || [] },
  }
}

async function profileFor(userId, accessToken) {
  const params = new URLSearchParams({ select:'*', user_id:`eq.${userId}`, provider:'eq.ayrshare', limit:'1' })
  const rows = await db(accessToken, `unified_social_profiles?${params.toString()}`)
  return rows?.[0] || null
}

async function providerRequest(path, setup, { method='GET', body, profileKey } = {}) {
  const headers = { Authorization:`Bearer ${setup.apiKey}`, 'Content-Type':'application/json' }
  if (profileKey) headers['Profile-Key'] = profileKey
  if (process.env.AYRSHARE_X_API_KEY && process.env.AYRSHARE_X_API_SECRET) {
    headers['X-Twitter-OAuth1-Api-Key'] = process.env.AYRSHARE_X_API_KEY
    headers['X-Twitter-OAuth1-Api-Secret'] = process.env.AYRSHARE_X_API_SECRET
  }
  const response = await fetch(`${PROVIDER_BASE}${path}`, { method, headers, ...(body ? { body:JSON.stringify(body) } : {}) })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.status === 'error') throw apiError('UNIFIED_SOCIAL_PROVIDER_ERROR', payload?.message || 'The social provider could not complete this request.', 422, { providerCode:payload?.code || null })
  return payload
}

async function ensureProfile(user, workspaceId, setup, accessToken) {
  const existing = await profileFor(user.id, accessToken)
  if (existing) return existing
  if (!setup.configured) throw apiError('UNIFIED_SOCIAL_SETUP_REQUIRED', setup.requirement, 503)
  const suffix = crypto.createHash('sha256').update(user.id).digest('hex').slice(0, 10)
  const title = `FloStudio ${String(user.email || 'user').split('@')[0].replace(/[^a-z0-9]/gi, '-').slice(0, 38)}-${suffix}`
  if (setup.ownerMode) {
    const rows = await db(accessToken, 'unified_social_profiles', { method:'POST', body:{ user_id:user.id, workspace_id:workspaceId || null, provider:'ayrshare', provider_profile_id:'owner_primary', provider_ref_id:null, encrypted_profile_key:'owner_primary', profile_title:`${title} / Owner test`, status:'connection_pending' } })
    return rows?.[0]
  }
  const created = await providerRequest('/profiles', setup, { method:'POST', body:{ title, subHeader:'Connect the social accounts you want FloStudio to manage.', hideTopHeader:true } })
  if (!created?.profileKey) throw apiError('UNIFIED_SOCIAL_PROFILE_CREATE_FAILED', 'The social provider did not return a protected profile key.', 422)
  const rows = await db(accessToken, 'unified_social_profiles', { method:'POST', body:{ user_id:user.id, workspace_id:workspaceId || null, provider:'ayrshare', provider_profile_id:created.profileKey ? `profile:${suffix}` : null, provider_ref_id:created.refId || null, encrypted_profile_key:encrypt(created.profileKey), profile_title:title, status:'created' } })
  return rows?.[0]
}

function accountList(snapshot) {
  const displays = Array.isArray(snapshot?.displayNames) ? snapshot.displayNames : []
  return displays.map(item => ({
    platform:item.platform,
    providerAccountId:String(item.igId || item.id || item.userId || item.username || item.platform),
    accountName:item.displayName || item.pageName || item.username || item.platform,
    handle:item.username || null,
    profileUrl:item.profileUrl || null,
    type:item.type || null,
    image:item.userImage || null,
  })).filter(item => PLATFORMS.includes(item.platform))
}

async function syncProfile(user, setup, accessToken) {
  const profile = await profileFor(user.id, accessToken)
  if (!profile) throw apiError('UNIFIED_SOCIAL_PROFILE_REQUIRED', 'Create your FloStudio social profile before syncing connected channels.', 409)
  if (!setup.configured) return { profile, accounts:accountList(profile.account_snapshot), configured:false, requirement:setup.requirement }
  const profileKey = profile.provider_profile_id === 'owner_primary' ? null : decrypt(profile.encrypted_profile_key)
  const snapshot = await providerRequest('/user', setup, profileKey ? { profileKey } : {})
  const accounts = accountList(snapshot)
  const rows = await db(accessToken, `unified_social_profiles?id=eq.${encodeURIComponent(profile.id)}`, { method:'PATCH', body:{ status:accounts.length ? 'connected':'connection_pending', connected_platforms:Array.from(new Set(accounts.map(account => account.platform))), account_snapshot:snapshot, last_synced_at:new Date().toISOString(), last_error_code:null, last_error_message:null, updated_at:new Date().toISOString() } })
  return { profile:rows?.[0] || profile, accounts, configured:true }
}

async function mapConnectedAccountsToApp(user, productId, requestedPlatforms, accessToken) {
  if (!productId) return []
  const product = await productForUser(user.id, productId, accessToken)
  const selectedPlatforms = cleanPlatforms(requestedPlatforms)
  if (!selectedPlatforms.length) return []
  const unified = await profileFor(user.id, accessToken)
  const accounts = accountList(unified?.account_snapshot).filter(account => selectedPlatforms.includes(account.platform))
  const created = []
  for (const account of accounts) {
    const existing = await db(accessToken, `app_channel_profiles?select=*&user_id=eq.${user.id}&product_id=eq.${encodeURIComponent(product.id)}&platform=eq.${account.platform}&limit=1`)
    if (existing?.[0]) { created.push(existing[0]); continue }
    const rows = await db(accessToken, 'app_channel_profiles?on_conflict=user_id,product_id,platform', {
      method:'POST',
      prefer:'resolution=merge-duplicates,return=representation',
      body:{
        user_id:user.id,
        workspace_id:product.workspace_id || null,
        product_id:product.id,
        unified_social_profile_id:unified?.id || null,
        platform:account.platform,
        provider_account_id:account.providerAccountId,
        provider_account_name:account.accountName,
        provider_handle:account.handle || null,
        enabled:true,
        approval_mode:'review',
        tone:'',
        audience:'',
        default_cta:'',
        preferred_formats:[],
        hashtag_rules:{ count:5, avoidDuplicates:true },
        schedule_preferences:{},
        updated_at:new Date().toISOString(),
      },
    })
    if (rows?.[0]) created.push(rows[0])
  }
  return created
}

async function appConfig(user, productId, accessToken) {
  const product = await productForUser(user.id, productId, accessToken)
  const [agentRows, channelRows] = await Promise.all([
    db(accessToken, `app_brand_agents?select=*&user_id=eq.${user.id}&product_id=eq.${encodeURIComponent(product.id)}&limit=1`),
    db(accessToken, `app_channel_profiles?select=*&user_id=eq.${user.id}&product_id=eq.${encodeURIComponent(product.id)}&order=platform.asc`),
  ])
  return { product, context:sourceContext(product), agent:agentRows?.[0] || null, channels:channelRows || [] }
}

function cleanPlatforms(value) {
  return Array.from(new Set((Array.isArray(value) ? value : []).filter(platform => PLATFORMS.includes(platform))))
}

async function saveBrandAgent(user, body, accessToken) {
  const product = await productForUser(user.id, body.productId, accessToken)
  const context = sourceContext(product)
  const values = body.agent || {}
  const payload = {
    user_id:user.id,
    workspace_id:product.workspace_id || body.workspaceId || null,
    product_id:product.id,
    agent_name:String(values.agentName || `${product.name} Brand Agent`).slice(0, 140),
    brand_voice:String(values.brandVoice || context.brandDna?.voice || '').slice(0, 400),
    primary_audience:String(values.primaryAudience || context.audience || '').slice(0, 500),
    value_propositions:Array.isArray(values.valuePropositions) ? values.valuePropositions.map(value => String(value).slice(0, 260)).slice(0, 12) : [],
    proof_points:Array.isArray(values.proofPoints) ? values.proofPoints.map(value => String(value).slice(0, 260)).slice(0, 12) : [],
    approved_topics:Array.isArray(values.approvedTopics) ? values.approvedTopics.map(value => String(value).slice(0, 160)).slice(0, 20) : [],
    prohibited_claims:Array.isArray(values.prohibitedClaims) ? values.prohibitedClaims.map(value => String(value).slice(0, 200)).slice(0, 20) : [],
    default_hashtags:Array.isArray(values.defaultHashtags) ? values.defaultHashtags.map(value => String(value).replace(/^#/, '').slice(0, 80)).slice(0, 30) : [],
    source_snapshot:context,
    learned_at:new Date().toISOString(),
    updated_at:new Date().toISOString(),
  }
  const rows = await db(accessToken, 'app_brand_agents?on_conflict=user_id,product_id', { method:'POST', prefer:'resolution=merge-duplicates,return=representation', body:payload })
  return { agent:rows?.[0], context }
}

async function saveChannelProfile(user, body, accessToken) {
  const product = await productForUser(user.id, body.productId, accessToken)
  const platform = String(body.channel?.platform || '')
  if (!PLATFORMS.includes(platform)) throw apiError('UNIFIED_SOCIAL_PLATFORM_INVALID', 'Choose a supported unified social platform.')
  const unified = await profileFor(user.id, accessToken)
  const channel = body.channel || {}
  const payload = {
    user_id:user.id,
    workspace_id:product.workspace_id || body.workspaceId || null,
    product_id:product.id,
    unified_social_profile_id:unified?.id || null,
    platform,
    provider_account_id:channel.providerAccountId || null,
    provider_account_name:channel.providerAccountName || null,
    provider_handle:channel.providerHandle || null,
    enabled:Boolean(channel.enabled),
    approval_mode:['review','scheduled_draft','approved_rule'].includes(channel.approvalMode) ? channel.approvalMode : 'review',
    tone:String(channel.tone || '').slice(0, 260),
    audience:String(channel.audience || '').slice(0, 400),
    default_cta:String(channel.defaultCta || '').slice(0, 260),
    preferred_formats:Array.isArray(channel.preferredFormats) ? channel.preferredFormats.map(item => String(item).slice(0, 80)).slice(0, 12) : [],
    hashtag_rules:channel.hashtagRules && typeof channel.hashtagRules === 'object' ? channel.hashtagRules : {},
    schedule_preferences:channel.schedulePreferences && typeof channel.schedulePreferences === 'object' ? channel.schedulePreferences : {},
    updated_at:new Date().toISOString(),
  }
  const rows = await db(accessToken, 'app_channel_profiles?on_conflict=user_id,product_id,platform', { method:'POST', prefer:'resolution=merge-duplicates,return=representation', body:payload })
  return { channel:rows?.[0] }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error:'Method not allowed' })
  }
  try {
    const body = bodyOf(req)
    const { user, accessToken } = await authenticatedUser(req)
    const setup = providerSetup()
    if (body.action === 'status') {
      const profile = await profileFor(user.id, accessToken)
      return res.status(200).json({ configured:setup.configured, connectionConfigured:setup.connectionConfigured, ownerMode:setup.ownerMode, requirement:setup.requirement, profile:profile ? { id:profile.id, title:profile.profile_title, status:profile.status, connectedPlatforms:profile.connected_platforms || [], lastSyncedAt:profile.last_synced_at } : null, accounts:profile ? accountList(profile.account_snapshot) : [] })
    }
    if (body.action === 'begin_connect') {
      if (body.productId) await productForUser(user.id, body.productId, accessToken)
      const profile = await ensureProfile(user, body.workspaceId, setup, accessToken)
      if (!setup.configured) throw apiError('UNIFIED_SOCIAL_SETUP_REQUIRED', setup.requirement, 503)
      const requested = cleanPlatforms(body.allowedSocial)
      await db(accessToken, `unified_social_profiles?id=eq.${encodeURIComponent(profile.id)}`, { method:'PATCH', body:{ status:'connection_pending', updated_at:new Date().toISOString() } })
      if (setup.ownerMode) {
        return res.status(200).json({ authorizationUrl:'https://app.ayrshare.com/social-accounts', ownerManaged:true, requestedPlatforms:requested, productId:body.productId || null, profile:{ id:profile.id, title:profile.profile_title } })
      }
      const payload = { domain:setup.domain, privateKey:setup.privateKey, profileKey:decrypt(profile.encrypted_profile_key), allowedSocial:requested.length ? requested : PLATFORMS, redirect:`${String(process.env.PUBLIC_APP_URL || 'https://www.flostudio.io').replace(/\/$/, '')}/accounts?unifiedConnected=1`, expiresIn:10 }
      const linked = await providerRequest('/profiles/generateJWT', setup, { method:'POST', body:payload })
      return res.status(200).json({ authorizationUrl:linked.url, expiresIn:linked.expiresIn || '10m', requestedPlatforms:requested, productId:body.productId || null, profile:{ id:profile.id, title:profile.profile_title } })
    }
    if (body.action === 'sync') {
      const result = await syncProfile(user, setup, accessToken)
      const appChannels = await mapConnectedAccountsToApp(user, body.productId, body.requestedPlatforms, accessToken)
      return res.status(200).json({ ...result, appChannels })
    }
    if (body.action === 'app_config') return res.status(200).json(await appConfig(user, body.productId, accessToken))
    if (body.action === 'save_brand_agent') return res.status(200).json(await saveBrandAgent(user, body, accessToken))
    if (body.action === 'save_channel') return res.status(200).json(await saveChannelProfile(user, body, accessToken))
    throw apiError('UNIFIED_SOCIAL_ACTION_UNKNOWN', 'Choose a supported unified social action.')
  } catch (error) {
    return sendError(res, error)
  }
}
