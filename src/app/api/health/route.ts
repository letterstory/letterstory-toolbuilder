import { NextResponse } from "next/server";
import { getHealthPayload } from "@/lib/surfaces/health";

export function GET() {
	return NextResponse.json(getHealthPayload());
}
