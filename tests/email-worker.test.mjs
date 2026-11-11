import test, { beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import handler, { createEmailSendPacer, config } from '../api/email-cron.js'
import { encryptEmailCredential, emailLocalClock } from '../api/email-core.js'

const W='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222'
const ROOT='unit-test-worker-root',SEND='https://gmail.googleapis.com/gmail/v1/users/me/messages/send'
const TOKEN='https://oauth2.googleapis.com/token',SCOPE='https://www.googleapis.com/auth/gmail.send'
const envNames=['CRON_SECRET','EMAIL_CRON_ENABLED','EMAIL_LIVE_SENDING_ENABLED','EMAIL_SEND_INTERVAL_MS','GOOGLE_EMAIL_CLIENT_ID','GOOGLE_EMAIL_CLIENT_SECRET','GOOGLE_EMAIL_REDIRECT_URI','EMAIL_CREDENTIALS_ENCRYPTION_KEY','ASC_CREDENTIALS_ENCRYPTION_KEY','OPENAI_PROVIDER_VAULT_KEY','SUPABASE_SERVICE_ROLE_KEY','EMAIL_PUBLIC_ORIGIN']
let savedEnv,originalFetch,tables,events,providerResponses,refreshResponses,hooks,pauseFailure,finishFailure,claimDenied,clock
const json=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:{'Content-Type':'application/json'}})
const keyFor=sub=>crypto.createHmac('sha256',ROOT).update(`flostudio:gmail-account:v1:${sub}`).digest('hex')
const response=()=>({headers:{},statusCode:0,data:null,setHeader(name,value){this.headers[name]=value},status(code){this.statusCode=code;return this},json(data){this.data=data;return this}})
const matches=(row,params)=>[...params].every(([name,filter])=>{
  if(['select','limit','offset','order'].includes(name)) return true
  if(filter==='is.null') return row[name]==null
  if(filter.startsWith('eq.')) return String(row[name])===filter.slice(3)
  throw new Error(`Unexpected mock filter ${name}`)
})
const evidence=q=>q.claim_token || q.claimed_at || ['claimed','sent','unknown','failed'].includes(q.status) || tables.email_quota_reservations.some(r=>r.queue_id===q.id)
const priorRecipient=q=>tables.email_send_queue.some(p=>p.workspace_id===q.workspace_id && p.email===q.email && evidence(p))
const priorCopy=(q,d)=>tables.email_send_queue.some(p=>p.workspace_id===q.workspace_id && p.product_id===q.product_id && p.scheduled_day!==q.scheduled_day && p.subject_snapshot===d.subject && p.body_snapshot===d.body && evidence(p))
function pauseMailbox(workspaceId,reason) {
  const connection=tables.workspace_gmail_connections.find(c=>c.workspace_id===workspaceId)
  if(!connection) throw new Error('Mock missing mailbox')
  const peers=tables.workspace_gmail_connections.filter(c=>c.account_key===connection.account_key)
  for(const peer of peers) Object.assign(peer,{sending_enabled:false,pause_reason:reason})
  Object.assign(tables.email_gmail_accounts.find(a=>a.account_key===connection.account_key),{sending_enabled:false})
  for(const campaign of tables.email_campaigns) if(peers.some(c=>c.workspace_id===campaign.workspace_id) && campaign.state==='approved') Object.assign(campaign,{state:'paused',sending_enabled:false,pause_reason:reason})
}
function prepare(body) {
  const c=tables.email_campaigns.find(c=>c.id===body.p_campaign_id),d=tables.email_drafts.find(d=>d.id===body.p_draft_id),r=tables.email_contacts.find(r=>r.id===body.p_contact_id)
  if(!c || c.state!=='approved' || !d || d.status!=='approved' || !r || r.status!=='opted_in') return json({code:'MOCK_DENIED'},400)
  const q={campaign_id:c.id,workspace_id:c.workspace_id,product_id:c.product_id,contact_id:r.id,draft_id:d.id,email:r.email,scheduled_day:body.p_scheduled_day}
  if(priorRecipient(q) || priorCopy(q,d)) return json({code:'MOCK_DENIED'},400)
  let existing=tables.email_send_queue.find(p=>p.campaign_id===c.id && p.contact_id===r.id && p.scheduled_day===q.scheduled_day)
  if(!existing) {existing={...q,id:`queue-${tables.email_send_queue.length+1}`,status:'prepared',created_at:tables.email_send_queue.length};tables.email_send_queue.push(existing)}
  return json(existing.id)
}
function claim(body) {
  const q=tables.email_send_queue.find(q=>q.id===body.p_queue_id)
  if(claimDenied || !q || q.status!=='prepared') return json(null)
  const c=tables.email_campaigns.find(c=>c.id===q.campaign_id),d=tables.email_drafts.find(d=>d.id===q.draft_id),r=tables.email_contacts.find(r=>r.id===q.contact_id)
  const connection=tables.workspace_gmail_connections.find(c=>c.workspace_id===q.workspace_id),account=tables.email_gmail_accounts.find(a=>a.account_key===connection?.account_key)
  if(c?.state!=='approved' || !c.sending_enabled || !connection?.configured || !connection.sending_enabled || !account?.sending_enabled) return json(null)
  if(r?.status!=='opted_in' || d?.status!=='approved' || tables.email_suppressions.some(s=>s.workspace_id===q.workspace_id && s.email===q.email)) {q.status='suppressed';return json(null)}
  if(priorRecipient(q) || priorCopy(q,d)) return json(null)
  const cap=Math.min(account.daily_budget,...tables.workspace_gmail_connections.filter(c=>c.account_key===account.account_key && c.configured && c.sending_enabled).map(c=>c.daily_budget))
  if(tables.email_quota_reservations.filter(r=>r.account_key===account.account_key).length>=cap || tables.email_quota_reservations.filter(r=>tables.email_send_queue.find(q=>q.id===r.queue_id)?.campaign_id===c.id).length>=c.daily_limit) return json(null)
  tables.email_quota_reservations.push({queue_id:q.id,account_key:account.account_key})
  Object.assign(q,{status:'claimed',claim_token:`claim-${q.id}`,claimed_at:'synthetic-claimed-time',subject_snapshot:d.subject,body_snapshot:d.body,sender_snapshot:{email:connection.email,sender_name:c.sender_name,ad_link:c.ad_link,postal_address:c.postal_address}})
  hooks.afterClaim?.(q)
  return json([q])
}
async function mockFetch(input,options={}) {
  const url=new URL(input),method=options.method || 'GET',body=options.body ? (url.href===TOKEN ? Object.fromEntries(new URLSearchParams(options.body)) : JSON.parse(options.body)) : undefined
  const event={url:url.href,path:url.pathname,method,body,time:Date.now(),redirect:options.redirect};events.push(event)
  hooks.beforeFetch?.(event)
  if(url.href===SEND || url.href===TOKEN) {
    assert.equal(method,'POST');assert.equal(options.redirect,'error')
    const next=(url.href===SEND ? providerResponses : refreshResponses).shift()
    if(next?.error) throw next.error
    if(next?.invalidJson) return new Response('synthetic-invalid-json',{status:200})
    return json(next?.payload ?? (url.href===SEND ? {id:`synthetic-message-${events.filter(e=>e.url===SEND).length}`} : {access_token:'dummy-refreshed-access',token_type:'Bearer',expires_in:3600}),next?.status ?? 200)
  }
  // No fallback to the real fetch: unexpected host/path fails closed.
  assert.equal(url.hostname,'jtogllurcrxxaguoxeus.supabase.co','No live/AI/network calls are allowed')
  assert(url.pathname.startsWith('/rest/v1/'))
  const name=url.pathname.slice('/rest/v1/'.length)
  if(name.startsWith('rpc/')) {
    assert.equal(method,'POST')
    if(name==='rpc/email_claim_daily_run') return json('synthetic-day-run')
    if(name==='rpc/email_prepare_queue') return prepare(body)
    if(name==='rpc/email_claim_send') return claim(body)
    if(name==='rpc/email_pause_mailbox') {
      assert.deepEqual(Object.keys(body).sort(),['p_reason','p_workspace_id'])
      assert(['provider_rejected','submission_unknown','reconnect_required'].includes(body.p_reason))
      if(pauseFailure) return json({code:'MOCK_FAILURE',message:'synthetic-private-pause-detail'},500)
      if(hooks.pauseResult) return json(hooks.pauseResult)
      pauseMailbox(body.p_workspace_id,body.p_reason);return json({allowed:true,code:'EMAIL_MAILBOX_PAUSED',status:'paused'})
    }
    // Imported Gmail helper's existing scoped invalidation path; worker must also
    // call the new account-wide RPC. This mock never touches queue/quota history.
    if(name==='rpc/email_pause_workspace') {
      for(const c of tables.email_campaigns) if(c.workspace_id===body.p_workspace_id) Object.assign(c,{state:'paused',sending_enabled:false})
      return json(null)
    }
    if(name==='rpc/email_finish_send') {
      if(finishFailure) return json({code:'MOCK_FAILURE',message:'synthetic-private-finish-detail'},500)
      const q=tables.email_send_queue.find(q=>q.id===body.p_queue_id)
      assert.equal(q.claim_token,body.p_claim_token);assert.equal(q.status,'claimed')
      Object.assign(q,{status:body.p_outcome,provider_message_id:body.p_provider_message_id})
      return json(null)
    }
    throw new Error(`Unexpected mock RPC ${name}`)
  }
  assert(Object.hasOwn(tables,name),`Unexpected mock table ${name}`)
  const matching=tables[name].filter(r=>matches(r,url.searchParams))
  if(method==='GET') {
    assert(url.searchParams.get('select'));assert(url.searchParams.has('limit'))
    const offset=Number(url.searchParams.get('offset') || 0),limit=Number(url.searchParams.get('limit'))
    return json(matching.slice(offset,offset+limit))
  }
  if(name==='email_unsubscribe_tokens' && method==='POST') {tables[name].push(body);hooks.afterToken?.(body);return json(null)}
  if(name==='workspace_gmail_connections' && method==='PATCH') {
    assert(url.searchParams.get('workspace_id'),'Broad account PATCH is forbidden')
    for(const r of matching) Object.assign(r,body)
    return json(null)
  }
  throw new Error(`Unexpected mock write ${method} ${name}`)
}
beforeEach(()=>{
  // Retain prior values opaquely for restoration; no environment values are logged.
  savedEnv=Object.fromEntries(envNames.map(name=>[name,process.env[name]]))
  for(const name of envNames) delete process.env[name]
  Object.assign(process.env,{CRON_SECRET:'dummy-worker-secret',EMAIL_CRON_ENABLED:'true',EMAIL_LIVE_SENDING_ENABLED:'true',GOOGLE_EMAIL_CLIENT_ID:'dummy-client',GOOGLE_EMAIL_CLIENT_SECRET:'dummy-secret',GOOGLE_EMAIL_REDIRECT_URI:'https://example.test/api/email-gmail',EMAIL_CREDENTIALS_ENCRYPTION_KEY:ROOT,SUPABASE_SERVICE_ROLE_KEY:'dummy-service-role',EMAIL_PUBLIC_ORIGIN:'https://example.test'})
  tables={email_campaigns:[],products:[],workspace_gmail_connections:[],email_gmail_accounts:[],workspace_email_preferences:[],email_contacts:[],email_drafts:[],email_send_queue:[],email_suppressions:[],email_quota_reservations:[],email_unsubscribe_tokens:[]}
  events=[];providerResponses=[];refreshResponses=[];hooks={};pauseFailure=false;finishFailure=false;claimDenied=false;clock=null
  originalFetch=globalThis.fetch;globalThis.fetch=mockFetch
})
afterEach(()=>{
  globalThis.fetch=originalFetch
  for(const name of envNames) if(savedEnv[name]===undefined) delete process.env[name];else process.env[name]=savedEnv[name]
})
function fakeClock(t) {
  clock={time:Date.parse('2026-11-11T12:00:00Z'),sleeps:[]}
  t.mock.method(Date,'now',()=>clock.time)
  t.mock.method(globalThis,'setTimeout',(fn,ms,...args)=>{clock.sleeps.push(ms);clock.time+=ms;fn(...args);return 1})
  return clock
}
function seedConnection({workspace=W,sub='worker-google-sub',budget=400,expired=false}={}) {
  const account_key=keyFor(sub),email=sub==='worker-google-sub' ? 'sender@example.test' : 'other-sender@example.test'
  if(!tables.email_gmail_accounts.some(a=>a.account_key===account_key)) tables.email_gmail_accounts.push({account_key,daily_budget:budget,sending_enabled:true})
  const c={workspace_id:workspace,account_key,email,daily_budget:budget,configured:true,sending_enabled:true,encrypted_credentials:encryptEmailCredential({sub,email,verified_email:true,scopes:[SCOPE,'openid','email'],accessToken:'dummy-worker-access',refresh_token:'dummy-worker-refresh',expires_at:Date.now()+(expired ? -1000 : 3600000)},workspace)}
  tables.workspace_gmail_connections.push(c);return c
}
function seedCampaign({id='campaign-a',workspace=W,count=1,limit=count,prepared=false,archived=false,state='approved'}={}) {
  if(!tables.workspace_gmail_connections.some(c=>c.workspace_id===workspace)) seedConnection({workspace})
  const c={id,workspace_id:workspace,product_id:`product-${id}`,daily_limit:limit,timezone:'UTC',send_hour:0,send_minute:0,state,sending_enabled:true,sender_name:'Approved sender',postal_address:'123 Synthetic Street',ad_link:`https://example.test/apps/${id}`}
  tables.email_campaigns.push(c);tables.products.push({id:c.product_id,workspace_id:workspace,source_facts:{archived}})
  const day=emailLocalClock('UTC').day
  for(let i=0;i<count;i++) {
    const r={id:`contact-${id}-${i}`,workspace_id:workspace,product_id:c.product_id,email:`recipient-${id}-${i}@example.test`,status:'opted_in',last_contacted_at:null,created_at:i}
    const d={id:`draft-${id}-${i}`,workspace_id:workspace,product_id:c.product_id,campaign_id:id,contact_id:r.id,status:'approved',subject:'Human-approved subject',body:'Human-approved copy only.',created_at:i}
    tables.email_contacts.push(r);tables.email_drafts.push(d)
    if(prepared) tables.email_send_queue.push({id:`queue-${id}-${i}`,workspace_id:workspace,product_id:c.product_id,campaign_id:id,contact_id:r.id,draft_id:d.id,email:r.email,scheduled_day:day,status:'prepared',created_at:i})
  }
  return c
}
async function run(extra={}) {const res=response();await handler({method:'GET',headers:{authorization:'Bearer dummy-worker-secret'},...extra},res);return res}
const rpcEvents=name=>events.filter(e=>e.path===`/rest/v1/rpc/${name}`)
const sends=()=>events.filter(e=>e.url===SEND)
const assertSanitized=res=>{
  assert(!JSON.stringify(res.data).match(/dummy-|synthetic-private|recipient-|sender@example|claim-|access_token|encrypted_credentials/))
  for(const e of rpcEvents('email_pause_mailbox')) assert(['provider_rejected','submission_unknown','reconnect_required'].includes(e.body.p_reason))
}

