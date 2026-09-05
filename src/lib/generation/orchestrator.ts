// Orchestrates real end-to-end branded micro-tool generation — the "Mathew"
// requirement: given a customer's brand and a plain-language tool prompt,
// actually build the tool's functional logic (not just a themed shell), so it
// can be hosted and embedded as an iframe on the customer's own site.
//
// v1 scope, matching the current product stage:
//   - brand context comes from the existing Context.dev ingestion pipeline
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
import { enforceBrandPresentation } from "@/lib/generation/brand-enforcement";
import {
	looksLikeHtmlDocument,
	sanitizeGeneratedHtml,
	type SanitizedHtml,
} from "@/lib/generation/sanitize";
import {
	getGeneratedTool,
	saveGeneratedTool,
	updateGeneratedTool,
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
	/**
	 * When set, revises the existing tool with this id in place (same id/embed
	 * URL, version bumped, previous content kept in history) instead of
	 * creating a brand-new tool. The prompt is treated as revision
	 * instructions and Claude is given the tool's current HTML to edit rather
	 * than starting from a blank page.
	 */
	toolId?: string;
}

export interface ToolGenerationSuccessResult {
	status: "success";
	tool: GeneratedToolRecord;
	diagnostics?: ToolGenerationDiagnostics;
}

export interface ToolGenerationFailureResult {
	status: "not_configured" | "error";
	message: string;
	diagnostics?: ToolGenerationDiagnostics;
}

export type ToolGenerationResult = ToolGenerationSuccessResult | ToolGenerationFailureResult;

export const NGINX_GENERATION_ROUTE_BUDGET_MS = 300_000;
export const TOOL_GENERATION_TARGET_BUDGET_MS = 280_000;
const PRIMARY_ANTHROPIC_TIMEOUT_MS = 210_000;
const INITIAL_RETRY_ANTHROPIC_TIMEOUT_MS = 35_000;
const REVISION_RETRY_ANTHROPIC_TIMEOUT_MS = 70_000;
const ADVISORY_TIMEOUT_MS = 15_000;
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 8_000;
const MAX_GENERATION_ATTEMPTS = 2;
const MAX_PROMPT_BRAND_COLORS = 4;
const MAX_PROMPT_BRAND_FONTS = 2;
const BRAND_REPAIR_TIMEOUT_MS = 15_000;
const MIN_ADVISORY_BUDGET_MS = 5_000;
// Worst-case request-budget math for one /api/tools/generate request:
// - initial generation path:
//   - primary HTML generation attempt: 210s
//   - fallback retry (only for malformed HTML / transient 5xx/network failures): 35s
//   - advisory copy + brand-fidelity checks: 15s max wall time because they run in parallel
//   - total capped post-brand-fetch wall time = 260s, leaving ~40s inside nginx's
//     300s budget for brand-context fetching, storage, and Next.js response overhead.
// - revision path:
//   - primary HTML generation attempt: 210s
//   - retry after malformed / transient output: 70s
//   - advisories can be skipped entirely when that recovery attempt consumes the
//     remaining request budget, so the revision path is still capped at 280s.
export const MAX_ANTHROPIC_PIPELINE_WORST_CASE_MS =
	PRIMARY_ANTHROPIC_TIMEOUT_MS + INITIAL_RETRY_ANTHROPIC_TIMEOUT_MS + ADVISORY_TIMEOUT_MS;
export const MAX_REVISION_ANTHROPIC_PIPELINE_WORST_CASE_MS =
	PRIMARY_ANTHROPIC_TIMEOUT_MS + REVISION_RETRY_ANTHROPIC_TIMEOUT_MS;
// <head>/<style> plus the top of <body> carries almost all brand-relevant
// signal (colors, fonts, logo <img>) — capping keeps this a cheap, fast
// advisory check instead of resending the whole (possibly large) document.
const MAX_FIDELITY_HTML_CHARS = 6_000;

interface AnthropicMessagesResponse {
	content?: Array<{ type: string; text?: string }>;
	error?: { message?: string };
}

export interface ToolGenerationDiagnostics {
	totalMs: number;
	brandContextMs: number;
	buildMs: number;
	advisoryMs: number;
	advisorySkipped: boolean;
	htmlAttempts: Array<{
		attempt: number;
		timeoutMs: number;
		durationMs: number;
		outcome: string;
	}>;
}

type ToolGenerationStepErrorCode =
	"timeout" | "upstream_4xx" | "upstream_5xx" | "empty_response" | "network";

class ToolGenerationStepError extends Error {
	readonly code: ToolGenerationStepErrorCode;
	readonly status?: number;

