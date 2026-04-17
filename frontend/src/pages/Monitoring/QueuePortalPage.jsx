// src/pages/Monitoring/QueuePortalPage.jsx
// React auto-imported by Vite
import { useParams, useNavigate } from 'react-router-dom';
import Topbar from '../../components/Layout/Topbar';
import QueueDetailView from '../../components/Monitoring/QueueDetailView';

export default function QueuePortalPage() {
    const { id } = useParams();
    const navigate = useNavigate();

    return (
        <>
            <Topbar 
                title="Queue Management Portal" 
                subtitle="Workload Distribution & Traffic Analysis"
                actions={<button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>← Back to Monitoring</button>}
            />
            <div className="page-body">
                <QueueDetailView queueId={id} />
            </div>
        </>
    );
}
