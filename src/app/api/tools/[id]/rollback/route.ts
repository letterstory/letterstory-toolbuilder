import { NextResponse } from "next/server";
import { rollbackGeneratedToolSurface } from "@/lib/surfaces/tools";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
	const { id } = await context.params;
	const body = (await request.json().catch(() => null)) as { version?: unknown } | null;
	const response = await rollbackGeneratedToolSurface({
		id,
		version: typeof body?.version === "number" ? body.version : body?.version,
	});
	return NextResponse.json(response.body, { status: response.statusCode });
}