test('enabled worker prepares only approved copies and records one harmless mocked Gmail acceptance',async t=>{
  fakeClock(t);seedCampaign()
  const res=await run()
  assert.equal(res.statusCode,200);assert.equal(res.data.prepared,1);assert.equal(res.data.accepted,1)
  assert.equal(res.data.failed,0);assert.equal(res.data.paused,0)
  assert.equal(sends().length,1);assert.equal(rpcEvents('email_claim_send').length,1);assert.equal(rpcEvents('email_finish_send').length,1)
  assert.equal(tables.email_send_queue[0].status,'sent');assert.equal(tables.email_quota_reservations.length,1)
  const mime=Buffer.from(sends()[0].body.raw,'base64url').toString()
  assert(mime.includes(Buffer.from('Human-approved subject').toString('base64')))
  const plain=Buffer.from(mime.split('\r\n\r\n')[1].replace(/\r\n/g,''),'base64').toString()
  assert(plain.startsWith('Human-approved copy only.'));assert(plain.includes('Unsubscribe: https://example.test/api/email-unsubscribe?token='))
  assert.match(res.data.message,/not confirmed recipient delivery/);assertSanitized(res)
})

test('scheduler authorization, method and both flags stop all preparation and provider calls',async()=>{
  seedCampaign()
  assert.equal((await run({method:'POST'})).statusCode,405)
  assert.equal((await run({headers:{authorization:'Bearer wrong'}})).statusCode,401)
  for(const name of ['EMAIL_CRON_ENABLED','EMAIL_LIVE_SENDING_ENABLED']) {
    process.env[name]='false';const res=await run();assert.equal(res.data.disabled,true);process.env[name]='true'
  }
  assert.equal(events.length,0)
})

