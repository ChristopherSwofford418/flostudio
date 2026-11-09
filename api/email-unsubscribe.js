import { emailRpc, hashEmailToken } from './email-core.js'

const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const page=(title,content)=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head><body><main><h1>${title}</h1>${content}</main></body></html>`
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store'); res.setHeader('Referrer-Policy','no-referrer')
  res.setHeader('Content-Security-Policy',"default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'")
  res.setHeader('X-Content-Type-Options','nosniff')
  if(!['GET','POST'].includes(req.method)) return res.status(405).end('Method not allowed')
  const token=String(req.query?.token || '')
  if(!/^[a-zA-Z0-9_-]{43,100}$/.test(token)) return res.status(400).end('Invalid unsubscribe link')
  if(req.method==='GET') {
    // A link scanner visiting GET must not silently alter subscription state.
    res.setHeader('Content-Type','text/html; charset=utf-8')
    return res.status(200).end(page('Stop marketing emails',`<p>Unsubscribe this address from marketing emails across this Flo Studio workspace. No sign-in is required.</p><form method="post" action="/api/email-unsubscribe?token=${escapeHtml(encodeURIComponent(token))}"><button type="submit">Unsubscribe from workspace marketing</button></form>`))
  }
  try {
    const removed=await emailRpc('email_unsubscribe',{p_token_hash:hashEmailToken(token)})
    if(removed!==true) return res.status(404).end('This unsubscribe link is invalid or expired.')
    res.setHeader('Content-Type','text/html; charset=utf-8')
    return res.status(200).end(page('You are unsubscribed','<p>This address is now suppressed from marketing across this workspace. Previously opted-in apps will not send further campaign messages.</p>'))
  } catch { return res.status(503).end('Unsubscribe is temporarily unavailable. Please contact the sender. This request did not sign you up for anything.') }
}
