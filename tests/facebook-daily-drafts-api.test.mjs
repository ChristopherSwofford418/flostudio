import test from 'node:test'
import assert from 'node:assert/strict'
import handler,{validFacebookDraftDate} from '../api/facebook-daily-drafts.js'
const W='11111111-1111-4111-8111-111111111111'
const res=()=>({code:0,data:null,setHeader(){},status(c){this.code=c;return this},json(d){this.data=d;return this}})
const req=(action,body={})=>({method:'POST',headers:{authorization:'Bearer synthetic-session'},body:{action,workspaceId:W,...body}})
const json=x=>new Response(JSON.stringify(x),{status:200})
async function mock(run,{admin=true,member=true}={}){
 const old=globalThis.fetch,calls=[]
 globalThis.fetch=async(url,opt={})=>{
  const path=new URL(url).pathname;const body=opt.body?JSON.parse(opt.body):null;calls.push({path,body})
  if(path==='/auth/v1/user')return json({id:'22222222-2222-4222-8222-222222222222'})
  if(path==='/rest/v1/rpc/get_workspace_role')return json(member?'member':null)
  if(path==='/rest/v1/rpc/is_workspace_admin')return json(admin)
  if(path==='/rest/v1/rpc/get_facebook_daily_workspace_status'){assert.equal(opt.headers.Authorization,'Bearer synthetic-session');return json({workspace_id:W,scheduled_day:body.p_scheduled_day})}
  if(path==='/rest/v1/rpc/facebook_save_daily_settings')return json({apps_updated:25})
  throw new Error('Unexpected call; external providers and send APIs are prohibited in this fixture')
 }
 try{await run(calls)}finally{globalThis.fetch=old}
}
test('calendar dates are exact and reject nonexistent dates',()=>{assert(validFacebookDraftDate('2026-11-11'));for(const d of ['2026-02-30','0000-01-01','2026-11-11T00:00:00Z','2026-1-1',null])assert.equal(validFacebookDraftDate(d),false)})
test('missing authentication cannot read drafts',async()=>{const r=res();await handler({method:'POST',headers:{},body:{workspaceId:W,action:'get_workspace_status'}},r);assert.equal(r.code,401)})
test('member reads an exact past date with one workspace-scoped RPC and no writes',async()=>mock(async calls=>{const r=res();await handler(req('get_workspace_status',{scheduledDay:'2026-11-10'}),r);assert.equal(r.code,200);assert.equal(r.data.scheduled_day,'2026-11-10');assert.deepEqual(calls.at(-1).body,{p_workspace_id:W,p_scheduled_day:'2026-11-10'});assert.equal(calls.filter(c=>c.path.includes('get_facebook_daily_workspace_status')).length,1);assert(!calls.some(c=>/save|claim|credential|send|openai/i.test(c.path)))}))
test('foreign workspace is rejected before status reads',async()=>mock(async calls=>{const r=res();await handler(req('get_workspace_status'),r);assert.equal(r.code,403);assert(!calls.some(c=>c.path.includes('facebook_daily')))}, {member:false}))
test('forged app scope or provider fields cannot dispatch a status read',async()=>mock(async calls=>{const r=res();await handler(req('get_workspace_status',{productId:W,sourceUrl:'https://invalid.example'}),r);assert.equal(r.code,400);assert(!calls.some(c=>c.path.includes('facebook_daily')))}))
test('non-admin cannot save all-app schedules',async()=>mock(async calls=>{const r=res();await handler(req('save_workspace_settings',{enabled:true,timezone:'America/New_York',startHour:3}),r);assert.equal(r.code,403);assert(!calls.some(c=>c.path.includes('facebook_save')))}, {admin:false}))
test('one admin schedule action changes only draft preparation settings',async()=>mock(async calls=>{const r=res();await handler(req('save_workspace_settings',{enabled:true,timezone:'America/New_York',startHour:3}),r);assert.equal(r.code,200);assert.equal(r.data.workspace_id,W);assert.deepEqual(calls.at(-1).body,{p_workspace_id:W,p_enabled:true,p_timezone:'America/New_York',p_start_hour:3});assert(!calls.some(c=>/email|send|openai|social|credential/.test(c.path)))}))
test('posting or consent-bypass actions are not supported',async()=>mock(async calls=>{for(const action of ['publish','send','connect_facebook','register_asset']){const r=res();await handler(req(action),r);assert.equal(r.code,400)}assert(!calls.some(c=>c.path.includes('facebook_daily')))}))
