-- =============================================
-- DRAGON KEYS — Migration 012
-- Fixes two bugs found in production:
--
--   BUG A (wrong delivery date / "only order in queue") — the position
--   shown on the ORDER CONFIRMATION screen came out as "1 of 1 / ~1 day"
--   for high-numbered orders. Cause: create_order's RETURN block compared
--   each order's sort_order against the NEW order's QUEUE number:
--       COALESCE(o2.sort_order, o2.queue_number) <= new_order.queue_number
--   That mixes two different numbering systems. It must compare sort_order
--   to sort_order. (The my_orders_with_position view was already correct,
--   which is why the My Orders page showed the right number while the
--   confirmation page did not.)
--
--   BUG B (coupon not visible in Admin) — migration 010b recreated the
--   order views with an explicit column list, then migration 011 added
--   orders.coupon_code afterward without refreshing the views. So the
--   admin view never carried coupon_code and the badge couldn't render,
--   even though the code was correctly stored on the order.
--
-- Safe to re-run. No data changes — only function/view definitions.
-- =============================================


-- ---------- 1. Fix create_order's returned position ----------
CREATE OR REPLACE FUNCTION create_order(
  p_product_id        TEXT,
  p_product_name      TEXT,
  p_customer_name     TEXT,
  p_whatsapp_number   TEXT,
  p_address           TEXT,
  p_pincode           TEXT,
  p_selected_options  JSONB DEFAULT '{}'::jsonb,
  p_max_active        INT   DEFAULT 1,
  p_coupon_code       TEXT  DEFAULT NULL
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
  uid          TEXT   := auth.jwt() ->> 'sub';
  new_order    orders%ROWTYPE;
  cnt          INT;
  next_qnum    BIGINT;
  final_coupon TEXT   := NULL;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING HINT = 'Sign in first.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(uid || ':' || p_product_id));

  -- Per-product PENDING limit (ready_to_ship + terminal excluded).
  SELECT COUNT(*) INTO cnt
  FROM orders AS o
  WHERE o.clerk_user_id = uid
    AND o.product_id    = p_product_id
    AND o.status NOT IN ('shipped', 'delivered', 'cancelled', 'ready_to_ship');

  IF cnt >= p_max_active THEN
    RAISE EXCEPTION 'active_order_exists'
      USING HINT = format('Limit reached: %s pending order(s) for this product.', cnt);
  END IF;

  -- Re-validate coupon server-side; invalid never blocks the order.
  IF p_coupon_code IS NOT NULL AND upper(p_coupon_code) ~ '^[A-Z0-9]{6}$' THEN
    IF coupon_is_valid(upper(p_coupon_code), p_product_id) THEN
      final_coupon := upper(p_coupon_code);
    END IF;
  END IF;

  next_qnum := take_next_queue_number();

  INSERT INTO orders (
    clerk_user_id, customer_name, whatsapp_number,
    address, pincode, product_id, product_name,
    selected_options, queue_number, sort_order, coupon_code
  ) VALUES (
    uid, p_customer_name, p_whatsapp_number,
    p_address, p_pincode, p_product_id, p_product_name,
    COALESCE(p_selected_options, '{}'::jsonb),
    next_qnum, next_qnum, final_coupon
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
        -- FIX (Bug A): compare sort_order to sort_order, not queue_number.
        AND COALESCE(o2.sort_order, o2.queue_number)
            <= COALESCE(new_order.sort_order, new_order.queue_number)
    ),
    (
      SELECT COUNT(*)::INT FROM orders AS o3
      WHERE o3.product_id = new_order.product_id
        AND o3.status NOT IN ('shipped', 'delivered', 'cancelled', 'ready_to_ship')
    ),
    new_order.status,
    new_order.created_at;
END $$;

GRANT EXECUTE ON FUNCTION create_order(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, INT, TEXT) TO authenticated;


-- ---------- 2. Refresh both views to include coupon_code ----------
-- Position logic is unchanged (it was already correct) — we only add the
-- coupon_code column so the admin badge has data to render.
--
-- We DROP then CREATE (inside one transaction) because the existing views
-- use an explicit column list and CREATE OR REPLACE VIEW can only APPEND
-- columns, not reorder them. Switching to `o.*` changes the column order,
-- which REPLACE rejects. DROP+CREATE avoids that. Views hold no data, and
-- both are recreated before COMMIT, so there's no window where they vanish
-- for the app. (security_invoker is re-set on each new view.)

BEGIN;

DROP VIEW IF EXISTS my_orders_with_position;
DROP VIEW IF EXISTS admin_orders_with_position;

CREATE VIEW my_orders_with_position
WITH (security_invoker = true) AS
SELECT
  o.*,                                     -- now picks up coupon_code (and any future columns)
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


CREATE VIEW admin_orders_with_position
WITH (security_invoker = true) AS
SELECT
  o.*,                                     -- now picks up coupon_code (and any future columns)
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

COMMIT;


-- =============================================
-- VERIFY:
--   -- coupon_code should now appear in the view:
--   SELECT queue_number, coupon_code FROM admin_orders_with_position
--   WHERE coupon_code IS NOT NULL ORDER BY queue_number DESC LIMIT 5;
--
--   -- position should now match between confirmation and My Orders.
-- =============================================