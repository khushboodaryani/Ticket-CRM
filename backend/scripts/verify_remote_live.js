import 'colors';
import mysql from 'mysql2/promise';
import { transporter } from '../src/services/mailTransport.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * REMOTE LIVE SERVER VERIFICATION SCRIPT
 * Specifically checks the server: 181.214.10.244
 */
async function verifyLiveServer() {
    console.log('\n--- 🌐 Remote Live Server Audit (181.214.10.244) ---\n'.cyan.bold);

    const config = {
        host: '181.214.10.244',
        user: 'root',
        password: 'WELcome@123',
        database: 'ticket_crm'
    };

    let connection;
    try {
        connection = await mysql.createConnection(config);
        console.log('   ✅ MySQL Connectivity: OK'.green);

        // 1. Check Schema Synchronization
        console.log('\n1. Schema Validation...'.yellow);
        const [ticketsCols] = await connection.query("SHOW COLUMNS FROM tickets");
        const colNames = ticketsCols.map(c => c.Field);
        const requiredCols = ['workflow_processed', 'assignment_source', 'priority_id', 'sla_policy_id', 'sla_version'];
        
        requiredCols.forEach(col => {
            if (colNames.includes(col)) {
                console.log(`      ✅ Column 'tickets.${col}': EXISTS`.green);
            } else {
                console.log(`      ❌ Column 'tickets.${col}': MISSING`.red);
            }
        });

        // 2. Check SLA Enum (The most important check)
        const [slaCols] = await connection.query("SHOW COLUMNS FROM sla_event_logs WHERE Field = 'event_type'");
        const enumType = slaCols[0]?.Type || '';
        if (enumType.includes('pre_breach_warning') && enumType.includes('first_response_breach')) {
            console.log('      ✅ SLA Event Enum: FULLY SYNCED (pre_breach_warning included)'.green);
        } else {
            console.log('      ❌ SLA Event Enum: OUTDATED (Missing pre_breach_warning)'.red.bold);
            console.log(`         Current: ${enumType}`.gray);
        }

        // 3. Check System Settings
        console.log('\n2. System Settings Audit...'.yellow);
        const [settings] = await connection.query("SELECT setting_key, setting_value FROM system_settings");
        const settingsMap = Object.fromEntries(settings.map(s => [s.setting_key, s.setting_value]));
        
        ['DEFAULT_QUEUE_ID', 'EMAIL_POLLER_LAST_UID'].forEach(key => {
            if (settingsMap[key]) {
                console.log(`      ✅ Setting '${key}': ${settingsMap[key]}`.green);
            } else {
                console.log(`      ⚠️ Setting '${key}': NOT SEEDED`.yellow);
            }
        });

        // 4. Critical Tables Check
        console.log('\n3. Support Tables check...'.yellow);
        const tablesToCheck = ['priorities', 'priority_sequences', 'sla_policies_new', 'workflow_rules'];
        const [tables] = await connection.query("SHOW TABLES");
        const existingTables = tables.map(t => Object.values(t)[0]);
        
        tablesToCheck.forEach(tbl => {
            if (existingTables.includes(tbl)) {
                console.log(`      ✅ Table '${tbl}': EXISTS`.green);
            } else {
                console.log(`      ❌ Table '${tbl}': MISSING`.red);
            }
        });

    } catch (err) {
        console.log(`   ❌ Remote Error: ${err.message}`.red);
    } finally {
        if (connection) await connection.end();
    }

    console.log('\n--- 🏁 Audit Complete ---\n'.cyan.bold);
}

verifyLiveServer();
