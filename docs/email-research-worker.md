# Daily public-business-email research worker

## Scope and activation

`api/email-research-cron.js` and `api/email-research-runtime.js` perform **candidate discovery only**. They do not generate ads, send messages, infer opt-in, create drafts/campaigns/queues, change consent, import Gmail, consume Gmail budgets, change the selected app, or alter analytics hooks. Publicly posted business contacts remain candidates, never opted-in recipients.

The default requested target is **80 new addresses/app/local day**, with **eight provider batches of at most ten verified candidates**. Twenty-five apps imply a 2,000-address target and 200 request reservations. The owner can configure a lower target/request cap; supported settings allow 1–100 target addresses and 1–10 requests, subject to the same maximum 200-request workspace cap. These are targets, not guarantees: duplicates, absent sources, incomplete/refused results, failures, and workspace capacity can leave a shortfall. There is no automatic top-up beyond the saved request cap and no paid retry. Database **inserted** counts—not generated/verified counts—measure new addresses.

Parent-owned work includes settings/schema/API/UI, migration, scheduling, deployment, and the existing helper. The parent adds the independent `/api/email-research-cron` one-minute timer without changing the existing send cron. Two hundred one-minute reservations have a theoretical 3h20 floor; real completion can take longer. The deployment research flag must remain unset/false until recurring provider-cost authorization. This worker does not configure external services.

## Authentication and independent gates

Only GET is accepted. Other methods return 405 with `Allow: GET`. GET always requires exact string `Authorization: Bearer <CRON_SECRET>`, checked using the existing constant-time comparison before the feature gate. Missing secret, malformed/non-string header, or unauthenticated public status GET returns 401. Every response has `Cache-Control: no-store`.

Research requires exactly `EMAIL_RESEARCH_CRON_ENABLED === 'true'`. The worker never borrows `EMAIL_CRON_ENABLED`, live-send flags, Gmail/OAuth/account state, or body/query flags. Authorized disabled invocations perform no database/provider calls and return zero aggregates.

Required server settings:

| Setting | Purpose |
| --- | --- |
| `CRON_SECRET` | Scheduler-only Bearer authorization |
| `EMAIL_RESEARCH_CRON_ENABLED` | Independent exact-`true` activation gate |
| `EMAIL_RESEARCH_WORKSPACE_DAILY_REQUEST_LIMIT` | Canonical integer string 1–200, defaults to 200 **only when absent** |
| `SUPABASE_SERVICE_ROLE_KEY` | Existing protected `emailRpc` transport |
| `OPENAI_EMAIL_RESEARCH_MODEL` | Explicit existing research-model configuration |
| `OPENAI_PROVIDER_VAULT_KEY` | Existing provider-key vault root; existing `ASC_CREDENTIALS_ENCRYPTION_KEY` compatibility is retained |

The cap rejects blank, zero, >200, signs, leading zeroes, whitespace, fractions, and coercible malformed input before claiming. No HTTP input overrides it. The database enforces concurrent request reservations, its UTC-day and rolling-24-hour workspace ceilings, app-local-day scheduling, and current authorization.

The worker never reads global `OPENAI_API_KEY` or a sandbox/provider fallback key. Only the live claim's existing workspace encrypted envelope is decrypted in server memory with `decryptProviderKey`. Plaintext is not logged, returned, persisted, or included in raw errors. Local key references are cleared after research; JavaScript cannot guarantee immediate erasure of immutable strings from memory.

## Exact service RPC integration

See [`email-daily-research-database.md`](./email-daily-research-database.md) for authoritative migration/security details. The runtime makes **one claim**, **at most one credential lookup**, **at most one helper call**, and **one terminal finish attempt** per invocation. It never repeats a request or chooses another job after failure. Existing `emailRpc` supplies service-role transport with a 15-second timeout.

### Claim

`email_claim_research_batch({ p_workspace_limit })` returns SQL null/no job or one flat object:

```js
{
  run_id, claim_token, workspace_id, product_id,
  target_remaining, batch_limit, query, timezone,
  scheduled_day, request_number,
  product: { id, name, description, audience }
}
```

No `allowed` field is required. A supplied `allowed: false` is blocked; optional true is accepted. Zero/one-element array responses are supported; multiple jobs fail closed. `null`, `[]`, or `{no_job:true}` without a run handle means no work.

