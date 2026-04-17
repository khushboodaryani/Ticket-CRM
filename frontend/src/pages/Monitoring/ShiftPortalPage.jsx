// src/pages/Monitoring/ShiftPortalPage.jsx
// React auto-imported by Vite
import { useParams, useNavigate } from 'react-router-dom';
import Topbar from '../../components/Layout/Topbar';
import ShiftDetailView from '../../components/Monitoring/ShiftDetailView';

export default function ShiftPortalPage() {
    const { id } = useParams();
    const navigate = useNavigate();

    return (
        <>
            <Topbar 
                title="Shift Performance HUD" 
                subtitle="Team Coordination & Capacity Monitoring"
                actions={<button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>← Back to Monitoring</button>}
            />
            <div className="page-body">
                <ShiftDetailView shiftId={id} />
            </div>
        </>
    );
}
