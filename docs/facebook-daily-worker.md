# Daily Facebook review-draft worker

## Scope

`api/facebook-daily-cron.js` is application-native draft preparation, not Facebook publication, account connection, or email delivery. Its content builder uses existing saved official App Store listing identity and a pre-reviewed caption associated with the exact user-supplied marketing image. The image-caption preparation step belongs to the parent ingestion flow: independently inspect the actual image together with the matching official listing once, approve the copy, and register it. The daily worker does not inspect images, infer capabilities from filenames, generate images, call an LLM, translate copy, fetch listings, search providers, or incur remote AI/provider fees. Its only remote operations at runtime are the two new protected storage RPCs below, using the existing `emailRpc` helper; it never calls an existing email RPC.

Existing email implementation, publication, media-generation and connector files remain unchanged. The final `vercel.json` adds the Facebook cron and public-image rewrite while preserving the existing email cron entries, build/output settings and other rewrites. No deployment or remote enablement is performed by this follow-up. Local worker tests use fully mocked HTTP/RPC access and do not contact a database or provider.

## Native endpoint and gates

The actual endpoint is **`/api/facebook-daily-cron`**, corresponding to `api/facebook-daily-cron.js`. Both `GET` and `POST` are accepted, but an exact `Authorization: Bearer ${CRON_SECRET}` header is required. Comparison reuses `safeEmailSecretEqual`; missing/blank secret, a non-string authorization value, alternate casing, extra spaces, or wrong credentials fail closed. All responses set JSON content type and `Cache-Control: no-store`. Other methods receive `405` and `Allow: GET, POST` without storage access.

The independent environment gate is exactly:

```text
FACEBOOK_DAILY_DRAFTS_CRON_ENABLED=true
CRON_SECRET=<server-only cron secret>
SUPABASE_SERVICE_ROLE_KEY=<server-only configured service key>
```

Any other feature-gate value, including `TRUE`, `1`, or absence, does no storage work. Email sending/research/drafting flags, Gmail credentials, model/provider keys, and Facebook credentials cannot enable or disable this feature. The configured nonblank service-role key is required before any RPC, including when using server-side test seams. The shared `emailRpc` performs authenticated storage access and already fails closed when its key is absent. HTTP query/body input is ignored: it cannot select scopes, days, revisions, paths, captions, limits, models, RPC names, or test dependencies.

The final `vercel.json` includes this additive entry:

```json
{ "path": "/api/facebook-daily-cron", "schedule": "*/5 * * * *" }
```

It also adds `/facebook-assets/:workspace/:product/:file` → `/api/facebook-draft-image?workspace=:workspace&product=:product&file=:file` before the catch-all application rewrite. The existing `/api/email-cron`, `/api/email-research-cron` and `/api/email-daily-campaign-cron` schedules remain intact. The actual Facebook path is not `/api/facebook-daily-drafts-cron`; local configuration alone is not evidence of a deployed or enabled scheduler.

## Preparation timing and bounded work

The intended operating window is **3 AM America/New_York preparation for 4 AM Eastern review**. Apply `20261111_facebook_daily_fixed_schedule.sql` after the unchanged original Facebook migration: the database now requires exactly `start_hour=3`, matching the API/client, and normalizes only preexisting non-3 settings with fresh revisions. The database, not the worker's system timezone, determines the due Eastern date/start-hour predicate and handles DST. Every invocation reads at most **25** due snapshots, dispatches at most **25** saves, and does not perform an unbounded drain loop or arbitrary total-ad calculation. The DB's maximum due-read cap is 100; this worker's requested and accepted response cap remains 25. Independent five-minute ticks can continue preparing later batches. A valid, enabled 25-app workspace can fit in one batch; readiness by 4 AM is an operational goal, not a guarantee if listing/assets/configuration/storage are invalid or unavailable.

`config.maxDuration` is **60 seconds**, save concurrency is **5**, and the dispatch deadline is **40,000 ms** from invocation start. The imported `emailRpc` gives each request a **15-second** abort timeout. No new save begins at/after the dispatch deadline, leaving nominal headroom for its completion before the Vercel ceiling. Time exhausted before a save increments `blocked`; already attempted saves are never retried. Oversized/malformed due responses fail closed before any persistence. In-flight storage requests still rely on the helper's timeout and Vercel's hard runtime bound; this is not an indefinite background service.

## Protected snapshot contract

`facebook_due_daily_drafts({ p_limit:25 })` must return an array of protected snapshots:

```json
{
  "workspace_id": "11111111-1111-4111-8111-111111111111",
  "product_id": "22222222-2222-4222-8222-222222222222",
  "scheduled_day": "2026-11-11",
  "settings_revision": "33333333-3333-4333-8333-333333333333",
  "product": {
    "id": "22222222-2222-4222-8222-222222222222",
    "name": "MatterPrep",
    "source_facts": {
      "appId": "6781106756",
      "appStoreUrl": "https://apps.apple.com/app/id6781106756",
      "storeMetadata": {
        "trackId": "6781106756",
        "trackUrl": "https://apps.apple.com/app/id6781106756",
        "description": "Official saved listing description"
      }
    }
  },
  "asset": {
    "id": "44444444-4444-4444-8444-444444444444",
    "file_path": "/facebook-assets/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png",
    "title": "Prepared image title",
    "caption": "Revise seus documentos e confira as fontes.",
    "hashtags": "#MatterPrep #Documentos"
  }
}
```

