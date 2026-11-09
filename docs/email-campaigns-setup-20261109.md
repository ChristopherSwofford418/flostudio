# Flo Studio email campaigns — setup and operating limits

The agreed design is one shared Gmail budget distributed across active, approved app campaigns, not 100 independent mailbox allowances per app. At 25 equally configured campaigns, 2,000 daily messages allocates 80 per app; a 1,800-message budget allocates 72 and leaves nominal headroom of 200 for regular mail. Gmail measures a rolling 24-hour window across web, API, and ordinary SMTP clients. Flo Studio’s send-only grant cannot observe mail sent outside its worker, so neither allocation guarantees that Google will permit all scheduled sends. Published limits are not a deliverability guarantee. [1] [2]

## What the feature does

Email Campaigns has an app selector, editable sender name and postal address, app/ad link, audience, language, daily cap, local timezone and daily time. Contact research is source-linked and conservative: only observed organization-domain role addresses on publicly available business contact pages are accepted. It does not guess addresses, claim deliverability, or subscribe contacts. Imported and researched contacts remain candidates. An admin records actual app-specific permission before an email draft becomes send-eligible. [3]

AI drafts use the selected app’s saved facts. Drafts and campaign schedules require review. Gmail is connected through app-owned Google OAuth with send-only, openid, and email scopes; refresh credentials are encrypted in server-only storage. No password, application password, or private key belongs in chat or client code. [4] [5]

The backend includes durable queues, individual messages rather than BCC batches, fair shares, account-wide rolling quota reservations, per-app caps, a 30-day workspace recipient cooldown, workspace-wide suppression, and hashed one-click unsubscribe tokens. A Google acceptance ID is recorded as API acceptance, not proof of inbox delivery. Ambiguous requests are marked unknown and never automatically retried. A lost worker’s claimed item is also not automatically retried.

## Deployment prerequisites before activation

Use the existing Flo Studio Vercel/Supabase deployment, with the additive email migration. No Firebase project, billing change, social connection, or Apple setting is needed. The existing privacy-filtered Mixpanel/Firebase observability hooks are reused without passing recipient addresses or email bodies.

Server environment variables:

- `GOOGLE_EMAIL_CLIENT_ID`, `GOOGLE_EMAIL_CLIENT_SECRET`, and `GOOGLE_EMAIL_REDIRECT_URI` for the application-owned Google OAuth client. Production redirect: `https://www.flostudio.io/api/email-gmail`.
- `EMAIL_CREDENTIALS_ENCRYPTION_KEY`, or the already configured server-only vault root fallback. Keys must be configured through secure deployment controls, never copied into source or chat.
- Existing `SUPABASE_SERVICE_ROLE_KEY` for server-only operations and the workspace OpenAI vault for drafting.
- `OPENAI_EMAIL_RESEARCH_MODEL`: explicitly select an available Responses API model supporting `web_search` and structured JSON output. No deprecated model is silently selected. [6] [7]
- `EMAIL_PUBLIC_ORIGIN=https://www.flostudio.io`.
- `CRON_SECRET`, plus `EMAIL_CRON_ENABLED=true` and `EMAIL_LIVE_SENDING_ENABLED=true` only after the owner approves launch. Leaving these unset/false keeps the worker disabled.

Register an application-native scheduler for authenticated GET `/api/email-cron`, typically every five minutes on a deployment plan that supports it. For a Vercel Cron deployment, add a `crons` entry with `path: /api/email-cron` and `schedule: */5 * * * *` only after verifying the plan, secure cron-secret handling, and launch approval. This build does not silently activate that schedule. The worker evaluates each campaign’s timezone/time on each poll, handles DST by local date, does not backfill missed dates, and resumes idempotent queue preparation. Polling and queue drain may mean actual dispatch occurs later than the configured daily time. Each request has a bounded preparation/drain runtime and up to 100 individual send attempts.

The owner must complete Google consent, confirm account type/budget in Flo Studio, provide a real sender postal address, establish recipient opt-in, review drafts, and explicitly approve the schedule. The shared account and workspace connection are disabled after reconnect, budget change, or failure until approved again. Google OAuth testing-mode Gmail refresh tokens may expire after seven days; production publishing and applicable scope verification/internal-app requirements must be addressed for reliable unattended operation. [4] [5]

## Boundaries and unresolved dependencies

`gmail.send` cannot read bounces or unsubscribe replies. The real HTTPS unsubscribe endpoint updates Flo Studio immediately, but a human must review Gmail for bounces and reply-based opt-outs and suppress them before further campaigns. Automatic inbox processing would need separately approved broader access. The screenshot’s Workspace billing warning is owner-managed; this build does not establish paid account status or change payment details. [4]

Google forbids unsolicited commercial Gmail. Public contact details and AI-inferred relevance are not marketing opt-in. Daily volume is a ceiling, not a requirement to invent recipients or resend to the same people. A 30-day cooldown requires enough distinct genuinely consenting recipients to sustain daily campaigns. [3]

A dedicated provider was also checked for the original 2,500/day goal: Resend’s paid plans have no daily email quota, but its acceptable-use policy explicitly bans cold outreach, scraped/purchased lists, and unsolicited messages. Changing providers does not remove permission requirements. No provider account, paid upgrade, API credential, or DNS change was created. [8] [9]

## References

[1]: https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace "Google Workspace Gmail sending limits"
[2]: https://developers.google.com/workspace/gmail/api/guides/handle-errors "Gmail API shared sending limits and errors"
[3]: https://support.google.com/mail/answer/15263077?hl=en "Google email subscription guidelines"
[4]: https://developers.google.com/workspace/gmail/api/auth/scopes "Gmail API OAuth scopes"
[5]: https://developers.google.com/identity/protocols/oauth2/web-server "Google server-side OAuth and offline access"
[6]: https://developers.openai.com/api/docs/guides/tools-web-search "OpenAI Responses web search"
[7]: https://developers.openai.com/api/docs/guides/structured-outputs "OpenAI structured outputs"
[8]: https://resend.com/docs/knowledge-base/resend-sending-limits "Resend account quotas and sending limits"
[9]: https://resend.com/legal/acceptable-use "Resend acceptable-use policy"

## November 9 implementation state

Both additive email migrations were applied successfully. The owner’s 25 active production apps have separate disabled draft configurations, initially 09:00 America/New_York and editable before launch. Their sender display name is ClearPass Technologies LLC, and the workspace’s requested sender is **info@clearpasstechnologies.com**. OAuth adds that login hint, rejects a different verified Google identity, and rechecks the required identity before unattended token refresh. If that address is an alias rather than the Google account identity, a separately verified send-as design is required; this build will not silently substitute another sender or request broader Gmail permissions.

No Gmail connection or queue was created, no contacts were imported or researched with paid calls, and no emails were sent. The Google application OAuth client, consent, account eligibility, recipient permission, physical postal address, research-model configuration and application-native scheduler activation remain launch prerequisites. This is deployed campaign infrastructure, not a claim that unattended sending is already running.
