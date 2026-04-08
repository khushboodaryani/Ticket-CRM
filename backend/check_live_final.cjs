const mysql = require('mysql2/promise');

async function checkLiveStatus() {
  const connection = await mysql.createConnection({
    host: '181.214.10.244',
    user: 'root',
    password: 'WELcome@123',
    database: 'ticket_crm'
  });

  console.log('🔍 ANALYZING LIVE SERVER (181.214.10.244)...');

  try {
    const results = [];

    // 1. Check conversation_messages (sender_name)
    const [msgCols] = await connection.query('DESCRIBE conversation_messages');
    const hasSenderName = msgCols.some(col => col.Field === 'sender_name');
    results.push({ feature: 'Email Threading (sender_name)', status: hasSenderName });

    // 2. Check users (is_online)
    const [userCols] = await connection.query('DESCRIBE users');
    const hasIsOnline = userCols.some(col => col.Field === 'is_online');
    results.push({ feature: 'Online Presence (is_online)', status: hasIsOnline });

    // 3. Check agent_shifts table
    const [tables] = await connection.query('SHOW TABLES');
    const tableList = tables.map(t => Object.values(t)[0]);
    const hasShiftsTable = tableList.includes('agent_shifts');
    const hasUserShiftsTable = tableList.includes('user_shifts');
    
    results.push({ feature: 'Shift System (agent_shifts table)', status: hasShiftsTable });
    results.push({ feature: 'User Assignment (user_shifts table)', status: hasUserShiftsTable });

    console.log('\n--- LIVE STATUS REPORT ---');
    results.forEach(res => {
        console.log(`${res.status ? '✅' : '❌'} ${res.feature}`);
    });

  } catch (err) {
    console.error('❌ Live analysis failed:', err.message);
  } finally {
    await connection.end();
  }
}

checkLiveStatus();
