# Workspace research and daily-draft control

Migration: `supabase/migrations/20261111_email_workspace_automation.sql`.

This is an additive, **research and reusable daily drafts only** control. Applying the migration does not start anything. Its authenticated write RPC changes only `email_research_settings` and `email_daily_campaign_settings` for the complete active-app set in the selected workspace. Existing application-native timers and workers remain their owners; this migration creates no timers, claims, paid requests or provider calls.

**This is not email-delivery activation or a mailbox pause.** Start and pause never change delivery campaign states, sending flags, mailbox/account connection settings, contact consent, recipients, reviewed delivery drafts, send queues, suppression data, quota reservations, research reservations, or reusable daily-draft content/history. Both success modes return `deliveryChanged: 0`. Existing table permissions, policies, worker functions and other RPC ACLs are untouched.

## Authenticated status

```ts
get_email_workspace_automation_status(p_workspace_id: UUID): {
  workspace_id: UUID;
  reviewRevision: string; // exactly 32 lowercase hexadecimal characters (MD5)
  apps: Array<{
    id: UUID;
    name: string;
    researchEnabled: boolean;
    draftsEnabled: boolean;
    researchTarget: number;
    researchRequestLimit: number;
    researchTimezone: string;
    researchStartHour: number;
    draftTimezone: string;
    draftStartHour: number;
    todayDraftCreated: boolean;
    deliveryEnabled: boolean;
    senderDetailsComplete: boolean;
    optedInCount: number;
  }>;
  totals: {
    activeApps: number;
    researchEnabled: number;
    draftsEnabled: number;
    todayDrafts: number;
    deliveryEnabled: number;
    optedInContacts: number;
    researchRequestCeiling: number;
  };
  truncated: boolean;
}
```

Real owners, admins and members may read status. Ownership is the actual `workspaces.owner_user_id`; a `workspace_members.role = 'owner'` label grants nothing. The existing safe actor-role helper locks the workspace and caller membership with `FOR SHARE` and checks authorization again after locking. Anonymous requests, absent JWT actors, outsiders and service-role invocation are denied. Private snapshot execution is denied to all client/service roles.

Only same-workspace products with `coalesce(source_facts->>'archived', 'false') = 'false'` are active. Status orders by product UUID, displays **every active app up to 200**, and excludes archived and foreign products. For more than 200, `apps` contains the first 200, `truncated` is true, and all totals and the hash still cover the **complete** set. Bulk mutation is blocked, never applied to just the preview.

Status uses one SQL statement/MVCC snapshot with explicit public-name and selected-settings projections. It does not expose recipients, contact IDs, emails, consent contents, subjects, bodies, credentials, account identifiers, full product metadata, or research query text. It does not invoke readiness, credential or connection-status functions. Sender name and postal address are reduced to a boolean, not returned. Mailbox projections select only configuration/sending booleans, update revision timestamp and fixed pause state.

`researchEnabled` and `draftsEnabled` describe stored settings. A revoked enabling actor can leave a stored switch on while workers correctly decline to execute; the hash captures that actor's current authorization, and a fresh admin start repairs it. `todayDraftCreated` follows each app's draft timezone. `deliveryEnabled` is the existing **campaign sending flag**, not deliverability or a readiness promise. `senderDetailsComplete` means a nonblank sender name without CR/LF plus a nonblank postal address, not validation of that address or a complete delivery-readiness assessment.

`optedInCount` counts app-specific operator-recorded `opted_in` records with nonnull recording actor/time, string/nonempty method and recorded-at evidence, and at least 20 trimmed reference characters, matching the lifecycle opt-in evidence gate. It does not certify truth, imply recipient eligibility, or exclude previously contacted/suppressed addresses from this opt-in count. Those remain delivery-specific gates.

