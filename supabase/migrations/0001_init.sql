-- Letterstory Toolbuilder — Supabase schema
--
-- Run this in the Supabase SQL editor (or via `supabase db push` /
-- `psql "$SUPABASE_DB_URL" -f supabase/migrations/0001_init.sql`) against a
-- fresh project before setting SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in
-- the app's environment. Both src/lib/generation/store.ts and
-- src/lib/security/rate-limit.ts fall back to local-only implementations
-- when Supabase isn't configured, so this is only required once you want
-- durable, multi-instance-safe storage (e.g. once deployed on Porter).

-- ---------------------------------------------------------------------------
-- Tool storage
-- ---------------------------------------------------------------------------
-- One row per generated tool. History is kept as a JSONB array (capped at
-- MAX_HISTORY_ENTRIES=5 by the application, not the database) to mirror the
-- shape the app already worked with with the file-backed store — this keeps
-- the store.supabase.ts implementation a near 1:1 mapping instead of
-- requiring a second table + joins for what is, in practice, a small
-- bounded list per tool.
create table if not exists generated_tools (
	id uuid primary key default gen_random_uuid(),
	project_name text not null,
	prompt text not null,
	site_url text,
	brand_snapshot jsonb,
	html text not null,
	copy jsonb,
	brand_fidelity jsonb,
	model text not null,
	warnings jsonb not null default '[]'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	version integer not null default 1,
	history jsonb not null default '[]'::jsonb
);

create index if not exists generated_tools_created_at_idx on generated_tools (created_at desc);

-- The service-role key used by the app bypasses RLS entirely, but enabling
-- RLS with no policies means the anon/public key (if ever exposed) can't
-- read or write this table at all — defense in depth in case a client-side
-- key is ever wired up by mistake.
alter table generated_tools enable row level security;

-- ---------------------------------------------------------------------------
-- Rate limiting
-- ---------------------------------------------------------------------------
-- Fixed-window counter, keyed by an opaque string the app builds as
-- "{bucket}:{identifier}" (e.g. "tools.generate:203.0.113.4"). One row per
-- active window; the row is reset (not deleted) once its window expires,
-- which keeps table size bounded to one row per (bucket, identifier) pair
-- rather than growing unbounded over time.
create table if not exists rate_limit_counters (
	key text primary key,
	window_start timestamptz not null default now(),
	count integer not null default 0
);

alter table rate_limit_counters enable row level security;

-- Atomically checks-and-increments a fixed-window counter in one round trip.
-- Returns the post-increment count and whether the caller is still within
-- the allowed limit for the window. Using a single SQL statement (rather
-- than read-then-write from the app) avoids a race between concurrent
-- requests from the same identifier under load.
create or replace function rate_limit_check(p_key text, p_window_seconds integer, p_max integer)
returns table (allowed boolean, current_count integer, window_start timestamptz)
language plpgsql
as $$
declare
	v_now timestamptz := now();
	v_row rate_limit_counters%rowtype;
begin
	insert into rate_limit_counters (key, window_start, count)
	values (p_key, v_now, 1)
	on conflict (key) do update
		set count = case
				when rate_limit_counters.window_start <= v_now - make_interval(secs => p_window_seconds)
					then 1
				else rate_limit_counters.count + 1
			end,
			window_start = case
				when rate_limit_counters.window_start <= v_now - make_interval(secs => p_window_seconds)
					then v_now
				else rate_limit_counters.window_start
			end
	returning * into v_row;

	return query select v_row.count <= p_max, v_row.count, v_row.window_start;
end;
$$;
