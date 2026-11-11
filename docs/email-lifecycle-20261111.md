# Email lifecycle repair — 2026-11-11

## Scope and authorization

This change is **prepared code and an additive migration only**. It does not apply SQL to Supabase, enable deployment flags, start a scheduler, connect a provider, send mail, rotate accounts, or change stored queue, quota, or diagnostic history. Production deployment/application requires separate authorization.

The previous launch path approved/enabled a campaign before checking the mailbox account, then separately enabled the account and workspace connection. A failure could leave durable partial approval. `email_activate_campaign` now validates and performs those three changes in one PostgreSQL transaction. Existing account and connection identities are used; no account creation, rotation or credential access is involved.

## API exports

`api/email-lifecycle.js` exports:

```js
getEmailCampaignReadiness({ workspaceId, productId, accessToken })
activateEmailCampaign({ workspaceId, productId, campaignId, reviewRevision, accessToken })
```

Both require a caller access token and pass it to `emailDb` for a human-JWT RPC. Neither uses a privileged/service-role fallback. Missing tokens are rejected before network activity. Activation requires a 64-character SHA-256 hexadecimal revision; malformed or missing revisions return a fixed `EMAIL_REVIEW_STALE` HTTP 409 error without a database call. SQL activation blockers become allowlisted HTTP 409 messages, never arbitrary SQL/provider detail. Successful activation returns exactly `{ allowed: true, code: 'EMAIL_CAMPAIGN_ACTIVATED', status: 'approved' }`.

The parent campaign handler must require `confirmSchedule === true`, enforce deployment/scheduler gates, and call this activation wrapper instead of issuing preliminary campaign/account/connection PATCH requests. The UI must obtain a new server readiness result and explicitly review the schedule before supplying its revision. These exports do not alter environment/deployment gates.

## Readiness shape and count semantics

```js
{
  allowed: true | false,
  code: 'EMAIL_READY' | /* fixed blocker code */,
  status: 'ready' | 'blocked',
  reviewRevision: /* SHA-256 hex string, or null for absent scoped app/campaign */,
  counts: { optedIn, approvedDrafts, eligibleRecipients },
  eligibleRecipients: [
    { id, email, organization, draftId, subject, body }
  ],
  deliveryGates: {
    productActive, campaignConfigured, senderConfigured,
    connectionEnabled, accountEnabled, campaignEnabled
  },
  deliveryPauseReason: null | 'provider_rejected' | 'submission_unknown' | 'reconnect_required',
  blockers: [ /* safe strings; empty when allowed */ ]
}
```

`counts.optedIn` counts app-specific contacts whose `opted_in` record contains a human recorder, recorded timestamp and nonempty method/date plus an evidence reference of at least 20 trimmed characters. **It includes suppressed or permanently consumed addresses**; it is a consent-record count, not a delivery-eligibility count. A public-source/import candidate is never counted as opted in. Evidence is an operator attestation, not an independently verified recipient opt-in.

`counts.approvedDrafts` counts approved, nonempty, human-approved draft rows joined to these genuinely recorded contacts and passing suppression, permanent workspace-recipient exclusion and cross-local-day exact-copy exclusion. This is the **eligible approved-draft count**, not a count of all drafts merely marked approved. Multiple eligible draft rows for one recipient can increase this number.

`counts.eligibleRecipients` is the distinct recipient count over that same fully SQL-filtered eligible join. These full server counts are not derived from browser-loaded contact/draft slices. The preview contains at most `campaign.daily_limit` distinct recipients (always <=100), one selected eligible copy each; the wrapper also enforces an absolute 100-row response bound. Scope is the caller-member workspace and selected product/campaign. Only safe recipient/copy data is returned; no account key, credential envelope, token, or unrestricted table access is exposed.

Readiness is a **review gate, not a delivery guarantee**. `allowed` can be true while connection/account/campaign sending flags are false: explicit transactional approval is what enables the selected schedule. Fixed mailbox pause metadata is shown separately; a fresh explicit human review can recover a still-configured expected sender. A reconnect must first repair an actually unconfigured/mismatched sender. Deployment gates, due time, shared rolling quota, diagnostic quota, suppression/consent, permanent recipient consumption and cross-day exact-copy checks remain enforced independently by the existing worker/SQL claim path. Preview order is advisory rather than a reservation or a guaranteed claim sequence.

## SQL protection and revision

