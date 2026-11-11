# Workspace saved drafts panel

`src/components/EmailWorkspaceDraftsPanel.jsx` is an additive, content-only, read-only React component. Mount it inside the existing `.email-studio` container, independent of selected-app state:

```jsx
import EmailWorkspaceDraftsPanel from '../components/EmailWorkspaceDraftsPanel'

<EmailWorkspaceDraftsPanel
  workspaceId={workspaceId}
  workspaceName={workspaceName}
  disabled={workspaceLoading || Boolean(workspaceError) || !authenticatedUser}
/>
```

Use the parent’s actual authenticated/session readiness signals. Disable or unmount on sign-out, account change, unresolved access or workspace loading. For account changes that keep the same workspace ID, remount with a non-sensitive authenticated-user key or pass through a disabled transition; this component intentionally does not establish a second auth subscription. Current workspace members can read; no edit-role prop is required. Do not pass selected-app records, recipient data or delivery controls.

The component discovers the complete active app set using `getEmailWorkspaceAutomation`, rejects truncated snapshots, duplicate/non-UUID app IDs, missing names, scope mismatches and sets exceeding 200 apps, then reads `get_daily_campaign_status` for each app. A mount-local pool bounds all in-flight authenticated reads to three, including overlapping refresh epochs. Scope epoch, request sequence, `AbortController` and post-await checks suppress stale work. There is one manual **Refresh all** button, an initial read, and no polling timer.

Daily settings and every raw campaign row must match the requested workspace and app before `dailyCampaignStatusResponse` drops their IDs. Only a saved `draft` matching the server’s exact `today.scheduled_day` is shown. Missing and failed reads remain distinct; aggregate automation counts never stand in for confirmed records. Canonical App Store links, plain-text limits and saved-copy validation fail closed. Address-bearing copy and message-routing headers are not displayed or copied. Actual saved timestamps are shown in each app’s reported timezone; neither a schedule nor this viewer guarantees completion by a particular time.

**Copy subject**, **Copy body** and **Copy full text** write only actual saved content following a user click. Copying is locked while refreshing, disabled, stale or errored. Clipboard failure offers a read-only textarea for manual selection. Optional `onCopy({ productId, field })` receives only non-sensitive metadata after a successful current-scope copy; observability errors are ignored. No draft creation, settings writes, recipient APIs, contact exports, provider integration or sending occurs.

## Offline verification

```bash
node --check tests/email-workspace-drafts-ui.test.mjs
node --test tests/email-workspace-drafts-ui.test.mjs
```

The lightweight harness compiles actual JSX using the installed Vite/esbuild dependency and mocks all authenticated reads, auth waits and clipboard actions. It includes 25-app concurrency, cross-scope rejection, exact-day selection, honest per-app errors, strict saved content, clipboard fallback, stale workspace/epoch handlers, auth cancellation and late unmount response coverage. No external services are used.