test('shared Gmail allocation is fair across apps/workspaces and round-robin dispatch is paced',async t=>{
  const c=fakeClock(t);seedConnection({budget:6});seedConnection({workspace:OTHER,budget:6})
  seedCampaign({id:'a',count:5});seedCampaign({id:'b',count:5});seedCampaign({id:'c',workspace:OTHER,count:5})
  const res=await run();assert.equal(res.statusCode,200);assert.equal(res.data.accepted,6)
  assert.deepEqual(rpcEvents('email_claim_send').map(e=>tables.email_send_queue.find(q=>q.id===e.body.p_queue_id).campaign_id),['a','b','c','a','b','c'])
  assert.deepEqual(['a','b','c'].map(id=>tables.email_send_queue.filter(q=>q.campaign_id===id).length),[2,2,2])
  assert.deepEqual(c.sleeps,[1000,1000,1000,1000,1000])
  assert(sends().every((e,i,a)=>!i || e.time-a[i-1].time>=1000))
  assert.equal(tables.email_quota_reservations.length,6)
})

test('existing prepared backlogs cannot exceed app fair shares',async t=>{
  fakeClock(t);seedConnection({budget:4});seedCampaign({id:'a',count:5,prepared:true});seedCampaign({id:'b',count:5,prepared:true})
  const res=await run();assert.equal(res.data.accepted,4)
  assert.deepEqual(['a','b'].map(id=>tables.email_send_queue.filter(q=>q.campaign_id===id && q.status==='sent').length),[2,2])
  assert.deepEqual(events.filter(e=>e.method==='GET' && e.path==='/rest/v1/email_send_queue' && new URL(e.url).searchParams.get('status')==='eq.prepared').map(e=>new URL(e.url).searchParams.get('limit')),['2','2'])
})

