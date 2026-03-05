import connectDB from './src/db/index.js';

async function migrate() {
    const pool = connectDB();
    try {
        console.log("Altering tickets table to add 'csv' to source ENUM...");
        await pool.query("ALTER TABLE tickets MODIFY COLUMN source ENUM('email', 'call', 'manual', 'csv') NOT NULL DEFAULT 'manual'");
        console.log("Migration successful!");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        process.exit();
    }
}

migrate();
