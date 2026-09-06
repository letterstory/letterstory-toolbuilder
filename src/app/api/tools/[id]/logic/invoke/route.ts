import { NextResponse } from "next/server";
import { invokeGeneratedToolLogicSurface } from "@/lib/surfaces/tool-logic";

export const runtime = "nodejs";

export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> }
) {
	const { id } = await context.params;
	const response = await invokeGeneratedToolLogicSurface(
		id,
		await request.json().catch(() => null)
	);
	return NextResponse.json(response.body, {
		status: response.statusCode,
		headers: response.headers,
	});
}
