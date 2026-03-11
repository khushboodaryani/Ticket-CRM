// src/controllers/roles/createSuperAdmin.js
//
// Run with:  node src/controllers/roles/createSuperAdmin.js
//
// Targets schema.sql:
//   users(id, name, email, password_hash, role ENUM, reporting_to, is_active, ...)

import bcrypt from 'bcrypt';
import connectDB from '../../db/index.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../../.env') });

const createSuperAdmin = async () => {
    // ── Super Admin credentials ──────────────────────────────────────────────
    const name = 'Super Admin';
    const email = 'admin@ticketcrm.com';
    const plainPassword = 'Admin@1234';
    // ────────────────────────────────────────────────────────────────────────

    try {
        const hashedPassword = await bcrypt.hash(plainPassword, 12);

        const pool = connectDB();
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            // ── 1. Upsert super admin user ───────────────────────────────────
            await connection.query(
                `INSERT INTO users (name, email, password_hash, role, reporting_to, is_active)
                 VALUES (?, ?, ?, 'superadmin', NULL, 1)
                 ON DUPLICATE KEY UPDATE
                   name          = VALUES(name),
                   password_hash = VALUES(password_hash),
                   role          = 'superadmin',
                   is_active     = 1`,
                [name, email, hashedPassword]
            );

            // ── 2. Get the actual user ID (insertId = 0 on UPDATE) ──────────
            const [rows] = await connection.query(
                'SELECT id FROM users WHERE email = ?',
                [email]
            );

            if (rows.length === 0) {
                throw new Error('User was not created — check for constraint errors.');
            }

            const userId = rows[0].id;

            await connection.commit();

            console.log('\n✅ Super Admin created/updated successfully!\n');
            console.log(`   Name     : ${name}`);
            console.log(`   Email    : ${email}`);
            console.log(`   Password : ${plainPassword}  (stored hashed)`);
            console.log(`   User ID  : ${userId}`);
            console.log(`   Role     : superadmin`);
            console.log('');

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error('\n❌ Error creating Super Admin:', error.message);
        process.exit(1);
    }

    process.exit(0);
};

createSuperAdmin();