`request_number` is the **per-app/local-day reservation ordinal**, not the workspace ordinal. Runtime validation enforces 1–10, remaining target 1–100, and batch limit 1–10; the default settings remain 80/eight. The helper limit is the minimum of remaining target/batch limit/10. IDs and claim token are bounded ASCII letters/digits/hyphens/underscores (UUID encoding is supported). Optional product/workspace, batch-number, and expiry echoes must match/be valid. A safe saved `query` is only an explicitly labeled untrusted operator search preference, never an extra factual source. Sensitive-personal or action/credential instructions are omitted; HTTP body/query data cannot override the claim. The database derives the actual app/workspace/setting context, checks non-archival/current enabling-admin authorization, and commits the reservation before credentials/provider work. Failed, crashed, expired, and zero-result requests consume the budget permanently.

The database, API, UI and worker share the same supported bounds. Changing app settings does not refund reserved requests or reset daily/rolling-24-hour limits.

### Credential

`get_email_research_credential({ p_run_id, p_claim_token })` returns `[]` or `[{ encrypted_api_key: envelope }]` (a single object is also accepted):

```js
{
  encrypted_api_key: {
    version: 1, algorithm: 'aes-256-gcm',
    iv: '<canonical base64, 12 bytes>',
    tag: '<canonical base64, 16 bytes>',
    ciphertext: '<canonical base64, 1..4096 bytes>'
  }
}
```

The worker supplies **no workspace parameter** and performs no unrelated vault lookup. The service-only RPC derives matching workspace scope from the live claim and independently rechecks unchanged/enabled settings, nonexpired claim, product availability, and current owner/admin authorization. Credential retrieval is one-shot and records `credential_accessed_at`; the worker never calls it again. Existing vault encryption has no workspace AAD, so claim-derived SQL authorization is a required security boundary. Optional scope/expiry/admin/enabled echoes, if present, are validated fail-closed. Null/denied/missing/wrong-scope/expired/malformed/undecryptable envelopes cause zero provider calls and a fixed terminal failure attempt.

A settings change after credential retrieval cannot retract a provider request already dispatched. The finish RPC must still independently reject stale insertion.

### Candidates and finish

The existing `researchEmailCandidates` verifies observed addresses against cited public own-contact pages and returns string `source_evidence`. The runtime filters role/consumer domains, unsafe source URLs, mismatched organization-owned domains, and sensitive consumer/child/patient/student evidence. It requires the **actually observed** snippet to contain both normalized email and organization context, then maps it to structured evidence without inventing text:

```js
{
  email, organization, source_url,
  source_evidence: {
    kind: 'public_business_role_email',
    business_domain: '<normalized email domain>',
    role: '<normalized role local part>',
    email_excerpt: '<helper observed snippet>',
    business_excerpt: '<same helper observed snippet>'
  }
}
```

Only these fields reach `email_finish_research_batch({ p_run_id, p_claim_token, p_candidates, p_error_code })`; arbitrary provider body, opt-in, draft/send/campaign fields and summaries are stripped. The database inserts candidate status and empty/null consent metadata; it never updates an existing contact's consent/status. Matching domain or `www.`-prefixed domain is required by the DB contract, so other subdomains are omitted by the runtime. Source evidence that lacks nearby organization context is omitted rather than augmented with invented prose.

`p_error_code` is null for success/zero/incomplete/refused batches, or one of the four fixed database allowlist codes exported as `EMAIL_RESEARCH_ERROR_CODES`:

| Persisted code | Runtime conditions |
| --- | --- |
| `EMAIL_RESEARCH_PROVIDER_FAILED` | Provider/unknown/storage-read exceptions and deadline failure |
| `EMAIL_RESEARCH_PROVIDER_UNAVAILABLE` | Missing research model or insufficient public app facts |
| `EMAIL_RESEARCH_CREDENTIAL_UNAVAILABLE` | Missing, malformed/undecryptable or unavailable/expired credential |
| `EMAIL_RESEARCH_INVALID_RESPONSE` | Invalid claimed metadata/scope or invalid helper result structure |

Raw error messages, queries, plaintext keys, and provider/database bodies are never persisted as error codes.

Finish returns exactly:

