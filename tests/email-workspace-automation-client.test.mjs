import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const source=readFileSync(new URL('../src/lib/emailWorkspaceAutomationClient.js',import.meta.url),'utf8').replace(/^import .*$/m,'const authenticatedJsonHeaders=()=>globalThis.__workspaceAutomationHeaders();')
const {getEmailWorkspaceAutomation,setEmailWorkspaceAutomation}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const W='11111111-1111-4111-8111-111111111111',R='a'.repeat(32)
const snapshot=()=>({automation:{workspace_id:W,reviewRevision:R,apps:[]},deployment:{}})
const result=()=>({...snapshot(),applied:true,mode:'research_and_drafts',deliveryChanged:0})
async function fixture(work,reply=result()){
 const previous=globalThis.fetch,old=globalThis.__workspaceAutomationHeaders,calls=[]
 globalThis.__workspaceAutomationHeaders=async()=>({Authorization:'Bearer synthetic-session'})
 globalThis.fetch=async(url,options)=>{calls.push({url,options});if(reply instanceof Error)throw reply;return new Response(JSON.stringify(reply),{status:200})}
 try{await work(calls)}finally{globalThis.fetch=previous;if(old===undefined)delete globalThis.__workspaceAutomationHeaders;else globalThis.__workspaceAutomationHeaders=old}
}
test('read uses only forced workspace and one request; confirmed write strips send, copy, contact and product overrides',async()=>fixture(async calls=>{
 await getEmailWorkspaceAutomation({workspaceId:W});assert.equal(calls[0].url,`/api/email-workspace-automation?workspaceId=${W}`)
 await setEmailWorkspaceAutomation({workspaceId:W,enabled:true,reviewRevision:R,confirmResearchCost:true,productId:'foreign',sendingEnabled:true,body:'injected',action:'start_sending'})
 assert.equal(calls.length,2);assert.deepEqual(JSON.parse(calls[1].options.body),{action:'set_research_and_drafts',enabled:true,reviewRevision:R,confirmResearchCost:true,workspaceId:W})
}))
test('no network dispatch after workspace/role change during asynchronous authentication',async()=>fixture(async calls=>{
 let resolve,current=true
 globalThis.__workspaceAutomationHeaders=()=>new Promise(r=>{resolve=r})
 const pending=setEmailWorkspaceAutomation({workspaceId:W,enabled:true,reviewRevision:R,confirmResearchCost:true,isCurrent:()=>current})
 current=false;resolve({})
 await assert.rejects(pending,error=>error.name==='AbortError');assert.equal(calls.length,0)
}))
test('aborted read/write and stale post-response result never return success',async()=>fixture(async calls=>{
 const controller=new AbortController();controller.abort()
 await assert.rejects(getEmailWorkspaceAutomation({workspaceId:W,signal:controller.signal}),error=>error.name==='AbortError');assert.equal(calls.length,0)
 let current=true
 globalThis.fetch=async()=>{current=false;return new Response(JSON.stringify(result()),{status:200})}
 await assert.rejects(setEmailWorkspaceAutomation({workspaceId:W,enabled:true,reviewRevision:R,confirmResearchCost:true,isCurrent:()=>current}),error=>error.name==='AbortError')
}))
test('unconfirmed research cost or malformed scope/revision cannot fetch',async()=>fixture(async calls=>{
 assert.throws(()=>setEmailWorkspaceAutomation({workspaceId:W,enabled:true,reviewRevision:R,confirmResearchCost:false}))
 assert.throws(()=>setEmailWorkspaceAutomation({workspaceId:W,enabled:'true',reviewRevision:R,confirmResearchCost:true}))
 await assert.rejects(getEmailWorkspaceAutomation({workspaceId:'foreign'}));assert.equal(calls.length,0)
}))
test('foreign snapshots, malformed success and delivery mutation results are rejected with no retry',async()=>{
 for(const reply of [{...result(),applied:false},{...result(),deliveryChanged:1},{...result(),mode:'delivery'},{...result(),automation:{workspace_id:'foreign',reviewRevision:R,apps:[]}},{}])await fixture(async calls=>{
  await assert.rejects(setEmailWorkspaceAutomation({workspaceId:W,enabled:true,reviewRevision:R,confirmResearchCost:true}));assert.equal(calls.length,1)
 },reply)
})
test('transport/provider errors are sanitized and never automatically retried',async()=>fixture(async calls=>{
 await assert.rejects(setEmailWorkspaceAutomation({workspaceId:W,enabled:true,reviewRevision:R,confirmResearchCost:true}),error=>!error.message.includes('synthetic-private')&&error.message.includes('unconfirmed'));assert.equal(calls.length,1)
},new Error('synthetic-private-header')))
