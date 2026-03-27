// modules/notifications/emailService.js
import nodemailer from 'nodemailer';
import { logger } from '../../logger.js';
import connectDB from '../../db/index.js';
import { getConversationTrailHtml } from '../conversations/adapters/emailAdapter.js';

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

/**
 * Send notification to customer about new ticket
 */
export const sendTicketNotification = async (ticket, customerEmail) => {
    if (!customerEmail) return;

    const formattedDescription = ticket.description
        ? ticket.description.replace(/\n/g, '<br/>').replace(/\*/g, '')
        : '';

    const messageId = `<${ticket.ticket_number}@ticketcrm.local>`;
    
    const mailOptions = {
        from: `"Ticket CRM" <${process.env.EMAIL_USER}>`,
        to: customerEmail,
        subject: `[${ticket.ticket_number}] Ticket Created: ${ticket.category}`,
        headers: {
            'Message-ID': messageId,
        },
        html: `
      <div style="font-family: sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #4f8ef7;">Ticket Created Successfully</h2>
        <p>Hello,</p>
        <p>Your ticket has been created in our system. Our team will look into it shortly.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Ticket Number:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.ticket_number}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Priority:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.priority}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; vertical-align: top;"><strong>Description:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee; white-space: pre-wrap; font-family: inherit;">${formattedDescription}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>ETR (Estimated Resolution):</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.etr}</td></tr>
        </table>
        <p>Regards,<br/>Team Multycomm</p>
      </div>
    `
    };

    try {
        await transporter.sendMail(mailOptions);
        logger.info(`📧 Notification email sent to ${customerEmail} for ticket ${ticket.ticket_number}`);
    } catch (error) {
        logger.error(`❌ Failed to send notification email: ${error.message}`);
    }
};

/**
 * Send notification to customer about ticket status update
 */
export const sendTicketStatusNotification = async (ticket, customerEmail, newStatus) => {
    if (!customerEmail) return;

    const pool = connectDB();
    const trailHtml = await getConversationTrailHtml(pool, ticket.id);

    const statusLabel = newStatus.replace('_', ' ').toUpperCase();
    const threadId = `<${ticket.ticket_number}@ticketcrm.local>`;

    const mailOptions = {
        from: `"Ticket CRM" <${process.env.EMAIL_USER}>`,
        to: customerEmail,
        subject: `[${ticket.ticket_number}] Status Update: ${ticket.category}`,
        headers: {
            'In-Reply-To': threadId,
            'References': threadId,
        },
        html: `
      <div style="font-family: sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #4f8ef7;">Ticket Status Updated</h2>
        <p>Hello,</p>
        <p>Your ticket **${ticket.ticket_number}** has been updated to <strong>${statusLabel}</strong>.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Ticket Number:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.ticket_number}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Subject:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.category}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>New Status:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${statusLabel}</td></tr>
        </table>
        ${trailHtml}
        <p>Regards,<br/>Team Multycomm</p>
      </div>
    `
    };

    try {
        await transporter.sendMail(mailOptions);
        logger.info(`📧 Status update email sent to ${customerEmail} for ticket ${ticket.ticket_number}`);
    } catch (error) {
        logger.error(`❌ Failed to send status update email: ${error.message}`);
    }
};

/**
 * Send Emergency Broadcast to all active users (In-App, WebSocket, Email)
 */