`researchRequestCeiling` is the **planned selected-workspace ceiling**, `min(200, sum(all active apps' configured per-app daily request limits))`, including disabled apps' preserved limits because bulk start proposes enabling all of them. It is not remaining quota, a request reservation, or a guarantee of target attainment. For the primary 25 apps with existing limits of 8, the ceiling remains 200. Existing custom per-app limits of 10 are preserved; the unchanged worker separately enforces the 200-workspace UTC-day and rolling-24-hour caps.

## Reviewed bulk write

```ts
set_email_workspace_automation(
  p_workspace_id: UUID,
  p_enabled: boolean,
  p_review_revision: string,
  p_confirm_research_cost: boolean = false
): {
  applied: true;
  mode: 'research_and_drafts';
  researchChanged: number;
  draftsChanged: number;
  deliveryChanged: 0;
  status: /* exact status object above, after the atomic write */;
} | {
  applied: false;
  code:
    | 'EMAIL_WORKSPACE_REVIEW_STALE'
    | 'EMAIL_WORKSPACE_NO_APPS'
    | 'EMAIL_WORKSPACE_AUTOMATION_LIMIT'
    | 'EMAIL_WORKSPACE_RESEARCH_CONFIRM_REQUIRED';
}
```

Only a real human owner/admin can write. A member may review but not start or pause. Start requires `p_confirm_research_cost = true`; omission, false or null produces `EMAIL_WORKSPACE_RESEARCH_CONFIRM_REQUIRED` before mutation. Pause does not require the cost confirmation. Null, wrong-length, uppercase, nonhex or mismatched review tokens return `EMAIL_WORKSPACE_REVIEW_STALE`. No active apps returns `EMAIL_WORKSPACE_NO_APPS`; more than 200 returns `EMAIL_WORKSPACE_AUTOMATION_LIMIT`. These four expected failures use fixed JSON codes because the API intentionally hides raw database exception payloads. Missing/revoked authorization remains SQLSTATE `42501`; a null mode is invalid SQLSTATE `22023`.

The caller should first read/display status, explicitly confirm research cost for start, then send the exact reviewed token. A stale response requires a fresh review, not silent application to a changed app/settings set. A successful response supplies the new token. This token is a concurrency fingerprint, **not** a secret, delivery approval, credential authorization or payment reservation.

### Stable review fingerprint

The private snapshot hashes workspace UUID; the complete ordered active-app IDs and public names; research/draft setting revisions and effective values including missing-row defaults; enabled state and enabling actor identity; research enable timestamp; research query; both actors' current owner/admin authorization; campaign sending state and sender-completeness boolean; and selected mailbox configuration/sending/update/pause state. Query text and actor identities remain private to the hash.

Revocation or actual ownership changes therefore invalidate old reviews even when settings revisions themselves have not changed. App addition, archival, unarchival, removal or rename, research/draft setting edits, mailbox sending state and mailbox update revision invalidate the review. A newly materialized defaults row also changes its settings revision and invalidates a missing-row review.

Contacts, their consent/metadata, draft creation/content edits, request/run history, quota consumption and local calendar-day rollover are deliberately **not** hashed. An unrelated product metadata edit also does not invalidate the token. Thus an unattended researcher finding another candidate or a daily draft appearing cannot invalidate this research/drafts-only confirmation or accidentally authorize recipient content. Delivery requires its own existing separate review.

### Preserve defaults, parameters and history

For a missing settings row, start inserts existing table defaults: research target 80, request limit 8, `America/New_York` at hour 6, blank query; daily drafts `America/New_York` at hour 7. Existing rows retain targets, limits, query, timezone, start hour and creation history. Start changes only enabled/actor/enable-time/revision/update-time when necessary; the draft settings table has no enable-time column. Already-enabled rows with any still-current owner/admin actor are skipped even when that actor is a different admin from the caller. Thus the existing 25 enabled research and draft schedules return zero changes and retain their revisions/timestamps.

When a stored enabling actor has lost authority, a fresh reviewed start adopts the current caller and changes only the necessary setting metadata. Pause clears enablement and actor fields on existing **active-app** settings, generates fresh revisions, and preserves every custom parameter and historical row. Repeated pause is idempotent; absent rows remain absent. Archived and foreign-workspace settings are never changed.

