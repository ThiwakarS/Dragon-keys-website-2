-- =============================================
-- DRAGON KEYS — Migration 007 (safe re-run)
--
-- Same as 007, but drops the conflicting policy first so
-- you can run it on a partially-applied database.
-- =============================================

-- ---------- Helper function (idempotent) ----------
CREATE OR REPLACE FUNCTION current_clerk_user_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', ''),
    NULLIF(auth.jwt() ->> 'sub', '')
  );
$$;

GRANT EXECUTE ON FUNCTION current_clerk_user_id() TO authenticated, anon;


-- ---------- Drop ALL policies first (idempotent) ----------
DROP POLICY IF EXISTS "users can view own orders"          ON orders;
DROP POLICY IF EXISTS "admins can view all orders"         ON orders;
DROP POLICY IF EXISTS "admins can update orders"           ON orders;
DROP POLICY IF EXISTS "admins can delete orders"           ON orders;
DROP POLICY IF EXISTS "users can cancel own pending orders" ON orders;


-- ---------- Recreate all policies ----------
CREATE POLICY "users can view own orders"
  ON orders FOR SELECT
  TO authenticated
  USING (clerk_user_id = current_clerk_user_id());

CREATE POLICY "admins can view all orders"
  ON orders FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'public_metadata' ->> 'role') = 'admin');

CREATE POLICY "admins can update orders"
  ON orders FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'public_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'public_metadata' ->> 'role') = 'admin');

CREATE POLICY "admins can delete orders"
  ON orders FOR DELETE
  TO authenticated
  USING ((auth.jwt() -> 'public_metadata' ->> 'role') = 'admin');

CREATE POLICY "users can cancel own pending orders"
  ON orders FOR UPDATE
  TO authenticated
  USING (
    clerk_user_id = current_clerk_user_id()
    AND status IN ('awaiting_deposit', 'in_queue')
  )
  WITH CHECK (
    clerk_user_id = current_clerk_user_id()
    AND status = 'cancelled'
  );

-- =============================================
-- Verify with:
--   SELECT policyname FROM pg_policies WHERE tablename = 'orders';
-- Should list exactly these 5 policies.
-- =============================================