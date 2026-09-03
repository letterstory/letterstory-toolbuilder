// Orchestrates real end-to-end branded micro-tool generation — the "Mathew"
// requirement: given a customer's brand and a plain-language tool prompt,
// actually build the tool's functional logic (not just a themed shell), so it
// can be hosted and embedded as an iframe on the customer's own site.
//
// v1 scope, matching the current product stage:
//   - brand context comes from the existing Firecrawl ingestion pipeline
//     (optional — a tool can still be generated without a site, just without
//     brand styling);
//   - the tool itself is a single self-contained HTML document (inline CSS +
//     JS, no external network calls) so it can run in a sandboxed iframe with
//     no allow-same-origin, and so shared-server hosting is safe for v1
//     (stateless, contained — matches Mathew's "shared hosting is fine for
//     tools" call);
//   - hosting is local file-backed storage for now; Porter deployment is a
//     separate follow-up once the generation quality/contract is proven out.

import { envServer } from "@/lib/config/env.server";
import { isBrandIngestionConfigured, pullBrandProfile, type BrandProfile } from "@/lib/brand";
import { looksLikeHtmlDocument, sanitizeGeneratedHtml, type SanitizedHtml } from "@/lib/generation/sanitize";
import {
	saveGeneratedTool,
	type GeneratedToolBrandSnapshot,
	type GeneratedToolRecord,
} from "@/lib/generation/store";

export interface ToolGenerationRequest {
	projectName: string;
	/** Optional — leave blank to generate without brand context. */
	siteUrl: string;
	prompt: string;
}

export interface ToolGenerationSuccessResult {
	status: "success";
	tool: GeneratedToolRecord;
}

export interface ToolGenerationFailureResult {
	status: "not_configured" | "error";
	message: string;
}

export type ToolGenerationResult = ToolGenerationSuccessResult | ToolGenerationFailureResult;

const ANTHROPIC_TIMEOUT_MS = 120_000;
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 8_000;
const MAX_GENERATION_ATTEMPTS = 2;

interface AnthropicMessagesResponse {
	content?: Array<{ type: string; text?: string }>;
	error?: { message?: string };
}

export function isToolGenerationConfigured(): boolean {
	return Boolean(envServer.ANTHROPIC_API_KEY);
}

export async function generateTool(request: ToolGenerationRequest): Promise<ToolGenerationResult> {
	if (!isToolGenerationConfigured()) {
		return {
			status: "not_configured",
			message: "Set ANTHROPIC_API_KEY before generating tools.",
		};
	}
	if (!request.prompt.trim()) {
		return { status: "error", message: "Describe the tool you want generated." };
	}

	const normalizedSiteUrl = request.siteUrl.trim();
	const { brandProfile, brandWarning } = await resolveBrandContext(normalizedSiteUrl);
	const brandSnapshot = toBrandSnapshot(brandProfile);

	// A single bad or slow generation (truncated by max_tokens, the model
	// wrapping the doc in prose, or a transient Anthropic timeout/5xx)
	// shouldn't cost the customer a full manual retry — we get one automatic
	// retry with a stronger instruction before surfacing an error.
	let sanitized: SanitizedHtml | null = null;
	let lastErrorMessage: string | null = null;
	for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
		let rawHtml: string;
		try {
			rawHtml = await requestToolHtml({
				projectName: request.projectName,
				prompt: request.prompt,
				brandSnapshot,
				isRetry: attempt > 1,
			});
		} catch (error) {
			lastErrorMessage = error instanceof Error ? error.message : String(error);
			continue;
		}

		const candidate = sanitizeGeneratedHtml(rawHtml);
		if (looksLikeHtmlDocument(candidate.html)) {
			sanitized = candidate;
			break;
		}
		lastErrorMessage = "Generation returned an incomplete or invalid HTML document.";
	}

	if (!sanitized) {
		return {
			status: "error",
			message: lastErrorMessage ?? "Generation did not return a usable HTML document. Try again or refine the prompt.",
		};
	}

	const warnings = [...(brandWarning ? [brandWarning] : []), ...sanitized.warnings];

	const tool = await saveGeneratedTool({
		projectName: request.projectName.trim() || "Untitled tool",
		prompt: request.prompt,
		siteUrl: normalizedSiteUrl || null,
		brandSnapshot,
		html: sanitized.html,
		model: envServer.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL,
		warnings,
	});

	return { status: "success", tool };
}

/**
 * Brand context is a soft enrichment for generation, never a hard blocker —
 * a tool can still be generated (just unstyled) if ingestion is unconfigured
 * or the pull fails for this site.
 */