Targets are aspirational. Missing/conflicting App Store IDs or missing valid official listing URLs do **not** exclude apps from this automation status or bulk set. Daily draft creation still requires the unchanged worker's official identity/listing validations and due-time checks. Enabling does not guarantee generation; the UI must retain that distinction. No quota/run ledger is reset, even across start/pause, changed actors or settings revisions.

## Transaction and deadlock-safe ordering

All scope checks and token comparisons finish before the first write, and all writes and the resulting status are one transaction. Any SQL write failure rolls back every earlier research and draft setting change.

The order is:

1. `email-research-global` transaction advisory.
2. `email-workspace:<workspace UUID>` transaction advisory.
3. Snapshot the initial active-app UUIDs **without row locks**; acquire each `email-daily-campaign:<workspace>:<product>` advisory in ascending product UUID order.
4. Workspace `FOR SHARE`, caller membership `FOR SHARE`, then actual owner/admin recheck.
5. Short `LOCK TABLE public.products IN SHARE MODE NOWAIT` catalog write barrier; lock all active product rows `FOR SHARE` in UUID order; reread and compare the exact active UUID set with the initial set.
6. Hold all existing enabling-actor memberships `FOR SHARE` in user UUID order, and recheck the caller's role.
7. Compute the current complete review fingerprint; compare exactly; only then update/insert research and draft settings.

Step 3 deliberately precedes workspace/product SHARE locks. The existing daily save worker takes its per-app advisory before settings-row and actor/workspace SHARE locks. Waiting for its advisory while holding workspace SHARE can form an ownership-writer lock-queue inversion, so bulk never does that. It also never calls per-app save RPCs in a loop or takes a draft settings-row lock before its per-app advisory. Existing research writers/workers serialize through the same global-then-workspace ordering.

A product row SHARE lock alone cannot prevent a new FK-compatible app insert or unarchival of an initially archived row. The short catalog barrier prevents such phantoms after the final set check and until commit. It temporarily blocks product writes **across workspaces**, not reads; no table ACL is changed. `NOWAIT` avoids waiting on an existing catalog writer that might hold inverse scope locks. Contention raises safe SQLSTATE `55P03`; refresh/retry the **database-only** control, never replay paid requests/provider work. This conservative global catalog barrier should be kept short; it is not a persistent lock or scheduling change. Simultaneous operations are still subject to standard PostgreSQL transaction retry semantics.

## Offline validation

Run:

```sh
node --test tests/email-workspace-automation-migration.test.mjs
```

The tests always run static additive/allowlist/lock-order assertions. Behavioral tests use disposable filesystem-backed PGlite, discovered from the project or the existing `/tmp/email-db-validation` install; they explicitly report a skip if it is unavailable. Fixtures are synthetic, use actual existing migrations/triggers/ACLs, and never access live SQL, browser sessions, provider credentials or external services.

Coverage includes exact interfaces; complete primary-25 status and start idempotency; strict workspace/archival scoping; real owner/member/admin authorization and forged-owner rejection; stale settings/app sets and revoked actors; hidden 201st app binding; 200/201/zero boundaries; defaults and missing official links; preservation of custom parameters, per-app limit10 and existing 200-workspace cap; history/consent/delivery invariance; selected-app compatibility; late-write rollback across close/reopen; and static daily-worker lock-order regression checks. PGlite is single-session PostgreSQL-in-WASM, so static locking checks are not a claim of independent-session PostgreSQL contention testing.

Applied to the existing Flo Studio production database on 2026-11-11. Applying this migration did not change any live scheduling, delivery, consent, connection or credential state. The full build passed with 39 frontend and 649 backend/database assertions, with zero failures or skips.

The primary daily-use control is **Daily check · all apps**: one authenticated status read, no paid work or sending. Background schedules remain responsible for execution; no daily restart is required. All-app start and pause are separate reviewed controls under **Manage automatic schedules** and retain the transactional protections above.
