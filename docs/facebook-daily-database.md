# Daily Facebook review drafts — database contract

## Scope and installation

`supabase/migrations/20261111_facebook_daily_drafts.sql` is additive application-native draft storage. Install **after** `20261111_email_daily_campaigns.sql` and its prerequisites, then install `supabase/migrations/20261111_facebook_daily_fixed_schedule.sql`. The original Facebook migration is already applied in production and remains unchanged; the fixed-schedule correction is a separate transaction migration. It reuses the existing owner-definer listing-ID, listing-facts and plain-text content validators without replacing them or granting them to callers. This follow-up work does not apply migrations, contact a database, configure a scheduler, deploy, or commit changes.

The feature creates review drafts, never publishes to Facebook, connects accounts, sends email, discovers images or retrieves credentials. Existing email, research and legacy Facebook tables/functions are untouched. The operational goal is to start preparing at **3 AM America/New_York** for **4 AM Eastern review**. Database due gates enforce that fixed start hour; a worker must run and finish preparation to meet the review goal. DST follows PostgreSQL's `America/New_York` zone. The timezone is fixed to that value and the start hour must be **exactly `3`**, matching the API/client contract.

The follow-up normalizes **only** existing non-3 `facebook_daily_settings` rows to hour 3 with a new UUID revision, obeying the existing revision guard. Already-3 rows remain byte-for-byte unchanged; other settings fields are preserved except the guard-managed update timestamp on normalized rows. It adds the named `facebook_daily_settings_start_hour_fixed` check and replaces only the existing settings RPC's hour validation, retaining its signature, empty search path, authorization, locks, all-app cap and explicit original ACL. It adds no public functions or tables and never changes saved drafts, assets or email state.

There are exactly **three authenticated RPCs** and **three service-only RPCs**, including the explicitly approved public-image registry addition. All three tables are RLS-enabled with no direct privileges for `anon`, `authenticated` or `service_role`; no broad read/write policies are added. Every new function is security-definer with an empty search path. Internal helpers/guards have execute revoked from all three caller roles and `PUBLIC`. Ownership comes only from `workspaces.owner_user_id`; a membership label `owner` is not ownership. Admin membership is sufficient to start/pause and register assets; ordinary members can only read through the status RPC.

## Tables

| Table | Contract |
| --- | --- |
| `facebook_daily_settings` | Primary key `(workspace_id, product_id)`, composite FK to that workspace's product. Defaults: disabled, `America/New_York`, hour `3`; the named `facebook_daily_settings_start_hour_fixed` check requires hour `3`, including privileged direct writes. UUID `settings_revision`, nullable `enabled_by`, creation/update timestamps. Enabled rows require a live owner/admin enabler; disabled rows have no enabler. Settings cannot be deleted or moved. Every update must change the revision. |
| `facebook_draft_assets` | UUID `id`; workspace/product composite FK; positive integral numeric `apple_app_id`; `file_path`; nullable immutable `source_url` with the exact approved public CDN PNG prefix; lowercase 64-character hex `sha256`; integer `sort_order`; `title` ≤200, `caption` ≤2000, `hashtags` ≤500; `uploaded_by`; creation timestamp; `active` default true. Unique app/hash and composite `(workspace_id, product_id, id)`. Images are user-supplied and captions are supplied by the caller after actual-image/app verification. Registration never overwrites an existing app/hash row. |
| `facebook_daily_drafts` | UUID `id`; workspace/product; `scheduled_day`; plain-text `body` 1–4000 characters; `hashtags` ≤500; query/fragment-free matching `app_store_url`; `status='draft'`; nullable `asset_id` and `image_path` together; `source='approved_asset_template'`; creation/update timestamps. Unique `(workspace_id, product_id, scheduled_day)`. Composite asset FK prevents cross-app/workspace images. |

