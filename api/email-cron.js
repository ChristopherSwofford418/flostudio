import { emailDb, emailRpc, emailDeploymentStatus, emailLocalClock, isEmailCampaignDue, safeEmailSecretEqual, emailMessage, randomEmailToken, hashEmailToken } from './email-core.js'
import { refreshGmailConnection, submitGmailEmail } from './email-gmail.js'
import { allocateEmailBudget } from './email-allocation.js'

export const config={maxDuration:300}
const query=args=>new URLSearchParams(args).toString()
const first=rows=>Array.isArray(rows) ? rows[0] : rows
// Deployment-owned, deterministic spacing between provider submission starts. The
// injectable clock/sleep are for isolated tests, not request-controlled overrides.
export function createEmailSendPacer({intervalMs=process.env.EMAIL_SEND_INTERVAL_MS,now=()=>Date.now(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
  const parsed=Number(intervalMs)
  const interval=Number.isFinite(parsed) && String(intervalMs ?? '').trim() ? Math.min(10000,Math.max(1000,Math.floor(parsed))) : 1000
  let lastDispatch=null
  return {
    intervalMs:interval,
    async wait(deadline) {
      while(lastDispatch!==null) {
        const current=now(),delay=Math.max(0,lastDispatch+interval-current)
        if(current>=deadline || current+delay>=deadline) return false
        if(!delay) break
        await sleep(delay)
      }
      return now()<deadline
    },
    dispatched() { lastDispatch=now() },
  }
}
async function rows(table,select,filters={},limit=500,offset=0) {
  return await emailDb(`${table}?${query({select,...filters,limit:String(limit),offset:String(offset)})}`) || []
}
async function allRows(table,select,filters={},max=5000) {
  const result=[]
  for(let offset=0;offset<max;offset+=500) { const page=await rows(table,select,filters,500,offset); result.push(...page); if(page.length<500) break }
  return result
}
export default async function handler(req,res) {
  res.setHeader('Content-Type','application/json'); res.setHeader('Cache-Control','no-store')
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'})
  if(!process.env.CRON_SECRET || !safeEmailSecretEqual(req.headers?.authorization,`Bearer ${process.env.CRON_SECRET}`)) return res.status(401).json({error:'Scheduler authorization required'})
  const status=emailDeploymentStatus()
  if(!status.sendingEnabled || !status.cronConfigured) return res.status(200).json({disabled:true,message:'Email automation is disabled. No queue preparation or sends were performed.'})
  const deadline=Date.now()+240000,pacer=createEmailSendPacer(),stats={prepared:0,accepted:0,failed:0,unknown:0,skipped:0,paused:0,reconnectRequired:0,pauseFailed:0}
  try {
    const [campaigns,products,connections,accounts]=await Promise.all([
      allRows('email_campaigns','id,workspace_id,product_id,daily_limit,timezone,send_hour,send_minute,state,sending_enabled',{state:'eq.approved',sending_enabled:'eq.true',order:'id.asc'}),
      allRows('products','id,workspace_id,source_facts',{order:'id.asc'}),
      allRows('workspace_gmail_connections','workspace_id,account_key,daily_budget',{configured:'eq.true',sending_enabled:'eq.true',order:'workspace_id.asc'}),
      allRows('email_gmail_accounts','account_key,daily_budget',{sending_enabled:'eq.true',order:'account_key.asc'}),
    ])
    const activeProducts=new Set(products.filter(p=>!p.source_facts?.archived).map(p=>`${p.workspace_id}:${p.id}`))
    const connectionMap=new Map(connections.map(c=>[c.workspace_id,c]))
    const active=campaigns.filter(c=>activeProducts.has(`${c.workspace_id}:${c.product_id}`) && connectionMap.has(c.workspace_id))
    const shares=new Map()
    for(const account of accounts) {
      const group=active.filter(c=>connectionMap.get(c.workspace_id).account_key===account.account_key)
      const limits=connections.filter(c=>c.account_key===account.account_key).map(c=>c.daily_budget)
      const budget=Math.min(account.daily_budget,...limits)
      for(const [id,share] of allocateEmailBudget(group,budget)) shares.set(id,share)
    }
    // Idempotent preparation only consumes already human-approved drafts. The
    // durable local-day run is audit data, not an AI/content-generation trigger.
    for(const campaign of active) {
      if(Date.now()>=deadline) break
      if(!isEmailCampaignDue(campaign) || !shares.get(campaign.id)) continue
      const day=emailLocalClock(campaign.timezone).day
      await emailRpc('email_claim_daily_run',{p_campaign_id:campaign.id})
      const existing=await rows('email_send_queue','id,contact_id',{campaign_id:`eq.${campaign.id}`,scheduled_day:`eq.${day}`},100)
      const already=new Set(existing.map(q=>q.contact_id)),share=shares.get(campaign.id)
      let remaining=Math.max(0,share-existing.length)
      if(!remaining) continue
      const contacts=await allRows('email_contacts','id,email',{workspace_id:`eq.${campaign.workspace_id}`,product_id:`eq.${campaign.product_id}`,status:'eq.opted_in',last_contacted_at:'is.null',order:'created_at.asc'})
      const eligible=new Set(contacts.map(c=>c.id))
      const drafts=await allRows('email_drafts','id,contact_id',{campaign_id:`eq.${campaign.id}`,status:'eq.approved',order:'created_at.desc'})
      for(const draft of drafts) {
        if(!remaining || Date.now()>=deadline) break
        if(!eligible.has(draft.contact_id) || already.has(draft.contact_id)) continue
        try {
          const id=await emailRpc('email_prepare_queue',{p_campaign_id:campaign.id,p_contact_id:draft.contact_id,p_draft_id:draft.id,p_scheduled_day:day})
          if(id) { already.add(draft.contact_id); remaining--; stats.prepared++ }
        } catch { stats.skipped++ }
      }
    }
    // Round-robin across apps, bounded by each app's shared-account allocation.
    // SQL retains atomic quotas, permanent recipient exclusion and exact-copy guards.
    const groups=[]
    for(const campaign of active) {
      if(Date.now()>=deadline) break
      if(!isEmailCampaignDue(campaign) || !shares.get(campaign.id)) continue
      const filters={campaign_id:`eq.${campaign.id}`,scheduled_day:`eq.${emailLocalClock(campaign.timezone).day}`}
      const history=await allRows('email_send_queue','id,status,claimed_at,claim_token',filters)
      const consumed=history.filter(q=>q.claimed_at || q.claim_token || ['claimed','sent','unknown','failed'].includes(q.status)).length
      const remaining=Math.max(0,shares.get(campaign.id)-consumed)
      if(!remaining) continue
      const pending=await rows('email_send_queue','id,workspace_id,campaign_id',{...filters,status:'eq.prepared',order:'created_at.asc'},remaining)
      groups.push(pending)
    }
    const providerConnections=new Map(),failedWorkspaces=new Set(),failedAccounts=new Set()
    function stopMailbox(workspaceId) {
      failedWorkspaces.add(workspaceId)
      const key=connectionMap.get(workspaceId)?.account_key
      if(key) {
        failedAccounts.add(key)
        for(const connection of connections) if(connection.account_key===key) failedWorkspaces.add(connection.workspace_id)
      }
    }
    async function pauseMailbox(workspaceId,reason) {
      stopMailbox(workspaceId)
      try {
        const result=first(await emailRpc('email_pause_mailbox',{p_workspace_id:workspaceId,p_reason:reason}))
        if(result?.allowed!==true || result?.code!=='EMAIL_MAILBOX_PAUSED' || result?.status!=='paused') throw new Error('Mailbox pause was not confirmed')
        stats.paused++
      } catch {
        stats.pauseFailed++
        throw new Error('Mailbox pause could not be recorded')
      }
    }
    let attempted=0,more=true
    dispatch: while(more && attempted<100 && Date.now()<deadline) {
      more=false
      for(const group of groups) {
        if(attempted>=100 || Date.now()>=deadline) break dispatch
        const item=group.shift()
        if(!item) continue
        more=true
        if(failedWorkspaces.has(item.workspace_id) || failedAccounts.has(connectionMap.get(item.workspace_id)?.account_key)) { stats.skipped++; continue }
        let provider
        try {
          if(!providerConnections.has(item.workspace_id)) providerConnections.set(item.workspace_id,await refreshGmailConnection(item.workspace_id))
          provider=providerConnections.get(item.workspace_id)
        } catch {
          stats.skipped++; stats.reconnectRequired++
          await pauseMailbox(item.workspace_id,'reconnect_required')
          continue
        }
        // Pace before the one-shot claim, never while holding a claim. Null claims
        // also consume the invocation's 100-attempt cap; there is no retry loop.
        if(!await pacer.wait(deadline)) break dispatch
        attempted++
        const claimed=first(await emailRpc('email_claim_send',{p_queue_id:item.id}))
        if(!claimed?.claim_token) { stats.skipped++; continue }
        let outcome='failed',id=null,pauseReason=null
        try {
          const unsubscribeToken=randomEmailToken()
          const message=emailMessage({senderEmail:claimed.sender_snapshot.email,senderName:claimed.sender_snapshot.sender_name,recipient:claimed.email,subject:claimed.subject_snapshot,body:claimed.body_snapshot,adLink:claimed.sender_snapshot.ad_link,postalAddress:claimed.sender_snapshot.postal_address,unsubscribeToken,messageId:claimed.id})
          await emailDb('email_unsubscribe_tokens',{method:'POST',body:{token_hash:hashEmailToken(unsubscribeToken),workspace_id:item.workspace_id,email:claimed.email}})
          // Last asynchronous eligibility read, after claim and token creation.
          // Opt-out after dispatch cannot retract a request accepted by Gmail.
          const suppressed=await rows('email_suppressions','email',{workspace_id:`eq.${item.workspace_id}`,email:`eq.${claimed.email}`},1)
          if(suppressed.length || Date.now()>=deadline) stats.skipped++
          else if(provider.email!==claimed.sender_snapshot.email) { stats.skipped++; stats.reconnectRequired++; pauseReason='reconnect_required' }
          else {
            pacer.dispatched()
            try {
              const result=await submitGmailEmail(provider,message.raw)
              id=result.id; outcome='sent'
            } catch(error) {
              outcome=error?.acceptanceUnknown ? 'unknown' : 'failed'
              pauseReason=outcome==='unknown' ? 'submission_unknown' : 'provider_rejected'
            }
          }
        } catch { stats.skipped++ }
        // Only provider failures (or sender reconnect) pause the mailbox, not a
        // recipient opt-out/local preparation error. Stop peers before any I/O.
        let pauseFailed=false
        if(pauseReason) {
          try { await pauseMailbox(item.workspace_id,pauseReason) } catch { pauseFailed=true }
        }
        // Even a failed pause must preserve the claimed attempt's terminal evidence.
        await emailRpc('email_finish_send',{p_queue_id:claimed.id,p_claim_token:claimed.claim_token,p_outcome:outcome,p_provider_message_id:id})
        stats[outcome==='sent' ? 'accepted' : outcome]++
        if(pauseFailed) throw new Error('Mailbox pause could not be recorded')
      }
    }
    return res.status(200).json({...stats,message:'Accepted counts are recorded Gmail API acceptance, not confirmed recipient delivery. Deferred or uncertain items are never blindly retried.'})
  } catch { return res.status(503).json({...stats,error:'Email worker stopped safely. Claimed or unknown submissions must be reviewed; no automatic retry occurred.'}) }
}
