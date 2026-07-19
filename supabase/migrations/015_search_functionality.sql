-- =============================================
-- DRAGON KEYS — Migration 015
-- Indexes backing the new ADMIN ORDER SEARCH.
--
-- WHAT THE FEATURE DOES (frontend: Admin.jsx)
--   The admin panel gets a search bar with three modes:
--     * Customer name  -> partial, case-insensitive:  customer_name ILIKE '%term%'
--     * Queue number   -> exact:                      queue_number = N
--     * Order ID       -> exact primary-key lookup:   id = '<uuid>'
--   Search always covers ALL orders in every status, paginated at 100
--   rows per page, so no query can ever pull the whole table.
--
-- WHY THIS MIGRATION EXISTS
--   A leading-wildcard ILIKE ('%term%') canNOT use a normal btree index —
--   without help it seq-scans the whole table on every keystroke-worth of
--   search. Fine at 1,300 rows, but it degrades linearly as you grow and
--   eventually hits the free-tier statement timeout (same class of problem
--   as the admin page-3 timeout fixed in migration 013).
--
--   The fix is the pg_trgm extension: it breaks text into 3-character
--   "trigrams" and a GIN index over them serves arbitrary substring
--   matches efficiently, at any table size.
--
--   Order-ID search needs nothing (id is the PRIMARY KEY). Queue-number
--   search gets a btree index IF one doesn't already exist (001 may have
--   created one via a UNIQUE constraint; we check instead of duplicating).
--
-- Safe to re-run: every step is guarded.
-- =============================================


-- ---------- 1. pg_trgm extension + trigram index on customer_name ----------
-- Supabase convention is to install extensions into the `extensions`
-- schema; older projects sometimes have them in `public`. This block
-- handles both: install if missing (preferring `extensions`), then find
-- whichever schema the gin_trgm_ops operator class actually lives in and
-- build the index with an explicit reference to it — so this works no
-- matter how/where the extension was enabled.
DO $$
DECLARE
  opclass_schema TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    BEGIN
      CREATE EXTENSION pg_trgm WITH SCHEMA extensions;
    EXCEPTION WHEN OTHERS THEN
      -- `extensions` schema not available (e.g. plain Postgres): default location.
      CREATE EXTENSION pg_trgm;
    END;
  END IF;

  SELECT n.nspname INTO opclass_schema
  FROM pg_opclass oc
  JOIN pg_namespace n ON n.oid = oc.opcnamespace
  WHERE oc.opcname = 'gin_trgm_ops'
  LIMIT 1;

  IF opclass_schema IS NULL THEN
    RAISE EXCEPTION 'pg_trgm installed but gin_trgm_ops not found — enable pg_trgm in Dashboard > Database > Extensions, then re-run.';
  END IF;

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_orders_customer_name_trgm
       ON orders USING gin (customer_name %I.gin_trgm_ops)',
    opclass_schema
  );
END $$;


-- ---------- 2. btree index on queue_number (only if none exists) ----------
-- Serves the exact queue-number search AND the `ORDER BY queue_number DESC`
-- used to sort search results / shipped / delivered tabs. Skipped if any
-- index already leads with queue_number (e.g. a UNIQUE constraint from the
-- initial schema) — a duplicate index would just waste writes and space.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class t      ON t.oid = i.indrelid
    JOIN pg_namespace ns ON ns.oid = t.relnamespace
    JOIN pg_attribute a  ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
    WHERE ns.nspname = 'public'
      AND t.relname  = 'orders'
      AND a.attname  = 'queue_number'
  ) THEN
    CREATE INDEX idx_orders_queue_number ON orders (queue_number);
  END IF;
END $$;


-- =============================================
-- VERIFY after running:
--
--   -- Extension present:
--   SELECT extname, nspname
--   FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
--   WHERE extname = 'pg_trgm';
--
--   -- Indexes on orders (expect idx_orders_customer_name_trgm, and a
--   -- queue_number index — either the new one or a pre-existing unique):
--   SELECT indexname FROM pg_indexes WHERE tablename = 'orders';
--
--   -- The name search should use the trigram index (look for a
--   -- "Bitmap Index Scan on idx_orders_customer_name_trgm" in the plan):
--   EXPLAIN ANALYZE
--   SELECT * FROM orders WHERE customer_name ILIKE '%ram%'
--   ORDER BY queue_number DESC LIMIT 100;
-- =============================================