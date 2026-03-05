// backend/seed_telecom_data.js
import mysql from 'mysql2/promise'
import dotenv from 'dotenv'
dotenv.config()

const pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.MYSQL_PORT || 3306,
})

async function seed() {
    console.log('📡 Seeding Telecom Dummy Data...')

    try {
        // 1. Customers
        const [custs] = await pool.query(`INSERT INTO customers (name, email, phone, customer_code) VALUES 
      ('Reliance Jio Infocomm', 'support@jio.com', '1800-889-9999', 'RJ-MUM'),
      ('Bharti Airtel Ltd', 'corp@airtel.in', '121', 'BAL-DEL'),
      ('Vodafone Idea (Vi)', 'care@vi.com', '199', 'VI-PUN'),
      ('Tata Communications', 'vsupport@tatacomm.com', '+91 22 6657 8765', 'TC-MAH')`)

        const jioId = custs.insertId;
        const airtelId = custs.insertId + 1;
        const viId = custs.insertId + 2;
        const tataId = custs.insertId + 3;

        // 2. Projects
        await pool.query(`INSERT INTO projects (customer_id, name, project_code, description) VALUES 
      (${jioId}, '5G NSA Deployment', 'JIO-5G', 'Pan-India 5G core rollout strategy'),
      (${jioId}, 'FTTH Fiber Connect', 'JIO-FBR', 'Last mile fiber connectivity issues'),
      (${airtelId}, 'Enterprise Lease Line', 'ART-ELL', 'B2B high speed dedicated lines'),
      (${viId}, 'Internal Billing System', 'VI-BILL', 'Postpaid billing engine maintenance'),
      (${tataId}, 'Global SD-WAN', 'TC-SDW', 'International SD-WAN routing optimization')`)

        // 3. Shifts
        const [shifts] = await pool.query(`INSERT INTO shifts (name, start_time, end_time, working_days, shift_type) VALUES 
      ('Day Shift (Sales)', '09:00:00', '18:00:00', '["Mon","Tue","Wed","Thu","Fri"]', 'general'),
      ('Night Support (Network)', '22:00:00', '07:00:00', '["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]', 'night')`)

        // 4. Update existing admin to be in a shift or report to self (already done in schema)

        console.log('✅ Telecom data seeded successfully.')
    } catch (err) {
        console.error('❌ Seeding error:', err)
    } finally {
        await pool.end()
    }
}

seed()
