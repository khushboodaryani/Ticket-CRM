-- disable email notification it won't notifiy the sender and reciever while ticket lifecycle remain same

INSERT INTO system_settings (setting_key, setting_value) 
VALUES ('DISABLE_OUTBOUND_EMAILS', 'true') 
ON DUPLICATE KEY UPDATE setting_value = 'true';

-- enable email notification so customer will notify for the ticket update , ensure no backlog or pause email notification
UPDATE system_settings SET setting_value = 'false' 
WHERE setting_key = 'DISABLE_OUTBOUND_EMAILS';
