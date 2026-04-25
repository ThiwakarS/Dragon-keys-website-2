-- =============================================
-- DRAGON KEYS — Migration 008
-- Features 1, 2, 3:
--   * homepage notices (admin-managed)
--   * user-initiated cancellation with optional reason
--   * product reviews (only for users with a 'delivered' order)
--   * adds 'delivered' to order_status enum
-- =============================================


-- ---------- 1. Add 'delivered' to the status enum ----------
-- Postgres enum: append a new value AFTER 'shipped'.
-- This is idempotent: wrapped in a DO block that catches
-- duplicate_object in case it was already run.
DO $$ BEGIN
  ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'delivered' AFTER 'shipped';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ---------- 2. NOTICES table ----------
-- Admin posts site-wide notices. Users see them on the homepage.
CREATE TABLE IF NOT EXISTS notices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level       TEXT NOT NULL CHECK (level IN ('info','success','warning','danger')),
  message     TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 500),
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  TEXT  -- clerk_user_id of the admin who posted it
);

CREATE INDEX IF NOT EXISTS idx_notices_active_created ON notices(active, created_at DESC);

ALTER TABLE notices ENABLE ROW LEVEL SECURITY;

-- Anyone (signed in OR signed out) can read ACTIVE notices
DROP POLICY IF EXISTS "anyone can read active notices" ON notices;
CREATE POLICY "anyone can read active notices"
  ON notices FOR SELECT
  TO authenticated, anon
  USING (active = TRUE);

-- Admins can see everything (active + inactive)
DROP POLICY IF EXISTS "admins can read all notices" ON notices;
CREATE POLICY "admins can read all notices"
  ON notices FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'public_metadata' ->> 'role') = 'admin');

-- Admins can insert/update/delete
DROP POLICY IF EXISTS "admins can manage notices" ON notices;
CREATE POLICY "admins can manage notices"
  ON notices FOR ALL
  TO authenticated
  USING ((auth.jwt() -> 'public_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'public_metadata' ->> 'role') = 'admin');

-- Realtime so homepage banner updates live
ALTER PUBLICATION supabase_realtime ADD TABLE notices;


-- ---------- 3. REVIEWS table ----------
-- One review per (user, product). User must have at least one
-- 'delivered' order for that product to be allowed.
CREATE TABLE IF NOT EXISTS reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id   TEXT NOT NULL,
  customer_name   TEXT NOT NULL,            -- snapshotted from order, so it shows the name the user used
  product_id      TEXT NOT NULL,
  rating          SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body            TEXT CHECK (body IS NULL OR length(body) BETWEEN 1 AND 2000),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clerk_user_id, product_id)        -- one review per user per product
);

CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id, created_at DESC);

CREATE TRIGGER trg_reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Anyone can read reviews (reviews are public)
DROP POLICY IF EXISTS "anyone can read reviews" ON reviews;
CREATE POLICY "anyone can read reviews"
  ON reviews FOR SELECT
  TO authenticated, anon
  USING (TRUE);

-- Users can INSERT only reviews for themselves — but eligibility
-- (must have a delivered order) is enforced by the RPC, which is
-- the only writer. We do NOT add a plain insert policy here —
-- all inserts go through submit_review().

-- Users can UPDATE / DELETE only their own reviews
DROP POLICY IF EXISTS "users can update own reviews" ON reviews;
CREATE POLICY "users can update own reviews"
  ON reviews FOR UPDATE
  TO authenticated
  USING (clerk_user_id = current_clerk_user_id())
  WITH CHECK (clerk_user_id = current_clerk_user_id());

DROP POLICY IF EXISTS "users can delete own reviews" ON reviews;
CREATE POLICY "users can delete own reviews"
  ON reviews FOR DELETE
  TO authenticated
  USING (clerk_user_id = current_clerk_user_id());