test('daily consumed claims debit fair shares on later timer ticks instead of monopolizing peers',async t=>{
  fakeClock(t);seedConnection({budget:4});seedCampaign({id:'a',count:5,prepared:true});seedCampaign({id:'b',count:5,prepared:true})
  const a=tables.email_send_queue.find(q=>q.campaign_id==='a')
  Object.assign(a,{status:'failed',claim_token:'prior-claim',claimed_at:'synthetic-prior-time'})
  tables.email_quota_reservations.push({queue_id:a.id,account_key:keyFor('worker-google-sub')})
  const res=await run();assert.equal(res.data.accepted,3)
  assert.deepEqual(['a','b'].map(id=>tables.email_send_queue.filter(q=>q.campaign_id===id && ['sent','failed'].includes(q.status)).length),[2,2])
  const second=await run();assert.equal(second.data.accepted,0);assert.equal(sends().length,3)
})

test('opt-out immediately after claim prevents dispatch but does not pause other recipients',async t=>{
  fakeClock(t);seedCampaign({count:2})
  hooks.afterClaim=q=>{if(q.contact_id.endsWith('-0')) tables.email_suppressions.push({workspace_id:q.workspace_id,email:q.email})}
  const res=await run();assert.equal(res.statusCode,200);assert.equal(res.data.accepted,1);assert.equal(res.data.failed,1)
  assert.equal(sends().length,1);assert.equal(rpcEvents('email_pause_mailbox').length,0);assert.equal(tables.email_quota_reservations.length,2)
  assert.equal(tables.email_send_queue[0].status,'failed')
})

