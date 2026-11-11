# Daily Facebook Drafts UI

## Integration

The default export in `src/pages/FacebookDailyDrafts.jsx` is the route page. It uses the existing `Layout`, `WorkspaceContext`, Supabase auth events, and `authenticatedApi` headers. The parent has wired it at `/facebook-drafts`; `/facebook-daily` was the initial proposed path. This task did not modify `src/App.jsx`, `Layout`, existing CSS, API handlers, migrations, storage, or any other shared file.

`FacebookDailyDraftsWorkspace` is also exported for isolated rendering and tests. Its props are `workspaceId`, optional `workspaceName`, `role`, `disabled`, `authScope`, and `authCurrent`. The default route supplies an auth epoch and synchronous ref-based guard; consumers that embed the view elsewhere must preserve those guards. Owner/admin roles expose scheduling and read-only image library counts. Members can browse, copy saved text, and download saved originals.

The page reads the complete active app set in **one authenticated batched request**, not one request per app. It renders exactly the returned validated apps; 25 is not hardcoded. Search is local and matches app names, saved body text, and hashtags. Today and Tomorrow use the server’s `today` date in `America/New_York`, not the browser clock. Other dates request only that exact date. Missing records, including today and future dates, say **Not created yet**; no historical fallback or generation occurs during browsing.

## API transport

`facebookDailyDraftsAction` sends authenticated `POST /api/facebook-daily-drafts`, using `credentials: 'same-origin'`. The function accepts `{ workspaceId, action, payload, signal, isCurrent }`; `payload` is a client-call convenience, while fields are flattened and whitelisted in the HTTP JSON:

```json
{
  "workspaceId": "<workspace UUID>",
  "action": "get_workspace_status",
  "scheduledDay": null
}
```

`scheduledDay` is either a real `YYYY-MM-DD` date or `null` for server-local today. Only the following mutation is allowed, after the owner/admin review dialog’s final confirmation:

```json
{
  "workspaceId": "<workspace UUID>",
  "action": "save_workspace_settings",
  "enabled": true,
  "timezone": "America/New_York",
  "startHour": 3
}
```

The save result must at least contain the matching root `workspace_id`. A follow-up read confirms the actual enabled flags on every returned active app before the UI reports saved settings. Enabling requests recurring ordinary draft generation, not immediate generation, connection, research, or publication. Pause preserves existing saved drafts and images; a run already in progress may finish. No automatic retry occurs.

The read result is direct JSON, not wrapped in a `dailyCampaign` or `data` object:

```text
{
  workspace_id, scheduled_day, today, timezone: 'America/New_York',
  apps: [{
    workspace_id, product_id, app_name,
    app_store_url: canonical apps.apple.com HTTPS URL | null,
    facebook_page_url: saved URL | null,
    settings: { enabled: boolean, timezone: 'America/New_York', start_hour: 3 },
    assets_count: actual nonnegative integer,
    draft: null | {
      id, workspace_id, product_id, scheduled_day,
      body, hashtags, app_store_url,
      asset_id: UUID | null, image_path: approved PNG path | null,
      status: 'draft', source, created_at, updated_at
    }
  }],
  today_counts: { apps, drafts, images }
}
```

Both **root and app-row `workspace_id` are required**, including rows with `draft: null`. Every saved draft also requires exact workspace, product, and requested-day fields. Missing ownership IDs, duplicate app/draft IDs, impossible dates, unsafe copy or links, inconsistent today counts, and cross-app image paths fail closed before rendering or exporting content. Today counts describe today even while browsing a different date. Selected-date counts are calculated from the actual returned saved records, and library totals sum actual `assets_count` values. A library of 40 images is labeled **40 library images**, never `40 / 20` or an invented generic target.

The client accepts saved hashtags as plain hashtag text (or a bounded array of hashtag tokens, projected to separate text). Body text must include the exact app row’s canonical App Store link; another app’s link, HTML, control characters, or foreign links are rejected. Draft status must remain `draft`. An app without an App Store URL may still have a missing-draft card, but cannot expose a copyable saved draft. The UI ignores other server metadata and never consumes `source_url`.

## Review and export

