// src/pages/Monitoring/AgentPortalPage.jsx
// React auto-imported by Vite
import { useParams, useNavigate } from 'react-router-dom';
import Topbar from '../../components/Layout/Topbar';
import AgentDetailView from '../../components/Monitoring/AgentDetailView';

export default function AgentPortalPage() {
    const { id } = useParams();
    const navigate = useNavigate();

    return (
        <>
            <Topbar 
                title="Agent Operation Center" 
                subtitle="Live Productivity & Workload Monitor"
                actions={<button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>← Back to Monitoring</button>}
            />
            <div className="page-body">
                <AgentDetailView agentId={id} />
            </div>
        </>
    );
}
