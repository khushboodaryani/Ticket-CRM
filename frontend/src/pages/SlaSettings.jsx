// src/pages/SlaSettings.jsx
import { useEffect, useState } from 'react'
import api from '../api/axios'
import Topbar from '../components/Layout/Topbar'
import { toast } from 'react-hot-toast'

export default function SlaSettings() {
    const [policies, setPolicies] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(null) // ID of row being saved

    useEffect(() => {
        fetchPolicies()
    }, [])

    const fetchPolicies = async () => {
        try {
            const res = await api.get('/sla')
            setPolicies(res.data.policies)
        } catch (err) {
            toast.error("Failed to load SLA policies")
        } finally {
            setLoading(false)
        }
    }

    const handleChange = (id, field, value) => {
        setPolicies(prev => prev.map(p => 
            p.id === id ? { ...p, [field]: parseFloat(value) || 0 } : p
        ))
    }

    const handleSave = async (policy) => {
        setSaving(policy.id)
        try {
            await api.put(`/sla/${policy.id}`, {
                resolution_time_hours: policy.resolution_time_hours,
                escalation_1_min: policy.escalation_1_min,
                escalation_2_min: policy.escalation_2_min,
                escalation_3_min: policy.escalation_3_min
            })
            toast.success(`${policy.priority} SLA Policy updated!`)
        } catch (err) {
            toast.error(`Failed to update ${policy.priority}`)
        } finally {
            setSaving(null)
        }
    }

    return (
        <>
            <Topbar title="SLA Settings" subtitle="Configure automated resolution deadlines and escalation triggers." />
            
            <div className="page-body">
                <div className="card">
                    <div className="card-header">
                        <div className="card-title">SLA Policies by Priority</div>
                    </div>
                    
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Priority</th>
                                    <th>Resolution Target (Hours)</th>
                                    <th>L1 Escalation (Min)</th>
                                    <th>L2 Escalation (Min)</th>
                                    <th>L3 Escalation (Min)</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: 'auto' }} /></td></tr>
                                ) : policies.length === 0 ? (
                                    <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No policies found.</td></tr>
                                ) : policies.map(p => (
                                    <tr key={p.id}>
                                        <td>
                                            <span className={`priority-badge p${p.priority[1]}-badge`} style={{ fontWeight: 700 }}>
                                                {p.priority}
                                            </span>
                                        </td>
                                        <td>
                                            <input 
                                                type="number" 
                                                className="input input-sm" 
                                                value={p.resolution_time_hours} 
                                                step={0.5} 
                                                min={0.5}
                                                onChange={e => handleChange(p.id, 'resolution_time_hours', e.target.value)}
                                                style={{ width: 100, borderRadius: 8 }}
                                            />
                                        </td>
                                        <td>
                                            <input 
                                                type="number" 
                                                className="input input-sm" 
                                                value={p.escalation_1_min} 
                                                step={10} 
                                                min={0}
                                                onChange={e => handleChange(p.id, 'escalation_1_min', e.target.value)}
                                                style={{ width: 100, borderRadius: 8 }}
                                            />
                                        </td>
                                        <td>
                                            <input 
                                                type="number" 
                                                className="input input-sm" 
                                                value={p.escalation_2_min} 
                                                step={10} 
                                                min={0}
                                                onChange={e => handleChange(p.id, 'escalation_2_min', e.target.value)}
                                                style={{ width: 100, borderRadius: 8 }}
                                            />
                                        </td>
                                        <td>
                                            <input 
                                                type="number" 
                                                className="input input-sm" 
                                                value={p.escalation_3_min} 
                                                step={10} 
                                                min={0}
                                                onChange={e => handleChange(p.id, 'escalation_3_min', e.target.value)}
                                                style={{ width: 100, borderRadius: 8 }}
                                            />
                                        </td>
                                        <td>
                                            <button 
                                                className="btn btn-primary btn-sm" 
                                                disabled={saving === p.id}
                                                onClick={() => handleSave(p)}
                                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px' }}
                                            >
                                                {saving === p.id ? (
                                                    <div className="spinner spinner-sm" />
                                                ) : (
                                                    <>
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                                                        Save
                                                    </>
                                                )}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </>
    )
}
