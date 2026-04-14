import mysql from 'mysql2/promise';

const remoteConfig = {
    host: '181.214.10.244',
    user: 'root',
    password: 'WELcome@123',
    database: 'ticket_crm'
};

async function inspect() {
    const conn = await mysql.createConnection(remoteConfig);
    try {
        const [tickets] = await conn.query(
            "SELECT id, ticket_number, subject, created_at FROM tickets WHERE created_at >= '2026-04-13 00:00:00' ORDER BY id ASC"
        );
        console.log('--- ALL TICKETS TODAY ---');
        tickets.forEach(t => console.log(`${t.ticket_number} | ${t.id} | ${t.subject} | ${t.created_at}`));
    } catch (err) {
        console.error(err);
    } finally {
        await conn.end();
    }
}

inspect();
