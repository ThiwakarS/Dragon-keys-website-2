-- =============================================
-- DRAGON KEYS — Migration 006
-- PRODUCTION RESET: wipe all test orders, restart queue #1
--
-- ⚠️  RUN THIS ONLY WHEN YOU'RE DONE WITH TESTING.
--     This deletes ALL orders permanently. There is no undo.
--
-- What it does:
--   1. Deletes every row from `orders`
--   2. Resets the queue_counter back to 1
--
-- Run in Supabase SQL Editor. Single transaction = all-or-nothing.
-- =============================================

BEGIN;

-- Wipe the orders table completely. TRUNCATE is faster than DELETE
-- and also drops any lingering triggers' side effects.
TRUNCATE TABLE orders RESTART IDENTITY CASCADE;

-- Reset the counter. The next order will be queue #1.
UPDATE queue_counter
   SET next_number = 1
 WHERE id = 1;

-- Sanity check. If these don't match, rollback and investigate.
DO $$
DECLARE
  n_orders INT;
  n_next   BIGINT;
BEGIN
  SELECT COUNT(*) INTO n_orders FROM orders;
  SELECT next_number INTO n_next FROM queue_counter WHERE id = 1;

  IF n_orders <> 0 THEN
    RAISE EXCEPTION 'Reset failed: % orders remain', n_orders;
  END IF;
  IF n_next <> 1 THEN
    RAISE EXCEPTION 'Reset failed: counter is at %, expected 1', n_next;
  END IF;

  RAISE NOTICE 'Reset OK. Orders: 0. Next queue number: 1.';
END $$;

COMMIT;

-- After this, the next order placed through the UI will be #1.