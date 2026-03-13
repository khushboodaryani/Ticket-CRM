// src/pages/Analytics.jsx
import { useState, useEffect } from "react";
import api from "../api/axios";
import Topbar from "../components/Layout/Topbar";
import toast from "react-hot-toast";
import { 
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
    BarChart, Bar, Cell,
    PieChart, Pie,
    AreaChart, Area
} from "recharts";

const COLORS = ["var(--accent)", "var(--success)", "var(--warning)", "var(--danger)", "var(--info)"];

export default function Analytics() {
    const [loading, setLoading]     = useState(true);
    const [summary, setSummary]     = useState(null);
    const [trends, setTrends]       = useState([]);
    const [sla, setSla]             = useState([]);
    const [agents, setAgents]       = useState([]);
    const [sources, setSources]     = useState([]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [s, t, l, a, d] = await Promise.all([
                api.get("/analytics/summary"),
                api.get("/analytics/trends"),
                api.get("/analytics/sla"),
                api.get("/analytics/agents"),
                api.get("/analytics/sources")
            ]);
            setSummary(s.data.summary);
            setTrends(t.data.trends);
            setSla(l.data.sla);
            setAgents(a.data.agents);
            setSources(d.data.distribution);
        } catch (err) {
            toast.error("Failed to load analytics data");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData() }, []);

    if (loading) return (
        <div className="loader-center"><div className="spinner spinner-lg"></div></div>
    );

    return (
        <>
            <Topbar title="Advanced Analytics" subtitle="Insight into performance & compliance" />
            
            <div className="page-body">
                {/* Stats Grid */}
                <div className="form-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 24 }}>
                    <div className="stat-card">
                        <div className="stat-label">Total Tickets</div>
                        <div className="stat-value">{summary?.total || 0}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Resolved</div>
                        <div className="stat-value" style={{ color: "var(--success)" }}>{summary?.resolved || 0}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">SLA Breaches</div>
                        <div className="stat-value" style={{ color: "var(--danger)" }}>{summary?.breached || 0}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Avg Res. Time</div>
                        <div className="stat-value">{summary?.avg_resolution_hours || 0} <span style={{fontSize: 14}}>hrs</span></div>
                    </div>
                </div>

                <div className="form-grid" style={{ gridTemplateColumns: "2fr 1fr", gap: 24, marginBottom: 24 }}>
                    {/* Ticket Trends */}
                    <div className="card" style={{ padding: 20 }}>
                        <div className="card-header" style={{ marginBottom: 20 }}>
                            <h3 className="card-title">Ticket Trends (14 Days)</h3>
                        </div>
                        <div style={{ width: '100%', height: 300 }}>
                            <ResponsiveContainer>
                                <AreaChart data={trends}>
                                    <defs>
                                        <linearGradient id="colorIncoming" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                    <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={11} tickFormatter={v => v.split('-').slice(1).join('/')} />
                                    <YAxis stroke="var(--text-muted)" fontSize={11} />
                                    <Tooltip 
                                        contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}
                                        itemStyle={{ fontSize: 12 }}
                                    />
                                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                                    <Area type="monotone" dataKey="incoming" name="New Tickets" stroke="var(--accent)" fillOpacity={1} fill="url(#colorIncoming)" strokeWidth={3} />
                                    <Area type="monotone" dataKey="resolved" name="Resolved" stroke="var(--success)" fill="transparent" strokeWidth={3} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* SLA Compliance */}
                    <div className="card" style={{ padding: 20 }}>
                        <div className="card-header" style={{ marginBottom: 20 }}>
                            <h3 className="card-title">SLA by Priority</h3>
                        </div>
                        <div style={{ width: '100%', height: 300 }}>
                            <ResponsiveContainer>
                                <BarChart data={sla} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.05)" />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="priority" type="category" stroke="var(--text-muted)" fontSize={12} width={40} />
                                    <Tooltip 
                                        cursor={{fill: 'rgba(255,255,255,0.02)'}}
                                        contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}
                                    />
                                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                                    <Bar dataKey="met" name="Met" stackId="a" fill="var(--success)" radius={[0, 0, 0, 0]} barSize={20} />
                                    <Bar dataKey="breached" name="Breached" stackId="a" fill="var(--danger)" radius={[0, 4, 4, 0]} barSize={20} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                    {/* Agent Leaderboard */}
                    <div className="card" style={{ padding: 20 }}>
                        <div className="card-header" style={{ marginBottom: 20 }}>
                            <h3 className="card-title">Agent Leaderboard (Resolutions)</h3>
                        </div>
                        <div className="table-wrap">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Agent</th>
                                        <th style={{textAlign: 'center'}}>Resolved</th>
                                        <th style={{textAlign: 'center'}}>Avg Time</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {agents.map(a => (
                                        <tr key={a.id}>
                                            <td style={{fontWeight: 600}}>{a.name}</td>
                                            <td style={{textAlign: 'center'}}><span className="badge badge-resolved">{a.tickets_resolved}</span></td>
                                            <td style={{textAlign: 'center', fontSize: 12}}>{Math.round(a.avg_resolution_hours)} hrs</td>
                                        </tr>
                                    ))}
                                    {agents.length === 0 && <tr><td colSpan="3" style={{textAlign: 'center', padding: 40, color: 'var(--text-muted)'}}>No resolution data yet</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Source Distribution */}
                    <div className="card" style={{ padding: 20 }}>
                        <div className="card-header" style={{ marginBottom: 20 }}>
                            <h3 className="card-title">Ticket Sources</h3>
                        </div>
                        <div style={{ width: '100%', height: 300 }}>
                            <ResponsiveContainer>
                                <PieChart>
                                    <Pie
                                        data={sources}
                                        dataKey="count"
                                        nameKey="source"
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                    >
                                        {sources.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip 
                                        contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                .stat-card {
                    background: var(--bg-card);
                    border: 1px solid var(--border);
                    border-radius: 12px;
                    padding: 20px;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    backdrop-filter: blur(10px);
                }
                .stat-label {
                    font-size: 11px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    color: var(--text-muted);
                }
                .stat-value {
                    font-size: 28px;
                    font-weight: 800;
                    color: var(--text-primary);
                }
                .card {
                    background: var(--bg-card);
                    border: 1px solid var(--border);
                    border-radius: 16px;
                    backdrop-filter: blur(10px);
                }
                .card-title {
                    font-size: 15px;
                    font-weight: 700;
                    color: var(--text-primary);
                }
            `}</style>
        </>
    );
}
