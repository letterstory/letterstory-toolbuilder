import { NextResponse } from "next/server";
import type { BrandProfile } from "@/lib/brand";
import { validateBrandFidelity } from "@/lib/brand";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";

const RATE_LIMIT = { bucket: "brand.validate", max: 20, windowSeconds: 600 };

export async function POST(request: Request) {
	const rate = await checkRateLimit(getClientIp(request), RATE_LIMIT);
	if (!rate.allowed) {
		return NextResponse.json(
			{ status: "error", requestedUrl: "", message: "Too many validation requests — please wait a bit and try again." },
			{ status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
		);
	}

	const body = (await request.json().catch(() => null)) as {
		siteUrl?: unknown;
		profile?: BrandProfile;
	} | null;

	if (!body || typeof body.siteUrl !== "string" || !body.siteUrl.trim() || !body.profile) {
		return NextResponse.json(
			{ status: "error", requestedUrl: "", message: "Provide both siteUrl and profile." },
			{ status: 400 }
		);
	}

	const result = await validateBrandFidelity(body.profile, body.siteUrl);
	return NextResponse.json(result, {
		status: result.status === "error" ? 400 : 200,
	});
}
