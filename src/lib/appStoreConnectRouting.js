export function appStoreConnectPath(productId = '') {
  return `/portfolio?connectApp=${encodeURIComponent(productId)}#app-store-connect`
}

export function selectConnectionTarget(apps = [], requestedProductId = '') {
  if (requestedProductId && apps.some(app => app.id === requestedProductId)) return requestedProductId
  return apps[0]?.id || ''
}