test('opt-out during unsubscribe-token creation is caught by the last pre-dispatch read',async t=>{
  fakeClock(t);seedCampaign()
  hooks.afterToken=token=>tables.email_suppressions.push({workspace_id:token.workspace_id,email:token.email})
  const res=await run();assert.equal(res.data.accepted,0);assert.equal(res.data.failed,1);assert.equal(sends().length,0)
  assert.equal(rpcEvents('email_pause_mailbox').length,0)
})

test('unapproved campaign/draft, opted-out contact and archived app are never prepared',async t=>{
  fakeClock(t);seedCampaign({id:'unapproved-campaign',state:'draft'});seedCampaign({id:'archived-app',archived:true});seedCampaign({id:'unapproved-draft'});seedCampaign({id:'unsubscribed-contact'})
  tables.email_drafts.find(d=>d.campaign_id==='unapproved-draft').status='draft'
  tables.email_contacts.find(r=>r.product_id==='product-unsubscribed-contact').status='unsubscribed'
  const res=await run();assert.equal(res.data.prepared,0);assert.equal(sends().length,0);assert.equal(rpcEvents('email_prepare_queue').length,0)
})

test('one-shot NULL claim is skipped once without provider dispatch or retries',async t=>{
  fakeClock(t);seedCampaign({prepared:true});claimDenied=true
  const res=await run();assert.equal(res.statusCode,200);assert.equal(res.data.skipped,1);assert.equal(sends().length,0)
  assert.equal(rpcEvents('email_claim_send').length,1);assert.equal(rpcEvents('email_finish_send').length,0)
})

