-- =============================================
-- DRAGON KEYS — Migration 010a  (RUN THIS FIRST, BY ITSELF)
--
-- Adds the new 'ready_to_ship' order status to the enum, positioned
-- between 'awaiting_final_payment' and 'shipped'.
--
-- ⚠️  WHY THIS IS A SEPARATE FILE:
--     Postgres will not let you ADD a new enum value and then USE that
--     value inside a VIEW definition in the SAME transaction. So:
--        1. Run THIS file (010a) on its own and let it finish.
--        2. THEN run 010b, which recreates the functions and views
--           that reference 'ready_to_ship'.
--
-- Safe to re-run: IF NOT EXISTS makes it a no-op if already added.
-- =============================================

ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'ready_to_ship' BEFORE 'shipped';

-- Verify:
--   SELECT unnest(enum_range(NULL::order_status));
--   -- should list ... awaiting_final_payment, ready_to_ship, shipped, delivered, cancelled