async function resolveBrandContext(
	siteUrl: string
): Promise<{ brandProfile: BrandProfile | null; brandWarning: string | null }> {
	if (!siteUrl) return { brandProfile: null, brandWarning: null };

	if (!isBrandIngestionConfigured()) {
		return {
			brandProfile: null,
			brandWarning: "Firecrawl isn't configured, so this tool was generated without brand context.",
		};
	}

	try {
		return { brandProfile: await pullBrandProfile(siteUrl), brandWarning: null };
	} catch (error) {
		return {
			brandProfile: null,
			brandWarning: `Brand ingestion failed (${
				error instanceof Error ? error.message : String(error)
			}); generated without brand context.`,
		};
	}
}

function toBrandSnapshot(profile: BrandProfile | null): GeneratedToolBrandSnapshot | null {
	if (!profile) return null;
	return {
		brandName: profile.brandName,
		colors: profile.colors,
		fonts: profile.fonts,
		logoDataUri: profile.images.logo.canonicalDataUri,
	};
}

async function requestToolHtml(opts: {
	projectName: string;
	prompt: string;
	brandSnapshot: GeneratedToolBrandSnapshot | null;
	isRetry?: boolean;
}): Promise<string> {
	const apiKey = envServer.ANTHROPIC_API_KEY;
	if (!apiKey) {
		throw new Error("Tool generation requires Anthropic (ANTHROPIC_API_KEY is unset)");
	}
	const model = envServer.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;

	const instructions = [
		"You are a senior product engineer building a small, real, functional web tool for a customer to embed on their own website as an iframe.",
		"Output ONLY a single self-contained HTML5 document. No markdown fences, no commentary, no explanation before or after.",
		"Hard requirements:",
		"- Start with <!doctype html> and include <html>, <head>, and <body>.",
		"- All CSS must be inline in a <style> tag in <head>. All JS must be inline in a <script> tag before </body>.",
		"- Do NOT reference any external scripts, stylesheets, fonts, or images by URL (no CDNs, no Google Fonts, no remote <img src>). The document must work with zero network access after initial load.",
		"- Implement the ACTUAL requested behavior with real working logic (real calculations, real state, real interactivity) — not a static mockup or placeholder. If the tool computes something, the computation must be correct and wired to visible inputs/outputs.",
		"- Design must be clean, modern, accessible (labeled inputs, sufficient color contrast, keyboard-usable), and responsive so it looks correct at both narrow (embedded iframe) and wide layouts.",
		"- If brand tokens are provided below, use them for the visual identity: primary/accent colors, font family names (assume standard web-safe fallbacks after the named font), and the logo image if given as a data URI. Do not fabricate a different brand.",
		"- Keep the whole document self-sufficient and safe: no forms that submit to external endpoints, no fetch()/XMLHttpRequest calls to external hosts.",
		"- Include a small, unobtrusive 'Powered by Letterstory' text credit near the bottom.",
	].join("\n");

	const brandContext = opts.brandSnapshot
		? [
				`Brand name: ${opts.brandSnapshot.brandName ?? "Unknown"}`,
				`Colors: ${JSON.stringify(opts.brandSnapshot.colors)}`,
				`Fonts: ${opts.brandSnapshot.fonts.join(", ") || "none detected"}`,
				`Logo data URI available: ${opts.brandSnapshot.logoDataUri ? "yes (embed it as-is via <img src>)" : "no"}`,
			].join("\n")
		: "No brand context provided — use a clean, neutral, professional visual style.";

	const userContent = [
		`Tool name: ${opts.projectName || "Untitled tool"}`,
		`Tool request: ${opts.prompt}`,
		"",
		"Brand context:",
		brandContext,
		...(opts.brandSnapshot?.logoDataUri
			? [`Logo data URI: ${opts.brandSnapshot.logoDataUri}`]
			: []),
		...(opts.isRetry
			? [
					"",
					"IMPORTANT: Your previous response was incomplete or was not a valid, complete HTML document. Return the ENTIRE self-contained document in one response, starting with <!doctype html> and ending with the literal closing tag </html>, with no truncation and no surrounding commentary.",
				]
			: []),
	].join("\n");

	const response = await fetch("https://api.anthropic.com/v1/messages", {
		method: "POST",
		headers: {
			"x-api-key": apiKey,
			"anthropic-version": "2023-06-01",
			"content-type": "application/json",
		},
		body: JSON.stringify({
			model,
			max_tokens: MAX_TOKENS,
			system: instructions,
			messages: [{ role: "user", content: userContent }],
		}),
		signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS),
	});

	const body = (await response.json().catch(() => ({}))) as AnthropicMessagesResponse;

	if (!response.ok) {
		throw new Error(`Anthropic generation failed (${response.status}): ${body.error?.message ?? "unknown error"}`);
	}

	const text = body.content
		?.filter((block) => block.type === "text")
		.map((block) => block.text ?? "")
		.join("\n")
		.trim();

	if (!text) {
		throw new Error("Anthropic generation returned no text response.");
	}

	return text;
}
