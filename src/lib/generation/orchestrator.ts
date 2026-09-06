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
import { requestAnthropicText } from "@/lib/anthropic/messages";
import { buildPendingCompetitorContext } from "@/lib/brand/competitor-context";
import { MIN_LOGO_EDGE_PX } from "@/lib/brand/logo";
import { isBrandIngestionConfigured, pullBrandProfile, type BrandProfile } from "@/lib/brand";
import { enforceBrandPresentation } from "@/lib/generation/brand-enforcement";
import { buildPendingVisualCongruence } from "@/lib/generation/visual-congruence";
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
	type GeneratedToolVisualCongruence,
	type GeneratedToolRecord,
} from "@/lib/generation/store";

export interface ToolGenerationRequest {
	projectName: string;
	/** Optional — leave blank to generate without brand context. */
	siteUrl: string;
	prompt: string;
	brandOverrides?: ToolGenerationBrandOverrides;
	/**
	 * When set, revises the existing tool with this id in place (same id/embed
	 * URL, version bumped, previous content kept in history) instead of
	 * creating a brand-new tool. The prompt is treated as revision
	 * instructions and Claude is given the tool's current HTML to edit rather
	 * than starting from a blank page.
	 */
	toolId?: string;
}

export interface ToolGenerationBrandOverrides {
	colors?: Record<string, string>;
	fontFamily?: string;
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
// Repair uses the same full-HTML regeneration path as initial tool creation,
// so it needs a realistic ceiling. The request-budget guard below still caps
// it to whatever time remains inside TOOL_GENERATION_TARGET_BUDGET_MS.
const BRAND_REPAIR_TIMEOUT_MS = 180_000;
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 8_000;
const MAX_GENERATION_ATTEMPTS = 2;
const MAX_PROMPT_BRAND_COLORS = 4;
const MAX_PROMPT_BRAND_FONTS = 2;
const MIN_ADVISORY_BUDGET_MS = 5_000;
// Worst-case request-budget math for one /api/tools/generate request:
// - initial generation path:
//   - primary HTML generation attempt: 210s
//   - fallback retry (only for malformed HTML / transient 5xx/network failures): 35s
//   - advisory copy + brand-fidelity checks: 15s max wall time because they run in parallel
//   - optional repair pass: bounded by the remaining request budget after those steps,
//     with an upper ceiling of 180s. In the absolute worst case after a 210s main build
//     plus 15s advisories, the repair path only gets the ~55s still available inside the
//     280s app target. When the main build is faster, repair may use more of the leftover
//     budget, but never enough to exceed the 280s app target or 300s nginx ceiling.
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
const FIDELITY_ENFORCEMENT_STYLE_TAG = /<style[^>]*data-letterstory-brand-enforcement="true"[^>]*>[\s\S]*?<\/style>/i;
const BRAND_COLOR_KEYS = ["primary", "secondary", "accent", "background", "text"] as const;

type BrandColorKey = (typeof BRAND_COLOR_KEYS)[number];

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
	if (!request.toolId && !request.siteUrl.trim()) {
		return {
			status: "error",
			message: "Enter a brand site before generating this tool.",
			diagnostics: emptyDiagnostics(Date.now() - startedAt),
		};
	}
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
	const brandSnapshot = toBrandSnapshot(
		brandProfile,
		buildPendingCompetitorContext(normalizedSiteUrl || null)
	);
	const effectiveBrandSnapshot = applyBrandOverridesToSnapshot(
		brandSnapshot,
		request.brandOverrides
	);

