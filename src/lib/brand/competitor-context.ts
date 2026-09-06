import { requestAnthropicText } from "@/lib/anthropic/messages";
import { envServer } from "@/lib/config/env.server";
import {
	getGeneratedTool,
	updateGeneratedToolCompetitorContext,
	type GeneratedToolRecord,
} from "@/lib/generation/store";
import {
	normalizeBrandSiteUrl,
	pullBrandProfile,
	type BrandProfile,
} from "./service";

const COMPETITOR_ADVISORY_TIMEOUT_MS = 15_000;
const MAX_COMPETITORS = 3;

type FontCategory = "sans-serif" | "serif" | "monospace" | "display" | "unknown";
type ColorFamily = "cool" | "warm" | "neutral" | "unknown";
type LogoStyle = "wordmark" | "logo-mark" | "combination" | "unknown";
type BrandCompetitorSignal = "matches" | "mixed" | "diverges" | "suspicious_match" | "limited";
export type BrandCompetitorContextStatus = "pending" | "completed" | "failed";

export interface BrandCompetitorEntry {
	companyName: string;
	domain: string;
	status: "analyzed" | "unavailable";
	brandName: string | null;
	primaryColor: string | null;
	primaryColorFamily: ColorFamily;
	fontFamily: string | null;
	fontCategory: FontCategory;
	logoStyle: LogoStyle;
	notes: string[];
}

export interface BrandCompetitorTargetSignal {
	primaryColor: string | null;
	primaryColorFamily: ColorFamily;
	fontFamily: string | null;
	fontCategory: FontCategory;
	logoStyle: LogoStyle;
}

export interface BrandCompetitorIndustryNorms {
	sampleSize: number;
	primaryColorFamily: ColorFamily;
	fontCategory: FontCategory;
	logoStyle: LogoStyle;
}

export interface BrandCompetitorContext {
	status: BrandCompetitorContextStatus;
	industry: string | null;
	signal: BrandCompetitorSignal | null;
	summary: string;
	target: BrandCompetitorTargetSignal | null;
	industryNorms: BrandCompetitorIndustryNorms | null;
	competitors: BrandCompetitorEntry[];
	notes: string[];
	analyzedAt: string | null;
}

export interface CompetitorCandidate {
	companyName: string;
	domain: string;
}

export interface CompetitorContextDeps {
	identifyCompetitors: (profile: BrandProfile) => Promise<{
		industry: string | null;
		competitors: CompetitorCandidate[];
	}>;
	fetchCompetitorSignal: (candidate: CompetitorCandidate) => Promise<BrandCompetitorEntry>;
}

interface FinalizeCompetitorContextDeps {
	getTool: typeof getGeneratedTool;
	loadBrandProfile: typeof pullBrandProfile;
	buildContext: typeof buildCompetitorContextForBrand;
	saveContext: typeof updateGeneratedToolCompetitorContext;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeFontName(value: string | null): string | null {
	return value?.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() ?? null;
}

function normalizeHex(value: string | null): string | null {
	if (!value) return null;
	const trimmed = value.trim();
	if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) return null;
	if (trimmed.length === 4) {
		return `#${trimmed
			.slice(1)
			.split("")
			.map((part) => `${part}${part}`)
			.join("")}`.toUpperCase();
	}
	return trimmed.toUpperCase();
}

export function classifyColorFamily(value: string | null): ColorFamily {
	const normalized = normalizeHex(value);
	if (!normalized) return "unknown";
	const hex = normalized.slice(1);
	const r = parseInt(hex.slice(0, 2), 16) / 255;
	const g = parseInt(hex.slice(2, 4), 16) / 255;
	const b = parseInt(hex.slice(4, 6), 16) / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const delta = max - min;
	const lightness = (max + min) / 2;

	if (delta < 0.1 || (lightness > 0.85 && delta < 0.2) || (lightness < 0.2 && delta < 0.2)) {
		return "neutral";
	}

	let hue = 0;
	if (delta !== 0) {
		if (max === r) hue = ((g - b) / delta) % 6;
		else if (max === g) hue = (b - r) / delta + 2;
		else hue = (r - g) / delta + 4;
	}
	hue = Math.round(hue * 60);
	if (hue < 0) hue += 360;

	if ((hue >= 30 && hue < 90) || hue >= 330 || hue < 30) return "warm";
	return "cool";
}

