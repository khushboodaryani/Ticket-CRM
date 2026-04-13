// scratch/check_email_logs.js
import connectDB from '../src/db/index.js';

async function check() {
    const pool = connectDB();
    try {
        const [logs] = await pool.query('SELECT * FROM email_logs ORDER BY created_at DESC LIMIT 5');
        console.log('Recent Email Logs:');
        console.table(logs);

        const [msgs] = await pool.query('SELECT message_id, is_sent FROM conversation_messages ORDER BY created_at DESC LIMIT 5');
        console.log('Recent Conversation Messages:');
        console.table(msgs);
    } catch (err) {
        console.error('Error checking email logs:', err);
    } finally {
        process.exit();
    }
}

check();
