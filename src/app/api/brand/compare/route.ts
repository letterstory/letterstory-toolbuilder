import { NextResponse } from "next/server";
import type { BrandProfile } from "@/lib/brand";
import { compareBrandAgainstCompetitors } from "@/lib/brand";

export async function POST(request: Request) {
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