`source_facts` must be limited by the DB to official scalar listing IDs, URLs, descriptions and permitted nested listing metadata, never arbitrary prompts or research. `asset` may be null; missing asset also yields the same defensive fallback. Optional `language:'en'` is not a generation dependency: a reviewed Portuguese caption remains verbatim. Workspace, product, settings revision and asset ID must be canonical lowercase UUIDs. Product ID must equal the top-level product ID; any supplied product/asset workspace or product scopes must match. The date must be a real, round-tripping `YYYY-MM-DD` calendar date, with year zero rejected.

The content resolver imports and reuses `resolveDailyCampaignAppStoreSource` (and `canonicalAppStoreUrl`) from `email-daily-campaign-content.js` without editing it. It validates all official listing IDs/URLs checked by that helper, then validates and prefers the new official `source_facts.appStoreUrl` when supplied. That URL must itself be a genuine HTTPS `apps.apple.com` listing for the same numeric Apple ID. Tracking query/fragment data is stripped. A URL-only listing without an official Apple ID cannot establish identity; mismatched IDs and invalid explicit listing URLs are blocked.

The worker accepts asset paths **only** in this exact literal form:

```text
/facebook-assets/{lowercase-workspace-UUID}/{lowercase-product-UUID}/{lowercase-sha256-64}.png
```

Remote URLs, including otherwise scoped Supabase storage URLs, are deliberately not allowed in this worker; neither are relative paths, other prefixes/extensions, uppercase hashes, encoded segments, traversal, controls, query/fragment suffixes, or cross-app paths. Parent ingestion must register the literal same-origin public application path and host/proxy the actual approved PNG bytes there. Worker path checks establish scope and syntax, not actual byte/hash/visual verification. Invalid present assets are **blocked**, never silently replaced with an unrelated image or hidden by null-image fallback.

## Content and missing-image contract

`buildFacebookDailyContent(snapshot)` is the primary content export. Aliases are `buildDailyFacebookDraftContent` and `generateFacebookDailyContent`; `validateFacebookDailySnapshot` is also exported. The content result is:

```text
{
  body: string,                  // plain text, at most 4000 JS characters
  hashtags: string,              // individual validated tags joined by one space
  app_store_url: string,
  asset_id: UUID | null,
  image_id: UUID | null,          // UI/preparation convenience alias
  image_path: string | null,
  image_missing: boolean,
  status: 'draft',
  content_source: 'reviewed_asset_caption' | 'app_store_fallback'
}
```

One short natural opening rotates deterministically by date and official app ID across **7 finite templates**. The approved matched-feature caption is copied verbatim between that opening and the required precautions/CTA. Rotation eventually repeats and does not promise unlimited uniqueness, daily product changes, new releases, or newly generated images. The database independently rotates only among that app's approved active image assets. The combined openings/asset rotation do not change the meaning of a caption or attach it to an unrelated image.

Asset-provided hashtags may enter preparation as an array, or the actual DB format of whitespace-separated text. Each token must be a single Unicode `#word` using letters, combining marks, numbers or underscores. At most five input tags and at most 500 joined characters are accepted, with duplicates removed. Missing/empty tags use only a sanitized app-brand hashtag. No fabricated popular or trend hashtags are added. Persisted `p_hashtags` is always **text**, not a JSON array.

Copy safety checks reject caption/app-name links, hidden controls, HTML/Markdown link syntax, handles, percent-encoded destinations, instruction/CTA injection, unsupported promotion assertions, guaranteed results, and obvious legal/medical/finance/safety outcome claims. A safe reviewed caption is not truncated, translated, paraphrased, or synthesized from arbitrary metadata. The title and arbitrary product/fact prompt fields are not draft copy. These deterministic guards are not a semantic claim-verification model: the parent must still approve image-matched, listing-supported captions before registration.

The claim scan permits bounded explicit negative qualifications such as “not a confirmed mechanical diagnosis,” “not medical diagnosis,” “No outcomes are guaranteed,” and their supported Portuguese equivalents. Only those short negative phrases are masked for claim scanning; the stored caption remains verbatim and URL/instruction checks remain active. A disclaimer followed by an affirmative “guarantees successful repair” claim still blocks. It does not treat the presence of a safe disclaimer as permission to skip the rest of the caption.

Every body contains the canonical App Store destination **exactly once**, supplied only by the worker's truthful CTA to review current features, requirements, pricing and limitations. No caption may introduce another URL, including a second copy of the App Store link. Overlength combined content is blocked, never truncated in a way that removes precautions or the destination.

Precautions include:

