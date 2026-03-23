import connectDB from '../src/db/index.js';

async function migrate() {
    const pool = connectDB();
    try {
        console.log("Creating 'code_sequences' table...");
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS code_sequences (
                id INT AUTO_INCREMENT PRIMARY KEY,
                entity_type VARCHAR(50) UNIQUE NOT NULL,
                prefix VARCHAR(10) NOT NULL,
                current_value INT NOT NULL DEFAULT 0,
                last_date DATE NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        console.log("Seeding initial data for CUSTOMER and PROJECT...");
        const today = new Date().toISOString().split('T')[0];

        // Insert ignore so we don't crash on reruns
        await pool.query(`
            INSERT IGNORE INTO code_sequences (entity_type, prefix, current_value, last_date)
            VALUES 
            ('CUSTOMER', 'CUST', 0, ?),
            ('PROJECT', 'PRJ', 0, ?)
        `, [today, today]);

        console.log("Migration successful!");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        process.exit();
    }
}

migrate();
