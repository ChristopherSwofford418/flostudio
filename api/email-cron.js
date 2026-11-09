import { emailDb, emailRpc, emailDeploymentStatus, emailLocalClock, isEmailCampaignDue, safeEmailSecretEqual, emailMessage, randomEmailToken, hashEmailToken } from './email-core.js'
import { refreshGmailConnection, submitGmailEmail } from './email-gmail.js'
import { allocateEmailBudget } from './email-allocation.js'

export const config={maxDuration:300}
const query=args=>new URLSearchParams(args).toString()
const first=rows=>Array.isArray(rows) ? rows[0] : rows
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
  const deadline=Date.now()+240000,stats={prepared:0,accepted:0,failed:0,unknown:0,skipped:0}
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
    // Idempotent preparation can resume after a worker timeout; a durable local-day
    // run record is audit data, not a reason to abandon a partially prepared day.
    for(const campaign of active) {
      if(Date.now()>deadline) break
      if(!isEmailCampaignDue(campaign) || !shares.get(campaign.id)) continue
      const day=emailLocalClock(campaign.timezone).day
      await emailRpc('email_claim_daily_run',{p_campaign_id:campaign.id})
      const existing=await rows('email_send_queue','id,contact_id',{campaign_id:`eq.${campaign.id}`,scheduled_day:`eq.${day}`},100)
      const already=new Set(existing.map(q=>q.contact_id)),share=shares.get(campaign.id)
      let remaining=Math.max(0,share-existing.length)
      if(!remaining) continue
      const cutoff=new Date(Date.now()-30*86400000).toISOString()
      const contacts=await allRows('email_contacts','id,email',{workspace_id:`eq.${campaign.workspace_id}`,product_id:`eq.${campaign.product_id}`,status:'eq.opted_in',or:`(last_contacted_at.is.null,last_contacted_at.lt.${cutoff})`,order:'created_at.asc'})
      const eligible=new Set(contacts.map(c=>c.id))
      const drafts=await allRows('email_drafts','id,contact_id',{campaign_id:`eq.${campaign.id}`,status:'eq.approved',order:'created_at.desc'})
      for(const draft of drafts) {
        if(!remaining || Date.now()>deadline) break
        if(!eligible.has(draft.contact_id) || already.has(draft.contact_id)) continue
        try {
          const id=await emailRpc('email_prepare_queue',{p_campaign_id:campaign.id,p_contact_id:draft.contact_id,p_draft_id:draft.id,p_scheduled_day:day})
          if(id) { already.add(draft.contact_id); remaining--; stats.prepared++ }
        } catch { stats.skipped++ }
      }
    }
    // Round-robin across apps; no BCC batches. The SQL claim reserves account and
    // recipient quotas atomically, with unknown/claimed sends never retried.
    const groups=[]
    for(const campaign of active) {
      if(Date.now()>deadline) break
      if(!isEmailCampaignDue(campaign)) continue
      const pending=await rows('email_send_queue','id,workspace_id,campaign_id',{campaign_id:`eq.${campaign.id}`,scheduled_day:`eq.${emailLocalClock(campaign.timezone).day}`,status:'eq.prepared',order:'created_at.asc'},100)
      groups.push(pending)
    }
    const providerConnections=new Map(),failedWorkspaces=new Set()
    let attempted=0,more=true
    while(more && attempted<100 && Date.now()<deadline) {
      more=false
      for(const group of groups) {
        if(attempted>=100 || Date.now()>deadline) break
        const item=group.shift()
        if(!item) continue
        more=true
        if(failedWorkspaces.has(item.workspace_id)) { stats.skipped++; continue }
        let provider
        try {
          if(!providerConnections.has(item.workspace_id)) providerConnections.set(item.workspace_id,await refreshGmailConnection(item.workspace_id))
          provider=providerConnections.get(item.workspace_id)
        } catch { failedWorkspaces.add(item.workspace_id); stats.skipped++; continue }
        const claimed=first(await emailRpc('email_claim_send',{p_queue_id:item.id}))
        if(!claimed?.claim_token) { stats.skipped++; continue }
        attempted++
        let outcome='failed',id=null
        try {
          // Recheck immediately before dispatch. An opt-out after dispatch cannot
          // retract a request already accepted by Gmail; such races are not retried.
          const suppressed=await rows('email_suppressions','email',{workspace_id:`eq.${item.workspace_id}`,email:`eq.${claimed.email}`},1)
          if(suppressed.length || provider.email!==claimed.sender_snapshot?.email) throw new Error('Recipient/sender no longer eligible')
          const unsubscribeToken=randomEmailToken()
          await emailDb('email_unsubscribe_tokens',{method:'POST',body:{token_hash:hashEmailToken(unsubscribeToken),workspace_id:item.workspace_id,email:claimed.email}})
          const message=emailMessage({senderEmail:claimed.sender_snapshot.email,senderName:claimed.sender_snapshot.sender_name,recipient:claimed.email,subject:claimed.subject_snapshot,body:claimed.body_snapshot,adLink:claimed.sender_snapshot.ad_link,postalAddress:claimed.sender_snapshot.postal_address,unsubscribeToken,messageId:claimed.id})
          const result=await submitGmailEmail(provider,message.raw)
          id=result.id; outcome='sent';stats.accepted++
        } catch(error) {
          outcome=error.acceptanceUnknown ? 'unknown' : 'failed'
          stats[outcome]++
          // Stop this mailbox on every rejection/uncertain submission. No retries
          // or account rotation. Other workspaces using this account also stop.
          for(const c of connections.filter(c=>c.account_key===provider.account_key)) failedWorkspaces.add(c.workspace_id)
          await emailDb(`workspace_gmail_connections?${query({account_key:`eq.${provider.account_key}`})}`,{method:'PATCH',body:{sending_enabled:false}})
        }
        await emailRpc('email_finish_send',{p_queue_id:claimed.id,p_claim_token:claimed.claim_token,p_outcome:outcome,p_provider_message_id:id})
      }
    }
    return res.status(200).json({...stats,message:'Accepted counts are Gmail API acceptance, not confirmed recipient delivery. Deferred or uncertain items are never blindly retried.'})
  } catch { return res.status(503).json({...stats,error:'Email worker stopped safely. Claimed or unknown submissions must be reviewed; no automatic retry occurred.'}) }
}