- CitationShield always: **`Extraction only. Verify sources. Not legal advice.`**
- MatterPrep and named legal topics: not legal advice.
- AutoWizard: manufacturer/professional guidance and no guaranteed safety/repair outcomes.
- GymGuard: safe exercise/qualified guidance and no guaranteed safety/fitness outcomes.
- TagSnap: verify identification results, safety guidance, and no guaranteed accuracy/safety outcomes.
- PratoFit: **`Nutrition estimates only. Not medical advice.`**
- Other app names/official listing descriptions identifying health or financial topics: the corresponding no-advice/no-outcome limitations.

With no eligible asset, body copy is only the app-name opening, relevant precautions and current-listing CTA. It does not copy an arbitrary listing description into an invented feature claim, use global/historical image pools, or invent a visual. `asset_id`, `image_id`, and `image_path` are null, `image_missing` is true, and both save image parameters are null. The parent UI must show **“Image needed”** for a saved draft with a null image snapshot.

## Exact save and acknowledgement contract

The worker calls only:

```text
facebook_save_daily_draft({
  p_workspace_id, p_product_id, p_scheduled_day, p_settings_revision,
  p_body, p_hashtags, p_app_store_url, p_asset_id, p_image_path
})
```

Scopes/date/revision are copied from validated protected snapshot primitives before asynchronous saves, not reconstructed from HTTP input. `p_body`, `p_hashtags`, URL and image parameters come from the validated content result. The DB must atomically revalidate current enabled settings/revision, live enabler, product/workspace/date/due scope, canonical matching Apple ID, and the currently selected approved asset ID/path. The DB unique key and `ON CONFLICT DO NOTHING` ensure one draft per workspace/product/day and preserve previous human edits. There is no retry or update/overwrite operation in this worker.

The existing DB codes are handled as follows:

| DB acknowledgement code | Aggregate |
| --- | --- |
| `FACEBOOK_DAILY_CREATED` | `created` |
| `FACEBOOK_DAILY_EXISTS` | `exists` |
| `FACEBOOK_DAILY_SETTINGS_STALE` | `blocked` |
| `FACEBOOK_DAILY_APP_UNAVAILABLE` | `blocked` |
| `FACEBOOK_DAILY_APP_LIMIT_EXCEEDED` | `blocked` |
| `FACEBOOK_DAILY_NOT_DUE` | `blocked` |
| `FACEBOOK_DAILY_APP_STORE_INVALID` | `blocked` |
| `FACEBOOK_DAILY_CONTENT_INVALID` | `blocked` |
| `FACEBOOK_DAILY_IMAGE_INVALID` | `blocked` |

To accommodate additive DB namespace spelling changes, object acknowledgements with bounded uppercase `FACEBOOK_..._CREATED`/`..._EXISTS` codes also work. `created` may be omitted for a code-only acknowledgement; if present it must be boolean and must not contradict success/existence. Known fixed blocked suffixes also include `ASSET_INVALID`, `ASSET_STALE`, `SCOPE_MISMATCH`, `IMAGE_PATH_INVALID`, and `PRODUCT_UNAVAILABLE`. Unknown codes, non-object responses, nonboolean/contradictory flags or ambiguous storage exceptions increment `failed` without raw payload disclosure or retry. A duplicated validated workspace/product/day within the same due array increments `exists` before a second save; it is a suppressed duplicate, not proof that this invocation successfully created its first copy.

## Fixed public response

Every HTTP JSON response has exactly these four numeric counts, with no raw payloads, content, settings, IDs, paths, tokens, errors, logs or diagnostic code strings:

```json
{ "created": 0, "exists": 0, "blocked": 0, "failed": 0 }
```

`200` means the authorized batch completed or its independent gate was inactive; check counts rather than assuming all apps drafted. Authorization failure is `401`, unsupported method is `405`, and missing storage/malformed due response/read failure/unexpected batch failure is `503`. Unauthorized/unsupported/inactive responses use all-zero counts. Storage/read failures use `failed:1`; per-item content/dispatch blockers use `blocked`; ambiguous save failures use `failed` in a normally completed `200` batch.

## Offline verification

```sh
node --test tests/facebook-daily-content.test.mjs tests/facebook-daily-worker.test.mjs
node --test tests/facebook-daily-content.test.mjs tests/facebook-daily-worker.test.mjs tests/email-core.test.mjs tests/email-daily-campaign-content.test.mjs
```

The tests fully replace storage HTTP/RPC access. They cover exact auth and inactive gates, fail-closed service configuration, fresh saves, realistic text hashtags/canonical official snapshot URLs, truthful null-image content fallback, scoped literal PNG paths, malformed/cross-scope snapshots, real/leap dates, adversarial URLs/captions/CTAs, fixed qualifiers, finite rotation, duplicate/no-overwrite acknowledgements, unknown/contradictory responses, 25-row/five-concurrent bounds, deadline exhaustion, no retries, captured immutable save scope, opaque counts, and static absence of provider/publication/email RPC operations. The existing imported-helper regression suites can run together without modifying those modules.

Final local verification: **255 new Facebook tests passed**, and **375 tests passed** when including the existing `email-core` and daily-email-content helper regression suites; **0 failed, 0 skipped** in either run. These are local mocked tests, not evidence of migration installation, live scheduling, publishing, or successful production draft creation.
