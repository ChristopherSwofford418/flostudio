# Flo Studio observability: Mixpanel + Firebase

Flo Studio now includes a **disabled-by-default**, privacy-bounded telemetry foundation for Mixpanel and Firebase Analytics. The application does not load either SDK or send telemetry until the relevant public configuration is supplied at build time.

## Vercel configuration

Add these as Vercel project environment variables for `flostudio-web`, then redeploy. They are browser configuration values, not service-role secrets.

| Integration | Required variables |
| --- | --- |
| Mixpanel | `VITE_MIXPANEL_TOKEN` |
| Firebase Analytics | `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`; optional `VITE_FIREBASE_MEASUREMENT_ID` |

Use the same environment scope intended for the deployment being measured. Production should use production project values; preview can use a separate analytics project if desired.

## Events and privacy boundary

When configured, Flo Studio records:

- `flo_page_viewed`: route name/path only after a signed-in user session is ready.
- `app_store_production_media_discovered`: selected product ID and approved candidate count.
- `app_store_production_media_imported`: selected/imported/already-imported/failed counts for the selected product.

It deliberately does **not** send email addresses, phone numbers, tokens, passwords, private keys, prompts, product descriptions, media URLs, customer content, or App Store credential material. Initialization and tracking failures are ignored so analytics can never break product work.

## Identity behavior

Mixpanel identifies a signed-in Flo Studio user only by the Supabase user UUID. Firebase Analytics uses its SDK’s standard anonymous app instance behavior. The code resets Mixpanel identity when the Flo Studio session is absent.
