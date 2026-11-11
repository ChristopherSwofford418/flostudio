# Daily public business-email research: database contract

This additive migration enables **research only**, never sending, opt-in inference, drafts, campaigns, or queue mutations. It uses the existing workspace roles (`workspaces.owner_user_id`, `workspace_members.user_id`, owner/admin/member) and composite product foreign key. The current portfolio model has no independent production boolean: an explicitly selected non-archived `products` row is an eligible app. Nothing is enabled automatically.

## Exact RPC contracts

### Human settings and status (authenticated only)

`save_email_research_settings(p_workspace_id uuid, p_product_id uuid, p_enabled boolean, p_daily_target integer, p_daily_request_limit integer, p_timezone text, p_start_hour integer, p_query text) -> jsonb`

Requires a non-null `auth.uid()` and current workspace owner/admin; verifies product scope. Every save creates a new UUID `settings_revision`. Returns the saved settings object. Defaults for an absent settings row are `enabled=false`, `daily_target=80` (1–100), `daily_request_limit=8` (1–10), `timezone='America/New_York'`, `start_hour=6` (0–23), `query=''` (trimmed, maximum 500 characters), `settings_revision=null`, `enabled_by=null`, `enabled_at=null`. Explicit enabling records the saving admin and timestamp. Disable clears enable authorization. Enabling an archived app is rejected. Changing or disabling settings invalidates outstanding claims; it does not refund a reserved request.

`get_email_research_status(p_workspace_id uuid, p_product_id uuid) -> jsonb`

Requires a current workspace owner/admin/member and an in-workspace product. Returns `{settings, recentRuns, today}`; `recentRuns` is at most 20, newest first. `today` includes `scheduled_day`, `requests`, `verified`, `inserted`, `skipped`, `failed`, `errors`, `reserved`, `remainingTarget`, `remainingRequests`, `workspace_requests`, `workspace_requests_remaining`. `errors` (also aliased as `failed`) is the authoritative count of persisted research runs whose state is `failed` or `expired` for this app/local day, across **all settings revisions**. It measures failed/expired research reservations, not deliverability, email-send errors, or billable-provider-call counts. An elapsed claim is counted after claim's expiry sweep or finish persists its terminal state; status previews may show effective expiry before that persistence. Other counts are also app-local-day across all revisions, never all-workspace contact data. Remaining capacity uses the stricter of local-day and rolling-24-hour usage; workspace request capacity uses the stricter of UTC-day and rolling-24-hour usage. Status contains no claim token/hash, credential envelope, provider key, arbitrary provider errors, or another workspace's query.

### Research worker (service_role only)

`email_claim_research_batch(p_workspace_limit integer default 200) -> jsonb | null`

Claims **one app and one paid request**, or returns SQL NULL when no app is eligible. Parameter is the workspace paid-call cap, 1–200, not the number of apps returned. Result fields are exactly:

```text
allowed: true, run_id, claim_token, workspace_id, product_id, target_remaining,
batch_limit, query, timezone, scheduled_day, request_number, product
```

`batch_limit` is 1–10 and no greater than remaining target capacity after completed inserts and outstanding live reservations. Target usage is actual new inserts only (not duplicates or verified counts); live reservations conservatively hold possible insertion slots. `product` contains only `{id,name,description,audience}`; no raw `source_facts` or credentials. An empty query can use these app facts; `exclude_emails` is not returned. Claim snapshot and revision are stored durably. UUID claim tokens are stored as SHA-256 hashes, not plaintext. Claims expire after 15 minutes. Eligibility requires enabled settings, current authorization of `enabled_by`, a non-archived in-scope product, a configured existing workspace OpenAI credential, app-local time at/after start hour, target capacity and request capacity. Requests are counted across revisions and bounded both per app-local-day and rolling 24 hours. App inserted-target usage is also bounded by the stricter local-day/rolling-24-hour count; all unchanged-revision live claims reserve target slots even across midnight. This conservative policy prevents timezone edits from resetting paid-call or insertion capacity, at the cost of sometimes delaying an app after a late previous-day run. A shared global advisory transaction lock serializes selection/reservation; latest claim order rotates eligible apps fairly. Workspace UTC-day and rolling-24-hour reservations never exceed 200 (or the supplied lower cap). Failed, expired, crashed, and zero-result requests all consume their ordinal and budget forever; never retry the paid call with the same claim.

`get_email_research_credential(p_run_id uuid, p_claim_token uuid) -> TABLE(encrypted_api_key jsonb)`

Returns zero or one row from **the existing** `public.workspace_openai_provider_credentials.encrypted_api_key` vault (defined in `20260822_workspace_openai_provider_vault.sql`). It accepts no workspace ID and derives scope only from the live claim. It verifies the token hash, nonexpiration, unchanged/enabled settings, app availability, and current owner/admin authorization; reads are serialized with finish/save and role/product changes. The credential retrieval is one-shot: the first successful retrieval records `credential_accessed_at`; subsequent retrievals return no rows. The parent runtime decrypts this existing envelope with `decryptProviderKey`. This RPC is never granted to authenticated/anon. Existing vault functions and ACLs are untouched.

