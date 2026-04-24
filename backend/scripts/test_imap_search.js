
import imapSimple from 'imap-simple';
import moment from 'moment-timezone';
import 'dotenv/config';

const imapConfig = {
    user: process.env.IMAP_USER || process.env.EMAIL_USER,
    password: process.env.IMAP_PASS || process.env.EMAIL_PASSWORD,
    host: process.env.IMAP_HOST || 'imap.gmail.com',
    port: process.env.IMAP_PORT || 993,
    tls: process.env.IMAP_TLS === 'true',
    tlsOptions: { rejectUnauthorized: false }
};

async function debug() {
    console.log('Connecting to:', imapConfig.host);
    try {
        const connection = await imapSimple.connect({ imap: imapConfig });
        await connection.openBox('INBOX');

        const TZ = process.env.TIMEZONE || 'Asia/Kolkata';
        const lastSeenUid = 30378; 
        const nextUid = lastSeenUid + 1;
        const pollerSinceDate = moment().subtract(24, 'hours').tz(TZ).format('DD-MMM-YYYY');

        console.log(`Searching for UID ${nextUid}:* SINCE ${pollerSinceDate}`);

        const nestedCriteria = [['UID', `${nextUid}:*`], ['SINCE', pollerSinceDate]];
        const flatCriteria = ['UID', `${nextUid}:*`, 'SINCE', pollerSinceDate];

        const nestedMessages = await connection.search(nestedCriteria, { bodies: ['HEADER'], markSeen: false });
        const flatMessages = await connection.search(flatCriteria, { bodies: ['HEADER'], markSeen: false });

        console.log('Nested criteria UIDs:', nestedMessages.map(msg => msg.attributes?.uid));
        console.log('Flat criteria UIDs:', flatMessages.map(msg => msg.attributes?.uid));

        connection.end();
        return;

    } catch (err) {
        console.error('Outer Error:', err);
    }
}

debug();
