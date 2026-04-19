import { useState, useEffect } from 'react'
import api from '../../api/axios'
import { toast } from 'react-hot-toast'

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function BusinessHoursPanel() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [calendarId, setCalendarId] = useState(null);
    const [timezone, setTimezone] = useState("Asia/Kolkata");
    const [hours, setHours] = useState({});
    const [holidays, setHolidays] = useState([]);
    
    // New holiday form
    const [newHolDate, setNewHolDate] = useState("");
    const [newHolName, setNewHolName] = useState("");

    // Get timezones from the browser natively
    const timezones = Intl.supportedValuesOf('timeZone');

    useEffect(() => {
        fetchCalendar();
    }, []);

    const fetchCalendar = async () => {
        setLoading(true);
        try {
            const res = await api.get('/sla/calendar');
            const cal = res.data.calendar;
            if (cal) {
                setCalendarId(cal.id);
                setTimezone(cal.timezone);
                
                // Map array to object by day_of_week
                const mapping = {};
                (cal.businessHours || []).forEach(bh => {
                    mapping[bh.day_of_week] = { 
                        start: bh.start_time, 
                        end: bh.end_time, 
                        enabled: true 
                    };
                });
                
                // Init missing days as disabled
                DAYS_OF_WEEK.forEach(d => {
                    if (!mapping[d]) {
                        mapping[d] = { start: "09:00", end: "18:00", enabled: false };
                    }
                });
                
                setHours(mapping);
                setHolidays(cal.holidays || []);
            }
        } catch (err) {
            toast.error("Failed to load Calendar schedule.");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // Flatten hours back to array for enabled days
            const businessHours = [];
            for (const day of DAYS_OF_WEEK) {
                if (hours[day]?.enabled) {
                    businessHours.push({
                        day_of_week: day,
                        start_time: hours[day].start,
                        end_time: hours[day].end
                    });
                }
            }

            const payload = {
                id: calendarId,
                timezone,
                businessHours,
                holidays
            };

            await api.put('/sla/calendar', payload);
            toast.success("Business Hours schedule saved!");
        } catch (err) {
            toast.error("Failed to save schedule.");
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    const handleToggleDay = (day) => {
        setHours(prev => ({
            ...prev,
            [day]: { ...prev[day], enabled: !prev[day].enabled }
        }));
    };

    const handleTimeChange = (day, field, val) => {
        setHours(prev => ({
            ...prev,
            [day]: { ...prev[day], [field]: val }
        }));
    };

    const handleAddHoliday = (e) => {
        e.preventDefault();
        if (!newHolDate || !newHolName.trim()) {
            return toast.error("Please provide both Date and Name for the holiday.");
        }
        
        // Prevent exact duplicates
        if (holidays.some(h => typeof h === 'string' ? h === newHolDate : h.holiday_date === newHolDate)) {
             return toast.error("A holiday already exists for this date.");
        }

        setHolidays([...holidays, { holiday_date: newHolDate, name: newHolName.trim() }]);
        setNewHolDate("");
        setNewHolName("");
    };

    const handleRemoveHoliday = (idx) => {
        const copy = [...holidays];
        copy.splice(idx, 1);
        setHolidays(copy);
    };

    if (loading) {
        return <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" style={{ margin: 'auto' }}/></div>;
    }

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: 24 }}>
            {/* Left Col: Days and Timezone */}
            <div className="card">
                <div className="card-header">
                    <div className="card-title">Operating Hours</div>
                    <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                        {saving ? <div className="spinner spinner-sm" /> : "Save Schedule"}
                    </button>
                </div>
                <div style={{ padding: '20px' }}>
                    <div className="form-group" style={{ marginBottom: 24, maxWidth: 300 }}>
                        <label className="form-label" style={{ fontWeight: 600 }}>System Timezone</label>
                        <select 
                            className="input" 
                            value={timezone} 
                            onChange={e => setTimezone(e.target.value)}
                        >
                            {timezones.map(tz => (
                                <option key={tz} value={tz}>{tz}</option>
                            ))}
                        </select>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                            SLAs will be tracked and paused relative to this locale.
                        </div>
                    </div>

                    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                        {DAYS_OF_WEEK.map((day, idx) => {
                            const config = hours[day];
                            return (
                                <div key={day} style={{ 
                                    display: 'flex', alignItems: 'center', padding: '12px 16px',
                                    borderBottom: idx !== DAYS_OF_WEEK.length - 1 ? '1px solid var(--border)' : 'none',
                                    background: config?.enabled ? 'transparent' : 'var(--bg-app)',
                                    opacity: config?.enabled ? 1 : 0.6
                                }}>
                                    <div style={{ width: 120, display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <input 
                                            type="checkbox" 
                                            checked={config?.enabled || false}
                                            onChange={() => handleToggleDay(day)}
                                            style={{ cursor: 'pointer', width: 16, height: 16 }}
                                        />
                                        <span style={{ fontWeight: 600, fontSize: 14 }}>{day}</span>
                                    </div>
                                    
                                    {config?.enabled ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <input 
                                                type="time" 
                                                className="input input-sm" 
                                                value={config.start}
                                                onChange={e => handleTimeChange(day, 'start', e.target.value)}
                                                style={{ width: 130 }}
                                            />
                                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                                            <input 
                                                type="time" 
                                                className="input input-sm" 
                                                value={config.end}
                                                onChange={e => handleTimeChange(day, 'end', e.target.value)}
                                                style={{ width: 130 }}
                                            />
                                        </div>
                                    ) : (
                                        <div style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>
                                            Day Off (SLA Paused)
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>

            {/* Right Col: Holidays */}
            <div className="card">
                <div className="card-header">
                    <div className="card-title">Holidays</div>
                </div>
                <div style={{ padding: '20px' }}>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                        Add designated dates when your support is closed. SLA countdowns will be frozen on these dates relative to your configured timezone.
                    </div>

                    <form onSubmit={handleAddHoliday} style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                        <input 
                            type="date" 
                            className="input input-sm" 
                            style={{ flex: '0 0 130px' }}
                            value={newHolDate}
                            onChange={(e) => setNewHolDate(e.target.value)}
                        />
                        <input 
                            type="text" 
                            className="input input-sm" 
                            placeholder="Holiday Name (e.g., Christmas)" 
                            style={{ flex: 1 }}
                            value={newHolName}
                            onChange={(e) => setNewHolName(e.target.value)}
                        />
                        <button type="submit" className="btn btn-secondary btn-sm" style={{ padding: '0 16px' }}>Add</button>
                    </form>

                    <div style={{ border: '1px solid var(--border)', borderRadius: 8 }}>
                        {holidays.length === 0 ? (
                            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                                No holidays configured.
                            </div>
                        ) : (
                            holidays.map((hol, idx) => {
                                // Backward compat for simple date array if it exists
                                const dateStr = typeof hol === 'string' ? hol : hol.holiday_date;
                                // Truncate 'T00:00:00.000Z' if it's there
                                const cleanDate = dateStr.split('T')[0];
                                const name = hol.name || 'System Holiday';

                                return (
                                    <div key={`${cleanDate}-${idx}`} style={{ 
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '10px 16px', borderBottom: idx !== holidays.length -1 ? '1px solid var(--border)' : 'none'
                                    }}>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: 13 }}>{name}</div>
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{cleanDate}</div>
                                        </div>
                                        <button 
                                            className="btn btn-sm" 
                                            style={{ color: '#ef4444', background: 'transparent', padding: '4px 8px' }}
                                            onClick={() => handleRemoveHoliday(idx)}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                            </svg>
                                        </button>
                                    </div>
                                )
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
