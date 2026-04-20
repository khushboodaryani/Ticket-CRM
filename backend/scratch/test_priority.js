
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

function resolvePriorityFromText(subject = '', body = '') {
    const text = (subject + ' ' + body).toLowerCase();

    const emergencyPhrases = ['server down', 'crash', 'emergency', 'outage', 'system down'];
    const isEmergency = emergencyPhrases.some(phrase => text.includes(phrase));
    if (isEmergency) {
        return { categoryId: 1, isEmergency: true };
    }

    if (text.includes('critical')) {
        return { categoryId: 1, isEmergency: false };
    }
    if (text.includes('high') || text.includes('urgent')) {
        return { categoryId: 2, isEmergency: false };
    }
    if (text.includes('medium')) {
        return { categoryId: 3, isEmergency: false };
    }
    if (text.includes('low')) {
        return { categoryId: 4, isEmergency: false };
    }

    return { categoryId: 2, isEmergency: false };
}

async function test() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'Ayan@1012',
        database: process.env.DB_NAME || 'ticket_crm'
    });

    const testCases = [
        { s: 'EMERGENCY server down', b: '', expect: 'P1 (Emergency)' },
        { s: 'crash in production', b: '', expect: 'P1 (Emergency)' },
        { s: 'Critical bug in login', b: '', expect: 'P4 (lowest P tier)' },
        { s: 'CRITICAL issue found', b: '', expect: 'P4 (lowest P tier)' },
        { s: 'High priority request', b: '', expect: 'Q3 (lowest Q tier)' },
        { s: 'urgent fix needed', b: '', expect: 'Q3 (lowest Q tier)' },
        { s: 'Medium level task', b: '', expect: 'R2 (lowest R tier)' },
        { s: 'low priority cleanup', b: '', expect: 'S1 (lowest S tier)' },
        { s: 'Just a normal email', b: '', expect: 'Q3 (default=High, lowest Q)' },
        { s: 'Need help with something', b: 'This is urgent please', expect: 'Q3 (body keyword)' },
    ];

    console.log('─'.repeat(90));
    console.log('Subject'.padEnd(35) + ' → ' + 'Resolved'.padEnd(20) + ' Expected'.padEnd(25) + ' Pass?');
    console.log('─'.repeat(90));

    for (const tc of testCases) {
        const { categoryId, isEmergency } = resolvePriorityFromText(tc.s, tc.b);
        const sortOrder = isEmergency ? 'ASC' : 'DESC';
        const [prioRows] = await pool.query(
            `SELECT id, name FROM priorities 
             WHERE category_id = ? AND is_active = 1 
             ORDER BY level ${sortOrder} LIMIT 1`,
            [categoryId]
        );
        const priorityName = prioRows[0]?.name || 'Q1';
        const tag = isEmergency ? ' 🚨EMERG' : '';
        const result = `${priorityName}${tag}`;
        const pass = tc.expect.startsWith(priorityName) ? '✅' : '❌';
        console.log(`${tc.s.padEnd(35)} → ${result.padEnd(20)} ${tc.expect.padEnd(25)} ${pass}`);
    }

    console.log('─'.repeat(90));
    await pool.end();
}

test();
