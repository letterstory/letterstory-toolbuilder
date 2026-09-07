import { envServer } from "@/lib/config/env.server";
import { looksLikeHtmlDocument, sanitizeGeneratedHtml } from "@/lib/generation/sanitize";
import { isSafeHttpsUrl } from "@/lib/net/ssrf";
import { normalizeSiteUrl } from "@/lib/utils";
import {
	getGeneratedTool,
	updateGeneratedToolIfVersionMatches,
	updateGeneratedToolVisualCongruence,
	type GeneratedToolContent,
	type GeneratedToolRecord,
	type GeneratedToolVisualCongruence,
} from "@/lib/generation/store";

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";
const VISUAL_CONGRUENCE_TIMEOUT_MS = 45_000;
const VISUAL_CONGRUENCE_REPAIR_TIMEOUT_MS = 180_000;
const VIEWPORT = { width: 1440, height: 1280 };
const SETTLE_DELAY_MS = 1_500;
const VISUAL_WARNING_PREFIX = "Visual brand match";
const VISUAL_REPAIR_WARNING_PREFIX = "Visual congruence auto-repair";

type RequestToolHtml = (opts: {
	projectName: string;
	prompt: string;
	brandSnapshot: GeneratedToolRecord["brandSnapshot"];
	maxTokens: number;
	timeoutMs: number;
	existingHtml?: string;
}) => Promise<string>;

interface FinalizeVisualCongruenceDeps {
	getTool: typeof getGeneratedTool;
	analyze: typeof analyzeVisualCongruence;
	save: typeof updateGeneratedToolVisualCongruence;
	saveRepairedTool: typeof updateGeneratedToolIfVersionMatches;
	requestHtml: RequestToolHtml;
	htmlGenerationMaxTokens: number;
}

interface AnthropicImageSource {
	type: "base64";
	media_type: "image/png";
	data: string;
}

interface AnthropicImageBlock {
	type: "image";
	source: AnthropicImageSource;
}

interface AnthropicTextBlock {
	type: "text";
	text: string;
}

interface AnthropicMessageBlock {
	type?: string;
	text?: string;
}

interface AnthropicMessagesResponse {
	content?: AnthropicMessageBlock[];
	error?: {
		type?: string;
		message?: string;
	};
}

interface VisualCongruenceAssessment {
	congruenceScore: number | null;
	verdict: "pass" | "warn" | "fail" | null;
	notes: string;
	risks: string[];
}

function readString(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clampCongruenceScore(value: unknown): number | null {
	const numeric = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(numeric)) return null;
	return Math.min(5, Math.max(1, Math.round(numeric)));
}

function normalizeVerdict(value: unknown): VisualCongruenceAssessment["verdict"] {
	return value === "pass" || value === "warn" || value === "fail" ? value : null;
}

function extractJsonObject(text: string): string | null {
	const fenced = text.match(/```json\s*([\s\S]*?)```/i);
	if (fenced?.[1]) return fenced[1].trim();

	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	if (start === -1 || end === -1 || end <= start) return null;
	return text.slice(start, end + 1);
}

function parseJsonObject<T>(text: string): T {
	const candidate = extractJsonObject(text);
	if (!candidate) throw new Error("Visual congruence review returned a non-JSON response.");

	try {
		return JSON.parse(candidate) as T;
	} catch {
		return JSON.parse(candidate.replace(/,\s*([}\]])/g, "$1")) as T;
	}
}

export function normalizeVisualCongruenceAssessment(value: unknown): VisualCongruenceAssessment {
	const raw = isRecord(value) ? value : {};
	const risks = Array.isArray(raw.risks)
		? raw.risks.map((entry) => readString(entry)).filter((entry): entry is string => Boolean(entry)).slice(0, 5)
		: [];

	return {
		congruenceScore: clampCongruenceScore(raw.congruenceScore),
		verdict: normalizeVerdict(raw.verdict),
		notes: readString(raw.notes) ?? "Claude did not provide visual-congruence notes.",
		risks,
	};
}

export function parseVisualCongruenceResponse(text: string): VisualCongruenceAssessment {
	return normalizeVisualCongruenceAssessment(parseJsonObject(text));
}

