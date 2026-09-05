import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { MCP_RATE_LIMIT_RULES } from "@/lib/rate-limit/rules";
import {
	ingestBrandContextRateLimited,
	validateBrandFidelityRateLimited,
} from "@/lib/surfaces/brand";
import { generateToolRateLimited } from "@/lib/surfaces/tools";
import { MCP_TOOLS_BY_NAME } from "./registry";

export class McpDispatchError extends Error {
	readonly code: number;
	readonly data?: Record<string, unknown>;

	constructor(code: number, message: string, data?: Record<string, unknown>) {
		super(message);
		this.name = "McpDispatchError";
		this.code = code;
		this.data = data;
	}
}

export interface DispatchToolCallOptions {
	name: string;
	arguments: unknown;
	request?: Request;
}

function createRateLimitedResult(name: string, retryAfterSeconds: number) {
	switch (name) {
		case "ingest_brand_context":
			return ingestBrandContextRateLimited(retryAfterSeconds);
		case "validate_brand_fidelity":
			return validateBrandFidelityRateLimited(retryAfterSeconds);
		case "generate_tool":
			return generateToolRateLimited(retryAfterSeconds);
		default:
			return null;
	}
}

export async function dispatchToolCall({ name, arguments: args, request }: DispatchToolCallOptions) {
	const tool = MCP_TOOLS_BY_NAME.get(name);
	if (!tool) {
		throw new McpDispatchError(-32601, `Unknown tool: ${name}`);
	}

	if (tool.rateLimitTag) {
		const rate = await checkRateLimit(
			getClientIp(request ?? new Request("http://localhost/api/mcp")),
			MCP_RATE_LIMIT_RULES[tool.rateLimitTag]
		);
		if (!rate.allowed) {
			const limited = createRateLimitedResult(name, rate.retryAfterSeconds);
			if (!limited) {
				throw new McpDispatchError(-32029, `Rate limit exceeded for ${name}.`, {
					retryAfterSeconds: rate.retryAfterSeconds,
				});
			}
			return {
				name,
				output: limited.body,
				meta: {
					httpStatus: limited.statusCode,
					headers: limited.headers ?? null,
					retryAfterSeconds: rate.retryAfterSeconds,
				},
			};
		}
	}

	const parsed = tool.inputSchema.safeParse(args ?? {});
	if (!parsed.success) {
		throw new McpDispatchError(-32602, `Invalid arguments for ${name}.`, {
			issues: parsed.error.issues,
		});
	}

	const output = await tool.handler(parsed.data, { request });
	return {
		name,
		output,
		meta: {
			httpStatus: 200,
			headers: null,
		},
	};
}
