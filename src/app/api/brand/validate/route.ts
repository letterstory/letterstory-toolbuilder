import { NextResponse } from "next/server";
import type { BrandProfile } from "@/lib/brand";
import { validateBrandFidelity } from "@/lib/brand";

export async function POST(request: Request) {
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
