// src/components/Layout/Sidebar.jsx
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

// Dashboard is visible to ALL roles - each sees their own scoped data
const NAV_ITEMS = [
    {
        label: 'Dashboard', path: '/dashboard',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
    },
    {
        label: 'All Tickets', path: '/tickets', end: true,
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /></svg>
    },
    {
        label: 'Create Ticket', path: '/tickets/new',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
    },
    {
        label: 'STR Queue', path: '/tickets/queue',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>,
        roles: ['superadmin', 'gm', 'manager', 'tl']
    },
    {
        label: 'Bulk Import', path: '/tickets/import',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>,
        roles: ['superadmin', 'gm', 'manager']
    },
]

const MGMT_ITEMS = [
    {
        label: 'Customers', path: '/customers',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
    },
    {
        label: 'Projects', path: '/projects',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
    },
    {
        label: 'User Admin', path: '/users',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><polyline points="16 11 18 13 22 9" /></svg>,
        roles: ['superadmin', 'gm', 'manager']
    },
]

const CONFIG_ITEMS = [
    {
        label: 'Shifts', path: '/shifts',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
        roles: ['superadmin', 'gm', 'manager']
    },
    {
        label: 'Holidays', path: '/holidays',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
        roles: ['superadmin']
    },
]

const SOURCE_ICONS = {
    email: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>,
    phone: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>,
    manual: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
    csv: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>,
}

export default function Sidebar() {
    const { user, logout, hasRole } = useAuth()

    const filterItems = (items) => items.filter(i => !i.roles || i.roles.some(r => hasRole(r)))

    const visibleNav = filterItems(NAV_ITEMS)
    const visibleMgmt = filterItems(MGMT_ITEMS)
    const visibleConfig = filterItems(CONFIG_ITEMS)

    const renderItems = (items) =>
        items.map(item => (
            <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
            </NavLink>
        ))

    return (
        <div className="sidebar">
            <div className="sidebar-logo">
                <img
                    src="/multycomm_logo.png"
                    alt="MultyComm"
                    style={{ width: 36, height: 36, objectFit: 'contain', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.4)) brightness(1.1)' }}
                />
                <div>
                    <div className="sidebar-logo-text">TicketCRM</div>
                    <div className="sidebar-logo-sub">MultyComm Support</div>
                </div>
            </div>

            <div className="sidebar-nav">
                {/* Overview section - always visible (Dashboard shown to all) */}
                {visibleNav.length > 0 && (
                    <>
                        <div className="nav-section-label">Overview</div>
                        {renderItems(visibleNav)}
                    </>
                )}

                {/* Management section - hide label if no items visible */}
                {visibleMgmt.length > 0 && (
                    <>
                        <div className="nav-section-label" style={{ marginTop: 16 }}>Management</div>
                        {renderItems(visibleMgmt)}
                    </>
                )}

                {/* System section - hide label if no items visible (e.g. agents/TLs won't see this) */}
                {visibleConfig.length > 0 && (
                    <>
                        <div className="nav-section-label" style={{ marginTop: 16 }}>System</div>
                        {renderItems(visibleConfig)}
                    </>
                )}
            </div>

            <div className="sidebar-footer">
                <div className="sidebar-user" onClick={() => { if (confirm('Logout?')) logout() }}>
                    <div className="user-avatar">{user?.name?.charAt(0)}</div>
                    <div className="user-info">
                        <div className="user-name">{user?.name}</div>
                        <div className="user-role" style={{ textTransform: 'capitalize' }}>{user?.role}</div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                </div>
            </div>
        </div>
    )
}
