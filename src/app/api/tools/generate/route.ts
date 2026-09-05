import { NextResponse } from "next/server";
import { TOOLS_GENERATE_RATE_LIMIT } from "@/lib/rate-limit/rules";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { generateToolRateLimited, generateToolSurface } from "@/lib/surfaces/tools";

export async function POST(request: Request) {
	try {
		const rate = await checkRateLimit(getClientIp(request), TOOLS_GENERATE_RATE_LIMIT);
		if (!rate.allowed) {
			const response = generateToolRateLimited(rate.retryAfterSeconds);
			return NextResponse.json(response.body, { status: response.statusCode, headers: response.headers });
		}

		const response = await generateToolSurface(await request.json().catch(() => null));
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
