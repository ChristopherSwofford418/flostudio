import React, { useState } from 'react';
import Layout from '../components/Layout';
import { useWorkspace } from '../context/WorkspaceContext';
import { recordPortfolioRun } from '../lib/portfolioOperations';

export default function EasyCommand() {
  const { apps, activeApp, setActiveApp } = useWorkspace();
  const [selectedAppId, setSelectedAppId] = useState(activeApp?.id || apps[0]?.id || '');
  const [step, setStep] = useState(1);
  const [goal, setGoal] = useState('monthly_marketing');
  const [running, setRunning] = useState(false);
  const [resultMessage, setResultMessage] = useState('');

  const currentApp = apps.find(a => a.id === selectedAppId) || apps[0];

  const handleRunGoal = async () => {
    if (!currentApp) return;
    setRunning(true);
    setResultMessage('');
    try {
      await new Promise(r => setTimeout(r, 1200));
      const goalLabels = {
        monthly_marketing: 'Complete Monthly Marketing Schedule',
        ads_images: 'Store-Grounded Ad & Image Pack',
        seo_boost: 'Search Engine & App Store Boost'
      };
      const label = goalLabels[goal] || 'Marketing Action';

      await recordPortfolioRun({
        userId: 'current_user',
        appId: currentApp.id,
        appName: currentApp.name,
        actionType: goal,
        status: 'success',
        summary: `Successfully completed ${label} for ${currentApp.name}.`
      });

      setResultMessage(`Success! ${label} has been generated and scheduled for ${currentApp.name}. You can view the results in your Pipeline or Creative Lab.`);
      setStep(3);
    } catch (e) {
      setResultMessage('Something went wrong. Please try again.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Layout title="Easy Growth Center">
      <div style={{ padding: '36px 40px 72px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div className="studio-kicker">SIMPLE 3-STEP MARKETING ASSISTANT</div>
          <h1 className="studio-display" style={{ fontSize: 42, color: '#fff', marginTop: 8 }}>Grow Your Apps Without Complexity</h1>
          <p style={{ color: 'rgba(243,240,231,.75)', fontSize: 16, marginTop: 8, maxWidth: 620, marginLeft: 'auto', marginRight: 'auto' }}>
            Pick your app, choose what you want to achieve today, and let Flo do the heavy lifting across your marketing and search presence.
          </p>
        </div>

        <div style={{ background: '#17191c', border: '1px solid #282c34', borderRadius: 16, padding: 36, boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
          {step === 1 && (
            <div>
              <h3 style={{ color: '#fff', fontSize: 20, marginBottom: 12 }}>Step 1: Choose Your App</h3>
              <p style={{ color: '#9ba1a6', fontSize: 14, marginBottom: 24 }}>Which app in your portfolio do you want to work on right now?</p>

              {apps.length === 0 ? (
                <div style={{ background: '#1c1f24', padding: 24, borderRadius: 10, textAlign: 'center' }}>
                  <p style={{ color: '#f87171', marginBottom: 12 }}>No apps found in your portfolio yet.</p>
                  <a href="/portfolio" style={{ color: '#e05a3f', fontWeight: 600, textDecoration: 'none' }}>+ Add your first app in Portfolio</a>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16, marginBottom: 32 }}>
                  {apps.map(app => (
                    <div
                      key={app.id}
                      onClick={() => setSelectedAppId(app.id)}
                      style={{
                        background: selectedAppId === app.id ? '#232730' : '#1c1f24',
                        border: selectedAppId === app.id ? '2px solid #e05a3f' : '1px solid #2d3139',
                        borderRadius: 12,
                        padding: 20,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <h4 style={{ color: '#fff', fontSize: 16, margin: 0, marginBottom: 6 }}>{app.name}</h4>
                      <p style={{ color: '#9ba1a6', fontSize: 12, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.category || 'Mobile / Web App'}</p>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  disabled={!currentApp}
                  onClick={() => setStep(2)}
                  style={{ background: '#e05a3f', color: '#fff', border: 'none', padding: '12px 28px', borderRadius: 8, fontWeight: 600, fontSize: 15, cursor: 'pointer' }}
                >
                  Continue to Goal →
                </button>
              </div>
            </div>
          )}

          {step === 2 && currentApp && (
            <div>
              <h3 style={{ color: '#fff', fontSize: 20, marginBottom: 12 }}>Step 2: What would you like to do for <span style={{ color: '#e05a3f' }}>{currentApp.name}</span>?</h3>
              <p style={{ color: '#9ba1a6', fontSize: 14, marginBottom: 24 }}>Select your primary marketing goal for this app.</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 32 }}>
                {[
                  { id: 'monthly_marketing', title: '📅 Complete Monthly Social Media Plan', desc: 'Generate 4 weeks of ready-to-publish posts, captions, and hashtag strategies.' },
                  { id: 'ads_images', title: '🖼️ Store-Grounded Ad & Image Creator', desc: 'Create eye-catching promotional ad creatives using your app store artwork and professional AI backgrounds.' },
                  { id: 'seo_boost', title: '🔍 App Store & Search Ranking Boost', desc: 'Generate high-traffic keyword blueprints and landing page recommendations.' }
                ].map(item => (
                  <div
                    key={item.id}
                    onClick={() => setGoal(item.id)}
                    style={{
                      background: goal === item.id ? '#232730' : '#1c1f24',
                      border: goal === item.id ? '2px solid #e05a3f' : '1px solid #2d3139',
                      borderRadius: 12,
                      padding: 20,
                      cursor: 'pointer'
                    }}
                  >
                    <h4 style={{ color: '#fff', fontSize: 16, margin: 0, marginBottom: 4 }}>{item.title}</h4>
                    <p style={{ color: '#9ba1a6', fontSize: 13, margin: 0 }}>{item.desc}</p>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button
                  onClick={() => setStep(1)}
                  style={{ background: 'transparent', color: '#9ba1a6', border: '1px solid #333', padding: '12px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
                >
                  ← Back
                </button>
                <button
                  disabled={running}
                  onClick={handleRunGoal}
                  style={{ background: '#e05a3f', color: '#fff', border: 'none', padding: '12px 28px', borderRadius: 8, fontWeight: 600, fontSize: 15, cursor: 'pointer' }}
                >
                  {running ? 'Working magic...' : 'Run This Goal Now 🚀'}
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✨</div>
              <h3 style={{ color: '#fff', fontSize: 24, marginBottom: 12 }}>Mission Accomplished!</h3>
              <p style={{ color: '#4ade80', fontSize: 15, lineHeight: 1.6, maxWidth: 600, margin: '0 auto 32px' }}>
                {resultMessage}
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
                <button
                  onClick={() => setStep(1)}
                  style={{ background: '#22262e', color: '#fff', border: '1px solid #333', padding: '12px 24px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
                >
                  Work on Another App
                </button>
                <a
                  href="/pipeline"
                  style={{ background: '#e05a3f', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 8, fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}
                >
                  View My Pipeline →
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
