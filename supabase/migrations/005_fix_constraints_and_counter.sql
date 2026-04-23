-- =============================================
-- DRAGON KEYS — Migration 005
--
-- Fixes:
--   (a) Drop idx_one_active_order_per_user — it limited users to
--       ONE active order total across all products. The per-product
--       limit enforced inside create_order replaces it.
--   (b) Replace BIGSERIAL queue_number with a transactional counter
--       so failed inserts don't burn queue numbers.
-- =============================================


-- ---------- (a) Drop the user-level unique index ----------
-- It's the reason you can't place a second mudflap order.
-- The per-product check inside create_order already enforces
-- the correct limit using `maxActivePerUser` from products.js.
DROP INDEX IF EXISTS idx_one_active_order_per_user;


-- ---------- (b) Move queue_number off BIGSERIAL ----------
--
-- BIGSERIAL = a sequence, which is intentionally NON-transactional.
-- nextval() burns the number even if the INSERT rolls back — that's
-- what makes sequences safe under concurrent load, but it creates
-- gaps when errors happen. Which is what you saw.
--
-- Fix: use a counter TABLE with a row-level lock. The counter only
-- advances AFTER the INSERT succeeds, inside the same transaction.
-- If anything fails, the whole transaction rolls back, including the
-- counter increment. No more gaps.
--
-- Concurrency is handled by `FOR UPDATE` — the second txn blocks until
-- the first commits, so two users booking simultaneously get #N and #N+1
-- with no collision.


-- 1. Create the counter table
CREATE TABLE IF NOT EXISTS queue_counter (
  id           SMALLINT PRIMARY KEY DEFAULT 1,
  next_number  BIGINT   NOT NULL   DEFAULT 1,
  CONSTRAINT single_row CHECK (id = 1)
);

-- Seed it to the current max queue_number so new orders continue
-- from where the sequence left off. +1 to avoid any collision.
INSERT INTO queue_counter (id, next_number)
VALUES (
  1,
  COALESCE((SELECT MAX(queue_number) + 1 FROM orders), 1)
)
ON CONFLICT (id) DO UPDATE
  SET next_number = GREATEST(
    queue_counter.next_number,
    COALESCE((SELECT MAX(queue_number) + 1 FROM orders), 1)
  );

-- 2. Helper function to atomically take and return the next number
CREATE OR REPLACE FUNCTION take_next_queue_number()
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  n BIGINT;
BEGIN
  -- Lock the counter row. Concurrent callers block here until commit/rollback.
  SELECT next_number INTO n
    FROM queue_counter
    WHERE id = 1
    FOR UPDATE;

  UPDATE queue_counter SET next_number = n + 1 WHERE id = 1;
  RETURN n;
END $$;

-- 3. Drop the sequence default so queue_number won't auto-populate
ALTER TABLE orders ALTER COLUMN queue_number DROP DEFAULT;

-- If the sequence still exists, drop it (BIGSERIAL creates orders_queue_number_seq)
DROP SEQUENCE IF EXISTS orders_queue_number_seq CASCADE;


-- ---------- Recreate create_order using the counter ----------
DROP FUNCTION IF EXISTS create_order(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, INT);

CREATE OR REPLACE FUNCTION create_order(
  p_product_id        TEXT,
  p_product_name      TEXT,
  p_customer_name     TEXT,
  p_whatsapp_number   TEXT,
  p_address           TEXT,
  p_pincode           TEXT,
  p_selected_options  JSONB DEFAULT '{}'::jsonb,
  p_max_active        INT   DEFAULT 1
)
RETURNS TABLE (
  id                          UUID,
  queue_number                BIGINT,
  position_in_product_queue   INT,
  total_in_product_queue      INT,
  status                      order_status,
  created_at                  TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  uid        TEXT   := auth.jwt() ->> 'sub';
  new_order  orders%ROWTYPE;
  cnt        INT;
  next_qnum  BIGINT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING HINT = 'Sign in first.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(uid || ':' || p_product_id));

  -- Per-product limit check
  SELECT COUNT(*) INTO cnt
  FROM orders AS o
  WHERE o.clerk_user_id = uid
    AND o.product_id    = p_product_id
    AND o.status NOT IN ('shipped', 'cancelled');

  IF cnt >= p_max_active THEN
    RAISE EXCEPTION 'active_order_exists'
      USING HINT = format('Limit reached: %s active order(s) for this product.', cnt);
  END IF;

  -- Take the next queue number ONLY after all validation passed.
  -- If the INSERT below fails, the whole transaction rolls back,
  -- including this increment — no queue number is burned.
  next_qnum := take_next_queue_number();

  INSERT INTO orders (
    clerk_user_id, customer_name, whatsapp_number,
    address, pincode, product_id, product_name,
    selected_options, queue_number, sort_order
  ) VALUES (
    uid, p_customer_name, p_whatsapp_number,
    p_address, p_pincode, p_product_id, p_product_name,
    COALESCE(p_selected_options, '{}'::jsonb),
    next_qnum, next_qnum
  )
  RETURNING * INTO new_order;

  RETURN QUERY
  SELECT
    new_order.id,
    new_order.queue_number,
    (
      SELECT COUNT(*)::INT FROM orders AS o2
      WHERE o2.product_id = new_order.product_id
        AND o2.status NOT IN ('shipped', 'cancelled')
        AND COALESCE(o2.sort_order, o2.queue_number) <= new_order.queue_number
    ),
    (
      SELECT COUNT(*)::INT FROM orders AS o3
      WHERE o3.product_id = new_order.product_id
        AND o3.status NOT IN ('shipped', 'cancelled')
    ),
    new_order.status,
    new_order.created_at;
END $$;

GRANT EXECUTE ON FUNCTION create_order(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, INT) TO authenticated;


-- =============================================
-- Verify with:
--   SELECT next_number FROM queue_counter;   -- current counter
--   SELECT MAX(queue_number) FROM orders;    -- last used number
-- The counter should be exactly MAX + 1.
-- =============================================