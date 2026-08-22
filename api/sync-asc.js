export default async function handler(_req, res) {
  return res.status(410).json({
    error: 'This App Store Connect route has been retired. Refresh FloStudio and use the secure per-app connection flow.',
    code: 'ASC_ROUTE_RETIRED',
  })
}
