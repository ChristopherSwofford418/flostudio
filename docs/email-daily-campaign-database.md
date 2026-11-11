# Daily reusable email campaign drafts: database contract

`20261111_email_daily_campaigns.sql` is additive, draft-only infrastructure. The production migration was applied on November 11, 2026, and daily draft settings were enabled for the owner’s 25 active apps at 07:00 America/New_York. The migration itself does not activate the server scheduler or call any provider. The app-level library is **not** the existing delivery campaign system: it has no recipients, approval, consent, sending flag, connection, queue entry, quota reservation, or paid-work claim. Existing contact/send tables and RPCs are neither read nor changed by this migration.

## Storage and scope

`public.email_daily_campaign_settings` has composite primary key `(workspace_id, product_id)` and composite foreign key to `products(workspace_id,id)`. Its fields are `workspace_id`, `product_id`, `enabled`, `timezone`, `start_hour`, `settings_revision`, `enabled_by`, `created_at`, `updated_at`. Defaults are `enabled=false`, `timezone='America/New_York'`, `start_hour=7`; revision is a newly generated UUID for a persisted settings row. A successful settings save always creates a fresh revision, including saves of unchanged values. Enabling records the current authenticated owner/admin in `enabled_by`; disabling clears it. No enablement is inferred from existing email settings.

`public.email_daily_campaigns` fields are `id` (UUID), `workspace_id`, `product_id`, `scheduled_day` (date), `name`, `subject`, `body`, `app_store_url`, `status`, `content_source`, `created_at`, `updated_at`. Subject is nonempty and at most 180 characters; body is nonempty and at most 6,000 characters; name is nonempty and at most 200 characters. Status is constrained to **`draft` only**, content source to **`listing_template` only**. Composite product FK prevents cross-workspace products. Unique `(workspace_id, product_id, scheduled_day)` applies across every settings revision; revision is intentionally not part of this key.

Historical rows cannot be deleted, rescheduled, renamed, reassigned, approved, or have their stored URL changed through these RPCs. Human edits can change subject/body only. Product archival or settings changes do not erase history or reset a previously created app/day. Settings and draft tables have delete/identity guards and no cascade deletion. The portfolio has no independent production boolean; a selected nonarchived product is active. The archival predicate is the existing convention `coalesce(source_facts->>'archived','false') = 'false'`.

## Human RPCs: `authenticated` only

All functions below return one JSON object (`jsonb`), not a table result. A non-null `auth.uid()` is required. Ownership means `workspaces.owner_user_id` matches the user; admin/member authorization uses `workspace_members.user_id` and `role`. A membership row labelled `owner` does not grant ownership.

### Read status

```text
get_email_daily_campaign_status(p_workspace_id uuid, p_product_id uuid) -> jsonb
```

Requires current owner/admin/member and an in-workspace product. An archived product remains readable. Returns exactly:

```json
{
  "settings": {
    "workspace_id": "uuid",
    "product_id": "uuid",
    "enabled": false,
    "timezone": "America/New_York",
    "start_hour": 7,
    "settings_revision": null,
    "enabled_by": null,
    "created_at": null,
    "updated_at": null
  },
  "campaigns": [],
  "today": { "scheduled_day": "YYYY-MM-DD", "created": false }
}
```

The shown settings are the virtual defaults when no settings row exists; reading does not create a row. Persisted settings use the same fields with real revision/timestamps. `campaigns` contains at most 30 complete campaign rows for this exact workspace/product, ordered by `created_at DESC, id DESC`. It includes historical drafts across all settings revisions. `today.scheduled_day` uses current settings timezone; `today.created` reports whether any library row exists for that app/local date, regardless of revision or human edits. The default date uses New York time.

### Save settings

```text
save_email_daily_campaign_settings(
  p_workspace_id uuid, p_product_id uuid, p_enabled boolean,
  p_timezone text, p_start_hour integer
) -> jsonb
```

