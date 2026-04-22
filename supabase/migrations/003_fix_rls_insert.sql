-- =============================================
-- Fix for: "new row violates row-level security policy for table orders"
--
-- Run this ONCE in Supabase SQL Editor.
--
-- WHY:
--   The orders table has RLS enabled and no INSERT policy
--   (intentional — so users can't bypass the RPC).
--   But create_order was SECURITY INVOKER, meaning it ran as
--   the user — who has no INSERT permission. Hence the error.
--
--   Switching to SECURITY DEFINER lets the function run with
--   its owner's privileges (typically postgres, which bypasses RLS).
--   The function still enforces identity via auth.jwt()->>'sub',
--   so users can only ever create orders for themselves.
-- =============================================

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
SECURITY DEFINER                        -- <— changed from INVOKER
SET search_path = public, pg_temp       -- <— best-practice hardening
AS $$
#variable_conflict use_column
DECLARE
  uid       TEXT := auth.jwt() ->> 'sub';
  new_order orders%ROWTYPE;
BEGIN
  -- The JWT check is our ONLY guard on who can create orders.
  -- auth.jwt() still works inside SECURITY DEFINER because it reads
  -- from the request context, not the role.
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING HINT = 'Sign in first.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(uid));

  IF EXISTS (
    SELECT 1 FROM orders AS o
    WHERE o.clerk_user_id = uid
      AND o.status NOT IN ('shipped', 'cancelled')
  ) THEN
    RAISE EXCEPTION 'active_order_exists'
      USING HINT = 'User already has an active order.';
  END IF;

  -- clerk_user_id is ALWAYS set from the JWT — user can't forge it
  INSERT INTO orders (
    clerk_user_id, customer_name, whatsapp_number,
    address, pincode, product_id, product_name
  ) VALUES (
    uid, p_customer_name, p_whatsapp_number,
    p_address, p_pincode, p_product_id, p_product_name
  )
  RETURNING * INTO new_order;

  RETURN QUERY
  SELECT
    new_order.id,
    new_order.queue_number,
    (
      SELECT COUNT(*)::INT FROM orders AS o2
      WHERE o2.product_id   = new_order.product_id
        AND o2.status       NOT IN ('shipped', 'cancelled')
        AND o2.queue_number <= new_order.queue_number
    ),
    (
      SELECT COUNT(*)::INT FROM orders AS o3
      WHERE o3.product_id = new_order.product_id
        AND o3.status     NOT IN ('shipped', 'cancelled')
    ),
    new_order.status,
    new_order.created_at;
END $$;

-- Make sure authenticated users can call it
GRANT EXECUTE ON FUNCTION create_order(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- =============================================
-- Test:
--   After running this, try placing an order again from the app.
--   It should now succeed with a queue number.
-- =============================================