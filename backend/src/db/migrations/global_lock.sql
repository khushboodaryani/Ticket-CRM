-- ============================================
-- EMAIL POLLER LOCK RECOVERY SCRIPT
-- Use only if poller gets stuck due to lock
-- ============================================
-- check terminus logs if Inbound mail trigger but ticket not process and the logs shows Global Lock , worker processing another mail
-- then use this script for manual, however self recover logic is already applied just in case of stuck can be recovered manually.

USE ticket_crm;

-- Step 1: Try to release the global lock safely
SELECT RELEASE_LOCK('email_poller_lock') AS lock_released;

-- Step 2: Check if any query is still holding or referencing the lock
SELECT ID, USER, HOST, DB, COMMAND, TIME, STATE, INFO
FROM information_schema.processlist
WHERE INFO LIKE '%email_poller_lock%';

-- Step 3: Find long sleeping connections (possible stale connections)
SELECT ID, USER, HOST, DB, COMMAND, TIME, STATE
FROM information_schema.processlist
WHERE COMMAND = 'Sleep'
  AND TIME > 60   -- only long idle connections
ORDER BY TIME DESC;

-- Step 4: OPTIONAL - Kill a specific stuck connection manually
-- (Replace 38126 with actual ID from above result)
-- ⚠️ Use carefully
-- KILL CONNECTION 38126;
-- kill connection id that shows after check

-- Step 5: Final check - ensure lock is free
SELECT IS_FREE_LOCK('email_poller_lock') AS is_lock_free;