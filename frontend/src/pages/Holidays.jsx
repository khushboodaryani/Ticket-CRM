// src/pages/Holidays.jsx
import { useEffect, useState } from 'react'
import api from '../api/axios'
import Topbar from '../components/Layout/Topbar'
import toast from 'react-hot-toast'

export default function Holidays() {
    const [holidays, setHolidays] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [form, setForm] = useState({ holiday_date: '', description: '' })
    const [saving, setSaving] = useState(false)
    const [year, setYear] = useState(new Date().getFullYear())

    const load = () => {
        setLoading(true)
        api.get('/holidays', { params: { year } }).then(r => setHolidays(r.data.holidays)).finally(() => setLoading(false))
    }
    useEffect(() => { load() }, [year])

    const handleSave = async (e) => {
        e.preventDefault(); setSaving(true)
        try {
            await api.post('/holidays', form)
            toast.success('Holiday added!'); setShowModal(false); setForm({ holiday_date: '', description: '' }); load()
        } catch (err) { toast.error(err.response?.data?.message || 'Failed') }
        setSaving(false)
    }

    const handleDelete = async (id) => {
        if (!confirm('Delete this holiday?')) return
        try { await api.delete(`/holidays/${id}`); load(); toast.success('Deleted') }
        catch (err) { toast.error('Delete failed') }
    }

    const today = new Date().toISOString().split('T')[0]

    return (
        <>
            <Topbar title="Holiday Calendar" subtitle={`${holidays.length} holidays in ${year}`}
                actions={
                    <div className="btn-row">
                        <select className="filter-select" value={year} onChange={e => setYear(e.target.value)}>
                            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                        <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>+ Add Holiday</button>
                    </div>
                } />
            <div className="page-body">
                <div className="card">
                    <div className="table-wrap">
                        <table>
                            <thead><tr><th>Date</th><th>Day</th><th>Description</th><th>Status</th><th>Added By</th><th></th></tr></thead>
                            <tbody>
                                {loading ? <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: 'auto' }} /></td></tr>
                                    : holidays.length === 0 ? <tr><td colSpan={6} className="empty-row">No holidays configured for {year}</td></tr>
                                        : holidays.map(h => {
                                            const isPast = h.holiday_date < today
                                            const isToday = h.holiday_date === today
                                            return (
                                                <tr key={h.id}>
                                                    <td><span style={{ fontWeight: 700, color: isToday ? 'var(--warning)' : isPast ? 'var(--text-muted)' : 'var(--text-primary)' }}>{new Date(h.holiday_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</span></td>
                                                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{new Date(h.holiday_date).toLocaleDateString('en-IN', { weekday: 'long' })}</td>
                                                    <td>{h.description || '—'}</td>
                                                    <td>{isToday ? <span className="badge badge-pending">Today</span> : isPast ? <span className="badge badge-closed">Past</span> : <span className="badge badge-resolved">Upcoming</span>}</td>
                                                    <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{h.created_by_name || 'System'}</td>
                                                    <td><button className="btn btn-danger btn-sm" onClick={() => handleDelete(h.id)}>Delete</button></td>
                                                </tr>
                                            )
                                        })}
                            </tbody>
                        </table>
                    </div>
                    {holidays.length > 0 && (
                        <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--info-bg)', borderRadius: 8, fontSize: 13, color: 'var(--info)', border: '1px solid rgba(6,182,212,0.2)' }}>
                            ℹ️ The SLA engine automatically pauses all ticket timers on holidays. {holidays.filter(h => h.holiday_date >= today).length} upcoming holidays will trigger pauses.
                        </div>
                    )}
                </div>
            </div>

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div className="modal-title">Add Holiday</div>
                            <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleSave}>
                            <div className="form-group" style={{ marginBottom: 16 }}>
                                <label className="form-label">Date <span>*</span></label>
                                <input className="input" type="date" required value={form.holiday_date} onChange={e => setForm(p => ({ ...p, holiday_date: e.target.value }))} />
                            </div>
                            <div className="form-group" style={{ marginBottom: 20 }}>
                                <label className="form-label">Description</label>
                                <input className="input" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Diwali, Independence Day…" />
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" type="button" onClick={() => setShowModal(false)}>Cancel</button>
                                <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add Holiday'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    )
}