-- Admins can manage (rare — for abuse removal)
DROP POLICY IF EXISTS "admins can manage reviews" ON reviews;
CREATE POLICY "admins can manage reviews"
  ON reviews FOR ALL
  TO authenticated
  USING ((auth.jwt() -> 'public_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'public_metadata' ->> 'role') = 'admin');

ALTER PUBLICATION supabase_realtime ADD TABLE reviews;


-- ---------- 4. RPC: submit_review ----------
-- Only way to create a review. Checks that the user has at least
-- one 'delivered' order for this product. UPSERTs: if the user
-- already has a review for this product, it updates it.
CREATE OR REPLACE FUNCTION submit_review(
  p_product_id TEXT,
  p_rating     SMALLINT,
  p_body       TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid          TEXT := auth.jwt() ->> 'sub';
  name_snap    TEXT;
  review_id    UUID;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'invalid_rating';
  END IF;

  -- Grab the most recent customer_name from this user's delivered order
  -- for this product. Also enforces the "must have delivered order" rule.
  SELECT customer_name INTO name_snap
  FROM orders
  WHERE clerk_user_id = uid
    AND product_id    = p_product_id
    AND status        = 'delivered'
  ORDER BY created_at DESC
  LIMIT 1;

  IF name_snap IS NULL THEN
    RAISE EXCEPTION 'not_eligible_to_review'
      USING HINT = 'You need a delivered order for this product before reviewing.';
  END IF;

  INSERT INTO reviews (clerk_user_id, customer_name, product_id, rating, body)
  VALUES (uid, name_snap, p_product_id, p_rating, NULLIF(trim(p_body), ''))
  ON CONFLICT (clerk_user_id, product_id) DO UPDATE
    SET rating     = EXCLUDED.rating,
        body       = EXCLUDED.body,
        updated_at = NOW()
  RETURNING id INTO review_id;

  RETURN review_id;
END $$;

GRANT EXECUTE ON FUNCTION submit_review(TEXT, SMALLINT, TEXT) TO authenticated;


-- ---------- 5. RPC: cancel_my_order ----------
-- User-initiated cancellation. Only works if the order is still
-- 'awaiting_deposit' or 'in_queue'. Once printing starts, user
-- can't cancel (admin must do it).
CREATE OR REPLACE FUNCTION cancel_my_order(
  p_order_id UUID,
  p_reason   TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid    TEXT := auth.jwt() ->> 'sub';
  target orders%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO target FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  -- Must be the order's owner
  IF target.clerk_user_id <> uid THEN
    RAISE EXCEPTION 'not_your_order';
  END IF;

  -- Already terminated: do nothing
  IF target.status IN ('shipped', 'delivered', 'cancelled') THEN
    RAISE EXCEPTION 'already_final' USING HINT = 'This order can no longer be cancelled.';
  END IF;

  -- Cannot cancel once printing has started
  IF target.status NOT IN ('awaiting_deposit', 'in_queue') THEN
    RAISE EXCEPTION 'too_late_to_cancel'
      USING HINT = 'Printing has started. Please contact us on WhatsApp.';
  END IF;

  UPDATE orders
    SET status              = 'cancelled',
        cancellation_reason = COALESCE(NULLIF(trim(p_reason), ''), 'Cancelled by customer'),
        is_current          = FALSE,
        updated_at          = NOW()
  WHERE id = p_order_id;
END $$;

GRANT EXECUTE ON FUNCTION cancel_my_order(UUID, TEXT) TO authenticated;


-- ---------- 6. Aggregated reviews view (optional convenience) ----------
-- Lets the product modal show rating stats without a client-side reduce.
CREATE OR REPLACE VIEW product_review_stats
WITH (security_invoker = true) AS
SELECT
  product_id,
  COUNT(*)::INT                              AS review_count,
  ROUND(AVG(rating)::NUMERIC, 2)             AS avg_rating
FROM reviews
GROUP BY product_id;

GRANT SELECT ON product_review_stats TO authenticated, anon;


-- =============================================
-- Verify with:
--   SELECT unnest(enum_range(NULL::order_status));  -- should include 'delivered'
--   SELECT policyname FROM pg_policies WHERE tablename = 'notices';
--   SELECT policyname FROM pg_policies WHERE tablename = 'reviews';
-- =============================================