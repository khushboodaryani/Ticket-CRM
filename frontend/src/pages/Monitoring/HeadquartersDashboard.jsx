import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../../context/SocketContext';
import Topbar from '../../components/Layout/Topbar';
import DashboardStatus from '../../components/Shared/DashboardStatus';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function HeadquartersDashboard() {
    const navigate = useNavigate();
    const { latestSnapshot } = useSocket();
    
    const [data, setData] = useState(latestSnapshot || { summary: {}, trends: [], shiftMetrics: [], server_ts: Date.now() });

    useEffect(() => {
        const handleRehydrate = (e) => setData(e.detail);
        const handlePacket = (e) => {
            if (e.detail.type === 'TICKET_CREATED') {
                setData(prev => ({
                    ...prev,
                    summary: { 
                        ...prev.summary, 
                        total: (parseInt(prev.summary.total) || 0) + 1, 
                        open_count: (parseInt(prev.summary.open_count) || 0) + 1 
                    }
                }));
            }
        };

        window.addEventListener('dashboard_rehydrated', handleRehydrate);
        window.addEventListener('dashboard_packet', handlePacket);
        return () => {
            window.removeEventListener('dashboard_rehydrated', handleRehydrate);
            window.removeEventListener('dashboard_packet', handlePacket);
        };
    }, []);

    const stats = [
        { label: 'In Queue', value: data.summary.open_count || 0, color: '#3b82f6', icon: '📥', path: '/monitoring/command-center' },
        { label: 'Breached', value: data.summary.breached_count || 0, color: '#ef4444', icon: '⚠️', path: '/monitoring/command-center' },
        { label: 'SLA Health', value: '94%', color: '#10b981', icon: '🛡️', path: '/monitoring/queues' },
        { label: 'Active Agents', value: (data.agents || []).filter(a => a.is_online).length, color: '#8b5cf6', icon: '👥', path: '/monitoring/agents' },
    ];

    return (
        <>
            <Topbar title="Monitoring Headquarters" subtitle={<DashboardStatus />} />

            <div className="page-body">
                {/* KPI Tiles */}
                <div className="stats-grid" style={{ marginBottom: 24 }}>
                    {stats.map(s => (
                        <div 
                            key={s.label} 
                            onClick={() => navigate(s.path)}
                            className="stat-card monitoring-card" 
                            style={{ '--card-accent': s.color, cursor: 'pointer' }}
                        >
                            <div style={{ position: 'absolute', top: -10, right: -10, fontSize: 40, opacity: 0.1 }}>{s.icon}</div>
                            <div className="stat-label" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{s.label}</div>
                            <div className="stat-value" style={{ fontSize: 32, fontWeight: 800 }}>{s.value}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginTop: 4 }}>View Details →</div>
                            <div style={{ width: '100%', height: 4, background: s.color, position: 'absolute', bottom: 0, left: 0, opacity: 0.3 }} />
                        </div>
                    ))}
                </div>

                <div className="grid-2">
                    {/* Response Trends Chart */}
                    <div className="card" style={{ padding: 24 }}>
                        <div className="card-header" style={{ marginBottom: 20 }}>
                            <div className="card-title" style={{ fontSize: 16, fontWeight: 800 }}>Response Trends (Last 24h)</div>
                        </div>
                        <div style={{ height: 300 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={data.trends}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" />
                                    <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                                    <Tooltip 
                                        contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12 }}
                                        itemStyle={{ fontSize: 12, fontWeight: 700 }}
                                    />
                                    <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={4} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Live Traffic Capacity */}
                    <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
                        <div className="card-header"><div className="card-title">Live Traffic Capacity</div></div>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 40 }}>
                            <Gauge value={75} label="INCOMING" color="#3b82f6" />
                            <Gauge value={45} label="RESOLVED" color="#10b981" />
                        </div>
                    </div>

                    {/* Shift-wise Manpower Monitoring (Decision Engine Upgraded) */}
                    <div className="card" style={{ padding: 24, gridColumn: 'span 2' }}>
                        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <div className="card-title">Operational Shift Health</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Algorithm: Capacity vs Load Scoring</div>
                        </div>
                        <div className="grid-3" style={{ marginTop: 20 }}>
                            {(data.shiftMetrics || []).map(sm => {
                                const healthColor = sm.health === 'critical' ? '#ef4444' : (sm.health === 'warning' ? '#f59e0b' : '#10b981');
                                return (
                                    <div 
                                        key={sm.id} 
                                        className={`shift-card monitoring-card ${sm.health === 'critical' ? 'risk-pulse' : ''}`} 
                                        onClick={() => navigate(`/monitoring/shift/${sm.id}`)}
                                        style={{ 
                                            background: 'var(--bg-app)', 
                                            padding: 20, 
                                            borderRadius: 20, 
                                            border: `1px solid ${healthColor}40`,
                                            borderTop: `4px solid ${healthColor}`,
                                            cursor: 'pointer',
                                            position: 'relative'
                                        }}
                                    >
                                        <div style={{ position: 'absolute', top: 10, right: 15, fontSize: 16 }}>
                                            {sm.health === 'critical' ? '🔴' : (sm.health === 'warning' ? '🟡' : '🟢')}
                                        </div>
                                        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                                            {sm.name}
                                        </div>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: healthColor, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                                            {sm.health_reason}
                                        </div>
                                        
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                                                <span style={{ color: 'var(--text-muted)' }}>Staffing Ratio</span>
                                                <span style={{ fontWeight: 800 }}>{sm.manpower_available} / {sm.manpower_needed}</span>
                                            </div>
                                        </div>
                                        <div style={{ marginTop: 15, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                                            <div style={{ 
                                                width: `${Math.min(100, (sm.manpower_available / Math.max(1, sm.manpower_needed)) * 100)}%`, 
                                                height: '100%', 
                                                background: healthColor,
                                                transition: 'width 1s ease'
                                            }} />
                                        </div>
                                        <div style={{ marginTop: 8, fontSize: 9, textAlign: 'center', fontWeight: 800, color: 'var(--text-muted)' }}>
                                            DEEP DIVE →
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

function Gauge({ value, label, color }) {
    const size = 120;
    const radius = 50;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (value / 100) * circumference;

    return (
        <div style={{ textAlign: 'center' }}>
            <div style={{ position: 'relative', width: size, height: size }}>
                <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx={size / 2} cy={size / 2} r={radius} fill="transparent" stroke="var(--bg-app)" strokeWidth="10" />
                    <circle cx={size / 2} cy={size / 2} r={radius} fill="transparent" stroke={color} strokeWidth="10" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s ease' }} />
                </svg>
                <div style={{ position: 'absolute', top: 0, left: 0, width: size, height: size, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 24, fontWeight: 800 }}>{value}%</span>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 800 }}>{label}</span>
                </div>
            </div>
        </div>
    );
}
