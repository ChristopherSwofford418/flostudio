import crypto from 'crypto'

export const config = { maxDuration: 30 }

const SUPABASE_URL = 'https://jtogllurcrxxaguoxeus.supabase.co'
const SUPPORTED = ['facebook', 'instagram', 'linkedin', 'tiktok', 'twitter']
const CALLBACK_PATH = '/api/social-connect?callback=1'

const PLATFORM = {
  facebook: {
    label: 'Facebook Pages',
    setup: 'Facebook Login for Business, Meta App Review for the required Page permissions, and a selected Page destination.',
  },
  instagram: {
    label: 'Instagram Professional',
    setup: 'A Meta app, an eligible Instagram Professional account, Meta review where required, and a selected publishing destination.',
  },
  linkedin: {
    label: 'LinkedIn',
    setup: 'LinkedIn OAuth with the Share on LinkedIn product and the w_member_social publishing scope.',
  },
  tiktok: {
    label: 'TikTok',
    setup: 'TikTok Login Kit, Content Posting API approval, the video.publish scope, and an approved app audit for public Direct Post visibility.',
  },
  twitter: {
    label: 'X',
    setup: 'An approved X developer app, OAuth 2.0 authorization-code flow with PKCE, and tweet.write / users.read scopes.',
  },
}

function origin() {
  return String(process.env.PUBLIC_APP_URL || process.env.VERCEL_URL || 'https://www.flostudio.io').startsWith('http')
    ? String(process.env.PUBLIC_APP_URL || process.env.VERCEL_URL || 'https://www.flostudio.io').replace(/\/$/, '')
    : `https://${String(process.env.VERCEL_URL).replace(/\/$/, '')}`
}

function callbackUrl() {
  return `${origin()}${CALLBACK_PATH}`
}

function parseBody(req) {
  if (!req.body) return {}
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body) } catch { return {} }
  }
  return req.body
}

function required(value, label) {
  if (!value) throw apiError('FLOSTUDIO_SERVER_CONFIGURATION_MISSING', `${label} is not configured in FloStudio production.`, 503)
  return value
}

function apiError(code, message, status = 400, details = {}) {
  const error = new Error(message)
  error.code = code
  error.status = status
  error.details = details
  return error
}

function sendError(res, error) {
  const status = error?.status || 500
  return res.status(status).json({
    error: error?.message || 'FloStudio could not complete this social-channel request.',
    code: error?.code || 'SOCIAL_CHANNEL_ERROR',
    ...(error?.details || {}),
  })
}

function secretKey() {
  const raw = required(process.env.SOCIAL_CREDENTIALS_ENCRYPTION_KEY, 'SOCIAL_CREDENTIALS_ENCRYPTION_KEY')
  if (/^[A-Za-z0-9+/]{43}=$/.test(raw)) return Buffer.from(raw, 'base64')
  return crypto.createHash('sha256').update(raw).digest()
}

function encrypt(payload) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()])
  return { version: 1, algorithm: 'aes-256-gcm', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') }
}

function decrypt(envelope) {
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(envelope.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
    const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()])
    return JSON.parse(plaintext.toString('utf8'))
  } catch {
    throw apiError('SOCIAL_CREDENTIAL_DECRYPTION_FAILED', 'FloStudio could not read the secured channel credential. Reconnect the channel to continue.', 409)
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function randomUrlSafe(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url')
}

function providerConfig(platform) {
  const serviceReady = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SOCIAL_CREDENTIALS_ENCRYPTION_KEY)
  const configs = {
    facebook: { configured: Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET && serviceReady), appId: process.env.FACEBOOK_APP_ID, appSecret: process.env.FACEBOOK_APP_SECRET, graphVersion: process.env.META_GRAPH_VERSION || 'v23.0' },
    instagram: { configured: Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET && serviceReady), appId: process.env.FACEBOOK_APP_ID, appSecret: process.env.FACEBOOK_APP_SECRET, graphVersion: process.env.META_GRAPH_VERSION || 'v23.0' },
    linkedin: { configured: Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET && serviceReady), clientId: process.env.LINKEDIN_CLIENT_ID, clientSecret: process.env.LINKEDIN_CLIENT_SECRET },
    tiktok: { configured: Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET && serviceReady), clientKey: process.env.TIKTOK_CLIENT_KEY, clientSecret: process.env.TIKTOK_CLIENT_SECRET },
    twitter: { configured: Boolean(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET && serviceReady), clientId: process.env.X_CLIENT_ID, clientSecret: process.env.X_CLIENT_SECRET },
  }
  return configs[platform]
}

