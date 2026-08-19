# FloStudio Social Publishing Integration Research

## Scope

FloStudio must present only real authorization and publishing capability. A connection is not valid until the provider has returned an authorization code, FloStudio has performed the server-side exchange, the user has selected an eligible destination where required, and the credential has been stored without exposing it to browser clients.

## Current FloStudio audit

The current Channels screen is a readiness-only UI. Its `/api/social-connect` endpoint deliberately returns `SOCIAL_PROVIDER_NOT_CONFIGURED` for every connect or publish request. The live database has a `connected_accounts` table with `user_id`, platform, public account fields, and a plaintext `access_token` column, but it has no rows and is not sufficient for a durable multi-tenant OAuth integration. The review queue currently changes an approved post directly to `published` without calling a provider; this must be replaced by a publish-attempt process that only marks a post published after a provider returns a real remote post ID.

## Official provider requirements

| Provider | Supported authorization and publishing path | Commercial eligibility / review boundary |
|---|---|---|
| **Facebook Pages** | Meta user authorization, followed by Page selection and a Page access token. Publishing requires `pages_show_list`, `pages_read_engagement`, and `pages_manage_posts`; Page posts are created through `POST /{page-id}/feed`. | Extended Page permissions require Meta App Review; app users outside app roles require the relevant approval. |
| **Instagram Professional** | Either Business Login for Instagram or Facebook Login for Business. A user authorizes, FloStudio exchanges the code server-side, then exchanges the short-lived token for a long-lived token. The Professional account must be eligible; the Facebook-login path requires a linked Page. Image/video containers are created first and then published through `/{ig-id}/media_publish`. | Serving accounts that FloStudio does not own/manage requires Advanced Access, App Review, and Business Verification. Media must be publicly accessible while Instagram fetches it. Page Publishing Authorization can separately block publishing. |
| **LinkedIn member publishing** | OAuth 2.0 member authorization with the self-service **Share on LinkedIn** product and `w_member_social` scope. For image or video posts, FloStudio must register and upload the asset before creating the share. | `w_member_social` is the open self-service member scope. Organization publishing and many marketing permissions require additional approval; FloStudio must not claim organization posting until that authorization is actually granted. |
| **TikTok** | TikTok Login Kit / OAuth plus the Content Posting API. Direct posts require the user-authorized `video.publish` scope and the provider’s prescribed post initialization and status flow. | TikTok requires an app audit to remove default visibility restrictions for content posted by unaudited clients. Draft/upload flows may be possible before Direct Post is approved, but must be reported accurately. |
| **X** | OAuth 2.0 authorization-code flow with PKCE. FloStudio must use `state`, a PKCE challenge, exact registered redirect URI, and a server-side exchange. The minimal publish scopes are `tweet.read`, `tweet.write`, and `users.read`; `offline.access` enables refresh tokens. Text/media posts use `POST /2/tweets`. | An approved developer app and user access token are prerequisites. X supports an explicit `made_with_ai` post field for AI-generated media and a `paid_partnership` disclosure field. |

## Architecture conclusions

1. Use Vercel serverless routes for authorization start, callback exchange, connection status, account selection, publishing, and token refresh. OAuth callbacks are event-driven HTTP requests and do not require a polling service.
2. Store provider credentials only in a server-readable encrypted vault field; never expose raw access tokens through Supabase client queries or the browser.
3. Add OAuth state records with expiry and PKCE verifier support so the callback can verify the initiating FloStudio user, workspace, product, provider, and requested destination context.
4. Store public connection metadata separately from protected credentials: provider account ID, display name, handle, selected destination, granted scopes, expiration, authorization state, provider configuration readiness, and diagnostic status.
5. Create immutable publish attempts. The UI may show **ready to publish**, **queued**, **publishing**, **published**, **failed**, or **needs reauthorization**. It may mark a campaign post `published` only after a successful provider response and durable provider post ID.
6. Keep user-visible setup status specific: missing provider credentials, missing approved product/app review, user denied scope, no eligible Page/Professional account, token expired, or media validation failure. Do not use a generic “connected” state.

## Sources

1. [Meta Permissions Reference](https://developers.facebook.com/docs/permissions/)
2. [Meta Instagram Platform Overview, updated June 30, 2026](https://developers.facebook.com/documentation/instagram-platform/overview)
3. [Meta Facebook Pages API](https://developers.facebook.com/documentation/pages-api)
4. [Meta Instagram Content Publishing](https://developers.facebook.com/documentation/instagram-platform/content-publishing)
5. [LinkedIn: Getting Access to APIs](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access)
6. [LinkedIn: Share on LinkedIn](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin)
7. [TikTok: Content Posting API](https://developers.tiktok.com/doc/content-posting-api-get-started)
8. [TikTok: Direct Post reference](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post)
9. [X: OAuth 2.0 Authorization Code Flow with PKCE](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code)
10. [X: Create Posts](https://docs.x.com/x-api/posts/create-post)
11. [X: Manage Posts Quickstart](https://docs.x.com/x-api/posts/manage-tweets/quickstart)
