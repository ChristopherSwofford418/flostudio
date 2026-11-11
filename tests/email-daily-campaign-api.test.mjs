import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/email-campaigns.js'
import { dailyCampaignDeploymentStatus, dailyCampaignSettingsPayload } from '../api/email-daily-campaign-settings.js'
import { readFileSync } from 'node:fs'

const W='11111111-1111-4111-8111-111111111111', P='22222222-2222-4222-8222-222222222222', D='44444444-4444-4444-8444-444444444444'
const response=()=>({statusCode:0,data:null,setHeader(){},status(code){this.statusCode=code;return this},json(data){this.data=data;return this}})
const req=(action,patch={})=>({method:'POST',headers:{authorization:'Bearer synthetic-session'},body:{workspaceId:W,productId:P,action,...patch}})
const json=data=>new Response(JSON.stringify(data),{status:200})
async function fixture(run,{admin=true,productAvailable=true}={}) {
 const old=globalThis.fetch,calls=[]
 globalThis.fetch=async(input,options={})=>{
  const url=new URL(input), body=options.body?JSON.parse(options.body):null
  calls.push({path:url.pathname,body})
  if(url.pathname==='/auth/v1/user')return json({id:'33333333-3333-4333-8333-333333333333'})
  if(url.pathname==='/rest/v1/rpc/get_workspace_role')return json('member')
  if(url.pathname==='/rest/v1/rpc/is_workspace_admin')return json(admin)
  if(url.pathname==='/rest/v1/products'){
   assert.equal(url.searchParams.get('id'),`eq.${P}`);assert.equal(url.searchParams.get('workspace_id'),`eq.${W}`)
   return json(productAvailable?[{id:P,workspace_id:W}]:[])
  }
  if(['/rest/v1/rpc/get_email_daily_campaign_status','/rest/v1/rpc/save_email_daily_campaign_settings','/rest/v1/rpc/update_email_daily_campaign'].includes(url.pathname)){
   assert.equal(options.headers.Authorization,'Bearer synthetic-session')
   assert.equal(body.p_workspace_id,W);assert.equal(body.p_product_id,P)
   if(url.pathname.endsWith('get_email_daily_campaign_status'))return json({settings:{enabled:false,timezone:'America/New_York',start_hour:7},campaigns:[],today:{created:false}})
   return json({status:'draft'})
  }
  throw new Error('Unexpected call: no providers, credentials, queues or send routes allowed')
 }
 try{await run(calls)}finally{globalThis.fetch=old}
}
test('member reads only selected-app campaign drafts without admin/provider/credential calls',async()=>fixture(async calls=>{
 const res=response();await handler(req('get_daily_campaign_status'),res)
 assert.equal(res.statusCode,200);assert.deepEqual(res.data.dailyCampaign.campaigns,[])
 assert.equal(res.data.deployment.draftOnly,true);assert.equal(res.data.deployment.providerCalls,false)
 assert(!calls.some(c=>c.path.includes('is_workspace_admin')))
}))
test('daily settings and edits require owner/admin independently of UI',async()=>fixture(async calls=>{
 for(const action of ['save_daily_campaign_settings','update_daily_campaign']){
  const res=response();await handler(req(action,{enabled:true,startHour:7,timezone:'America/New_York',dailyCampaignId:D,subject:'App listing',body:'https://apps.apple.com/us/app/sample/id1234567890'}),res)
  assert.equal(res.statusCode,403)
 }
 assert(!calls.some(c=>/save_email_daily|update_email_daily/.test(c.path)))
},{admin:false}))
test('cross-workspace product cannot read or mutate daily drafts',async()=>fixture(async calls=>{
 const res=response();await handler(req('get_daily_campaign_status'),res)
 assert.equal(res.statusCode,403);assert(!calls.some(c=>c.path.includes('daily_campaign')))
},{productAvailable:false}))
test('daily schedule changes and edits cannot touch existing campaign delivery or recipients',async()=>fixture(async calls=>{
 let res=response();await handler(req('save_daily_campaign_settings',{enabled:true,startHour:7,timezone:'America/New_York',sending_enabled:true}),res)
 assert.equal(res.statusCode,200);assert.match(res.data.message,/No email sending/)
 const save=calls.find(c=>c.path.endsWith('save_email_daily_campaign_settings'))
 assert.deepEqual(save.body,{p_workspace_id:W,p_product_id:P,p_enabled:true,p_timezone:'America/New_York',p_start_hour:7})
 res=response();await handler(req('update_daily_campaign',{dailyCampaignId:D,subject:'Explore the listing',body:'Read the current listing. https://apps.apple.com/us/app/sample/id1234567890',status:'approved'}),res)
 assert.equal(res.statusCode,200);assert.match(res.data.message,/unapproved draft/)
 assert(!calls.some(c=>/credential|gmail|email_send|email_campaigns$|email_contacts/.test(c.path)))
}))
test('strict settings reject malformed values and ambiguous switches',()=>{
 assert.deepEqual(dailyCampaignSettingsPayload({enabled:true,startHour:7,timezone:'America/New_York'}),{p_enabled:true,p_timezone:'America/New_York',p_start_hour:7})
 for(const patch of [{enabled:'true'},{startHour:false},{startHour:''},{startHour:24},{startHour:1.2},{timezone:'bad/time'},{timezone:''}])assert.throws(()=>dailyCampaignSettingsPayload({enabled:true,startHour:7,timezone:'America/New_York',...patch}))
})
test('deceptive or malformed draft edits fail before a write',async()=>fixture(async calls=>{
 for(const patch of [{subject:'Re: not a reply'},{subject:'line\nheader'},{subject:''},{dailyCampaignId:'bad'},{body:''}]){
  const res=response();await handler(req('update_daily_campaign',{dailyCampaignId:D,subject:'Explore app',body:'Listing https://apps.apple.com/us/app/sample/id1234567890',...patch}),res)
  assert.equal(res.statusCode,400)
 }
 assert(!calls.some(c=>c.path.endsWith('update_email_daily_campaign')))
}))
test('independent daily campaign gate does not borrow research or live-email flags',()=>{
 const keys=['EMAIL_DAILY_CAMPAIGN_CRON_ENABLED','CRON_SECRET','SUPABASE_SERVICE_ROLE_KEY','EMAIL_RESEARCH_CRON_ENABLED','EMAIL_CRON_ENABLED','EMAIL_LIVE_SENDING_ENABLED']
 const prev=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
 try{
  delete process.env.EMAIL_DAILY_CAMPAIGN_CRON_ENABLED
  process.env.CRON_SECRET='synthetic';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic'
  process.env.EMAIL_RESEARCH_CRON_ENABLED='true';process.env.EMAIL_CRON_ENABLED='true';process.env.EMAIL_LIVE_SENDING_ENABLED='true'
  assert.equal(dailyCampaignDeploymentStatus().configured,false)
  process.env.EMAIL_DAILY_CAMPAIGN_CRON_ENABLED='true'
  assert.equal(dailyCampaignDeploymentStatus().configured,true)
  delete process.env.CRON_SECRET;assert.equal(dailyCampaignDeploymentStatus().configured,false)
 }finally{for(const k of keys){if(prev[k]===undefined)delete process.env[k];else process.env[k]=prev[k]}}
})
test('daily draft timer preserves existing research and delivery timers',()=>{
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'))
 assert.deepEqual(config.crons.find(x=>x.path==='/api/email-cron'),{path:'/api/email-cron',schedule:'*/5 * * * *'})
 assert.deepEqual(config.crons.find(x=>x.path==='/api/email-research-cron'),{path:'/api/email-research-cron',schedule:'* * * * *'})
 assert.deepEqual(config.crons.find(x=>x.path==='/api/email-daily-campaign-cron'),{path:'/api/email-daily-campaign-cron',schedule:'*/5 * * * *'})
})
