import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { buildAppMetrics, createAppleToken, latestAnalyticsInstance, recentSalesReportPeriods, salesReportPeriod, summarizeAnalyticsRows, summarizeSalesReport } from '../api/app-store-connect.js'

describe('App Store Connect secure sync primitives', () => {
  it('creates a short-lived ES256 team JWT using the supplied key ID and issuer ID', () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve:'prime256v1' })
    const token = createAppleToken({ issuerId:'57246542-96fe-1a63-e053-0824d011072a', keyId:'2X9R4HXF34', privateKey:privateKey.export({ type:'pkcs8', format:'pem' }) })
    const [encodedHeader, encodedPayload, encodedSignature] = token.split('.')
    const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'))
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
    expect(header).toMatchObject({ alg:'ES256', kid:'2X9R4HXF34', typ:'JWT' })
    expect(payload.iss).toBe('57246542-96fe-1a63-e053-0824d011072a')
    expect(payload.aud).toBe('appstoreconnect-v1')
    expect(payload.exp - payload.iat).toBe(120)
    expect(crypto.verify('sha256', Buffer.from(`${encodedHeader}.${encodedPayload}`), { key:publicKey, dsaEncoding:'ieee-p1363' }, Buffer.from(encodedSignature, 'base64url'))).toBe(true)
  })

  it('reports only values returned by Apple and explicitly marks reports that have not been authorized', () => {
    const metrics = buildAppMetrics({
      app: { id:'apple-app-1', attributes:{ name:'ResumeFix AI', bundleId:'com.example.resumefix', sku:'resume-001', primaryLocale:'en-US' } },
      versions: [{ attributes:{ versionString:'2.3.0', appStoreState:'READY_FOR_SALE', releaseDate:'2026-08-20T00:00:00Z' } }],
      reviews: [{ id:'review-1', attributes:{ rating:5, title:'Useful', body:'Helped me prepare.', createdDate:'2026-08-20T00:00:00Z', territory:'USA' } }, { id:'review-2', attributes:{ rating:3 } }],
    })
    expect(metrics.catalog).toMatchObject({ appStoreAppId:'apple-app-1', latestVersion:'2.3.0', latestVersionState:'READY_FOR_SALE' })
    expect(metrics.reviews).toMatchObject({ sampledReviewCount:2, averageRating:4 })
    expect(metrics.availability.downloads.status).toBe('requires_sales_or_analytics_report')
    expect(metrics.availability.proceeds.status).toBe('requires_vendor_number')
    expect(metrics.availability.subscriptions.status).toBe('requires_analytics_report')
  })

  it('aggregates Sales and Trends rows only for the selected Apple app and keeps proceeds separated by currency', () => {
    const sales = summarizeSalesReport([
      { 'Apple Identifier':'6776187110', 'Parent Identifier':'', Units:'5', 'Developer Proceeds':'0.70', 'Currency of Proceeds':'USD', 'Begin Date':'08/01/2026', 'End Date':'08/31/2026' },
      { 'Apple Identifier':'', 'Parent Identifier':'resumefix-001', Units:'2', 'Developer Proceeds (per unit)':'4.20', 'Currency of Proceeds':'GBP', 'Begin Date':'08/01/2026', 'End Date':'08/31/2026' },
      { 'Apple Identifier':'1234567890', 'Parent Identifier':'other-app', Units:'99', 'Developer Proceeds':'10.00', 'Currency of Proceeds':'USD' },
    ], { appStoreAppId:'6776187110', sku:'resumefix-001' })
    expect(sales).toMatchObject({ status:'available', matchedRows:2, appUnits:5, totalUnits:7, proceedsByCurrency:{ USD:3.5, GBP:8.4 }, period:{ startDate:'08/01/2026', endDate:'08/31/2026' } })
  })

  it('uses Apple’s year-month report-date format for monthly Sales and Trends reports', () => {
    expect(salesReportPeriod(new Date('2026-08-22T12:00:00Z'))).toBe('2026-08')
  })

  it('checks the current and five prior monthly report periods when looking for the latest available sales data', () => {
    expect(recentSalesReportPeriods(new Date('2026-08-22T12:00:00Z'))).toEqual(['2026-08', '2026-07', '2026-06', '2026-05', '2026-04', '2026-03'])
  })

  it('aggregates only Apple App Analytics acquisition rows into the selected app’s 90-day funnel', () => {
    const analytics = summarizeAnalyticsRows({
      now:new Date('2026-08-22T12:00:00Z'),
      downloadRows:[
        { Date:'2026-08-20', 'Download Type':'First-time Download', Counts:'40' },
        { Date:'2026-08-20', 'Download Type':'Redownload', Counts:'10' },
        { Date:'2026-08-20', 'Download Type':'Manual update', Counts:'6' },
        { Date:'2026-04-01', 'Download Type':'First-time Download', Counts:'1000' },
      ],
      engagementRows:[
        { Date:'2026-08-20', 'Event Type':'Impression', Counts:'1190' },
        { Date:'2026-08-20', 'Event Type':'Product Page View', Counts:'73' },
      ],
    })
    expect(analytics).toMatchObject({ status:'available', firstTimeDownloads:40, redownloads:10, totalDownloads:50, updates:6, impressions:1190, productPageViews:73, conversionRate:4.2 })
  })

  it('uses the newest Apple report instance when several processing dates are available', () => {
    expect(latestAnalyticsInstance([{ id:'old', attributes:{ processingDate:'2026-08-18' } }, { id:'latest', attributes:{ processingDate:'2026-08-20' } }])?.id).toBe('latest')
  })
})
