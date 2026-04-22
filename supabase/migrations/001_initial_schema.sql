-- =============================================
-- DRAGON KEYS — Supabase Schema & RLS
-- Run this in Supabase SQL Editor (one-time setup).
--
-- Assumes you've already enabled Clerk as a Third Party Auth
-- provider in Supabase Dashboard → Authentication → Sign In / Up
-- → Third Party Auth → Clerk.
--
-- With that enabled, Supabase verifies Clerk JWTs automatically
-- and auth.jwt()->>'sub' gives the Clerk user ID.
-- =============================================


-- ---------- 1. ENUM for statuses ----------
DO $$ BEGIN
  CREATE TYPE order_status AS ENUM (
    'awaiting_deposit',
    'in_queue',
    'printing',
    'awaiting_final_payment',
    'shipped',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ---------- 2. ORDERS table ----------
CREATE TABLE IF NOT EXISTS orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id     TEXT NOT NULL,
  customer_name     TEXT NOT NULL CHECK (length(customer_name) BETWEEN 2 AND 100),
  whatsapp_number   TEXT NOT NULL CHECK (whatsapp_number ~ '^[0-9]{10,15}$'),
  address           TEXT NOT NULL CHECK (length(address) BETWEEN 10 AND 500),
  pincode           TEXT NOT NULL CHECK (pincode ~ '^[0-9]{6}$'),
  product_id        TEXT NOT NULL,
  product_name      TEXT NOT NULL,
  status            order_status NOT NULL DEFAULT 'awaiting_deposit',
  queue_number      BIGSERIAL UNIQUE NOT NULL, -- global, monotonic, collision-free
  tracking_number   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_clerk_user     ON orders(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status         ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_product_status ON orders(product_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at     ON orders(created_at DESC);

-- Keep updated_at fresh automatically
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------- 3. Partial unique index ----------
-- This is the backbone of "one active order per user".
-- We can't use a plain UNIQUE since users can have many shipped orders;
-- a partial unique index only applies to non-terminal statuses.
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_order_per_user
  ON orders(clerk_user_id)
  WHERE status NOT IN ('shipped', 'cancelled');


-- ---------- 4. ROW LEVEL SECURITY ----------
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist (idempotent)
DROP POLICY IF EXISTS "users can view own orders"   ON orders;
DROP POLICY IF EXISTS "admins can view all orders"  ON orders;
DROP POLICY IF EXISTS "admins can update orders"    ON orders;
DROP POLICY IF EXISTS "admins can delete orders"    ON orders;
-- NOTE: there is intentionally no INSERT policy for users.
-- All inserts must go through the create_order() RPC below.

-- Users can read only their own orders
CREATE POLICY "users can view own orders"
  ON orders FOR SELECT
  TO authenticated
  USING (clerk_user_id = (auth.jwt() ->> 'sub'));

-- Admins can read everything
CREATE POLICY "admins can view all orders"
  ON orders FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'public_metadata' ->> 'role') = 'admin');

-- Admins can update anything (status changes, tracking, etc.)
CREATE POLICY "admins can update orders"
  ON orders FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'public_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'public_metadata' ->> 'role') = 'admin');

-- Admins can delete (rarely needed, but flexible)
CREATE POLICY "admins can delete orders"
  ON orders FOR DELETE
  TO authenticated
  USING ((auth.jwt() -> 'public_metadata' ->> 'role') = 'admin');


-- ---------- 5. RPC: check_can_book ----------
-- Called from BookOrder page to pre-check eligibility.
-- Returns (can_book bool, reason text).
CREATE OR REPLACE FUNCTION check_can_book()
RETURNS TABLE(can_book BOOLEAN, reason TEXT)
LANGUAGE plpgsql
SECURITY INVOKER  -- runs as caller, respects RLS
AS $$
DECLARE
  uid TEXT := auth.jwt() ->> 'sub';
  active_count INT;
BEGIN
  IF uid IS NULL THEN
    RETURN QUERY SELECT FALSE, 'You must be signed in.';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO active_count
  FROM orders
  WHERE clerk_user_id = uid
    AND status NOT IN ('shipped', 'cancelled');

  IF active_count > 0 THEN
    RETURN QUERY SELECT FALSE, 'You already have an active order. Please wait until it ships before placing another.';
  ELSE
    RETURN QUERY SELECT TRUE, NULL::TEXT;
  END IF;
END $$;


-- ---------- 6. RPC: create_order (ATOMIC) ----------
-- This is the ONLY way users can insert orders.
-- Why a function instead of a plain INSERT policy?
--   1. Race-condition-safe: the partial unique index + advisory lock
--      guarantee even two simultaneous submissions won't both succeed.
--   2. Returns computed queue position in one round-trip.
--   3. Centralizes validation & spam protection.
CREATE OR REPLACE FUNCTION create_order(
  p_product_id      TEXT,
  p_product_name    TEXT,
  p_customer_name   TEXT,
  p_whatsapp_number TEXT,
  p_address         TEXT,
  p_pincode         TEXT
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
SECURITY INVOKER
AS $$
DECLARE
  uid TEXT := auth.jwt() ->> 'sub';
  new_order orders%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING HINT = 'Sign in first.';
  END IF;

  -- Per-user advisory lock prevents double-submit from same user
  -- (even with clock skew / multi-tab). Auto-released at txn end.
  PERFORM pg_advisory_xact_lock(hashtext(uid));

  -- Belt-and-suspenders check (the unique index is the real guarantee)
  IF EXISTS (
    SELECT 1 FROM orders
    WHERE clerk_user_id = uid
      AND status NOT IN ('shipped', 'cancelled')
  ) THEN
    RAISE EXCEPTION 'active_order_exists' USING HINT = 'User already has an active order.';
  END IF;

  INSERT INTO orders (
    clerk_user_id, customer_name, whatsapp_number,
    address, pincode, product_id, product_name
  ) VALUES (
    uid, p_customer_name, p_whatsapp_number,
    p_address, p_pincode, p_product_id, p_product_name
  )
  RETURNING * INTO new_order;

  -- Return the new order + its position within the active queue for its product
  RETURN QUERY
  SELECT
    new_order.id,
    new_order.queue_number,
    (
      SELECT COUNT(*)::INT FROM orders o2
      WHERE o2.product_id = new_order.product_id
        AND o2.status NOT IN ('shipped', 'cancelled')
        AND o2.queue_number <= new_order.queue_number
    ),
    (
      SELECT COUNT(*)::INT FROM orders o3
      WHERE o3.product_id = new_order.product_id
        AND o3.status NOT IN ('shipped', 'cancelled')
    ),
    new_order.status,
    new_order.created_at;
END $$;


-- ---------- 7. VIEW: my_orders_with_position ----------
-- User-facing view with live queue positions.
CREATE OR REPLACE VIEW my_orders_with_position AS
SELECT
  o.*,
  CASE
    WHEN o.status IN ('shipped', 'cancelled') THEN NULL
    ELSE (
      SELECT COUNT(*)::INT FROM orders o2
      WHERE o2.product_id = o.product_id
        AND o2.status NOT IN ('shipped', 'cancelled')
        AND o2.queue_number <= o.queue_number
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

-- IMPORTANT: views don't inherit RLS from base tables by default.
-- Postgres 15+ supports `security_invoker` so the view runs as caller,
-- which means the base table's RLS applies. This is what we want.
ALTER VIEW my_orders_with_position SET (security_invoker = true);

GRANT SELECT ON my_orders_with_position TO authenticated;


-- ---------- 8. VIEW: admin_orders_with_position ----------
-- Same data, but named separately so we're explicit about the admin surface.
-- RLS on the base `orders` table still gates what rows are returned.
CREATE OR REPLACE VIEW admin_orders_with_position AS
SELECT
  o.*,
  CASE
    WHEN o.status IN ('shipped', 'cancelled') THEN NULL
    ELSE (
      SELECT COUNT(*)::INT FROM orders o2
      WHERE o2.product_id = o.product_id
        AND o2.status NOT IN ('shipped', 'cancelled')
        AND o2.queue_number <= o.queue_number
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

ALTER VIEW admin_orders_with_position SET (security_invoker = true);

GRANT SELECT ON admin_orders_with_position TO authenticated;


-- ---------- 9. Enable Realtime on orders ----------
-- Lets MyOrders and Admin pages live-update without polling.
ALTER PUBLICATION supabase_realtime ADD TABLE orders;


-- =============================================
-- DONE.
-- Test with:
--   SELECT * FROM check_can_book();
--   SELECT * FROM create_order('test', 'Test', 'John', '919876543210', '123 Test St', '560001');
-- =============================================
