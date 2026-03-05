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
    const [form, setForm] = useState({ name: '', start_time: '09:00', end_time: '18:00', shift_type: 'general', working_days: DAYS, members: [] })
    const [saving, setSaving] = useState(false)

    const load = () => {
        setLoading(true)
        Promise.all([api.get('/shifts'), api.get('/users', { params: { role: 'agent' } })]).then(([s, u]) => {
            setShifts(s.data.shifts); setUsers(u.data.users)
        }).finally(() => setLoading(false))
    }
    useEffect(() => { load() }, [])

    const toggleDay = (d) => setForm(p => ({
        ...p,
        working_days: p.working_days.includes(d) ? p.working_days.filter(x => x !== d) : [...p.working_days, d]
    }))

    const handleSave = async (e) => {
        e.preventDefault(); setSaving(true)
        try {
            await api.post('/shifts', { ...form, members: form.members.map(id => ({ user_id: id, role: 'agent' })) })
            toast.success('Shift created!'); setShowModal(false); load()
        } catch (err) { toast.error(err.response?.data?.message || 'Failed') }
        setSaving(false)
    }

    return (
        <>
            <Topbar title="Shift Management" subtitle={`${shifts.length} configured shifts`}
                actions={<button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>+ Add Shift</button>} />
            <div className="page-body">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                    {loading ? <div className="loader-center"><div className="spinner spinner-lg" /></div>
                        : shifts.length === 0 ? <div className="empty-state"><div className="empty-state-icon">🕐</div><div>No shifts configured</div></div>
                            : shifts.map(s => (
                                <div key={s.id} className="card" style={{ borderTop: '2px solid var(--accent)' }}>
                                    <div className="card-header">
                                        <div>
                                            <div className="card-title">{s.name}</div>
                                            <div className="card-subtitle" style={{ textTransform: 'capitalize' }}>{s.shift_type} shift</div>
                                        </div>
                                        <span className="badge badge-in_progress">{s.member_count} members</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                        <span style={{ fontSize: 22 }}>⏰</span>
                                        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                        {DAYS.map(d => {
                                            let wd = []
                                            try { wd = JSON.parse(s.working_days || '[]') } catch { }
                                            const active = wd.includes(d)
                                            return (
                                                <span key={d} style={{ padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: active ? 'var(--accent-light)' : 'var(--bg-input)', color: active ? 'var(--accent)' : 'var(--text-muted)', border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}` }}>{d}</span>
                                            )
                                        })}
                                    </div>
                                </div>
                            ))}
                </div>
            </div>

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div className="modal-title">Create Shift</div>
                            <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleSave}>
                            <div className="form-grid" style={{ marginBottom: 16 }}>
                                <div className="form-group">
                                    <label className="form-label">Shift Name <span>*</span></label>
                                    <input className="input" required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="General Shift" />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Shift Type</label>
                                    <select className="input" value={form.shift_type} onChange={e => setForm(p => ({ ...p, shift_type: e.target.value }))}>
                                        <option value="general">General</option>
                                        <option value="night">Night</option>
                                        <option value="rotational">Rotational</option>
                                    </select>
                                </div>
                            </div>
                            <div className="form-grid" style={{ marginBottom: 16 }}>
                                <div className="form-group">
                                    <label className="form-label">Start Time</label>
                                    <input className="input" type="time" value={form.start_time} onChange={e => setForm(p => ({ ...p, start_time: e.target.value }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">End Time</label>
                                    <input className="input" type="time" value={form.end_time} onChange={e => setForm(p => ({ ...p, end_time: e.target.value }))} />
                                </div>
                            </div>
                            <div className="form-group" style={{ marginBottom: 16 }}>
                                <label className="form-label">Working Days</label>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {DAYS.map(d => (
                                        <button key={d} type="button" onClick={() => toggleDay(d)} style={{ padding: '6px 13px', borderRadius: 6, border: `1px solid ${form.working_days.includes(d) ? 'var(--accent)' : 'var(--border)'}`, background: form.working_days.includes(d) ? 'var(--accent-light)' : 'var(--bg-input)', color: form.working_days.includes(d) ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>{d}</button>
                                    ))}
                                </div>
                            </div>
                            <div className="form-group" style={{ marginBottom: 20 }}>
                                <label className="form-label">Assign Members</label>
                                <select className="input" multiple size={5} value={form.members} onChange={e => setForm(p => ({ ...p, members: Array.from(e.target.selectedOptions, o => o.value) }))}>
                                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                </select>
                                <div className="form-hint">Hold Ctrl/Cmd to select multiple</div>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" type="button" onClick={() => setShowModal(false)}>Cancel</button>
                                <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create Shift'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    )
}
