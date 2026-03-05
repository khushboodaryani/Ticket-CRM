// src/components/Layout/Layout.jsx
import Sidebar from './Sidebar'
import { Outlet } from 'react-router-dom'

export default function Layout() {
    return (
        <div className="layout">
            <Sidebar />
            <div className="main-content">
                <Outlet />
            </div>
        </div>
    )
}
