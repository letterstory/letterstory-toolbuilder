import { NextResponse } from "next/server";
import { generateTool } from "@/lib/generation";

export async function POST(request: Request) {
	const body = (await request.json().catch(() => null)) as
		| { projectName?: unknown; siteUrl?: unknown; prompt?: unknown }
		| null;

	if (!body || typeof body.prompt !== "string" || !body.prompt.trim()) {
		return NextResponse.json(
			{ status: "error", message: "Describe the tool you want generated." },
			{ status: 400 }
		);
	}

	const result = await generateTool({
		projectName: typeof body.projectName === "string" ? body.projectName : "",
		siteUrl: typeof body.siteUrl === "string" ? body.siteUrl : "",
		prompt: body.prompt,
	});

	return NextResponse.json(result, { status: result.status === "success" ? 200 : 400 });
}