	constructor(message: string, code: ToolGenerationStepErrorCode, status?: number) {
		super(message);
		this.name = "ToolGenerationStepError";
		this.code = code;
		this.status = status;
	}
}

export function isToolGenerationConfigured(): boolean {
	return Boolean(envServer.ANTHROPIC_API_KEY);
}

export async function generateTool(request: ToolGenerationRequest): Promise<ToolGenerationResult> {
	const startedAt = Date.now();
	if (!isToolGenerationConfigured()) {
		return {
			status: "not_configured",
			message: "Set ANTHROPIC_API_KEY before generating tools.",
			diagnostics: emptyDiagnostics(Date.now() - startedAt),
		};
	}
	if (!request.prompt.trim()) {
		return {
			status: "error",
			message: "Describe the tool you want generated.",
			diagnostics: emptyDiagnostics(Date.now() - startedAt),
		};
	}

	if (request.toolId) {
		return reviseTool(request.toolId, request, startedAt);
	}

	const normalizedSiteUrl = request.siteUrl.trim();
	const brandStartedAt = Date.now();
	const { brandProfile, brandWarning } = await resolveBrandContext(normalizedSiteUrl);
	const brandContextMs = Date.now() - brandStartedAt;
	const brandSnapshot = toBrandSnapshot(brandProfile);

	const built = await buildToolContent({
		projectName: request.projectName,
		prompt: request.prompt,
		brandSnapshot,
		brandWarning,
		requestStartedAt: startedAt,
	});
	if (built.status === "error") {
		return {
			...built,
			diagnostics: finalizeDiagnostics({
				...built.diagnostics,
				brandContextMs,
				totalMs: Date.now() - startedAt,
			}),
		};
	}

	const tool = await saveGeneratedTool({
		...built.content,
		projectName: request.projectName.trim() || "Untitled tool",
		siteUrl: normalizedSiteUrl || null,
	});

	return {
		status: "success",
		tool,
		diagnostics: finalizeDiagnostics({
			...built.diagnostics,
			brandContextMs,
			totalMs: Date.now() - startedAt,
		}),
	};
}

/**
 * Revises an existing tool in place: Claude is given the tool's current full
 * HTML and treats the prompt as edit instructions rather than a fresh brief,
 * so the result keeps the same id/embed URL and (per Mathew's "modified
 * quickly" requirement) doesn't force the customer to start over or re-embed
 * anything. The previous version is kept in `history` for rollback.
 */
async function reviseTool(
	toolId: string,
	request: ToolGenerationRequest,
	startedAt: number
): Promise<ToolGenerationResult> {
	const existing = await getGeneratedTool(toolId);
	if (!existing) {
		return {
			status: "error",
			message: "Could not find the tool to update — it may have been removed.",
			diagnostics: emptyDiagnostics(Date.now() - startedAt),
		};
	}

	const normalizedSiteUrl = request.siteUrl.trim();
	// Re-pulling brand context on every small wording tweak would mean an
	// extra Context.dev + Claude round trip per revision for no benefit — only
	// re-resolve it when the customer actually points at a different site.
	let brandSnapshot = existing.brandSnapshot;
	let brandWarning: string | null = null;
	let brandContextMs = 0;
	if (normalizedSiteUrl && normalizedSiteUrl !== (existing.siteUrl ?? "")) {
		const brandStartedAt = Date.now();
		const resolved = await resolveBrandContext(normalizedSiteUrl);
		brandContextMs = Date.now() - brandStartedAt;
		brandSnapshot = toBrandSnapshot(resolved.brandProfile);
		brandWarning = resolved.brandWarning;
	}

	const built = await buildToolContent({
		projectName: request.projectName || existing.projectName,
		prompt: request.prompt,
		brandSnapshot,
		brandWarning,
		existingHtml: existing.html,
		requestStartedAt: startedAt,
	});
	if (built.status === "error") {
		return {
			...built,
			diagnostics: finalizeDiagnostics({
				...built.diagnostics,
				brandContextMs,
				totalMs: Date.now() - startedAt,
			}),
		};
	}

	const tool = await updateGeneratedTool(toolId, {
		...built.content,
		projectName: (request.projectName || existing.projectName).trim() || existing.projectName,
		siteUrl: normalizedSiteUrl || existing.siteUrl,
		// Keep the previous copy if this revision's copy generation failed,
		// rather than blanking out perfectly good existing copy.
		copy: built.content.copy ?? existing.copy,
	});
	if (!tool) {
		return {
			status: "error",
			message: "Could not save the revised tool — it may have been removed.",
			diagnostics: finalizeDiagnostics({
				...built.diagnostics,
				brandContextMs,
				totalMs: Date.now() - startedAt,
			}),
		};
	}

	return {
		status: "success",
		tool,
		diagnostics: finalizeDiagnostics({
			...built.diagnostics,
			brandContextMs,
			totalMs: Date.now() - startedAt,
		}),
	};
}

