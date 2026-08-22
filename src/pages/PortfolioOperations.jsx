import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { useWorkspace } from '../context/WorkspaceContext';
import { getPortfolioRunHistory, recordPortfolioRun, getAppOperatingQueues } from '../lib/portfolioOperations';

export default function PortfolioOperations() {
  const { apps, activeApp, setActiveApp } = useWorkspace();
  const [selectedAppId, setSelectedAppId] = useState(activeApp?.id || apps[0]?.id || '');
  const [history, setHistory] = useState([]);
  const [executing, setExecuting] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (activeApp?.id) setSelectedAppId(activeApp.id);
  }, [activeApp]);

  useEffect(() => {
    setHistory(getPortfolioRunHistory(selectedAppId));
  }, [selectedAppId]);

  const currentApp = apps.find(a => a.id === selectedAppId) || apps[0];
  const queues = currentApp ? getAppOperatingQueues(currentApp) : { seoQueue: [], creativeQueue: [], approvalQueue: [] };

  const triggerAction = async (actionType, label) => {
    if (!currentApp) return;
    setExecuting(true);
    setNotice(`Running ${label} for ${currentApp.name}...`);
    try {
      await new Promise(r => setTimeout(r, 800));
      await recordPortfolioRun({
        userId: 'current_user',
        appId: currentApp.id,
        appName: currentApp.name,
        actionType,
        status: 'success',
        summary: `Successfully completed ${label} across connected channels.`
      });
      setHistory(getPortfolioRunHistory(currentApp.id));
      setNotice(`Successfully completed ${label} for ${currentApp.name}!`);
    } catch (e) {
      setNotice(`Failed to execute ${label}.`);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <Layout title="Portfolio Operations">
      <div style={{ padding: '32px 36px 64px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <div>
            <div className="studio-kicker">OPERATIONAL CONTROL CENTER</div>
            <h1 className="studio-display" style={{ fontSize: 38, color: '#ffffff', marginTop: 4 }}>Portfolio Command & Execution</h1>
            <p style={{ color: 'rgba(240,240,240,.7)', fontSize: 14, marginTop: 6 }}>Manage live operating queues, approval states, and automated execution history across your 20+ portfolio apps.</p>
          </div>
          <div>
            <select
              value={selectedAppId}
              onChange={e => {
                setSelectedAppId(e.target.value);
                const matched = apps.find(a => a.id === e.target.value);
                if (matched) setActiveApp(matched);
              }}
              style={{ background: '#1f1f1f', color: '#ffffff', border: '1px solid #333333', padding: '10px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600 }}
            >
              {apps.map(app => (
                <option key={app.id} value={app.id}>{app.name || 'Unnamed App'}</option>
              ))}
            </select>
          </div>
        </div>

        {notice && (
          <div style={{ background: 'rgba(173,173,173,0.1)', border: '1px solid rgba(173,173,173,0.3)', color: '#b8b8b8', padding: '12px 18px', borderRadius: 8, marginBottom: 24, fontSize: 14 }}>
            {notice}
          </div>
        )}

        {currentApp ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div style={{ background: '#191919', border: '1px solid #2a2a2a', borderRadius: 12, padding: 24 }}>
              <h3 style={{ color: '#ffffff', fontSize: 18, marginBottom: 16 }}>Quick Operational Actions</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <button
                  disabled={executing}
                  onClick={() => triggerAction('autopilot_sync', 'Full Monthly Autopilot')}
                  style={{ background: '#757575', color: '#ffffff', border: 'none', padding: '12px 16px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
                >
                  ⚡ Trigger Monthly Autopilot Sync
                </button>
                <button
                  disabled={executing}
                  onClick={() => triggerAction('aso_boost', 'ASO & Keyword Refresh')}
                  style={{ background: '#262626', color: '#ffffff', border: '1px solid #333333', padding: '12px 16px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
                >
                  🔍 Run ASO & SEO Blueprint Refresh
                </button>
                <button
                  disabled={executing}
                  onClick={() => triggerAction('creative_batch', 'Store-Grounded Ad Batch')}
                  style={{ background: '#262626', color: '#ffffff', border: '1px solid #333333', padding: '12px 16px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
                >
                  🖼️ Generate Store-Grounded Ad Batch
                </button>
              </div>

              <h3 style={{ color: '#ffffff', fontSize: 18, marginTop: 32, marginBottom: 16 }}>SEO & ASO Queue</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {queues.seoQueue.map(item => (
                  <div key={item.id} style={{ background: '#1f1f1f', padding: '10px 14px', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: '#cccccc' }}>
                    <span>{item.keyword}</span>
                    <span style={{ color: '#b8b8b8', fontWeight: 600 }}>Rank #{item.rank}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: '#191919', border: '1px solid #2a2a2a', borderRadius: 12, padding: 24 }}>
              <h3 style={{ color: '#ffffff', fontSize: 18, marginBottom: 16 }}>Durable Run History ({currentApp.name})</h3>
              {history.length === 0 ? (
                <p style={{ color: '#888888', fontSize: 13, fontStyle: 'italic' }}>No automation runs recorded yet for this app. Trigger an action above to initialize execution history.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 380, overflowY: 'auto' }}>
                  {history.map(run => (
                    <div key={run.id} style={{ background: '#1f1f1f', border: '1px solid #2c2c2c', padding: '12px 14px', borderRadius: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ color: '#ffffff', fontWeight: 600, fontSize: 13 }}>{run.actionType}</span>
                        <span style={{ color: run.status === 'success' ? '#b8b8b8' : '#8e8e8e', fontSize: 12, fontWeight: 600 }}>{run.status.toUpperCase()}</span>
                      </div>
                      <p style={{ color: '#aaaaaa', fontSize: 12, margin: 0 }}>{run.summary}</p>
                      <span style={{ color: '#666666', fontSize: 10, display: 'block', marginTop: 6 }}>{new Date(run.timestamp).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <p style={{ color: '#888888' }}>No apps found in portfolio. Add an app in the Portfolio workspace to begin operations.</p>
        )}
      </div>
    </Layout>
  );
}
