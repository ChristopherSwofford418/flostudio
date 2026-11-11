import { authenticatedProviderUser, assertWorkspaceMember, assertWorkspaceAdmin, authorizationRpc, parseProviderBody } from './provider-key-vault.js'
export const config={maxDuration:30}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function validFacebookDraftDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!value.startsWith('0000-')&&Number.isFinite(Date.parse(`${value}T00:00:00Z`))&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff')
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed.'})}
 try{
  const {accessToken}=await authenticatedProviderUser(req)
  const body=parseProviderBody(req)
  if(!body||Array.isArray(body)||!UUID.test(String(body.workspaceId||'')))return res.status(400).json({error:'Select a valid workspace.'})
  const ws=body.workspaceId
  if(body.action==='get_workspace_status'){
   if(Object.keys(body).some(k=>!['action','workspaceId','scheduledDay'].includes(k))||(body.scheduledDay!=null&&!validFacebookDraftDate(body.scheduledDay)))return res.status(400).json({error:'Choose a valid calendar date.'})
   await assertWorkspaceMember({workspaceId:ws,accessToken})
   const data=await authorizationRpc('get_facebook_daily_workspace_status',{p_workspace_id:ws,p_scheduled_day:body.scheduledDay??null},accessToken)
   if(!data||data.workspace_id!==ws)return res.status(503).json({error:'Saved Facebook draft status could not be confirmed.'})
   return res.status(200).json(data)
  }
  if(body.action==='save_workspace_settings'){
   if(Object.keys(body).some(k=>!['action','workspaceId','enabled','timezone','startHour'].includes(k))||typeof body.enabled!=='boolean'||body.timezone!=='America/New_York'||body.startHour!==3)return res.status(400).json({error:'The daily draft schedule must use the reviewed Eastern preparation time.'})
   await assertWorkspaceAdmin({workspaceId:ws,accessToken})
   const data=await authorizationRpc('facebook_save_daily_settings',{p_workspace_id:ws,p_enabled:body.enabled,p_timezone:'America/New_York',p_start_hour:3},accessToken)
   if(!data||!Number.isInteger(data.apps_updated))return res.status(503).json({error:'The schedule save outcome is unconfirmed. Refresh before retrying.'})
   return res.status(200).json({workspace_id:ws,apps_updated:data.apps_updated})
  }
  return res.status(400).json({error:'Unsupported Facebook draft action.'})
 }catch(error){
  const status=[401,403,409].includes(error?.status)?error.status:503
  return res.status(status).json({error:status===401?'Sign in again before continuing.':status===403?'Your workspace access or role does not permit this action.':status===409?'Settings or app ownership changed. Refresh before retrying.':'The Facebook draft operation could not be confirmed. Refresh before retrying.'})
 }
}
