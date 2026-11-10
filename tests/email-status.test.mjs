import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { emailConnectionStatus } from '../api/email-core.js'

test('safe Gmail status uses the caller JWT without a service key and returns a whitelist only',async()=>{
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  const old=globalThis.fetch
  globalThis.fetch=async(url,options)=>{
    assert.match(url,/\/rpc\/email_connection_status$/)
    assert.equal(options.headers.Authorization,'Bearer dummy-member-session')
    assert.deepEqual(JSON.parse(options.body),{p_workspace_id:'workspace-test'})
    return new Response(JSON.stringify({configured:true,email:'required@example.test',expected_email:'required@example.test',daily_budget:1800,encrypted_credentials:'test-only-never-return',access_token:'test-only-never-return'}),{status:200})
  }
  try {
    const status=await emailConnectionStatus('workspace-test','dummy-member-session')
    assert.deepEqual(status,{configured:true,email:'required@example.test',expected_email:'required@example.test',daily_budget:1800})
  }finally{globalThis.fetch=old}
})
test('status never falls back to privileged credentials when a caller session is missing',async()=>{
  const old=globalThis.fetch
  globalThis.fetch=async()=>{throw new Error('Network must not be called')}
  try{await assert.rejects(emailConnectionStatus('workspace-test',''),error=>error.status===401)}finally{globalThis.fetch=old}
})
test('metadata RPC requires workspace membership, fixes search path and grants no anonymous or credential-table access',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/20261109_email_status_metadata.sql',import.meta.url),'utf8')
  assert.match(sql,/auth\.uid\(\) is null/)
  assert.match(sql,/get_workspace_role\(p_workspace_id\)/)
  assert.match(sql,/security definer set search_path = ''/)
  assert.match(sql,/from public,anon,service_role/)
  assert.match(sql,/to authenticated/)
  assert.doesNotMatch(sql,/encrypted_credentials|refresh_token|access_token|grant select/i)
})
