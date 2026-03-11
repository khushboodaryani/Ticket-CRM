// src/pages/Queues.jsx
import { useState, useEffect, useCallback } from 'react'
import axios from '../api/axios'
import toast from 'react-hot-toast'
import Topbar from '../components/Layout/Topbar'

const PRIORITY_LABELS = { 1: 'Critical', 2: 'High', 3: 'Normal', 4: 'Low' }
const PRIORITY_COLORS = { 1: '#ef4444', 2: '#f97316', 3: '#3b82f6', 4: '#6366f1' }

export default function Queues() {
    const [queues, setQueues] = useState([])
    const [users, setUsers] = useState([])
    const [loading, setLoading] = useState(true)
    const [showForm, setShowForm] = useState(false)
    const [editingQueue, setEditingQueue] = useState(null)
    const [selectedQueue, setSelectedQueue] = useState(null)
    const [agentPanel, setAgentPanel] = useState(false)
    const [form, setForm] = useState({ name: '', priority: 3, sla_hours: 24, description: '' })
    const [selectedAgents, setSelectedAgents] = useState([])

    const fetchQueues = useCallback(async () => {
        try {
            setLoading(true)
            const r = await axios.get('/queues')
            setQueues(r.data.queues || [])
        } catch { toast.error('Failed to load queues') }
        finally { setLoading(false) }
    }, [])

    const fetchUsers = useCallback(async () => {
        try {
            const r = await axios.get('/users')
            setUsers(r.data.users || [])
        } catch { }
    }, [])

    useEffect(() => { fetchQueues(); fetchUsers() }, [fetchQueues, fetchUsers])

    const openCreate = () => {
        setEditingQueue(null)
        setForm({ name: '', priority: 3, sla_hours: 24, description: '' })
        setShowForm(true)
    }

    const openEdit = (q) => {
        setEditingQueue(q)
        setForm({ name: q.name, priority: q.priority, sla_hours: q.sla_hours, description: q.description || '' })
        setShowForm(true)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        try {
            if (editingQueue) {
                await axios.put(`/queues/${editingQueue.id}`, form)
                toast.success('Queue updated!')
            } else {
                await axios.post('/queues', form)
                toast.success('Queue created!')
            }
            setShowForm(false)
            fetchQueues()
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error saving queue')
        }
    }

    const handleDelete = async (id) => {
        if (!confirm('Delete this queue? Tickets in this queue will be unassigned.')) return
        try {
            await axios.delete(`/queues/${id}`)
            toast.success('Queue deleted')
            fetchQueues()
        } catch { toast.error('Failed to delete queue') }
    }

    const openAgentPanel = async (queue) => {
        setSelectedQueue(queue)
        try {
            const r = await axios.get(`/queues/${queue.id}`)
            const agentIds = (r.data.agents || []).map(a => ({ user_id: a.id, role: a.queue_role }))
            setSelectedAgents(agentIds || [])
        } catch { setSelectedAgents([]) }
        setAgentPanel(true)
    }

    const toggleAgent = (userId) => {
        setSelectedAgents(prev => {
            const exists = prev.find(a => a.user_id === userId)
            if (exists) return prev.filter(a => a.user_id !== userId)
            return [...prev, { user_id: userId, role: 'agent' }]
        })
    }

    const updateRole = (userId, role) => {
        setSelectedAgents(prev => prev.map(a => a.user_id === userId ? { ...a, role } : a))
    }

    const saveAgents = async () => {
        try {
            await axios.post(`/queues/${selectedQueue.id}/agents`, { agents: selectedAgents })
            toast.success('Agents updated!')
            setAgentPanel(false)
            fetchQueues()
        } catch { toast.error('Failed to update agents') }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-app)' }}>
            <Topbar
                title="Queue Management"
                subtitle="Smart ticket routing and workload distribution"
                actions={
                    <button className="btn btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 12, fontWeight: 600 }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Create Queue
                    </button>
                }
            />

            <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
                {loading ? (
                    <div className="empty-state" style={{ minHeight: '60vh' }}><div className="spinner spinner-lg" /></div>
                ) : queues.length === 0 ? (
                    <div className="empty-state" style={{ minHeight: '60vh', gap: 16 }}>
                        <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', border: '1px solid var(--border)' }}>
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                        </div>
                        <h3 style={{ fontSize: 20, fontWeight: 700 }}>No queues yet</h3>
                        <p style={{ color: 'var(--text-secondary)', maxWidth: 400 }}>Organize your agents and tickets into specialized queues for better efficiency and SLA tracking.</p>
                        <button className="btn btn-secondary" onClick={openCreate} style={{ marginTop: 8 }}>Setup First Queue</button>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 24 }}>
                        {queues.map(q => (
                            <div key={q.id} className="card" style={{ 
                                padding: 24, 
                                display: 'flex', 
                                flexDirection: 'column', 
                                gap: 20,
                                transition: 'all 0.2s ease',
                                border: '1px solid var(--border)',
                                borderRadius: 16,
                                background: 'rgba(255, 255, 255, 0.7)',
                                backdropFilter: 'blur(10px)',
                                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text-primary)', marginBottom: 4 }}>{q.name}</div>
                                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, minHeight: 40 }}>{q.description || 'No description provided'}</p>
                                    </div>
                                    <span style={{
                                        padding: '4px 12px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                                        background: PRIORITY_COLORS[q.priority] + '15',
                                        color: PRIORITY_COLORS[q.priority],
                                        border: `1px solid ${PRIORITY_COLORS[q.priority]}30`
                                    }}>{PRIORITY_LABELS[q.priority]}</span>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                                    {[
                                        { label: 'SLA Target', val: q.sla_hours + 'h', icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
                                        { label: 'Agents', val: q.agent_count || 0, icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
                                        { label: 'Open Tickets', val: q.ticket_count || 0, icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> }
                                    ].map((stat, i) => (
                                        <div key={i} style={{ padding: '10px 8px', background: 'var(--bg-app)', borderRadius: 12, border: '1px solid var(--border)', textAlign: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                                {stat.icon} {stat.label}
                                            </div>
                                            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{stat.val}</div>
                                        </div>
                                    ))}
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 12, marginTop: 4 }}>
                                    <button className="btn btn-block btn-secondary" onClick={() => openAgentPanel(q)} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12 }}>Manage Team</button>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button className="btn btn-icon btn-secondary" onClick={() => openEdit(q)} style={{ borderRadius: 12 }} title="Edit">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                        </button>
                                        <button className="btn btn-icon btn-danger-subtle" onClick={() => handleDelete(q.id)} style={{ borderRadius: 12, background: '#fee2e2', color: '#ef4444', border: 'none' }} title="Delete">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Create/Edit Modal */}
            {showForm && (
                <div className="modal-overlay" style={{ backdropFilter: 'blur(4px)', zIndex: 1000 }} onClick={() => setShowForm(false)}>
                    <div className="card" onClick={e => e.stopPropagation()} style={{ width: 480, padding: 32, borderRadius: 24, boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                            <h3 style={{ fontSize: 20, fontWeight: 700 }}>{editingQueue ? 'Configure Queue' : 'Initialize New Queue'}</h3>
                            <button onClick={() => setShowForm(false)} style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                            <div className="form-group">
                                <label className="form-label">Searchable Queue Name</label>
                                <input className="input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required placeholder="e.g. Platinum Support / Onboarding" style={{ padding: '12px 16px', borderRadius: 12 }} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                <div className="form-group">
                                    <label className="form-label">Service Priority</label>
                                    <select className="input" value={form.priority} onChange={e => setForm(p => ({ ...p, priority: Number(e.target.value) }))} style={{ padding: '12px 16px', borderRadius: 12 }}>
                                        {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">SLA Window (Hrs)</label>
                                    <input type="number" className="input" value={form.sla_hours} min={0.5} step={0.5} onChange={e => setForm(p => ({ ...p, sla_hours: parseFloat(e.target.value) }))} style={{ padding: '12px 16px', borderRadius: 12 }} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Workflow Context (Optional)</label>
                                <textarea className="input" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} placeholder="Describe types of tickets arriving in this queue..." style={{ padding: '12px 16px', borderRadius: 12 }} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)} style={{ borderRadius: 12, padding: '12px' }}>Discard</button>
                                <button type="submit" className="btn btn-primary" style={{ borderRadius: 12, padding: '12px' }}>{editingQueue ? 'Update Definition' : 'Commit Queue'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Agent Control Panel */}
            {agentPanel && selectedQueue && (
                <div className="modal-overlay" style={{ backdropFilter: 'blur(4px)', zIndex: 1000 }} onClick={() => setAgentPanel(false)}>
                    <div className="card" onClick={e => e.stopPropagation()} style={{ width: 560, padding: 32, borderRadius: 24, boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                            <div>
                                <h3 style={{ fontSize: 20, fontWeight: 700 }}>Workforce Assignment</h3>
                                <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{selectedQueue.name}</div>
                            </div>
                            <button onClick={() => setAgentPanel(false)} style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </div>
                        
                        <div style={{ maxHeight: 400, overflowY: 'auto', paddingRight: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {users.filter(u => ['agent', 'tl', 'manager'].includes(u.role)).map(u => {
                                const participant = selectedAgents.find(a => a.user_id === u.id)
                                return (
                                    <div key={u.id} style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: 16, 
                                        padding: '12px 16px', 
                                        borderRadius: 16, 
                                        background: participant ? 'var(--accent-subtle)' : 'var(--bg-app)', 
                                        border: '1px solid ' + (participant ? 'var(--accent)' : 'var(--border)'),
                                        transition: 'all 0.2s ease'
                                    }}>
                                        <div style={{ position: 'relative', width: 24, height: 24 }}>
                                            <input type="checkbox" checked={!!participant} onChange={() => toggleAgent(u.id)} style={{ cursor: 'pointer', opacity: 0, position: 'absolute', inset: 0, zIndex: 10 }} />
                                            <div style={{ 
                                                width: 20, height: 20, borderRadius: 6, border: '2px solid ' + (participant ? 'var(--accent)' : 'var(--border)'),
                                                background: participant ? 'var(--accent)' : 'transparent',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                                            }}>
                                                {participant && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4"><polyline points="20 6 9 17 4 12"/></svg>}
                                            </div>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{u.name}</div>
                                            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{u.role.toUpperCase()} · {u.email}</div>
                                        </div>
                                        {participant && (
                                            <div style={{ display: 'flex', background: 'var(--bg-card)', borderRadius: 8, padding: 2, border: '1px solid var(--border)' }}>
                                                {['agent', 'supervisor'].map(r => (
                                                    <button 
                                                        key={r} 
                                                        onClick={() => updateRole(u.id, r)}
                                                        style={{ 
                                                            fontSize: 10, padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                                                            background: participant.role === r ? 'var(--accent)' : 'transparent',
                                                            color: participant.role === r ? '#fff' : 'var(--text-secondary)',
                                                            fontWeight: 600, textTransform: 'capitalize', transition: 'all 0.2s'
                                                        }}
                                                    >
                                                        {r}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
                            <button className="btn btn-secondary" onClick={() => setAgentPanel(false)} style={{ borderRadius: 12 }}>Cancel</button>
                            <button className="btn btn-primary" onClick={saveAgents} style={{ borderRadius: 12 }}>Deploy Team</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
