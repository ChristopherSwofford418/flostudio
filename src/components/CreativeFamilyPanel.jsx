import { useState } from 'react'
import { updateMediaAsset } from '../lib/mediaAssets'
import { saveCampaignReviewDecision } from '../lib/campaignRunbook'

const decisionLabel = { approved:'Approve', needs_revision:'Request revision', rejected:'Reject', on_hold:'Hold' }
const decisionTone = { approved:'#9ce2bd', needs_revision:'#ffd587', rejected:'#f3a7af', on_hold:'#c4d2e4' }

function AssetPreview({ asset }) {
  return asset.kind === 'video'
    ? <video src={asset.asset_url} poster={asset.thumbnail_url || undefined} muted playsInline preload="metadata" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
    : <img src={asset.asset_url} alt="Campaign creative" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
}

export default function CreativeFamilyPanel({ workspaceId, userId, productId, campaign, selectedConcept, assets = [], reviews = [], runbook, onGenerate, onOpenLibrary, onChanged }) {
  const [expanded, setExpanded] = useState(null)
  const [drafts, setDrafts] = useState({})
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const family = assets.filter(asset => ['ready', 'completed'].includes(asset.render_status) && asset.asset_url && asset.campaign_id === campaign?.id && (!selectedConcept?.id || asset.concept_id === selectedConcept.id))
  const reviewFor = asset => reviews.find(review => review.target_type === 'media_asset' && review.media_asset_id === asset.id)
  const setDraft = (assetId, value) => setDrafts(current => ({ ...current, [assetId]:{ ...(current[assetId] || {}), ...value } }))
  const changeSummary = asset => drafts[asset.id]?.changeSummary ?? asset.metadata?.change_summary ?? ''

  const saveChangeSummary = async asset => {
    const summary = changeSummary(asset).trim()
    if (!summary) { setNotice('Describe the one variable that changes before saving this controlled variation.'); return }
    setBusy(`summary-${asset.id}`); setNotice('')
    try {
      await updateMediaAsset(asset.id, { metadata:{ ...(asset.metadata || {}), change_summary:summary } })
      setNotice('Controlled change summary saved. This asset can now be linked to a controlled experiment.')
      await onChanged?.()
    } catch (error) { setNotice(error.message || 'Could not save the change summary.') }
    finally { setBusy('') }
  }

  const saveReview = async (asset, decision) => {
    setBusy(`review-${asset.id}`); setNotice('')
    try {
      await saveCampaignReviewDecision({ workspaceId, userId, productId, campaignId:campaign.id, runbookId:runbook?.id, targetType:'media_asset', targetId:asset.id, decision, reason:drafts[asset.id]?.reason || '' })
      setNotice(`${decisionLabel[decision]} decision saved. This does not publish anything.`)
      await onChanged?.()
    } catch (error) { setNotice(error.message || 'Could not save the review decision.') }
    finally { setBusy('') }
  }

  return <section style={{ border:'1px solid rgba(255,255,255,.12)', borderRadius:13, overflow:'hidden', background:'rgba(255,255,255,.025)' }}>
    <div style={{ padding:'13px 14px', borderBottom:'1px solid rgba(255,255,255,.1)', display:'flex', justifyContent:'space-between', gap:12, alignItems:'start', flexWrap:'wrap' }}><div><div className="studio-kicker" style={{ color:'#c8c4ff' }}>CREATIVE FAMILY / CONTROLLED VARIATION</div><h3 style={{ color:'#fff', fontSize:14, marginTop:5 }}>{selectedConcept?.title || 'Select a creative thesis first'}</h3><p style={{ color:'rgba(242,242,255,.6)', fontSize:10, lineHeight:1.5, marginTop:4 }}>What stays constant: the campaign objective and selected thesis. Each member must name what changes before it is attached to a controlled experiment.</p></div><div style={{ display:'flex', gap:7, flexWrap:'wrap' }}><button onClick={onOpenLibrary} className="studio-chip" style={{ color:'#e8e6ff', borderColor:'rgba(215,211,255,.25)' }}>Add existing asset</button>{onGenerate && <button onClick={onGenerate} className="studio-chip" style={{ color:'#0b0c18', background:'#d6d2ff', borderColor:'#d6d2ff' }}>Generate controlled variation</button>}</div></div>
    {!family.length ? <div style={{ padding:18, color:'rgba(242,242,255,.62)', fontSize:10.5, lineHeight:1.6 }}>No completed campaign-linked assets are in this family yet. A queued or failed render stays a draft; adding an existing completed asset does not spend tokens.</div> : <div style={{ display:'grid', gap:8, padding:10 }}>{family.map((asset, index) => {
      const expandedAsset = expanded === asset.id
      const review = reviewFor(asset)
      return <article key={asset.id} style={{ padding:9, borderRadius:10, background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.09)' }}><div style={{ display:'grid', gridTemplateColumns:'62px minmax(0,1fr) auto', gap:10, alignItems:'center' }}><div style={{ width:62, height:62, borderRadius:8, overflow:'hidden', background:'rgba(255,255,255,.07)' }}><AssetPreview asset={asset}/></div><div style={{ minWidth:0 }}><div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}><b style={{ color:'#fff', fontSize:11.5 }}>Variation {asset.metadata?.variation || index + 1}</b>{review && <span style={{ color:decisionTone[review.decision] || '#fff', fontSize:8.5, fontWeight:800, textTransform:'uppercase' }}>{decisionLabel[review.decision] || review.decision}</span>}</div><p style={{ color:'rgba(242,242,255,.58)', fontSize:9.5, lineHeight:1.4, marginTop:3 }}>{asset.metadata?.change_summary || 'Change summary needed before this asset can support a controlled experiment.'}</p></div><button onClick={() => setExpanded(expandedAsset ? null : asset.id)} className="studio-chip" style={{ color:'#e8e6ff', borderColor:'rgba(215,211,255,.22)', fontSize:9 }}>{expandedAsset ? 'Close' : 'Inspect'}</button></div>
        {expandedAsset && <div style={{ display:'grid', gap:8, marginTop:10, paddingTop:10, borderTop:'1px solid rgba(255,255,255,.1)' }}><label style={{ display:'grid', gap:5 }}><span style={{ color:'rgba(242,242,255,.66)', fontSize:9.5 }}>One variable changed</span><input value={changeSummary(asset)} onChange={event => setDraft(asset.id, { changeSummary:event.target.value })} placeholder="e.g. Hook changes from checklist to before/after opening" style={{ width:'100%', boxSizing:'border-box', background:'rgba(0,0,0,.22)', border:'1px solid rgba(255,255,255,.16)', borderRadius:7, color:'#fff', padding:'8px 9px', font:'inherit', fontSize:10 }}/></label><div style={{ display:'flex', gap:7, flexWrap:'wrap' }}><button onClick={() => saveChangeSummary(asset)} disabled={busy === `summary-${asset.id}`} className="studio-button studio-button--soft" style={{ padding:'7px 9px', fontSize:9 }}>{busy === `summary-${asset.id}` ? 'Saving…' : 'Save change summary'}</button></div><label style={{ display:'grid', gap:5 }}><span style={{ color:'rgba(242,242,255,.66)', fontSize:9.5 }}>Concise review reason (optional)</span><input value={drafts[asset.id]?.reason || ''} onChange={event => setDraft(asset.id, { reason:event.target.value })} placeholder="What made this ready, risky, or in need of change?" style={{ width:'100%', boxSizing:'border-box', background:'rgba(0,0,0,.22)', border:'1px solid rgba(255,255,255,.16)', borderRadius:7, color:'#fff', padding:'8px 9px', font:'inherit', fontSize:10 }}/></label><div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>{Object.keys(decisionLabel).map(decision => <button key={decision} onClick={() => saveReview(asset, decision)} disabled={busy === `review-${asset.id}`} className="studio-chip" style={{ color:decisionTone[decision], borderColor:`${decisionTone[decision]}55`, background:'rgba(255,255,255,.04)', fontSize:9 }}>{decisionLabel[decision]}</button>)}</div></div>}
      </article>
    })}</div>}
    {notice && <div role="status" style={{ padding:'0 14px 13px', color:'#d7d3ff', fontSize:10, lineHeight:1.45 }}>{notice}</div>}
  </section>
}
