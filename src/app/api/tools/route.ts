import { NextResponse } from "next/server";
import { listGeneratedToolsSurface } from "@/lib/surfaces/tools";

export async function GET() {
	const response = await listGeneratedToolsSurface();
	return NextResponse.json(response.body, { status: response.statusCode });
}
