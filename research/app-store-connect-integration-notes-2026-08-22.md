# App Store Connect Integration Notes

FloStudio will use a per-portfolio-app server-side connection. The browser must never persist a private `.p8` file or JWT. Apple requires ES256-signed JWTs, with the key ID in the JWT header and a short-lived team-key token containing issuer ID, issued-at, expiry, and `appstoreconnect-v1` audience. Apple rejects most JWTs with lifetimes exceeding 20 minutes.[1]

Apple API keys are downloadable only once, so FloStudio must accept a `.p8` file through an authenticated HTTPS request, encrypt it before persistence, and return only connection state and metrics to the client. A key must have a role authorized for the desired App Store Connect resources.[2]

The initial sync should verify the selected App Store Connect API app resource, bundle ID, name, available versions, and review data. Sales and Trends reports require a vendor number in addition to API authorization. Analytics Reports require appropriate roles; Apple notes that an ongoing report request typically produces first data in approximately 24–48 hours, and historical snapshots are asynchronous.[3] FloStudio must show unavailable or pending rather than invent downloads, proceeds, or subscription metrics.

## References

[1]: https://developer.apple.com/documentation/appstoreconnectapi/generating-tokens-for-api-requests "Generating Tokens for API Requests"
[2]: https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api/ "App Store Connect API"
[3]: https://developer.apple.com/help/app-store-connect-analytics/overview/analytics-reports-api/ "Analytics Reports API"

## Sales and Trends Report Notes

The `GET /v1/salesReports` endpoint requires a vendor number, report type, subtype, frequency, and compatible version. Apple supports a `SALES` / `SUMMARY` report at daily, weekly, monthly, or yearly frequency with version `1_0`. For non-daily reports, report date is a `YYYY-MM-DD` value.[4]

The Summary Sales Report contains app-level Apple Identifier, Units, Developer Proceeds per unit, customer currency, and proceeds currency. FloStudio must filter source rows by the selected app’s Apple Identifier, multiply units by per-unit proceeds, retain a currency breakdown, and never combine currencies into a false total.[5]

Apple’s reporting UI documents that the vendor number appears in the Reports area under the legal entity name and is required for API report downloads. The Sales and Trends “proceeds” measure is estimated; finalized payment information belongs to Payments and Financial Reports.[6]

[4]: https://developer.apple.com/documentation/appstoreconnectapi/get-v1-salesreports "Download sales and trends reports"
[5]: https://developer.apple.com/help/app-store-connect/reference/reporting/summary-sales-report/ "Summary Sales Report"
[6]: https://developer.apple.com/help/app-store-connect/getting-paid/view-payments-and-proceeds/ "View payments and proceeds"

## App Analytics Reports Notes

The App Analytics screen and the Sales and Trends API are distinct Apple reporting sources. The acquisition funnel shown in App Store Connect—first-time downloads, redownloads, conversion rate, impressions, product page views, and updates—belongs to App Analytics. Apple defines Total Downloads as first-time downloads plus redownloads, and defines Conversion Rate as the relationship between unique impressions and total downloads.[7]

Apple’s Analytics Reports API exports compressed, tab-delimited data. An Admin key must request a report type for the first time; after that, Sales and Reports or Finance keys may download generated reports. An `ONGOING` request produces daily, weekly, and monthly reports, but Apple states that the first report arrives approximately 24–48 hours after setup. `ONE_TIME_SNAPSHOT` is the historical alternative.[8]

The secure per-app workflow is: read `GET /v1/apps/{id}/analyticsReportRequests`; create `POST /v1/analyticsReportRequests` with `accessType: ONGOING` when no request exists; read reports for the request; read daily report instances; read/download segments; parse the tab-delimited analytics content; aggregate only the selected product’s reports. The API returns opaque app and report resource identifiers, and report instance processing dates use ISO `YYYY-MM-DD`.[9] [10] [11]

[7]: https://developer.apple.com/help/app-store-connect-analytics/acquisition/acquisition/ "Acquisition"
[8]: https://developer.apple.com/help/app-store-connect-analytics/overview/analytics-reports-api/ "Analytics reports API"
[9]: https://developer.apple.com/documentation/appstoreconnectapi/post-v1-analyticsreportrequests "Request Reports"
[10]: https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_-analyticsreportrequests "Read Report Requests"
[11]: https://developer.apple.com/documentation/appstoreconnectapi/get-v1-analyticsreports-_id_-instances "Read a List of Instances of a Report"