function assertProviderConfigured(platform) {
  const config = providerConfig(platform)
  if (!config?.configured) {
    throw apiError('SOCIAL_PROVIDER_NOT_CONFIGURED', `${PLATFORM[platform].label} cannot start authorization until its provider credentials and FloStudio credential vault are configured.`, 503, {
      platform,
      requirement: PLATFORM[platform].setup,
    })
  }
  return config
}

async function db(path, { method = 'GET', body, prefer = 'return=representation' } = {}) {
  const key = required(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY')
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: prefer,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const text = await response.text()
  const payload = text ? (() => { try { return JSON.parse(text) } catch { return text } })() : null
  if (!response.ok) throw apiError('SOCIAL_DATABASE_ERROR', 'FloStudio could not update the protected social connection record.', 500, { providerStatus: response.status })
  return payload
}

async function authenticatedUser(req) {
  const authorization = req.headers.authorization || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!token) throw apiError('AUTH_REQUIRED', 'Sign in to FloStudio before managing channel connections.', 401)
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: required(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY') },
  })
  const user = await response.json().catch(() => null)
  if (!response.ok || !user?.id) throw apiError('AUTH_REQUIRED', 'Your FloStudio session has expired. Sign in again and retry.', 401)
  return user
}

function redirect(res, url) {
  res.writeHead(302, { Location: url })
  res.end()
}

function safeReturn(platform, key, value) {
  const url = new URL('/accounts', origin())
  url.searchParams.set('platform', platform)
  url.searchParams.set(key, value)
  return url.toString()
}

function authorizationUrl(platform, config, state, codeVerifier) {
  const redirectUri = callbackUrl()
  if (platform === 'facebook' || platform === 'instagram') {
    const url = new URL(`https://www.facebook.com/${config.graphVersion}/dialog/oauth`)
    url.search = new URLSearchParams({
      client_id: config.appId,
      redirect_uri: redirectUri,
      response_type: 'code',
      state,
      scope: 'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish',
    }).toString()
    return url.toString()
  }
  if (platform === 'linkedin') {
    const url = new URL('https://www.linkedin.com/oauth/v2/authorization')
    url.search = new URLSearchParams({ response_type: 'code', client_id: config.clientId, redirect_uri: redirectUri, state, scope: 'openid profile w_member_social' }).toString()
    return url.toString()
  }
  if (platform === 'tiktok') {
    const url = new URL('https://www.tiktok.com/v2/auth/authorize/')
    url.search = new URLSearchParams({ client_key: config.clientKey, response_type: 'code', scope: 'user.info.basic,video.publish', redirect_uri: redirectUri, state }).toString()
    return url.toString()
  }
  const challenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')
  const url = new URL('https://x.com/i/oauth2/authorize')
  url.search = new URLSearchParams({ response_type: 'code', client_id: config.clientId, redirect_uri: redirectUri, scope: 'tweet.read tweet.write users.read offline.access', state, code_challenge: challenge, code_challenge_method: 'S256' }).toString()
  return url.toString()
}

async function findOAuthState({ stateHash, id, userId }) {
  const filters = new URLSearchParams({ select: '*', ...(stateHash ? { state_hash: `eq.${stateHash}` } : {}), ...(id ? { id: `eq.${id}` } : {}), ...(userId ? { user_id: `eq.${userId}` } : {}), limit: '1' })
  const rows = await db(`social_oauth_states?${filters.toString()}`)
  return Array.isArray(rows) ? rows[0] : null
}