export function classifyFontCategory(fontFamily: string | null, hint?: string | null): FontCategory {
	const raw = `${hint ?? ""} ${fontFamily ?? ""}`.toLowerCase();
	if (!raw.trim()) return "unknown";
	if (raw.includes("mono")) return "monospace";
	if (raw.includes("serif") && !raw.includes("sans-serif") && !raw.includes("sans serif")) {
		return "serif";
	}
	if (raw.includes("sans-serif") || raw.includes("sans serif") || raw.includes("sans")) {
		return "sans-serif";
	}
	if (
		/(display|condensed|black|wide|script|grotesk|grotesque|cereal|graphik|inter|sohne|helvetica|arial|norms)/i.test(
			raw
		)
	) {
		return "sans-serif";
	}
	return "unknown";
}

function inferLogoStyleFromText(text: string): LogoStyle {
	if (!text.trim()) return "unknown";
	if (/(combination|wordmark.+icon|icon.+wordmark|logo.+wordmark.+icon)/i.test(text)) {
		return "combination";
	}
	if (/(favicon|app icon|\bicon\b|monogram|\bmark\b|badge|symbol)/i.test(text)) {
		return "logo-mark";
	}
	if (/(wordmark|logotype|text logo|full logo|horizontal logo|brand name)/i.test(text)) {
		return "wordmark";
	}
	return "unknown";
}

export function inferLogoStyleFromBrandProfile(profile: BrandProfile): LogoStyle {
	if (profile.images.logo.type === "icon") return "logo-mark";
	if (profile.images.logo.type === "logo") {
		const aspectRatio =
			profile.images.logo.width && profile.images.logo.height
				? profile.images.logo.width / profile.images.logo.height
				: null;
		if (aspectRatio && aspectRatio >= 2) return "wordmark";
		return "combination";
	}
	return inferLogoStyleFromText(
		[
			profile.images.logo.selectionReasoning,
			profile.primaryLogoUrl,
			...(profile.logoUrls ?? []),
		]
			.filter(Boolean)
			.join(" ")
	);
}

function inferIndustry(profile: BrandProfile): string | null {
	const raw = isRecord(profile.raw.contextBrand) ? profile.raw.contextBrand : {};
	const brand = isRecord(raw.brand) ? raw.brand : {};
	const industries = isRecord(brand.industries) ? brand.industries : {};
	const eic = Array.isArray(industries.eic) ? industries.eic : [];
	for (const entry of eic) {
		if (!isRecord(entry)) continue;
		const industry = readString(entry.subindustry) ?? readString(entry.industry);
		if (industry) return industry;
	}
	return (
		readString(profile.metadata.description) ??
		readString(profile.metadata.title) ??
		profile.personality.targetAudience ??
		profile.personality.toneOfVoice ??
		null
	);
}

function extractDomain(urlOrDomain: string): string | null {
	try {
		const normalized = normalizeBrandSiteUrl(urlOrDomain);
		if (!normalized) return null;
		return new URL(normalized).hostname.replace(/^www\./, "");
	} catch {
		return null;
	}
}

function normalizeCompetitorCandidates(
	targetDomain: string,
	competitors: CompetitorCandidate[]
): CompetitorCandidate[] {
	const seen = new Set<string>();
	const results: CompetitorCandidate[] = [];
	for (const competitor of competitors) {
		const domain = extractDomain(competitor.domain);
		if (!domain || domain === targetDomain || seen.has(domain)) continue;
		seen.add(domain);
		results.push({
			companyName: competitor.companyName.trim() || domain,
			domain,
		});
		if (results.length >= MAX_COMPETITORS) break;
	}
	return results;
}

function mode<T extends string>(values: T[]): T | "unknown" {
	if (!values.length) return "unknown";
	const counts = new Map<T, number>();
	for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
	return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "unknown";
}

function chooseTargetPrimaryColor(profile: BrandProfile): string | null {
	return (
		normalizeHex(profile.colors.primary ?? null) ??
		normalizeHex(profile.colors.accent ?? null) ??
		normalizeHex(profile.colors.secondary ?? null) ??
		Object.values(profile.colors).map((value) => normalizeHex(value)).find(Boolean) ??
		null
	);
}

