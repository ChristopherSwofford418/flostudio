import Layout from '../components/Layout.jsx'

const PLATFORMS = [
  { id: 'facebook', emoji: '📘', label: 'Facebook', description: 'Connect your Facebook Page to schedule posts', color: '#1877f2' },
  { id: 'instagram', emoji: '📸', label: 'Instagram', description: 'Connect your Instagram Business account', color: '#e1306c' },
  { id: 'twitter', emoji: '🐦', label: 'Twitter / X', description: 'Connect your Twitter/X account', color: '#1da1f2' },
  { id: 'linkedin', emoji: '💼', label: 'LinkedIn', description: 'Connect your LinkedIn Page or Profile', color: '#0a66c2' },
]

export default function Accounts() {
  return (
    <Layout title="Connected Accounts">
      <div style={{ maxWidth: 640 }}>
        <div style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 14, padding: 16, marginBottom: 28, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 20 }}>ℹ️</span>
          <p style={{ color: '#a5b4fc', fontSize: 14, lineHeight: 1.6 }}>
            Social account connections are coming soon. For now, use the Compose page to write and save posts, then copy and paste them directly into each platform.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {PLATFORMS.map(platform => (
            <div key={platform.id} style={{ background: '#1e293b', borderRadius: 16, padding: 20, border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: `${platform.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
                {platform.emoji}
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ color: '#fff', fontSize: 15, fontWeight: 600, marginBottom: 2 }}>{platform.label}</h3>
                <p style={{ color: '#64748b', fontSize: 13 }}>{platform.description}</p>
              </div>
              <button style={{ background: 'rgba(255,255,255,0.05)', color: '#475569', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'not-allowed' }}>
                Coming Soon
              </button>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  )
}
