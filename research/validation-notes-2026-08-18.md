# FloStudio Validation Notes — 2026-08-18

The production build completed successfully after adding the Experiments workspace, experiment evidence ledger, tenant policy hardening, and truthful provider endpoints. A temporary sandbox preview was started on Vite and allowed through `server.allowedHosts` for browser validation. The unauthenticated `/experiments` preview rendered a blank route without browser-console errors, consistent with the route being protected by Supabase Auth and lacking a sandbox browser session. The authenticated production flow still requires manual verification after deployment.

The App Store Connect endpoint was syntax-checked. It now performs genuine Apple JWT signing and `GET /v1/apps` discovery, returns a real Apple response or diagnostic, and deliberately reports that sales/subscription metrics are **not synced** until a secure recurring report-sync configuration exists. The social endpoint no longer fabricates connections or published post IDs.
