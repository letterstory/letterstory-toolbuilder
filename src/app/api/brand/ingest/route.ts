import { NextResponse } from "next/server";
import { ingestBrandContext } from "@/lib/brand";

export async function POST(request: Request) {
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
