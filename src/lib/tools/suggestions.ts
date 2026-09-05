import { envServer } from "@/lib/config/env.server";
import { isBrandIngestionConfigured, pullBrandProfile, type BrandProfile } from "@/lib/brand";
import { requestAnthropicText } from "@/lib/anthropic/messages";

const TOOL_SUGGESTION_TIMEOUT_MS = 45_000;
const MAX_MARKDOWN_CHARS_FOR_SUGGESTIONS = 6_000;

export interface ToolSuggestion {
	title: string;
	description: string;
	prompt: string;
}

export interface ToolSuggestionBrandContext {
	siteUrl: string;
	brandName: string | null;
	industry: string;
	businessSummary: string;
}

export interface ToolSuggestionsSuccessResult {
	status: "success";
	requestedUrl: string;
	brand: ToolSuggestionBrandContext;
	suggestions: ToolSuggestion[];
	model: string;
}

export interface ToolSuggestionsFailureResult {
	status: "not_configured" | "error";
	requestedUrl: string;
	message: string;
}

export type ToolSuggestionsResult =
	| ToolSuggestionsSuccessResult
	| ToolSuggestionsFailureResult;

export function isToolSuggestionConfigured(): boolean {
	return isBrandIngestionConfigured() && Boolean(envServer.ANTHROPIC_API_KEY);
}

export async function suggestToolsForBrand(siteUrl: string): Promise<ToolSuggestionsResult> {
	if (!isBrandIngestionConfigured()) {
		return {
			status: "not_configured",
			requestedUrl: siteUrl,
			message: "Set CONTEXT_DEV_API_KEY before requesting brand-aware tool suggestions.",
		};
	}
	if (!envServer.ANTHROPIC_API_KEY) {
		return {
			status: "not_configured",
			requestedUrl: siteUrl,
			message: "Set ANTHROPIC_API_KEY before requesting brand-aware tool suggestions.",
		};
	}

	if (!siteUrl.trim()) {
		return {
			status: "error",
			requestedUrl: siteUrl,
			message: "Provide a siteUrl string.",
		};
	}

	try {
		const profile = await pullBrandProfile(siteUrl);
		const { text, model } = await requestAnthropicText({
			system: buildSuggestionSystemPrompt(),
			userContent: buildSuggestionUserPrompt(profile),
			maxTokens: 1_400,
			timeoutMs: TOOL_SUGGESTION_TIMEOUT_MS,
		});
		const parsed = parseSuggestionResponse(text);

		return {
			status: "success",
			requestedUrl: siteUrl,
			brand: {
				siteUrl: profile.url,
				brandName: profile.brandName,
				industry: parsed.industry,
				businessSummary: parsed.businessSummary,
			},
			suggestions: parsed.suggestions,
			model,
		};
	} catch (error) {
		return {
			status: "error",
			requestedUrl: siteUrl,
			message: error instanceof Error ? error.message : String(error),
		};
	}
}

interface RawSuggestionResponse {
	industry?: unknown;
	businessSummary?: unknown;
	suggestions?: unknown;
}

function buildSuggestionSystemPrompt(): string {
	return [
		"You are a product strategist helping a website owner decide which one small embeddable utility tool to build next.",
		"Return plain text only with this exact structure:",
		"INDUSTRY: <short industry label>",
		"BUSINESS_SUMMARY: <one sentence about what the company actually sells or does>",
		"---",
		"TITLE: <short tool title>",
		"DESCRIPTION: <one sentence>",
		"PROMPT: <ready-to-use build prompt on a single line>",
		"---",
		"TITLE: <short tool title>",
		"DESCRIPTION: <one sentence>",
		"PROMPT: <ready-to-use build prompt on a single line>",
		"Repeat 3 to 5 suggestion blocks total.",
		"First infer the company's real business and industry from the supplied homepage evidence and structured brand profile. Do not guess only from the domain name.",
		"Then propose 3 to 5 genuinely useful, concrete, free utility or lead-gen tools that fit that exact business. Think like the best polished utility-tool libraries from SaaS brands such as calculators, estimators, checkers, planners, or generators.",
		"Every suggestion must be single-purpose, customer-facing, embeddable in one iframe, and realistically buildable in one shot with HTML/CSS/JS only.",
		"Avoid vague ideas such as dashboards, portals, CRMs, quizzes without a clear utility, or anything that needs account data, logins, uploads, backend integrations, or multi-step workflows.",
		"Descriptions must be one sentence each. Prompts must be ready to send directly to an HTML tool generator and should describe concrete inputs, outputs, calculations or logic, and visible UX behavior.",
		"Prefer practical tools that help visitors self-qualify, estimate costs or savings, compare options, or get a quick decision aid before contacting sales.",
	].join("\n");
}