The member-checked `email_campaign_readiness(uuid,uuid)` and admin-checked `email_activate_campaign(uuid,uuid,uuid,text)` are SECURITY DEFINER with an empty fixed search path. They reuse `auth.uid()`, `get_workspace_role` and `is_workspace_admin`; human RPC execution is revoked from PUBLIC, anon and service_role and granted only to authenticated. The shared private readiness implementation is not callable by any client/service role.

Readiness locks the workspace advisory, workspaces/member/product/campaign rows, connection row, existing account row and account advisory in dispatch/diagnostic-compatible order. Activation takes the connection row FOR UPDATE (readiness FOR SHARE), retaining its scope/account identity until commit. Preference rows are locked too; membership/admin status is rechecked under the locks. Existing mutation/suppression/claim RPCs use the same workspace advisory. Deadlocks from concurrent row-first edits may abort safely; they must not be treated as permission to retry an external mail submission.

The SHA-256 fingerprint covers all campaign configuration/state, active product facts, configured sender/preference and stable connection/account identity, connection/account budgets and flags/pause metadata, **the complete app candidate/contact set and complete campaign draft identity/content/approval set**, workspace suppression and permanent claim/reservation evidence, and the current app-local date. It is not an `updated_at`-only token and is not limited to preview 100. Connection `updated_at` additionally makes a concurrent connection repair invalidate old review without inspecting credentials. Revision is returned even when eligibility is zero for an existing scoped app/campaign.

The revision is compared under those locks before any write. Archived/wrong-scope apps, missing/mismatched configured sender/account, incomplete sender/postal/audience/language fields, unsafe HTTPS destination and zero eligible recipients are blocked. HTTPS validation excludes userinfo, non-443 ports, whitespace, numeric hosts, localhost, `.local` and `.internal` destinations. It does not fetch the destination or claim DNS/semantic verification. Truthful advertising, accurate postal information and the actual scope/date of opt-in remain human review obligations.

An additive SECURITY INVOKER campaign trigger prevents existing authenticated INSERT/UPDATE privileges from bypassing transactional activation. Both the actual database definer role and transaction-local selected-campaign marker are required. Forging only the marker is insufficient. Normal editing and pausing remain available through existing RLS; configuration edits continue to clear campaign/draft approval. A failed final connection write rolls back the previously successful campaign/account writes atomically.

## Mailbox-wide pause and recovery

The additive nullable `delivery_pause_reason` columns on accounts and connections accept only `provider_rejected`, `submission_unknown` or `reconnect_required`. Applying the migration leaves existing flags and rows unchanged apart from these new NULL fields.

`email_pause_mailbox(p_workspace_id uuid,p_reason text)` is a service-only SECURITY DEFINER RPC. It resolves the existing account through the supplied workspace connection, obtains all affected workspace advisory locks in sorted order before connection/account locks, and pauses the account, all its workspace connections, and all currently approved campaigns across those connections. Scope-change races abort with a serialization error rather than silently choosing another account. A bounded fixed `{allowed,code,status}` result reveals no account identity or credentials. It never modifies prepared/claimed/terminal queue rows, quota reservations or diagnostic rows; permanent no-repeat/uncertain-send evidence remains intact.

After a pause, human review/activation enables only the selected campaign, the selected workspace connection and the shared account. Other campaigns—including other apps in the same workspace—and other workspace connections remain paused. Their connection-specific pause reason is retained until independently reviewed/repaired. Account-level recovery cannot silently restart a peer schedule.

`email_connection_status` retains `configured`, `email`, `expected_email`, and `daily_budget` and adds exactly `connection_sending_enabled`, `account_sending_enabled`, and allowlisted `pause_reason`. It remains human-member-checked and has no credential-table grants.

## Offline validation

```sh
node --test tests/email-lifecycle.test.mjs tests/email-lifecycle-migration.test.mjs
```

The lifecycle migration tests load the already installed local module at `/tmp/email-db-validation/node_modules/@electric-sql/pglite/dist/index.js`; if it is unavailable, only the durable PostgreSQL test is skipped, explicitly. No test contacts Supabase, Gmail, OpenAI, or another provider.

Coverage includes mocked JWT-only wrappers and safe 409 payloads; unchanged migration-time flags and prior worker RPC/ACL definitions; member/admin/anonymous/service-role denial and private table ACLs; zero eligibility, wrong scope, archived apps, expected sender and strict HTTPS validation; full-set revision invalidation beyond preview 100; account changes without timestamps; lifetime consumed-recipient and cross-day copy exclusion; direct UPDATE/GUC-spoof denial; synthetic final-write failure with complete rollback verified again after durable-store reopen; valid atomic activation; mailbox-wide peer pause with untouched history; and explicit review recovery without peer reactivation.
