import { NextResponse } from "next/server";
import { BRAND_VALIDATE_RATE_LIMIT } from "@/lib/rate-limit/rules";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { validateBrandFidelityRateLimited, validateBrandFidelitySurface } from "@/lib/surfaces/brand";

export async function POST(request: Request) {
	const rate = await checkRateLimit(getClientIp(request), BRAND_VALIDATE_RATE_LIMIT);
	if (!rate.allowed) {
		const response = validateBrandFidelityRateLimited(rate.retryAfterSeconds);
		return NextResponse.json(response.body, { status: response.statusCode, headers: response.headers });
	}

	const response = await validateBrandFidelitySurface(await request.json().catch(() => null));
	return NextResponse.json(response.body, { status: response.statusCode, headers: response.headers });
}