function buildSuggestionUserPrompt(profile: BrandProfile): string {
	const referenceMarkdown = extractReferenceMarkdown(profile);
	return [
		`Site URL: ${profile.url}`,
		`Structured brand profile: ${JSON.stringify(createSuggestionPromptProfile(profile), null, 2)}`,
		`Homepage markdown excerpt: ${referenceMarkdown.slice(0, MAX_MARKDOWN_CHARS_FOR_SUGGESTIONS)}`,
	].join("\n\n");
}

function createSuggestionPromptProfile(profile: BrandProfile): Record<string, unknown> {
	return {
		brandName: profile.brandName,
		metadata: {
			title: readString(profile.metadata.title),
			description: readString(profile.metadata.description),
		},
		colors: profile.colors,
		fonts: profile.fonts,
		personality: profile.personality,
		designSystem: profile.designSystem,
		images: {
			imageryStyle: profile.images.imageryStyle,
			notes: profile.images.notes,
		},
	};
}

function extractReferenceMarkdown(profile: BrandProfile): string {
	const contextMarkdown = readRecord(profile.raw.contextMarkdown);
	const markdown = readString(contextMarkdown?.markdown);
	if (markdown) return markdown;

	return [
		readString(profile.metadata.title),
		readString(profile.metadata.description),
		profile.personality.toneOfVoice,
		profile.personality.targetAudience,
		profile.personality.descriptors.join(", "),
	]
		.filter(Boolean)
		.join("\n\n");
}

function normalizeSuggestionResponse(payload: RawSuggestionResponse): {
	industry: string;
	businessSummary: string;
	suggestions: ToolSuggestion[];
} {
	const industry = readNonEmptyString(payload.industry);
	const businessSummary = readNonEmptyString(payload.businessSummary);
	const suggestions = Array.isArray(payload.suggestions)
		? payload.suggestions
				.map((entry) => normalizeSuggestion(entry))
				.filter((entry): entry is ToolSuggestion => Boolean(entry))
		: [];

	if (!industry || !businessSummary || suggestions.length < 3 || suggestions.length > 5) {
		throw new Error("Anthropic returned an invalid suggestion payload.");
	}

	return { industry, businessSummary, suggestions };
}

function parseSuggestionResponse(text: string): {
	industry: string;
	businessSummary: string;
	suggestions: ToolSuggestion[];
} {
	try {
		return normalizeSuggestionResponse(parseJsonObject<RawSuggestionResponse>(text));
	} catch {
		const structured = parseStructuredSuggestionText(text);
		if (structured) return structured;
		throw new Error("Anthropic suggestions returned a non-JSON response.");
	}
}

function normalizeSuggestion(value: unknown): ToolSuggestion | null {
	if (!value || typeof value !== "object") return null;
	const record = value as Record<string, unknown>;
	const title = readNonEmptyString(record.title);
	const description = readNonEmptyString(record.description);
	const prompt = readNonEmptyString(record.prompt);
	if (!title || !description || !prompt) return null;
	return { title, description, prompt };
}

function parseJsonObject<T>(text: string): T {
	try {
		return JSON.parse(extractJsonObject(text)) as T;
	} catch {
		throw new Error("Anthropic suggestions returned a non-JSON response.");
	}
}

function extractJsonObject(text: string): string {
	const trimmed = text.trim();
	if (!trimmed) return trimmed;
	if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

	const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
	if (fenced?.startsWith("{") && fenced.endsWith("}")) return fenced;

	const start = trimmed.indexOf("{");
	const end = trimmed.lastIndexOf("}");
	if (start >= 0 && end > start) return trimmed.slice(start, end + 1);

	return trimmed;
}

function readRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function readString(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNonEmptyString(value: unknown): string | null {
	return readString(value);
}

function parseStructuredSuggestionText(text: string): {
	industry: string;
	businessSummary: string;
	suggestions: ToolSuggestion[];
} | null {
	const normalized = text.replace(/\r\n/g, "\n").trim();
	const industry = normalized.match(/^\s*INDUSTRY:\s*(.+)$/im)?.[1]?.trim() ?? null;
	const businessSummary =
		normalized.match(/^\s*BUSINESS_SUMMARY:\s*(.+)$/im)?.[1]?.trim() ?? null;
	const blockPattern =
		/^\s*TITLE:\s*(.+)\nDESCRIPTION:\s*(.+)\nPROMPT:\s*([\s\S]*?)(?=\n(?:---\s*\n)?TITLE:|\s*$)/gim;
	const suggestions: ToolSuggestion[] = [];

	for (const match of normalized.matchAll(blockPattern)) {
		const title = match[1]?.trim();
		const description = match[2]?.trim();
		const prompt = match[3]?.replace(/\n+/g, " ").trim();
		if (!title || !description || !prompt) continue;
		suggestions.push({ title, description, prompt });
	}

	if (!industry || !businessSummary || suggestions.length < 3 || suggestions.length > 5) {
		return null;
	}

	return { industry, businessSummary, suggestions };
}