test('accepted send is not claimed, prepared or submitted again on the next timer run',async t=>{
  fakeClock(t);seedCampaign();assert.equal((await run()).data.accepted,1)
  const second=await run();assert.equal(second.data.accepted,0);assert.equal(second.data.prepared,0)
  assert.equal(sends().length,1);assert.equal(rpcEvents('email_claim_send').length,1)
})

for(const status of [401,403,429]) test(`Gmail ${status} rejection pauses ALL shared-account campaigns, not an unrelated account`,async t=>{
  fakeClock(t);seedConnection();seedConnection({workspace:OTHER});seedCampaign({id:'a',count:2});seedCampaign({id:'b',workspace:OTHER,count:2})
  const third='33333333-3333-4333-8333-333333333333';seedConnection({workspace:third,sub:'unrelated-google-sub'});seedCampaign({id:'c',workspace:third})
  providerResponses.push({status,payload:{error:{message:'synthetic-private-provider-detail'}}})
  const res=await run();assert.equal(res.statusCode,200);assert.equal(res.data.failed,1);assert.equal(res.data.accepted,1);assert.equal(res.data.paused,1)
  assert.equal(sends().length,2);assert.equal(rpcEvents('email_pause_mailbox')[0].body.p_reason,status===401 ? 'reconnect_required' : 'provider_rejected')
  assert(tables.email_campaigns.filter(c=>c.id!=='c').every(c=>c.state==='paused' && !c.sending_enabled))
  assert.equal(tables.email_campaigns.find(c=>c.id==='c').state,'approved')
  assert.equal(tables.email_send_queue.filter(q=>q.status==='prepared').length,3)
  assert.equal(tables.email_quota_reservations.length,2);assertSanitized(res)
})

for(const scenario of [
  {name:'network exception',error:new Error('synthetic-private-network-detail')},
  {name:'timeout',error:new DOMException('synthetic-private-timeout','TimeoutError')},
  {name:'5xx',status:503,payload:{error:'synthetic-private-provider-detail'}},
  {name:'missing provider id',payload:{}},
  {name:'malformed provider JSON',invalidJson:true},
]) test(`${scenario.name} records unknown, pauses mailbox and never retries on next run`,async t=>{
  fakeClock(t);seedCampaign({count:2});providerResponses.push(scenario)
  const res=await run();assert.equal(res.statusCode,200);assert.equal(res.data.unknown,1);assert.equal(res.data.accepted,0);assert.equal(sends().length,1)
  assert.equal(tables.email_send_queue[0].status,'unknown');assert.equal(rpcEvents('email_pause_mailbox')[0].body.p_reason,'submission_unknown')
  const second=await run();assert.equal(second.data.accepted,0);assert.equal(sends().length,1);assert.equal(tables.email_quota_reservations.length,1)
  assertSanitized(res)
})

for(const status of [400,503]) test(`refresh ${status} failure calls reconnect mailbox RPC before any claim and stops shared peers`,async t=>{
  fakeClock(t);seedConnection({expired:true});seedConnection({workspace:OTHER});seedCampaign({id:'a'});seedCampaign({id:'b',workspace:OTHER})
  refreshResponses.push({status,payload:{error:'invalid_grant',error_description:'synthetic-private-refresh-detail'}})
  const res=await run();assert.equal(res.statusCode,200);assert.equal(res.data.reconnectRequired,1);assert.equal(res.data.paused,1)
  assert.equal(sends().length,0);assert.equal(rpcEvents('email_claim_send').length,0)
  assert.equal(rpcEvents('email_pause_mailbox').at(-1).body.p_reason,'reconnect_required')
  assert(tables.email_campaigns.every(c=>c.state==='paused'));assert.equal(tables.email_quota_reservations.length,0);assertSanitized(res)
})

test('provider rejection plus failed pause RPC stops whole invocation, records failure and never claims peers',async t=>{
  fakeClock(t);seedConnection();seedConnection({workspace:OTHER});seedCampaign({id:'a',count:2});seedCampaign({id:'b',workspace:OTHER,count:2})
  providerResponses.push({status:429,payload:{error:'synthetic-private-quota-detail'}});pauseFailure=true
  const res=await run();assert.equal(res.statusCode,503);assert.equal(res.data.pauseFailed,1);assert.equal(res.data.paused,0);assert.equal(res.data.accepted,0);assert.equal(res.data.failed,1)
  assert.equal(sends().length,1);assert.equal(rpcEvents('email_claim_send').length,1);assert.equal(rpcEvents('email_finish_send').length,1)
  assert.equal(tables.email_send_queue[0].status,'failed');assert.equal(tables.email_quota_reservations.length,1);assertSanitized(res)
})