async function updateOAuthState(id, body) {
  return db(`social_oauth_states?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body })
}

async function getConnection(userId, platform) {
  const query = new URLSearchParams({ select: 'id,user_id,workspace_id,platform,account_name,account_handle,provider_account_id,account_type,provider_page_id,granted_scopes,status,expires_at,last_verified_at,last_error_code', user_id: `eq.${userId}`, platform: `eq.${platform}`, order: 'created_at.desc', limit: '1' })
  const rows = await db(`connected_accounts?${query.toString()}`)
  return Array.isArray(rows) ? rows[0] : null
}

async function writeConnection({ userId, workspaceId, platform, destination, credentials }) {
  const existingQuery = new URLSearchParams({ select: 'id', user_id: `eq.${userId}`, platform: `eq.${platform}`, provider_account_id: `eq.${destination.providerAccountId}`, limit: '1' })
  const existingRows = await db(`connected_accounts?${existingQuery.toString()}`)
  const base = {
    user_id: userId,
    workspace_id: workspaceId || null,
    platform,
    account_name: destination.accountName,
    account_handle: destination.accountHandle || null,
    provider_account_id: destination.providerAccountId,
    provider_page_id: destination.providerPageId || null,
    account_type: destination.accountType || 'profile',
    granted_scopes: destination.grantedScopes || [],
    status: 'connected',
    expires_at: destination.expiresAt || null,
    last_verified_at: new Date().toISOString(),
    last_error_code: null,
    updated_at: new Date().toISOString(),
  }
  const connected = existingRows?.[0]
    ? (await db(`connected_accounts?id=eq.${encodeURIComponent(existingRows[0].id)}`, { method: 'PATCH', body: base }))[0]
    : (await db('connected_accounts', { method: 'POST', body: base }))[0]
  const credentialBody = {
    connected_account_id: connected.id,
    encrypted_payload: encrypt(credentials),
    token_expires_at: destination.expiresAt || null,
    refresh_expires_at: destination.refreshExpiresAt || null,
    updated_at: new Date().toISOString(),
  }
  const existingCredential = await db(`social_credentials?select=id&connected_account_id=eq.${encodeURIComponent(connected.id)}&limit=1`)
  if (existingCredential?.[0]) await db(`social_credentials?id=eq.${encodeURIComponent(existingCredential[0].id)}`, { method: 'PATCH', body: credentialBody })
  else await db('social_credentials', { method: 'POST', body: credentialBody })
  return connected
}

async function exchangeMeta(platform, config, code) {
  const tokenUrl = new URL(`https://graph.facebook.com/${config.graphVersion}/oauth/access_token`)
  tokenUrl.search = new URLSearchParams({ client_id: config.appId, client_secret: config.appSecret, redirect_uri: callbackUrl(), code }).toString()
  const tokenResponse = await fetch(tokenUrl)
  const token = await tokenResponse.json().catch(() => ({}))
  if (!tokenResponse.ok || !token.access_token) throw apiError('META_TOKEN_EXCHANGE_FAILED', 'Meta did not return an authorization token. Confirm the exact callback URL and App ID in Meta for Developers.', 422)
  const pagesResponse = await fetch(`https://graph.facebook.com/${config.graphVersion}/me/accounts?fields=id,name,access_token,tasks,instagram_business_account{id,username,name}&access_token=${encodeURIComponent(token.access_token)}`)
  const pagesPayload = await pagesResponse.json().catch(() => ({}))
  if (!pagesResponse.ok) throw apiError('META_PAGE_DISCOVERY_FAILED', 'Meta authorized the user but FloStudio could not retrieve eligible Page destinations. Confirm Page permissions and user Page access.', 422)
  const candidates = (pagesPayload.data || []).flatMap(page => {
    if (platform === 'facebook') return [{ id: `facebook:${page.id}`, providerAccountId: page.id, providerPageId: page.id, accountName: page.name, accountHandle: null, accountType: 'page', grantedScopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'], credential: { access_token: page.access_token, provider: 'meta', provider_user_token: token.access_token } }]
    const instagram = page.instagram_business_account
    if (!instagram?.id) return []
    return [{ id: `instagram:${instagram.id}`, providerAccountId: instagram.id, providerPageId: page.id, accountName: instagram.name || page.name, accountHandle: instagram.username || null, accountType: 'professional', grantedScopes: ['instagram_basic', 'instagram_content_publish'], credential: { access_token: page.access_token, provider: 'meta', provider_user_token: token.access_token } }]
  })
  if (!candidates.length) throw apiError('META_NO_ELIGIBLE_DESTINATION', platform === 'facebook' ? 'Meta did not return a Facebook Page that this person can publish to.' : 'Meta did not return an Instagram Professional account linked to an eligible Page.', 422)
  return candidates
}

async function exchangeLinkedIn(config, code) {
  const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: callbackUrl(), client_id: config.clientId, client_secret: config.clientSecret }) })
  const token = await tokenResponse.json().catch(() => ({}))
  if (!tokenResponse.ok || !token.access_token) throw apiError('LINKEDIN_TOKEN_EXCHANGE_FAILED', 'LinkedIn did not return an authorization token. Check the app callback URL and enabled Share on LinkedIn product.', 422)
  const profileResponse = await fetch('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${token.access_token}` } })
  const profile = await profileResponse.json().catch(() => ({}))
  if (!profileResponse.ok || !profile.sub) throw apiError('LINKEDIN_PROFILE_LOOKUP_FAILED', 'LinkedIn authorized the app but FloStudio could not identify the member account.', 422)
  return { destination: { providerAccountId: profile.sub, accountName: profile.name || profile.given_name || 'LinkedIn member', accountHandle: null, accountType: 'member', grantedScopes: ['w_member_social'], expiresAt: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString() : null }, credentials: { access_token: token.access_token, refresh_token: token.refresh_token || null, provider: 'linkedin' } }
}

