# FloStudio Social Channel Production Validation

## Deployed foundation

Commit `da5fb15` is live on `https://www.flostudio.io/accounts`. The new Channels screen now describes and renders the real authorization sequence: provider consent, server-side exchange, destination mapping where Meta returns multiple eligible destinations, and provider-backed publishing only after a Review Queue post has been approved.

## Current production result

The deployed server route correctly refuses to start any provider flow because `SUPABASE_SERVICE_ROLE_KEY` has not been configured in the FloStudio production environment. This is a deliberate secure failure: accepting a social authorization code without a server-only credentials vault would either fail to persist the connection or invite unsafe browser exposure of provider tokens.

The production button test returned this configured error state, and the UI presented it without claiming a channel had connected or a post could publish. The database migration has already added the protected credential vault, one-time OAuth state records, immutable publish-attempt ledger, and browser-safe connection metadata. Its service-only credential and state tables use RLS with no client policies; the Supabase security advisor reports this as informational rather than an exposed-data warning.

## Remaining production configuration

Before a user can be sent to a real provider consent screen, FloStudio’s actual Vercel project needs a server-side Supabase service-role key and a 32-byte `SOCIAL_CREDENTIALS_ENCRYPTION_KEY`. Each individual channel additionally needs its own registered provider credentials and the exact callback URL `https://www.flostudio.io/api/social-connect?callback=1`. Provider approval remains separately required for the Page, Instagram, TikTok, organization publishing, and other capabilities documented in the research record.
