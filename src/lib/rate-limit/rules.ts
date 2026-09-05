import type { RateLimitRule } from "@/lib/security/rate-limit";

export const BRAND_INGEST_RATE_LIMIT: RateLimitRule = {
	bucket: "brand.ingest",
	max: 15,
	windowSeconds: 600,
};

export const BRAND_VALIDATE_RATE_LIMIT: RateLimitRule = {
	bucket: "brand.validate",
	max: 20,
	windowSeconds: 600,
};

export const TOOLS_GENERATE_RATE_LIMIT: RateLimitRule = {
	bucket: "tools.generate",
	max: 10,
	windowSeconds: 600,
};

export const MCP_RATE_LIMIT_RULES = {
	ingest_brand_context: BRAND_INGEST_RATE_LIMIT,
	validate_brand_fidelity: BRAND_VALIDATE_RATE_LIMIT,
	generate_tool: TOOLS_GENERATE_RATE_LIMIT,
} as const;

export type McpRateLimitedToolName = keyof typeof MCP_RATE_LIMIT_RULES;