export const sendEmergencyBroadcast = async (ticket) => {
    const pool = connectDB();
    try {
        // Fetch all active staff
        const [users] = await pool.query(`SELECT id, email, name FROM users WHERE is_active = 1`);
        
        // 1. WebSocket Broadcast
        try {
            const { getIO } = await import('../../services/socketService.js');
            const io = getIO();
            if (io) {
                io.emit('emergency_alert', {
                    ticket_id: ticket.id || null,
                    ticket_number: ticket.ticket_number,
                    category: ticket.category,
                    priority: ticket.priority,
                    message: "🚨 EMERGENCY: P1 Ticket Created!"
                });
                logger.info(`📡 WebSocket emergency_alert emitted to all connected clients`);
            } else {
                logger.warn(`⚠️ Socket.io instance is NULL — emergency_alert NOT emitted`);
            }
        } catch (err) { logger.warn(`Emergency socket failed: ${err.message}`); }

        // 2. In-App Notifications
        try {
            const { createNotification } = await import('./notificationController.js');
            for (const user of users) {
                await createNotification(pool, {
                    user_id: user.id,
                    type: 'emergency',
                    title: `🚨 EMERGENCY: ${ticket.ticket_number}`,
                    body: `P1 Ticket Created: ${ticket.category}. Please check immediately.`,
                    entity_id: ticket.id || null
                });
            }
        } catch (err) { logger.warn(`Emergency db notification failed: ${err.message}`); }

        // 3. Email Blast
        const emails = users.map(u => u.email).filter(Boolean);
        if (emails.length > 0) {
            const mailOptions = {
                from: `"Ticket CRM Emergency" <${process.env.EMAIL_USER}>`,
                bcc: emails.join(','), // BCC to not expose everyone's email and keep headers clean
                subject: `🚨 EMERGENCY P1 TICKET: [${ticket.ticket_number}] ${ticket.category}`,
                html: `
                  <div style="font-family: sans-serif; padding: 20px; color: #333; border: 2px solid red;">
                    <h2 style="color: red;">🚨 EMERGENCY DETECTED</h2>
                    <p>A new priority P1 ticket has been created and requires immediate attention.</p>
                    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                      <tr><td style="padding: 8px; border-bottom: 1px solid #ccc;"><strong>Ticket Number:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ccc;">${ticket.ticket_number}</td></tr>
                      <tr><td style="padding: 8px; border-bottom: 1px solid #ccc;"><strong>Subject:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ccc;">${ticket.category}</td></tr>
                      <tr><td style="padding: 8px; border-bottom: 1px solid #ccc;"><strong>Description:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ccc;">${ticket.description || "N/A"}</td></tr>
                    </table>
                    <p>Please log in to the portal and claim this ticket immediately to begin resolution.</p>
                  </div>
                `
            };
            await transporter.sendMail(mailOptions);
            logger.info(`📧 Emergency broadcast email sent to ${emails.length} users.`);
        }
    } catch (err) {
        logger.error(`❌ Failed to send emergency broadcast: ${err.message}`);
    }
};

/**
 * Send Emergency Claimed Broadcast to all active users to stand down
 */
export const sendEmergencyClaimedBroadcast = async (ticket, claimedByName) => {
    logger.info(`📢 Starting Stand-Down Broadcast for ${ticket.ticket_number} claimed by ${claimedByName}`);
    const pool = connectDB();
    try {
        const [users] = await pool.query(`SELECT id, email, name FROM users WHERE is_active = 1`);
        logger.info(`   -> Found ${users.length} active users to notify.`);

        // 1. In-App Notifications
        try {
            const { createNotification } = await import('./notificationController.js');
            for (const user of users) {
                await createNotification(pool, {
                    user_id: user.id,
                    type: 'info',
                    title: `✅ UPDATE: Emergency Ticket Claimed`,
                    body: `The P1 Ticket ${ticket.ticket_number} has been claimed by ${claimedByName}.`,
                    entity_id: ticket.id || null
                });
            }
            logger.info(`   -> In-App Notifications created for all users.`);
        } catch (err) { logger.warn(`Emergency claim notification failed: ${err.message}`); }

        // 2. Email Blast
        const emails = users.map(u => u.email).filter(Boolean);
        if (emails.length > 0) {
            logger.info(`   -> Sending Stand-Down Email Blast to ${emails.length} recipients...`);
            const mailOptions = {
                from: `"Ticket CRM Support" <${process.env.EMAIL_USER}>`,
                bcc: emails.join(','),
                subject: `✅ UPDATE - P1 TICKET CLAIMED: [${ticket.ticket_number}]`,
                html: `
                  <div style="font-family: sans-serif; padding: 20px; color: #333; border: 2px solid #16a34a; background-color: #f0fdf4;">
                    <h2 style="color: #16a34a;">✅ EMERGENCY CLAIMED - STAND DOWN</h2>
                    <p>The P1 emergency ticket <strong>${ticket.ticket_number}</strong> has been successfully claimed by <strong>${claimedByName}</strong>.</p>
                    <p>No further action is required from the rest of the team at this time. You may resume your normal activities.</p>
                    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                      <tr><td style="padding: 8px; border-bottom: 1px solid #ccc;"><strong>Ticket Number:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ccc;">${ticket.ticket_number}</td></tr>
                      <tr><td style="padding: 8px; border-bottom: 1px solid #ccc;"><strong>Subject:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ccc;">${ticket.category}</td></tr>
                      <tr><td style="padding: 8px; border-bottom: 1px solid #ccc;"><strong>Claimed By:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ccc;">${claimedByName}</td></tr>
                    </table>
                  </div>
                `
            };
            await transporter.sendMail(mailOptions);
            logger.info(`📧 Emergency Claimed broadcast email sent to ${emails.length} users.`);
        }
    } catch (err) {
        logger.error(`❌ Failed to send emergency claimed broadcast: ${err.message}`);
    }
};
