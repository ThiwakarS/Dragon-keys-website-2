-- =============================================
-- Fix for: "column reference 'status' is ambiguous"
--
-- Run this ONCE in Supabase SQL Editor.
-- It drops and recreates the create_order function
-- with fully-qualified column references.
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
SECURITY INVOKER
AS $$
#variable_conflict use_column
DECLARE
  uid       TEXT := auth.jwt() ->> 'sub';
  new_order orders%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING HINT = 'Sign in first.';
  END IF;

  -- Per-user advisory lock prevents double-submit race condition
  PERFORM pg_advisory_xact_lock(hashtext(uid));

  -- Check for existing active order — fully qualified to avoid ambiguity
  IF EXISTS (
    SELECT 1
    FROM orders AS o
    WHERE o.clerk_user_id = uid
      AND o.status NOT IN ('shipped', 'cancelled')
  ) THEN
    RAISE EXCEPTION 'active_order_exists'
      USING HINT = 'User already has an active order.';
  END IF;

  INSERT INTO orders (
    clerk_user_id, customer_name, whatsapp_number,
    address, pincode, product_id, product_name
  ) VALUES (
    uid, p_customer_name, p_whatsapp_number,
    p_address, p_pincode, p_product_id, p_product_name
  )
  RETURNING * INTO new_order;

  -- Return new order + queue position, all qualified
  RETURN QUERY
  SELECT
    new_order.id,
    new_order.queue_number,
    (
      SELECT COUNT(*)::INT
      FROM orders AS o2
      WHERE o2.product_id   = new_order.product_id
        AND o2.status       NOT IN ('shipped', 'cancelled')
        AND o2.queue_number <= new_order.queue_number
    ),
    (
      SELECT COUNT(*)::INT
      FROM orders AS o3
      WHERE o3.product_id = new_order.product_id
        AND o3.status     NOT IN ('shipped', 'cancelled')
    ),
    new_order.status,
    new_order.created_at;
END $$;

-- Also fix the eligibility check, same issue lurking
CREATE OR REPLACE FUNCTION check_can_book()
RETURNS TABLE(can_book BOOLEAN, reason TEXT)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
#variable_conflict use_column
DECLARE
  uid          TEXT := auth.jwt() ->> 'sub';
  active_count INT;
BEGIN
  IF uid IS NULL THEN
    RETURN QUERY SELECT FALSE, 'You must be signed in.';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO active_count
  FROM orders AS o
  WHERE o.clerk_user_id = uid
    AND o.status NOT IN ('shipped', 'cancelled');

  IF active_count > 0 THEN
    RETURN QUERY SELECT FALSE,
      'You already have an active order. Please wait until it ships before placing another.';
  ELSE
    RETURN QUERY SELECT TRUE, NULL::TEXT;
  END IF;
END $$;