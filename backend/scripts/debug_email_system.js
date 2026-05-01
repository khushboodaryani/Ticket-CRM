import connectDB from '../src/db/index.js';
import { processOneEmail } from '../src/services/emailPoller.js';
import { logger } from '../src/logger.js';

async function debugEmailSystem() {
    const pool = connectDB();
    
    // 1. Mock Email: New Ticket (Regular Customer)
    console.log('\n--- Test 1: New Ticket Creation ---');
    const mockEmail1 = {
        parts: [{
            which: '',
            body: `From: "Test User" <test@multycomm.com>
To: support@multycomm.com
Subject: Test Ticket 1
Message-ID: <msg1@test.com>

This is a new ticket test.`
        }],
        attributes: { uid: 1001 }
    };

    const res1 = await processOneEmail(pool, mockEmail1, null, 1, 'High', 5);
    console.log('Result 1:', res1);

    // 2. Mock Email: Reply to Test Ticket 1 (Should Thread)
    console.log('\n--- Test 2: Threaded Reply ---');
    if (res1.ticketNumber) {
        const mockReply = {
            parts: [{
                which: '',
                body: `From: "Test User" <test@multycomm.com>
To: support@multycomm.com
Subject: Re: [${res1.ticketNumber}] Test Ticket 1
Message-ID: <msg2@test.com>
In-Reply-To: <msg1@test.com>
References: <msg1@test.com>

This is a threaded reply.`
            }],
            attributes: { uid: 1002 }
        };
        const res2 = await processOneEmail(pool, mockReply, null, 1, 'High', 5);
        console.log('Result 2:', res2);
    }

    // 3. Mock Email: New Ticket with Same CC but different subject/sender (Should NOT Merge)
    console.log('\n--- Test 3: Unique Ticket for Different Sender/Subject ---');
    const mockEmail3 = {
        parts: [{
            which: '',
            body: `From: "Another User" <another@multycomm.com>
To: support@multycomm.com
Cc: test@multycomm.com
Subject: Different Subject
Message-ID: <msg3@test.com>

This should be a unique ticket.`
        }],
        attributes: { uid: 1003 }
    };
    const res3 = await processOneEmail(pool, mockEmail3, null, 1, 'High', 5);
    console.log('Result 3:', res3);

    // 4. Mock Email: Unknown Domain (Should be Held)
    console.log('\n--- Test 4: Unknown Domain Approval ---');
    const mockEmail4 = {
        parts: [{
            which: '',
            body: `From: "Unknown" <hacker@unknown-domain.com>
To: support@multycomm.com
Subject: Unknown Domain Test
Message-ID: <msg4@test.com>

This should be held for approval.`
        }],
        attributes: { uid: 1004 }
    };
    const res4 = await processOneEmail(pool, mockEmail4, null, 1, 'High', 5);
    console.log('Result 4:', res4);

    process.exit(0);
}

debugEmailSystem().catch(err => {
    console.error('Debug failed:', err);
    process.exit(1);
});
