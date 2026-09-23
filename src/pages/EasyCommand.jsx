import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { useWorkspace } from '../context/WorkspaceContext'

const goals = [
  {
    id:'start_campaign',
    title:'Start a campaign from product facts',
    description:'Open the Campaign Engine with this app as the active product. Confirm the product truth and choose an editable thesis before any creative work.',
    destination:'Campaign Engine',
    route:'/agent',
  },
  {
    id:'controlled_test',
    title:'Prepare a controlled creative test',
    description:'Open Experiments for this app. Add a real hypothesis, control, challenger, and a source for later observations.',
    destination:'Experiments',
    route:'/experiments',
  },
  {
    id:'review_learning',
    title:'Review verified learning',
    description:'Open the private Portfolio Learning Review. It shows only linked Campaign Runbook evidence and source-aware next actions.',
    destination:'Portfolio Learning Review',
    route:'/portfolio',
  },
]

export default function EasyCommand() {
  const navigate = useNavigate()
  const { apps, activeApp, setActiveApp } = useWorkspace()
  const [selectedAppId, setSelectedAppId] = useState(activeApp?.id || '')
  const [step, setStep] = useState(1)
  const [goalId, setGoalId] = useState('start_campaign')

  useEffect(() => {
    if (!selectedAppId && (activeApp?.id || apps[0]?.id)) setSelectedAppId(activeApp?.id || apps[0].id)
  }, [activeApp?.id, apps, selectedAppId])

  const currentApp = apps.find(app => app.id === selectedAppId) || null
  const goal = useMemo(() => goals.find(item => item.id === goalId) || goals[0], [goalId])
  const finishRoute = () => {
    if (!currentApp) return
    setActiveApp(currentApp)
    const query = `?app=${encodeURIComponent(currentApp.id)}`
    navigate(goal.route === '/agent' ? `${goal.route}${query}` : `${goal.route}${query}`)
  }

  return <Layout title="Easy Growth Center">
    <div className="flo-page" style={{ padding:'36px 30px 72px', maxWidth:900, margin:'0 auto' }}>
      <section className="studio-dark" style={{ padding:'32px 34px', textAlign:'center' }}>
        <div className="studio-kicker" style={{ color:'#d8d4ff' }}>EASY GROWTH / REAL WORKFLOWS ONLY</div>
        <h1 className="studio-display" style={{ color:'#fff', fontSize:'clamp(34px,4.4vw,50px)', marginTop:9 }}>Choose the next <span className="studio-serif" style={{ color:'#d8d4ff' }}>meaningful action.</span></h1>
        <p style={{ color:'rgba(242,243,255,.72)', fontSize:13, lineHeight:1.7, margin:'12px auto 0', maxWidth:650 }}>This center never reports generated, scheduled, or completed work before a durable Flo Studio record exists. It routes you into the real campaign, experiment, or learning workflow instead.</p>
      </section>

      <section className="studio-panel flo-dark-surface" style={{ marginTop:16, padding:'28px clamp(18px,4vw,34px)' }}>
        <div style={{ display:'flex', gap:7, alignItems:'center', marginBottom:24 }}><span className="studio-chip" style={{ color:step >= 1 ? '#e4e0ff' : 'rgba(242,243,255,.45)', borderColor:'rgba(219,215,255,.22)' }}>1 · App</span><span style={{ color:'rgba(242,243,255,.32)' }}>—</span><span className="studio-chip" style={{ color:step >= 2 ? '#e4e0ff' : 'rgba(242,243,255,.45)', borderColor:'rgba(219,215,255,.22)' }}>2 · Goal</span><span style={{ color:'rgba(242,243,255,.32)' }}>—</span><span className="studio-chip" style={{ color:step >= 3 ? '#e4e0ff' : 'rgba(242,243,255,.45)', borderColor:'rgba(219,215,255,.22)' }}>3 · Route</span></div>
        {step === 1 && <div><div className="studio-kicker" style={{ color:'#d8d4ff' }}>STEP 1 / SELECT A PORTFOLIO APP</div><h2 style={{ color:'#fff', fontSize:23, marginTop:6 }}>Which product should Flo Studio open?</h2><p style={{ color:'rgba(242,243,255,.65)', fontSize:11.5, lineHeight:1.6, marginTop:6 }}>The active app context follows you into the destination workflow. No campaign or post is created here.</p>{apps.length === 0 ? <div style={{ marginTop:18, padding:22, border:'1px dashed rgba(218,214,255,.32)', borderRadius:12, textAlign:'center' }}><p style={{ color:'rgba(242,243,255,.65)', fontSize:12 }}>No portfolio app exists yet.</p><button onClick={() => navigate('/portfolio')} className="studio-button" style={{ marginTop:10 }}>Add an app in Portfolio →</button></div> : <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(210px,1fr))', gap:10, marginTop:18 }}>{apps.map(app => <button key={app.id} onClick={() => setSelectedAppId(app.id)} style={{ textAlign:'left', padding:15, borderRadius:11, cursor:'pointer', fontFamily:'inherit', border:`1px solid ${selectedAppId === app.id ? 'rgba(199,191,255,.65)' : 'rgba(255,255,255,.12)'}`, background:selectedAppId === app.id ? 'rgba(132,113,229,.18)' : 'rgba(255,255,255,.035)' }}><b style={{ display:'block', color:'#fff', fontSize:13 }}>{app.name}</b><span style={{ display:'block', color:'rgba(242,243,255,.55)', fontSize:9.5, marginTop:4 }}>{app.category || 'Portfolio app'}</span></button>)}</div>}<div style={{ display:'flex', justifyContent:'flex-end', marginTop:22 }}><button disabled={!currentApp} onClick={() => setStep(2)} className="studio-button">Continue to goal →</button></div></div>}
        {step === 2 && currentApp && <div><div className="studio-kicker" style={{ color:'#d8d4ff' }}>STEP 2 / CHOOSE A REAL ROUTE</div><h2 style={{ color:'#fff', fontSize:23, marginTop:6 }}>What should happen next for {currentApp.name}?</h2><p style={{ color:'rgba(242,243,255,.65)', fontSize:11.5, lineHeight:1.6, marginTop:6 }}>Each option opens an existing workflow. It does not simulate completion, generate content, or spend tokens.</p><div style={{ display:'grid', gap:10, marginTop:18 }}>{goals.map(item => <button key={item.id} onClick={() => setGoalId(item.id)} style={{ textAlign:'left', padding:16, borderRadius:11, cursor:'pointer', fontFamily:'inherit', border:`1px solid ${goalId === item.id ? 'rgba(199,191,255,.65)' : 'rgba(255,255,255,.12)'}`, background:goalId === item.id ? 'rgba(132,113,229,.18)' : 'rgba(255,255,255,.035)' }}><b style={{ display:'block', color:'#fff', fontSize:12.5 }}>{item.title}</b><span style={{ display:'block', color:'rgba(242,243,255,.64)', fontSize:10.5, lineHeight:1.5, marginTop:5 }}>{item.description}</span></button>)}</div><div style={{ display:'flex', justifyContent:'space-between', marginTop:22 }}><button onClick={() => setStep(1)} className="studio-button studio-button--soft">← App</button><button onClick={() => setStep(3)} className="studio-button">Review route →</button></div></div>}
        {step === 3 && currentApp && <div style={{ textAlign:'center', padding:'12px 0 4px' }}><div className="studio-kicker" style={{ color:'#d8d4ff' }}>STEP 3 / READY TO CONTINUE</div><h2 style={{ color:'#fff', fontSize:25, marginTop:8 }}>{goal.destination} is ready for {currentApp.name}.</h2><p style={{ color:'rgba(242,243,255,.68)', fontSize:12, lineHeight:1.65, maxWidth:600, margin:'10px auto 0' }}>{goal.description} Flo will only show stage progress after the destination workflow saves real campaign, review, experiment, or learning evidence.</p><div style={{ display:'flex', justifyContent:'center', gap:8, flexWrap:'wrap', marginTop:21 }}><button onClick={() => setStep(2)} className="studio-button studio-button--soft">Choose another goal</button><button onClick={finishRoute} className="studio-button">Open {goal.destination} →</button></div></div>}
      </section>
    </div>
  </Layout>
}
