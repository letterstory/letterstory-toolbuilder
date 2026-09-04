import { NextResponse } from "next/server";
import { rollbackGeneratedTool } from "@/lib/generation/store";

/**
 * Restores a tool (same id/embed URL) to a previous version kept in its
 * history — the "undo" half of iterative editing, for when a revision made
 * things worse rather than better.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
	const { id } = await context.params;
	const body = (await request.json().catch(() => null)) as { version?: unknown } | null;
	const version = typeof body?.version === "number" ? body.version : NaN;

	if (!Number.isInteger(version)) {
		return NextResponse.json({ status: "error", message: "Provide the numeric version to restore." }, { status: 400 });
	}

	const tool = await rollbackGeneratedTool(id, version);
	if (!tool) {
		return NextResponse.json(
			{ status: "error", message: "Could not find that tool/version to restore." },
			{ status: 404 }
		);
	}

	return NextResponse.json({ status: "success", tool });
}
