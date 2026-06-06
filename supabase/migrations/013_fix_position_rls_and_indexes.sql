-- =============================================
-- DRAGON KEYS — Migration 013
-- Fixes the "1 of 1 / ~1 day" bug customers see, and the admin page-3
-- timeout. Two root causes, both addressed here.
--
-- ROOT CAUSE 1 (wrong position/ETA for customers) — RLS leak through a
--   security_invoker view. my_orders_with_position computes position with
--   correlated subqueries, and because the view is security_invoker, those
--   subqueries run under the CALLER's row-level security. A customer can
--   only see their OWN orders, so the "how many are ahead of you" count
--   only counted the customer's own rows -> always 1. Admins saw the right
--   number because their RLS policy can read all rows. The confirmation
--   page was already correct (create_order is SECURITY DEFINER).
--
--   FIX: compute the counts in SECURITY DEFINER helper functions that
--   bypass RLS (so they always count ALL orders), and call them from the
--   view. The view stays security_invoker, so customers still only SEE
--   their own rows — but the position/total numbers are now global/correct.
--
-- ROOT CAUSE 2 (admin timeout past page 2) — the admin list read a view
--   that runs per-row position subqueries (an N+1 pattern). On the free
--   tier's statement timeout, deep pages exceeded the limit. The admin
--   doesn't need per-row position, so the app now queries the base table
--   directly (see Admin.jsx). This migration just adds the indexes that
--   make those filtered+sorted page reads fast.
--
-- Safe to re-run. No data is modified — functions, one view, and indexes.
-- =============================================


-- ---------- 1. SECURITY DEFINER count helpers (bypass RLS) ----------
-- These return only integers (counts), never rows, so they leak nothing
-- sensitive — at most the size of a product's queue, which is already
-- semi-public (the "now printing" banner shows queue numbers).

CREATE OR REPLACE FUNCTION queue_position(p_product_id TEXT, p_sort BIGINT)
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COUNT(*)::INT
  FROM orders o2
  WHERE o2.product_id = p_product_id
    AND o2.status NOT IN ('shipped', 'delivered', 'cancelled', 'ready_to_ship')
    AND COALESCE(o2.sort_order, o2.queue_number) <= p_sort;
$$;

CREATE OR REPLACE FUNCTION queue_total(p_product_id TEXT)
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COUNT(*)::INT
  FROM orders o3
  WHERE o3.product_id = p_product_id
    AND o3.status NOT IN ('shipped', 'delivered', 'cancelled', 'ready_to_ship');
$$;

-- Callers (the security_invoker view runs as the signed-in customer) need
-- EXECUTE; the body then runs as the owner and counts across all rows.
GRANT EXECUTE ON FUNCTION queue_position(TEXT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION queue_total(TEXT)            TO authenticated;


-- ---------- 2. Rebuild my_orders_with_position to use the helpers ----------
-- Same output columns as before (o.* + the two computed ints), so
-- CREATE OR REPLACE is accepted. The ONLY change is that the two counts
-- now come from the SECURITY DEFINER helpers instead of inline subqueries.
CREATE OR REPLACE VIEW my_orders_with_position
WITH (security_invoker = true) AS
SELECT
  o.*,
  CASE
    WHEN o.status IN ('shipped', 'delivered', 'cancelled', 'ready_to_ship') THEN NULL
    ELSE queue_position(o.product_id, COALESCE(o.sort_order, o.queue_number))
  END AS position_in_product_queue,
  CASE
    WHEN o.status IN ('shipped', 'delivered', 'cancelled', 'ready_to_ship') THEN NULL
    ELSE queue_total(o.product_id)
  END AS total_in_product_queue
FROM orders o;

GRANT SELECT ON my_orders_with_position TO authenticated;


-- ---------- 3. Indexes for fast admin pagination ----------
-- The admin list now reads the base `orders` table directly, filtered by
-- status and sorted either by (product_id, sort_order) for the worklist
-- tabs or by queue_number DESC for shipped/delivered. These two indexes
-- serve exactly those access patterns.

-- Active / Queue / Cancelled / All tabs: filter status, order by product+sort.
CREATE INDEX IF NOT EXISTS idx_orders_status_product_sort
  ON orders(status, product_id, sort_order);

-- Shipped / Delivered tabs: filter status, newest-first by queue_number.
CREATE INDEX IF NOT EXISTS idx_orders_status_qnum_desc
  ON orders(status, queue_number DESC);


-- =============================================
-- VERIFY:
--   -- Global position/total for a product (run as owner = bypasses RLS):
--   SELECT queue_position('mudflap-triumph-400', 821);  -- should be a big number
--   SELECT queue_total('mudflap-triumph-400');          -- ~632
--
-- After deploying the new Admin.jsx, a CUSTOMER's My Orders page should now
-- show the same position/total an admin sees for that order (no longer 1/1).
-- =============================================