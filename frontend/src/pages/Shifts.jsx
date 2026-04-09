// src/pages/Shifts.jsx
import { useEffect, useState } from 'react'
import api from '../api/axios'
import Topbar from '../components/Layout/Topbar'
import toast from 'react-hot-toast'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function Shifts() {
    const [shifts, setShifts] = useState([])
    const [users, setUsers] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [editingShift, setEditingShift] = useState(null)
    const [form, setForm] = useState({ name: '', start_time: '09:00', end_time: '18:00', shift_type: 'general', working_days: DAYS, members: [] })
    const [saving, setSaving] = useState(false)

    const load = () => {
        setLoading(true)
        Promise.all([api.get('/shifts'), api.get('/users', { params: { role: 'agent' } })]).then(([s, u]) => {
            setShifts(s.data.shifts); setUsers(u.data.users)
        }).finally(() => setLoading(false))
    }
    useEffect(() => { load() }, [])

    const openCreate = () => {
        setEditingShift(null)
        setForm({ name: '', start_time: '09:00', end_time: '18:00', shift_type: 'general', working_days: DAYS, members: [] })
        setShowModal(true)
    }

    const openEdit = async (s) => {
        try {
            const r = await api.get(`/shifts/${s.id}`)
            const shift = r.data.shift
            const members = (r.data.members || []).map(m => m.user_id)
            let wd = []
            try { wd = JSON.parse(shift.working_days || '[]') } catch { wd = DAYS }
            
            setEditingShift(shift)
            setForm({
                name: shift.name,
                start_time: shift.start_time?.slice(0, 5),
                end_time: shift.end_time?.slice(0, 5),
                shift_type: shift.shift_type,
                working_days: wd,
                members: members
            })
            setShowModal(true)
        } catch { toast.error('Failed to load shift details') }
    }

    const toggleDay = (d) => setForm(p => ({
        ...p,
        working_days: p.working_days.includes(d) ? p.working_days.filter(x => x !== d) : [...p.working_days, d]
    }))

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this shift? This action cannot be undone.')) return
        try {
            await api.delete(`/shifts/${id}`)
            toast.success('Shift deleted')
            load()
        } catch (err) { toast.error('Failed to delete shift') }
    }

    const toggleMember = (userId) => {
        setForm(p => ({
            ...p,
            members: p.members.includes(userId) ? p.members.filter(id => id !== userId) : [...p.members, userId]
        }))
    }

    const handleSave = async (e) => {
        e.preventDefault(); setSaving(true)
        try {
            const payload = { 
                ...form, 
                members: form.members.map(id => ({ user_id: id, role: 'agent' })) 
            }
            if (editingShift) {
                await api.put(`/shifts/${editingShift.id}`, payload)
                await api.post(`/shifts/${editingShift.id}/members`, { members: payload.members })
                toast.success('Shift updated!')
            } else {
                await api.post('/shifts', payload)
                toast.success('Shift created!')
            }
            setShowModal(false); load()
        } catch (err) { toast.error(err.response?.data?.message || 'Failed') }
        setSaving(false)
    }

    return (
        <>
            <Topbar title="Shift Management" subtitle={`${shifts.length} configured shifts`}
                actions={<button className="btn btn-primary btn-sm" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 12 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Add Shift
                </button>} />
            <div className="page-body">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 24 }}>
                    {loading ? <div className="loader-center"><div className="spinner spinner-lg" /></div>
                        : shifts.length === 0 ? (
                            <div className="empty-state" style={{ minHeight: '60vh' }}>
                                <div className="empty-state-icon" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                                </div>
                                <h3 style={{ fontSize: 20, fontWeight: 700 }}>No shifts configured</h3>
                                <p style={{ color: 'var(--text-secondary)' }}>Define your support hours and assign agents to shifts.</p>
                                <button className="btn btn-secondary" onClick={openCreate} style={{ marginTop: 8 }}>Create First Shift</button>
                            </div>
                        )
                            : shifts.map(s => (
                                <div key={s.id} className="card" style={{ 
                                    padding: 24, 
                                    display: 'flex', 
                                    flexDirection: 'column', 
                                    gap: 16,
                                    border: '1px solid var(--border)',
                                    position: 'relative',
                                    overflow: 'hidden',
                                    transition: 'transform 0.2s, box-shadow 0.2s',
                                    cursor: 'default'
                                }}>
                                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'var(--accent)', opacity: 0.8 }} />
                                    
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text-primary)' }}>{s.name}</div>
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 600 }}>{s.shift_type} shift</div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            <button className="btn btn-icon btn-ghost" onClick={() => openEdit(s)} style={{ borderRadius: 10, color: 'var(--text-secondary)' }} title="Edit Shift">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                            </button>
                                            <button className="btn btn-icon btn-ghost" onClick={() => handleDelete(s.id)} style={{ borderRadius: 10, color: '#ef4444' }} title="Delete Shift">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                                            </button>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: 'var(--bg-app)', borderRadius: 16, border: '1px solid var(--border)' }}>
                                        <div style={{ color: 'var(--accent)', display: 'flex', padding: 8, background: 'var(--accent-light)', borderRadius: 10 }}>
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: 0.5 }}>Daily Window</div>
                                            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: 0.5 }}>Headcount</div>
                                            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>{s.member_count} Members</div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        {DAYS.map(d => {
                                            let wd = []
                                            try { wd = JSON.parse(s.working_days || '[]') } catch { }
                                            const active = wd.includes(d)
                                            return (
                                                <span key={d} style={{ 
                                                    padding: '4px 10px', 
                                                    borderRadius: 8, 
                                                    fontSize: 11, 
                                                    fontWeight: 700, 
                                                    background: active ? 'var(--accent-light)' : 'var(--bg-input)', 
                                                    color: active ? 'var(--accent)' : 'var(--text-muted)', 
                                                    border: `1px solid ${active ? 'var(--accent-light)' : 'var(--border)'}`,
                                                    transition: 'all 0.2s',
                                                    opacity: active ? 1 : 0.4
                                                }}>{d}</span>
                                            )
                                        })}
                                    </div>
                                </div>
                            ))}
                </div>
            </div>

            {showModal && (
                <div className="modal-overlay" style={{ backdropFilter: 'blur(8px)', zKernel: 1000, background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowModal(false)}>
                    <div className="card" onClick={e => e.stopPropagation()} style={{ width: 540, padding: 32, borderRadius: 28, boxShadow: '0 25px 70px -12px rgba(0, 0, 0, 0.4)', border: '1px solid var(--border)', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
                            <div>
                                <h3 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{editingShift ? 'Update Configuration' : 'Establish New Shift'}</h3>
                                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>Configure operational times and assigned resources.</p>
                            </div>
                            <button onClick={() => setShowModal(false)} style={{ color: 'var(--text-tertiary)', background: 'var(--bg-app)', border: 'none', cursor: 'pointer', padding: 8, borderRadius: 12, display: 'flex', transition: 'all 0.2s' }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                        </div>
                        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                            <div className="form-grid" style={{ gridTemplateColumns: '2fr 1fr', gap: 16 }}>
                                <div className="form-group">
                                    <label className="form-label" style={{ fontWeight: 700, fontSize: 13 }}>Shift Label <span>*</span></label>
                                    <input className="input" required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Asia Pacific Support" style={{ padding: '14px 18px', borderRadius: 14, fontSize: 15 }} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label" style={{ fontWeight: 700, fontSize: 13 }}>Shift Type</label>
                                    <select className="input" value={form.shift_type} onChange={e => setForm(p => ({ ...p, shift_type: e.target.value }))} style={{ padding: '14px 18px', borderRadius: 14, fontSize: 15 }}>
                                        <option value="general">General</option>
                                        <option value="night">Night</option>
                                        <option value="rotational">Rotational</option>
                                    </select>
                                </div>
                            </div>
                            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                <div className="form-group">
                                    <label className="form-label" style={{ fontWeight: 700, fontSize: 13 }}>Starts At</label>
                                    <input className="input" type="time" value={form.start_time} onChange={e => setForm(p => ({ ...p, start_time: e.target.value }))} style={{ padding: '14px 18px', borderRadius: 14, fontSize: 15 }} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label" style={{ fontWeight: 700, fontSize: 13 }}>Ends At</label>
                                    <input className="input" type="time" value={form.end_time} onChange={e => setForm(p => ({ ...p, end_time: e.target.value }))} style={{ padding: '14px 18px', borderRadius: 14, fontSize: 15 }} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label" style={{ fontWeight: 700, fontSize: 13 }}>Operational Days</label>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {DAYS.map(d => (
                                        <button key={d} type="button" onClick={() => toggleDay(d)} style={{ 
                                            padding: '10px 16px', 
                                            borderRadius: 12, 
                                            border: `2px solid ${form.working_days.includes(d) ? 'var(--accent)' : 'var(--border)'}`, 
                                            background: form.working_days.includes(d) ? 'var(--accent-light)' : 'var(--bg-input)', 
                                            color: form.working_days.includes(d) ? 'var(--accent)' : 'var(--text-muted)', 
                                            cursor: 'pointer', 
                                            fontWeight: 700, 
                                            fontSize: 13,
                                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                                        }}>{d}</button>
                                    ))}
                                </div>
                            </div>
                            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <label className="form-label" style={{ fontWeight: 700, fontSize: 13, marginBottom: 0 }}>Assign Support Agents</label>
                                    <div style={{ display: 'flex', gap: 12 }}>
                                        <button type="button" onClick={() => setForm(p => ({ ...p, members: users.map(u => u.id) }))} style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>SELECT ALL</button>
                                        <button type="button" onClick={() => setForm(p => ({ ...p, members: [] }))} style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>CLEAR ALL</button>
                                    </div>
                                </div>
                                <div style={{ 
                                    maxHeight: 200, 
                                    overflowY: 'auto', 
                                    background: 'var(--bg-app)', 
                                    borderRadius: 16, 
                                    border: '1px solid var(--border)',
                                    padding: 8
                                }}>
                                    {users.length === 0 ? (
                                        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No agents found.</div>
                                    ) : users.map(u => (
                                        <div key={u.id} 
                                            onClick={() => toggleMember(u.id)}
                                            style={{ 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                gap: 12, 
                                                padding: '10px 14px', 
                                                borderRadius: 12, 
                                                cursor: 'pointer',
                                                background: form.members.includes(u.id) ? 'var(--bg-card)' : 'transparent',
                                                transition: 'all 0.15s'
                                            }}
                                        >
                                            <div style={{ 
                                                width: 20, 
                                                height: 20, 
                                                borderRadius: 6, 
                                                border: `2px solid ${form.members.includes(u.id) ? 'var(--accent)' : 'var(--border)'}`,
                                                background: form.members.includes(u.id) ? 'var(--accent)' : 'transparent',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: 'white'
                                            }}>
                                                {form.members.includes(u.id) && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="20 6 9 17 4 12"/></svg>}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{u.name}</div>
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.email}</div>
                                            </div>
                                            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', background: 'var(--bg-input)', padding: '2px 8px', borderRadius: 6 }}>{u.role}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 16, marginTop: 12 }}>
                                <button className="btn btn-secondary" type="button" onClick={() => setShowModal(false)} style={{ borderRadius: 16, padding: '14px', fontWeight: 700 }}>Discard Changes</button>
                                <button className="btn btn-primary" type="submit" disabled={saving} style={{ borderRadius: 16, padding: '14px', fontWeight: 700, fontSize: 15 }}>
                                    {saving ? 'Processing…' : editingShift ? 'Synchronize Shift' : 'Establish Shift'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    )
}
