import { NextResponse } from "next/server";
import { BRAND_INGEST_RATE_LIMIT } from "@/lib/rate-limit/rules";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { ingestBrandContextRateLimited, ingestBrandContextSurface } from "@/lib/surfaces/brand";

export async function POST(request: Request) {
	const rate = await checkRateLimit(getClientIp(request), BRAND_INGEST_RATE_LIMIT);
	if (!rate.allowed) {
		const response = ingestBrandContextRateLimited(rate.retryAfterSeconds);
		return NextResponse.json(response.body, { status: response.statusCode, headers: response.headers });
	}

	const response = await ingestBrandContextSurface(await request.json().catch(() => null));
	return NextResponse.json(response.body, { status: response.statusCode, headers: response.headers });
}