async function exchangeTikTok(config, code) {
  const tokenResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_key: config.clientKey, client_secret: config.clientSecret, code, grant_type: 'authorization_code', redirect_uri: callbackUrl() }) })
  const token = await tokenResponse.json().catch(() => ({}))
  if (!tokenResponse.ok || !token.access_token) throw apiError('TIKTOK_TOKEN_EXCHANGE_FAILED', 'TikTok did not return an authorization token. Check the configured callback URL and requested scopes.', 422)
  const profileResponse = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url', { headers: { Authorization: `Bearer ${token.access_token}` } })
  const profilePayload = await profileResponse.json().catch(() => ({}))
  const profile = profilePayload.data?.user || profilePayload.data || {}
  const openId = profile.open_id || token.open_id
  if (!profileResponse.ok || !openId) throw apiError('TIKTOK_PROFILE_LOOKUP_FAILED', 'TikTok authorized the app but FloStudio could not identify the creator account.', 422)
  return { destination: { providerAccountId: openId, accountName: profile.display_name || 'TikTok creator', accountHandle: null, accountType: 'creator', grantedScopes: ['video.publish'], expiresAt: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString() : null, refreshExpiresAt: token.refresh_expires_in ? new Date(Date.now() + Number(token.refresh_expires_in) * 1000).toISOString() : null }, credentials: { access_token: token.access_token, refresh_token: token.refresh_token || null, open_id: openId, provider: 'tiktok' } }
}

