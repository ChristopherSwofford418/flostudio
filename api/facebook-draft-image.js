import crypto from 'node:crypto'
import { emailDb } from './email-core.js'
export const config={maxDuration:30}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HASH=/^[0-9a-f]{64}$/
const SOURCE=/^https:\/\/files\.manuscdn\.com\/user_upload_by_module\/session_file\/310519663911058939\/[A-Za-z0-9_-]+\.png$/
const MAX=4000000
export function safeFacebookMarketingImageSource(value){return typeof value==='string'&&SOURCE.test(value)}
export async function readVerifiedFacebookPng(response,sha){
 if(!response.ok||response.redirected||response.headers.get('content-type')?.split(';')[0]!=='image/png'||Number(response.headers.get('content-length')||0)>MAX||!response.body)throw new Error('Image unavailable')
 const chunks=[];let size=0
 for await(const chunk of response.body){size+=chunk.length;if(size>MAX)throw new Error('Image unavailable');chunks.push(Buffer.from(chunk))}
 const data=Buffer.concat(chunks)
 if(data.length<24||!data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||crypto.createHash('sha256').update(data).digest('hex')!==sha)throw new Error('Image unavailable')
 return data
}
/** These are user-approved PUBLIC marketing graphics only, not private workspace uploads.
 * No arbitrary URL, file path, social credentials, or private asset bucket can be requested.
 * Internal metadata is service-role-only; response is PNG bytes, never database fields.
 */
export default async function handler(req,res){
 res.setHeader('X-Content-Type-Options','nosniff')
 if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');return res.status(405).end()}
 const {workspace,product,file}=req.query||{}
 if(typeof workspace!=='string'||typeof product!=='string'||typeof file!=='string'||!UUID.test(workspace)||!UUID.test(product)||!file.endsWith('.png')||!HASH.test(file.slice(0,-4)))return res.status(404).end()
 try{
  const sha=file.slice(0,-4)
  const meta=await emailDb('rpc/facebook_get_public_image',{method:'POST',body:{p_workspace_id:workspace,p_product_id:product,p_sha256:sha}})
  if(!meta||meta.sha256!==sha||!safeFacebookMarketingImageSource(meta.source_url))return res.status(404).end()
  const response=await fetch(meta.source_url,{redirect:'error',signal:AbortSignal.timeout(20000)})
  const data=await readVerifiedFacebookPng(response,sha)
  res.setHeader('Content-Type','image/png');res.setHeader('Content-Length',data.length)
  res.setHeader('Cache-Control','public, max-age=300, s-maxage=86400')
  res.setHeader('Content-Disposition',`inline; filename="facebook-${sha.slice(0,12)}.png"`)
  return req.method==='HEAD'?res.status(200).end():res.status(200).send(data)
 }catch{return res.status(404).end()}
}
