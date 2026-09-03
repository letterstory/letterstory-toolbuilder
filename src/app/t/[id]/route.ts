import { getGeneratedTool } from "@/lib/generation/store";

/**
 * Serves a generated tool's raw HTML document for iframe embedding on a
 * customer's own site. Deliberately a Route Handler (not a page) so nothing
 * from the dashboard's React layout/shell/CSS leaks into the embedded
 * document — the response body is exactly the sanitized HTML we generated
 * and stored, nothing more.
 *
 * No X-Frame-Options / frame-ancestors restriction is set here on purpose:
 * the whole point of this route is to be embedded on arbitrary customer
 * domains via <iframe>. The real safety boundary is the *embedder's* iframe
 * `sandbox` attribute (see the embed snippet in the Build workspace), which
 * keeps the generated document isolated from the parent page regardless of
 * this route's own headers.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
	const { id } = await context.params;
	const tool = await getGeneratedTool(id);

	if (!tool) {
		return new Response("<!doctype html><html><body><p>Tool not found.</p></body></html>", {
			status: 404,
			headers: { "content-type": "text/html; charset=utf-8" },
		});
	}

	return new Response(tool.html, {
		status: 200,
		headers: {
			"content-type": "text/html; charset=utf-8",
			"cache-control": "no-store",
		},
	});
}