	const built = await buildToolContent({
		projectName: request.projectName,
		prompt: request.prompt,
		siteUrl: normalizedSiteUrl || null,
		brandSnapshot: effectiveBrandSnapshot,
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
		brandSnapshot = toBrandSnapshot(
			resolved.brandProfile,
			buildPendingCompetitorContext(normalizedSiteUrl)
		);
		brandWarning = resolved.brandWarning;
	}
	brandSnapshot = applyBrandOverridesToSnapshot(brandSnapshot, request.brandOverrides);

	const built = await buildToolContent({
		projectName: request.projectName || existing.projectName,
		prompt: request.prompt,
		siteUrl: normalizedSiteUrl || existing.siteUrl,
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
		visualCongruence: GeneratedToolVisualCongruence | null;
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
	siteUrl: string | null;
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
	const initialSanitized = sanitized;

	// Both of these are advisory, fail-soft enrichments — Mathew's brief
	// explicitly calls for (a) supporting headline/copy around the embedded
	// iframe, and (b) an LLM cross-check that the generated tool doesn't
	// drift from the brand. Neither should block shipping the tool itself;
	// a failure just surfaces as a warning for the customer to review.
	let advisoryMs = 0;
	let advisorySkipped = false;
	let copy: GeneratedToolCopy | null = null;
	let brandFidelity: GeneratedToolBrandFidelity | null = null;
	let brandFidelityUnavailableWarning: string | null = null;
	const remainingBudgetMs = TOOL_GENERATION_TARGET_BUDGET_MS - (Date.now() - opts.requestStartedAt);
	const advisoryRan = remainingBudgetMs >= ADVISORY_TIMEOUT_MS + MIN_ADVISORY_BUDGET_MS;
	if (advisoryRan) {
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
							html: initialSanitized.html,
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
	} else {
		advisorySkipped = true;
		logGenerationStep("advisory_phase_skipped", {
			remainingBudgetMs,
			requiredBudgetMs: ADVISORY_TIMEOUT_MS + MIN_ADVISORY_BUDGET_MS,
		});
	}

	const fidelityRepairReasons =
		brandFidelity && brandFidelity.verdict !== "pass"
			? [
					brandFidelity.notes ||
						"Review the generated styling against the brand and correct any mismatched colors, fonts, logo treatment, or tone.",
				]
			: [];
	const originalBrandFidelity = brandFidelity;
	if (brandFidelity && fidelityRepairReasons.length) {
		logGenerationStep("brand_fidelity_repair_requested", {
			verdict: brandFidelity.verdict,
			noteChars: fidelityRepairReasons[0]?.length ?? 0,
		});
	}

	const repaired = await maybeRepairBrandPresentation({
		projectName: opts.projectName,
		brandSnapshot: opts.brandSnapshot,
		sanitized: initialSanitized,
		requestStartedAt: opts.requestStartedAt,
		additionalReasons: fidelityRepairReasons,
		reservedAdvisoryBudgetMs: advisoryRan ? 0 : ADVISORY_TIMEOUT_MS,
	});
	const enforced = await enforceBrandPresentation({
		html: repaired.sanitized.html,
		projectName: opts.projectName,
		brandSnapshot: opts.brandSnapshot,
	});
	sanitized = enforced.sanitized;
	if (opts.brandSnapshot && brandFidelity && fidelityRepairReasons.length && repaired.didRepair) {
		const remainingRecheckBudgetMs =
			TOOL_GENERATION_TARGET_BUDGET_MS - (Date.now() - opts.requestStartedAt);
		if (remainingRecheckBudgetMs >= MIN_ADVISORY_BUDGET_MS) {
			const recheckStartedAt = Date.now();
			const refreshedBrandFidelity = await timeGenerationStep("brand_fidelity_rechecked", () =>
				requestBrandFidelityCheck({
					html: sanitized.html,
					brandSnapshot: opts.brandSnapshot as GeneratedToolBrandSnapshot,
					timeoutMs: Math.min(ADVISORY_TIMEOUT_MS, remainingRecheckBudgetMs),
				})
			);
			advisoryMs += Date.now() - recheckStartedAt;
			if (refreshedBrandFidelity) {
				brandFidelity = refreshedBrandFidelity;
				const deterministicColorCheck =
					originalBrandFidelity?.notes && noteDescribesColorIssue(originalBrandFidelity.notes)
						? verifyBrandColorUsage(
								sanitized.html,
								opts.brandSnapshot as GeneratedToolBrandSnapshot,
								originalBrandFidelity.notes
						  )
						: null;
				if (
					deterministicColorCheck?.applicable &&
					deterministicColorCheck.passed &&
					brandFidelity.notes &&
					noteDescribesColorIssue(brandFidelity.notes)
				) {
					const filteredNotes = filterNegativeColorFeedback(brandFidelity.notes);
					logGenerationStep("brand_fidelity_color_repair_verified", {
						relevantKeys: deterministicColorCheck.relevantKeys,
						missingKeys: deterministicColorCheck.missingKeys,
						textColorApplied: deterministicColorCheck.textColorApplied,
						suppressedColorWarning: !filteredNotes,
					});
					brandFidelity = filteredNotes
						? {
								verdict: brandFidelity.verdict,
								notes: filteredNotes,
						  }
						: { verdict: "pass", notes: "" };
				}
			} else {
				brandFidelity = null;
				brandFidelityUnavailableWarning =
					"Brand repair was applied, but the post-repair brand fidelity check could not be completed.";
			}
		} else {
			logGenerationStep("brand_fidelity_recheck_skipped", {
				reason: "insufficient_budget",
				remainingBudgetMs: remainingRecheckBudgetMs,
			});
			brandFidelity = null;
			brandFidelityUnavailableWarning =
				"Brand repair was applied, but the post-repair brand fidelity check was skipped to stay within the live request budget.";
		}
	}
	const warnings = [
		...(opts.brandWarning ? [opts.brandWarning] : []),
		...repaired.warnings,
		...enforced.warnings,
		...sanitized.warnings,
	];
	if (advisorySkipped) {
		warnings.push(
			"Supporting copy and brand QA were skipped to return the generated tool within the live request budget."
		);
	}
	if (advisoryRan) {
		if (!copy) {
			warnings.push(
				"Could not generate supporting headline/copy for this tool — add your own before embedding."
			);
		}

		if (opts.brandSnapshot) {
			if (!brandFidelity) {
				warnings.push(
					brandFidelityUnavailableWarning ??
						"Brand fidelity check could not be completed for this tool."
				);
			} else if (brandFidelity.verdict !== "pass") {
				warnings.push(
					`Brand fidelity check (${brandFidelity.verdict}): ${
						brandFidelity.notes || "review the generated styling against the brand."
					}`
				);
			}
		}
	}

	logGenerationStep("build_succeeded", {
		durationMs: Date.now() - buildStartedAt,
		totalWarnings: warnings.length,
	});
	const visualCongruence =
		opts.brandSnapshot && opts.siteUrl ? buildPendingVisualCongruence(opts.siteUrl) : null;
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
			visualCongruence,
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
async function resolveBrandContext(siteUrl: string): Promise<{
	brandProfile: BrandProfile | null;
	brandWarning: string | null;
}> {
	if (!siteUrl) return { brandProfile: null, brandWarning: null };

	if (!isBrandIngestionConfigured()) {
		return {
			brandProfile: null,
			brandWarning:
				"Context.dev isn't configured, so this tool was generated without brand context.",
		};
	}

	const startedAt = Date.now();
	try {
		const brandProfile = await pullBrandProfile(siteUrl);
		// Competitor context is dashboard-only metadata today; it is not used by
		// the generation prompt or any synchronous repair path, so keeping those
		// extra Anthropic + Context.dev round trips on the critical request path
		// only burns latency budget and can push live generation toward gateway
		// timeouts on slow competitor sites.
		logGenerationStep("brand_context_resolved", {
			siteUrl,
			durationMs: Date.now() - startedAt,
			brandName: brandProfile.brandName,
			competitorContextMode: "skipped_for_generation_latency",
		});
		return { brandProfile, brandWarning: null };
	} catch (error) {
		logGenerationStep("brand_context_failed", {
			siteUrl,
			durationMs: Date.now() - startedAt,
			error: error instanceof Error ? error.message : String(error),
		});
		return {
			brandProfile: null,
			brandWarning: `Brand ingestion failed (${
				error instanceof Error ? error.message : String(error)
			}); generated without brand context.`,
		};
	}
}

function toBrandSnapshot(
	profile: BrandProfile | null,
	competitorContext: GeneratedToolBrandSnapshot["competitorContext"] = null
): GeneratedToolBrandSnapshot | null {
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
		fontFamilyMode: "embedded_only",
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
		competitorContext,
	};
}

function applyBrandOverridesToSnapshot(
	brandSnapshot: GeneratedToolBrandSnapshot | null,
	overrides?: ToolGenerationBrandOverrides
): GeneratedToolBrandSnapshot | null {
	if (!overrides) return brandSnapshot;

	const nextColors = Object.fromEntries(
		Object.entries(overrides.colors ?? {}).filter(
			([name, value]) => Boolean(name.trim()) && Boolean(value.trim())
		)
	);
	const nextFont = overrides.fontFamily?.trim() || null;
	if (!Object.keys(nextColors).length && !nextFont) return brandSnapshot;

	const baseSnapshot: GeneratedToolBrandSnapshot = brandSnapshot ?? {
		brandName: null,
		colors: {},
		fonts: [],
		headingFont: null,
		bodyFont: null,
		headingFontFace: null,
		bodyFontFace: null,
		fontFamilyMode: "embedded_only",
		logoPolicy: "text_only",
		logoDataUri: null,
		competitorContext: null,
	};
	const existingFonts = baseSnapshot.fonts ?? [];

	return {
		...baseSnapshot,
		colors: {
			...baseSnapshot.colors,
			...nextColors,
		},
		fonts: nextFont ? [nextFont, ...existingFonts.filter((font) => font !== nextFont)] : existingFonts,
		headingFont: nextFont ?? baseSnapshot.headingFont,
		bodyFont: nextFont ?? baseSnapshot.bodyFont,
		headingFontFace: nextFont ? null : baseSnapshot.headingFontFace ?? null,
		bodyFontFace: nextFont ? null : baseSnapshot.bodyFontFace ?? null,
		fontFamilyMode: nextFont ? "named_with_fallback" : baseSnapshot.fontFamilyMode ?? "embedded_only",
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
		if ((profile.images.logoVariants ?? []).some((variant) => variant.type === "logo")) {
			return true;
		}

		const width = profile.images.logo.width ?? 0;
		const height = profile.images.logo.height ?? 0;
		const shortEdge = Math.min(width, height);
		const longEdge = Math.max(width, height);
		return (
			shortEdge >= MIN_LOGO_EDGE_PX * 2 &&
			longEdge > 0 &&
			longEdge / shortEdge <= 1.33
		);
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
		"- The branded verification header rendered above the document already displays the tool name. Inside <main>, do NOT repeat the project name as another top-level heading. Start with supporting descriptive copy instead, and only use a different heading if it adds new meaning beyond restating the tool name.",
		"- Ramp UX rule 1 — contextualized results, never naked numbers: after any numeric calculation, show a labeled value AND one plain-language interpretation sentence. Examples: `Total Deduction: $362.50` + `100% business miles reimbursed`; `Estimated late fees: $480` + `That is roughly the cost of one missed invoice this month.` Never leave a raw number standing alone, and a formula note/disclaimer does NOT count as the interpretation sentence.",
		"- Ramp UX rule 2 — page order is tool → value → CTA, with no gates: the tool must be fully usable with zero email, signup, login, modal gate, or blocked state before the user gets value. Keep the sequence `headline/description → interactive tool card → in-place result → separate brand CTA section`. If you include a brand CTA, place it AFTER the result, never before, and mark the containers with `data-letterstory-tool='true'`, `data-letterstory-result='true'`, and `data-letterstory-brand-cta='true'` so post-processing can verify placement.",
		"- Brand CTA copy must follow this exact Ramp-style formula: headline `See how [Brand] [automates/handles/simplifies] [topic] for [X] [customers/businesses]` with understated button copy like `Explore product`, `Explore travel`, or `Explore expense automation`. Good examples: `See how Ramp automates expense and mileage tracking for 70,000 businesses` → `Explore product`; `See how Acme simplifies late invoice follow-up for 4,200 customers` → `Explore collections workflow`. Never use `Sign up`, `Try free`, `Get started`, countdowns, or urgency language.",
		"- Ramp UX rule 3 — input microcopy embeds the formula or unit inline: put the rate/unit in secondary label text right inside the label, not in a tooltip or separate help paragraph. Examples: `Business miles driven ($0.725 / mile)`, `Average invoice amount ($ / invoice)`, `Team size (employees)`. Do NOT output a standalone helper line like `Typical range: 1%–3% per month` unless the same rate/unit is already embedded inline in the label.",
		"- Ramp UX rule 4 — pick ONE submit mode, never hybrid: fixed-formula calculators must use exactly two action buttons in this order: secondary `Clear` on the left and primary `Calculate` on the right, and both buttons should remain available for repeated calculations. Never replace `Clear` with a lone `Reset` button. Generator/builder/preview tools must update in real time with NO submit button, and the result/output area must include actions like `Copy mission` + `Try again` or `Copy policy` + `Try again`. Never mix real-time updates with a `Calculate`, `Generate`, or `Submit` button on the same tool.",
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
	timeoutMs?: number;
}): Promise<string | null> {
	try {
		const response = await requestAnthropicText({
			system: opts.system,
			userContent: opts.userContent,
			maxTokens: opts.maxTokens,
			timeoutMs: opts.timeoutMs ?? ADVISORY_TIMEOUT_MS,
		});
		return response.text;
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
 * output does not look like a different company" requirement. This remains a
 * source-level check against the generated HTML/CSS itself; the separate
 * brand-profile validation flow can now do a Firecrawl screenshot color
 * cross-check, but this tool-level advisory still does not inspect rendered
 * pixels from the generated tool.
 */
async function requestBrandFidelityCheck(opts: {
	html: string;
	brandSnapshot: GeneratedToolBrandSnapshot;
	timeoutMs?: number;
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

	const truncatedHtml = buildBrandFidelityReviewHtml(opts.html);

	const userContent = [brandContext, "", "Generated tool source:", truncatedHtml].join("\n");

	const text = await requestAdvisoryText({
		system,
		userContent,
		maxTokens: 200,
		timeoutMs: opts.timeoutMs,
	});
	if (!text) return null;

	const verdictRaw = text.match(/VERDICT:\s*(\w+)/i)?.[1]?.toLowerCase();
	const notes = text.match(/NOTES:\s*(.*)/i)?.[1]?.trim() ?? "";
	if (verdictRaw !== "pass" && verdictRaw !== "warn" && verdictRaw !== "fail") return null;

	return { verdict: verdictRaw, notes };
}

function buildBrandFidelityReviewHtml(html: string): string {
	if (html.length <= MAX_FIDELITY_HTML_CHARS) return html;

	const enforcementStyle = html.match(FIDELITY_ENFORCEMENT_STYLE_TAG)?.[0] ?? "";
	const trailer = "\n<!-- truncated for review -->";
	if (!enforcementStyle || html.slice(0, MAX_FIDELITY_HTML_CHARS).includes(enforcementStyle)) {
		return `${html.slice(0, MAX_FIDELITY_HTML_CHARS)}${trailer}`;
	}

	const reservedChars = enforcementStyle.length + trailer.length + 32;
	const prefixBudget = Math.max(0, MAX_FIDELITY_HTML_CHARS - reservedChars);
	return [
		html.slice(0, prefixBudget),
		"\n<!-- managed brand enforcement -->\n",
		enforcementStyle,
		trailer,
	].join("");
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeHexColor(value: string | null | undefined): string | null {
	if (!value) return null;
	const trimmed = value.trim();
	const shortHexMatch = trimmed.match(/^#([0-9a-f]{3})$/i);
	if (shortHexMatch) {
		const [r, g, b] = shortHexMatch[1].split("");
		return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
	}
	const longHexMatch = trimmed.match(/^#([0-9a-f]{6})$/i);
	return longHexMatch ? `#${longHexMatch[1].toUpperCase()}` : null;
}

function htmlMentionsFontFamily(html: string, family: string | null | undefined): boolean {
	if (!family) return false;
	return new RegExp(escapeRegex(family), "i").test(html);
}

function htmlMentionsColorValue(html: string, color: string | null | undefined): boolean {
	const normalizedColor = normalizeHexColor(color);
	if (!normalizedColor) return false;
	return new RegExp(escapeRegex(normalizedColor), "i").test(html);
}

function htmlUsesBrandTextColor(
	html: string,
	brandSnapshot: GeneratedToolBrandSnapshot
): boolean {
	const normalizedTextColor = normalizeHexColor(brandSnapshot.colors.text);
	if (!normalizedTextColor) return false;
	return new RegExp(
		`body\\s*\\{[\\s\\S]{0,800}?color\\s*:\\s*(?:var\\(\\s*--ls-brand-color-text\\s*\\)|${escapeRegex(
			normalizedTextColor
		)})`,
		"i"
	).test(html);
}

function noteMentionsColorFeedback(note: string): boolean {
	return /(color|palette|primary|secondary|accent|background|body text|text token|#[0-9a-f]{3,6})/i.test(
		note
	);
}

function noteHasNegativeFeedbackCue(note: string): boolean {
	return /(mismatch|different|instead|absent|missing|never used|not used|wrong|deviat|fails|fallback|not applied|omitted)/i.test(
		note
	);
}

function noteDescribesColorIssue(note: string): boolean {
	return noteMentionsColorFeedback(note) && noteHasNegativeFeedbackCue(note);
}

function collectRelevantBrandColorKeys(
	note: string,
	brandSnapshot: GeneratedToolBrandSnapshot
): BrandColorKey[] {
	const declaredKeys = BRAND_COLOR_KEYS.filter((key) =>
		Boolean(normalizeHexColor(brandSnapshot.colors[key]))
	);
	if (!noteMentionsColorFeedback(note)) return [];

	const normalizedNote = note.toLowerCase();
	if (/(color palette|brand colors|colors\b)/i.test(note) && noteHasNegativeFeedbackCue(note)) {
		return declaredKeys;
	}

	const relevantKeys = declaredKeys.filter((key) => normalizedNote.includes(key));
	for (const key of declaredKeys) {
		const value = normalizeHexColor(brandSnapshot.colors[key]);
		if (value && normalizedNote.includes(value.toLowerCase())) {
			relevantKeys.push(key);
		}
	}
	if (/(body text|text color|text token|--text)/i.test(note)) {
		relevantKeys.push("text");
	}

	return [...new Set(relevantKeys)];
}

function verifyBrandColorUsage(
	html: string,
	brandSnapshot: GeneratedToolBrandSnapshot,
	note: string
): {
	applicable: boolean;
	passed: boolean;
	relevantKeys: BrandColorKey[];
	missingKeys: BrandColorKey[];
	textColorApplied: boolean;
} {
	const relevantKeys = collectRelevantBrandColorKeys(note, brandSnapshot);
	if (!relevantKeys.length) {
		return {
			applicable: false,
			passed: false,
			relevantKeys: [],
			missingKeys: [],
			textColorApplied: false,
		};
	}

	const missingKeys = relevantKeys.filter(
		(key) => !htmlMentionsColorValue(html, brandSnapshot.colors[key])
	);
	const textColorApplied = relevantKeys.includes("text")
		? htmlUsesBrandTextColor(html, brandSnapshot)
		: true;

	return {
		applicable: true,
		passed: missingKeys.length === 0 && textColorApplied,
		relevantKeys,
		missingKeys,
		textColorApplied,
	};
}

function splitFeedbackClauses(note: string): string[] {
	return note
		.split(
			/\s*(?:;\s*|,\s*but\s+|\s+but\s+|,\s*while\s+|\s+while\s+|,\s*and\s+|\.\s+)\s*/i
		)
		.map((clause) => clause.trim())
		.filter(Boolean);
}

function filterNegativeColorFeedback(note: string): string {
	return splitFeedbackClauses(note)
		.filter((clause) => noteHasNegativeFeedbackCue(clause) && !noteDescribesColorIssue(clause))
		.join("; ");
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

function mergeBrandRepairReasons(
	deterministicReasons: string[],
	additionalReasons: string[]
): string[] {
	const merged = [...deterministicReasons];
	for (const reason of additionalReasons) {
		const trimmed = reason.trim();
		if (!trimmed || merged.includes(trimmed)) continue;
		merged.push(trimmed);
	}
	return merged;
}

function buildBrandRepairPrompt(
	brandSnapshot: GeneratedToolBrandSnapshot,
	reasons: string[]
): string {
	const colorLines = Object.entries(brandSnapshot.colors)
		.slice(0, MAX_PROMPT_BRAND_COLORS)
		.map(([label, value]) => `${label}: ${value}`);

	return [
		"Brand fidelity correction only.",
		"Keep the existing calculator logic, input/output behavior, copy, spacing, and overall layout unless a small targeted edit is required for the brand corrections below.",
		colorLines.length
			? [
					"Authoritative brand colors to apply in rendered CSS/UI (do not substitute lookalikes):",
					...colorLines.map((line) => `- ${line}`),
			  ].join("\n")
			: "Authoritative brand colors: none detected.",
		brandSnapshot.bodyFont
			? `Primary UI/body font to use: ${brandSnapshot.bodyFont}.`
			: "Primary UI/body font: none detected.",
		brandSnapshot.headingFont && brandSnapshot.headingFont !== brandSnapshot.bodyFont
			? `Optional display font: ${brandSnapshot.headingFont}.`
			: "Optional display font: none detected beyond the main UI font.",
		brandSnapshot.logoPolicy === "exact_asset"
			? "A real logo asset will be injected into the header programmatically after generation. Leave a clean brand area for it and do not draw, trace, or type a substitute logo."
			: `Do not draw or invent any icon for the header. If branding is visible, use the exact brand name text only: ${brandSnapshot.brandName ?? "Unknown"}.`,
		"When a repair reason cites missing or wrong colors, update the actual CSS/custom properties/body text/buttons/cards so those exact tokens are visibly used in the rendered UI.",
		"Required fixes:",
		...reasons.map((reason) => `- ${reason}`),
	].join("\n");
}

async function maybeRepairBrandPresentation(opts: {
	projectName: string;
	brandSnapshot: GeneratedToolBrandSnapshot | null;
	sanitized: SanitizedHtml;
	requestStartedAt: number;
	additionalReasons?: string[];
	reservedAdvisoryBudgetMs?: number;
}): Promise<{
	sanitized: SanitizedHtml;
	warnings: string[];
	didRepair: boolean;
}> {
	if (!opts.brandSnapshot) {
		return { sanitized: opts.sanitized, warnings: [], didRepair: false };
	}

	const deterministicReasons = collectBrandRepairReasons(opts.sanitized.html, opts.brandSnapshot);
	const additionalReasons = opts.additionalReasons ?? [];
	const reasons = mergeBrandRepairReasons(deterministicReasons, additionalReasons);
	if (!reasons.length) {
		logGenerationStep("brand_repair_skipped", { reason: "not_needed" });
		return { sanitized: opts.sanitized, warnings: [], didRepair: false };
	}

	const finalize = (
		sanitized: SanitizedHtml,
		extraWarnings: string[] = [],
		didRepair = false
	) => {
		return {
			sanitized,
			warnings: extraWarnings,
			didRepair,
		};
	};

	const remainingBudgetMs = TOOL_GENERATION_TARGET_BUDGET_MS - (Date.now() - opts.requestStartedAt);
	const reservedAdvisoryBudgetMs = opts.reservedAdvisoryBudgetMs ?? ADVISORY_TIMEOUT_MS;
	const availableRepairBudgetMs = remainingBudgetMs - reservedAdvisoryBudgetMs;
	if (availableRepairBudgetMs < MIN_ADVISORY_BUDGET_MS) {
		logGenerationStep("brand_repair_skipped", {
			reason: "insufficient_budget",
			reasonCount: reasons.length,
			deterministicReasonCount: deterministicReasons.length,
			additionalReasonCount: additionalReasons.length,
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
		deterministicReasonCount: deterministicReasons.length,
		additionalReasonCount: additionalReasons.length,
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
			deterministicReasonCount: deterministicReasons.length,
			additionalReasonCount: additionalReasons.length,
			remainingReasonCount: remainingReasons.length,
		});
		return finalize(repaired, [], true);
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
		"Fallback rule: if the named brand fonts are not actually embedded in the document, fall back to a clean system sans-serif stack unless the authoritative brand metadata clearly indicates a serif body/UI identity.",
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
