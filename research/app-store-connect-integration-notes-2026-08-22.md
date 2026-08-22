# App Store Connect Integration Notes

FloStudio will use a per-portfolio-app server-side connection. The browser must never persist a private `.p8` file or JWT. Apple requires ES256-signed JWTs, with the key ID in the JWT header and a short-lived team-key token containing issuer ID, issued-at, expiry, and `appstoreconnect-v1` audience. Apple rejects most JWTs with lifetimes exceeding 20 minutes.[1]

Apple API keys are downloadable only once, so FloStudio must accept a `.p8` file through an authenticated HTTPS request, encrypt it before persistence, and return only connection state and metrics to the client. A key must have a role authorized for the desired App Store Connect resources.[2]

The initial sync should verify the selected App Store Connect API app resource, bundle ID, name, available versions, and review data. Sales and Trends reports require a vendor number in addition to API authorization. Analytics Reports require appropriate roles; Apple notes that an ongoing report request typically produces first data in approximately 24–48 hours, and historical snapshots are asynchronous.[3] FloStudio must show unavailable or pending rather than invent downloads, proceeds, or subscription metrics.

## References

[1]: https://developer.apple.com/documentation/appstoreconnectapi/generating-tokens-for-api-requests "Generating Tokens for API Requests"
[2]: https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api/ "App Store Connect API"
[3]: https://developer.apple.com/help/app-store-connect-analytics/overview/analytics-reports-api/ "Analytics Reports API"
