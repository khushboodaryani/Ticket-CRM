
import imapSimple from 'imap-simple';
import moment from 'moment-timezone';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

const TZ = process.env.TIMEZONE || 'Asia/Kolkata';

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

async function debugPrecision() {
    console.log(`🔍 Debugging Time Precision (TZ: ${TZ})...`);
    console.log(`⏰ Current Node Time: ${new Date().toISOString()}`);
    console.log(`⏰ Current Moment TZ: ${moment().tz(TZ).format()}`);

    try {
        const connection = await imapSimple.connect(config);
        await connection.openBox('INBOX');

        const searchCriteria = [['SINCE', moment().tz(TZ).subtract(1, 'days').format('DD-MMM-YYYY')]];
        const fetchOptions = { bodies: ['HEADER'], markSeen: false };
        const messages = await connection.search(searchCriteria, fetchOptions);

        const fifteenMinsAgo = moment().tz(TZ).subtract(15, 'minutes');
        console.log(`⏳ Filter Cutoff (15 mins ago): ${fifteenMinsAgo.format()}`);

        for (const m of messages) {
            const internalDate = moment(m.attributes.date);
            const isMatch = !internalDate.isBefore(fifteenMinsAgo);
            
            if (m.attributes.uid == 354 || isMatch) {
                console.log(`📬 UID: ${m.attributes.uid}`);
                console.log(`   - Raw Imap Date: ${m.attributes.date}`);
                console.log(`   - Parsed Moment: ${internalDate.format()}`);
                console.log(`   - Is it after cutoff? ${isMatch}`);
                
                const headerPart = m.parts.find(p => p.which === 'HEADER');
                const msgIdArr = headerPart.body['message-id'];
                console.log(`   - Message-ID: ${msgIdArr ? msgIdArr[0] : 'MISSING'}`);
            }
        }

        connection.end();
    } catch (err) {
        console.error(err);
    }
}

debugPrecision();
