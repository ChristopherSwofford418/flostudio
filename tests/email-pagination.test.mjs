import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source=readFileSync(new URL('../src/lib/emailCampaignClient.js',import.meta.url),'utf8').replace(/^import .*authenticatedApi.*$/m,"const authenticatedHeaders=async()=>({Authorization:'Bearer mock-member'});const authenticatedJsonHeaders=async()=>({Authorization:'Bearer mock-owner','Content-Type':'application/json'});")
const client=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const {getEmailCampaigns,emailCampaignAction,emailPageOffset,mergeEmailRecords,gmailDeliveryState}=client
const complete={campaign:null,contacts:[],drafts:[],queue:[],connection:{configured:true},readiness:{}}
async function mocked(fn,work){const before=globalThis.fetch;globalThis.fetch=fn;try{await work()}finally{globalThis.fetch=before}}

test('pagination validates bounded integer offsets before authenticated fetch',async()=>{
  for(const value of [-1,1.2,50001,'bad',Infinity]) assert.throws(()=>emailPageOffset(value))
  assert.equal(emailPageOffset('200'),200)
  await mocked(async(url,options)=>{
    const query=new URL(url,'https://example.test').searchParams
    assert.equal(query.get('workspaceId'),'workspace')
    assert.equal(query.get('productId'),'product')
    assert.equal(query.get('contactsOffset'),'200')
    assert.equal(query.get('draftsOffset'),'100')
    assert.equal(options.headers.Authorization,'Bearer mock-member')
    return new Response(JSON.stringify(complete))
  },async()=>{await getEmailCampaigns({workspaceId:'workspace',productId:'product',contactsOffset:200,draftsOffset:100})})
  await mocked(async()=>{assert.fail('Invalid page must not fetch')},async()=>{
    await assert.rejects(getEmailCampaigns({workspaceId:'workspace',productId:'product',contactsOffset:-1}))
    await assert.rejects(getEmailCampaigns({workspaceId:'workspace',productId:'product',draftsOffset:1.5}))
  })
})

test('merging saved pages deduplicates records and retains the newer page representation',()=>{
  assert.deepEqual(mergeEmailRecords([{id:'a',status:'candidate'},{id:'b'}],[{id:'a',status:'opted_in'},{id:'c'},{}]),[{id:'a',status:'opted_in'},{id:'b'},{id:'c'}])
})

test('schedule approval needs explicit declaration and fresh SHA256 review without accidental network',async()=>{
  await mocked(async()=>{assert.fail('Unreviewed activation must not fetch')},async()=>{
    for(const payload of [{state:'approved'},{state:'approved',confirmSchedule:true,reviewRevision:'bad'},{state:'approved',confirmSchedule:'true',reviewRevision:'a'.repeat(64)}]) await assert.rejects(emailCampaignAction({workspaceId:'workspace',productId:'product',action:'set_state',payload}))
  })
  await mocked(async(_url,options)=>{
    assert.deepEqual(JSON.parse(options.body),{state:'approved',confirmSchedule:true,reviewRevision:'a'.repeat(64),workspaceId:'workspace',productId:'product',action:'set_state'})
    return new Response(JSON.stringify({message:'mock approval only'}))
  },async()=>{await emailCampaignAction({workspaceId:'workspace',productId:'product',action:'set_state',payload:{state:'approved',confirmSchedule:true,reviewRevision:'a'.repeat(64)}})})
})

test('connected sender never implies enabled delivery or receipt, and pause messages are allowlisted',()=>{
  const c={configured:true,connection_sending_enabled:true,account_sending_enabled:true}
  const campaign={state:'approved',sending_enabled:true}
  const r={sendingEnabled:true,cronConfigured:true}
  assert.match(gmailDeliveryState(c,campaign,{sendingEnabled:false}).label,/automation disabled/)
  assert.match(gmailDeliveryState({...c,account_sending_enabled:false},campaign,r).label,/delivery paused/)
  assert.match(gmailDeliveryState(c,campaign,r).label,/receipt unverified/)
  assert.match(gmailDeliveryState({...c,pause_reason:'submission_unknown'},campaign,r).reason,/never retry/)
  assert(!JSON.stringify(gmailDeliveryState({...c,pause_reason:'private-arbitrary-content'},campaign,r)).includes('private-arbitrary'))
})
