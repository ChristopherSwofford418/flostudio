# App Store Connect reporting requirements

Apple’s Sales and Trends API requires a Team App Store Connect API key with the Sales and Reports role and a Vendor Number. Its sales reports can be retrieved by report type, period, and vendor number. The FloStudio reporting key created for the owner workspace is a Team key named `FloStudio Production Read Sync` with the Sales and Reports role. The private `.p8` is a one-time Apple download and must be stored only as encrypted server-side ciphertext after the owner uploads it to FloStudio.

Apple’s Analytics Reports API covers downloads, commerce, and app usage. The Sales and Reports role can list and download reports, but Apple reserves creation and deletion of Analytics Report requests for an Admin role. Apple states that first analytics reports typically require one to two days after the initial request. FloStudio must present a pending/unavailable state instead of inventing a user, download, or purchase value while Apple reports are not generated.

In Apple’s terminology, **In-App Purchases** are purchase transactions. **Paying Users** are unique Apple Accounts that paid for an app or in-app purchase. **Active Devices** are devices with at least one session in the selected period, and are based on users who opted in to share analytics. These are not interchangeable metrics.

## References

[1]: https://developer.apple.com/documentation/appstoreconnectapi/get-v1-salesreports "Download sales and trends reports"
[2]: https://developer.apple.com/documentation/appstoreconnectapi/downloading-analytics-reports "Downloading Analytics Reports"
[3]: https://developer.apple.com/help/app-store-connect-analytics/reference/metrics-definitions/ "Metric definitions"
[4]: https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api "Creating API Keys for App Store Connect API"
