// scratch/test_system.js
import axios from 'axios';
import { io } from 'socket.io-client';

const API_URL = 'http://localhost:8450/api';
const SOCKET_URL = 'http://localhost:8450';

async function runTests() {
    console.log('--- Starting System Tests ---');

    try {
        // 1. Test Health
        const health = await axios.get('http://localhost:8450/health');
        console.log('✅ Health Check:', health.data);

        // 2. Test Login
        console.log('Testing Login...');
        const loginResponse = await axios.post(`${API_URL}/auth/login`, {
            email: 'ayan@multycomm.com',
            password: 'Admin@1234'
        });
        const token = loginResponse.data.token;
        console.log('✅ Login Successful. Token obtained.');

        // 3. Test Socket Connection
        console.log('Testing Socket Connection...');
        const socket = io(SOCKET_URL, {
            auth: { token }
        });

        socket.on('connect', () => {
            console.log('✅ Socket Connected. ID:', socket.id);
            socket.disconnect();
            process.exit(0);
        });

        socket.on('connect_error', (err) => {
            console.error('❌ Socket Connection Failed:', err.message);
            process.exit(1);
        });

        // Timeout for socket
        setTimeout(() => {
            console.error('❌ Socket Connection Timeout');
            process.exit(1);
        }, 5000);

    } catch (error) {
        console.error('❌ Test Failed:', error.response ? error.response.data : error.message);
        process.exit(1);
    }
}

runTests();