Requires current owner/admin and a nonarchived product in the supplied workspace. Returns the complete saved settings object. Parameters must be explicit and non-null: boolean, an exact case-sensitive timezone name present in PostgreSQL's `pg_timezone_names` (excluding `posix/` and `right/` variants), and integer hour 0–23. `UTC` and normal IANA aliases are accepted; unknown names, offsets, extra whitespace, nulls, and out-of-range hours are rejected. No implicit trimming or coercion is performed by the RPC. Archival rejects both enabling and disabling saves; worker generation is already blocked while archived. Every successful save invalidates old worker snapshots but leaves all campaign rows untouched.

### Edit a reusable draft

```text
update_email_daily_campaign(
  p_workspace_id uuid, p_product_id uuid, p_campaign_id uuid,
  p_subject text, p_body text
) -> jsonb
```

Requires current owner/admin and an exact match of campaign ID, workspace, and product. Returns the complete updated campaign row. Only subject/body and `updated_at` change. It does not approve anything. It permits editing historical drafts for archived products, using their immutable stored URL rather than today's listing metadata. Content rules below apply. Missing/foreign scope yields a fixed record-not-found exception.

Human exception messages are fixed: `EMAIL_DAILY_CAMPAIGN_MEMBER_REQUIRED`, `EMAIL_DAILY_CAMPAIGN_ADMIN_REQUIRED` (SQLSTATE `42501`), `EMAIL_DAILY_CAMPAIGN_PRODUCT_NOT_FOUND`, `EMAIL_DAILY_CAMPAIGN_APP_UNAVAILABLE`, `EMAIL_DAILY_CAMPAIGN_SETTINGS_INVALID`, `EMAIL_DAILY_CAMPAIGN_RECORD_NOT_FOUND`, `EMAIL_DAILY_CAMPAIGN_CONTENT_INVALID`. Internal history guards use `EMAIL_DAILY_CAMPAIGN_HISTORY_IMMUTABLE`; they are not public RPCs.

## Worker RPCs: `service_role` only

### Due-app snapshot (not a claim)

```text
email_due_daily_campaigns(p_limit integer default 25) -> jsonb array
```

Returns `[]` when no app is due. Limit behavior is `max(0, min(coalesce(p_limit,25),100))`: omitted/null → 25; zero/negative → 0; every positive value is capped at 100. Ordering is deterministic by `workspace_id, product_id`. It does not reserve, mark, charge, or mutate work; repeated calls can return the same snapshots until a draft is saved.

Each array element has exactly:

```json
{
  "workspace_id": "uuid",
  "product_id": "uuid",
  "scheduled_day": "YYYY-MM-DD",
  "settings_revision": "uuid",
  "product": {
    "id": "uuid",
    "name": "App title",
    "product_url": "https://apps.apple.com/us/app/app-slug/id123456789",
    "source_facts": {
      "appId": "123456789",
      "appStoreId": 123456789,
      "appleAppId": "123456789",
      "storeMetadata": {
        "trackId": 123456789,
        "trackUrl": "https://apps.apple.com/us/app/app-slug/id123456789",
        "description": "Existing public listing description"
      },
      "appStoreListing": {
        "sourceUrl": "https://apps.apple.com/us/app/app-slug/id123456789",
        "description": "Existing synchronized listing description"
      }
    }
  },
  "language": "en"
}
```

Fact keys appear only when the existing value has the expected scalar type: IDs are strings/numbers; URLs/descriptions are strings. Missing scalar fields are omitted; empty nested objects may remain. Objects/arrays cannot leak through ID fields. **No other `source_facts` keys or nested metadata are returned.** Product description/audience and private metadata are not added to the snapshot.

Eligibility requires enabled settings, the original `enabled_by` still being an owner/admin now, a nonarchived in-scope product, current app-local hour at/after `start_hour`, and no campaign for the current app-local date. Listing quality is not an eligibility claim: an app with missing/conflicting listing facts may appear due, but save will fail closed. This RPC authorizes no provider or paid work; generate the deterministic English listing template without credentials or provider calls.

### Insert a draft once

