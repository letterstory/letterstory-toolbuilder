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
	type GeneratedToolBrandFidelity,
	type GeneratedToolBrandSnapshot,
	type GeneratedToolCopy,
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
const ADVISORY_TIMEOUT_MS = 30_000;
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 8_000;
const MAX_GENERATION_ATTEMPTS = 2;
// <head>/<style> plus the top of <body> carries almost all brand-relevant
// signal (colors, fonts, logo <img>) — capping keeps this a cheap, fast
// advisory check instead of resending the whole (possibly large) document.
const MAX_FIDELITY_HTML_CHARS = 6_000;

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

	// Both of these are advisory, fail-soft enrichments — Mathew's brief
	// explicitly calls for (a) supporting headline/copy around the embedded
	// iframe, and (b) an LLM cross-check that the generated tool doesn't
	// drift from the brand. Neither should block shipping the tool itself;
	// a failure just surfaces as a warning for the customer to review.
	const copy = await requestSupportingCopy({
		projectName: request.projectName,
		prompt: request.prompt,
		brandSnapshot,
	});
	if (!copy) {
		warnings.push("Could not generate supporting headline/copy for this tool — add your own before embedding.");
	}

	let brandFidelity: GeneratedToolBrandFidelity | null = null;
	if (brandSnapshot) {
		brandFidelity = await requestBrandFidelityCheck({ html: sanitized.html, brandSnapshot });
		if (!brandFidelity) {
			warnings.push("Brand fidelity check could not be completed for this tool.");
		} else if (brandFidelity.verdict !== "pass") {
			warnings.push(
				`Brand fidelity check (${brandFidelity.verdict}): ${
					brandFidelity.notes || "review the generated styling against the brand."
				}`
			);
		}
	}

	const tool = await saveGeneratedTool({
		projectName: request.projectName.trim() || "Untitled tool",
		prompt: request.prompt,
		siteUrl: normalizedSiteUrl || null,
		brandSnapshot,
		html: sanitized.html,
		copy,
		brandFidelity,
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

/**
 * Shared low-level "ask Claude for plain text" call used by the two advisory
 * follow-ups below. Unlike requestToolHtml, callers treat any failure here as
 * non-fatal (return null), so this intentionally never throws.
 */
async function requestAdvisoryText(opts: {
	system: string;
	userContent: string;
	maxTokens: number;
}): Promise<string | null> {
	const apiKey = envServer.ANTHROPIC_API_KEY;
	if (!apiKey) return null;
	const model = envServer.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;

	try {
		const response = await fetch("https://api.anthropic.com/v1/messages", {
			method: "POST",
			headers: {
				"x-api-key": apiKey,
				"anthropic-version": "2023-06-01",
				"content-type": "application/json",
			},
			body: JSON.stringify({
				model,
				max_tokens: opts.maxTokens,
				system: opts.system,
				messages: [{ role: "user", content: opts.userContent }],
			}),
			signal: AbortSignal.timeout(ADVISORY_TIMEOUT_MS),
		});

		const body = (await response.json().catch(() => ({}))) as AnthropicMessagesResponse;
		if (!response.ok) return null;

		const text = body.content
			?.filter((block) => block.type === "text")
			.map((block) => block.text ?? "")
			.join("\n")
			.trim();

		return text || null;
	} catch {
		return null;
	}
}

/**
 * Generates the headline + short supporting paragraph meant to sit above the
 * embedded iframe on the customer's own CMS page — Mathew's brief explicitly
 * calls out that "the page around the iframe can include supporting copy
 * such as a headline and rich-text explanation."
 */
async function requestSupportingCopy(opts: {
	projectName: string;
	prompt: string;
	brandSnapshot: GeneratedToolBrandSnapshot | null;
}): Promise<GeneratedToolCopy | null> {
	const system = [
		"You write short, conversion-focused marketing copy that will sit ABOVE an embedded interactive tool on a customer's own website page.",
		"Output EXACTLY two lines, nothing else, no markdown:",
		"HEADLINE: <a punchy, specific headline, under 70 characters>",
		"COPY: <one short paragraph (2-3 sentences) explaining what the tool does and why someone would use it>",
	].join("\n");

	const brandContext = opts.brandSnapshot?.brandName
		? `Brand: ${opts.brandSnapshot.brandName}. Match their tone — professional and on-brand, not generic.`
		: "No specific brand — keep the tone clean and professional.";

	const userContent = [`Tool name: ${opts.projectName || "Untitled tool"}`, `Tool description: ${opts.prompt}`, brandContext].join(
		"\n"
	);

	const text = await requestAdvisoryText({ system, userContent, maxTokens: 300 });
	if (!text) return null;

	const headline = text.match(/HEADLINE:\s*(.+)/i)?.[1]?.trim();
	const supportingCopy = text.match(/COPY:\s*([\s\S]+)/i)?.[1]?.trim();
	if (!headline || !supportingCopy) return null;

	return { headline, supportingCopy };
}

/**
 * Advisory LLM cross-check that the generated tool's actual implementation
 * (colors, fonts, logo usage, tone) is faithful to the brand it was supposed
 * to be built for — the "cross-checks that brand understanding so the
 * output does not look like a different company" requirement. This is a
 * source-level check (no rendered screenshot pipeline exists for
 * locally-hosted generated tools yet), unlike the full Claude-vision
 * screenshot comparison already used for brand-ingestion validation.
 */
async function requestBrandFidelityCheck(opts: {
	html: string;
	brandSnapshot: GeneratedToolBrandSnapshot;
}): Promise<GeneratedToolBrandFidelity | null> {
	const system = [
		"You are a brand QA reviewer. You are given a brand's design tokens and the source of a generated HTML tool. Decide whether the tool's actual implementation (colors, fonts, tone, logo usage) is faithful to the brand, well enough that a visitor would believe it's from the same company.",
		"Reason about what the CSS/HTML will actually render as, not just whether the tokens are mentioned in a comment.",
		"Output EXACTLY two lines, nothing else, no markdown:",
		"VERDICT: <one of pass, warn, fail>",
		"NOTES: <one short sentence explaining the verdict; empty if pass>",
	].join("\n");

	const brandContext = [
		`Brand name: ${opts.brandSnapshot.brandName ?? "Unknown"}`,
		`Expected colors: ${JSON.stringify(opts.brandSnapshot.colors)}`,
		`Expected fonts: ${opts.brandSnapshot.fonts.join(", ") || "none detected"}`,
	].join("\n");

	const truncatedHtml =
		opts.html.length > MAX_FIDELITY_HTML_CHARS
			? `${opts.html.slice(0, MAX_FIDELITY_HTML_CHARS)}\n<!-- truncated for review -->`
			: opts.html;

	const userContent = [brandContext, "", "Generated tool source:", truncatedHtml].join("\n");

	const text = await requestAdvisoryText({ system, userContent, maxTokens: 200 });
	if (!text) return null;

	const verdictRaw = text.match(/VERDICT:\s*(\w+)/i)?.[1]?.toLowerCase();
	const notes = text.match(/NOTES:\s*(.*)/i)?.[1]?.trim() ?? "";
	if (verdictRaw !== "pass" && verdictRaw !== "warn" && verdictRaw !== "fail") return null;

	return { verdict: verdictRaw, notes };
}