No table has cascading deletes. Deletion is prohibited by guards. Asset identity, scope, listing ID, hash, file path, source URL, uploader and creation timestamp are immutable. Only privileged database-owner maintenance can change asset ordering/copy/active state; there is no client mutation RPC for those fields. Draft identity, scope, date, App Store URL, image snapshot, status, source and creation timestamp are immutable. Guards allow body/hashtag copy changes while retaining the saved link; the public interface deliberately has **no edit RPC**. A privileged maintenance edit remains intact on worker retries.

## Client RPCs (`authenticated`)

### `get_facebook_daily_workspace_status(p_workspace_id uuid, p_scheduled_day date DEFAULT NULL) → jsonb`

Requires live owner/admin/member access. Root `workspace_id` and each app's `workspace_id` equal the requested workspace. Returns **every active product**, including disabled apps and apps missing image/listing/Page data. Archived products are omitted, not deleted. At more than 100 active products it raises `FACEBOOK_DAILY_APP_LIMIT_EXCEEDED`; it never returns a misleading partial calendar. There is no pagination contract within the supported ≤100-app workspace.

```json
{
  "workspace_id": "workspace-uuid",
  "scheduled_day": "2026-11-11",
  "today": "2026-11-11",
  "timezone": "America/New_York",
  "apps": [{
    "workspace_id": "workspace-uuid",
    "product_id": "product-uuid",
    "app_name": "Stored app name",
    "app_store_url": "https://apps.apple.com/app/id123456789",
    "facebook_page_url": null,
    "settings": { "enabled": false, "timezone": "America/New_York", "start_hour": 3 },
    "assets_count": 0,
    "draft": null
  }],
  "today_counts": { "apps": 25, "drafts": 0, "images": 0 }
}
```

The example shape is illustrative; counts reflect the actual active apps. `today` is an Eastern date string. `scheduled_day` defaults to that date, or uses the caller's exact date. `draft` is the **full saved row for that precise app/day**, or null. Past or future date reads never substitute a newest/today draft. `today_counts` always describes **today**, even while browsing a past date: active app count, today's saved drafts, and today's drafts with a nonnull image snapshot. Historical records for archived apps remain stored, but this active-app calendar does not expose them.

`app_store_url` is the canonical no-slug Apple URL derived from matching authoritative listing identity, or null when identity fails validation. `facebook_page_url` is read only from `source_facts.socialLinks.facebook`; only normalized HTTPS `facebook.com`/`www.facebook.com` paths without credentials, queries/fragments, traversal, ports or control characters are returned, except the exact literal `/profile.php?id=[1-9][0-9]{0,24}` form (a positive 1–25-digit ID with no leading zero, extra query, encoding or fragment) allowed by `20261111_facebook_profile_page_links.sql`. Missing/unsafe values become null. Never invent Page URLs. Asset counts include only active assets whose registered Apple ID still matches the current listing. No complete source facts, enabler, revision, asset captions, uploader or credentials are exposed outside the full non-secret saved draft row.

### `facebook_save_daily_settings(p_workspace_id uuid, p_enabled boolean, p_timezone text, p_start_hour integer) → jsonb`

Requires owner/admin. Atomically creates/updates settings for **all currently active apps** in the workspace with one new common UUID revision. Explicit parameters are required; send exactly `America/New_York` and `3` for both Start and Pause. A null hour or any other integer raises `FACEBOOK_DAILY_SETTINGS_INVALID`, not a configurable alternate schedule. Start sets `enabled_by` to the caller; Pause clears it. Archived apps are not changed. Newly added/reactivated apps without settings remain disabled until Start is invoked again. More than 100 active apps fails closed for both Start and Pause. Revisions are regenerated even for an identical request so older worker snapshots become stale.

```json
{
  "apps_updated": 25,
  "settings_revision": "new-uuid",
  "settings": { "enabled": true, "timezone": "America/New_York", "start_hour": 3 }
}
```

Settings are stored enabled even if the enabler later loses privileges, but due/save then fail closed. Existing drafts remain intact after Pause, revision changes, ownership changes or archival.

