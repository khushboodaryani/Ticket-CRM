const mysql = require('mysql2/promise');

async function checkLiveSchema() {
  const connection = await mysql.createConnection({
    host: '181.214.10.244',
    user: 'root',
    password: 'WELcome@123',
    database: 'ticket_crm'
  });

  console.log('✅ Connected to LIVE MySQL (244)');

  try {
    // 1. Check conversations table
    const [convCols] = await connection.query('DESCRIBE conversations');
    const hasCC = convCols.some(col => col.Field === 'cc_emails');
    console.log(hasCC ? '✅ cc_emails exists' : '❌ cc_emails MISSING');

    // 2. Check conversation_messages table
    const [msgCols] = await connection.query('DESCRIBE conversation_messages');
    const hasSenderName = msgCols.some(col => col.Field === 'sender_name');
    console.log(hasSenderName ? '✅ sender_name exists' : '❌ sender_name MISSING');

    // 3. Check indexes
    const [indexes] = await connection.query('SHOW INDEX FROM conversations');
    const hasPartIdx = indexes.some(idx => idx.Key_name === 'idx_conv_participant');
    console.log(hasPartIdx ? '✅ idx_conv_participant exists' : '❌ idx_conv_participant MISSING');

    const [msgIndexes] = await connection.query('SHOW INDEX FROM conversation_messages');
    const hasMsgIdx = msgIndexes.some(idx => idx.Key_name === 'idx_msg_body_recent');
    console.log(hasMsgIdx ? '✅ idx_msg_body_recent exists' : '❌ idx_msg_body_recent MISSING');

  } catch (err) {
    console.error('❌ Live check failed:', err.message);
  } finally {
    await connection.end();
  }
}

checkLiveSchema();
