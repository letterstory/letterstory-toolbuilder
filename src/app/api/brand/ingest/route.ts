import { NextResponse } from "next/server";
import { ingestBrandContext } from "@/lib/brand";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";

const RATE_LIMIT = { bucket: "brand.ingest", max: 15, windowSeconds: 600 };

export async function POST(request: Request) {
	const rate = await checkRateLimit(getClientIp(request), RATE_LIMIT);
	if (!rate.allowed) {
		return NextResponse.json(
			{ status: "error", requestedUrl: "", message: "Too many brand ingestion requests — please wait a bit and try again." },
			{ status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
		);
	}

	const body = (await request.json().catch(() => null)) as { siteUrl?: unknown } | null;
	if (!body || typeof body.siteUrl !== "string" || !body.siteUrl.trim()) {
		return NextResponse.json(
			{ status: "error", requestedUrl: "", message: "Provide a siteUrl string." },
			{ status: 400 }
		);
	}

	const result = await ingestBrandContext({ siteUrl: body.siteUrl });
	return NextResponse.json(result, { status: result.status === "error" ? 400 : 200 });
}