```text
email_save_daily_campaign(
  p_workspace_id uuid, p_product_id uuid, p_scheduled_day date,
  p_settings_revision uuid, p_name text, p_subject text,
  p_body text, p_app_store_url text
) -> jsonb
```

Return shape is always **`{created:boolean, code:fixed-string}`**. It contains no campaign row, provider errors, metadata, or secrets. It locks/rechecks the enabled settings, exact unchanged revision, current authorization of the enabling actor, product workspace/archive state, current local date, and current local start hour. The date must echo the current due snapshot's local day; null/backdated/future values fail. If local midnight passes between due selection and save, fetch a fresh snapshot rather than attempting an old-day insert.

Validation/result precedence and complete code set:

| Code | `created` | Meaning |
| --- | --- | --- |
| `EMAIL_DAILY_CAMPAIGN_SETTINGS_STALE` | false | Missing/disabled settings, null/mismatched revision, or enabling actor no longer owner/admin. |
| `EMAIL_DAILY_CAMPAIGN_APP_UNAVAILABLE` | false | Product missing in supplied workspace or archived. |
| `EMAIL_DAILY_CAMPAIGN_NOT_DUE` | false | Supplied day differs from current local day, or before start hour. |
| `EMAIL_DAILY_CAMPAIGN_APP_STORE_INVALID` | false | Missing/invalid/conflicting official listing identity or destination. |
| `EMAIL_DAILY_CAMPAIGN_CONTENT_INVALID` | false | Invalid name/subject/body or link/markup gate fails. |
| `EMAIL_DAILY_CAMPAIGN_CREATED` | true | One new app/day draft inserted. |
| `EMAIL_DAILY_CAMPAIGN_EXISTS` | false | App/day already exists after all current gates pass. Existing row and human edits are untouched. |

`INSERT ... ON CONFLICT (workspace_id,product_id,scheduled_day) DO NOTHING` is the final duplicate-race protection, never an upsert of copy. An old revision retry returns stale rather than exists; a new-revision retry for an already-created day returns exists once its gates pass. Snapshot reads make no exactly-once claim; only the committed insert is durable.

## Shared official listing identity contract

The database independently applies `email_daily_campaign_expected_app_id`, an internal SQL helper with no public/service execution grant. The deployed builder is deliberately more conservative: it requires a stored positive numeric App Store ID (up to 20 decimal digits), and accepts normal URL parser canonicalization only before SQL revalidation. URL-only identity can pass the SQL contract below but is blocked by the runtime builder pending listing reconciliation. All 25 current active apps have stored Apple IDs and listing URLs. No builder decision bypasses the save-time database gates:

1. Read existing nonempty numeric identity fields in this order: `source_facts.appId`, `appStoreId`, `appleAppId`, `storeMetadata.trackId`. Every present nonempty value must be positive decimal digits, and all must agree. `appId` is the preferred source; `trackId` is the normal fallback, with the two aliases supported. Whitespace, zero, signs, UUIDs, objects, or conflicting IDs fail closed.
2. Examine existing `product_url`, `storeMetadata.trackUrl`, and `appStoreListing.sourceUrl`. A valid official URL is HTTPS on the exact lowercase host `apps.apple.com`, with optional two-letter storefront, `/app/`, optional slug, and terminal `/idDIGITS` (optional trailing slash). It accepts `/app/idDIGITS` too. Userinfo, ports, host lookalikes, whitespace, extra path suffixes, malformed percent escapes and encoded separators/control characters fail. Existing listing URLs may have query/fragment metadata, which is stripped **for identity comparison only**. A non-Apple product homepage is not listing evidence and is ignored. Any present nonempty explicit `trackUrl`/`sourceUrl` must be valid; a corrupted explicit listing source fails even when another source is valid.
3. Every valid official listing URL's ID must agree with every other URL and with the numeric ID. If numeric fields are absent, one or more agreeing official listing URLs can resolve the ID. **At least one existing official listing URL is mandatory**, even if a numeric ID exists. The worker-supplied destination is never enough by itself to establish product identity.
4. The save argument `p_app_store_url` must itself have that official shape and matching ID, with **no query or fragment**. The builder supplies a canonical URL; SQL does not silently strip or rewrite the persisted argument. Different official storefront/slug variants are accepted when the same ID is established.