interface BuildToolContentResult {
	status: "success";
	content: {
		projectName: string;
		prompt: string;
		siteUrl: string | null;
		brandSnapshot: GeneratedToolBrandSnapshot | null;
		html: string;
		copy: GeneratedToolCopy | null;
		brandFidelity: GeneratedToolBrandFidelity | null;
		model: string;
		warnings: string[];
	};
	diagnostics: Omit<ToolGenerationDiagnostics, "totalMs" | "brandContextMs">;
}

/**
 * Shared core between a fresh build and a revision: run the (possibly
 * retried) HTML generation, then the two advisory enrichments. `existingHtml`
 * is the only thing that distinguishes "build from scratch" from "revise in
 * place" at this layer — everything else (brand context, retries, advisory
 * checks) works the same either way.
 */
async function buildToolContent(opts: {
	projectName: string;
	prompt: string;
	brandSnapshot: GeneratedToolBrandSnapshot | null;
	brandWarning: string | null;
	existingHtml?: string;
	requestStartedAt: number;
}): Promise<
	| BuildToolContentResult
	| {
			status: "error";
			message: string;
			diagnostics: Omit<ToolGenerationDiagnostics, "totalMs" | "brandContextMs">;
	  }
> {
	const buildStartedAt = Date.now();
	const htmlAttempts: ToolGenerationDiagnostics["htmlAttempts"] = [];
	logGenerationStep("build_started", {
		projectName: opts.projectName || "Untitled tool",
		promptChars: opts.prompt.length,
		hasBrandSnapshot: Boolean(opts.brandSnapshot),
		isRevision: Boolean(opts.existingHtml),
	});
	const isRevision = Boolean(opts.existingHtml);
	const retryTimeoutCeilingMs = isRevision
		? REVISION_RETRY_ANTHROPIC_TIMEOUT_MS
		: INITIAL_RETRY_ANTHROPIC_TIMEOUT_MS;
	// A single bad or slow generation (truncated by max_tokens, the model
	// wrapping the doc in prose, or a transient Anthropic timeout/5xx)
	// shouldn't cost the customer a full manual retry — we get one automatic
	// retry with a stronger instruction before surfacing an error.
	let sanitized: SanitizedHtml | null = null;
	let lastFailure:
		| { kind: "step_error"; error: unknown; message: string }
		| { kind: "invalid_html"; message: string }
		| null = null;
	for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
		const timeSpentMs = Date.now() - opts.requestStartedAt;
		const remainingBudgetMs = Math.max(0, TOOL_GENERATION_TARGET_BUDGET_MS - timeSpentMs);
		const reservedAdvisoryMs = isRevision ? 0 : ADVISORY_TIMEOUT_MS;
		const timeoutMs = Math.max(
			MIN_ADVISORY_BUDGET_MS,
			Math.min(
				attempt === 1 ? PRIMARY_ANTHROPIC_TIMEOUT_MS : retryTimeoutCeilingMs,
				Math.max(MIN_ADVISORY_BUDGET_MS, remainingBudgetMs - reservedAdvisoryMs)
			)
		);
		const attemptStartedAt = Date.now();
		let rawHtml: string;
		try {
			rawHtml = await requestToolHtml({
				projectName: opts.projectName,
				prompt: opts.prompt,
				brandSnapshot: opts.brandSnapshot,
				isRetry: attempt > 1,
				existingHtml: opts.existingHtml,
				timeoutMs,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			htmlAttempts.push({
				attempt,
				timeoutMs,
				durationMs: Date.now() - attemptStartedAt,
				outcome: error instanceof ToolGenerationStepError ? error.code : "unknown_error",
			});
			lastFailure = { kind: "step_error", error, message };
			logGenerationStep("html_generation_failed", {
				attempt,
				timeoutMs,
				durationMs: Date.now() - attemptStartedAt,
				error: message,
			});
			if (!shouldRetryHtmlGeneration(error, attempt)) break;
			continue;
		}

		const candidate = sanitizeGeneratedHtml(rawHtml);
		if (looksLikeHtmlDocument(candidate.html)) {
			sanitized = candidate;
			htmlAttempts.push({
				attempt,
				timeoutMs,
				durationMs: Date.now() - attemptStartedAt,
				outcome: "success",
			});
			logGenerationStep("html_generation_succeeded", {
				attempt,
				timeoutMs,
				durationMs: Date.now() - attemptStartedAt,
				htmlChars: candidate.html.length,
				warningCount: candidate.warnings.length,
			});
			break;
		}
		lastFailure = {
			kind: "invalid_html",
			message: opts.existingHtml
				? "Revision returned an incomplete or invalid HTML document."
				: "Generation returned an incomplete or invalid HTML document.",
		};
		htmlAttempts.push({
			attempt,
			timeoutMs,
			durationMs: Date.now() - attemptStartedAt,
			outcome: "invalid_html",
		});
		logGenerationStep("html_generation_invalid_document", {
			attempt,
			timeoutMs,
			durationMs: Date.now() - attemptStartedAt,
			htmlChars: candidate.html.length,
		});
	}

	if (!sanitized) {
		logGenerationStep("build_failed", {
			durationMs: Date.now() - buildStartedAt,
			reason: lastFailure?.message ?? "unknown build failure",
		});
		return {
			status: "error",
			message: formatBuildFailureMessage(lastFailure, Boolean(opts.existingHtml)),
			diagnostics: {
				buildMs: Date.now() - buildStartedAt,
				advisoryMs: 0,
				advisorySkipped: true,
				htmlAttempts,
			},
		};
	}

	const repaired = await maybeRepairBrandPresentation({
		projectName: opts.projectName,
		brandSnapshot: opts.brandSnapshot,
		sanitized,
		requestStartedAt: opts.requestStartedAt,
	});
	const enforced = await enforceBrandPresentation({
		html: repaired.sanitized.html,
		projectName: opts.projectName,
		brandSnapshot: opts.brandSnapshot,
	});
	sanitized = enforced.sanitized;
	const warnings = [
		...(opts.brandWarning ? [opts.brandWarning] : []),
		...repaired.warnings,
		...enforced.warnings,
		...sanitized.warnings,
	];

	// Both of these are advisory, fail-soft enrichments — Mathew's brief
	// explicitly calls for (a) supporting headline/copy around the embedded
	// iframe, and (b) an LLM cross-check that the generated tool doesn't
	// drift from the brand. Neither should block shipping the tool itself;
	// a failure just surfaces as a warning for the customer to review.
	let advisoryMs = 0;
	let advisorySkipped = false;
	let copy: GeneratedToolCopy | null = null;
	let brandFidelity: GeneratedToolBrandFidelity | null = null;
	const remainingBudgetMs = TOOL_GENERATION_TARGET_BUDGET_MS - (Date.now() - opts.requestStartedAt);
	if (remainingBudgetMs >= ADVISORY_TIMEOUT_MS + MIN_ADVISORY_BUDGET_MS) {
		const advisoryStartedAt = Date.now();
		[copy, brandFidelity] = await Promise.all([
			timeGenerationStep("supporting_copy_completed", () =>
				requestSupportingCopy({
					projectName: opts.projectName,
					prompt: opts.prompt,
					brandSnapshot: opts.brandSnapshot,
				})
			),
			opts.brandSnapshot
				? timeGenerationStep("brand_fidelity_completed", () =>
						requestBrandFidelityCheck({
							html: sanitized.html,
							brandSnapshot: opts.brandSnapshot as GeneratedToolBrandSnapshot,
						})
					)
				: Promise.resolve(null),
		]);
		advisoryMs = Date.now() - advisoryStartedAt;
		logGenerationStep("advisory_phase_completed", {
			durationMs: advisoryMs,
			ranBrandFidelity: Boolean(opts.brandSnapshot),
		});
		if (!copy) {
			warnings.push(
				"Could not generate supporting headline/copy for this tool — add your own before embedding."
			);
		}

		if (opts.brandSnapshot) {
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
	} else {
		advisorySkipped = true;
		warnings.push(
			"Supporting copy and brand QA were skipped to return the generated tool within the live request budget."
		);
		logGenerationStep("advisory_phase_skipped", {
			remainingBudgetMs,
			requiredBudgetMs: ADVISORY_TIMEOUT_MS + MIN_ADVISORY_BUDGET_MS,
		});
	}

	logGenerationStep("build_succeeded", {
		durationMs: Date.now() - buildStartedAt,
		totalWarnings: warnings.length,
	});
	return {
		status: "success",
		content: {
			projectName: opts.projectName.trim() || "Untitled tool",
			prompt: opts.prompt,
			siteUrl: null,
			brandSnapshot: opts.brandSnapshot,
			html: sanitized.html,
			copy,
			brandFidelity,
			model: envServer.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL,
			warnings,
		},
		diagnostics: {
			buildMs: Date.now() - buildStartedAt,
			advisoryMs,
			advisorySkipped,
			htmlAttempts,
		},
	};
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
			brandWarning:
				"Context.dev isn't configured, so this tool was generated without brand context.",
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
	const logoDataUri = resolveGenerationLogoDataUri(profile);
	const logoPolicy =
		logoDataUri && shouldRequireExactLogoAsset(profile) ? "exact_asset" : "text_only";
	return {
		brandName: profile.brandName,
		colors: profile.colors,
		fonts: profile.fonts,
		headingFont: profile.typography.headingFont,
		bodyFont: profile.typography.bodyFont,
		headingFontFace: profile.typography.headingFontFace
			? {
					family: profile.typography.headingFontFace.family,
					google: profile.typography.headingFontFace.google,
					category: profile.typography.headingFontFace.category,
					files: profile.typography.headingFontFace.files,
					fallbacks: profile.typography.headingFontFace.fallbacks,
			  }
			: null,
		bodyFontFace: profile.typography.bodyFontFace
			? {
					family: profile.typography.bodyFontFace.family,
					google: profile.typography.bodyFontFace.google,
					category: profile.typography.bodyFontFace.category,
					files: profile.typography.bodyFontFace.files,
					fallbacks: profile.typography.bodyFontFace.fallbacks,
			  }
			: null,
		logoPolicy,
		logoDataUri: logoPolicy === "exact_asset" ? logoDataUri : null,
	};
}

function resolveGenerationLogoDataUri(profile: BrandProfile): string | null {
	return (
		profile.images.logo.canonicalDataUri ??
		(profile.images.logo.url?.startsWith("data:") ? profile.images.logo.url : null)
	);
}

function shouldRequireExactLogoAsset(profile: BrandProfile): boolean {
	if (profile.images.logo.type === "icon") {
		return (profile.images.logoVariants ?? []).some((variant) => variant.type === "logo");
	}
	return true;
}

async function requestToolHtml(opts: {
	projectName: string;
	prompt: string;
	brandSnapshot: GeneratedToolBrandSnapshot | null;
	isRetry?: boolean;
	timeoutMs: number;
	/** When set, this is a revision: edit this HTML per the prompt instead of building from scratch. */
	existingHtml?: string;
}): Promise<string> {
	const apiKey = envServer.ANTHROPIC_API_KEY;
	if (!apiKey) {
		throw new Error("Tool generation requires Anthropic (ANTHROPIC_API_KEY is unset)");
	}
	const model = envServer.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;
	const isRevision = Boolean(opts.existingHtml);
	const brandPrompt = buildBrandPrompt(opts.brandSnapshot);

	const instructions = [
		"You are a senior product engineer building a small, real, functional web tool for a customer to embed on their own website as an iframe.",
		...(isRevision
			? [
					"You are REVISING an existing tool, not starting from scratch. The user's message includes the tool's CURRENT full HTML source followed by revision instructions describing what should change.",
					"Keep everything that isn't called out for change — working logic, structure, brand styling, copy — and edit only what the instructions ask for, unless they clearly imply a broader change. Do not regress or remove working functionality as a side effect.",
				]
			: []),
		"Output ONLY a single self-contained HTML5 document. No markdown fences, no commentary, no explanation before or after.",
		"Hard requirements:",
		"- Start with <!doctype html> and include <html>, <head>, and <body>.",
		"- All CSS must be inline in a <style> tag in <head>. All JS must be inline in a <script> tag before </body>.",
		"- Do NOT reference any external scripts, stylesheets, fonts, or images by URL (no CDNs, no Google Fonts, no remote <img src>). The document must work with zero network access after initial load.",
		"- Implement the ACTUAL requested behavior with real working logic (real calculations, real state, real interactivity) — not a static mockup or placeholder. If the tool computes something, the computation must be correct and wired to visible inputs/outputs.",
		"- Design must be clean, modern, accessible (labeled inputs, sufficient color contrast, keyboard-usable), and responsive so it looks correct at both narrow (embedded iframe) and wide layouts.",
		"- Keep the implementation compact: no comments, no placeholder sections, no unnecessary copy, and only as much CSS/JS as the tool actually needs.",
		"- If brand tokens are provided below, treat them as authoritative. Use those exact colors for the visible identity, even if they conflict with prior knowledge or an older palette you associate with the brand.",
		"- If an inline logo asset is provided, render that asset instead of typing a substitute wordmark. If no logo asset is provided, use plain text brand-name treatment or omit the logo area entirely — never invent an icon, mascot, monogram, sparkle, silhouette, or abstract badge, and never fall back to a different historical brand palette.",
		"- Use the provided primary/accent colors, font family names (assume standard web-safe fallbacks after the named font), and optional inline logo asset. Do not fabricate a different brand.",
		"- Keep the whole document self-sufficient and safe: no forms that submit to external endpoints, no fetch()/XMLHttpRequest calls to external hosts.",
		"- Include a small, unobtrusive 'Powered by Letterstory' text credit near the bottom.",
		...(isRevision
			? [
					"- Return the ENTIRE updated document (not a diff/patch), following all the requirements above.",
				]
			: []),
	].join("\n");

	const userContent = [
		`Tool name: ${opts.projectName || "Untitled tool"}`,
		...(isRevision
			? [
					"",
					"Current tool HTML (this is what you are revising):",
					opts.existingHtml as string,
					"",
					`Revision instructions: ${opts.prompt}`,
				]
			: [`Tool request: ${opts.prompt}`]),
		"",
		"Brand context:",
		brandPrompt,
		...(opts.isRetry
			? [
					"",
					"IMPORTANT: Your previous response was incomplete or was not a valid, complete HTML document. Return the ENTIRE self-contained document in one response, starting with <!doctype html> and ending with the literal closing tag </html>, with no truncation and no surrounding commentary.",
				]
			: []),
	].join("\n");
	logGenerationStep("html_generation_prompt_prepared", {
		timeoutMs: opts.timeoutMs,
		isRevision,
		brandPromptChars: brandPrompt.length,
		includesInlineLogo: brandPrompt.includes("Logo data URI:"),
		userContentChars: userContent.length,
	});

	let response: Response;
	try {
		response = await fetch("https://api.anthropic.com/v1/messages", {
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
			signal: AbortSignal.timeout(opts.timeoutMs),
		});
	} catch (error) {
		if (isAnthropicTimeoutError(error)) {
			throw new ToolGenerationStepError("The operation was aborted due to timeout", "timeout");
		}
		throw new ToolGenerationStepError(
			error instanceof Error ? error.message : String(error),
			"network"
		);
	}

	const body = (await response.json().catch(() => ({}))) as AnthropicMessagesResponse;

	if (!response.ok) {
		throw new ToolGenerationStepError(
			`Anthropic generation failed (${response.status}): ${body.error?.message ?? "unknown error"}`,
			response.status >= 500 ? "upstream_5xx" : "upstream_4xx",
			response.status
		);
	}

	const text = body.content
		?.filter((block) => block.type === "text")
		.map((block) => block.text ?? "")
		.join("\n")
		.trim();

	if (!text) {
		throw new ToolGenerationStepError(
			"Anthropic generation returned no text response.",
			"empty_response"
		);
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

	const userContent = [
		`Tool name: ${opts.projectName || "Untitled tool"}`,
		`Tool description: ${opts.prompt}`,
		brandContext,
	].join("\n");

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

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function htmlMentionsFontFamily(html: string, family: string | null | undefined): boolean {
	if (!family) return false;
	return new RegExp(escapeRegex(family), "i").test(html);
}

function extractHeaderHtml(html: string): string {
	const mainStart = html.search(/<main\b/i);
	if (mainStart >= 0) return html.slice(0, mainStart);
	return html.slice(0, 5_000);
}

function collectBrandRepairReasons(
	html: string,
	brandSnapshot: GeneratedToolBrandSnapshot
): string[] {
	const reasons: string[] = [];
	const headerHtml = extractHeaderHtml(html);

	if (
		brandSnapshot.logoPolicy === "text_only" &&
		/(brand|logo)[-_a-z"'\s=]*<[^>]*?(svg|canvas)\b|<(svg|canvas)\b/i.test(
			headerHtml.replace(/\n/g, " ")
		)
	) {
		reasons.push(
			"No trustworthy full-logo image is available for this brand. Remove the invented graphical mark from the header and use a clean text-only brand-name treatment instead."
		);
	}

	if (brandSnapshot.bodyFont && !htmlMentionsFontFamily(html, brandSnapshot.bodyFont)) {
		reasons.push(
			`Use "${brandSnapshot.bodyFont}" in the CSS font-family declarations for the main UI/body text instead of defaulting to an unrelated fallback face.`
		);
	}

	return reasons;
}

function buildBrandRepairPrompt(
	brandSnapshot: GeneratedToolBrandSnapshot,
	reasons: string[]
): string {
	return [
		"Brand fidelity correction only.",
		"Keep the existing calculator logic, input/output behavior, copy, spacing, and overall layout unless a small targeted edit is required for the brand corrections below.",
		brandSnapshot.bodyFont
			? `Primary UI/body font to use: ${brandSnapshot.bodyFont}.`
			: "Primary UI/body font: none detected.",
		brandSnapshot.headingFont && brandSnapshot.headingFont !== brandSnapshot.bodyFont
			? `Optional display font: ${brandSnapshot.headingFont}.`
			: "Optional display font: none detected beyond the main UI font.",
		brandSnapshot.logoPolicy === "exact_asset"
			? "A real logo asset will be injected into the header programmatically after generation. Leave a clean brand area for it and do not draw, trace, or type a substitute logo."
			: `Do not draw or invent any icon for the header. If branding is visible, use the exact brand name text only: ${brandSnapshot.brandName ?? "Unknown"}.`,
		"Required fixes:",
		...reasons.map((reason) => `- ${reason}`),
	].join("\n");
}

async function maybeRepairBrandPresentation(opts: {
	projectName: string;
	brandSnapshot: GeneratedToolBrandSnapshot | null;
	sanitized: SanitizedHtml;
	requestStartedAt: number;
}): Promise<{
	sanitized: SanitizedHtml;
	warnings: string[];
}> {
	if (!opts.brandSnapshot) {
		return { sanitized: opts.sanitized, warnings: [] };
	}

	const reasons = collectBrandRepairReasons(opts.sanitized.html, opts.brandSnapshot);
	if (!reasons.length) {
		logGenerationStep("brand_repair_skipped", { reason: "not_needed" });
		return { sanitized: opts.sanitized, warnings: [] };
	}

	const finalize = (sanitized: SanitizedHtml, extraWarnings: string[] = []) => {
		return {
			sanitized,
			warnings: extraWarnings,
		};
	};

	const remainingBudgetMs = TOOL_GENERATION_TARGET_BUDGET_MS - (Date.now() - opts.requestStartedAt);
	const availableRepairBudgetMs = remainingBudgetMs - ADVISORY_TIMEOUT_MS;
	if (availableRepairBudgetMs < MIN_ADVISORY_BUDGET_MS) {
		logGenerationStep("brand_repair_skipped", {
			reason: "insufficient_budget",
			reasonCount: reasons.length,
			remainingBudgetMs,
		});
		return {
			...finalize(opts.sanitized, [
				"Brand repair was skipped due to request-budget limits; applied deterministic logo/font corrections where possible.",
			]),
		};
	}
	const timeoutMs = Math.min(BRAND_REPAIR_TIMEOUT_MS, availableRepairBudgetMs);

	logGenerationStep("brand_repair_started", {
		timeoutMs,
		reasonCount: reasons.length,
		logoPolicy: opts.brandSnapshot.logoPolicy,
	});

	try {
		const repairedRawHtml = await requestToolHtml({
			projectName: opts.projectName,
			prompt: buildBrandRepairPrompt(opts.brandSnapshot, reasons),
			brandSnapshot: opts.brandSnapshot,
			existingHtml: opts.sanitized.html,
			timeoutMs,
		});
		const repaired = sanitizeGeneratedHtml(repairedRawHtml);
		if (!looksLikeHtmlDocument(repaired.html)) {
			logGenerationStep("brand_repair_failed", {
				reason: "invalid_html",
				timeoutMs,
			});
			return finalize(opts.sanitized, [
				"Brand repair returned invalid HTML; applied deterministic logo/font corrections instead.",
			]);
		}
		const remainingReasons = collectBrandRepairReasons(repaired.html, opts.brandSnapshot);
		logGenerationStep("brand_repair_finished", {
			timeoutMs,
			initialReasonCount: reasons.length,
			remainingReasonCount: remainingReasons.length,
		});
		return finalize(repaired);
	} catch (error) {
		logGenerationStep("brand_repair_failed", {
			reason: error instanceof Error ? error.message : String(error),
			timeoutMs,
		});
		return finalize(opts.sanitized, [
			"Brand repair failed unexpectedly; applied deterministic logo/font corrections instead.",
		]);
	}
}

function buildBrandPrompt(brandSnapshot: GeneratedToolBrandSnapshot | null): string {
	if (!brandSnapshot)
		return "No brand context provided — use a clean, neutral, professional visual style.";

	const colorLines = Object.entries(brandSnapshot.colors)
		.slice(0, MAX_PROMPT_BRAND_COLORS)
		.map(([name, value]) => `${name}: ${value}`);
	const fontList = brandSnapshot.fonts.slice(0, MAX_PROMPT_BRAND_FONTS);
	const bodyFont = brandSnapshot.bodyFont ?? fontList[0] ?? null;
	const headingFont = brandSnapshot.headingFont ?? bodyFont;

	return [
		`Brand name: ${brandSnapshot.brandName ?? "Unknown"}`,
		`Colors: ${colorLines.length ? colorLines.join(", ") : "none detected"}`,
		`Fonts: ${fontList.join(", ") || "none detected"}`,
		bodyFont
			? `Typography usage: Use ${bodyFont} for the brand name text treatment, labels, inputs, buttons, and the main product UI.`
			: "Typography usage: No authoritative body/UI font was detected.",
		headingFont && headingFont !== bodyFont
			? `Optional display font: ${headingFont}. Use it sparingly for large editorial-style headings only; do not use it for badges, icons, faux logos, labels, or compact tool chrome.`
			: "Optional display font: none detected beyond the main UI font.",
		"Use the supplied colors as the header, CTA, and highlight anchors. Ignore any conflicting legacy palette.",
		brandSnapshot.logoPolicy === "exact_asset"
			? "A real logo asset exists and will be injected into the header programmatically after generation. Leave space for a clean brand lockup and do not invent, redraw, trace, or type a substitute logo."
			: `No trustworthy full-logo image is available. If you need visible branding, use a clean text-only brand-name treatment with the exact brand name "${brandSnapshot.brandName ?? "Unknown"}". Do not invent an icon, mascot, sparkle, silhouette, monogram, badge, or faux app-icon.`,
	].join("\n");
}

function shouldRetryHtmlGeneration(error: unknown, attempt: number): boolean {
	if (attempt >= MAX_GENERATION_ATTEMPTS) return false;
	if (!(error instanceof ToolGenerationStepError)) return true;
	return (
		error.code === "empty_response" || error.code === "network" || error.code === "upstream_5xx"
	);
}

function formatBuildFailureMessage(
	failure:
		| { kind: "step_error"; error: unknown; message: string }
		| { kind: "invalid_html"; message: string }
		| null,
	isRevision: boolean
): string {
	if (!failure) {
		return isRevision
			? "Revision did not return a usable HTML document. Try again or refine the instructions."
			: "Generation did not return a usable HTML document. Try again or refine the prompt.";
	}

	if (failure.kind === "invalid_html") {
		return failure.message;
	}

	if (failure.error instanceof ToolGenerationStepError) {
		if (failure.error.code === "timeout") {
			return isRevision
				? "Tool revision took too long to finish within the current request budget. Try a smaller change set, or retry after simplifying the instructions."
				: "Tool generation took too long to finish within the current request budget. Try a simpler prompt, or generate without brand context first and then revise it.";
		}
	}

	return failure.message;
}

function isAnthropicTimeoutError(error: unknown): boolean {
	if (!error) return false;
	if (typeof DOMException !== "undefined" && error instanceof DOMException) {
		return error.name === "AbortError" || error.name === "TimeoutError";
	}
	if (!(error instanceof Error)) return false;
	return /aborted due to timeout|aborterror|timeout/i.test(error.message);
}

function logGenerationStep(event: string, details: Record<string, unknown>): void {
	console.info(
		"[tool-generation]",
		JSON.stringify({
			event,
			...details,
		})
	);
}

async function timeGenerationStep<T>(event: string, fn: () => Promise<T>): Promise<T> {
	const startedAt = Date.now();
	const result = await fn();
	const isObject = typeof result === "object" && result !== null;
	logGenerationStep(event, {
		durationMs: Date.now() - startedAt,
		success: Boolean(result),
		...(isObject && "verdict" in (result as Record<string, unknown>)
			? { verdict: (result as { verdict?: unknown }).verdict ?? null }
			: {}),
	});
	return result;
}

function emptyDiagnostics(totalMs: number): ToolGenerationDiagnostics {
	return {
		totalMs,
		brandContextMs: 0,
		buildMs: 0,
		advisoryMs: 0,
		advisorySkipped: true,
		htmlAttempts: [],
	};
}

function finalizeDiagnostics(diagnostics: ToolGenerationDiagnostics): ToolGenerationDiagnostics {
	return {
		...diagnostics,
		totalMs: Math.round(diagnostics.totalMs),
		brandContextMs: Math.round(diagnostics.brandContextMs),
		buildMs: Math.round(diagnostics.buildMs),
		advisoryMs: Math.round(diagnostics.advisoryMs),
		htmlAttempts: diagnostics.htmlAttempts.map((attempt) => ({
			...attempt,
			durationMs: Math.round(attempt.durationMs),
		})),
	};
}
