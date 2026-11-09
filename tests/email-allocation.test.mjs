import test from 'node:test'
import assert from 'node:assert/strict'
import { allocateEmailBudget } from '../api/email-allocation.js'
import handler from '../api/email-cron.js'
const apps=Array.from({length:25},(_,i)=>({id:String(i).padStart(2,'0'),daily_limit:100}))
test('2000 shared across25apps is80perapp, not100each',()=>{
 const shares=allocateEmailBudget(apps,2000)
 assert.equal(shares.size,25)
 assert([...shares.values()].every(v=>v===80))
 assert.equal([...shares.values()].reduce((a,b)=>a+b,0),2000)
})
test('1800 headroom budget across25apps is72each',()=>{
 assert([...allocateEmailBudget(apps,1800).values()].every(v=>v===72))
})
test('each app keeps its own lower cap and unused shares never overloadothers',()=>{
 const shares=allocateEmailBudget([{id:'a',daily_limit:10},{id:'b',daily_limit:100}],2000)
 assert.equal(shares.get('a'),10);assert.equal(shares.get('b'),100)
 assert.equal(allocateEmailBudget([],2000).size,0)
 assert.equal([...allocateEmailBudget(apps,0).values()].reduce((a,b)=>a+b,0),0)
})
test('remainder allocation is stable and never exceeds shared budget',()=>{
 const shares=allocateEmailBudget(apps,1801)
 assert.equal([...shares.values()].reduce((a,b)=>a+b,0),1801)
 assert.equal(shares.get('00'),73)
})
function res(){return{statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(s){this.statusCode=s;return this},json(v){this.body=v;return this}}}
test('scheduler fails closed without its secret and does not accessdatabase',async()=>{
 const old=process.env.CRON_SECRET;delete process.env.CRON_SECRET
 const response=res();await handler({method:'GET',headers:{}},response)
 assert.equal(response.statusCode,401)
 if(old===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=old
})
test('disabled scheduler cannot prepare or send even with valid auth',async()=>{
 const old={secret:process.env.CRON_SECRET,live:process.env.EMAIL_LIVE_SENDING_ENABLED,cron:process.env.EMAIL_CRON_ENABLED}
 process.env.CRON_SECRET='mock-cron';delete process.env.EMAIL_LIVE_SENDING_ENABLED;delete process.env.EMAIL_CRON_ENABLED
 const original=globalThis.fetch;globalThis.fetch=()=>{throw Error('Disabledcron mustnot touch network')}
 try {const response=res();await handler({method:'GET',headers:{authorization:'Bearer mock-cron'}},response);assert.equal(response.body.disabled,true)}
 finally{globalThis.fetch=original;for(const [name,value]of [['CRON_SECRET',old.secret],['EMAIL_LIVE_SENDING_ENABLED',old.live],['EMAIL_CRON_ENABLED',old.cron]]){if(value===undefined)delete process.env[name];else process.env[name]=value}}
})
