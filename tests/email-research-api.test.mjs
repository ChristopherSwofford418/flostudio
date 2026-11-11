import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/email-campaigns.js'

const W='11111111-1111-4111-8111-111111111111',P='22222222-2222-4222-8222-222222222222'
const response=()=>({statusCode:0,data:null,setHeader(){},status(code){this.statusCode=code;return this},json(data){this.data=data;return this}})
const json=data=>new Response(JSON.stringify(data),{status:200})
const request=(action,patch={})=>({method:'POST',headers:{authorization:'Bearer synthetic-session'},body:{workspaceId:W,productId:P,action,...patch}})

async function fixture(run,{admin=true,productAvailable=true}={}){
  const old=globalThis.fetch,calls=[]
  globalThis.fetch=async(input,options={})=>{
    const url=new URL(input),body=options.body?JSON.parse(options.body):null
    calls.push({path:url.pathname,body,headers:options.headers})
    if(url.pathname==='/auth/v1/user')return json({id:'33333333-3333-4333-8333-333333333333'})
    if(url.pathname==='/rest/v1/rpc/get_workspace_role')return json('member')
    if(url.pathname==='/rest/v1/rpc/is_workspace_admin')return json(admin)
    if(url.pathname==='/rest/v1/products'){
      assert.equal(url.searchParams.get('id'),`eq.${P}`);assert.equal(url.searchParams.get('workspace_id'),`eq.${W}`)
      return json(productAvailable?[{id:P,workspace_id:W}]:[])
    }
    if(url.pathname==='/rest/v1/rpc/workspace_openai_provider_status')return json({configured:true})
    if(url.pathname==='/rest/v1/rpc/get_email_research_status'){
      assert.deepEqual(body,{p_workspace_id:W,p_product_id:P})
      assert.equal(options.headers.Authorization,'Bearer synthetic-session')
      return json({settings:{enabled:false,daily_target:80,daily_request_limit:8,timezone:'America/New_York',start_hour:6,query:''},recent_runs:[],today:{requests:0,inserted:0}})
    }
    if(url.pathname==='/rest/v1/rpc/save_email_research_settings'){
      assert.equal(body.p_workspace_id,W);assert.equal(body.p_product_id,P)
      assert.equal(options.headers.Authorization,'Bearer synthetic-session')
      return json({enabled:body.p_enabled})
    }
    throw new Error('Unexpected network route; no provider or send requests permitted in tests')
  }
  try{await run(calls)}finally{globalThis.fetch=old}
}

test('workspace members read daily research status without an admin check or any provider/send call',async()=>fixture(async calls=>{
  const res=response();await handler(request('get_research_status'),res)
  assert.equal(res.statusCode,200);assert.equal(res.data.research.settings.daily_target,80)
  assert.equal(res.data.deployment.candidateOnly,true)
  assert(!calls.some(c=>c.path==='/rest/v1/rpc/is_workspace_admin'))
  assert(!calls.some(c=>/credential|email_send|claim_research|save_email/.test(c.path)))
}))

test('a non-admin cannot mutate daily research settings',async()=>fixture(async calls=>{
  const res=response();await handler(request('save_research_settings',{enabled:true,dailyTarget:80,dailyRequestLimit:8,timezone:'America/New_York',startHour:6,query:''}),res)
  assert.equal(res.statusCode,403);assert(!calls.some(c=>c.path==='/rest/v1/rpc/save_email_research_settings'))
},{admin:false}))

test('an unavailable app is denied before daily research status or settings reads',async()=>fixture(async calls=>{
  const res=response();await handler(request('get_research_status'),res)
  assert.equal(res.statusCode,403);assert(!calls.some(c=>/get_email_research_status/.test(c.path)))
},{productAvailable:false}))

test('an explicitly saved research setting cannot launch campaigns or call providers',async()=>fixture(async calls=>{
  const res=response();await handler(request('save_research_settings',{enabled:false,dailyTarget:80,dailyRequestLimit:8,timezone:'America/New_York',startHour:6,query:''}),res)
  assert.equal(res.statusCode,200);assert.match(res.data.message,/paused/)
  assert(calls.some(c=>c.path==='/rest/v1/rpc/save_email_research_settings'))
  assert(!calls.some(c=>/credential|email_send_queue|email_campaigns|claim_research/.test(c.path)))
}))
