import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/lib/emailCampaignClient.js', import.meta.url), 'utf8').replace(/^import .*authenticatedApi.*$/m, "const authenticatedHeaders = async () => ({}); const authenticatedJsonHeaders = () => globalThis.__dailyCampaignTestHeaders();")
const { emailCampaignAction } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const scope = { workspaceId:'11111111-1111-4111-8111-111111111111', productId:'22222222-2222-4222-8222-222222222222' }
async function fixture(work) {
 const previousFetch=globalThis.fetch, previousHeaders=globalThis.__dailyCampaignTestHeaders
 let dispatches=0
 globalThis.fetch=async(_url,options)=>{dispatches++;return new Response(JSON.stringify({body:JSON.parse(options.body)}),{status:200})}
 try{await work(()=>dispatches)}finally{globalThis.fetch=previousFetch;if(previousHeaders===undefined)delete globalThis.__dailyCampaignTestHeaders;else globalThis.__dailyCampaignTestHeaders=previousHeaders}
}
test('actual client rechecks current app/role AFTER asynchronous authenticated headers resolve',async()=>fixture(async dispatches=>{
 let resolve,current=true
 globalThis.__dailyCampaignTestHeaders=()=>new Promise(r=>{resolve=r})
 const promise=emailCampaignAction({...scope,action:'save_daily_campaign_settings',payload:{enabled:true,startHour:7,timezone:'America/New_York'},isCurrent:()=>current})
 current=false;resolve({Authorization:'Bearer synthetic-session'})
 await assert.rejects(promise,error=>error.name==='AbortError')
 assert.equal(dispatches(),0)
}))
test('actual client cannot dispatch a read or write after aborting during auth',async()=>fixture(async dispatches=>{
 for(const action of ['get_daily_campaign_status','update_daily_campaign']){
  let resolve;const controller=new AbortController()
  globalThis.__dailyCampaignTestHeaders=()=>new Promise(r=>{resolve=r})
  const promise=emailCampaignAction({...scope,action,signal:controller.signal})
  controller.abort();resolve({})
  await assert.rejects(promise,error=>error.name==='AbortError')
 }
 assert.equal(dispatches(),0)
}))
test('daily actions retain forced selected-app scope and preserve default callers',async()=>fixture(async dispatches=>{
 globalThis.__dailyCampaignTestHeaders=async()=>({Authorization:'Bearer synthetic-session'})
 const result=await emailCampaignAction({...scope,action:'get_daily_campaign_status',payload:{workspaceId:'foreign',productId:'foreign',action:'set_state'}})
 assert.deepEqual(result.body,{...scope,action:'get_daily_campaign_status'})
 assert.equal(dispatches(),1)
}))
