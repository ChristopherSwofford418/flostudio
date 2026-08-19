# FloStudio Social Channel Architecture

## Product decision

FloStudio will use an event-driven, server-side authorization architecture. A user begins authorization in the Channels page, the relevant provider redirects to a FloStudio callback, and the callback exchanges the authorization code on the server. This is a durable SaaS implementation rather than a browser token paste, fake connection, or client-side secret exchange.

The first implementation provides live OAuth entry points for Meta, LinkedIn, TikTok, and X whenever their app credentials are present. It supports destination selection for Meta Pages and Instagram Professional accounts, where one authorizing Facebook identity can expose multiple eligible publishing destinations. It uses the approved review queue as the only source of a manual publish attempt.

## Trust boundaries

| Boundary | Allowed data | Prohibited data |
|---|---|---|
| Browser | Public account name, platform, connection state, error category, remote post ID and URL | Access tokens, refresh tokens, app secrets, OAuth code verifier, raw provider diagnostics containing credentials |
| FloStudio server routes | OAuth code, state hash, PKCE verifier, provider credentials, encrypted access and refresh tokens | Direct unauthenticated writes; a successful local-only publish marker |
| Public connection record | User/workspace ownership, destination ID, display metadata, scopes, expiration, status | Raw or encrypted credential material |
| Private credential record | Encrypted credential envelope and rotation metadata | Browser-readable RLS policies |

## Data model

| Record | Purpose | Lifecycle |
|---|---|---|
| `social_oauth_states` | One-time, expiring OAuth initiation state. Carries the initiating FloStudio user, platform, PKCE verifier and encrypted temporary provider result while a Page/Instagram selection is outstanding. | Created at authorization start; marked complete/failed/expired after callback. |
| `connected_accounts` | Browser-safe destination metadata. A connection is a concrete Facebook Page, Instagram Professional account, LinkedIn member, TikTok creator, or X account—not just a provider login. | Active, reauthorization required, disconnected, or configuration error. |
| `social_credentials` | Service-only credential vault linked one-to-one with a connected account. The API encrypts its token envelope before writing. | Created after account selection; updated by a refresh; deleted on disconnect. |
| `social_publish_attempts` | Append-only publishing ledger: request snapshot, destination, provider result, remote ID and URL, error category, timestamps. | Queued, publishing, published, failed, or reauthorization required. |

## OAuth path

1. The browser retrieves the current Supabase session and requests a provider authorization URL from `/api/social-connect`.
2. FloStudio verifies that bearer token server-side, verifies provider configuration, creates a random state (stored only as a hash), and stores a short-lived state record.
3. The browser leaves FloStudio for the provider consent page. The app secret remains server-side.
4. The provider redirects to `/api/social-connect?callback=1` with the code and state. FloStudio validates the state and expiry before exchanging the code server-side.
5. Meta callbacks reveal eligible Page and Instagram destinations. FloStudio stores an encrypted temporary result and returns the user to Channels to select exactly one destination. Other single-destination providers can be completed at callback time.
6. FloStudio writes public destination metadata and a separate encrypted credential. The next status request can truthfully show the connected account and expiry.

## Publishing path

1. A post becomes **approved** in Review Queue; it is not marked published.
2. The user initiates the real publish request. The server verifies the user, post ownership, approved state, mapped platform connection, token health, and provider-specific media eligibility.
3. FloStudio writes a `publishing` attempt record before the provider call and captures the provider’s remote ID and URL only after success.
4. The campaign post becomes **published** only when a provider response has been persisted. Failure moves the attempt to `failed` or `needs_reauthorization`; the post remains approved and retryable.

## Provider configuration contract

| Provider | Required production environment variables | Callback |
|---|---|---|
| Meta Facebook and Instagram | `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, optional `META_GRAPH_VERSION` | `https://www.flostudio.io/api/social-connect?callback=1` |
| LinkedIn | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | `https://www.flostudio.io/api/social-connect?callback=1` |
| TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | `https://www.flostudio.io/api/social-connect?callback=1` |
| X | `X_CLIENT_ID`, `X_CLIENT_SECRET` | `https://www.flostudio.io/api/social-connect?callback=1` |
| FloStudio credential vault | `SUPABASE_SERVICE_ROLE_KEY`, `SOCIAL_CREDENTIALS_ENCRYPTION_KEY`, optional `PUBLIC_APP_URL` | n/a |

> The encryption key must be a high-entropy value configured in production and never committed. Changing it invalidates the ability to decrypt existing connected-channel credentials, so it requires deliberate credential rotation and reauthorization.

## Automation boundary

The first release supports user-initiated publishing from the approved Review Queue. Planned scheduled publishing will use the same immutable publish-attempt route behind a server-side schedule, rather than changing a post’s state in browser JavaScript. Provider callbacks are event-driven HTTP requests, so they work within FloStudio’s current serverless deployment; no browser polling is required for the authorization flow.