This is validation of stored listing evidence, not a network lookup or independent certification that the public listing is current. A missing description does not create facts: the database gates identity/links/text, while the deterministic builder must refuse to invent listing claims.

## Shared content gate

Subject/body are stored verbatim after validation. Subject is nonblank, 1–180 characters, with no control characters (in particular no CR/LF header injection). Name is nonblank, at most 200 characters, with no control characters. Body is nonblank, 1–6,000 characters; LF/CR/tab are allowed for plain-text formatting, other control characters rejected.

Body must contain the exact stored canonical URL. Every recognized HTTP(S) URL token must be exactly that URL, with terminal sentence punctuation allowed. Repetitions of the same link are allowed. Other URL destinations, query suffixes/path extensions, alternate schemes (`mailto:`, `javascript:`, `data:`, `tel:`, `sms:`, `file:`, `ftp:`), protocol-relative links, `www.` links, and recognizable bare-domain links fail closed. Angle-bracket markup and Markdown inline links are rejected; use plain text such as `App Store: https://apps.apple.com/.../id123456789` on its own line. These conservative link rules can reject domain-like prose; the UI must display content as plain text, never interpolate it into HTML. Do not HTML-render or auto-expand encoded/unrecognized link syntaxes.

## Security and concurrency

Both new tables have RLS enabled and **no direct table privileges** for `PUBLIC`, `anon`, `authenticated`, or `service_role`, including SELECT. There are no table client/service writes or RLS bypass grants. All functions are SECURITY DEFINER with empty `search_path`, explicit schema-qualified app/auth objects, narrow ACLs, and internal helpers revoked from every external role. Human-only RPCs are not granted to service; service-only RPCs are not granted to clients.

Mutation RPCs use a shared per-workspace/product advisory transaction lock. They hold workspace/enabling membership/product row locks to commit so concurrent revocation, ownership changes, or archival cannot race a successful insert. Settings rows are locked and revisions checked on save. The unique app/day constraint remains the final defense against duplicate insertion. Historical draft edits do not touch today's listing or any sending state. Due selection is merely a read-only snapshot and holds no provider claim or reservation.

No secrets are accessed by the content generator, no paid model or web-search calls are needed, and no tables outside this draft library are written by its worker. The native `/api/email-daily-campaign-cron` timer checks every five minutes under the independent `EMAIL_DAILY_CAMPAIGN_CRON_ENABLED` gate and the existing protected cron authentication. Research and delivery gates are unchanged. The generator uses 12 deterministic English listing-template rotations; they repeat eventually and are not AI-generated, personalized, or automatically approved copy.

## Offline validation

```sh
node --test tests/email-daily-campaign-migration.test.mjs
```

The test uses a disposable durable PGlite database, trying the optional project package first, then the established `/tmp/email-db-validation/node_modules/@electric-sql/pglite/dist/index.js` location. Behavioral tests skip if neither dependency exists; static assertions still run. Fixtures follow lifecycle owner/admin/member authorization and prior schema migrations. They contain synthetic users, App Store metadata, consent, approved historical copy, a prior unknown send and quota reservation; connection snapshots explicitly omit credential columns and no credential fixtures are supplied.

Coverage includes strict defaults/settings, role grants and RLS, per-app/workspace isolation, archive/revocation/ownership checks, nested listing-fact allowlisting, missing/conflicting/mismatched identity, canonical URLs and injected links, content bounds and CRLF, no backdating, timezone and start-hour gates, retry idempotency across revisions, preserved human edits after close/reopen, duplicate final inserts, all limit edge cases (hard maximum 100), historical status cap/order and unchanged delivery records/RPC definitions. PGlite serializes client queries: concurrent Promise saves validate duplicate logic but do not replace deployment-time multi-session PostgreSQL race testing.
