import { NextResponse } from "next/server";
import { listGeneratedTools } from "@/lib/generation/store";

export async function GET() {
	const tools = await listGeneratedTools();
	// Omit the (potentially large) html body — the list view only needs
	// metadata to render cards and link to /t/[id] / the embed snippet.
	const summaries = tools.map((tool) => ({
		id: tool.id,
		projectName: tool.projectName,
		prompt: tool.prompt,
		siteUrl: tool.siteUrl,
		brandSnapshot: tool.brandSnapshot,
		copy: tool.copy,
		brandFidelity: tool.brandFidelity,
		model: tool.model,
		warnings: tool.warnings,
		createdAt: tool.createdAt,
		updatedAt: tool.updatedAt,
		version: tool.version,
		// History carries full past HTML bodies — omitted here for the same
		// reason `html` is: the list view only needs metadata for cards/links.
		previousVersionCount: tool.history.length,
	}));
	return NextResponse.json({ status: "success", tools: summaries });
}
