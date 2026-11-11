import test from 'node:test'
import assert from 'node:assert/strict'
import handler,{safeWorkspaceAutomation} from '../api/email-workspace-automation.js'
const W='11111111-1111-4111-8111-111111111111',P='22222222-2222-4222-8222-222222222222',R='a'.repeat(32)
const snapshot=patch=>({workspace_id:W,reviewRevision:R,truncated:false,apps:[{id:P,name:'App One',researchEnabled:true,draftsEnabled:true,researchTarget:80,researchRequestLimit:8,researchTimezone:'America/New_York',researchStartHour:6,draftTimezone:'America/New_York',draftStartHour:7,todayDraftCreated:true,deliveryEnabled:false,senderDetailsComplete:false,optedInCount:0}],totals:{activeApps:1,researchEnabled:1,draftsEnabled:1,todayDrafts:1,deliveryEnabled:0,optedInContacts:0,researchRequestCeiling:8},...patch})
const result=patch=>({applied:true,mode:'research_and_drafts',researchChanged:0,draftsChanged:0,deliveryChanged:0,status:snapshot(),...patch})
const res=()=>({statusCode:0,data:null,setHeader(){},status(code){this.statusCode=code;return this},json(data){this.data=data;return this}})
const req=(method='GET',body={})=>({method,headers:{authorization:'Bearer synthetic-session'},query:{workspaceId:W},body:{workspaceId:W,action:'set_research_and_drafts',enabled:true,reviewRevision:R,confirmResearchCost:true,...body}})
async function fixture(run,{role='owner',admin=true,gates=true,mutation=result(),read=snapshot()}={}){
 const previous=globalThis.fetch,keys=['EMAIL_RESEARCH_CRON_ENABLED','EMAIL_DAILY_CAMPAIGN_CRON_ENABLED','EMAIL_RESEARCH_WORKSPACE_DAILY_REQUEST_LIMIT','CRON_SECRET','SUPABASE_SERVICE_ROLE_KEY','OPENAI_PROVIDER_VAULT_KEY','OPENAI_EMAIL_RESEARCH_MODEL','EMAIL_LIVE_SENDING_ENABLED','EMAIL_CRON_ENABLED'],env=Object.fromEntries(keys.map(k=>[k,process.env[k]])),calls=[]
 Object.assign(process.env,{EMAIL_RESEARCH_CRON_ENABLED:gates?'true':'false',EMAIL_DAILY_CAMPAIGN_CRON_ENABLED:'true',EMAIL_RESEARCH_WORKSPACE_DAILY_REQUEST_LIMIT:'200',CRON_SECRET:'synthetic-cron',SUPABASE_SERVICE_ROLE_KEY:'synthetic-worker',OPENAI_PROVIDER_VAULT_KEY:'synthetic-vault',OPENAI_EMAIL_RESEARCH_MODEL:'synthetic-model',EMAIL_LIVE_SENDING_ENABLED:'false',EMAIL_CRON_ENABLED:'false'})
 globalThis.fetch=async(url,options={})=>{
  const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):null;calls.push({path,body,headers:options.headers})
  const json=data=>new Response(JSON.stringify(data),{status:200})
  if(path==='/auth/v1/user')return json({id:'33333333-3333-4333-8333-333333333333'})
  if(path==='/rest/v1/rpc/get_workspace_role')return json(role)
  if(path==='/rest/v1/rpc/is_workspace_admin')return json(admin)
  if(path==='/rest/v1/rpc/get_workspace_openai_provider_status')return json([{configured:true}])
  if(path==='/rest/v1/rpc/get_email_workspace_automation_status'){assert.deepEqual(body,{p_workspace_id:W});return json(read)}
  if(path==='/rest/v1/rpc/set_email_workspace_automation'){assert.equal(options.headers.Authorization,'Bearer synthetic-session');return json(mutation)}
  assert.fail('No product-table, provider, credential, consent, email-send or queue request is permitted: '+path)
 }
 try{await run(calls)}finally{globalThis.fetch=previous;for(const k of keys)if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k]}
}
test('members can read safe complete workspace status without any mutation or service authorization',async()=>fixture(async calls=>{
 const out=res();await handler(req(),out);assert.equal(out.statusCode,200);assert.equal(out.data.automation.totals.activeApps,1);assert.equal(out.data.deployment.workspaceDailyRequestLimit,200)
 assert(!calls.some(c=>c.path.includes('set_email')||c.path.includes('is_workspace_admin')))
 assert(!JSON.stringify(out.data).includes('synthetic-'))
},{role:'member'}))
test('anonymous and foreign workspace users cannot read or mutate bulk status',async()=>{
 const anonymous=req();anonymous.headers={};const out=res();await handler(anonymous,out);assert.equal(out.statusCode,401)
 await fixture(async calls=>{const r=res();await handler(req(),r);assert.equal(r.statusCode,403);assert(!calls.some(c=>c.path.includes('get_email_workspace')))}, {role:'none'})
})
test('members cannot POST even if they override product IDs or service flags',async()=>fixture(async calls=>{
 const out=res();await handler(req('POST',{productId:'foreign',sendingEnabled:true}),out);assert.equal(out.statusCode,403);assert(!calls.some(c=>c.path.includes('set_email_workspace')))
},{role:'member',admin:false}))
test('one explicitly confirmed POST sends exactly one narrow atomic user-JWT RPC and no delivery action',async()=>fixture(async calls=>{
 const out=res();await handler(req('POST',{productId:'foreign',sendingEnabled:true,accountType:'workspace',dailyBudget:2000}),out)
 assert.equal(out.statusCode,200);assert.equal(out.data.deliveryChanged,0)
 const writes=calls.filter(c=>c.path.includes('set_email_workspace'));assert.equal(writes.length,1)
 assert.deepEqual(writes[0].body,{p_workspace_id:W,p_enabled:true,p_review_revision:R,p_confirm_research_cost:true})
 assert.equal(out.data.deployment.sendingEnabled,false)
}))
test('unconfirmed cost, malformed revision, nonboolean enabled, and unsupported send action cannot mutate',async()=>fixture(async calls=>{
 for(const patch of [{confirmResearchCost:false},{confirmResearchCost:'true'},{reviewRevision:'bad'},{enabled:'true'},{action:'start_all_sending'}]){const out=res();await handler(req('POST',patch),out);assert(out.statusCode>=400)}
 assert(!calls.some(c=>c.path.includes('set_email_workspace')))
}))
test('start fails closed when research gates are absent, but reviewed pause remains available',async()=>fixture(async calls=>{
 let out=res();await handler(req('POST'),out);assert.equal(out.statusCode,409);assert(!calls.some(c=>c.path.includes('set_email_workspace')))
 out=res();await handler(req('POST',{enabled:false,confirmResearchCost:false}),out);assert.equal(out.statusCode,200)
 assert.equal(calls.filter(c=>c.path.includes('set_email_workspace')).length,1)
},{gates:false}))
test('stale review returns fixed conflict and malformed mutation cannot claim success',async()=>{
 await fixture(async()=>{const out=res();await handler(req('POST'),out);assert.equal(out.statusCode,409);assert.equal(out.data.code,'EMAIL_WORKSPACE_REVIEW_STALE')},{mutation:{applied:false,code:'EMAIL_WORKSPACE_REVIEW_STALE',detail:'synthetic-private'}})
 for(const patch of [{deliveryChanged:1},{applied:false},{mode:'delivery'},{status:snapshot({workspace_id:P})}])await fixture(async()=>{const out=res();await handler(req('POST'),out);assert(out.statusCode>=400);assert(!JSON.stringify(out.data).includes('synthetic-private'))},{mutation:result(patch)})
})
test('safe metadata strips extra credentials and rejects foreign scope, duplicate apps and incomplete reviews',()=>{
 const out=safeWorkspaceAutomation({...snapshot(),ciphertext:'synthetic-private',tokens:'synthetic-private'},W);assert(!JSON.stringify(out).includes('synthetic-private'))
 for(const patch of [{workspace_id:P},{apps:[snapshot().apps[0],snapshot().apps[0]]},{reviewRevision:''},{totals:{...snapshot().totals,activeApps:2}},{truncated:undefined}])assert.throws(()=>safeWorkspaceAutomation(snapshot(patch),W))
})
