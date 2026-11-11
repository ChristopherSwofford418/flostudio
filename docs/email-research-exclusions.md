# Public research email exclusions: database-only additive hint

## Scope and compatibility

`supabase/migrations/20261111_email_research_exclusions.sql` replaces only the existing `public.email_claim_research_batch(p_workspace_limit integer default 200) -> jsonb | null`. It still reserves one eligible app/request and returns SQL `NULL` when no claim is available. Its existing arguments, return type and fields remain unchanged. A successful service-only claim additionally contains `exclude_emails`, a JSON array of canonical email strings (empty when no qualifying contacts exist), bounded to **100**.

The field is an optional downstream optimization: a worker can treat a missing field from an older database as an empty list. This migration does not change worker code, the source helper, any browser/client field, or any public HTTP response. It adds no standalone contact-reading RPC or client ACL. Runtime exclusion consumption is a separate change owned by the parent task.

## Eligible addresses only

The read runs **inside the authorized claim**, after the existing request reservation, and derives scope from that reserved run. Both the contact workspace and product must exactly match the claim; a contact from another app in the same workspace is not eligible. Both scope columns must also match the provenance run.

Every returned email must pass the unchanged internal `email_research_candidate(jsonb)` contract using its stored email, organization, source URL and evidence. This requires `source_evidence.kind = public_business_role_email`, an allowlisted organization-role local part, a canonical address, a nonempty organization, bounded evidence excerpts including the observed email, and HTTPS source/email/business-domain matching. The existing rejection of personal local parts, consumer/webmail domains, private/special-use domains, URL userinfo and nonstandard ports is not relaxed. The returned normalized validator email must equal the stored contact email.

Bare role addresses, ordinary imports, private/person/consumer addresses, and arbitrary unsubscribed imports are not enough. In addition to the structural gate, the stored `research_run_id` must resolve to a **completed, positive-insertion research run in the exact same workspace/product**. Its `settings_revision`, `scheduled_day`, and `researched_at` must equal the run's persisted revision, scheduled day and finish timestamp. The existing finish function writes both `researched_at` and `finished_at` using the same transaction-stable `now()`, so normal finish-created records qualify. Comparisons use PostgreSQL JSON values rather than casting arbitrary imported evidence; malformed evidence fails closed without aborting a claim. Historical verified contacts can qualify across later settings revisions; no current-revision restriction is added.

Qualifying contacts are ordered by `created_at DESC, id DESC`, and only then limited to 100. The unique `(workspace_id, product_id, email)` contact constraint prevents repeated addresses. Only email strings are returned—never evidence, source URLs, provenance IDs, consent records, credential envelopes or additional tokens. The pre-existing claim token remains part of the unchanged service claim contract.

Contact consent status is not used as provenance. A genuinely public-researched role contact can qualify after being opted in or unsubscribed, but arbitrary imported unsubscribed addresses cannot. Inclusion is only a duplicate-research hint; it never establishes consent or makes a suppressed address deliverable. The existing validator is a structural gate, not a new independent source fetch. As before, the worker must verify actual public source evidence; this change neither replaces nor relaxes that verification.

## Preserved safety and state

The original claim body is preserved verbatim except for one local variable, the scoped read, and the additive return field. The tests compare that stripped body byte-for-byte against `20261111_email_daily_research.sql`. Global/workspace advisory lock order, owner/admin actor authorization and scope locks, archival/start-hour checks, fairness/claim order, request reservations, target reservations, 15-minute expiration, local-day/UTC-day/rolling-24-hour limits, default workspace cap of 200, and settings-revision behavior remain unchanged.

Applying or reapplying the migration executes no data update, insertion, deletion or budget reset. Existing claim-time expiration and reservation writes remain inside the function and execute only on normal subsequent claims. The migration changes no enabled settings (including an existing enabled 25-app portfolio with target 80/request limit 8), revisions, enabling actors, contacts, consent, histories, credentials, campaigns, drafts, delivery/sending settings or schedules. Existing finish deduplication and suppression are untouched.

`CREATE OR REPLACE` preserves the function identity. Explicit revocation removes execute from `PUBLIC`, `anon`, `authenticated`, and `service_role`, followed by an execute grant only to `service_role`. No helper grants, policies, table ACLs, or other RPC bodies change. The replacement retains `SECURITY DEFINER SET search_path = ''` and schema-qualified data references.

## Offline verification

Run from the repository root:

```sh
node --test tests/email-research-exclusions-migration.test.mjs
```

The test follows the existing disposable, durable PGlite pattern. It tries a locally installed `@electric-sql/pglite`, then the existing `/tmp/email-db-validation/node_modules/@electric-sql/pglite/dist/index.js` fallback. Structural tests always run; behavioral tests explicitly skip if neither local dependency exists. A successful run with a skip is not full database validation.

Fixtures contain only synthetic users, organizations, addresses, histories and settings. The credential-presence table has **no populated credential value**; no key or envelope is retrieved and no credential RPC is called. Tests never browse, access production, call a provider, send email, deploy or schedule anything. Each behavior scenario rolls back its runtime mutations, and the temporary PGlite directory is removed after testing.

Coverage includes application/reapplication and durable reopen with unchanged snapshots of settings, all 25 enabled research apps, revisions/actors, consent, credentials and delivery histories; unchanged other RPCs/table permissions; old integer/default interface; 110 safe rows reduced to the newest 100 after rejecting newer unsafe rows; exact workspace/product isolation; empty exclusions; malformed/wrong-scope/wrong-revision/noncompleted provenance; no personal, consumer, arbitrary import or imported-unsubscribed leakage; real finish-created provenance and unchanged dedup/suppression; consent-status preservation; private helper/service-only claim ACLs including no `PUBLIC` execute; 200 reservations across 25 apps with unchanged per-app 8-request/80-target limits; and current-actor/archive eligibility.

PGlite serializes local queries and is not a replacement for multi-session PostgreSQL contention testing. No live database application is included.

### Recorded result

The standalone command above completed with **9 tests passed, 0 failed, 0 skipped**, including its seven database subtests, on 2026-11-11. The handoff also runs the existing research migration regression suite alongside this new suite; see the parent task's final summary for the combined result.

Combined verification also completed successfully:

```sh
node --test tests/email-daily-research-migration.test.mjs tests/email-research-exclusions-migration.test.mjs
```

Result: **24 tests passed, 0 failed, 0 skipped**. Both suites used disposable local PGlite, not a live database.
