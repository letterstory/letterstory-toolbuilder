import { NextResponse } from "next/server";
import { getPlatformScaffoldStatus } from "@/lib/platform/status";

export function GET() {
	return NextResponse.json({
		ok: true,
		service: "letterstory-toolbuilder",
		status: getPlatformScaffoldStatus(),
	});
}
