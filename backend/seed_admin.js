// seed_admin.js - Run once to create a valid super admin
// Usage: node seed_admin.js
import bcrypt from 'bcrypt'
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

const hash = await bcrypt.hash('Admin@1234', 12)
console.log('Generated hash:', hash)

// Upsert Super Admin
const [existing] = await pool.query(`SELECT id FROM users WHERE email='admin@ticketcrm.com'`)
if (existing.length) {
    await pool.query(`UPDATE users SET password_hash=?, is_active=1 WHERE email='admin@ticketcrm.com'`, [hash])
    console.log('✅ Super Admin password updated.')
} else {
    await pool.query(
        `INSERT INTO users (name, email, password_hash, role, reporting_to, is_active) VALUES (?,?,?,?,?,1)`,
        ['Super Admin', 'admin@ticketcrm.com', hash, 'superadmin', null]
    )
    console.log('✅ Super Admin created.')
}
await pool.end()
