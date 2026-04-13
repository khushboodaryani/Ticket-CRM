
import imapSimple from 'imap-simple';
import { simpleParser } from 'mailparser';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

const config = {
    imap: {
        user: process.env.EMAIL_USER,
        password: process.env.EMAIL_PASSWORD,
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        authTimeout: 3000,
        tlsOptions: { rejectUnauthorized: false }
    }
};

async function diagnostic() {
    console.log('🔍 Running IMAP Emergency Diagnostic...');
    try {
        const connection = await imapSimple.connect(config);
        await connection.openBox('INBOX');

        const searchCriteria = ['ALL']; // Get everything to see what's there
        const fetchOptions = { bodies: ['HEADER'], markSeen: false, struct: true };
        const messages = await connection.search(searchCriteria, fetchOptions);

        console.log(`✅ Total messages in INBOX: ${messages.length}`);
        
        // Look at the last 10 messages
        const last10 = messages.slice(-10);
        for (const msg of last10) {
            const header = msg.parts.find(p => p.which === 'HEADER').body;
            const subject = Array.isArray(header.subject) ? header.subject[0] : header.subject;
            const from = Array.isArray(header.from) ? header.from[0] : header.from;
            const date = Array.isArray(header.date) ? header.date[0] : header.date;
            console.log(`📬 UID: ${msg.attributes.uid} | Date: ${date} | From: ${from} | Subject: ${subject}`);
        }

        connection.end();
    } catch (err) {
        console.error('❌ Diagnostic Error:', err);
    }
}

diagnostic();
