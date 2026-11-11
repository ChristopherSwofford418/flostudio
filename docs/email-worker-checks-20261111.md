# Email worker repair checks — November 11, 2026

The application-native timer remains every five minutes, with its existing scheduler authentication and deployment gates. It queues and submits existing human-approved copies when the app-local send time is due. It does not autonomously research prospects, generate fresh AI content, approve drafts, warm up a mailbox, rotate accounts or retry submissions. Public availability of an address is not opt-in.

## Durable pause and recovery

The service-only `email_pause_mailbox(p_workspace_id uuid,p_reason text)` accepts only `provider_rejected`, `submission_unknown` or `reconnect_required`. It atomically pauses the shared account, connected workspaces and approved peer campaigns without changing queue, quota or diagnostic history. It must return `{allowed:true,code:'EMAIL_MAILBOX_PAUSED',status:'paused'}`. Database errors and blocked/no-op results cause a fixed 503, not a false pause success.

Worker-relevant Gmail invalidation paths now use the same queue-preserving mailbox pause. Explicit owner disconnect remains workspace-scoped; setup/budget changes retain their intentional scoped pause behavior. Failed or uncertain attempts and reserved quota are never reset. Fresh human recovery enables only the selected campaign and connection plus its shared account; peers stay paused.

Same-account peers stop in memory before pause I/O. When pause recording fails after a claim, the worker still attempts terminal `email_finish_send` recording before stopping. Acceptance is counted only after finalization succeeds. A failed finalization leaves a one-shot claim for human review, never automatic resubmission.

## Bounded pacing and fairness

`EMAIL_SEND_INTERVAL_MS` defaults to1000ms and is clamped to1000–10000ms. Pacing is deterministic, with no jitter or adaptive warm-up. It waits before a claim, subtracts elapsed work and rechecks the deadline. This is per-invocation pacing, not a distributed account pacing lock.

The worker retains its240-second deadline and300-second platform maximum. It attempts at most100 claims, including denied claims. Deferred prepared records can be considered on a later tick; already claimed records are never reopened.

Each app is restricted to its shared-account allocation after subtracting prior same-local-day claim evidence. An older prepared backlog cannot silently monopolize the account. Existing SQL remains authoritative for atomic reservations, eligibility, shared/app quotas, permanent workspace-wide recipient exclusion and exact-copy exclusion across local days.

The last suppression read follows unsubscribe-token creation. A committed opt-out before dispatch blocks submission. An opt-out after dispatch cannot retract Gmail’s accepted request and never permits an automatic resend.

## Validation and release boundary

The34 worker tests passed as part of the final full run. They use mocked fetch/provider strings and clock/timeout mocks, restore environment and fetch entries, and make no real Gmail or AI request.

Final checks: production build passed;39 frontend tests passed;221 backend/database tests passed, zero failures and zero skips. Disposable PGlite behavior tests were enabled. Syntax and `git diff --check` passed. The validated additive lifecycle migration was applied; the immediate metadata check found25 disabled campaigns, one configured Gmail connection, zero enabled accounts and zero contacts/drafts/queue records.

These checks cover application control flow and database behavior, not guaranteed inbox placement. Gmail API acceptance is not confirmed receipt. No marketing send or deployment flag activation occurred in the repair tests. Production deployment and the no-send authorization check are recorded in the user-facing repair report after completion.
