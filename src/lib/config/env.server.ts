export const envServer = {
	get ANTHROPIC_API_KEY() {
		return process.env.ANTHROPIC_API_KEY?.trim() ?? "";
	},
	get ANTHROPIC_MODEL() {
		return process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-6";
	},
	get CONTEXT_DEV_API_KEY() {
		return process.env.CONTEXT_DEV_API_KEY?.trim() ?? "";
	},
	get CONTEXT_DEV_BASE_URL() {
		return process.env.CONTEXT_DEV_BASE_URL?.trim() || "https://api.context.dev/v1";
	},
	get TOOLBUILDER_BASE_URL() {
		return process.env.TOOLBUILDER_BASE_URL?.trim() ?? "";
	},
	get PORTER_API_TOKEN() {
		return process.env.PORTER_API_TOKEN?.trim() ?? "";
	},
	get PORTER_PROJECT_ID() {
		return process.env.PORTER_PROJECT_ID?.trim() ?? "";
	},
	get PORTER_CLUSTER_ID() {
		return process.env.PORTER_CLUSTER_ID?.trim() ?? "";
	},
	get PORTER_ENVIRONMENT() {
		return process.env.PORTER_ENVIRONMENT?.trim() || "development";
	},
	// Backs both durable tool storage (src/lib/generation/store.ts) and the
	// cross-instance rate limiter (src/lib/security/rate-limit.ts). Both
	// modules fall back to a local-only implementation when these are unset,
	// so the app keeps working without a Supabase project for local dev.
	get SUPABASE_URL() {
		return process.env.SUPABASE_URL?.trim() ?? "";
	},
	// Service-role key — server-only, never exposed to the client. Required
	// because tool storage/rate-limit writes happen from trusted server code
	// (API routes), not from end-user browsers, and need to bypass RLS.
	get SUPABASE_SERVICE_ROLE_KEY() {
		return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
	},
};
