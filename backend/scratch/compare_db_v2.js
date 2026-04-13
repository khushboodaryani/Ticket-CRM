// scratch/compare_db_v2.js
import mysql from 'mysql2/promise';

const localConfig = {
    host: 'localhost',
    user: 'root',
    password: 'Ayan@1012',
    database: 'ticket_crm'
};

const remoteConfig = {
    host: '181.214.10.244',
    user: 'root',
    password: 'WELcome@123',
    database: 'ticket_crm'
};

async function getTables(conn, dbName) {
    const [tables] = await conn.query(`SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = ?`, [dbName]);
    const schema = {};
    for (const table of tables) {
        const tableName = table.TABLE_NAME;
        const [columns] = await conn.query(`DESCRIBE ??`, [tableName]);
        schema[tableName] = columns;
    }
    return schema;
}

async function run() {
    let localConn, remoteConn;
    try {
        console.log('Connecting to local DB...');
        localConn = await mysql.createConnection(localConfig);
        const localSchema = await getTables(localConn, 'ticket_crm');

        console.log('Connecting to remote DB (181.214.10.244)...');
        remoteConn = await mysql.createConnection(remoteConfig);
        const remoteSchema = await getTables(remoteConn, 'ticket_crm');

        console.log('\n--- Comparison Results ---');
        
        const localTables = Object.keys(localSchema);
        const remoteTables = Object.keys(remoteSchema);

        console.log('\nMissing Tables on Remote:');
        localTables.filter(t => !remoteTables.includes(t)).forEach(t => console.log(`- ${t}`));

        console.log('\nTable Column Differences:');
        for (const table of localTables) {
            if (remoteSchema[table]) {
                const localCols = localSchema[table].map(c => c.Field);
                const remoteCols = remoteSchema[table].map(c => c.Field);

                const missing = localCols.filter(c => !remoteCols.includes(c));
                if (missing.length > 0) {
                    console.log(`Table ${table} missing columns: ${missing.join(', ')}`);
                }
            }
        }

    } catch (err) {
        console.error('Error:', err.message);
        if (err.message.includes('Unknown database')) {
            console.log('Database "ticket_crm" might not exist on remote. Checking available databases...');
            try {
                const tempConn = await mysql.createConnection({
                    host: '181.214.10.244',
                    user: 'root',
                    password: 'WELcome@123'
                });
                const [dbs] = await tempConn.query('SHOW DATABASES');
                console.log('Available databases on remote:', dbs.map(d => d.Database).join(', '));
                await tempConn.end();
            } catch (inner) {
                console.error('Failed to list databases:', inner.message);
            }
        }
    } finally {
        if (localConn) await localConn.end();
        if (remoteConn) await remoteConn.end();
    }
}

run();
