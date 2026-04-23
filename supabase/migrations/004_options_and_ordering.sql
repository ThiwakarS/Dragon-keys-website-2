-- =============================================
-- DRAGON KEYS — Migration 004
-- Adds:
--   * selected_options JSONB column (per-order design/vehicle choices)
--   * sort_order column + "now printing" flag
--   * cancellation_reason column
--   * check_can_book_for_product RPC (takes product_id + max_active)
--   * create_order (v2) — accepts options & enforces per-product limit
--   * set_current_printing / reorder_order admin RPCs
--   * public_queue view for "now printing" home-page widget
-- =============================================

-- ---------- 1. New columns ----------
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS selected_options   JSONB       NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS sort_order         BIGINT,               -- nullable; fallback to queue_number
  ADD COLUMN IF NOT EXISTS is_current         BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- Seed sort_order from queue_number for existing rows so ordering is stable
UPDATE orders SET sort_order = queue_number WHERE sort_order IS NULL;

-- Index for ordering and "now printing" lookups
CREATE INDEX IF NOT EXISTS idx_orders_sort_order  ON orders(product_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_orders_is_current  ON orders(is_current) WHERE is_current = TRUE;

-- Only ONE order can be "is_current" at a time per product
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_current_per_product
  ON orders(product_id) WHERE is_current = TRUE;


-- ---------- 2. REPLACE check_can_book with per-product version ----------
-- Old function is still there; we add a new one that takes product_id + limit.
-- Frontend will call the new one.
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
    AND o.status NOT IN ('shipped', 'cancelled');

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


-- ---------- 3. REPLACE create_order to accept options + per-product limit ----------
-- The old create_order must go — we replace it with a signature that takes
-- selected_options (JSONB) and max_active (INT). Frontend sends both.
DROP FUNCTION IF EXISTS create_order(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

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
  uid       TEXT := auth.jwt() ->> 'sub';
  new_order orders%ROWTYPE;
  cnt       INT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING HINT = 'Sign in first.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(uid || ':' || p_product_id));

  -- Per-product active order limit
  SELECT COUNT(*) INTO cnt
  FROM orders AS o
  WHERE o.clerk_user_id = uid
    AND o.product_id    = p_product_id
    AND o.status NOT IN ('shipped', 'cancelled');

  IF cnt >= p_max_active THEN
    RAISE EXCEPTION 'active_order_exists'
      USING HINT = format('Limit reached: %s active order(s) for this product.', cnt);
  END IF;

  INSERT INTO orders (
    clerk_user_id, customer_name, whatsapp_number,
    address, pincode, product_id, product_name,
    selected_options
  ) VALUES (
    uid, p_customer_name, p_whatsapp_number,
    p_address, p_pincode, p_product_id, p_product_name,
    COALESCE(p_selected_options, '{}'::jsonb)
  )
  RETURNING * INTO new_order;

  -- Seed sort_order with the new queue number
  UPDATE orders SET sort_order = new_order.queue_number WHERE id = new_order.id;

  RETURN QUERY
  SELECT
    new_order.id,
    new_order.queue_number,
    (
      SELECT COUNT(*)::INT FROM orders AS o2
      WHERE o2.product_id   = new_order.product_id
        AND o2.status       NOT IN ('shipped', 'cancelled')
        AND COALESCE(o2.sort_order, o2.queue_number) <= new_order.queue_number
    ),
    (
      SELECT COUNT(*)::INT FROM orders AS o3
      WHERE o3.product_id = new_order.product_id
        AND o3.status     NOT IN ('shipped', 'cancelled')
    ),
    new_order.status,
    new_order.created_at;
END $$;

GRANT EXECUTE ON FUNCTION create_order(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, INT) TO authenticated;


-- ---------- 4. REPLACE views so they use sort_order ----------
DROP VIEW IF EXISTS my_orders_with_position;
DROP VIEW IF EXISTS admin_orders_with_position;

CREATE VIEW my_orders_with_position
WITH (security_invoker = true) AS
SELECT
  o.*,
  CASE
    WHEN o.status IN ('shipped', 'cancelled') THEN NULL
    ELSE (
      SELECT COUNT(*)::INT FROM orders o2
      WHERE o2.product_id = o.product_id
        AND o2.status NOT IN ('shipped', 'cancelled')
        AND COALESCE(o2.sort_order, o2.queue_number)
            <= COALESCE(o.sort_order, o.queue_number)
    )
  END AS position_in_product_queue,
  CASE
    WHEN o.status IN ('shipped', 'cancelled') THEN NULL
    ELSE (
      SELECT COUNT(*)::INT FROM orders o3
      WHERE o3.product_id = o.product_id
        AND o3.status NOT IN ('shipped', 'cancelled')
    )
  END AS total_in_product_queue
FROM orders o;

GRANT SELECT ON my_orders_with_position TO authenticated;

CREATE VIEW admin_orders_with_position
WITH (security_invoker = true) AS
SELECT
  o.*,
  CASE
    WHEN o.status IN ('shipped', 'cancelled') THEN NULL
    ELSE (
      SELECT COUNT(*)::INT FROM orders o2
      WHERE o2.product_id = o.product_id
        AND o2.status NOT IN ('shipped', 'cancelled')
        AND COALESCE(o2.sort_order, o2.queue_number)
            <= COALESCE(o.sort_order, o.queue_number)
    )
  END AS position_in_product_queue,
  CASE
    WHEN o.status IN ('shipped', 'cancelled') THEN NULL
    ELSE (
      SELECT COUNT(*)::INT FROM orders o3
      WHERE o3.product_id = o.product_id
        AND o3.status NOT IN ('shipped', 'cancelled')
    )
  END AS total_in_product_queue
FROM orders o;

GRANT SELECT ON admin_orders_with_position TO authenticated;


-- ---------- 5. Public "now printing" view ----------
-- Anyone (even signed-out) can see the currently-printing queue number per product.
-- This view only exposes (product_id, queue_number) — no user data.
CREATE OR REPLACE VIEW public_now_printing AS
SELECT product_id, product_name, queue_number
FROM orders
WHERE is_current = TRUE;

GRANT SELECT ON public_now_printing TO authenticated, anon;


-- ---------- 6. Admin RPC: set_current_printing ----------
-- Marks one order as "currently printing". Unsets any other for the same product.
CREATE OR REPLACE FUNCTION set_current_printing(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target orders%ROWTYPE;
BEGIN
  -- Admin check via JWT
  IF (auth.jwt() -> 'public_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  SELECT * INTO target FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  -- Clear any existing current for this product
  UPDATE orders SET is_current = FALSE
   WHERE product_id = target.product_id AND is_current = TRUE;

  -- Set the new one
  UPDATE orders SET is_current = TRUE WHERE id = p_order_id;
END $$;

GRANT EXECUTE ON FUNCTION set_current_printing(UUID) TO authenticated;


-- ---------- 7. Admin RPC: clear_current_printing ----------
CREATE OR REPLACE FUNCTION clear_current_printing(p_product_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (auth.jwt() -> 'public_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  UPDATE orders SET is_current = FALSE
   WHERE product_id = p_product_id AND is_current = TRUE;
END $$;

GRANT EXECUTE ON FUNCTION clear_current_printing(TEXT) TO authenticated;


-- ---------- 8. Admin RPC: move_order ----------
-- Swaps the sort_order of an order with its neighbor above/below.
-- direction: 'up' or 'down'
CREATE OR REPLACE FUNCTION move_order(p_order_id UUID, p_direction TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target      orders%ROWTYPE;
  neighbor    orders%ROWTYPE;
  target_ord  BIGINT;
  neigh_ord   BIGINT;
BEGIN
  IF (auth.jwt() -> 'public_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  SELECT * INTO target FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  target_ord := COALESCE(target.sort_order, target.queue_number);

  IF p_direction = 'up' THEN
    -- Find the order immediately above (smaller sort_order, same product, active)
    SELECT * INTO neighbor FROM orders
     WHERE product_id = target.product_id
       AND id <> target.id
       AND status NOT IN ('shipped', 'cancelled')
       AND COALESCE(sort_order, queue_number) < target_ord
     ORDER BY COALESCE(sort_order, queue_number) DESC
     LIMIT 1;
  ELSIF p_direction = 'down' THEN
    SELECT * INTO neighbor FROM orders
     WHERE product_id = target.product_id
       AND id <> target.id
       AND status NOT IN ('shipped', 'cancelled')
       AND COALESCE(sort_order, queue_number) > target_ord
     ORDER BY COALESCE(sort_order, queue_number) ASC
     LIMIT 1;
  ELSE
    RAISE EXCEPTION 'invalid_direction';
  END IF;

  -- No neighbor = nothing to swap, exit silently
  IF NOT FOUND THEN
    RETURN;
  END IF;

  neigh_ord := COALESCE(neighbor.sort_order, neighbor.queue_number);

  -- Swap
  UPDATE orders SET sort_order = neigh_ord  WHERE id = target.id;
  UPDATE orders SET sort_order = target_ord WHERE id = neighbor.id;
END $$;

GRANT EXECUTE ON FUNCTION move_order(UUID, TEXT) TO authenticated;


-- =============================================
-- Done. Test:
--   SELECT * FROM check_can_book_for_product('mudflap-triumph-400', 1);
--   SELECT * FROM public_now_printing;
-- =============================================