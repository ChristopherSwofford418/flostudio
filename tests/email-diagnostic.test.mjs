import test, {beforeEach, afterEach} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {sendOneGmailDiagnostic,gmailDiagnosticMessage,GMAIL_TEST_SUBJECT,GMAIL_TEST_BODY} from '../api/email-diagnostic.js'
import gmailHandler from '../api/email-gmail.js'

const W='11111111-1111-4111-8111-111111111111', P='22222222-2222-4222-8222-222222222222', U='33333333-3333-4333-8333-333333333333', ID='44444444-4444-4444-8444-444444444444', KEY='a'.repeat(64)
const sender='sender@example.test', owner='owner@example.test'
const connection={workspace_id:W,account_key:KEY,email:sender,configured:true,sending_enabled:false,accessToken:'test-dummy-access',account:{account_key:KEY,sending_enabled:false}}
const user={id:U,email:owner}
const args=()=>({connection:structuredClone(connection),user,productId:P,recipient:owner})
const json=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:{'Content-Type':'application/json'}})
let originalFetch,originalKey,record,events,googleMode,failFinal
beforeEach(()=>{
  originalFetch=globalThis.fetch; originalKey=process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.SUPABASE_SERVICE_ROLE_KEY='unit-test-dummy-service'
  record=null;events=[];googleMode='accepted';failFinal=false
  globalThis.fetch=async(input,options={})=>{
    const url=new URL(input),body=options.body ? JSON.parse(options.body) : null
    events.push({url:url.href,method:options.method||'GET',body})
    if(url.hostname==='jtogllurcrxxaguoxeus.supabase.co'){
      if(url.pathname==='/auth/v1/user')return json(user)
      if(url.pathname==='/rest/v1/rpc/is_workspace_admin')return json(true)
      if(url.pathname==='/rest/v1/rpc/email_reserve_diagnostic'){
        assert.equal(body.p_workspace_id,W);assert.equal(body.p_product_id,P);assert.equal(body.p_user_id,U)
        if(record)return json({message:'PRIVATE DATABASE DETAIL'},409)
        record={id:ID,recipient:body.p_recipient,status:'reserved'};return json(record)
      }
      assert.equal(url.pathname,'/rest/v1/email_gmail_diagnostics','No other database mutation is permitted')
      assert.equal(options.method,'PATCH');assert.equal(url.searchParams.get('workspace_id'),`eq.${W}`)
      assert.equal(url.searchParams.get('product_id'),`eq.${P}`);assert.equal(url.searchParams.get('account_key'),`eq.${KEY}`)
      assert.equal(url.searchParams.get('limit'),'1');assert.equal(url.searchParams.get('select'),'id')
      if(record.status!==url.searchParams.get('status').slice(3))return json([])
      if(failFinal && body.status==='accepted')return json({message:'PRIVATE DATABASE DETAIL'},500)
      Object.assign(record,body);return json([{id:ID}])
    }
    assert.equal(url.href,'https://gmail.googleapis.com/gmail/v1/users/me/messages/send','No live network permitted')
    assert.equal(record.status,'unknown','Unknown persisted before external send')
    assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer test-dummy-access')
    const mime=Buffer.from(body.raw,'base64url').toString()
    assert(mime.includes(`To: <${owner}>`)||mime.includes(`To: <${sender}>`))
    assert(!mime.includes('List-Unsubscribe')&&!mime.includes('Attachment')&&!mime.includes('Cc:'))
    if(googleMode==='timeout')throw new Error('PRIVATE TRANSPORT DETAIL')
    if(googleMode==='rejected')return json({error_description:'PRIVATE PROVIDER DETAIL'},403)
    if(googleMode==='servererror')return json({error_description:'PRIVATE PROVIDER DETAIL'},500)
    if(googleMode==='malformed')return json({id:'invalid message id'})
    return json({id:'dummy-provider-123'})
  }
})
afterEach(()=>{globalThis.fetch=originalFetch;if(originalKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=originalKey})
const submissions=()=>events.filter(e=>e.url.startsWith('https://gmail.googleapis.com'))

test('MIME contains exactly the approved subject/body and one recipient',()=>{
 const raw=gmailDiagnosticMessage(sender,owner,ID),mime=Buffer.from(raw,'base64url').toString(),parts=mime.split('\r\n\r\n')
 assert.equal(parts.length,2)
 assert(mime.includes(`Subject: =?UTF-8?B?${Buffer.from(GMAIL_TEST_SUBJECT).toString('base64')}?=`))
 assert.equal(Buffer.from(parts[1].replace(/\r\n/g,''),'base64').toString(),GMAIL_TEST_BODY)
 assert(mime.includes(`Message-ID: <gmail-test-${ID}@flostudio.io>`))
 assert.throws(()=>gmailDiagnosticMessage(sender,'attacker@example.test\r\nBcc: victim@example.test',ID))
})
test('one accepted diagnostic leaves all delivery flags unchanged and returns no token',async()=>{
 const input=args(),result=await sendOneGmailDiagnostic(input)
 assert.deepEqual(result,{accepted:true,recipient:owner,providerMessageId:'dummy-provider-123',recorded:true,sendingEnabled:false})
 assert.equal(record.status,'accepted');assert.equal(submissions().length,1)
 assert.equal(input.connection.sending_enabled,false);assert.equal(input.connection.account.sending_enabled,false)
 assert(!JSON.stringify(result).includes('test-dummy-access'))
})
test('a duplicate is never submitted again',async()=>{
 await sendOneGmailDiagnostic(args())
 await assert.rejects(sendOneGmailDiagnostic(args()),e=>e.code==='GMAIL_TEST_UNAVAILABLE'&&!e.message.includes('PRIVATE'))
 assert.equal(submissions().length,1)
})
test('connected mailbox is the only other allowed diagnostic recipient',async()=>{
 const input=args();input.recipient=sender;await sendOneGmailDiagnostic(input);assert.equal(record.recipient,sender)
})
test('arbitrary recipients are rejected before reservation or provider call',async()=>{
 const input=args();input.recipient='unapproved@example.test'
 await assert.rejects(sendOneGmailDiagnostic(input),e=>e.code==='GMAIL_TEST_RECIPIENT_INVALID')
 assert.equal(events.length,0)
})
test('active shared delivery refuses the diagnostic without changing any flag',async()=>{
 for(const target of ['workspace','account']){
  const input=args();if(target==='workspace')input.connection.sending_enabled=true;else input.connection.account.sending_enabled=true
  await assert.rejects(sendOneGmailDiagnostic(input),e=>e.code==='GMAIL_TEST_UNAVAILABLE')
 }
 assert.equal(events.length,0)
})
for(const mode of ['timeout','servererror','malformed'])test(`${mode} retains unknown and never retries or leaks provider details`,async()=>{
 googleMode=mode
 await assert.rejects(sendOneGmailDiagnostic(args()),e=>e.code==='GMAIL_TEST_ACCEPTANCE_UNKNOWN'&&!e.message.includes('PRIVATE'))
 assert.equal(record.status,'unknown');assert.equal(submissions().length,1)
 await assert.rejects(sendOneGmailDiagnostic(args()));assert.equal(submissions().length,1)
})
test('a definite 4xx rejection is recorded without automatic retry',async()=>{
 googleMode='rejected';await assert.rejects(sendOneGmailDiagnostic(args()),e=>e.code==='GMAIL_TEST_REJECTED')
 assert.equal(record.status,'rejected');assert.equal(submissions().length,1)
})
test('Gmail acceptance is preserved when final ledger recording fails',async()=>{
 failFinal=true;const result=await sendOneGmailDiagnostic(args())
 assert.equal(result.accepted,true);assert.equal(result.recorded,false);assert.equal(record.status,'unknown');assert.equal(submissions().length,1)
})
test('handler requires explicit confirmation before product or Gmail credential reads',async()=>{
 const response={statusCode:0,data:null,setHeader(){},status(code){this.statusCode=code;return this},json(data){this.data=data;return this}}
 await gmailHandler({method:'POST',headers:{authorization:'Bearer dummy-session'},body:{workspaceId:W,productId:P,action:'send_test',recipient:owner}},response)
 assert.equal(response.statusCode,400);assert.equal(response.data.code,'GMAIL_TEST_CONFIRMATION_REQUIRED');assert.equal(submissions().length,0)
 assert(!events.some(e=>e.url.includes('workspace_gmail_connections')))
})
test('existing campaign submission retains the independent live-environment and account gates',async()=>{
 const source=await readFile(new URL('../api/email-gmail.js',import.meta.url),'utf8')
 assert(source.includes("process.env.EMAIL_LIVE_SENDING_ENABLED !== 'true' || connection.sending_enabled !== true || connection.account?.sending_enabled !== true"))
 assert(source.includes('await assertWorkspaceProduct({workspaceId, productId:body.productId, accessToken})'))
 assert(source.includes("if (body.confirmTest !== true || !uuid(body.productId))"))
})

test('test-send cannot be invoked without a signed-in user',async()=>{
 const response={statusCode:0,data:null,setHeader(){},status(code){this.statusCode=code;return this},json(data){this.data=data;return this}}
 await gmailHandler({method:'POST',headers:{},body:{workspaceId:W,productId:P,action:'send_test',recipient:owner,confirmTest:true}},response)
 assert.equal(response.statusCode,401);assert.equal(events.length,0)
})
test('non-admin cannot reach the diagnostic reservation or provider',async()=>{
 const mock=globalThis.fetch
 globalThis.fetch=async(input,options)=>new URL(input).pathname==='/rest/v1/rpc/is_workspace_admin' ? json(false) : mock(input,options)
 const response={statusCode:0,data:null,setHeader(){},status(code){this.statusCode=code;return this},json(data){this.data=data;return this}}
 await gmailHandler({method:'POST',headers:{authorization:'Bearer dummy-session'},body:{workspaceId:W,productId:P,action:'send_test',recipient:owner,confirmTest:true}},response)
 assert.equal(response.statusCode,403);assert.equal(submissions().length,0);assert.equal(record,null)
})
test('an unavailable app is denied before Gmail credential access',async()=>{
 const mock=globalThis.fetch
 globalThis.fetch=async(input,options)=>{
  const url=new URL(input)
  if(url.pathname==='/rest/v1/rpc/get_workspace_role')return json('owner')
  if(url.pathname==='/rest/v1/products'){
   assert.equal(url.searchParams.get('id'),`eq.${P}`);assert.equal(url.searchParams.get('workspace_id'),`eq.${W}`)
   return json([])
  }
  return mock(input,options)
 }
 const response={statusCode:0,data:null,setHeader(){},status(code){this.statusCode=code;return this},json(data){this.data=data;return this}}
 await gmailHandler({method:'POST',headers:{authorization:'Bearer dummy-session'},body:{workspaceId:W,productId:P,action:'send_test',recipient:owner,confirmTest:true}},response)
 assert.equal(response.statusCode,403);assert.equal(submissions().length,0);assert.equal(record,null)
 assert(!events.some(e=>e.url.includes('workspace_gmail_connections')))
})
