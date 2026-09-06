function readEnv(name: string): string {
	const value = process.env[name];
	return typeof value === "string" ? value.trim() : "";
}

export const envServer = {
	get ANTHROPIC_API_KEY() {
		return readEnv("ANTHROPIC_API_KEY");
	},
	get ANTHROPIC_MODEL() {
		return readEnv("ANTHROPIC_MODEL") || "claude-sonnet-4-6";
	},
	get CONTEXT_DEV_API_KEY() {
		return readEnv("CONTEXT_DEV_API_KEY");
	},
	get CONTEXT_DEV_BASE_URL() {
		return readEnv("CONTEXT_DEV_BASE_URL") || "https://api.context.dev/v1";
	},
	get FIRECRAWL_API_KEY() {
		return readEnv("FIRECRAWL_API_KEY");
	},
	get TOOLBUILDER_BASE_URL() {
		return readEnv("TOOLBUILDER_BASE_URL");
	},
	get PORTER_API_TOKEN() {
		return readEnv("PORTER_API_TOKEN") || readEnv("PORTER_TOKEN");
	},
	get PORTER_PROJECT_ID() {
		return readEnv("PORTER_PROJECT_ID") || readEnv("PORTER_PROJECT");
	},
	get PORTER_CLUSTER_ID() {
		return readEnv("PORTER_CLUSTER_ID") || readEnv("PORTER_CLUSTER");
	},
	get PORTER_ENVIRONMENT() {
		return readEnv("PORTER_ENVIRONMENT") || "development";
	},
	// Backs both durable tool storage (src/lib/generation/store.ts) and the
	// cross-instance rate limiter (src/lib/security/rate-limit.ts). Both
	// modules fall back to a local-only implementation when these are unset,
	// so the app keeps working without a Supabase project for local dev.
	get SUPABASE_URL() {
		return readEnv("SUPABASE_URL");
	},
	// Service-role key — server-only, never exposed to the client. Required
	// because tool storage/rate-limit writes happen from trusted server code
	// (API routes), not from end-user browsers, and need to bypass RLS.
	get SUPABASE_SERVICE_ROLE_KEY() {
		return readEnv("SUPABASE_SERVICE_ROLE_KEY");
	},
};