test('unknown plus failed pause RPC still records unknown evidence and does not report success',async t=>{
  fakeClock(t);seedCampaign({count:2});providerResponses.push({error:new Error('synthetic-private-provider-detail')});pauseFailure=true
  const res=await run();assert.equal(res.statusCode,503);assert.equal(res.data.unknown,1);assert.equal(res.data.accepted,0);assert.equal(res.data.paused,0)
  assert.equal(tables.email_send_queue[0].status,'unknown');assert.equal(sends().length,1);assertSanitized(res)
})

test('HTTP 200 blocked pause response is not counted as success and stops peer claims',async t=>{
  fakeClock(t);seedCampaign({count:2});providerResponses.push({status:429,payload:{error:'synthetic-private-provider-detail'}})
  hooks.pauseResult={allowed:false,code:'GMAIL_CONNECTION_REQUIRED',status:'blocked'}
  const res=await run();assert.equal(res.statusCode,503);assert.equal(res.data.pauseFailed,1);assert.equal(res.data.paused,0);assert.equal(res.data.accepted,0)
  assert.equal(sends().length,1);assert.equal(rpcEvents('email_claim_send').length,1);assert.equal(tables.email_send_queue[0].status,'failed');assertSanitized(res)
})

test('refresh plus failed pause RPC returns sanitized 503 and sends/claims nothing',async t=>{
  fakeClock(t);seedConnection({expired:true});seedCampaign();pauseFailure=true;refreshResponses.push({status:503,payload:{error:'synthetic-private-refresh-detail'}})
  const res=await run();assert.equal(res.statusCode,503);assert.equal(res.data.pauseFailed,1);assert.equal(res.data.paused,0);assert.equal(res.data.reconnectRequired,1)
  assert.equal(sends().length,0);assert.equal(rpcEvents('email_claim_send').length,0);assertSanitized(res)
})

test('provider acceptance with failed finalization is not counted as recorded success or retried',async t=>{
  fakeClock(t);seedCampaign();finishFailure=true
  const res=await run();assert.equal(res.statusCode,503);assert.equal(res.data.accepted,0);assert.equal(sends().length,1);assert.equal(tables.email_send_queue[0].status,'claimed')
  finishFailure=false;assert.equal((await run()).data.accepted,0);assert.equal(sends().length,1);assertSanitized(res)
})

test('permanent recipient and cross-day exact-copy exclusions remain delegated to queue RPCs',async t=>{
  fakeClock(t);seedCampaign({id:'a'});seedCampaign({id:'b'});seedCampaign({id:'c'})
  const [a,b,c]=tables.email_contacts
  tables.email_send_queue.push({id:'history-a',workspace_id:W,product_id:a.product_id,campaign_id:'a',contact_id:a.id,email:a.email,status:'failed',claim_token:'old-claim',scheduled_day:'2020-01-01'})
  tables.email_quota_reservations.push({queue_id:'history-a',account_key:keyFor('worker-google-sub')})
  tables.email_send_queue.push({id:'history-b',workspace_id:W,product_id:b.product_id,campaign_id:'b',contact_id:'old-contact',email:'old@example.test',status:'unknown',claim_token:'old-claim-b',scheduled_day:'2020-01-01',subject_snapshot:'Human-approved subject',body_snapshot:'Human-approved copy only.'})
  const res=await run();assert.equal(res.data.accepted,1);assert.equal(res.data.prepared,1);assert.equal(res.data.skipped,2)
  assert.equal(tables.email_send_queue.find(q=>q.status==='sent').contact_id,c.id)
  assert.equal(tables.email_send_queue.find(q=>q.id==='history-a').status,'failed');assert.equal(tables.email_send_queue.find(q=>q.id==='history-b').status,'unknown')
})

test('worker bounds all claim attempts, including denied claims, at 100',async t=>{
  fakeClock(t);seedCampaign({id:'a',count:60,prepared:true});seedCampaign({id:'b',count:60,prepared:true});claimDenied=true
  const res=await run();assert.equal(res.statusCode,200);assert.equal(rpcEvents('email_claim_send').length,100);assert.equal(res.data.skipped,100);assert.equal(sends().length,0)
})

