// Fixed-window rate limiter for expensive/paid-API-backed routes
// (Anthropic tool generation, Firecrawl brand ingestion/compare/validate).
//
// Backed by Supabase (rate_limit_counters table + rate_limit_check RPC, see
// supabase/migrations/0001_init.sql) when configured, so limits hold across
// multiple server instances/regions. Falls back to an in-process Map when
// Supabase isn't configured — correct for local dev / a single instance,
// but NOT enforced across instances, which is fine for local hacking but
// should not be relied on in a real multi-instance deploy.
import { isSupabaseConfigured, getSupabaseClient } from "@/lib/config/supabase";

export interface RateLimitResult {
	allowed: boolean;
	limit: number;
	remaining: number;
	/** Seconds until the caller may retry, only meaningful when `allowed` is false. */
	retryAfterSeconds: number;
}

export interface RateLimitRule {
	/** Logical bucket name, e.g. "tools.generate" — kept distinct per route so limits don't bleed across endpoints. */
	bucket: string;
	/** Max requests allowed per identifier within the window. */
	max: number;
	windowSeconds: number;
}

// In-memory fallback state: bucket:identifier -> { windowStart, count }.
const memoryWindows = new Map<string, { windowStart: number; count: number }>();

function checkInMemory(key: string, rule: RateLimitRule): RateLimitResult {
	const now = Date.now();
	const windowMs = rule.windowSeconds * 1000;
	const existing = memoryWindows.get(key);

	if (!existing || now - existing.windowStart >= windowMs) {
		memoryWindows.set(key, { windowStart: now, count: 1 });
		return { allowed: true, limit: rule.max, remaining: rule.max - 1, retryAfterSeconds: 0 };
	}

	existing.count += 1;
	const allowed = existing.count <= rule.max;
	const retryAfterSeconds = allowed ? 0 : Math.ceil((existing.windowStart + windowMs - now) / 1000);
	return {
		allowed,
		limit: rule.max,
		remaining: Math.max(0, rule.max - existing.count),
		retryAfterSeconds,
	};
}

async function checkInSupabase(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
	const { data, error } = await getSupabaseClient().rpc("rate_limit_check", {
		p_key: key,
		p_window_seconds: rule.windowSeconds,
		p_max: rule.max,
	});

	if (error || !data || !data[0]) {
		// Fail open: a rate-limiter outage shouldn't take down the whole
		// product. Falling back to the in-memory check still gives *some*
		// protection for this instance rather than none.
		return checkInMemory(key, rule);
	}

	const row = data[0] as { allowed: boolean; current_count: number; window_start: string };
	const windowStartMs = new Date(row.window_start).getTime();
	const retryAfterSeconds = row.allowed
		? 0
		: Math.max(0, Math.ceil((windowStartMs + rule.windowSeconds * 1000 - Date.now()) / 1000));
	return {
		allowed: row.allowed,
		limit: rule.max,
		remaining: Math.max(0, rule.max - row.current_count),
		retryAfterSeconds,
	};
}

/**
 * Checks (and records) one request against a rate limit rule for the given
 * identifier (typically a client IP). Call this before doing the expensive
 * work, not after — the counter is incremented as part of the check.
 */
export async function checkRateLimit(identifier: string, rule: RateLimitRule): Promise<RateLimitResult> {
	const key = `${rule.bucket}:${identifier}`;
	if (isSupabaseConfigured()) {
		return checkInSupabase(key, rule);
	}
	return checkInMemory(key, rule);
}

/** Best-effort client IP extraction for rate-limit keying (App Router `Request` has no built-in `.ip`). */
export function getClientIp(request: Request): string {
	const forwardedFor = request.headers.get("x-forwarded-for");
	if (forwardedFor) {
		const first = forwardedFor.split(",")[0]?.trim();
		if (first) return first;
	}
	const realIp = request.headers.get("x-real-ip");
	if (realIp) return realIp.trim();
	return "unknown";
}
