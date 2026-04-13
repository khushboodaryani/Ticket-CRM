// scratch/check_users.js
import connectDB from '../src/db/index.js';

async function check() {
    const pool = connectDB();
    try {
        const [rows] = await pool.query('SELECT id, name, email, role, is_active FROM users');
        console.log('Users in DB:');
        console.table(rows);
    } catch (err) {
        console.error('Error checking users:', err);
    } finally {
        process.exit();
    }
}

check();