### `register_facebook_draft_asset(p_workspace_id uuid, p_product_id uuid, p_apple_app_id numeric, p_file_path text, p_sha256 text, p_sort_order integer, p_title text, p_caption text, p_hashtags text, p_source_url text DEFAULT NULL) → jsonb`

Requires owner/admin and a currently active product in the exact workspace. The supplied positive integral Apple ID must match all authoritative product/listing aliases. Returns the registered asset row **except `source_url`**, which is never returned to client metadata. The appended source parameter defaults to null, so existing nine-argument calls remain valid. Empty title/caption/hashtags are allowed; null values, overlength text or unsupported control characters are rejected. Integers may be negative for ordering. SHA-256 must be lowercase hex and must match the filename. Accepted path forms are **exactly**:

```text
/facebook-assets/{lowercase-workspace-UUID}/{lowercase-product-UUID}/{lowercase-sha256-64}.png
https://{normalized-project-host}.supabase.co/storage/v1/object/public/marketing-assets/facebook-assets/{workspace-UUID}/{product-UUID}/{sha256-64}.png
```

The Supabase host uses a lowercase valid DNS project label. No other host, bucket, signed URL, encoded path, query/fragment, userinfo, port, alternate extension, traversal, or different workspace/product/hash is accepted. The local path is a public application path, **not** a sandbox filesystem path. Registering the same app/hash returns the original row unchanged even when a subsequent caller supplies different copy, ordering or an alternate allowed URL form. No fallback image can cross apps, even when hashes or Apple IDs coincide.

`p_source_url` is null for locally hosted/static assets, or must exactly match `^https://files[.]manuscdn[.]com/user_upload_by_module/session_file/310519663911058939/[A-Za-z0-9_-]+[.]png$`. No alternate session, host, extension, query, fragment or encoded path is accepted. This URL is immutable, including on duplicate registration; it is excluded from registration results, due snapshots and workspace/draft metadata.

**Ingestion responsibility:** Only register newly user-supplied, verified PNG assets for this feature. The parent ingestion flow must hash actual PNG bytes, verify their app/image association, write/host the PNG at the exact path or register its approved immutable CDN source, and supply image-matched approved copy. The database validates metadata identity and scope; it does not inspect bytes, verify actual image content, fetch URLs or copy old media. This migration adds neither storage policies nor uploads. Existing generic Supabase upload policies may not permit the new prefix; use an authorized ingestion path rather than broadening policies here. CDN-backed assets retain the same local public path; the parent implements a bounded PNG proxy using the lookup below rather than storing large images in Git.

### Privileged one-time ingestion without JWT

Authorized database-owner SQL imports can insert directly into `facebook_draft_assets`, supplying the verified workspace owner/admin ID as `uploaded_by`, with `ON CONFLICT (workspace_id,product_id,sha256) DO NOTHING`. No JWT, membership impersonation, extra service registration RPC or client-supplied actor parameter is needed. `auth.uid()` may be null. The insert guard independently locks and verifies that `uploaded_by` is a **live real owner/admin**, the exact product belongs to the workspace and is active, its authoritative Apple ID equals the supplied numeric ID, and the scoped hash path is valid. Column checks enforce the same approved source URL and length/hash bounds. Duplicate rows are never updated. This path is only for privileged database-owner imports: direct insert remains denied to `service_role`, `authenticated` and `anon`, and the normal authenticated RPC always records its own `auth.uid()`.

## Worker RPCs (`service_role` only)

### `facebook_get_public_image(p_workspace_id uuid, p_product_id uuid, p_sha256 text) → jsonb | null`

Returns exactly `{ "source_url": "approved-CDN-PNG-URL", "sha256": "registered-lowercase-hash", "title": "stored-title" }`, or SQL null (JSON null through the API). A match requires the exact workspace/product/hash, an active asset, an active product, the current matching authoritative Apple ID, a nonnull approved source URL, and the asset's **exact local** `/facebook-assets/{workspace}/{product}/{hash}.png` path. Static/null-source and Supabase-URL-path assets have no proxy registry match. This is only a registry read, not an HTTP fetch or a metadata/member endpoint. A viewer needs no workspace membership to retrieve an approved public marketing graphic; database execution itself is nevertheless service-only, with no anon or authenticated grant.