async function exchangeX(config, code, codeVerifier) {
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
  const tokenResponse = await fetch('https://api.x.com/2/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` }, body: new URLSearchParams({ code, grant_type: 'authorization_code', redirect_uri: callbackUrl(), client_id: config.clientId, code_verifier: codeVerifier }) })
  const token = await tokenResponse.json().catch(() => ({}))
  if (!tokenResponse.ok || !token.access_token) throw apiError('X_TOKEN_EXCHANGE_FAILED', 'X did not return an authorization token. Confirm the exact callback URL, OAuth 2.0 app type, and PKCE settings.', 422)
  const profileResponse = await fetch('https://api.x.com/2/users/me?user.fields=username,name', { headers: { Authorization: `Bearer ${token.access_token}` } })
  const profilePayload = await profileResponse.json().catch(() => ({}))
  const profile = profilePayload.data || {}
  if (!profileResponse.ok || !profile.id) throw apiError('X_PROFILE_LOOKUP_FAILED', 'X authorized the app but FloStudio could not identify the X account.', 422)
  return { destination: { providerAccountId: profile.id, accountName: profile.name || 'X account', accountHandle: profile.username ? `@${profile.username}` : null, accountType: 'profile', grantedScopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'], expiresAt: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString() : null }, credentials: { access_token: token.access_token, refresh_token: token.refresh_token || null, provider: 'x' } }
}

async function handleCallback(req, res) {
  const { state, code, error, error_description: errorDescription } = req.query || {}
  if (!state) return redirect(res, safeReturn('unknown', 'channelError', 'missing_state'))
  let row
  try {
    row = await findOAuthState({ stateHash: sha256(state) })
    if (!row || new Date(row.expires_at).getTime() < Date.now()) throw apiError('OAUTH_STATE_EXPIRED', 'This authorization session expired. Return to FloStudio and start the connection again.', 409)
    if (error) throw apiError('OAUTH_DENIED', errorDescription || 'The provider authorization was not completed.', 422)
    if (!code) throw apiError('OAUTH_CODE_MISSING', 'The provider did not return an authorization code.', 422)
    const config = assertProviderConfigured(row.platform)
    if (row.platform === 'facebook' || row.platform === 'instagram') {
      const candidates = await exchangeMeta(row.platform, config, code)
      await updateOAuthState(row.id, { status: 'awaiting_selection', provider_payload: { encrypted_candidates: encrypt(candidates) }, updated_at: new Date().toISOString() })
      const url = new URL('/accounts', origin())
      url.searchParams.set('platform', row.platform)
      url.searchParams.set('oauth', row.id)
      return redirect(res, url.toString())
    }
    const exchange = row.platform === 'linkedin'
      ? await exchangeLinkedIn(config, code)
      : row.platform === 'tiktok'
        ? await exchangeTikTok(config, code)
        : await exchangeX(config, code, row.code_verifier)
    await writeConnection({ userId: row.user_id, workspaceId: row.workspace_id, platform: row.platform, destination: exchange.destination, credentials: exchange.credentials })
    await updateOAuthState(row.id, { status: 'complete', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    return redirect(res, safeReturn(row.platform, 'connected', '1'))
  } catch (callbackError) {
    if (row?.id) await updateOAuthState(row.id, { status: 'failed', provider_payload: { error_code: callbackError.code || 'OAUTH_CALLBACK_FAILED' }, updated_at: new Date().toISOString() }).catch(() => null)
    return redirect(res, safeReturn(row?.platform || 'unknown', 'channelError', callbackError.code || 'authorization_failed'))
  }
}

async function createPublishAttempt(user, post, connection) {
  const rows = await db('social_publish_attempts', { method: 'POST', body: {
    user_id: user.id,
    workspace_id: post.workspace_id || connection.workspace_id || null,
    campaign_post_id: post.id,
    connected_account_id: connection.id,
    platform: post.platform,
    status: 'publishing',
    request_snapshot: { content: post.content, scheduled_at: post.scheduled_at || null },
    started_at: new Date().toISOString(),
  } })
  return rows[0]
}

async function credentialsFor(connectionId) {
  const rows = await db(`social_credentials?select=encrypted_payload&connected_account_id=eq.${encodeURIComponent(connectionId)}&limit=1`)
  if (!rows?.[0]?.encrypted_payload) throw apiError('SOCIAL_CREDENTIAL_MISSING', 'FloStudio cannot find the secured channel credential. Reconnect the channel before publishing.', 409)
  return decrypt(rows[0].encrypted_payload)
}

async function publishToProvider(platform, connection, credential, post) {
  if (platform === 'facebook') {
    const config = assertProviderConfigured('facebook')
    const response = await fetch(`https://graph.facebook.com/${config.graphVersion}/${connection.provider_account_id}/feed`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ message: post.content, access_token: credential.access_token }) })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload.id) throw apiError('FACEBOOK_PUBLISH_FAILED', payload.error?.message || 'Facebook Pages did not accept this post.', 422)
    return { id: payload.id, url: `https://www.facebook.com/${payload.id}`, payload }
  }
  if (platform === 'twitter') {
    const response = await fetch('https://api.x.com/2/tweets', { method: 'POST', headers: { Authorization: `Bearer ${credential.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: post.content }) })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload.data?.id) throw apiError('X_PUBLISH_FAILED', payload.detail || 'X did not accept this post.', 422)
    return { id: payload.data.id, url: `https://x.com/i/web/status/${payload.data.id}`, payload }
  }
  if (platform === 'linkedin') {
    const response = await fetch('https://api.linkedin.com/v2/ugcPosts', { method: 'POST', headers: { Authorization: `Bearer ${credential.access_token}`, 'Content-Type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0' }, body: JSON.stringify({ author: `urn:li:person:${connection.provider_account_id}`, lifecycleState: 'PUBLISHED', specificContent: { 'com.linkedin.ugc.ShareContent': { shareCommentary: { text: post.content }, shareMediaCategory: 'NONE' } }, visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' } }) })
    const payload = await response.json().catch(() => ({}))
    const id = response.headers.get('x-restli-id')
    if (!response.ok || !id) throw apiError('LINKEDIN_PUBLISH_FAILED', payload.message || 'LinkedIn did not accept this post.', 422)
    return { id, url: null, payload: { id } }
  }
  if (platform === 'instagram') throw apiError('INSTAGRAM_MEDIA_REQUIRED', 'Instagram publishing needs a public image or video asset so FloStudio can create and publish the required media container. Attach a Creative Lab asset before publishing.', 422)
  throw apiError('TIKTOK_MEDIA_REQUIRED', 'TikTok Direct Post needs a prepared video asset and the Content Posting API media initialization flow. Attach a Creative Lab video before publishing.', 422)
}

async function publishApprovedPost(user, campaignPostId) {
  const postRows = await db(`campaign_posts?select=*&id=eq.${encodeURIComponent(campaignPostId)}&user_id=eq.${encodeURIComponent(user.id)}&limit=1`)
  const post = postRows?.[0]
  if (!post) throw apiError('POST_NOT_FOUND', 'FloStudio could not find a campaign post that belongs to this workspace.', 404)
  if (post.status !== 'approved') throw apiError('POST_NOT_APPROVED', 'Approve this post in Review Queue before sending it to a social channel.', 409)
  const connection = await getConnection(user.id, post.platform)
  if (!connection || connection.status !== 'connected') throw apiError('CHANNEL_NOT_CONNECTED', `Connect a verified ${PLATFORM[post.platform]?.label || post.platform} destination before publishing this approved post.`, 409)
  if (connection.expires_at && new Date(connection.expires_at).getTime() <= Date.now()) throw apiError('CHANNEL_REAUTH_REQUIRED', `${PLATFORM[post.platform].label} authorization expired. Reconnect the channel before publishing.`, 409)
  const attempt = await createPublishAttempt(user, post, connection)
  try {
    const result = await publishToProvider(post.platform, connection, await credentialsFor(connection.id), post)
    await db(`social_publish_attempts?id=eq.${encodeURIComponent(attempt.id)}`, { method: 'PATCH', body: { status: 'published', provider_post_id: result.id, provider_post_url: result.url, provider_response: result.payload, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() } })
    await db(`campaign_posts?id=eq.${encodeURIComponent(post.id)}`, { method: 'PATCH', body: { status: 'published', published_at: new Date().toISOString(), provider_post_id: result.id, provider_post_url: result.url } })
    return { postId: post.id, platform: post.platform, providerPostId: result.id, providerPostUrl: result.url }
  } catch (publishError) {
    const needsReauth = ['SOCIAL_CREDENTIAL_DECRYPTION_FAILED', 'CHANNEL_REAUTH_REQUIRED'].includes(publishError.code)
    await db(`social_publish_attempts?id=eq.${encodeURIComponent(attempt.id)}`, { method: 'PATCH', body: { status: needsReauth ? 'needs_reauthorization' : 'failed', error_code: publishError.code || 'PUBLISH_FAILED', error_message: publishError.message, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() } }).catch(() => null)
    throw publishError
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET' && req.query?.callback === '1') return handleCallback(req, res)
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST'])
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` })
  }
  try {
    const body = parseBody(req)
    const { platform, action } = body
    if (!SUPPORTED.includes(platform)) throw apiError('SOCIAL_PLATFORM_INVALID', 'Choose a supported social platform.')
    const user = await authenticatedUser(req)
    if (action === 'status') {
      const connection = await getConnection(user.id, platform)
      const config = providerConfig(platform)
      const expired = connection?.expires_at && new Date(connection.expires_at).getTime() <= Date.now()
      return res.status(200).json({ platform, configured: Boolean(config?.configured), status: connection ? (expired ? 'needs_reauthorization' : connection.status) : 'not_connected', live: Boolean(connection && !expired && connection.status === 'connected'), connection: connection ? { id: connection.id, accountName: connection.account_name, accountHandle: connection.account_handle, accountType: connection.account_type, expiresAt: connection.expires_at, lastVerifiedAt: connection.last_verified_at } : null, requirement: PLATFORM[platform].setup })
    }
    if (action === 'connect') {
      const config = assertProviderConfigured(platform)
      const rawState = randomUrlSafe(32)
      const codeVerifier = platform === 'twitter' ? randomUrlSafe(48) : null
      const rows = await db('social_oauth_states', { method: 'POST', body: { user_id: user.id, workspace_id: body.workspaceId || null, platform, state_hash: sha256(rawState), code_verifier: codeVerifier, expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() } })
      return res.status(200).json({ platform, authorizationUrl: authorizationUrl(platform, config, rawState, codeVerifier), oauthStateId: rows[0].id })
    }
    if (action === 'pending_destinations') {
      const state = await findOAuthState({ id: body.oauthStateId, userId: user.id })
      if (!state || state.status !== 'awaiting_selection' || new Date(state.expires_at).getTime() < Date.now()) throw apiError('OAUTH_DESTINATION_SELECTION_EXPIRED', 'This destination selection expired. Start the connection again.', 409)
      const candidates = decrypt(state.provider_payload?.encrypted_candidates || {})
      return res.status(200).json({ platform, oauthStateId: state.id, destinations: candidates.map(({ credential, ...destination }) => destination) })
    }
    if (action === 'select_destination') {
      const state = await findOAuthState({ id: body.oauthStateId, userId: user.id })
      if (!state || state.platform !== platform || state.status !== 'awaiting_selection') throw apiError('OAUTH_DESTINATION_SELECTION_INVALID', 'This provider destination selection is no longer active. Start the connection again.', 409)
      const candidates = decrypt(state.provider_payload?.encrypted_candidates || {})
      const destination = candidates.find(candidate => candidate.id === body.destinationId)
      if (!destination) throw apiError('OAUTH_DESTINATION_NOT_FOUND', 'Choose an eligible destination returned by the provider.', 404)
      const connection = await writeConnection({ userId: user.id, workspaceId: state.workspace_id, platform, destination, credentials: destination.credential })
      await updateOAuthState(state.id, { status: 'complete', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      return res.status(200).json({ platform, status: 'connected', live: true, connection: { id: connection.id, accountName: connection.account_name, accountHandle: connection.account_handle } })
    }
    if (action === 'disconnect') {
      const connection = await getConnection(user.id, platform)
      if (connection) await db(`connected_accounts?id=eq.${encodeURIComponent(connection.id)}&user_id=eq.${encodeURIComponent(user.id)}`, { method: 'DELETE', prefer: 'return=minimal' })
      return res.status(200).json({ platform, status: 'not_connected', live: false })
    }
    if (action === 'publish') return res.status(200).json({ status: 'published', ...(await publishApprovedPost(user, body.campaignPostId)) })
    throw apiError('SOCIAL_ACTION_UNKNOWN', 'Choose a supported social-channel action.')
  } catch (error) {
    return sendError(res, error)
  }
}
