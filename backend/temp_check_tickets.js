import connectDB from './src/db/index.js';
import fs from 'fs';

const pool = connectDB();
try {
    const [rows] = await pool.query("SELECT ticket_number, category, status FROM tickets ORDER BY id DESC LIMIT 5");
    fs.writeFileSync('recent_tickets.txt', JSON.stringify(rows, null, 2));
} catch (err) {}
process.exit(0);
