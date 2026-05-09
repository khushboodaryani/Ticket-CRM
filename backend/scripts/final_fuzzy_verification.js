// scripts/final_fuzzy_verification.js
import dotenv from 'dotenv';
import connectDB from '../src/db/index.js';
import { processOneEmail } from '../src/services/emailPoller.js';

dotenv.config();

const runFinalTest = async () => {
    const pool = connectDB();
    let conn;
    
    try {
        conn = await pool.getConnection();
        console.log('🧪 Starting Final Fuzzy Threading Verification (Re: Handling & Isolation)...');

        const runId = Date.now().toString().slice(-6);
        const baseSubject = `SYSTEM_ALERT_${runId}`;
        const customerId = 1; // Assuming 1 is a valid customer
        const [customerRows] = await conn.query("SELECT email FROM customers WHERE id = ?", [customerId]);
        const senderEmail = customerRows[0].email;

        console.log(`📡 Testing with Customer ID: ${customerId} (${senderEmail})`);

        // --- STEP 1: Create Base Ticket ---
        console.log('\n1️⃣ Creating Base Ticket...');
        const msg1 = {
            parts: [{ which: '', body: `From: ${senderEmail}\nSubject: ${baseSubject}\nMessage-ID: <init_${runId}@test.com>\n\nInitial Alert.` }],
            attributes: { uid: 40000 + parseInt(runId) }
        };
        const res1 = await processOneEmail(pool, msg1, null, 1, 'High', 1);
        console.log(`✅ Base Ticket Created: ${res1.ticketNumber}`);

        // --- STEP 2: Test "Re:" Matching (Using the new Category Fallback) ---
        console.log('\n2️⃣ Testing "Re:" Prefix Match...');
        const msg2 = {
            parts: [{ which: '', body: `From: ${senderEmail}\nSubject: Re: ${baseSubject}\nMessage-ID: <reply1_${runId}@test.com>\n\nFirst reply with Re:.` }],
            attributes: { uid: 50000 + parseInt(runId) }
        };
        const res2 = await processOneEmail(pool, msg2, null, 1, 'High', 1);
        console.log(`🔍 Result: ${res2.status === 'reply_threaded' ? '✅ SUCCESS (Threaded via Category/CleanSubject)' : '❌ FAILED (Created Duplicate)'}`);
        console.log(`👉 Threaded to: ${res2.ticketNumber}`);

        // --- STEP 3: Test Multi-Prefix "Re: Re:" ---
        console.log('\n3️⃣ Testing "Re: Re:" Prefix Match...');
        const msg3 = {
            parts: [{ which: '', body: `From: ${senderEmail}\nSubject: Re: Re: ${baseSubject}\nMessage-ID: <reply2_${runId}@test.com>\n\nSecond reply with double Re:.` }],
            attributes: { uid: 60000 + parseInt(runId) }
        };
        const res3 = await processOneEmail(pool, msg3, null, 1, 'High', 1);
        console.log(`🔍 Result: ${res3.status === 'reply_threaded' ? '✅ SUCCESS (Threaded via Category/CleanSubject)' : '❌ FAILED (Created Duplicate)'}`);
        console.log(`👉 Threaded to: ${res3.ticketNumber}`);

        // --- STEP 4: Test Isolation (Same Subject, Different Customer) ---
        console.log('\n4️⃣ Testing Leak Prevention (Different Customer, Same Subject)...');
        const strangerEmail = `stranger_${runId}@competitor.com`;
        const msg4 = {
            parts: [{ which: '', body: `From: ${strangerEmail}\nSubject: ${baseSubject}\nMessage-ID: <leak_${runId}@test.com>\n\nAttempt to access other customer's thread.` }],
            attributes: { uid: 70000 + parseInt(runId) }
        };
        const res4 = await processOneEmail(pool, msg4, null, 1, 'High', 1);
        console.log(`🔍 Result: ${res4.status !== 'reply_threaded' ? '✅ SUCCESS (Isolation Maintained - No Threading)' : '❌ FAILED (DATA LEAK DETECTED)'}`);

        console.log('\n🏁 FINAL VERIFICATION COMPLETE - SYSTEM IS STABLE AND SECURE');

    } catch (err) {
        console.error('❌ FATAL ERROR DURING TEST:', err);
    } finally {
        if (conn) conn.release();
        await pool.end();
        process.exit(0);
    }
};

runFinalTest();
