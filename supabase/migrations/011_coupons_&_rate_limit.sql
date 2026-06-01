-- =============================================
-- DRAGON KEYS — Migration 011
-- Product-scoped coupons + brute-force protection.
--
-- WHAT THIS ADDS
--   * coupons table — admin-managed, NOT readable by customers. A code is
--     valid only for the product it was created for (product_id), so a
--     mudflap code can never apply to a keyboard order.
--   * coupon_attempts table — logs validation attempts per user for rate
--     limiting (max 10 attempts / 10 minutes).
--   * orders.coupon_code — records the (validated) code used on an order,
--     so the admin can see "Coupon: ABC123" and apply the discount manually.
--   * coupon_is_valid()  — internal checker (no rate limit), used by both
--     the public RPC and create_order.
--   * validate_coupon()  — public RPC the order form calls. Rate-limited.
--     Returns only valid true/false — never reveals the code list.
--   * create_order (v3)  — now accepts + stores a coupon code, re-validated
--     server-side so a forged code can't be attached.
--
-- Codes are exactly 6 chars, A-Z and 0-9 only (enforced by CHECK + RPC).
-- Safe to re-run.
-- =============================================


-- ---------- 1. coupons table ----------
CREATE TABLE IF NOT EXISTS coupons (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT NOT NULL CHECK (code ~ '^[A-Z0-9]{6}$'),
  product_id   TEXT NOT NULL,                 -- which product this code is for
  description  TEXT,                          -- admin's own note (e.g. "Diwali 10%")
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by   TEXT,                          -- clerk_user_id of the admin
  UNIQUE (product_id, code)                   -- a code is unique within a product
);

CREATE INDEX IF NOT EXISTS idx_coupons_lookup ON coupons(product_id, code) WHERE active = TRUE;

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

-- ONLY admins can read or manage coupons. Customers have NO read access —
-- the only way to test a code is through validate_coupon(), which never
-- returns the list. (No anon/authenticated SELECT policy on purpose.)
DROP POLICY IF EXISTS "admins manage coupons" ON coupons;
CREATE POLICY "admins manage coupons"
  ON coupons FOR ALL
  TO authenticated
  USING      ((auth.jwt() -> 'public_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'public_metadata' ->> 'role') = 'admin');


-- ---------- 2. coupon_attempts table (rate limiting) ----------
CREATE TABLE IF NOT EXISTS coupon_attempts (
  id             BIGSERIAL PRIMARY KEY,
  clerk_user_id  TEXT NOT NULL,
  attempted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupon_attempts_user_time
  ON coupon_attempts(clerk_user_id, attempted_at DESC);

ALTER TABLE coupon_attempts ENABLE ROW LEVEL SECURITY;
-- No policies: customers can't touch this table directly. Only the
-- SECURITY DEFINER RPCs below (which run as owner) read/write it.


-- ---------- 3. orders.coupon_code column ----------
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS coupon_code TEXT
  CHECK (coupon_code IS NULL OR coupon_code ~ '^[A-Z0-9]{6}$');


-- ---------- 4. coupon_is_valid() — internal, NO rate limit ----------
-- Returns TRUE if an active coupon with this code exists for this product.
-- Not granted to anyone: only other SECURITY DEFINER functions call it.
CREATE OR REPLACE FUNCTION coupon_is_valid(p_code TEXT, p_product_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM coupons
    WHERE active = TRUE
      AND product_id = p_product_id
      AND code = upper(p_code)
  );
$$;

REVOKE ALL ON FUNCTION coupon_is_valid(TEXT, TEXT) FROM PUBLIC, anon, authenticated;


-- ---------- 5. validate_coupon() — public, RATE LIMITED ----------
-- Called by the order form. Normalizes the code, enforces the per-user
-- attempt limit, logs the attempt, then reports valid true/false.
CREATE OR REPLACE FUNCTION validate_coupon(p_code TEXT, p_product_id TEXT)
RETURNS TABLE (valid BOOLEAN, code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid          TEXT := auth.jwt() ->> 'sub';
  norm         TEXT := upper(coalesce(p_code, ''));
  recent_count INT;
  MAX_ATTEMPTS CONSTANT INT := 10;          -- per window
  WINDOW_MINS  CONSTANT INT := 10;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Rate limit: count this user's attempts inside the rolling window.
  SELECT COUNT(*) INTO recent_count
  FROM coupon_attempts
  WHERE clerk_user_id = uid
    AND attempted_at > NOW() - make_interval(mins => WINDOW_MINS);

  IF recent_count >= MAX_ATTEMPTS THEN
    RAISE EXCEPTION 'rate_limited'
      USING HINT = 'Too many attempts. Please try again in a few minutes.';
  END IF;

  -- Log this attempt, and opportunistically prune this user's old rows.
  INSERT INTO coupon_attempts (clerk_user_id) VALUES (uid);
  DELETE FROM coupon_attempts
   WHERE clerk_user_id = uid
     AND attempted_at < NOW() - INTERVAL '1 day';

  -- Format gate: 6 chars, A-Z/0-9 only. Bad format = invalid (no leak).
  IF norm !~ '^[A-Z0-9]{6}$' THEN
    RETURN QUERY SELECT FALSE, norm;
    RETURN;
  END IF;

  RETURN QUERY SELECT coupon_is_valid(norm, p_product_id), norm;
END $$;

GRANT EXECUTE ON FUNCTION validate_coupon(TEXT, TEXT) TO authenticated;


-- ---------- 6. create_order (v3) — accepts + stores coupon ----------
-- Drop the previous 8-arg version, add a 9th param p_coupon_code.
DROP FUNCTION IF EXISTS create_order(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, INT);

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

  -- Re-validate the coupon server-side (don't trust the client). If it's
  -- not a real, active coupon for THIS product, we just store NULL — an
  -- invalid coupon never blocks the order.
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

GRANT EXECUTE ON FUNCTION create_order(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, INT, TEXT) TO authenticated;


-- =============================================
-- The admin/my order views are SELECT o.* so they pick up coupon_code
-- automatically — no view change needed.
--
-- QUICK TEST:
--   INSERT INTO coupons (code, product_id, description, created_by)
--   VALUES ('SAVE10', 'mudflap-triumph-400', 'Test 10% off', 'manual');
--
--   SELECT * FROM validate_coupon('save10', 'mudflap-triumph-400');  -- valid=true
--   SELECT * FROM validate_coupon('SAVE10', 'dragonfly-67');         -- valid=false (wrong product)
--   SELECT * FROM validate_coupon('NOPE12', 'mudflap-triumph-400');  -- valid=false
-- =============================================