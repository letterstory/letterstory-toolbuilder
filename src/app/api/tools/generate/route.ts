import { NextResponse } from "next/server";
import { generateTool } from "@/lib/generation";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";

// Tool generation is the most expensive route in the app (up to four
// Anthropic requests per request: primary HTML build, one fallback retry,
// plus advisory copy + brand-fidelity checks) and is reachable with no
// auth, so it gets the tightest limit of the paid-API-backed routes.
const RATE_LIMIT = { bucket: "tools.generate", max: 10, windowSeconds: 600 };

export async function POST(request: Request) {
	const rate = await checkRateLimit(getClientIp(request), RATE_LIMIT);
	if (!rate.allowed) {
		return NextResponse.json(
			{ status: "error", message: "Too many tool generation requests — please wait a bit and try again." },
			{ status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
		);
	}

	const body = (await request.json().catch(() => null)) as
		| { projectName?: unknown; siteUrl?: unknown; prompt?: unknown; toolId?: unknown }
		| null;

	if (!body || typeof body.prompt !== "string" || !body.prompt.trim()) {
		return NextResponse.json(
			{ status: "error", message: "Describe the tool you want generated." },
			{ status: 400 }
		);
	}

	const result = await generateTool({
		projectName: typeof body.projectName === "string" ? body.projectName : "",
		siteUrl: typeof body.siteUrl === "string" ? body.siteUrl : "",
		prompt: body.prompt,
		toolId: typeof body.toolId === "string" && body.toolId.trim() ? body.toolId.trim() : undefined,
	});
	const { diagnostics, ...responseBody } = result;

	return NextResponse.json(responseBody, {
		status: result.status === "success" ? 200 : 400,
		headers: diagnostics
			? {
					"Server-Timing": [
						`total;dur=${diagnostics.totalMs}`,
						`brand;dur=${diagnostics.brandContextMs}`,
						`build;dur=${diagnostics.buildMs}`,
						`advisory;dur=${diagnostics.advisoryMs}`,
					].join(", "),
				}
			: undefined,
	});
}
