import connectDB from './src/db/index.js';
import { send, getConversationTrailHtml } from './src/modules/conversations/adapters/emailAdapter.js';

import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const customerEmail = "work.khushboodaryani@gmail.com";
  const data = {
    ticketId: 328,
    senderId: 1, // Superadmin
    message: "This is a test agent reply from the panel. The trail should be below it."
  };
  try {
    const pool = connectDB();
    const trail = await getConversationTrailHtml(pool, data.ticketId);
    console.log("TRAIL LENGTH:", trail.length);
    console.log("== TRAIL HTML START ==");
    console.log(trail.slice(0, 600));
    console.log("== TRAIL HTML END ==");
    
    await send(customerEmail, data);
    console.log("Email sent and recorded successfully!");
    process.exit(0);
  } catch(err) {
    console.error("Error:", err);
    process.exit(1);
  }
}
run();