export function buildTargetCompetitorSignal(profile: BrandProfile): BrandCompetitorTargetSignal {
	const primaryColor = chooseTargetPrimaryColor(profile);
	const fontFamily =
		normalizeFontName(profile.typography.bodyFont) ??
		normalizeFontName(profile.typography.primaryFont) ??
		normalizeFontName(profile.fonts[0] ?? null);
	return {
		primaryColor,
		primaryColorFamily: classifyColorFamily(primaryColor),
		fontFamily,
		fontCategory: classifyFontCategory(fontFamily, profile.typography.bodyFontFace?.category ?? null),
		logoStyle: inferLogoStyleFromBrandProfile(profile),
	};
}

function summarizeNorms(
	industry: string | null,
	target: BrandCompetitorTargetSignal,
	competitors: BrandCompetitorEntry[]
): BrandCompetitorContext {
	const analyzed = competitors.filter((competitor) => competitor.status === "analyzed");
	const norms: BrandCompetitorIndustryNorms = {
		sampleSize: analyzed.length,
		primaryColorFamily: mode(
			analyzed
				.map((competitor) => competitor.primaryColorFamily)
				.filter((value): value is ColorFamily => value !== "unknown")
		),
		fontCategory: mode(
			analyzed
				.map((competitor) => competitor.fontCategory)
				.filter((value): value is FontCategory => value !== "unknown")
		),
		logoStyle: mode(
			analyzed
				.map((competitor) => competitor.logoStyle)
				.filter((value): value is LogoStyle => value !== "unknown")
		),
	};

	const notes: string[] = [];
	const comparableRules = [
		{
			label: "palette",
			norm: norms.primaryColorFamily,
			target: target.primaryColorFamily,
		},
		{
			label: "typography",
			norm: norms.fontCategory,
			target: target.fontCategory,
		},
		{
			label: "logo treatment",
			norm: norms.logoStyle,
			target: target.logoStyle,
		},
	].filter((rule) => rule.norm !== "unknown" && rule.target !== "unknown");

	const matches = comparableRules.filter((rule) => rule.norm === rule.target);
	const mismatches = comparableRules.filter((rule) => rule.norm !== rule.target);

	const suspiciousCompetitor = analyzed.find((competitor) => {
		let overlap = 0;
		if (
			target.primaryColorFamily !== "unknown" &&
			competitor.primaryColorFamily === target.primaryColorFamily
		) {
			overlap += 1;
		}
		if (target.fontCategory !== "unknown" && competitor.fontCategory === target.fontCategory) {
			overlap += 1;
		}
		if (target.logoStyle !== "unknown" && competitor.logoStyle === target.logoStyle) {
			overlap += 1;
		}
		const sameNamedFont =
			target.fontFamily &&
			competitor.fontFamily &&
			target.fontFamily.toLowerCase() === competitor.fontFamily.toLowerCase();
		return overlap >= 3 || (overlap >= 2 && sameNamedFont);
	});

	let signal: BrandCompetitorContext["signal"] = "mixed";
	if (analyzed.length < 2) signal = "limited";
	else if (suspiciousCompetitor) signal = "suspicious_match";
	else if (mismatches.length >= 2) signal = "diverges";
	else if (matches.length >= Math.max(1, comparableRules.length - 1)) signal = "matches";

	if (suspiciousCompetitor) {
		notes.push(
			`Extracted target signals line up unusually closely with ${suspiciousCompetitor.companyName}; double-check color/font/logo attribution.`
		);
	}
	if (mismatches.length) {
		notes.push(
			`Target differs from competitor norms on ${mismatches.map((rule) => rule.label).join(", ")}.`
		);
	}
	const unavailable = competitors.filter((competitor) => competitor.status === "unavailable");
	if (unavailable.length) {
		notes.push(
			`Could not analyze ${unavailable.map((competitor) => competitor.companyName).join(", ")} via Context.dev.`
		);
	}

	const normParts = [
		norms.primaryColorFamily !== "unknown" ? `${norms.primaryColorFamily} palette` : null,
		norms.fontCategory !== "unknown" ? `${norms.fontCategory} typography` : null,
		norms.logoStyle !== "unknown" ? `${norms.logoStyle} logo treatment` : null,
	].filter((part): part is string => Boolean(part));
	const matchPhrase =
		signal === "matches"
			? "Extracted target broadly matches that pattern."
			: signal === "diverges"
				? "Extracted target diverges enough to merit a manual check."
				: signal === "suspicious_match"
					? "Extracted target may be too close to a competitor."
					: signal === "limited"
						? "Only partial competitor coverage was available."
						: "Extracted target only partially matches that pattern.";

	return {
		status: "completed",
		industry,
		signal,
		summary: `Competitor read${industry ? ` for ${industry}` : ""}: ${
			normParts.join(", ") || "limited usable norms"
		}. ${matchPhrase}`,
		target,
		industryNorms: norms,
		competitors,
		notes,
		analyzedAt: new Date().toISOString(),
	};
}

