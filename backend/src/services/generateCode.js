import connectDB from '../db/index.js';

export const generateCode = async (pool, entityType) => {
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
        const threadId = connection.threadId || connection.connectionId;

        const [rows] = await connection.query(
            'SELECT * FROM code_sequences WHERE entity_type = ? FOR UPDATE',
            [entityType]
        );

        if (rows.length === 0) {
            throw new Error(`Sequence mapping for '${entityType}' not found.`);
        }

        const seq = rows[0];
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`; // Local date string

        let nextValue = seq.current_value + 1;

        // SAFE DATE EXTRACTION WITHOUT TIMEZONE SHIFT .toISOString()
        const dbDate = new Date(seq.last_date);
        const dbYear = dbDate.getFullYear();
        const dbMonth = String(dbDate.getMonth() + 1).padStart(2, '0');
        const dbDay = String(dbDate.getDate()).padStart(2, '0');
        const lastDateStr = `${dbYear}-${dbMonth}-${dbDay}`;

        console.log(`[generateCode] Thread ${threadId} for ${entityType}: read value=${seq.current_value}, lastDate=${lastDateStr}, today=${todayStr}`);

        if (lastDateStr !== todayStr) {
            nextValue = 1; // Reset to 1 for new day
            console.log(`[generateCode] Thread ${threadId} DATE CHANGED (${lastDateStr} -> ${todayStr}). Resetting count to 1.`);
        }

        await connection.query(
            'UPDATE code_sequences SET current_value = ?, last_date = ? WHERE entity_type = ?',
            [nextValue, todayStr, entityType]
        );

        const paddedNum = String(nextValue).padStart(4, '0');
        const generatedCode = `${seq.prefix}-${year}${month}${day}-${paddedNum}`;

        await connection.commit();
        console.log(`[generateCode] Thread ${threadId} generated: ${generatedCode}`);

        return generatedCode;

    } catch (error) {
        await connection.rollback();
        console.error(`[generateCode] Error generating code:`, error);
        throw error;
    } finally {
        connection.release();
    }
};