function pendingVisualCongruence(): GeneratedToolVisualCongruence {
	return {
		status: "pending",
		congruenceScore: null,
		verdict: null,
		notes: "Analyzing visual match against the live brand site…",
		risks: [],
		referenceUrl: null,
		analyzedAt: null,
	};
}

export function buildPendingVisualCongruence(siteUrl: string | null): GeneratedToolVisualCongruence | null {
	return siteUrl ? pendingVisualCongruence() : null;
}

function buildFailedVisualCongruence(referenceUrl: string, message: string): GeneratedToolVisualCongruence {
	return {
		status: "failed",
		congruenceScore: null,
		verdict: null,
		notes: message,
		risks: [],
		referenceUrl,
		analyzedAt: new Date().toISOString(),
	};
}

function buildCompletedVisualCongruence(
	referenceUrl: string,
	assessment: VisualCongruenceAssessment
): GeneratedToolVisualCongruence {
	return {
		status: "completed",
		congruenceScore: assessment.congruenceScore,
		verdict: assessment.verdict,
		notes: assessment.notes,
		risks: assessment.risks,
		referenceUrl,
		analyzedAt: new Date().toISOString(),
	};
}

export function mergeVisualCongruenceWarnings(
	warnings: string[],
	visualCongruence: GeneratedToolVisualCongruence
): string[] {
	const withoutExisting = warnings.filter((warning) => !warning.startsWith(VISUAL_WARNING_PREFIX));
	if (visualCongruence.status === "pending") return withoutExisting;
	if (visualCongruence.status === "failed") {
		return [...withoutExisting, `${VISUAL_WARNING_PREFIX} could not be completed: ${visualCongruence.notes}`];
	}
	if (visualCongruence.verdict && visualCongruence.verdict !== "pass") {
		return [
			...withoutExisting,
			`${VISUAL_WARNING_PREFIX} (${visualCongruence.verdict}): ${visualCongruence.notes}`,
		];
	}
	return withoutExisting;
}

async function waitForFonts(page: {
	waitForFunction: (pageFunction: string, options: { timeout: number }) => Promise<unknown>;
}) {
	try {
		await page.waitForFunction(
			'!document.fonts || document.fonts.status === "loaded"',
			{ timeout: 5_000 }
		);
	} catch {
		// Best-effort only.
	}
}

async function renderGeneratedToolScreenshot(html: string): Promise<string> {
	const { chromium } = await import("playwright");
	const browser = await chromium.launch({
		headless: true,
		args: ["--no-sandbox", "--disable-setuid-sandbox"],
	});
	try {
		const page = await browser.newPage({ viewport: VIEWPORT, colorScheme: "light" });
		await page.setContent(html, { waitUntil: "load", timeout: 15_000 });
		await waitForFonts(page);
		await page.waitForTimeout(SETTLE_DELAY_MS);
		const buffer = await page.screenshot({ type: "png", fullPage: false, animations: "disabled" });
		return buffer.toString("base64");
	} finally {
		await browser.close();
	}
}

