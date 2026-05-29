-- =============================================
-- DRAGON KEYS — Migration 009
-- Fix: treat 'delivered' as a TERMINAL status everywhere.
--
-- WHY THIS EXISTS
--   Migration 008 added the 'delivered' status to the order_status
--   enum. But the active-order / queue-position logic written back in
--   migrations 004 and 005 predates it, and only ever excluded
--   ('shipped', 'cancelled'). That left one bug with two symptoms:
--
--     1. BOOKING LIMIT: a delivered order still counted as "active",
--        so it ate into the per-product maxActivePerUser limit. This
--        is why a dev account with only *delivered* test orders was
--        told "3 active, limit 2" and blocked from booking.
--
--     2. QUEUE MATH: delivered orders were still counted in the
--        position_in_product_queue / total_in_product_queue figures,
--        inflating everyone else's queue position and totals.
--
--   The frontend already treats delivered as terminal (see utils.js
--   TERMINAL_STATUSES and the active checks in MyOrders/Admin), so the
--   database was simply out of sync. This migration brings every spot
--   in line: terminal = ('shipped', 'delivered', 'cancelled').
--
-- SAFE TO RE-RUN: uses CREATE OR REPLACE for both functions and views.
-- No data is modified — only function/view definitions change.
-- =============================================


-- ---------- 1. check_can_book_for_product (was: migration 004) ----------
CREATE OR REPLACE FUNCTION check_can_book_for_product(
  p_product_id   TEXT,
  p_max_active   INT DEFAULT 1
)
RETURNS TABLE(can_book BOOLEAN, reason TEXT, active_count INT)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
#variable_conflict use_column
DECLARE
  uid TEXT := auth.jwt() ->> 'sub';
  cnt INT;
BEGIN
  IF uid IS NULL THEN
    RETURN QUERY SELECT FALSE, 'You must be signed in.', 0;
    RETURN;
  END IF;

  SELECT COUNT(*) INTO cnt
  FROM orders AS o
  WHERE o.clerk_user_id = uid
    AND o.product_id    = p_product_id
    AND o.status NOT IN ('shipped', 'delivered', 'cancelled');   -- + delivered

  IF cnt >= p_max_active THEN
    RETURN QUERY SELECT
      FALSE,
      format('You already have %s active order(s) for this product (limit: %s). Please wait for one to ship before booking more.', cnt, p_max_active),
      cnt;
  ELSE
    RETURN QUERY SELECT TRUE, NULL::TEXT, cnt;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION check_can_book_for_product(TEXT, INT) TO authenticated;


-- ---------- 2. create_order (was: migration 005) ----------
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

  -- Per-product limit check (delivered now excluded)
  SELECT COUNT(*) INTO cnt
  FROM orders AS o
  WHERE o.clerk_user_id = uid
    AND o.product_id    = p_product_id
    AND o.status NOT IN ('shipped', 'delivered', 'cancelled');   -- + delivered

  IF cnt >= p_max_active THEN
    RAISE EXCEPTION 'active_order_exists'
      USING HINT = format('Limit reached: %s active order(s) for this product.', cnt);
  END IF;

  -- Take the next queue number ONLY after all validation passed.
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
        AND o2.status NOT IN ('shipped', 'delivered', 'cancelled')   -- + delivered
        AND COALESCE(o2.sort_order, o2.queue_number) <= new_order.queue_number
    ),
    (
      SELECT COUNT(*)::INT FROM orders AS o3
      WHERE o3.product_id = new_order.product_id
        AND o3.status NOT IN ('shipped', 'delivered', 'cancelled')   -- + delivered
    ),
    new_order.status,
    new_order.created_at;
END $$;

GRANT EXECUTE ON FUNCTION create_order(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, INT) TO authenticated;


-- ---------- 3. my_orders_with_position view (was: migration 004) ----------
CREATE OR REPLACE VIEW my_orders_with_position
WITH (security_invoker = true) AS
SELECT
  o.*,
  CASE
    WHEN o.status IN ('shipped', 'delivered', 'cancelled') THEN NULL   -- + delivered
    ELSE (
      SELECT COUNT(*)::INT FROM orders o2
      WHERE o2.product_id = o.product_id
        AND o2.status NOT IN ('shipped', 'delivered', 'cancelled')     -- + delivered
        AND COALESCE(o2.sort_order, o2.queue_number)
            <= COALESCE(o.sort_order, o.queue_number)
    )
  END AS position_in_product_queue,
  CASE
    WHEN o.status IN ('shipped', 'delivered', 'cancelled') THEN NULL   -- + delivered
    ELSE (
      SELECT COUNT(*)::INT FROM orders o3
      WHERE o3.product_id = o.product_id
        AND o3.status NOT IN ('shipped', 'delivered', 'cancelled')     -- + delivered
    )
  END AS total_in_product_queue
FROM orders o;

GRANT SELECT ON my_orders_with_position TO authenticated;


-- ---------- 4. admin_orders_with_position view (was: migration 004) ----------
CREATE OR REPLACE VIEW admin_orders_with_position
WITH (security_invoker = true) AS
SELECT
  o.*,
  CASE
    WHEN o.status IN ('shipped', 'delivered', 'cancelled') THEN NULL   -- + delivered
    ELSE (
      SELECT COUNT(*)::INT FROM orders o2
      WHERE o2.product_id = o.product_id
        AND o2.status NOT IN ('shipped', 'delivered', 'cancelled')     -- + delivered
        AND COALESCE(o2.sort_order, o2.queue_number)
            <= COALESCE(o.sort_order, o.queue_number)
    )
  END AS position_in_product_queue,
  CASE
    WHEN o.status IN ('shipped', 'delivered', 'cancelled') THEN NULL   -- + delivered
    ELSE (
      SELECT COUNT(*)::INT FROM orders o3
      WHERE o3.product_id = o.product_id
        AND o3.status NOT IN ('shipped', 'delivered', 'cancelled')     -- + delivered
    )
  END AS total_in_product_queue
FROM orders o;

GRANT SELECT ON admin_orders_with_position TO authenticated;


-- =============================================
-- VERIFY after running:
--
--   -- Should now report can_book = true for a user with only
--   -- delivered orders (assuming under the limit of non-terminal ones):
--   SELECT * FROM check_can_book_for_product('mudflap-triumph-400', 2);
--
--   -- Inspect what the DB actually holds per user/status:
--   SELECT clerk_user_id, status, COUNT(*)
--   FROM orders
--   WHERE product_id = 'mudflap-triumph-400'
--   GROUP BY clerk_user_id, status
--   ORDER BY clerk_user_id;
-- =============================================