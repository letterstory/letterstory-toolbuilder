import { after, NextResponse } from "next/server";
import { finalizeCompetitorContextForTool } from "@/lib/brand/competitor-context";
import { TOOLS_GENERATE_RATE_LIMIT } from "@/lib/rate-limit/rules";
import { finalizeVisualCongruenceForTool } from "@/lib/generation/visual-congruence";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { generateToolRateLimited, generateToolSurface } from "@/lib/surfaces/tools";

function scheduleAfterResponse(task: () => Promise<void>) {
	try {
		after(task);
	} catch (error) {
		console.warn(
			"[tool-generation-route]",
			`after() unavailable; running background follow-up immediately: ${
				error instanceof Error ? error.message : String(error)
			}`
		);
		void task();
	}
}

export async function POST(request: Request) {
	try {
		const rate = await checkRateLimit(getClientIp(request), TOOLS_GENERATE_RATE_LIMIT);
		if (!rate.allowed) {
			const response = generateToolRateLimited(rate.retryAfterSeconds);
			return NextResponse.json(response.body, { status: response.statusCode, headers: response.headers });
		}

		const response = await generateToolSurface(await request.json().catch(() => null), { request });
		if (response.body.status === "success") {
			const tool = response.body.tool;
			const { id, version } = tool;
			scheduleAfterResponse(async () => {
				await Promise.allSettled([
					tool.visualCongruence?.status === "pending"
						? finalizeVisualCongruenceForTool({ toolId: id, expectedVersion: version })
						: Promise.resolve(),
					tool.brandSnapshot?.competitorContext?.status === "pending"
						? finalizeCompetitorContextForTool({ toolId: id, expectedVersion: version })
						: Promise.resolve(),
				]);
			});
		}
		return NextResponse.json(response.body, {
			status: response.statusCode,
			headers: response.headers,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error("[tool-generation-route]", message);
		return NextResponse.json(
			{ status: "error", message: `Tool generation failed unexpectedly: ${message}` },
			{ status: 500 }
		);
	}
}
