// scratch/db_version.js
import mysql from 'mysql2/promise';

const remoteConfig = {
    host: '181.214.10.244',
    user: 'root',
    password: 'WELcome@123',
    database: 'ticket_crm'
};

async function checkVersion() {
    try {
        const conn = await mysql.createConnection(remoteConfig);
        const [rows] = await conn.query('SELECT VERSION() as version');
        console.log('Remote MySQL Version:', rows[0].version);
        await conn.end();
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        process.exit();
    }
}

checkVersion();
