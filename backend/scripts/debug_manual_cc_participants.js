import connectDB from '../src/db/index.js';

const requiredColumns = ['added_manually', 'notified_at'];

async function main() {
    const pool = connectDB();

    console.log('\n--- MANUAL CC PARTICIPANTS DEBUG ---');

    const [columns] = await pool.query(
        `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'conversation_participants'
           AND COLUMN_NAME IN (?, ?)
         ORDER BY COLUMN_NAME`,
        requiredColumns
    );

    const found = new Set(columns.map(c => c.COLUMN_NAME));
    for (const name of requiredColumns) {
        if (!found.has(name)) {
            throw new Error(`Missing required column conversation_participants.${name}`);
        }
    }

    console.log('Schema columns:');
    columns.forEach(c => {
        console.log(`- ${c.COLUMN_NAME}: ${c.COLUMN_TYPE}, nullable=${c.IS_NULLABLE}, default=${c.COLUMN_DEFAULT}`);
    });

    const [uniqueKeys] = await pool.query(
        `SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns
         FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'conversation_participants'
           AND NON_UNIQUE = 0
         GROUP BY INDEX_NAME
         ORDER BY INDEX_NAME`
    );

    const hasParticipantUnique = uniqueKeys.some(k => k.columns === 'conversation_id,email');
    if (!hasParticipantUnique) {
        throw new Error('Missing unique participant guard on (conversation_id,email)');
    }

    console.log('Unique participant guard: OK');

    const [summaryRows] = await pool.query(
        `SELECT
            COUNT(*) AS total_participants,
            SUM(type = 'cc') AS total_cc,
            SUM(type = 'cc' AND added_manually = 1) AS manual_cc,
            SUM(type = 'cc' AND added_manually = 1 AND notified_at IS NULL) AS pending_manual_notifications
         FROM conversation_participants`
    );
    const summary = summaryRows[0] || {};

    console.log('Participant summary:');
    console.log(`- total participants: ${summary.total_participants || 0}`);
    console.log(`- total cc: ${summary.total_cc || 0}`);
    console.log(`- manual cc: ${summary.manual_cc || 0}`);
    console.log(`- pending manual notifications: ${summary.pending_manual_notifications || 0}`);

    const [sampleRows] = await pool.query(
        `SELECT t.ticket_number, c.id AS conversation_id, cp.email, cp.added_manually, cp.notified_at
         FROM conversation_participants cp
         JOIN conversations c ON c.id = cp.conversation_id
         JOIN tickets t ON t.id = c.ticket_id
         WHERE cp.type = 'cc'
         ORDER BY cp.created_at DESC
         LIMIT 10`
    );

    if (sampleRows.length) {
        console.log('Recent CC participants:');
        sampleRows.forEach(row => {
            console.log(`- ${row.ticket_number} conv=${row.conversation_id} ${row.email} manual=${row.added_manually} notified=${row.notified_at || 'NULL'}`);
        });
    } else {
        console.log('Recent CC participants: none');
    }

    const [emailConversationRows] = await pool.query(
        `SELECT
            COUNT(*) AS email_conversations,
            SUM(root_message_id IS NOT NULL) AS threaded_email_conversations
         FROM conversations
         WHERE source_channel = 'email'`
    );
    const emailSummary = emailConversationRows[0] || {};
    console.log('Email conversation summary:');
    console.log(`- email conversations: ${emailSummary.email_conversations || 0}`);
    console.log(`- with root_message_id: ${emailSummary.threaded_email_conversations || 0}`);

    console.log('Result: SAFE schema/read-model check passed.\n');
}

main()
    .catch(err => {
        console.error(`Manual CC debug failed: ${err.message}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        try {
            await connectDB().end();
        } catch {}
    });
