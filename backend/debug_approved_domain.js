import connectDB from './src/db/index.js';
import { approveDomain } from './src/modules/approvals/approvalController.js';

const pool = connectDB();

async function run() {
    console.log('Testing domain approval...');
    try {
        // Mock request/response
        const req = { params: { domain: 'multycomm.com' } };
        const res = { 
            status: (code) => ({ 
                json: (data) => console.log(`Response [${code}]:`, data) 
            }) 
        };
        
        await approveDomain(req, res);
        console.log('Approval test completed.');
    } catch (err) {
        console.error('Test failed:', err);
    } finally {
        await pool.end();
    }
}

run();
