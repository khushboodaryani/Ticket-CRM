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
 * Send notification to customer about new ticket — includes conversation trail
 */
export const sendTicketNotification = async (ticket, customerEmail) => {
    if (!customerEmail) return;

    const pool = connectDB();
    const formattedDescription = ticket.description
        ? ticket.description.replace(/\n/g, '<br/>').replace(/\*/g, '')
        : '';

    const messageId = `<${ticket.ticket_number}@ticketcrm.local>`;

    // Fetch the trail (will show the 'created' activity event + original description message)
    const trailHtml = ticket.id ? await getConversationTrailHtml(pool, ticket.id) : '';

    const mailOptions = {
        from: `"Ticket CRM" <${process.env.EMAIL_USER}>`,
        to: customerEmail,
        subject: `[${ticket.ticket_number}] ${ticket.category}`,
        headers: {
            'Message-ID': messageId,
        },
        html: `
      <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 680px; margin: 0 auto;">
        <h2 style="color: #4f8ef7; margin-bottom: 4px;">Ticket Acknowledgement</h2>
        <p style="color: #64748b; margin-top: 0;">Your request has been received (Ticket ${ticket.ticket_number}). Our team will respond shortly.</p>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b; width:40%"><strong>Ticket Number</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.ticket_number}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>Category</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.category}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>Priority</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.priority}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>ETR (Deadline)</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.etr}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b; vertical-align:top"><strong>Description</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee; white-space: pre-wrap;">${formattedDescription}</td></tr>
        </table>

        <p style="font-size: 13px; color: #666;">
          To reply or add more details, simply respond to this email — your message will automatically be added to the ticket.
        </p>

        ${trailHtml}

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;"/>
        <p style="font-size: 12px; color: #999;">Regards,<br/><strong>Team Multycomm</strong></p>
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
        subject: `Re: [${ticket.ticket_number}] ${ticket.category}`,
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

/**
 * Send Welcome Email to newly created staff/user
 */
export const sendWelcomeEmail = async (user, plainPassword, resetLink) => {
    if (!user.email) return;

    const mailOptions = {
        from: `"Ticket CRM Admin" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: `Welcome to Ticket CRM, ${user.name}!`,
        html: `
      <div style="font-family: sans-serif; padding: 30px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #4f8ef7; margin-bottom: 20px;">Welcome to the Team!</h2>
        <p>Hello <strong>${user.name}</strong>,</p>
        <p>Your account has been created successfully. You can now log in to the Ticket CRM using the credentials below:</p>
        
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 6px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0;"><strong>Login URL:</strong> <a href="${process.env.FRONTEND_URL}/login">${process.env.FRONTEND_URL}/login</a></p>
          <p style="margin: 0 0 10px 0;"><strong>Email:</strong> ${user.email}</p>
          <p style="margin: 0;"><strong>Temporary Password:</strong> <code style="background: #e2e8f0; padding: 2px 4px; border-radius: 4px;">${plainPassword}</code></p>
        </div>

        <p style="color: #ef4444; font-weight: bold;">Important Security Step:</p>
        <p>For security reasons, please click the button below to reset your password immediately:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #4f8ef7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Your Password</a>
        </div>

        <p style="font-size: 13px; color: #64748b;">
          If the button above doesn't work, copy and paste this link into your browser:<br/>
          <span style="word-break: break-all;">${resetLink}</span>
        </p>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;"/>
        <p style="font-size: 12px; color: #94a3b8; text-align: center;">
          Sent by Ticket CRM System<br/>
          &copy; ${new Date().getFullYear()} Multycomm
        </p>
      </div>
    `
    };

    try {
        await transporter.sendMail(mailOptions);
        logger.info(`📧 Welcome email sent to ${user.email}`);
    } catch (error) {
        logger.error(`❌ Failed to send welcome email to ${user.email}: ${error.message}`);
    }
};