export function buildPendingCompetitorContext(siteUrl: string | null): BrandCompetitorContext | null {
	if (!siteUrl) return null;
	return {
		status: "pending",
		industry: null,
		signal: null,
		summary: "Analyzing competitor norms for this brand…",
		target: null,
		industryNorms: null,
		competitors: [],
		notes: [],
		analyzedAt: null,
	};
}

function buildFailedCompetitorContext(message: string): BrandCompetitorContext {
	return {
		status: "failed",
		industry: null,
		signal: null,
		summary: "Competitor analysis unavailable.",
		target: null,
		industryNorms: null,
		competitors: [],
		notes: [message],
		analyzedAt: new Date().toISOString(),
	};
}

async function requestAdvisoryText(system: string, userContent: string, maxTokens: number) {
	if (!envServer.ANTHROPIC_API_KEY) return null;
	try {
		return (
			await requestAnthropicText({
				system,
				userContent,
				maxTokens,
				timeoutMs: COMPETITOR_ADVISORY_TIMEOUT_MS,
			})
		).text;
	} catch {
		return null;
	}
}

export function parseCompetitorResponse(
	text: string
): { industry: string | null; competitors: CompetitorCandidate[] } | null {
	const candidates = [
		text.trim(),
		text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
	];
	const firstBrace = text.indexOf("{");
	const lastBrace = text.lastIndexOf("}");
	if (firstBrace >= 0 && lastBrace > firstBrace) {
		candidates.push(text.slice(firstBrace, lastBrace + 1));
	}

	for (const candidateText of candidates) {
		const parsed = parseCompetitorResponseJson(candidateText);
		if (parsed) return parsed;
	}
	return null;
}

function parseCompetitorResponseJson(
	text: string
): { industry: string | null; competitors: CompetitorCandidate[] } | null {
	try {
		const parsed = JSON.parse(text) as unknown;
		if (!isRecord(parsed)) return null;
		const competitors = Array.isArray(parsed.competitors)
			? parsed.competitors
					.map((entry) => {
						if (!isRecord(entry)) return null;
						const companyName = readString(entry.companyName);
						const domain = readString(entry.domain);
						if (!companyName || !domain) return null;
						return { companyName, domain };
					})
					.filter((entry): entry is CompetitorCandidate => Boolean(entry))
			: [];
		return {
			industry: readString(parsed.industry),
			competitors,
		};
	} catch {
		return null;
	}
}

async function identifyCompetitorsWithAnthropic(profile: BrandProfile) {
	const targetDomain = extractDomain(profile.url);
	if (!targetDomain) return { industry: inferIndustry(profile), competitors: [] };

	const system = [
		"You identify direct business competitors for a customer website.",
		"Return JSON only: {\"industry\": string|null, \"competitors\": [{\"companyName\": string, \"domain\": string}]}",
		"Pick 2-3 real direct competitors with primary public domains only.",
		"Do not include marketplaces, parent companies, agencies, or the target company itself.",
	].join("\n");
	const userContent = [
		`Brand: ${profile.brandName ?? targetDomain}`,
		`Domain: ${targetDomain}`,
		`Inferred industry/context: ${inferIndustry(profile) ?? "unknown"}`,
		`Homepage title: ${readString(profile.metadata.title) ?? "unknown"}`,
		`Homepage description: ${readString(profile.metadata.description) ?? "unknown"}`,
	].join("\n");

	const text = await requestAdvisoryText(system, userContent, 250);
	const parsed = text ? parseCompetitorResponse(text) : null;
	return parsed ?? { industry: inferIndustry(profile), competitors: [] };
}

