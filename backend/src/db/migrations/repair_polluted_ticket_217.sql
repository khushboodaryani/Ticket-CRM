-- Repair script for Ticket 217 (Portal Access), polluted by the
-- Security/Vulnerabilities thread that belongs on Q-00152.
--
-- Confirmed polluted messages to move to Q-00152:
--   536, 543, 544, 545, 549
--
-- Confirmed Ticket 217 messages to leave alone:
--   531, 532, 533
--
-- Run this in two passes:
--   1. Run the preview section and verify the output.
--   2. Stop the email poller/worker, uncomment the repair block, and run again.

SET @polluted_ticket_id = 217;
SET @target_ticket_number = 'Q-00152';

-- Resolve the source and target records.
SELECT @polluted_conversation_id := c.id
FROM conversations c
WHERE c.ticket_id = @polluted_ticket_id
ORDER BY c.id
LIMIT 1;

SELECT @target_ticket_id := t.id
FROM tickets t
WHERE t.ticket_number = @target_ticket_number
LIMIT 1;

SELECT @target_conversation_id := c.id
FROM conversations c
WHERE c.ticket_id = @target_ticket_id
  AND c.source_channel = 'email'
ORDER BY c.id
LIMIT 1;

-- Sanity check: all IDs except target_conversation_id must be non-null.
-- target_conversation_id may be null during preview; the repair block creates it.
SELECT
  @polluted_ticket_id AS polluted_ticket_id,
  @polluted_conversation_id AS polluted_conversation_id,
  @target_ticket_id AS target_ticket_id,
  @target_conversation_id AS target_conversation_id;

CREATE TEMPORARY TABLE repair_message_ids (
  id INT UNSIGNED PRIMARY KEY
);

INSERT INTO repair_message_ids (id) VALUES
  (536),
  (543),
  (544),
  (545),
  (549);

CREATE TEMPORARY TABLE repair_participant_emails (
  email VARCHAR(255) PRIMARY KEY
);

-- These people were added to Ticket 217 by the polluted Security thread.
-- Aveek and Meenakshi are intentionally not listed because they may
-- legitimately belong on both tickets.
INSERT INTO repair_participant_emails (email) VALUES
  ('anish.r@shamsfz.ae'),
  ('ayan@multycomm.com'),
  ('chayma.belfquih@auditec.ma'),
  ('deepak@multycomm.com'),
  ('faisal.a@shamsfz.ae'),
  ('haytham.a@shamsfz.ae'),
  ('it@shamsfz.ae'),
  ('majed.alsuwaidi@shams.ae'),
  ('ned@multycomm.com'),
  ('sanjiev.a@shamsfz.ae'),
  ('tanya.chopra@meydanfz.ae'),
  ('vikas.gupta@ocube.ooo'),
  ('zouhair.gharsa@crm4you.io'),
  ('ismail.benomar@auditec.ma');

-- ---------------------------------------------------------------------
-- PREVIEW: safe, read-only checks.
-- ---------------------------------------------------------------------

SELECT 'messages_to_move' AS preview,
       cm.id,
       cm.conversation_id,
       cm.sender_name,
       cm.created_at,
       LEFT(cm.message_body, 120) AS body_preview
FROM conversation_messages cm
JOIN repair_message_ids r ON r.id = cm.id
WHERE cm.conversation_id = @polluted_conversation_id;

-- This must return zero rows. If it returns rows, a listed message is not
-- currently on Ticket 217 and the repair block will leave it untouched.
SELECT 'listed_messages_not_on_polluted_ticket' AS preview,
       r.id AS message_id
FROM repair_message_ids r
LEFT JOIN conversation_messages cm
  ON cm.id = r.id
 AND cm.conversation_id = @polluted_conversation_id
WHERE cm.id IS NULL;

SELECT 'participants_to_remove_from_217' AS preview,
       cp.conversation_id,
       cp.email,
       cp.type
FROM conversation_participants cp
JOIN repair_participant_emails r ON r.email = cp.email
WHERE cp.conversation_id = @polluted_conversation_id;

SELECT 'remaining_217_participants_after_repair' AS preview,
       cp.email,
       cp.type
FROM conversation_participants cp
WHERE cp.conversation_id = @polluted_conversation_id
  AND NOT EXISTS (
    SELECT 1
    FROM repair_participant_emails r
    WHERE r.email = cp.email
  )
ORDER BY cp.email;

-- ---------------------------------------------------------------------
-- ACTUAL REPAIR: uncomment only after verifying the preview.
-- ---------------------------------------------------------------------
-- START TRANSACTION;
--
-- -- Create an email conversation for Q-00152 if it does not have one.
-- SELECT LAST_INSERT_ID(0);
--
-- INSERT INTO conversations (ticket_id, source_channel)
-- SELECT @target_ticket_id, 'email'
-- WHERE @target_ticket_id IS NOT NULL
--   AND @target_conversation_id IS NULL;
--
-- SET @target_conversation_id = COALESCE(@target_conversation_id, NULLIF(LAST_INSERT_ID(), 0));
-- SET @repair_ready = (
--   @polluted_conversation_id IS NOT NULL
--   AND @target_ticket_id IS NOT NULL
--   AND @target_conversation_id IS NOT NULL
-- );
--
-- -- Move only the listed messages that are still on Ticket 217.
-- UPDATE conversation_messages cm
-- JOIN repair_message_ids r ON r.id = cm.id
-- SET cm.conversation_id = @target_conversation_id
-- WHERE cm.conversation_id = @polluted_conversation_id
--   AND @repair_ready = 1;
--
-- -- Copy the Security-thread participants to Q-00152.
-- INSERT IGNORE INTO conversation_participants (conversation_id, email, type)
-- SELECT @target_conversation_id, cp.email, cp.type
-- FROM conversation_participants cp
-- JOIN repair_participant_emails r ON r.email = cp.email
-- WHERE cp.conversation_id = @polluted_conversation_id
--   AND @repair_ready = 1;
--
-- -- Remove those wrong participants from Ticket 217.
-- DELETE cp
-- FROM conversation_participants cp
-- JOIN repair_participant_emails r ON r.email = cp.email
-- WHERE cp.conversation_id = @polluted_conversation_id
--   AND @repair_ready = 1;
--
-- INSERT INTO ticket_activities (ticket_id, action, note)
-- SELECT @polluted_ticket_id, 'updated', CONCAT('Repair: moved polluted Security thread messages to ', @target_ticket_number)
-- WHERE @repair_ready = 1
-- UNION ALL
-- SELECT @target_ticket_id, 'updated', CONCAT('Repair: received Security thread messages moved from Ticket ', @polluted_ticket_id)
-- WHERE @repair_ready = 1;
--
-- COMMIT;

DROP TEMPORARY TABLE IF EXISTS repair_message_ids;
DROP TEMPORARY TABLE IF EXISTS repair_participant_emails;
