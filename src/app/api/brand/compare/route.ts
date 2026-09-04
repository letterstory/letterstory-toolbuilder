import { NextResponse } from "next/server";
import type { BrandProfile } from "@/lib/brand";
import { compareBrandAgainstCompetitors } from "@/lib/brand";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";

// Tightest brand-route limit: this can crawl several competitor URLs in a
// single request, so it's the most expensive of the three per-call.
const RATE_LIMIT = { bucket: "brand.compare", max: 5, windowSeconds: 600 };

export async function POST(request: Request) {
	const rate = await checkRateLimit(getClientIp(request), RATE_LIMIT);
	if (!rate.allowed) {
		return NextResponse.json(
			{ status: "error", requestedUrl: "", message: "Too many comparison requests — please wait a bit and try again." },
			{ status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
		);
	}

	const body = (await request.json().catch(() => null)) as {
		primarySiteUrl?: unknown;
		competitorUrls?: unknown;
		primaryProfile?: BrandProfile;
	} | null;

	const competitorUrls = Array.isArray(body?.competitorUrls)
		? body.competitorUrls.filter((url): url is string => typeof url === "string" && url.trim().length > 0)
		: [];

	if (!body || typeof body.primarySiteUrl !== "string" || !body.primarySiteUrl.trim() || !competitorUrls.length) {
		return NextResponse.json(
			{
				status: "error",
				requestedUrl: typeof body?.primarySiteUrl === "string" ? body.primarySiteUrl : "",
				message: "Provide primarySiteUrl and at least one competitorUrls entry.",
			},
			{ status: 400 }
		);
	}

	const result = await compareBrandAgainstCompetitors({
		primarySiteUrl: body.primarySiteUrl,
		competitorUrls,
		primaryProfile: body.primaryProfile,
	});
	return NextResponse.json(result, {
		status: result.status === "error" ? 400 : 200,
	});
}
