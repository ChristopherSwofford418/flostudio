# Workspace saved drafts panel

`src/components/EmailWorkspaceDraftsPanel.jsx` is an additive, content-only React viewer. Mount inside `.email-studio`, independent of selected-app state, using the parent’s authenticated workspace ID and readiness signals. Disable/unmount during sign-out, account changes, unresolved access or workspace loading. Remount with an authenticated-user key when an account change keeps the same workspace ID.

## Calendar and search

The panel discovers the complete authorized active app set using `getEmailWorkspaceAutomation`. It rejects truncated snapshots, duplicate/malformed IDs, scope mismatches and sets above 200 apps. A mount-local pool limits authenticated reads to three, including cancelled transports that ignore abort.

**Today** uses each app’s server-local date and the unchanged date-free `get_daily_campaign_status` request. The calendar sends only `payload:{scheduledDay:'YYYY-MM-DD'}` to that existing authenticated action. Client/server validate real Gregorian dates, preserve post-auth cancellation guards, and force workspace/product/action scope. Explicit dates call the new read-only `get_email_daily_campaign_date_status(uuid,uuid,date)` RPC. The private tables remain inaccessible directly; no new table grants are made.

The RPC selects only actual saved fields for one workspace/app/date with `LIMIT 1`, so history older than the newest 30 records is accessible. It returns unchanged server-local `today` metadata plus `selectedDay` and `selected:{scheduled_day,created}`. The panel validates raw ownership and requested date before normalization. Missing past/current records and not-yet-created future records never show content from another day. Browsing a future date never generates a draft.

**Tomorrow** derives its date with UTC calendar arithmetic from a consistent server-reported current day, never from the browser clock. It is disabled when that day is not yet confirmed or apps report different current days. **Search drafts** filters locally by app name, subject, body and date; it sends no search requests. **Clear search** restores all rows. Date changes immediately invalidate prior content, abort reads and block captured copy handlers. Search changes cannot copy a hidden row or leave an in-flight clipboard operation locked.

## Copy controls and prompts

**Copy subject**, **Copy body**, **Copy full text** copy exact saved plain text. Canonical App Store URL and content validators fail closed; address-bearing copy and routing headers are excluded. Clipboard failure supplies a read-only manual-copy box. Actual saved timestamps and configured creation start times appear per app; neither a schedule nor the viewer guarantees completion by a deadline.

Below each saved draft, `buildEmailDraftResearchPrompt` creates a bounded, deterministic, copyable text prompt. It runs no model or research service. The prompt uses the validated app name, UUID, saved date and matching listing URL. Seven organization segments and six countries rotate by app/date, repeating as a combination every 42 days. Industry relevance must be checked against listing facts. Different focus labels do not establish historical contact uniqueness; previous results are required for exclusions.

**Copy research prompt** stays visible without expanding the longer prompt. It copies only research instructions asking for up to 80 public business-role contacts from official organization pages, source verification and actual counts. It excludes invented/private/personal/minor addresses, BCC formatting, sending, assumed permission and provider bypass. Future/missing/error rows have no prompt. Optional copy telemetry contains only `{productId,field}`—never bodies, search terms or prompt text.

## Schedule and delivery boundaries

The owner’s 25 active New York draft schedules were moved to **3 AM America/New_York** to allow a buffer before a **4 AM** review beginning November 12, 2026. The protected worker checks every five minutes and can process 25 drafts per run, retaining one saved draft per app-local day. Server failures can still delay completion. Research and email-delivery times are unchanged; delivery remains disabled.

No recipient exports, extra provider calls, campaign activation, settings writes, history resets, new polling timers or global styles exist in this viewer.

## Offline checks

```bash
node --test tests/email-workspace-drafts-ui.test.mjs tests/email-draft-calendar-api.test.mjs tests/email-draft-research-prompt.test.mjs
EMAIL_TEST_PGLITE_MODULE=/tmp/email-db-validation/node_modules/@electric-sql/pglite/dist/index.js node --test tests/email-draft-calendar-migration.test.mjs
```

The JSX hook harness, API mocks and disposable database fixtures cover dates, future emptiness, history, exact ownership, private-table ACLs, bounded reads, calendar/search state changes, copy fallbacks, cancellation, unmounts and research-only prompts without external services.
