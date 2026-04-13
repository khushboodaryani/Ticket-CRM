// scratch/check_migrations_table.js
import connectDB from '../src/db/index.js';

async function check() {
    const pool = connectDB();
    try {
        const [rows] = await pool.query('SHOW TABLES LIKE "migrations"');
        if (rows.length) {
            const [data] = await pool.query('SELECT * FROM migrations');
            console.log('Local Migrations Table:');
            console.table(data);
        } else {
            console.log('No migrations table found.');
        }
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        process.exit();
    }
}

check();
