import { useEffect, useMemo, useState } from 'react'
import { listFacebookGroupDiscoveries } from '../lib/facebookGroupResearch'
import { trackFloEvent } from '../lib/observability'

const ACCESS_LABEL = {
  'publicly visible':'PUBLICLY VISIBLE',
  'login may be required':'LOGIN MAY BE REQUIRED',
  'privacy not verified':'PRIVACY NOT VERIFIED',
}

const formatDate = value => {
  if (!value) return 'not recorded'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'not recorded' : date.toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' })
}

export default function FacebookGroupDiscovery({ app, workspaceId }) {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      if (!app?.id || !workspaceId || !app?.user_id) {
        if (active) { setGroups([]); setLoading(false); setError('') }
        return
      }
      setLoading(true)
      setError('')
      try {
        const next = await listFacebookGroupDiscoveries({ workspaceId, userId:app.user_id, productId:app.id })
        if (active) setGroups(next)
      } catch (loadError) {
        if (active) {
          setGroups([])
          setError(loadError?.message || 'The group discovery library could not load for this app.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [app?.id, app?.user_id, workspaceId])

  const latestResearch = useMemo(() => groups.reduce((latest, row) => {
    if (!latest) return row.researched_at
    return new Date(row.researched_at || 0).getTime() > new Date(latest || 0).getTime() ? row.researched_at : latest
  }, ''), [groups])

  const openGroup = row => {
    trackFloEvent('facebook_group_source_opened', { product_id:app?.id || '', research_id:row.id, rank:Number(row.rank || 0) })
  }

  return <section className="studio-panel facebook-group-discovery" style={{ padding:22, minWidth:0 }}>
    <div style={{ display:'flex', justifyContent:'space-between', gap:14, alignItems:'flex-start', flexWrap:'wrap' }}>
      <div style={{ minWidth:0 }}>
        <div className="studio-kicker">PUBLIC COMMUNITY RESEARCH / SELECTED APP</div>
        <h2 style={{ color:'#20233f', fontSize:25, letterSpacing:'-.055em', marginTop:4 }}>Facebook Group Discovery</h2>
        <p style={{ color:'#66708a', fontSize:12, lineHeight:1.6, marginTop:7, maxWidth:700 }}>Ranked public group links for <strong style={{ color:'#303657' }}>{app?.name || 'this app'}</strong>, based on visible topical relevance. Review each community’s rules before considering any outreach. FloStudio does not join groups, message admins, invite people, or post from this library.</p>
      </div>
      <div style={{ display:'grid', gap:6, justifyItems:'end' }}>
        <span style={{ padding:'6px 9px', borderRadius:999, color:'#5148df', background:'rgba(99,91,255,.09)', border:'1px solid rgba(99,91,255,.22)', font:'700 9px DM Mono,monospace', letterSpacing:'.08em' }}>{loading ? 'LOADING' : `${groups.length} / 20 SOURCED`}</span>
        {!loading && latestResearch && <span style={{ color:'#7b829b', fontSize:10 }}>Researched {formatDate(latestResearch)}</span>}
      </div>
    </div>

    <div role="note" style={{ marginTop:15, padding:'10px 12px', borderRadius:10, background:'#f6f6fb', border:'1px solid #e2e3f0', color:'#5f6783', fontSize:11.25, lineHeight:1.55 }}>These are research shortcuts, not endorsements or proof that a group accepts promotion. A smaller result set means no unsupported links were added to reach twenty.</div>

    {loading ? <div style={{ marginTop:16, color:'#727a96', fontSize:12 }}>Loading this app’s sourced group list…</div> : error ? <div role="status" style={{ marginTop:16, padding:12, borderRadius:10, color:'#8a5012', background:'rgba(245,158,11,.09)', border:'1px solid rgba(245,158,11,.22)', fontSize:11.5 }}>{error}</div> : !groups.length ? <div style={{ marginTop:16, padding:18, borderRadius:12, border:'1px dashed #d7d9e9', color:'#737b95', fontSize:12, lineHeight:1.55 }}>No source-linked Facebook Groups have been recorded for this app yet. This library stays empty until direct, attributable group links pass review.</div> : <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:11, marginTop:16 }}>
      {groups.map(row => <article key={row.id} style={{ display:'grid', gap:10, padding:14, borderRadius:12, border:'1px solid #e1e3f1', background:'#fff', minWidth:0 }}>
        <div style={{ display:'flex', justifyContent:'space-between', gap:9, alignItems:'flex-start' }}>
          <div style={{ display:'flex', gap:9, minWidth:0 }}><span aria-label={`Rank ${row.rank}`} style={{ width:27, height:27, flex:'0 0 auto', display:'grid', placeItems:'center', borderRadius:8, background:'#f0efff', color:'#5148df', font:'800 11px DM Mono,monospace' }}>{String(row.rank).padStart(2, '0')}</span><div style={{ minWidth:0 }}><h3 style={{ color:'#262944', fontSize:13, lineHeight:1.3, margin:0, wordBreak:'break-word' }}>{row.group_name}</h3><span style={{ display:'inline-block', marginTop:5, color:'#717895', font:'700 8px DM Mono,monospace', letterSpacing:'.07em' }}>{ACCESS_LABEL[row.public_access_note] || 'PRIVACY NOT VERIFIED'}</span></div></div>
        </div>
        <p style={{ color:'#59617d', fontSize:11.25, lineHeight:1.52, margin:0 }}>{row.relevance_summary}</p>
        <div style={{ paddingTop:9, borderTop:'1px solid #edf0f6' }}><span style={{ display:'block', color:'#7c82a0', font:'700 8px DM Mono,monospace', letterSpacing:'.08em', textTransform:'uppercase', marginBottom:4 }}>Visible evidence</span><p style={{ color:'#69718b', fontSize:10.5, lineHeight:1.45, margin:0 }}>{row.evidence_basis}</p></div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', paddingTop:2 }}><a href={row.group_url} target="_blank" rel="noreferrer" onClick={() => openGroup(row)} className="studio-button studio-button--soft" style={{ padding:'7px 9px', fontSize:9.5, textDecoration:'none' }}>Open group ↗</a>{row.source_url !== row.group_url && <a href={row.source_url} target="_blank" rel="noreferrer" className="facebook-group-discovery__evidence">Evidence ↗</a>}</div>
      </article>)}
    </div>}
  </section>
}
