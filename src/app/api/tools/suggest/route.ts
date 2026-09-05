import { NextResponse } from "next/server";
import { TOOLS_SUGGEST_RATE_LIMIT } from "@/lib/rate-limit/rules";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { suggestToolsRateLimited, suggestToolsSurface } from "@/lib/surfaces/tools";

export async function POST(request: Request) {
	const rate = await checkRateLimit(getClientIp(request), TOOLS_SUGGEST_RATE_LIMIT);
	if (!rate.allowed) {
		const response = suggestToolsRateLimited(rate.retryAfterSeconds);
		return NextResponse.json(response.body, { status: response.statusCode, headers: response.headers });
	}

	const response = await suggestToolsSurface(await request.json().catch(() => null));
	return NextResponse.json(response.body, { status: response.statusCode, headers: response.headers });
}
