-- =============================================
-- DRAGON KEYS — Migration 014
-- Admin-panel power tools (admin-only, validated, server-side):
--
--   * admin_set_order_coupon(order_id, code) — attach or clear a coupon on
--     a specific order FROM THE UI instead of raw SQL. Validates that the
--     code is a real coupon for THAT order's product (prevents typos /
--     wrong-product mistakes). Pass NULL/'' to clear.
--
--   * admin_bulk_update_status(order_ids[], new_status, reason) — change the
--     status of many selected orders in one atomic update. Mirrors the
--     single-row rules: clears is_current when leaving the print stage, and
--     applies one shared cancellation reason on bulk-cancel.
--
-- Both check the caller is an admin (same JWT check used by your other
-- admin RPCs). Additive only — no data is deleted or restructured.
-- Safe to re-run (CREATE OR REPLACE).
-- =============================================


-- ---------- 1. admin_set_order_coupon ----------
CREATE OR REPLACE FUNCTION admin_set_order_coupon(
  p_order_id UUID,
  p_code     TEXT          -- NULL or '' clears the coupon
)
RETURNS TEXT               -- the stored code, or NULL if cleared
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_product TEXT;
  v_norm    TEXT;
BEGIN
  IF (auth.jwt() -> 'public_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  SELECT product_id INTO v_product FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  -- Clear the coupon.
  IF p_code IS NULL OR btrim(p_code) = '' THEN
    UPDATE orders
       SET coupon_code = NULL,
           updated_at  = NOW()
     WHERE id = p_order_id;
    RETURN NULL;
  END IF;

  v_norm := upper(btrim(p_code));

  IF v_norm !~ '^[A-Z0-9]{6}$' THEN
    RAISE EXCEPTION 'invalid_format'
      USING HINT = 'Coupon must be 6 characters, A-Z and 0-9 only.';
  END IF;

  -- Must be a real coupon for THIS order's product. (Active flag ignored
  -- on purpose: a manual override may attach a currently-paused code.)
  IF NOT EXISTS (
    SELECT 1 FROM coupons
    WHERE product_id = v_product
      AND code = v_norm
  ) THEN
    RAISE EXCEPTION 'coupon_not_found_for_product'
      USING HINT = 'No coupon with that code exists for this order''s product.';
  END IF;

  UPDATE orders
     SET coupon_code = v_norm,
         updated_at  = NOW()
   WHERE id = p_order_id;

  RETURN v_norm;
END $$;

GRANT EXECUTE ON FUNCTION admin_set_order_coupon(UUID, TEXT) TO authenticated;


-- ---------- 2. admin_bulk_update_status ----------
CREATE OR REPLACE FUNCTION admin_bulk_update_status(
  p_order_ids  UUID[],
  p_new_status TEXT,
  p_reason     TEXT DEFAULT NULL
)
RETURNS INT                -- number of rows updated
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  n              INT;
  clears_current BOOLEAN;
BEGIN
  IF (auth.jwt() -> 'public_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  -- Only the statuses the UI offers are allowed (legacy printing /
  -- awaiting_final_payment can't be bulk-set).
  IF p_new_status NOT IN
     ('awaiting_deposit','in_queue','ready_to_ship','shipped','delivered','cancelled') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  IF p_order_ids IS NULL OR array_length(p_order_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- Leaving the print stage means the order is no longer "printing now".
  clears_current := p_new_status IN ('ready_to_ship','shipped','delivered','cancelled');

  IF p_new_status = 'cancelled' THEN
    UPDATE orders
       SET status              = 'cancelled'::order_status,
           cancellation_reason = COALESCE(NULLIF(btrim(p_reason), ''), 'Cancelled by admin'),
           is_current          = FALSE,
           updated_at          = NOW()
     WHERE id = ANY(p_order_ids);
  ELSE
    UPDATE orders
       SET status     = p_new_status::order_status,
           is_current = CASE WHEN clears_current THEN FALSE ELSE is_current END,
           updated_at = NOW()
     WHERE id = ANY(p_order_ids);
  END IF;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

GRANT EXECUTE ON FUNCTION admin_bulk_update_status(UUID[], TEXT, TEXT) TO authenticated;


-- =============================================
-- QUICK TEST (run as admin / in SQL editor which bypasses the JWT check):
--   -- attach a coupon to one order (must exist in coupons for its product):
--   SELECT admin_set_order_coupon('<order-uuid>', 'JVNC4U');
--   -- clear it:
--   SELECT admin_set_order_coupon('<order-uuid>', NULL);
--   -- bulk mark two orders shipped:
--   SELECT admin_bulk_update_status(ARRAY['<uuid1>','<uuid2>']::uuid[], 'shipped', NULL);
-- =============================================