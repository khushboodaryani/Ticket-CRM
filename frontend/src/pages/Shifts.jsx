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

    const handleSave = async (e) => {
        e.preventDefault(); setSaving(true)
        try {
            const payload = { ...form, members: form.members.map(id => ({ user_id: id, role: 'agent' })) }
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
                                    overflow: 'hidden'
                                }}>
                                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--accent)', opacity: 0.8 }} />
                                    
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text-primary)' }}>{s.name}</div>
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{s.shift_type} shift</div>
                                        </div>
                                        <button className="btn btn-icon btn-ghost" onClick={() => openEdit(s)} style={{ borderRadius: 10 }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                        </button>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'var(--bg-app)', borderRadius: 12, border: '1px solid var(--border)' }}>
                                        <div style={{ color: 'var(--accent)', display: 'flex' }}>
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>Active Window</div>
                                            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}</div>
                                        </div>
                                        <div style={{ marginLeft: 'auto', background: 'var(--accent-light)', color: 'var(--accent)', padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700 }}>
                                            {s.member_count} Members
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        {DAYS.map(d => {
                                            let wd = []
                                            try { wd = JSON.parse(s.working_days || '[]') } catch { }
                                            const active = wd.includes(d)
                                            return (
                                                <span key={d} style={{ 
                                                    padding: '3px 8px', 
                                                    borderRadius: 6, 
                                                    fontSize: 10, 
                                                    fontWeight: 700, 
                                                    background: active ? 'var(--accent-light)' : 'var(--bg-input)', 
                                                    color: active ? 'var(--accent)' : 'var(--text-muted)', 
                                                    border: `1px solid ${active ? 'var(--accent-light)' : 'var(--border)'}`,
                                                    opacity: active ? 1 : 0.6
                                                }}>{d}</span>
                                            )
                                        })}
                                    </div>
                                </div>
                            ))}
                </div>
            </div>

            {showModal && (
                <div className="modal-overlay" style={{ backdropFilter: 'blur(4px)', zIndex: 1000 }} onClick={() => setShowModal(false)}>
                    <div className="card" onClick={e => e.stopPropagation()} style={{ width: 500, padding: 32, borderRadius: 24, boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                            <h3 style={{ fontSize: 20, fontWeight: 700 }}>{editingShift ? 'Edit Shift Configuration' : 'Create New Shift'}</h3>
                            <button onClick={() => setShowModal(false)} style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                        </div>
                        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                            <div className="form-grid">
                                <div className="form-group">
                                    <label className="form-label">Shift Label <span>*</span></label>
                                    <input className="input" required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. US West Morning" style={{ padding: '12px 16px', borderRadius: 12 }} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Shift Type</label>
                                    <select className="input" value={form.shift_type} onChange={e => setForm(p => ({ ...p, shift_type: e.target.value }))} style={{ padding: '12px 16px', borderRadius: 12 }}>
                                        <option value="general">General</option>
                                        <option value="night">Night</option>
                                        <option value="rotational">Rotational</option>
                                    </select>
                                </div>
                            </div>
                            <div className="form-grid">
                                <div className="form-group">
                                    <label className="form-label">Starts At</label>
                                    <input className="input" type="time" value={form.start_time} onChange={e => setForm(p => ({ ...p, start_time: e.target.value }))} style={{ padding: '12px 16px', borderRadius: 12 }} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Ends At</label>
                                    <input className="input" type="time" value={form.end_time} onChange={e => setForm(p => ({ ...p, end_time: e.target.value }))} style={{ padding: '12px 16px', borderRadius: 12 }} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Operational Days</label>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {DAYS.map(d => (
                                        <button key={d} type="button" onClick={() => toggleDay(d)} style={{ 
                                            padding: '8px 14px', 
                                            borderRadius: 10, 
                                            border: `1px solid ${form.working_days.includes(d) ? 'var(--accent)' : 'var(--border)'}`, 
                                            background: form.working_days.includes(d) ? 'var(--accent-light)' : 'var(--bg-input)', 
                                            color: form.working_days.includes(d) ? 'var(--accent)' : 'var(--text-muted)', 
                                            cursor: 'pointer', 
                                            fontWeight: 700, 
                                            fontSize: 12,
                                            transition: 'all 0.2s'
                                        }}>{d}</button>
                                    ))}
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Assign Agents</label>
                                <select className="input" multiple size={5} value={form.members} onChange={e => setForm(p => ({ ...p, members: Array.from(e.target.selectedOptions, o => o.value) }))} style={{ padding: '12px 16px', borderRadius: 12, minHeight: 120 }}>
                                    {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                                </select>
                                <div className="form-hint">Hold Ctrl/Cmd to select multiple members</div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
                                <button className="btn btn-secondary" type="button" onClick={() => setShowModal(false)} style={{ borderRadius: 12, padding: '12px' }}>Discard</button>
                                <button className="btn btn-primary" type="submit" disabled={saving} style={{ borderRadius: 12, padding: '12px' }}>{saving ? 'Processing…' : editingShift ? 'Update Shift' : 'Commit Shift'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    )
}
