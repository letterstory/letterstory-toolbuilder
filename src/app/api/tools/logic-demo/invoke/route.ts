import { NextResponse } from "next/server";
import { invokeLoanCalculatorDemoSurface } from "@/lib/surfaces/tool-logic-demo";

export const runtime = "nodejs";

export async function POST(request: Request) {
	const response = await invokeLoanCalculatorDemoSurface(await request.json().catch(() => null));
	return NextResponse.json(response.body, {
		status: response.statusCode,
		headers: response.headers,
	});
}