Each card provides the saved body and separate hashtags in bounded read-only textareas. **Copy Facebook post** copies the exact body plus two newlines and saved hashtags, without appending a guessed or duplicate store link. **Copy hashtags** copies only the saved hashtags. Clipboard failure offers an exact read-only manual-copy field. All external use still requires human review.

**Download PNG** uses only a saved, app-matching approved original whose path is exactly:

```text
/facebook-assets/{workspace UUID}/{product UUID}/{64 lowercase hex characters}.png
```

No `WEBP` downloads, SVG reconstruction, App Store icon fallback, foreign app image, external source URL, arbitrary storage URL, query strings, or traversal paths are accepted. The approved same-origin route may serve the original via the parent’s durable image proxy; that does not change the path allowlist. Parent intake can convert supplied JPEG/WEBP to PNG before registering assets. Each image preview uses `height: auto`, `object-fit: contain`, and a bounded maximum height, so the full original is visible without cropping. Download is disabled until the exact saved image preview has loaded with nonzero natural dimensions.

The local export fetches the same-origin path with redirects rejected, checks PNG MIME and PNG signature, then creates a native blob anchor with a `.png` filename. The browser’s download is **requested**, not verified as completed on disk. Network, content-type, image-load, or signature failures expose only a link to that same saved original for manual save; no download success is claimed.

A current saved Facebook Page link is shown only after HTTPS hostname/path safety checks. Null, unsafe, login, share, groups, and redirect links instead display **Page link not saved**. No Page URL is guessed, no Page is created, and no Facebook connection or publication is performed.

## Scope and concurrency safeguards

The route invalidates its auth ref synchronously when Supabase reports sign-out, a new sign-in, or an account change, before the delayed WorkspaceProvider initialization can expose the new workspace. The child view increments a render-time epoch for workspace, selected date, auth identity/epoch, permission, or disabled-state transitions. Old saved content is hidden in that render, including away-and-back workspace transitions.

Each read checks scope after asynchronous auth and after response parsing. Refresh cancels the previous read and any local export; date changes can likewise cancel pending clipboard/download work. A scope-checked snapshot, request sequence, operation sequence, abort signal, and row/search membership guard protect captured handlers and late responses. Unmount aborts work and prevents late state updates. A single operation lock prevents duplicate final schedule confirmations. Settings writes are never automatically retried.

A clipboard operation **already handed to the browser** cannot be physically revoked by JavaScript; the code prevents dispatch after a stale auth wait and prevents stale success/error UI afterward. An image fetch or blob conversion still pending at a scope change cannot create or click the download anchor. The server remains responsible for enforcing authenticated workspace membership and owner/admin mutation permission; frontend role checks are not a security boundary.

## Image intake and scheduling

The lower owner/admin-only **Image libraries** panel is a read-only inventory listing app names and actual saved library counts. There is no file input, upload button, fake local-selection form, or app selector. It does **not** call `setActiveApp` or switch the global app. **Storage upload is intentionally not implemented**: no file bytes are sent, no asset count is incremented, and no success toast claims an upload. The parent’s approved intake pipeline ingests supplied sets, reads them, and matches captions at the asset level. Refresh after intake updates the actual library counts. The panel says: “Your supplied images are matched to this app at the asset level. Add further sets through approved intake; no public posting.”

Images rotate within the matching app’s supplied library and may repeat cyclically; daily drafts do not imply newly generated pictures. The hero and fixed confirmation dialog state a **3:00 AM Eastern start** and **4:00 AM review target**, with no readiness/completion guarantee. Scheduling requires the parent’s secured server/cron setup; this page alone cannot activate deployment infrastructure.

## Checks

Run the isolated credential-free suite:

```sh
node --test tests/facebook-daily-ui.test.mjs
```

The suite compiles the actual client and JSX into a synthetic React hook harness. Auth headers, API transport, auth events, clipboard, image fetches, blobs, anchors, and route scope are mocked. It makes no Facebook, Supabase, provider, database, browser, or storage calls. Coverage includes 25-app single-read rendering, 40-image library truthfulness, exact dates, missing/text-only drafts, unsafe scope/link/path rejection, separate copy, verified PNG export/failure, sign-out/workspace/date/refresh/unmount cancellation, synchronous auth ref invalidation, owner/admin one-confirmation scheduling, and read-only per-app library counts without upload controls.
