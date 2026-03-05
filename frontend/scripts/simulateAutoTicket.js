// scripts/simulateAutoTicket.js
import axios from 'axios';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();

const API_URL = `http://localhost:${process.env.PORT || 8450}/api`;

async function simulate() {
    console.log('🚀 Starting Auto-Ticket Simulation...');

    try {
        const pool = mysql.createPool({
            host: process.env.MYSQL_HOST,
            user: process.env.MYSQL_USER,
            password: process.env.MYSQL_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.MYSQL_PORT || 3306,
        });

        // 1. Ensure the test customer exists
        const userEmail = 'khushboodaryani1@gmail.com';
        console.log(`🔍 Checking if customer ${userEmail} exists...`);

        let [rows] = await pool.query('SELECT id FROM customers WHERE email = ?', [userEmail]);
        let customerId;

        if (rows.length === 0) {
            console.log('✨ Creating new test customer...');
            const [res] = await pool.query(
                'INSERT INTO customers (name, email, phone, customer_code) VALUES (?, ?, ?, ?)',
                ['Khushboo Daryani', userEmail, '9876543210', 'KD-TEST']
            );
            customerId = res.insertId;
        } else {
            customerId = rows[0].id;
        }

        // 2. Find a project for this customer (or create one)
        let [projs] = await pool.query('SELECT id FROM projects WHERE customer_id = ? LIMIT 1', [customerId]);
        let projectId;

        if (projs.length === 0) {
            const [pres] = await pool.query(
                'INSERT INTO projects (customer_id, name, project_code) VALUES (?, ?, ?)',
                [customerId, 'Personal Support', 'PS-001']
            );
            projectId = pres.insertId;
        } else {
            projectId = projs[0].id;
        }

        // 3. Get an auth token (simulating an automated system or using admin)
        // For simplicity in this script, we'll assume the system can reach the DB directly 
        // but the user wanted to see how it "auto generates". 
        // We will call the API to trigger the same logic as the frontend.

        console.log('🎫 Generating ticket via API...');

        // We need a valid token. Since this is a local test, let's login as admin.
        const loginRes = await axios.post(`${API_URL}/auth/login`, {
            email: 'admin@ticketcrm.com',
            password: 'Admin@1234'
        });
        const token = loginRes.data.token;

        const ticketRes = await axios.post(`${API_URL}/tickets`, {
            customer_id: customerId,
            project_id: projectId,
            category: 'Auto-Generated Test',
            priority: 'P2',
            description: 'This is an automated ticket generated to test the email notification system.',
            source: 'email'
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });

        console.log('✅ Ticket Created Successfully!');
        console.log('Ticket Number:', ticketRes.data.ticket_number);
        console.log('Check your email at:', userEmail);

        await pool.end();
    } catch (error) {
        console.error('❌ Simulation failed:', error.response?.data || error.message);
    }
}

simulate();
