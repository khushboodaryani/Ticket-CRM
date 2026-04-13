// scratch/get_ids.js
import connectDB from '../src/db/index.js';

async function check() {
    const pool = connectDB();
    try {
        const [customers] = await pool.query('SELECT id, name, email FROM customers LIMIT 1');
        const [projects] = await pool.query('SELECT id, name FROM projects LIMIT 1');
        console.log('Valid IDs:');
        console.table({ customer: customers[0], project: projects[0] });
    } catch (err) {
        console.error('Error checking IDs:', err);
    } finally {
        process.exit();
    }
}

check();
