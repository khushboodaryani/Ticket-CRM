import dotenv from "dotenv";
import connectDB from "../src/db/index.js";

dotenv.config({ path: "./.env" });

const ticketId = process.argv[2] ? Number(process.argv[2]) : null;
const ESCALATION_ROLE_BY_LEVEL = {
    1: "agent",
    2: "tl",
    3: "manager",
    4: "gm",
};

function levelLabel(level) {
    return `L${level}`;
}

async function getRuntimeSummary() {
    return {
        autoRuntime: "BullMQ worker handles breach timing; cron SLA engine now handles pause/resume plus upward escalation",
        manualRoute: "POST /api/tickets/:id/escalate",
        expectedChain: "agent -> tl -> manager -> gm",
    };
}

async function fetchTicket(pool, id) {
    const [rows] = await pool.query(
        `SELECT t.id, t.ticket_number, t.escalation_level, t.assigned_to,
                u.name AS assigned_to_name, u.role AS assigned_to_role, u.reporting_to
         FROM tickets t
         LEFT JOIN users u ON u.id = t.assigned_to
         WHERE t.id = ?`,
        [id]
    );
    return rows[0] || null;
}

async function fetchUser(pool, id) {
    const [rows] = await pool.query(
        `SELECT id, name, role, reporting_to, is_active
         FROM users
         WHERE id = ?`,
        [id]
    );
    return rows[0] || null;
}

async function buildChain(pool, startUserId) {
    const chain = [];
    const seen = new Set();
    let currentId = startUserId;

    while (currentId && !seen.has(currentId)) {
        seen.add(currentId);
        const user = await fetchUser(pool, currentId);
        if (!user) break;
        chain.push(user);
        currentId = user.reporting_to || null;
    }

    return chain;
}

function findTargetForLevel(chain, targetLevel) {
    const targetRole = ESCALATION_ROLE_BY_LEVEL[targetLevel];
    return chain.find((user, index) => index > 0 && user.is_active && user.role === targetRole)
        || chain.find((user, index) => index > 0 && user.is_active)
        || null;
}

async function main() {
    const pool = connectDB();
    const runtime = await getRuntimeSummary();

    console.log("=== Escalation Runtime Check ===");
    console.log(`Auto runtime: ${runtime.autoRuntime}`);
    console.log(`Manual route: ${runtime.manualRoute}`);
    console.log(`Expected chain: ${runtime.expectedChain}`);

    if (!ticketId) {
        console.log("\nPass a ticket id to inspect a real ticket:");
        console.log("node scripts/debug_escalation_flow.js 123");
        process.exit(0);
    }

    const ticket = await fetchTicket(pool, ticketId);
    if (!ticket) {
        console.error(`Ticket ${ticketId} not found.`);
        process.exit(1);
    }

    console.log("\n=== Ticket ===");
    console.log(`Ticket: ${ticket.ticket_number} (#${ticket.id})`);
    console.log(`Current escalation level: ${levelLabel(ticket.escalation_level)}`);
    console.log(`Assigned user: ${ticket.assigned_to_name || "Unassigned"} (${ticket.assigned_to_role || "n/a"})`);

    if (!ticket.assigned_to) {
        console.log("\nNo assigned user. Manual escalation will increase level but cannot move ownership upward.");
        process.exit(0);
    }

    const chain = await buildChain(pool, ticket.assigned_to);
    console.log("\n=== Reporting Chain ===");
    chain.forEach((user, index) => {
        console.log(`${index + 1}. ${user.name} [${user.role}] -> reporting_to=${user.reporting_to || "null"}`);
    });

    const nextLevel = Math.min(ticket.escalation_level + 1, 4);
    const nextUser = findTargetForLevel(chain, nextLevel);

    console.log("\n=== Next Manual Escalation ===");
    console.log(`Next level: ${levelLabel(nextLevel)}`);
    console.log(`Target role for next level: ${ESCALATION_ROLE_BY_LEVEL[nextLevel] || "n/a"}`);
    console.log(`Next assignee: ${nextUser ? `${nextUser.name} [${nextUser.role}]` : "No superior configured; assignee would remain unchanged"}`);

    if (!nextUser) {
        console.log("\nWARNING: This ticket has no higher reporting_to target. Escalation level can still increase, but ownership will not move.");
    }

    process.exit(0);
}

main().catch((err) => {
    console.error("debug_escalation_flow failed:", err.message);
    process.exit(1);
});
