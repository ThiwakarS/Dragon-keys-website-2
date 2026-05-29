-- =============================================
-- DRAGON KEYS — Migration 010b  (RUN THIS SECOND, AFTER 010a)
--
-- Makes 'ready_to_ship' behave like a "done producing" status for both
-- the booking limit and the production queue:
--
--   * BOOKING LIMIT — a ready-to-ship order no longer counts as a
--     "pending mat", so it frees up the customer's slot. (Limit is the
--     number of items still to be produced.)
--   * QUEUE MATH — a ready-to-ship order is already printed and in hand,
--     so it's removed from position_in_product_queue / total_in_product_queue.
--
-- In short: everywhere we used to treat ('shipped','delivered','cancelled')
-- as terminal/out-of-queue, we now also include 'ready_to_ship'.
--
-- This SUPERSEDES migration 009. If you already ran 009, this just updates
-- the definitions on top of it. If you never ran 009, you don't need it —
-- 010a + 010b cover everything (including the original 'delivered' fix).
--
-- Safe to re-run: CREATE OR REPLACE on all functions and views.
-- =============================================


-- ---------- 1. check_can_book_for_product ----------
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
    AND o.status NOT IN ('shipped', 'delivered', 'cancelled', 'ready_to_ship');

  IF cnt >= p_max_active THEN
    RETURN QUERY SELECT
      FALSE,
      format('You already have %s pending order(s) for this product (limit: %s). Please wait for one to be ready to ship before booking more.', cnt, p_max_active),
      cnt;
  ELSE
    RETURN QUERY SELECT TRUE, NULL::TEXT, cnt;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION check_can_book_for_product(TEXT, INT) TO authenticated;


-- ---------- 2. create_order ----------
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

  -- Per-product PENDING limit (ready_to_ship no longer counts).
  SELECT COUNT(*) INTO cnt
  FROM orders AS o
  WHERE o.clerk_user_id = uid
    AND o.product_id    = p_product_id
    AND o.status NOT IN ('shipped', 'delivered', 'cancelled', 'ready_to_ship');

  IF cnt >= p_max_active THEN
    RAISE EXCEPTION 'active_order_exists'
      USING HINT = format('Limit reached: %s pending order(s) for this product.', cnt);
  END IF;

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
        AND o2.status NOT IN ('shipped', 'delivered', 'cancelled', 'ready_to_ship')
        AND COALESCE(o2.sort_order, o2.queue_number) <= new_order.queue_number
    ),
    (
      SELECT COUNT(*)::INT FROM orders AS o3
      WHERE o3.product_id = new_order.product_id
        AND o3.status NOT IN ('shipped', 'delivered', 'cancelled', 'ready_to_ship')
    ),
    new_order.status,
    new_order.created_at;
END $$;

GRANT EXECUTE ON FUNCTION create_order(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, INT) TO authenticated;


-- ---------- 3. my_orders_with_position view ----------
CREATE OR REPLACE VIEW my_orders_with_position
WITH (security_invoker = true) AS
SELECT
  o.*,
  CASE
    WHEN o.status IN ('shipped', 'delivered', 'cancelled', 'ready_to_ship') THEN NULL
    ELSE (
      SELECT COUNT(*)::INT FROM orders o2
      WHERE o2.product_id = o.product_id
        AND o2.status NOT IN ('shipped', 'delivered', 'cancelled', 'ready_to_ship')
        AND COALESCE(o2.sort_order, o2.queue_number)
            <= COALESCE(o.sort_order, o.queue_number)
    )
  END AS position_in_product_queue,
  CASE
    WHEN o.status IN ('shipped', 'delivered', 'cancelled', 'ready_to_ship') THEN NULL
    ELSE (
      SELECT COUNT(*)::INT FROM orders o3
      WHERE o3.product_id = o.product_id
        AND o3.status NOT IN ('shipped', 'delivered', 'cancelled', 'ready_to_ship')
    )
  END AS total_in_product_queue
FROM orders o;

GRANT SELECT ON my_orders_with_position TO authenticated;


-- ---------- 4. admin_orders_with_position view ----------
CREATE OR REPLACE VIEW admin_orders_with_position
WITH (security_invoker = true) AS
SELECT
  o.*,
  CASE
    WHEN o.status IN ('shipped', 'delivered', 'cancelled', 'ready_to_ship') THEN NULL
    ELSE (
      SELECT COUNT(*)::INT FROM orders o2
      WHERE o2.product_id = o.product_id
        AND o2.status NOT IN ('shipped', 'delivered', 'cancelled', 'ready_to_ship')
        AND COALESCE(o2.sort_order, o2.queue_number)
            <= COALESCE(o.sort_order, o.queue_number)
    )
  END AS position_in_product_queue,
  CASE
    WHEN o.status IN ('shipped', 'delivered', 'cancelled', 'ready_to_ship') THEN NULL
    ELSE (
      SELECT COUNT(*)::INT FROM orders o3
      WHERE o3.product_id = o.product_id
        AND o3.status NOT IN ('shipped', 'delivered', 'cancelled', 'ready_to_ship')
    )
  END AS total_in_product_queue
FROM orders o;

GRANT SELECT ON admin_orders_with_position TO authenticated;


-- =============================================
-- VERIFY:
--   -- A user with one ready_to_ship order should be able to book again:
--   SELECT * FROM check_can_book_for_product('mudflap-triumph-400', 2);
--
--   -- Ready-to-ship rows should show NULL position (out of queue):
--   SELECT queue_number, status, position_in_product_queue, total_in_product_queue
--   FROM admin_orders_with_position
--   WHERE product_id = 'mudflap-triumph-400'
--   ORDER BY queue_number;
-- =============================================