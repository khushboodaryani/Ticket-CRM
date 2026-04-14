// scratch/test_concurrency.js
import connectDB from '../src/db/index.js';

async function testLock() {
    const pool = connectDB();
    console.log('--- Lock Test Starting (Two Connections) ---');

    console.log('Worker 1: Acquiring connection...');
    const conn1 = await pool.getConnection();
    
    console.log('Worker 1: Attempting to acquire lock...');
    const [res1] = await conn1.query("SELECT GET_LOCK('email_poller_lock', 0) AS lockStatus");
    console.log('Worker 1: Results:', res1[0]);

    if (res1[0].lockStatus === 1) {
        console.log('Worker 1: SUCCESS. Holding lock.');
        
        console.log('Worker 2: Acquiring separate connection...');
        const conn2 = await pool.getConnection();
        
        console.log('Worker 2: Attempting to acquire same lock (should fail)...');
        const [res2] = await conn2.query("SELECT GET_LOCK('email_poller_lock', 0) AS lockStatus");
        console.log('Worker 2: Results:', res2[0]);
        
        if (res2[0].lockStatus === 0) {
            console.log('Worker 2: ✅ Correctly failed to acquire lock.');
        } else {
            console.error('Worker 2: ❌ ERROR - Successfully acquired already locked resource!');
        }

        console.log('Worker 1: Releasing lock...');
        await conn1.query("SELECT RELEASE_LOCK('email_poller_lock')");
        conn1.release();
        conn2.release();
        console.log('Worker 1: Released and connections returned to pool.');
    } else {
        console.error('Worker 1: FAILED to acquire initial lock.');
    }

    process.exit(0);
}

testLock();
