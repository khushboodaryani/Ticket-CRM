
import dotenv from 'dotenv';
import imapSimple from 'imap-simple';
import path from 'path';

dotenv.config(); // If running from backend root

const config = {
    imap: {
        user: process.env.GMAIL_USER,
        password: process.env.GMAIL_APP_PASSWORD,
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
        authTimeout: 15000
    }
};

async function testConnection() {
    try {
        console.log(`Connecting to ${config.imap.user}...`);
        const connection = await imapSimple.connect(config);
        console.log('✅ IMAP connection successful!');
        await connection.openBox('INBOX');
        console.log('✅ INBOX opened successfully!');
        
        const searchCriteria = ['UNSEEN'];
        const fetchOptions = { bodies: ['HEADER'], markSeen: false };
        const results = await connection.search(searchCriteria, fetchOptions);
        console.log(`Found ${results.length} unread emails.`);
        
        connection.end();
        process.exit(0);
    } catch (err) {
        console.error('❌ Connection failed:', err.message);
        process.exit(1);
    }
}

testConnection();