The parent public image API must validate canonical UUID/hash path inputs, require this database match, fetch only the returned allowlisted source with redirects disabled, enforce its 4,000,000-byte limit and PNG header, verify the exact SHA-256 of the original bytes, and then serve those bytes. It must not accept arbitrary caller URLs or render fallback content. The migration does not implement that API. Deactivating an asset or archiving/reidentifying its product makes the lookup unavailable; immutable historical draft metadata still retains its original image path.

### `facebook_due_daily_drafts(p_limit integer DEFAULT 25) → jsonb[]`

Returns a deterministic, bounded, read-only snapshot ordered by workspace/product UUID. Null defaults to 25; negative/zero returns none; maximum batch size is 100. This batch cap is separate from the **workspace completeness** cap: workspaces above 100 active apps are wholly excluded. The worker can repeatedly process successful batches until due work is exhausted; no claim or reservation is created by reading.

Each snapshot has exactly:

```json
{
  "workspace_id": "workspace-uuid",
  "product_id": "product-uuid",
  "scheduled_day": "2026-11-11",
  "settings_revision": "revision-uuid",
  "product": {
    "id": "product-uuid",
    "name": "Stored app name",
    "source_facts": {
      "appId": "123456789",
      "appStoreUrl": "https://apps.apple.com/app/id123456789",
      "storeMetadata": { "trackId": 123456789, "trackUrl": "https://apps.apple.com/app/id123456789", "description": "Stored listing description" }
    }
  },
  "asset": { "id": "asset-uuid", "file_path": "/facebook-assets/.../hash.png", "title": "Approved image title", "caption": "Verified image caption", "hashtags": "#App" }
}
```

`product.source_facts` contains only allowlisted scalar listing IDs, URLs and descriptions; optional aliases/nested listing fields may appear and unavailable values are omitted/null. No arbitrary metadata or social profile is returned. `asset` is null if no eligible app image exists. Apps with invalid/missing listing identity may be returned for truthful failure reporting; they cannot save until the authoritative listing is valid.

An app is due only when enabled, active, its enabler is still a real owner/admin, Eastern hour is at/after start, and no draft exists for today's app/day. Asset rotation is deterministic: active assets matching the current listing ID sorted by `(sort_order,id)`, selected with normalized `epoch_day mod asset_count`, epoch `1970-01-01`. It never falls back to another app or a historic/global image pool.

### `facebook_save_daily_draft(p_workspace_id uuid, p_product_id uuid, p_scheduled_day date, p_settings_revision uuid, p_body text, p_hashtags text, p_app_store_url text, p_asset_id uuid, p_image_path text) → {created:boolean, code:string}`

Independently rechecks enabled/current revision, live enabler authorization, active workspace/product scope, workspace cap, Eastern current date/hour, authoritative listing identity and the complete content/link contract. Only plain text with the supplied canonical query/fragment-free matching App Store link is accepted; additional destinations, markup or unsafe schemes in either body or hashtags fail closed. Keep the body ≤4000 and hashtags ≤500, and include the same `p_app_store_url` in the body. A valid clean Apple listing path for that same ID is accepted, though clients should use the canonical `appStoreUrl` snapshot.

Both image parameters must exactly match the currently selected app asset. If the eligible image pool is empty, both **must be null**, and a content-only draft is saved. Show **“Image needed”**; never claim that an image was generated, attached or approved when the saved snapshot is null. If rotation/pool changes between due and save, `FACEBOOK_DAILY_IMAGE_INVALID` requests a fresh snapshot rather than an unrelated fallback. Successful saves with an image retain its original path indefinitely.

