import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { envServer } from "@/lib/config/env.server";

/**
 * Shared Supabase admin client, used by both durable tool storage
 * (src/lib/generation/store.ts) and the cross-instance rate limiter
 * (src/lib/security/rate-limit.ts). Both callers gate on
 * `isSupabaseConfigured()` first and fall back to a local-only
 * implementation when it's false, so this is safe to import even when no
 * Supabase project is configured (the client is just never constructed).
 */

export function isSupabaseConfigured(): boolean {
	return Boolean(envServer.SUPABASE_URL && envServer.SUPABASE_SERVICE_ROLE_KEY);
}

let cachedClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
	if (!isSupabaseConfigured()) {
		throw new Error("Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are unset).");
	}
	if (!cachedClient) {
		cachedClient = createClient(envServer.SUPABASE_URL, envServer.SUPABASE_SERVICE_ROLE_KEY, {
			auth: { persistSession: false },
		});
	}
	return cachedClient;
}
