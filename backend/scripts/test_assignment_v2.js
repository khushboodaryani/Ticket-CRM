
import connectDB from '../src/db/index.js';
import { getShiftAssignee } from '../src/services/assignmentService.js';
import moment from 'moment-timezone';

const testAssignment = async () => {
    const pool = connectDB();
    try {
        console.log("🚀 Starting Assignment Logic Test...");
        
        // 1. Check current time and active shifts
        const TZ = process.env.TIMEZONE || 'Asia/Kolkata';
        const now = moment().tz(TZ);
        const currentTime = now.format('HH:mm:ss');
        const currentDay = now.format('ddd');
        console.log(`📍 Current Context: ${currentTime} (${currentDay})`);

        const [shifts] = await pool.query('SELECT id, name, start_time, end_time, working_days FROM shifts');
        console.log("\n📊 Available Shifts:");
        shifts.forEach(s => {
            console.log(`- [ID: ${s.id}] ${s.name}: ${s.start_time}-${s.end_time} (${s.working_days})`);
        });

        // 2. Audit Agents and their heartbeats
        const [agents] = await pool.query(`
            SELECT id, name, is_online, status_source, last_heartbeat,
                   TIMESTAMPDIFF(MINUTE, last_heartbeat, NOW()) as minutes_ago
            FROM users 
            WHERE role IN ('agent', 'tl') AND is_active = 1
        `);

        console.log("\n👤 Agent Presence Audit:");
        agents.forEach(a => {
            const hbStatus = a.minutes_ago === null ? 'NEVER' : `${a.minutes_ago}m ago`;
            let eligibility = '❌ INELIGIBLE';
            
            // Check logic manually for debug (Matching production: 30-minute limit)
            const isOnline = a.is_online === 1;
            const isFresh = a.minutes_ago < 30;
            
            if (isOnline && isFresh) eligibility = '✅ ELIGIBLE';
            else if (!isOnline) eligibility = '💤 OFFLINE';
            else if (!isFresh) eligibility = '⏳ STALE HEARTBEAT (>30m)';

            console.log(`- ${a.name.padEnd(15)} | Online: ${a.is_online} | Source: ${a.status_source.padEnd(7)} | HB: ${hbStatus.padEnd(8)} | ${eligibility}`);
        });

        // 3. Run a test assignment for Queue 8 (or any queue)
        console.log("\n🎯 Simulating Assignment for Queue 8...");
        const assigneeId = await getShiftAssignee(8);
        
        if (assigneeId) {
            const [winner] = await pool.query('SELECT name FROM users WHERE id = ?', [assigneeId]);
            console.log(`\n🏆 WINNER: Ticket would be assigned to -> ${winner[0].name} (ID: ${assigneeId})`);
        } else {
            console.log("\n⚠️ RESULT: No eligible agent found. Ticket would remain UNASSIGNED.");
            console.log("   Check if any of the 'ELIGIBLE' agents above are also members of Queue 8.");
        }

        // 4. Queue Membership check
        const [qAgents] = await pool.query(`
            SELECT u.name FROM queue_agents qa 
            JOIN users u ON qa.user_id = u.id 
            WHERE qa.queue_id = 8
        `);
        console.log(`\n👥 Agents currently in Queue 8: ${qAgents.map(a => a.name).join(', ') || 'None'}`);

    } catch (err) {
        console.error("❌ Test Failed:", err);
    } finally {
        process.exit();
    }
};

testAssignment();