Workspace advisory locks serialize Start/Pause, registration and worker saves. Scope/authorization/settings/asset row locks protect successful writes from concurrent changes to existing rows through commit. One unique app/day plus `ON CONFLICT DO NOTHING` prevents duplicate inserts. Existing drafts return `EXISTS` after authorization/date/cap checks and before content/image reselection; retries never overwrite saved copy or images, including privileged human edits. This does not backfill past dates or produce future drafts.

| Code | Meaning |
| --- | --- |
| `FACEBOOK_DAILY_CREATED` | New draft inserted (`created: true`). |
| `FACEBOOK_DAILY_EXISTS` | Today's app/day already exists; no overwrite. |
| `FACEBOOK_DAILY_SETTINGS_STALE` | Missing/disabled/revised settings or enabler revoked/reassigned. |
| `FACEBOOK_DAILY_APP_UNAVAILABLE` | Product missing/out of scope/archived. |
| `FACEBOOK_DAILY_APP_LIMIT_EXCEEDED` | Workspace contains more than 100 active apps. |
| `FACEBOOK_DAILY_NOT_DUE` | Wrong/null date or before the configured Eastern start hour. |
| `FACEBOOK_DAILY_APP_STORE_INVALID` | Missing/conflicting listing identity or unsafe/mismatched destination. |
| `FACEBOOK_DAILY_CONTENT_INVALID` | Missing destination, invalid length/plain text or unauthorized extra link. |
| `FACEBOOK_DAILY_IMAGE_INVALID` | Null mismatch, wrong scope, stale/nonselected image or altered path. |

Client RPCs raise namespaced exceptions rather than save-result codes: `FACEBOOK_DAILY_MEMBER_REQUIRED`/`ADMIN_REQUIRED` use SQLSTATE `42501`; also `SETTINGS_INVALID`, `PRODUCT_NOT_FOUND`, `APP_UNAVAILABLE`, `APP_STORE_INVALID`, `ASSET_INVALID`, `APP_LIMIT_EXCEEDED`. Immutable record guards raise `FACEBOOK_DAILY_HISTORY_IMMUTABLE`.

## Offline validation

Run:

```sh
node --test tests/facebook-daily-migration.test.mjs
```

The test installs a synthetic workspace/auth/product fixture and the email daily dependency into PGlite before this migration. It uses no database/provider network or secrets. The PGlite integration test skips only when PGlite is unavailable at both the project dependency location and the existing `/tmp/email-db-validation` fallback. Static checks still run.

Coverage includes exact function/table ACLs, empty search paths, real-owner/admin/member separation, forged owner membership, cross-workspace/product isolation, archived apps, all-25 and all-100 calendars, >100 fail-closed, new revisions, revoked enablers/ownership changes, Eastern date/start gates, future-date rejection, exact historical date reads, duplicate/hash stability, safe local/Supabase URL forms, deterministic rotation, matching current listing identity, plain-text destination checks, cross-app image denial, truthful null-image saves, concurrent retries, immutable history and reopen durability. Existing email state/functions and synthetic research/legacy delivery state remain unchanged.

The approved CDN addition also tests strict source allowlisting, immutable duplicate source URLs, client omission, service-only image lookup, exact hash/workspace/app paths, active-state and current listing identity gates.

Privileged ingestion coverage also asserts successful null-JWT owner imports and rejects member/outsider uploaders, wrong Apple IDs, cross-workspace products and archived products; direct service table writes remain denied.

The baseline scenarios intentionally use hour 0 under the original migration to avoid clock-dependent due assumptions and remain intact. A final subtest then applies the fixed-schedule follow-up, verifies fresh revisions only on non-3 rows, unchanged already-3 settings, exact ACL/history/email preservation, and successful owner Start/Pause at hour 3 in the existing one-app second workspace. Every other hour 0–23, plus null, -1 and 24, is rejected through the RPC and privileged direct writes. The >100 all-app cap and authorization boundaries remain enforced. This final subtest makes no due-time or draft-save assumptions.

Recorded local run: **14 tests passed, 0 failed, 0 skipped**.
