# Flo Studio launch-readiness review — 2026-10-31

## Release intent

This release is additive. It preserves Portfolio, Creative Lab, Campaign Engine, Pipeline, SEO & ASO, Facebook Page Kits, App Store Connect, and Jev workflows while making their selected-app and review-first behavior consistent for the next marketing session.

## What is ready

- **App-scoped creative rendering:** image and video routes require an authenticated Flo Studio session, an authorized workspace, and a selected portfolio app. Video status/content actions also require the associated media record.
- **App-scoped product intake:** public App Store, Google Play, and product-listing intake now requires an authenticated workspace; existing apps additionally require selected-app authorization. Credential-bearing, non-public, and redirect-following URLs are rejected.
- **Review Queue integrity:** Flo Copilot saves generated drafts into an app-specific Campaign Engine review queue. Legacy `/compose`, `/calendar`, and `/approve` URLs redirect to the current app-scoped workflows rather than their older unscoped implementations.
- **No simulated outcomes:** Flo Copilot no longer displays made-up analytics. Autopilot approval means approval into the review queue, never external publishing. SEO articles stay review-only and can be copied for manual handoff.
- **App Store source of truth:** a secure App Store Connect sync records the catalog title, app ID, bundle ID, version, release state, and verification time on that selected portfolio app. Apple media imports require a currently production-ready app plus Apple-approved media on an approved surface.
- **App isolation:** media, SEO destinations, SEO articles, and SEO action tasks are enforced by user/workspace/product RLS policies. Existing records were preserved; only future app-scoped writes are allowed through the workflow.
- **Token integrity:** token charges and refunds remain server-owned; the browser cannot mutate balances, tiers, or positive token transactions.

## Deliberate approval boundaries

No change in this release connects a social account, publishes a post, schedules a post, changes an Apple listing, pushes a CMS article, spends a paid rendering token, changes a provider key, or contacts an outside provider. Those remain distinct owner-approved actions.

## Verification summary

- Browser test suite: **39 passing tests**.
- Node-native safety/logic suite: **33 passing tests**.
- Production Vite build: passed.
- Frozen pnpm lockfile: validated with pnpm 10.26.2 (the production package-manager path).
- Production database migrations applied:
  - `launch_readiness_scope_hardening`
  - `launch_readiness_rls_performance`
- Preservation check after migration: 46 portfolio records, 65 app-scoped media records, 2 SEO articles, 5 SEO action tasks, and 4 older unassigned media records retained.

## Operator flow for tomorrow

1. Select the intended **Active App** in the global selector.
2. Confirm or refresh that app’s public listing facts in **Portfolio**.
3. Add factual product details, direct social Page/profile links, and any approved App Store visuals per app.
4. Use **Campaign Engine**, **Creative Lab**, or **Facebook Page Kits** to create only app-specific drafts.
5. Review assets and copy in **Pipeline**; approve internally before choosing any separately connected publishing action.
6. Record observed search/AI evidence in **SEO & ASO**; export/copy review-ready SEO articles manually until a separately approved CMS integration exists.

## Remaining operator configuration, if needed

- A workspace-level OpenAI key must be connected before paid image/video rendering or AI enrichment. Flo Studio reports a clear connection-needed state instead of falling back to a shared key.
- App Store Connect media import requires an existing secured connection for that app and a current Apple production release.
- Social publishing continues to require an explicitly connected, app-specific social provider profile; direct Facebook/TikTok links are shortcuts only.