```js
{
  allowed, completed, code,
  verified_count, inserted_count, skipped_count
}
```

Successful completion requires `allowed:true`, `completed:true`, `code:'EMAIL_RESEARCH_COMPLETED'`, bounded integer counts, and `inserted_count + skipped_count === submitted candidate count`. The verified count is database-confirmed and may include suppressed/existing contacts; skipped is **not just duplicates**. A fixed-code failure acknowledgement with `allowed:false`, `completed:false`, and zero counts records one failed batch. Invalid/expired/stale finish codes produce a blocked aggregate. Malformed/unconfirmed acknowledgement returns safe 503 and is never retried. SQL deduplication, permanent prior-send evidence, suppressions, settings validity, and terminal claim idempotency are authoritative.

## App-specific query variation

Queries stay <=500 characters and use only supplied public description/audience/niche/category/listing facts. A name alone cannot establish a business niche; missing niche facts fail instead of issuing generic organizations-for-every-app searches. Known claim-bearing medical/legal/financial-guarantee sentences are discarded, not rewritten into promises; URLs and email text are removed. Existing helper safety instructions treat all product/query/page content as untrusted data, never executable instructions or substantiated new product claims.

A hash of scheduled local day plus app request ordinal rotates supplied niche facets and geographic **search lenses**. A supplied country/region or geographic name actually found in app facts supplies location scope. Without location facts, the query explicitly labels scope worldwide instead of claiming the app has customers in an invented country. Urban/regional/rural/coastal/inland/metropolitan/small-town/suburban lenses vary public search coverage, not private personalization. The query requests public organization role emails on own HTTPS contact pages only and excludes personal/consumer/child contacts, guessed addresses, guarantees, and consent inference.

## Bounded paid execution

The Vercel function exports `maxDuration:180`; the runtime soft deadline is 170 seconds. The existing helper uses a 45-second provider timeout, at most ten source verification pages at eight seconds each, no redirects to unsafe addresses, and no paid retries/fallbacks. Runtime dispatch reserves 125 seconds for research plus 15 seconds for terminal RPC. A timer bounds helper completion to at most 125 seconds, and late results cannot insert candidates or trigger another finish. A timed-out JavaScript promise is not forcibly erased: production transport keeps the helper's own abort/time bounds; no underlying work can cause a paid retry or second finish.

The worker passes `{apiKey, model, product, query, limit, maxToolCalls:3, excludeEmails?}` to the helper. The parent-updated helper currently hardcodes Responses `max_tool_calls:3`, `max_output_tokens:2400`, `service_tier:'default'` and `store:false`; the worker's bound is an explicit pass-through for injected/future helper implementations. This **three web-tool-call bound** is separate from **eight provider requests/app/day**. Optional claim exclusions are forwarded from protected server data only; the helper sanitizes them to public role addresses. The current claim SQL does not return exclusions, so database deduplication remains essential and old sources can reduce new inserts.

## Safe HTTP aggregates

Authorized responses contain only `disabled`, `claimed`, `completed`, `failed`, `blocked`, `providerRequests`, `discovered`, `inserted`, `skipped`, optionally a fixed safe code on configuration/storage/runtime failure. `discovered` means database-confirmed verified count after successful settlement; `inserted` means new candidate records. No emails, sources/evidence, organizations, summaries, queries, workspace/app/run IDs, claim tokens, provider keys, ciphertext, or raw database/provider details are returned.

## Offline validation

```sh
node --check api/email-research-cron.js
node --check api/email-research-runtime.js
node --test tests/email-research-worker.test.mjs
```

Tests replace `fetch` with strict synthetic RPC fixtures, use a temporary synthetic vault root to encrypt fake keys, and inject the research function. Any non-RPC URL or unrelated database operation fails the test; no provider/DNS/HTTPS source/browser/production call or send operation can occur. Coverage includes method/auth/disabled independent gates; strict budgets; no-job/blocked/invalid/expired claims; one-shot claim-scoped credentials; model/key failures; app-specific deterministic queries; one batch/tool-bound pass-through; structured observed evidence and candidate-only fields; dedup/verified/inserted/skipped aggregation; incomplete/zero completion; fixed failures/no retries; staleness/finish failures; deadlines; and opaque responses.
