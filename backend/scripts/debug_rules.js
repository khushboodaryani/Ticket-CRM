
import connectDB from "../src/db/index.js";
import { evaluateConditions } from "../src/modules/workflows/workflowEngine.js";

async function debug() {
    const pool = connectDB();
    const [rules] = await pool.query("SELECT * FROM workflow_rules WHERE id = 4");
    const rule = rules[0];
    
    console.log("Rule ID:", rule.id);
    console.log("Rule Name:", rule.name);
    console.log("Conditions (RAW):", rule.conditions);
    
    let parsedConditions = rule.conditions;
    if (typeof parsedConditions === 'string') {
        parsedConditions = JSON.parse(parsedConditions);
    }
    console.log("Parsed Conditions:", parsedConditions);

    const payload = {
        priority: 'R2',
        status: 'open',
        source: 'email'
    };
    
    console.log("Test Payload:", payload);
    
    // Test the specific evaluateConditions function
    const isMatch = (conditions, payload) => {
        if (!conditions || Object.keys(conditions).length === 0) return true;
        for (const [key, expected] of Object.entries(conditions)) {
            const actual = payload[key];
            console.log(`Checking key: ${key}, Expected: ${expected} (${typeof expected}), Actual: ${actual} (${typeof actual})`);
            if (actual !== expected) return false;
        }
        return true;
    };

    const matchResult = isMatch(parsedConditions, payload);
    console.log("Match Result:", matchResult);
    
    process.exit(0);
}

debug();