`email_finish_research_batch(p_run_id uuid, p_claim_token uuid, p_candidates jsonb default '[]', p_error_code text default null) -> jsonb`

Result is `{allowed, completed, code, verified_count, inserted_count, skipped_count}`. The claim is one-use: a completed/failed/expired/stale claim cannot be finished again. Invalid run/token returns `EMAIL_RESEARCH_CLAIM_INVALID`, with no scope information. Expiration returns `EMAIL_RESEARCH_EXPIRED`; changed settings, disabled/archived app or removed enabling admin returns `EMAIL_RESEARCH_SETTINGS_STALE`. Terminal runs retain the reservation and fixed-code outcome.

Accepted worker error codes: `EMAIL_RESEARCH_PROVIDER_FAILED`, `EMAIL_RESEARCH_PROVIDER_UNAVAILABLE`, `EMAIL_RESEARCH_CREDENTIAL_UNAVAILABLE`, `EMAIL_RESEARCH_INVALID_RESPONSE`. Unknown error strings map to `EMAIL_RESEARCH_PROVIDER_FAILED`; raw errors are never stored. Success code is `EMAIL_RESEARCH_COMPLETED`. Non-array/oversized payloads fail with `EMAIL_RESEARCH_INVALID_RESPONSE` and insert nothing.

Candidate payload (maximum 10 elements and never above the claim's `batch_limit`):

```json
{
  "email": "hello@business.example",
  "organization": "Business name",
  "source_url": "https://business.example/contact",
  "source_evidence": {
    "kind": "public_business_role_email",
    "business_domain": "business.example",
    "role": "hello",
    "email_excerpt": "Contact Business name: hello@business.example",
    "business_excerpt": "Business name provides professional services."
  }
}
```

Finish lowercases/trims email, domain and role, validates actual email syntax and role-address local part, requires a nonempty organization and both bounded source excerpts, and requires the source host and email domain to match the stated business domain (optional `www.` on source only). HTTPS public hostname only: no userinfo, IP/private/special-use host, non-443 port, whitespace or consumer/webmail domain. Allowed business roles are `info`, `hello`, `contact`, `sales`, `support`, `office`, `admin`, `team`, `enquiries`, `inquiries`, `bookings`, `booking`, `service`, `services`, `business`, `partnerships`, `marketing`, `press`, `media`, `events`, `reservations`. The email excerpt must contain the normalized email. The worker must actually retrieve and verify this evidence; database validation is structural, **not proof of deliverability, consent, business ownership, or lawfulness**.

`verified_count` counts distinct structurally verified emails, including otherwise suppressed/existing records; duplicate and invalid entries contribute to skipped. `inserted_count` is the actual number inserted; `skipped_count` equals input elements minus actual inserts. Finish deduplicates within the batch, excludes workspace suppressions and permanent prior-send-claim/reservation evidence across apps, and uses `ON CONFLICT DO NOTHING`. New rows are only `status='candidate'`, empty consent evidence and null consent metadata. It never updates an existing candidate/opt-in/opt-out/contact. Persisted source evidence is an allowlisted object with the supplied verified fields plus `research_run_id`, `researched_at`, `scheduled_day`, and `settings_revision`.

## Storage and security

`email_research_settings` has `(workspace_id, product_id)` primary key and composite FK to `products(workspace_id,id)`. `email_research_runs` has UUID primary key, immutable scope/settings/day/ordinal/snapshot, unique `(workspace_id,product_id,scheduled_day,request_number)` plus the revision-qualified key, monotonically increasing claim order, terminal states `claimed/completed/failed/expired`, bounded counts, expiration, token hash and one-shot credential-access marker. Only system-owned SECURITY DEFINER functions mutate either table; RLS enabled, no direct client/service table privileges. Functions use an empty `search_path`. Internal authorization/trigger functions have no public role execution grants. No new service configuration, provider-vault changes, scheduling, external calls, analytics hooks, or live migration application is included.

Paid request reservations must **commit before** the runtime requests credentials or calls the provider. Rollback before commit creates no reservation and must trigger no external call. Never wrap claim + external research in a database transaction, reopen a claim, automatically retry a paid call, infer opt-in, or send/draft messages. A new ordinal may be claimed only while capacity remains. Expired claims release target-slot reservations, not request budgets. Settings edits do not reset local-day run counts.

## Offline validation

Run `node --test tests/email-daily-research-migration.test.mjs`. The test follows the existing PGlite convention using `/tmp/email-db-validation/node_modules/@electric-sql/pglite/dist/index.js` and skips behavioral tests if that optional offline dependency is unavailable. All envelopes, users, businesses and prior-send evidence are synthetic; no production migration, services, credentials or browser are used. PGlite serializes its client queries; concurrent Promise claims exercise the reservation logic but are not a substitute for deployment-time multi-session PostgreSQL lock testing.
