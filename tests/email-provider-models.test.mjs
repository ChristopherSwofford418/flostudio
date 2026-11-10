import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {researchEmailCandidates} from '../api/email-source-research.js'

test('drafting requires an explicit model and has no retired silent fallback',async()=>{
 const source=await readFile(new URL('../api/email-campaigns.js',import.meta.url),'utf8')
 assert.match(source,/EMAIL_DRAFT_MODEL_REQUIRED/)
 assert.doesNotMatch(source,/\|\|\s*['"]gpt-4o-mini['"]/)
 assert.match(source,/max_completion_tokens:6000/)
 assert.match(source,/model==='gpt-5\.6-terra' \? \{reasoning_effort:'low'\}/)
})
test('configured current research model uses Responses low effort, sources and strict schema without a paid call',async()=>{
 const saved=process.env.OPENAI_EMAIL_RESEARCH_MODEL
 process.env.OPENAI_EMAIL_RESEARCH_MODEL='gpt-5.6-terra'
 let request
 try{
  const result=await researchEmailCandidates({apiKey:'offline-test-placeholder',product:{name:'Example app',description:'A listed organizing capability.'}},
   {fetch:async(url,options)=>{request={url,body:JSON.parse(options.body)};return {ok:true,json:async()=>({status:'completed',output:[{type:'web_search_call',status:'completed',action:{sources:[]}},{type:'message',content:[{type:'output_text',text:'{"candidates":[]}'}]}]})}}})
  assert.equal(request.url,'https://api.openai.com/v1/responses')
  assert.equal(request.body.model,'gpt-5.6-terra')
  assert.deepEqual(request.body.reasoning,{effort:'low'})
  assert.equal(request.body.store,false)
  assert.equal(request.body.tool_choice,'required')
  assert.equal(request.body.text.format.strict,true)
  assert.deepEqual(result.candidates,[])
 }finally{if(saved===undefined)delete process.env.OPENAI_EMAIL_RESEARCH_MODEL;else process.env.OPENAI_EMAIL_RESEARCH_MODEL=saved}
})
