CREATE TABLE IF NOT EXISTS notification_templates (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  template_key     VARCHAR(64) NOT NULL UNIQUE,
  name             VARCHAR(120) NOT NULL,
  description      VARCHAR(255) NULL,
  subject_template VARCHAR(255) NOT NULL,
  body_html        MEDIUMTEXT NOT NULL,
  is_active        TINYINT(1) NOT NULL DEFAULT 1,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO notification_templates (template_key, name, description, subject_template, body_html, is_active)
VALUES
(
  'ticket_acknowledgement',
  'Ticket Acknowledgement',
  'Sent when a new ticket is created and acknowledged to the customer.',
  '[{{ticket_number}}] {{ticket_subject}}',
  '<div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 680px; margin: 0 auto;">
    <h2 style="color: #4f8ef7; margin-bottom: 4px;">Ticket Acknowledgement</h2>
    <p style="color: #64748b; margin-top: 0;">Your request has been received (Ticket {{ticket_number}}). Our team will respond shortly.</p>
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;">
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b; width:40%"><strong>Ticket Number</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{{ticket_number}}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>Category</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{{category}}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>Priority</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{{priority}}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>First Response Target</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{{first_response_target}}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>ETR (Deadline)</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{{etr}}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b; vertical-align:top"><strong>Description</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee; white-space: pre-wrap;">{{description_html}}</td></tr>
    </table>
    <p style="font-size: 13px; color: #666;">To reply or add more details, simply respond to this email - your message will automatically be added to the ticket.</p>
    {{conversation_trail_html}}
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;"/>
    <p style="font-size: 12px; color: #999;">Regards,<br/><strong>{{company_name}}</strong></p>
  </div>',
  1
),
(
  'ticket_assignment',
  'Ticket Assignment',
  'Sent when a ticket is assigned or reassigned to an owner.',
  'Re: [{{ticket_number}}] {{ticket_subject}}',
  '<div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 680px; margin: 0 auto;">
    <h2 style="color: #4f8ef7; margin-bottom: 4px;">Agent Assigned to Your Ticket</h2>
    <p style="color: #64748b; margin-top: 0;">Good news! Your support request has been assigned to a team member.</p>
    <div style="background:#f0fdf4; padding: 15px; border-radius:8px; border:1px solid #bbf7d0; margin: 20px 0;">
      <p style="margin:0; font-size:14px; color:#166534;"><strong>{{assigned_to_name}}</strong> has been assigned to handle your ticket <strong>{{ticket_number}}</strong>.</p>
    </div>
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;">
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b; width:40%"><strong>Ticket Number</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{{ticket_number}}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>Subject</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{{ticket_subject}}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>Assigned To</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{{assigned_to_name}}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>ETR (Deadline)</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{{etr}}</td></tr>
    </table>
    <p style="font-size: 13px; color: #666;">To add more details, simply reply to this email.</p>
    {{conversation_trail_html}}
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;"/>
    <p style="font-size: 12px; color: #999;">Regards,<br/><strong>{{company_name}}</strong></p>
  </div>',
  1
),
(
  'sla_breach',
  'SLA Breach',
  'Sent when a ticket breaches the configured resolution SLA.',
  'Re: [{{ticket_number}}] {{ticket_subject}} - Escalated',
  '<div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 680px; margin: 0 auto;">
    <h2 style="color: #dc2626; margin-bottom: 4px;">Ticket Escalated</h2>
    <p style="color: #64748b; margin-top: 0;">We sincerely apologize - your support request has exceeded its expected resolution time.</p>
    <div style="background:#fef2f2; padding: 15px; border-radius:8px; border:1px solid #fecaca; margin: 20px 0;">
      <p style="margin:0; font-size:14px; color:#991b1b;">Your ticket <strong>{{ticket_number}}</strong> has been automatically escalated for priority resolution.</p>
    </div>
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;">
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b; width:40%"><strong>Ticket Number</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{{ticket_number}}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>Subject</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{{ticket_subject}}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>Priority</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{{priority}}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>Assigned To</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{{assigned_to_name}}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>Original Deadline</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{{etr}}</td></tr>
    </table>
    <p style="font-size: 13px; color: #666;">We are working to resolve your issue as quickly as possible.</p>
    {{conversation_trail_html}}
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;"/>
    <p style="font-size: 12px; color: #999;">Regards,<br/><strong>{{company_name}}</strong></p>
  </div>',
  1
)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  subject_template = subject_template,
  body_html = body_html,
  is_active = is_active;
