-- Create players table for presence
CREATE TABLE IF NOT EXISTS public.players (
  id uuid PRIMARY KEY,
  room text NOT NULL,
  name text NOT NULL,
  lastSeen timestamptz DEFAULT now()
);

-- Indexes for efficient queries (room lookups, lastSeen filtering for prune)
CREATE INDEX IF NOT EXISTS players_room_idx ON public.players (room);
CREATE INDEX IF NOT EXISTS players_last_seen_idx ON public.players (lastSeen);

-- Enable Row Level Security (RLS). By default this file enables RLS and
-- includes a permissive development policy so the app keeps working while
-- you migrate to proper authentication-based policies.
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

-- DEVELOPMENT POLICY (permissive) --------------------------------------------------
-- The following policy allows the built-in roles (anon/authenticated) to
-- read/write players rows. This is convenient for development but NOT
-- recommended for production as it effectively bypasses RLS protections.
-- Replace these policies with the secure examples below before deploying.
-- PRODUCTION-READY POLICIES -----------------------------------------------------
-- The secure policy below requires that a user is authenticated via Supabase
-- Auth and that `auth.uid()` matches the `id` column on the `players` row.
-- This ensures each authenticated user can only create/read/update/delete
-- their own presence row. You must update the client to use Supabase Auth and
-- to set the `id` value to `auth.user().id` (or omit `id` and let the server
-- insert it using the authenticated user's id).

-- Remove any permissive development policy if present
-- Allow authenticated users to manage only their own players row
-- Since this project is intended to work without requiring logins,
-- we provide a permissive policy that allows anonymous (browser) clients
-- to create and manage `players` rows. WARNING: this allows any client to
-- modify any row if they know the `id`. This is acceptable for low-risk
-- public games but is NOT recommended for sensitive data.

DROP POLICY IF EXISTS players_self_management ON public.players;
DROP POLICY IF EXISTS allow_dev_on_players ON public.players;

CREATE POLICY allow_dev_on_players
  ON public.players
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- NOTES:
-- 1) If you need server-side cleanup tasks (prune script) to remove stale rows
--    they should run using the Supabase service_role key; service role requests
--    bypass RLS by design when using the service key on the server side.
-- 2) If you prefer to allow anonymous, browser-generated UUIDs in development,
--    you can temporarily enable a permissive policy during development, but do
--    not deploy a permissive policy to production.

-- SECURE POLICY EXAMPLE (recommended for production) -----------------------------
-- If you use Supabase Auth and want each user to manage only their own
-- `players` row, use policies like the following (uncomment and adapt):
--
-- ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY players_self_management ON public.players
--   FOR ALL
--   USING (auth.uid() = id)
--   WITH CHECK (auth.uid() = id);
--
-- With the above, ensure the `id` you insert equals `auth.uid()` (the
-- authenticated user's UUID). This prevents anonymous client-side UUIDs
-- from being used as identifiers in production.