export function extractCompetitorSignalFromBrandProfile(
	candidate: CompetitorCandidate,
	profile: BrandProfile
): BrandCompetitorEntry {
	const targetSignal = buildTargetCompetitorSignal(profile);
	return {
		companyName: candidate.companyName,
		domain: candidate.domain,
		status: "analyzed",
		brandName: profile.brandName ?? candidate.companyName,
		primaryColor: targetSignal.primaryColor,
		primaryColorFamily: targetSignal.primaryColorFamily,
		fontFamily: targetSignal.fontFamily,
		fontCategory: targetSignal.fontCategory,
		logoStyle: targetSignal.logoStyle,
		notes: [],
	};
}

async function fetchCompetitorSignalWithContextDev(
	candidate: CompetitorCandidate
): Promise<BrandCompetitorEntry> {
	const profile = await pullBrandProfile(candidate.domain);
	return extractCompetitorSignalFromBrandProfile(candidate, profile);
}

export async function buildCompetitorContextForBrand(
	profile: BrandProfile,
	deps: Partial<CompetitorContextDeps> = {}
): Promise<BrandCompetitorContext | null> {
	if (!envServer.ANTHROPIC_API_KEY || !envServer.CONTEXT_DEV_API_KEY) return null;

	const targetDomain = extractDomain(profile.url);
	if (!targetDomain) return null;

	const identifyCompetitors = deps.identifyCompetitors ?? identifyCompetitorsWithAnthropic;
	const fetchCompetitorSignal = deps.fetchCompetitorSignal ?? fetchCompetitorSignalWithContextDev;

	const identified = await identifyCompetitors(profile);
	const candidates = normalizeCompetitorCandidates(targetDomain, identified.competitors);
	if (!candidates.length) return null;

	const competitors = await Promise.all(
		candidates.map(async (candidate) => {
			try {
				return await fetchCompetitorSignal(candidate);
			} catch (error) {
				return {
					companyName: candidate.companyName,
					domain: candidate.domain,
					status: "unavailable" as const,
					brandName: null,
					primaryColor: null,
					primaryColorFamily: "unknown" as const,
					fontFamily: null,
					fontCategory: "unknown" as const,
					logoStyle: "unknown" as const,
					notes: [error instanceof Error ? error.message : String(error)],
				};
			}
		})
	);

	const analyzedCount = competitors.filter((competitor) => competitor.status === "analyzed").length;
	if (!analyzedCount) return null;

	return summarizeNorms(identified.industry ?? inferIndustry(profile), buildTargetCompetitorSignal(profile), competitors);
}

function shouldAnalyzeTool(tool: GeneratedToolRecord, expectedVersion: number): boolean {
	return (
		tool.version === expectedVersion &&
		Boolean(tool.siteUrl) &&
		Boolean(tool.brandSnapshot) &&
		tool.brandSnapshot?.competitorContext?.status === "pending"
	);
}

function logCompetitorContextStep(event: string, details: Record<string, unknown>): void {
	console.info("[tool-generation]", JSON.stringify({ event, ...details }));
}

export async function finalizeCompetitorContextForTool(
	opts: { toolId: string; expectedVersion: number },
	deps: Partial<FinalizeCompetitorContextDeps> = {}
): Promise<void> {
	const getTool = deps.getTool ?? getGeneratedTool;
	const loadBrandProfile = deps.loadBrandProfile ?? pullBrandProfile;
	const buildContext = deps.buildContext ?? buildCompetitorContextForBrand;
	const saveContext = deps.saveContext ?? updateGeneratedToolCompetitorContext;
	const tool = await getTool(opts.toolId);
	if (!tool || !shouldAnalyzeTool(tool, opts.expectedVersion) || !tool.siteUrl) return;

	const startedAt = Date.now();
	let competitorContext: BrandCompetitorContext;
	try {
		const profile = await loadBrandProfile(tool.siteUrl);
		competitorContext =
			(await buildContext(profile)) ??
			buildFailedCompetitorContext("Competitor analysis returned no usable signal.");
		logCompetitorContextStep("competitor_context_completed", {
			toolId: opts.toolId,
			durationMs: Date.now() - startedAt,
			status: competitorContext.status,
			competitorCount: competitorContext.competitors.length,
		});
	} catch (error) {
		competitorContext = buildFailedCompetitorContext(
			error instanceof Error ? error.message : String(error)
		);
		logCompetitorContextStep("competitor_context_failed", {
			toolId: opts.toolId,
			durationMs: Date.now() - startedAt,
			error: competitorContext.notes[0] ?? "unknown error",
		});
	}

	await saveContext(opts.toolId, opts.expectedVersion, competitorContext);
}
