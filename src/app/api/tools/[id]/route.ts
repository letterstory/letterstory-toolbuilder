import { NextResponse } from "next/server";
import { getGeneratedTool } from "@/lib/generation/store";

/**
 * Single-tool detail for the Build workspace — includes version + history
 * metadata (used to populate the edit form and render the version-history
 * list) but omits the (potentially large) HTML bodies for both the current
 * tool and each history entry; only /t/[id] serves raw HTML.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
	const { id } = await context.params;
	const tool = await getGeneratedTool(id);

	if (!tool) {
		return NextResponse.json({ status: "error", message: "Tool not found." }, { status: 404 });
	}

	const { history } = tool;
	return NextResponse.json({
		status: "success",
		tool: {
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
			history: history.map((entry) => ({
				version: entry.version,
				createdAt: entry.createdAt,
				projectName: entry.projectName,
				prompt: entry.prompt,
				siteUrl: entry.siteUrl,
				brandSnapshot: entry.brandSnapshot,
				copy: entry.copy,
				brandFidelity: entry.brandFidelity,
				model: entry.model,
				warnings: entry.warnings,
			})),
		},
	});
}
