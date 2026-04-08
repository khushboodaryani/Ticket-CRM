const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

async function queryMessages() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'Ayan@1012',
    database: process.env.MYSQL_DATABASE || 'ticket_crm'
  });

  try {
    const ticketNumber = 'TKT-20260408-0026';
    const [tickets] = await connection.query('SELECT id FROM tickets WHERE ticket_number = ?', [ticketNumber]);
    if (!tickets.length) { console.log('Ticket not found'); return; }
    const tId = tickets[0].id;
    
    const [convs] = await connection.query('SELECT id FROM conversations WHERE ticket_id = ?', [tId]);
    const cIds = convs.map(c => c.id);
    
    const [msgs] = await connection.query(
      `SELECT cm.id, cm.conversation_id, cm.sender_type, cm.sender_name, cm.message_body, cm.created_at 
       FROM conversation_messages cm 
       WHERE cm.conversation_id IN (?) 
       ORDER BY cm.created_at ASC`,
      [cIds]
    );
    
    console.log('--- MESSAGES FOR TKT-0026 ---');
    msgs.forEach(m => {
      console.log(`[${m.created_at}] ${m.sender_type} (${m.sender_name}): ${m.message_body.substring(0, 50)}...`);
    });
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await connection.end();
  }
}

queryMessages();
