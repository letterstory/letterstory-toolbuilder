export const envServer = {
	get ANTHROPIC_API_KEY() {
		return process.env.ANTHROPIC_API_KEY?.trim() ?? "";
	},
	get ANTHROPIC_MODEL() {
		return process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-6";
	},
	get FIRECRAWL_API_KEY() {
		return process.env.FIRECRAWL_API_KEY?.trim() ?? "";
	},
	get FIRECRAWL_BASE_URL() {
		return process.env.FIRECRAWL_BASE_URL?.trim() || "https://api.firecrawl.dev";
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
};