async function captureReferenceSiteScreenshot(siteUrl: string): Promise<{ base64: string; referenceUrl: string }> {
	const safety = await isSafeHttpsUrl(siteUrl);
	if (!safety.ok) throw new Error(`Refusing to capture an unsafe reference URL: ${safety.reason}`);

	const { chromium } = await import("playwright");
	const browser = await chromium.launch({
		headless: true,
		args: ["--no-sandbox", "--disable-setuid-sandbox"],
	});
	try {
		const page = await browser.newPage({ viewport: VIEWPORT, colorScheme: "light" });
		await page.goto(siteUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
		await page.waitForTimeout(SETTLE_DELAY_MS);
		await waitForFonts(page);
		const buffer = await page.screenshot({ type: "png", fullPage: false, animations: "disabled" });
		return { base64: buffer.toString("base64"), referenceUrl: page.url() };
	} finally {
		await browser.close();
	}
}

async function requestVisualCongruenceAssessment(opts: {
	brandName: string | null;
	siteUrl: string;
	referenceImageBase64: string;
	generatedImageBase64: string;
}): Promise<VisualCongruenceAssessment> {
	const apiKey = envServer.ANTHROPIC_API_KEY;
	if (!apiKey) throw new Error("Set ANTHROPIC_API_KEY before running visual congruence analysis.");

	const model = envServer.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;
	const response = await fetch("https://api.anthropic.com/v1/messages", {
		method: "POST",
		headers: {
			"x-api-key": apiKey,
			"anthropic-version": "2023-06-01",
			"content-type": "application/json",
		},
		body: JSON.stringify({
			model,
			max_tokens: 600,
			system: [
				"You are a brand-design QA reviewer.",
				"You will compare two screenshots: first the real brand homepage, then the generated tool.",
				"Judge whether the generated tool plausibly belongs to the same brand based on gestalt, not token checkbox matching.",
				"Consider layout density, spacing rhythm, typographic weight/scale, corner radii, imagery treatment, contrast discipline, overall polish level, and visual tone.",
				"Do NOT spend your notes on exact logo/color/font matching unless those directly affect the overall gestalt.",
				"Return JSON only. No markdown fences.",
				"Use this exact schema:",
				JSON.stringify(
					{
						congruenceScore: 1,
						verdict: "pass | warn | fail",
						notes: "short string",
						risks: ["array of short strings"],
					},
					null,
					2
				),
			].join("\n"),
			messages: [
				{
					role: "user",
					content: [
						{
							type: "text",
							text: [
								`Brand: ${opts.brandName ?? "Unknown"}`,
								`Reference site: ${opts.siteUrl}`,
								"Image 1 = live brand homepage. Image 2 = generated tool. Compare whether image 2 looks like the same company designed it.",
							].join("\n"),
						} satisfies AnthropicTextBlock,
						{
							type: "image",
							source: {
								type: "base64",
								media_type: "image/png",
								data: opts.referenceImageBase64,
							},
						} satisfies AnthropicImageBlock,
						{
							type: "image",
							source: {
								type: "base64",
								media_type: "image/png",
								data: opts.generatedImageBase64,
							},
						} satisfies AnthropicImageBlock,
					],
				},
			],
		}),
		signal: AbortSignal.timeout(VISUAL_CONGRUENCE_TIMEOUT_MS),
	});
	const body = (await response.json().catch(() => ({}))) as AnthropicMessagesResponse;
	if (!response.ok) {
		throw new Error(`Anthropic visual congruence failed (${response.status}): ${body.error?.message ?? "unknown error"}`);
	}

	const text = body.content
		?.filter((block) => block.type === "text")
		.map((block) => block.text ?? "")
		.join("\n")
		.trim();
	if (!text) throw new Error("Anthropic visual congruence returned no text response.");

	const assessment = parseVisualCongruenceResponse(text);
	if (!assessment.verdict) throw new Error("Anthropic visual congruence did not provide a verdict.");
	return assessment;
}

export async function analyzeVisualCongruence(opts: {
	html: string;
	siteUrl: string;
	brandName: string | null;
	captureReferenceScreenshot?: typeof captureReferenceSiteScreenshot;
	renderGeneratedScreenshot?: typeof renderGeneratedToolScreenshot;
	requestAssessment?: typeof requestVisualCongruenceAssessment;
}): Promise<GeneratedToolVisualCongruence> {
	const captureReferenceScreenshot = opts.captureReferenceScreenshot ?? captureReferenceSiteScreenshot;
	const renderGeneratedScreenshot = opts.renderGeneratedScreenshot ?? renderGeneratedToolScreenshot;
	const requestAssessment = opts.requestAssessment ?? requestVisualCongruenceAssessment;
	const normalizedSiteUrl = normalizeSiteUrl(opts.siteUrl);
	const { base64: referenceImageBase64, referenceUrl } = await captureReferenceScreenshot(normalizedSiteUrl);
	const generatedImageBase64 = await renderGeneratedScreenshot(opts.html);
	const assessment = await requestAssessment({
		brandName: opts.brandName,
		siteUrl: referenceUrl,
		referenceImageBase64,
		generatedImageBase64,
	});
	return buildCompletedVisualCongruence(referenceUrl, assessment);
}

function shouldAnalyzeTool(tool: GeneratedToolRecord, expectedVersion: number): boolean {
	return (
		tool.version === expectedVersion &&
		Boolean(tool.siteUrl) &&
		Boolean(tool.brandSnapshot) &&
		tool.visualCongruence?.status === "pending"
	);
}

function logVisualCongruenceStep(event: string, details: Record<string, unknown>): void {
	console.info("[tool-generation]", JSON.stringify({ event, ...details }));
}

function appendUniqueWarnings(warnings: string[], additions: string[]): string[] {
	const next = [...warnings];
	for (const addition of additions) {
		const trimmed = addition.trim();
		if (!trimmed || next.includes(trimmed)) continue;
		next.push(trimmed);
	}
	return next;
}

function buildVisualCongruenceRepairPrompt(
	tool: GeneratedToolRecord,
	assessment: GeneratedToolVisualCongruence
): string {
	const feedback = [
		assessment.notes,
		...assessment.risks,
	].map((entry) => entry.trim()).filter(Boolean);

	return [
		"Visual brand congruence correction only.",
		`Brand: ${tool.brandSnapshot?.brandName ?? "Unknown"}.`,
		"Keep the existing tool logic, fields, calculations, copy, and overall functionality intact.",
		"Do not rebuild the tool from scratch. Make the smallest set of HTML/CSS/UI edits needed so the rendered result feels like it belongs to the same brand as the reference site.",
		"Prioritize overall gestalt, especially layout structure, spacing rhythm, typography scale/weight, surface treatment, card/button chrome, contrast discipline, and polish level.",
		"Address the screenshot-based critique below:",
		...feedback.map((entry) => `- ${entry}`),
	].join("\n");
}

function toolContentFromRecord(
	tool: GeneratedToolRecord,
	overrides: Partial<GeneratedToolContent>
): GeneratedToolContent {
	return {
		projectName: tool.projectName,
		prompt: tool.prompt,
		siteUrl: tool.siteUrl,
		brandSnapshot: tool.brandSnapshot,
		html: tool.html,
		copy: tool.copy,
		brandFidelity: tool.brandFidelity,
		visualCongruence: tool.visualCongruence,
		logic: tool.logic,
		model: tool.model,
		warnings: tool.warnings,
		...overrides,
	};
}

async function loadRepairGenerationDeps(): Promise<{
	requestHtml: RequestToolHtml;
	htmlGenerationMaxTokens: number;
}> {
	const { requestToolHtml, HTML_GENERATION_MAX_TOKENS } = await import("@/lib/generation/orchestrator");
	return {
		requestHtml: requestToolHtml,
		htmlGenerationMaxTokens: HTML_GENERATION_MAX_TOKENS,
	};
}

export async function finalizeVisualCongruenceForTool(opts: {
	toolId: string;
	expectedVersion: number;
}, deps: Partial<FinalizeVisualCongruenceDeps> = {}): Promise<void> {
	const getTool = deps.getTool ?? getGeneratedTool;
	const analyze = deps.analyze ?? analyzeVisualCongruence;
	const save = deps.save ?? updateGeneratedToolVisualCongruence;
	const saveRepairedTool = deps.saveRepairedTool ?? updateGeneratedToolIfVersionMatches;
	const tool = await getTool(opts.toolId);
	if (!tool || !shouldAnalyzeTool(tool, opts.expectedVersion) || !tool.siteUrl) return;

	const startedAt = Date.now();
	let visualCongruence: GeneratedToolVisualCongruence;
	try {
		visualCongruence = await analyze({
			html: tool.html,
			siteUrl: tool.siteUrl,
			brandName: tool.brandSnapshot?.brandName ?? null,
		});
		logVisualCongruenceStep("visual_congruence_completed", {
			toolId: opts.toolId,
			durationMs: Date.now() - startedAt,
			status: visualCongruence.status,
			verdict: visualCongruence.verdict,
			congruenceScore: visualCongruence.congruenceScore,
		});
	} catch (error) {
		visualCongruence = buildFailedVisualCongruence(
			tool.siteUrl,
			error instanceof Error ? error.message : String(error)
		);
		logVisualCongruenceStep("visual_congruence_failed", {
			toolId: opts.toolId,
			durationMs: Date.now() - startedAt,
			error: visualCongruence.notes,
		});
	}

	const warnings = mergeVisualCongruenceWarnings(tool.warnings, visualCongruence);
	const saved = await save(opts.toolId, opts.expectedVersion, visualCongruence, warnings);
	if (!saved) {
		logVisualCongruenceStep("visual_congruence_save_skipped", {
			toolId: opts.toolId,
			expectedVersion: opts.expectedVersion,
		});
		return;
	}

	if (visualCongruence.status === "completed" && visualCongruence.verdict === "fail") {
		const current = await getTool(opts.toolId);
		if (!current || current.version !== opts.expectedVersion || !current.siteUrl) {
			logVisualCongruenceStep("visual_congruence_repair_skipped", {
				toolId: opts.toolId,
				expectedVersion: opts.expectedVersion,
				reason: "version_mismatch",
				currentVersion: current?.version ?? null,
			});
			return;
		}

		const repairStartedAt = Date.now();
		logVisualCongruenceStep("visual_congruence_repair_attempted", {
			toolId: opts.toolId,
			expectedVersion: opts.expectedVersion,
			congruenceScore: visualCongruence.congruenceScore,
			riskCount: visualCongruence.risks.length,
		});

		const repairDeps = deps.requestHtml && deps.htmlGenerationMaxTokens
			? {
					requestHtml: deps.requestHtml,
					htmlGenerationMaxTokens: deps.htmlGenerationMaxTokens,
				}
			: await loadRepairGenerationDeps();
		try {
			const repairedRawHtml = await repairDeps.requestHtml({
				projectName: current.projectName,
				prompt: buildVisualCongruenceRepairPrompt(current, visualCongruence),
				brandSnapshot: current.brandSnapshot,
				existingHtml: current.html,
				maxTokens: repairDeps.htmlGenerationMaxTokens,
				timeoutMs: VISUAL_CONGRUENCE_REPAIR_TIMEOUT_MS,
			});
			const repaired = sanitizeGeneratedHtml(repairedRawHtml);
			if (!looksLikeHtmlDocument(repaired.html)) {
				throw new Error("returned invalid HTML");
			}

			const repairedVisualCongruence = await analyze({
				html: repaired.html,
				siteUrl: current.siteUrl,
				brandName: current.brandSnapshot?.brandName ?? null,
			});
			logVisualCongruenceStep("visual_congruence_reanalysis_completed", {
				toolId: opts.toolId,
				expectedVersion: opts.expectedVersion,
				durationMs: Date.now() - repairStartedAt,
				verdict: repairedVisualCongruence.verdict,
				congruenceScore: repairedVisualCongruence.congruenceScore,
				status: repairedVisualCongruence.status,
			});

			if (repairedVisualCongruence.verdict === "fail") {
				logVisualCongruenceStep("visual_congruence_repair_did_not_resolve", {
					toolId: opts.toolId,
					expectedVersion: opts.expectedVersion,
					congruenceScore: repairedVisualCongruence.congruenceScore,
				});
			}

			const repairedWarnings = mergeVisualCongruenceWarnings(
				appendUniqueWarnings(current.warnings, repaired.warnings),
				repairedVisualCongruence
			);
			const repairedTool = await saveRepairedTool(
				opts.toolId,
				opts.expectedVersion,
				toolContentFromRecord(current, {
					html: repaired.html,
					visualCongruence: repairedVisualCongruence,
					warnings: repairedWarnings,
				})
			);
			if (!repairedTool) {
				logVisualCongruenceStep("visual_congruence_save_skipped", {
					toolId: opts.toolId,
					expectedVersion: opts.expectedVersion,
				});
				return;
			}

			logVisualCongruenceStep("visual_congruence_repair_succeeded", {
				toolId: opts.toolId,
				expectedVersion: opts.expectedVersion,
				durationMs: Date.now() - repairStartedAt,
				newVersion: repairedTool.version,
				verdict: repairedVisualCongruence.verdict,
				congruenceScore: repairedVisualCongruence.congruenceScore,
			});
			return;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logVisualCongruenceStep("visual_congruence_repair_failed", {
				toolId: opts.toolId,
				expectedVersion: opts.expectedVersion,
				durationMs: Date.now() - repairStartedAt,
				error: message,
			});
			const updatedWarnings = mergeVisualCongruenceWarnings(
				appendUniqueWarnings(current.warnings, [`${VISUAL_REPAIR_WARNING_PREFIX} failed: ${message}`]),
				visualCongruence
			);
			const savedWithRepairWarning = await save(
				opts.toolId,
				opts.expectedVersion,
				visualCongruence,
				updatedWarnings
			);
			if (!savedWithRepairWarning) {
				logVisualCongruenceStep("visual_congruence_save_skipped", {
					toolId: opts.toolId,
					expectedVersion: opts.expectedVersion,
				});
			}
			return;
		}
	}
}
