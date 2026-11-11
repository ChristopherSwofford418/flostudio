import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { emailResearchDeploymentStatus, researchSettingsPayload } from '../api/email-research-settings.js'

const valid = { enabled:false, dailyTarget:80, dailyRequestLimit:8, timezone:'America/New_York', startHour:6, query:'Local businesses relevant to the selected app' }

test('research configuration validates target, request budget, timezone and explicit enable state', () => {
  assert.deepEqual(researchSettingsPayload(valid), { p_enabled:false,p_daily_target:80,p_daily_request_limit:8,p_timezone:'America/New_York',p_start_hour:6,p_query:valid.query })
  for (const patch of [{enabled:'true'},{enabled:null},{dailyTarget:0},{dailyTarget:101},{dailyTarget:''},{dailyTarget:1.2},{dailyRequestLimit:0},{dailyRequestLimit:11},{startHour:24},{startHour:null},{timezone:'not-a-timezone'},{timezone:''},{query:'x'.repeat(501)},{query:{send:true}}]) assert.throws(() => researchSettingsPayload({...valid,...patch}), { code:'EMAIL_RESEARCH_SETTINGS_INVALID' })
  assert.equal(researchSettingsPayload({...valid,dailyTarget:'80',dailyRequestLimit:'8',startHour:'6'}).p_daily_target,80)
})

test('candidate research has an independent disabled-by-default deployment gate and opaque status', () => {
  const keys=['EMAIL_RESEARCH_CRON_ENABLED','CRON_SECRET','SUPABASE_SERVICE_ROLE_KEY','ASC_CREDENTIALS_ENCRYPTION_KEY','OPENAI_EMAIL_RESEARCH_MODEL','EMAIL_LIVE_SENDING_ENABLED','EMAIL_CRON_ENABLED','EMAIL_RESEARCH_WORKSPACE_DAILY_REQUEST_LIMIT']
  const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
  try {
    keys.forEach(k=>delete process.env[k])
    assert.equal(emailResearchDeploymentStatus(true).configured,false)
    process.env.EMAIL_LIVE_SENDING_ENABLED='true';process.env.EMAIL_CRON_ENABLED='true'
    assert.equal(emailResearchDeploymentStatus(true).configured,false)
    process.env.EMAIL_RESEARCH_CRON_ENABLED='true';process.env.CRON_SECRET='synthetic-private-scheduler';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-private-db';process.env.ASC_CREDENTIALS_ENCRYPTION_KEY='synthetic-private-root';process.env.OPENAI_EMAIL_RESEARCH_MODEL='configured-model'
    const status=emailResearchDeploymentStatus(true)
    assert.equal(status.configured,true);assert.equal(status.candidateOnly,true);assert.equal(status.workspaceDailyRequestLimit,200)
    assert(!JSON.stringify(status).includes('synthetic-private'))
    assert.equal(process.env.EMAIL_LIVE_SENDING_ENABLED,'true')
    delete process.env.CRON_SECRET;assert.equal(emailResearchDeploymentStatus(true).configured,false)
  } finally {for(const k of keys) {if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k]}}
})

test('native research cadence is separate and preserves the existing delivery schedule', async () => {
  const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'))
  assert.deepEqual(config.crons.find(c=>c.path==='/api/email-cron'),{path:'/api/email-cron',schedule:'*/5 * * * *'})
  assert.deepEqual(config.crons.find(c=>c.path==='/api/email-research-cron'),{path:'/api/email-research-cron',schedule:'* * * * *'})
})

