// src/pages/Analytics.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import Topbar from "../components/Layout/Topbar";
import toast from "react-hot-toast";
import { 
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
    BarChart, Bar, Cell,
    PieChart, Pie,
    AreaChart, Area
} from "recharts";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#0ea5e9"];

export default function Analytics() {
    const navigate = useNavigate();
    const [loading, setLoading]     = useState(true);
    const [summary, setSummary]     = useState(null);
    const [trends, setTrends]       = useState([]);
    const [sla, setSla]             = useState([]);
    const [agents, setAgents]       = useState([]);
    const [sources, setSources]     = useState([]);
    
    // Filters
    const [filters, setFilters] = useState({
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Last 30 days default
        endDate: new Date().toISOString().split('T')[0],
        customerId: '',
        projectId: ''
    });

    const [customers, setCustomers] = useState([]);
    const [projects, setProjects] = useState([]);

    useEffect(() => {
        // Load filter options
        api.get('/customers').then(r => setCustomers(r.data.customers || []));
        api.get('/projects').then(r => setProjects(r.data.projects || []));
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams(filters).toString();
            const [s, t, l, a, d] = await Promise.all([
                api.get(`/analytics/summary?${params}`),
                api.get(`/analytics/trends?${params}&days=30`),
                api.get(`/analytics/sla?${params}`),
                api.get(`/analytics/agents?${params}`),
                api.get(`/analytics/sources?${params}`)
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

    useEffect(() => { fetchData() }, [filters]);

    return (
        <>
            <Topbar title="Enterprise Analytics" subtitle="Dynamic performance & business intelligence" />
            
            <div className="page-body">
                {/* Advanced Filter Bar */}
                <div className="card mb-6" style={{ padding: '16px 20px', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', background: 'var(--bg-card)', borderRadius: 16 }}>
                    <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 150 }}>
                        <label className="form-label" style={{ fontSize: 10, fontWeight: 800 }}>START DATE</label>
                        <input type="date" className="form-control form-control-sm" value={filters.startDate} onChange={e => setFilters({...filters, startDate: e.target.value})} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 150 }}>
                        <label className="form-label" style={{ fontSize: 10, fontWeight: 800 }}>END DATE</label>
                        <input type="date" className="form-control form-control-sm" value={filters.endDate} onChange={e => setFilters({...filters, endDate: e.target.value})} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 150 }}>
                        <label className="form-label" style={{ fontSize: 10, fontWeight: 800 }}>CUSTOMER</label>
                        <select className="form-control form-control-sm" value={filters.customerId} onChange={e => setFilters({...filters, customerId: e.target.value})}>
                            <option value="">All Customers</option>
                            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 150 }}>
                        <label className="form-label" style={{ fontSize: 10, fontWeight: 800 }}>PROJECT</label>
                        <select className="form-control form-control-sm" value={filters.projectId} onChange={e => setFilters({...filters, projectId: e.target.value})}>
                            <option value="">All Projects</option>
                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                    <button className="btn btn-primary btn-sm" style={{ height: 38 }} onClick={fetchData}>REFRESH</button>
                </div>

                {loading ? (
                    <div style={{ padding: 100, textAlign: 'center' }}><div className="spinner spinner-lg"></div></div>
                ) : (
                    <>
                        {/* Stats Grid */}
                        <div className="stats-grid mb-6">
                            <div className="stat-card" style={{ '--card-accent': '#3b82f6' }}>
                                <div className="stat-label">Total Inflow</div>
                                <div className="stat-value">{summary?.total || 0}</div>
                            </div>
                            <div className="stat-card" style={{ '--card-accent': '#10b981' }}>
                                <div className="stat-label">Resolutions</div>
                                <div className="stat-value" style={{ color: "#10b981" }}>{summary?.resolved || 0}</div>
                            </div>
                            <div className="stat-card" style={{ '--card-accent': '#ef4444' }}>
                                <div className="stat-label">SLA Breaches</div>
                                <div className="stat-value" style={{ color: "#ef4444" }}>{summary?.breached || 0}</div>
                            </div>
                            <div className="stat-card" style={{ '--card-accent': '#f59e0b' }}>
                                <div className="stat-label">MTTR (Avg)</div>
                                <div className="stat-value">{summary?.avg_resolution_hours || 0} <small style={{ fontSize: 12 }}>HRS</small></div>
                            </div>
                        </div>

                        <div className="grid-2 mb-6" style={{ gap: 24 }}>
                            {/* Ticket Trends */}
                            <div className="card" style={{ padding: 24 }}>
                                <div className="card-header" style={{ marginBottom: 24 }}>
                                    <h3 className="card-title">Volume Trends</h3>
                                </div>
                                <div style={{ width: '100%', height: 320 }}>
                                    <ResponsiveContainer>
                                        <AreaChart data={trends}>
                                            <defs>
                                                <linearGradient id="colorInc" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                            <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={10} tickFormatter={v => v.split('-').slice(1).join('/')} />
                                            <YAxis stroke="var(--text-muted)" fontSize={10} axisLine={false} tickLine={false} />
                                            <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12 }} />
                                            <Area type="monotone" dataKey="incoming" name="New Tickets" stroke="#3b82f6" fillOpacity={1} fill="url(#colorInc)" strokeWidth={3} />
                                            <Area type="monotone" dataKey="resolved" name="Resolved" stroke="#10b981" fill="transparent" strokeWidth={2} strokeDasharray="5 5" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* SLA Heatmap */}
                            <div className="card" style={{ padding: 24 }}>
                                <div className="card-header" style={{ marginBottom: 24 }}>
                                    <h3 className="card-title">SLA Achievement by Priority</h3>
                                </div>
                                <div style={{ width: '100%', height: 320 }}>
                                    <ResponsiveContainer>
                                        <BarChart data={sla} layout="vertical">
                                            <XAxis type="number" hide />
                                            <YAxis dataKey="priority" type="category" stroke="var(--text-muted)" fontSize={11} width={50} axisLine={false} />
                                            <Tooltip cursor={{fill: 'rgba(255,255,255,0.02)'}} contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12 }} />
                                            <Bar dataKey="met" name="Met" stackId="a" fill="#10b981" barSize={14} radius={[0, 0, 0, 0]} />
                                            <Bar dataKey="breached" name="Breached" stackId="a" fill="#ef4444" barSize={14} radius={[0, 6, 6, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>

                        <div className="grid-2" style={{ gap: 24 }}>
                            {/* Agent Leaderboard with Portal Access */}
                            <div className="card" style={{ padding: 24 }}>
                                <div className="card-header" style={{ marginBottom: 24 }}>
                                    <h3 className="card-title">Productivity Leaderboard</h3>
                                </div>
                                <div className="table-wrap">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Agent</th>
                                                <th>Resolved</th>
                                                <th>Avg MTTR</th>
                                                <th>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {agents.map(a => (
                                                <tr key={a.id}>
                                                    <td>
                                                        <div style={{ fontWeight: 700 }}>{a.name}</div>
                                                    </td>
                                                    <td><span className="badge badge-resolved">{a.tickets_resolved}</span></td>
                                                    <td style={{ fontSize: 11 }}>{Math.round(a.avg_resolution_hours)} HR</td>
                                                    <td>
                                                        <button 
                                                            onClick={() => navigate(`/monitoring/agent/${a.id}`)}
                                                            className="btn btn-ghost btn-sm" 
                                                            style={{ fontSize: 9, fontWeight: 800 }}
                                                        > VIEW PORTAL → </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Source Distribution */}
                            <div className="card" style={{ padding: 24 }}>
                                <div className="card-header" style={{ marginBottom: 24 }}>
                                    <h3 className="card-title">Channel Distribution</h3>
                                </div>
                                <div style={{ width: '100%', height: 320 }}>
                                    <ResponsiveContainer>
                                        <PieChart>
                                            <Pie
                                                data={sources}
                                                dataKey="count"
                                                nameKey="source"
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={70}
                                                outerRadius={90}
                                                paddingAngle={8}
                                            >
                                                {sources.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                                                ))}
                                            </Pie>
                                            <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12 }} />
                                            <Legend verticalAlign="bottom" iconType="circle" />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