test('worker accepts at most 100 one-shot sends per invocation without real pacing waits',async t=>{
  const c=fakeClock(t);seedCampaign({id:'a',count:60,prepared:true});seedCampaign({id:'b',count:60,prepared:true})
  const res=await run();assert.equal(res.statusCode,200);assert.equal(res.data.accepted,100);assert.equal(sends().length,100);assert.equal(rpcEvents('email_claim_send').length,100)
  assert.equal(c.sleeps.length,99);assert.equal(tables.email_send_queue.filter(q=>q.status==='prepared').length,20)
})

test('10-second deployment pacing defers before deadline without claiming the next recipient',async t=>{
  const c=fakeClock(t);process.env.EMAIL_SEND_INTERVAL_MS='10000';seedCampaign({count:100,prepared:true})
  const res=await run();assert.equal(res.statusCode,200);assert.equal(res.data.accepted,24);assert.equal(rpcEvents('email_claim_send').length,24)
  assert(c.sleeps.every(ms=>ms===10000));assert.equal(c.time,Date.parse('2026-11-11T12:00:00Z')+230000)
  assert.equal(tables.email_send_queue.filter(q=>q.status==='prepared').length,76)
})

test('deadline crossing after claim finalizes failure but never calls Gmail',async t=>{
  const c=fakeClock(t);seedCampaign();hooks.afterClaim=()=>{c.time+=240000}
  const res=await run();assert.equal(res.statusCode,200);assert.equal(res.data.accepted,0);assert.equal(res.data.failed,1);assert.equal(sends().length,0)
  assert.equal(rpcEvents('email_finish_send').length,1);assert.equal(tables.email_quota_reservations.length,1)
})

test('preparation deadline stops before any dispatch',async t=>{
  const c=fakeClock(t);seedCampaign({count:2});hooks.beforeFetch=e=>{if(e.path==='/rest/v1/rpc/email_prepare_queue') c.time+=240000}
  const res=await run();assert.equal(res.statusCode,200);assert.equal(res.data.prepared,1);assert.equal(sends().length,0);assert.equal(rpcEvents('email_claim_send').length,0)
})

test('pacer defaults/clamps consistently, accounts for work elapsed, and refuses deadline equality',async()=>{
  for(const [input,expected] of [[undefined,1000],['',1000],['invalid',1000],['Infinity',1000],['-5',1000],['0',1000],['500',1000],['1250.9',1250],['5000',5000],['10001',10000]]) {
    const pacer=createEmailSendPacer({intervalMs:input});assert.equal(pacer.intervalMs,expected)
  }
  let time=100,sleeps=[]
  const pacer=createEmailSendPacer({intervalMs:1500,now:()=>time,sleep:async ms=>{sleeps.push(ms);time+=ms}})
  assert.equal(await pacer.wait(10000),true);assert.deepEqual(sleeps,[]);pacer.dispatched();time+=300
  assert.equal(await pacer.wait(10000),true);assert.deepEqual(sleeps,[1200]);pacer.dispatched();time+=2000
  assert.equal(await pacer.wait(10000),true);assert.deepEqual(sleeps,[1200]);pacer.dispatched()
  assert.equal(await pacer.wait(time+1500),false);assert.deepEqual(sleeps,[1200])
})

test('pacer rechecks elapsed time after an early mock wake rather than sending too early',async()=>{
  let time=0,calls=0
  const pacer=createEmailSendPacer({now:()=>time,sleep:async ms=>{calls++;time+=calls===1 ? 400 : ms}})
  pacer.dispatched();assert.equal(await pacer.wait(5000),true);assert.equal(calls,2);assert.equal(time,1000)
})

test('source retains five-minute schedule, manual approved-only preparation and narrow pause contract',()=>{
  const source=readFileSync(new URL('../api/email-cron.js',import.meta.url),'utf8'),vercel=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'))
  assert.equal(vercel.crons.find(c=>c.path==='/api/email-cron').schedule,'*/5 * * * *');assert.equal(config.maxDuration,300)
  assert.match(source,/status:'eq.approved'/);assert.match(source,/emailRpc\('email_pause_mailbox',\{p_workspace_id:workspaceId,p_reason:reason\}\)/)
  assert.doesNotMatch(source,/method:'PATCH'|Math\.random|invokeLLM|api\.openai|email-source-research/)
  assert.match(source,/attempted<100/);assert.match(source,/Date\.now\(\)\+240000/)
})
