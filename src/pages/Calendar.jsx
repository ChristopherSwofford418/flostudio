import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout.jsx'
import { supabase } from '../supabase'

const PLATFORM_EMOJI = { facebook: '📘', instagram: '📸', twitter: '🐦', linkedin: '💼' }
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

export default function Calendar() {
  const navigate = useNavigate()
  const [posts, setPosts] = useState([])
  const [currentDate, setCurrentDate] = useState(new Date())

  useEffect(() => { loadPosts() }, [])

  const loadPosts = async () => {
    // Load all posts with a scheduled date (any status)
    const { data } = await supabase
      .from('flo_posts')
      .select('*')
      .not('scheduled_at', 'is', null)
      .order('scheduled_at', { ascending: true })
    setPosts(data || [])
  }

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = Array(firstDay).fill(null).concat(Array.from({ length: daysInMonth }, (_, i) => i + 1))
  while (cells.length % 7 !== 0) cells.push(null)

  const getPostsForDay = (day) => {
    if (!day) return []
    return posts.filter(p => {
      const d = new Date(p.scheduled_at)
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day
    })
  }

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))
  const today = new Date()

  const statusStyle = (status) => {
    if (status === 'sent') return { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.3)', color: '#4ade80', label: '✓ Sent' }
    if (status === 'approved') return { bg: 'rgba(99,102,241,0.15)', border: 'rgba(99,102,241,0.3)', color: '#a5b4fc', label: '⚡ Blotado' }
    if (status === 'pending') return { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)', color: '#fbbf24', label: '⏳ Pending' }
    return { bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.2)', color: '#64748b', label: '' }
  }

  return (
    <Layout title="Content Calendar">
      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { color: '#4ade80', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.3)', label: '✓ Sent to Blotado' },
          { color: '#a5b4fc', bg: 'rgba(99,102,241,0.15)', border: 'rgba(99,102,241,0.3)', label: '⚡ Approved / Scheduled' },
          { color: '#fbbf24', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)', label: '⏳ Pending Approval' },
        ].map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6, background: s.bg, border: `1px solid ${s.border}`, borderRadius: 20, padding: '4px 12px' }}>
            <span style={{ color: s.color, fontSize: 12, fontWeight: 600 }}>{s.label}</span>
          </div>
        ))}
      </div>

      <div style={{ background: '#1e293b', borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button onClick={prevMonth} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#fff', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>‹</button>
            <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>{MONTHS[month]} {year}</h2>
            <button onClick={nextMonth} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#fff', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>›</button>
          </div>
          <button onClick={() => navigate('/compose')} style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>+ Schedule Post</button>
        </div>

        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {DAYS.map(d => <div key={d} style={{ padding: '12px 8px', textAlign: 'center', color: '#475569', fontSize: 12, fontWeight: 600, textTransform: 'uppercase' }}>{d}</div>)}
        </div>

        {/* Calendar grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {cells.map((day, i) => {
            const dayPosts = getPostsForDay(day)
            const isToday = day && today.getFullYear() === year && today.getMonth() === month && today.getDate() === day
            return (
              <div key={i} style={{ minHeight: 100, padding: 8, borderRight: (i + 1) % 7 !== 0 ? '1px solid rgba(255,255,255,0.04)' : 'none', borderBottom: '1px solid rgba(255,255,255,0.04)', background: isToday ? 'rgba(99,102,241,0.05)' : 'transparent' }}>
                {day && <>
                  <div style={{ width: 28, height: 28, borderRadius: 14, background: isToday ? '#6366f1' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: isToday ? '#fff' : '#475569', fontWeight: isToday ? 700 : 400, marginBottom: 6 }}>{day}</div>
                  {dayPosts.slice(0, 3).map(post => {
                    const s = statusStyle(post.status)
                    const time = new Date(post.scheduled_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                    return (
                      <div key={post.id} title={post.content}
                        style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 5, padding: '3px 6px', fontSize: 11, color: s.color, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {PLATFORM_EMOJI[post.platform]} <span style={{ opacity: 0.75 }}>{time}</span> {post.content.substring(0, 14)}...
                        <span style={{ marginLeft: 3, fontSize: 9, opacity: 0.8 }}>{s.label}</span>
                      </div>
                    )
                  })}
                  {dayPosts.length > 3 && <div style={{ fontSize: 11, color: '#475569' }}>+{dayPosts.length - 3} more</div>}
                </>}
              </div>
            )
          })}
        </div>
      </div>
    </Layout>
  )
}
