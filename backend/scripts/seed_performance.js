// backend/scripts/seed_performance.js
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

const config = {
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.DB_NAME,
};

async function seed() {
    const connection = await mysql.createConnection(config);
    console.log("🚀 Starting performance seed...");

    try {
        // 1. Seed Queues (200)
        console.log("📦 Seeding 200 Queues...");
        const queueValues = [];
        for (let i = 1; i <= 200; i++) {
            queueValues.push([`Queue_${i}`, `Description for Queue ${i}`, 3]);
        }
        await connection.query("INSERT IGNORE INTO queues (name, description, priority) VALUES ?", [queueValues]);

        // 2. Fetch required IDs
        const [[{ id: customerId }]] = await connection.query("SELECT id FROM customers LIMIT 1");
        const [[{ id: creatorId }]] = await connection.query("SELECT id FROM users LIMIT 1");

        // 3. Seed Agents (500)
        console.log("👥 Seeding 500 Agents...");
        const agentValues = [];
        for (let i = 1; i <= 500; i++) {
            agentValues.push([
                `Perf_Agent_${i}`, 
                `agent_${i}@perf.test`, 
                '$2b$10$W2IuQ.9.X6H2Y0H8v.y1OeG4H6zX7E8B8kB8b8b8b8b8b8b8b8b8b', // placeholder hash
                'agent',
                Math.random() > 0.3 ? 1 : 0, // online/offline
                ['available', 'on_call', 'idle', 'away', 'offline'][Math.floor(Math.random() * 5)],
                `EXT-${1000 + i}`
            ]);
        }
        await connection.query(
            "INSERT IGNORE INTO users (name, email, password_hash, role, is_online, status, extension) VALUES ?", 
            [agentValues]
        );

        // 4. Seed Tickets (10,000)
        console.log("🎫 Seeding 10,000 Tickets...");
        const [qIds] = await connection.query("SELECT id FROM queues");
        const queueList = qIds.map(q => q.id);
        
        const [uIds] = await connection.query("SELECT id FROM users WHERE email LIKE '%perf.test'");
        const agentList = uIds.map(u => u.id);

        for (let batch = 0; batch < 10; batch++) {
            const ticketValues = [];
            for (let i = 1; i <= 1000; i++) {
                const qId = queueList[Math.floor(Math.random() * queueList.length)];
                const uId = agentList[Math.floor(Math.random() * agentList.length)];
                const status = ['open', 'in_progress', 'pending', 'resolved'][Math.floor(Math.random() * 4)];
                const priority = ['P1', 'P2', 'P3', 'P4', 'P5'][Math.floor(Math.random() * 5)];
                
                ticketValues.push([
                    `T-PERF-${batch}-${i}-${Date.now()}`,
                    customerId,
                    `Performance test problem description for batch ${batch} index ${i}`,
                    status,
                    priority,
                    uId,
                    qId,
                    new Date(Date.now() + (Math.random() * 86400000)), // ETR in next 24h
                    creatorId
                ]);
            }
            await connection.query(
                "INSERT INTO tickets (ticket_number, customer_id, description, status, priority, assigned_to, queue_id, etr, created_by) VALUES ?",
                [ticketValues]
            );
            console.log(`   - Batch ${batch + 1}/10 injected.`);
        }

        console.log("✅ Performance seed complete!");
    } catch (err) {
        console.error("❌ Seeding failed:", err);
    } finally {
        await connection.end();
    }
}

seed();
