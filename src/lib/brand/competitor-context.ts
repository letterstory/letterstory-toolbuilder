import { requestAnthropicText } from "@/lib/anthropic/messages";
import { envServer } from "@/lib/config/env.server";
import { isSafeHttpsUrl } from "@/lib/net/ssrf";
import { firecrawlScrapeBranding, isFirecrawlConfigured } from "./firecrawl-client";
import { normalizeBrandSiteUrl, type BrandProfile } from "./service";

const COMPETITOR_ADVISORY_TIMEOUT_MS = 15_000;
const DIRECT_COMPETITOR_FETCH_TIMEOUT_MS = 10_000;
const MAX_COMPETITORS = 3;

type FontCategory = "sans-serif" | "serif" | "monospace" | "display" | "unknown";
type ColorFamily = "cool" | "warm" | "neutral" | "unknown";
type LogoStyle = "wordmark" | "logo-mark" | "combination" | "unknown";

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
	industry: string | null;
	signal: "matches" | "mixed" | "diverges" | "suspicious_match" | "limited";
	summary: string;
	target: BrandCompetitorTargetSignal;
	industryNorms: BrandCompetitorIndustryNorms;
	competitors: BrandCompetitorEntry[];
	notes: string[];
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
	fetchCompetitorSignalFallback: (candidate: CompetitorCandidate) => Promise<BrandCompetitorEntry>;
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

function decodeHtmlEntities(value: string): string {
	return value
		.replace(/&quot;/gi, '"')
		.replace(/&#34;/gi, '"')
		.replace(/&apos;/gi, "'")
		.replace(/&#39;/gi, "'")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.trim();
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

function extractMetaContent(html: string, nameOrProperty: string): string | null {
	const escaped = nameOrProperty.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const patterns = [
		new RegExp(
			`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
			"i"
		),
		new RegExp(
			`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`,
			"i"
		),
	];
	for (const pattern of patterns) {
		const match = html.match(pattern);
		if (match?.[1]) return decodeHtmlEntities(match[1]);
	}
	return null;
}

function extractTitle(html: string): string | null {
	const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
	return match?.[1] ? decodeHtmlEntities(match[1].replace(/\s+/g, " ")) : null;
}

function extractStyleBlocks(html: string): string {
	return Array.from(html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi))
		.map((match) => match[1] ?? "")
		.join("\n");
}

function tokenizeFontStack(value: string): string[] {
	return value
		.split(",")
		.map((part) => part.replace(/["']/g, "").trim())
		.filter(Boolean);
}

function isGenericFont(value: string): boolean {
	return /^(sans-serif|serif|monospace|system-ui|ui-sans-serif|ui-serif|ui-monospace|inherit|initial|unset)$/i.test(
		value
	);
}

function extractPrimaryColorFromHtml(html: string, styles: string): string | null {
	const directCandidates = [
		extractMetaContent(html, "theme-color"),
		extractMetaContent(html, "msapplication-TileColor"),
	];
	for (const candidate of directCandidates) {
		const normalized = normalizeHex(candidate);
		if (normalized) return normalized;
	}

	const colorSources = `${html}\n${styles}`;
	const weightedMatches = [
		...Array.from(
			colorSources.matchAll(
				/(?:--(?:brand|color|primary|accent)[a-z-]*|(?:background|color|fill|stroke))\s*:\s*(#[0-9a-f]{3,6})/gi
			)
		).map((match) => match[1]),
		...Array.from(colorSources.matchAll(/#[0-9a-f]{6}\b/gi)).map((match) => match[0]),
	];
	const counts = new Map<string, number>();
	for (const candidate of weightedMatches) {
		const normalized = normalizeHex(candidate);
		if (!normalized) continue;
		counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
	}
	return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

function extractFontFamilyFromHtml(
	html: string,
	styles: string
): { family: string | null; hint: string | null } {
	const fontSources = `${html}\n${styles}`;
	const stacks = [
		...Array.from(fontSources.matchAll(/font-family\s*:\s*([^;}{]+)/gi)).map((match) => match[1] ?? ""),
		...Array.from(fontSources.matchAll(/--(?:font|type)[a-z-]*\s*:\s*([^;}{]+)/gi)).map(
			(match) => match[1] ?? ""
		),
	];
	for (const stack of stacks) {
		for (const candidate of tokenizeFontStack(stack)) {
			if (!candidate || isGenericFont(candidate)) continue;
			return { family: normalizeFontName(candidate), hint: stack };
		}
	}
	return { family: null, hint: null };
}

export function extractCompetitorSignalFromHtml(candidate: CompetitorCandidate, html: string): BrandCompetitorEntry {
	const styles = extractStyleBlocks(html);
	const primaryColor = extractPrimaryColorFromHtml(html, styles);
	const { family: fontFamily, hint: fontHint } = extractFontFamilyFromHtml(html, styles);
	const brandName =
		extractMetaContent(html, "og:site_name") ??
		extractMetaContent(html, "application-name") ??
		extractTitle(html) ??
		candidate.companyName;
	const logoHints = [
		extractMetaContent(html, "og:site_name"),
		extractMetaContent(html, "og:title"),
		extractTitle(html),
		...Array.from(html.matchAll(/\b(?:alt|aria-label)=["']([^"']*(?:logo|icon|wordmark|brand)[^"']*)["']/gi)).map(
			(match) => decodeHtmlEntities(match[1] ?? "")
		),
	].filter(Boolean);

	return {
		companyName: candidate.companyName,
		domain: candidate.domain,
		status: "analyzed",
		brandName,
		primaryColor,
		primaryColorFamily: classifyColorFamily(primaryColor),
		fontFamily,
		fontCategory: classifyFontCategory(fontFamily, fontHint),
		logoStyle: inferLogoStyleFromText(logoHints.join(" ")),
		notes: ["Used direct-site fallback after Firecrawl failed."],
	};
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
			`Could not analyze ${unavailable.map((competitor) => competitor.companyName).join(", ")} via Firecrawl.`
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
		industry,
		signal,
		summary: `Competitor read${industry ? ` for ${industry}` : ""}: ${
			normParts.join(", ") || "limited usable norms"
		}. ${matchPhrase}`,
		target,
		industryNorms: norms,
		competitors,
		notes,
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

function normalizeBrandMap(value: unknown): Record<string, string> {
	if (!isRecord(value)) return {};
	return Object.fromEntries(
		Object.entries(value).flatMap(([key, candidate]) => {
			const normalized = normalizeHex(readString(candidate));
			return normalized ? [[key, normalized]] : [];
		})
	);
}

function readFontFamily(value: unknown): string | null {
	if (typeof value === "string") return normalizeFontName(value);
	if (!isRecord(value)) return null;
	return normalizeFontName(readString(value.family) ?? readString(value.name));
}

function readNestedLogoUrl(value: unknown): string | null {
	if (!isRecord(value)) return null;
	return (
		readNestedLogoUrl(value.logo) ??
		readString(value.logoUrl) ??
		readString(value.url) ??
		readString(value.src) ??
		readString(value.href) ??
		null
	);
}

export function extractCompetitorSignalFromFirecrawl(
	candidate: CompetitorCandidate,
	payload: { branding: unknown; metadata: unknown }
): BrandCompetitorEntry {
	const raw = isRecord(payload.branding) ? payload.branding : {};
	const metadata = isRecord(payload.metadata) ? payload.metadata : {};
	const rawTypography = isRecord(raw.typography) ? raw.typography : {};
	const rawImages = isRecord(raw.images) ? raw.images : {};
	const colors = normalizeBrandMap(raw.colors);
	const fontFamilies = isRecord(rawTypography.fontFamilies)
		? Object.values(rawTypography.fontFamilies).map((entry) => readString(entry))
		: [];
	const directFonts = Array.isArray(raw.fonts) ? raw.fonts.map((entry) => readFontFamily(entry)) : [];
	const fontFamily =
		normalizeFontName(
			readString(rawTypography.primaryFont) ??
				readString(isRecord(rawTypography.fontFamilies) ? rawTypography.fontFamilies.body : null) ??
				readString(isRecord(rawTypography.fontFamilies) ? rawTypography.fontFamilies.primary : null) ??
				directFonts.find(Boolean) ??
				fontFamilies.find(Boolean) ??
				null
		) ?? null;
	const logoHints = [
		readString(rawImages.logoAlt),
		readString(raw.logo),
		readString(raw.logoUrl),
		readNestedLogoUrl(rawImages.logo),
		readString(metadata.title),
		readString(isRecord(raw.__llm_logo_reasoning) ? raw.__llm_logo_reasoning.reasoning : null),
	]
		.filter(Boolean)
		.join(" ");
	const primaryColor =
		colors.primary ??
		colors.accent ??
		colors.secondary ??
		Object.values(colors).find(Boolean) ??
		null;

	return {
		companyName: candidate.companyName,
		domain: candidate.domain,
		status: "analyzed",
		brandName: readString(raw.brandName) ?? readString(metadata.title),
		primaryColor,
		primaryColorFamily: classifyColorFamily(primaryColor),
		fontFamily,
		fontCategory: classifyFontCategory(
			fontFamily,
			readString(isRecord(rawTypography.fontStacks) ? rawTypography.fontStacks.body : null)
		),
		logoStyle: inferLogoStyleFromText(logoHints),
		notes: [],
	};
}

async function fetchCompetitorSignalWithFirecrawl(
	candidate: CompetitorCandidate
): Promise<BrandCompetitorEntry> {
	const siteUrl = `https://${candidate.domain}`;
	const safety = await isSafeHttpsUrl(siteUrl);
	if (!safety.ok) {
		throw new Error(`unsafe URL: ${safety.reason}`);
	}
	const payload = await firecrawlScrapeBranding(siteUrl);
	return extractCompetitorSignalFromFirecrawl(candidate, payload);
}

async function fetchCompetitorSignalDirect(candidate: CompetitorCandidate): Promise<BrandCompetitorEntry> {
	const siteUrl = `https://${candidate.domain}`;
	const safety = await isSafeHttpsUrl(siteUrl);
	if (!safety.ok) {
		throw new Error(`unsafe URL: ${safety.reason}`);
	}

	const response = await fetch(siteUrl, {
		headers: {
			accept: "text/html,application/xhtml+xml",
			"user-agent":
				"Mozilla/5.0 (compatible; LetterstoryCompetitorCheck/1.0; +https://letterstory.co)",
		},
		redirect: "follow",
		signal: AbortSignal.timeout(DIRECT_COMPETITOR_FETCH_TIMEOUT_MS),
	});

	if (!response.ok) {
		throw new Error(`direct competitor fetch failed (${response.status})`);
	}

	const resolvedUrl = response.url || siteUrl;
	const resolvedSafety = await isSafeHttpsUrl(resolvedUrl);
	if (!resolvedSafety.ok) {
		throw new Error(`unsafe redirected URL: ${resolvedSafety.reason}`);
	}

	const html = await response.text();
	if (!html.trim()) {
		throw new Error("direct competitor fetch returned empty HTML");
	}

	return extractCompetitorSignalFromHtml(candidate, html);
}

export async function buildCompetitorContextForBrand(
	profile: BrandProfile,
	deps: Partial<CompetitorContextDeps> = {}
): Promise<BrandCompetitorContext | null> {
	if (!envServer.ANTHROPIC_API_KEY || !isFirecrawlConfigured()) return null;

	const targetDomain = extractDomain(profile.url);
	if (!targetDomain) return null;

	const identifyCompetitors = deps.identifyCompetitors ?? identifyCompetitorsWithAnthropic;
	const fetchCompetitorSignal = deps.fetchCompetitorSignal ?? fetchCompetitorSignalWithFirecrawl;
	const fetchCompetitorSignalFallback =
		deps.fetchCompetitorSignalFallback ?? fetchCompetitorSignalDirect;

	const identified = await identifyCompetitors(profile);
	const candidates = normalizeCompetitorCandidates(targetDomain, identified.competitors);
	if (!candidates.length) return null;

	const competitors = await Promise.all(
		candidates.map(async (candidate) => {
			try {
				return await fetchCompetitorSignal(candidate);
			} catch (error) {
				try {
					return await fetchCompetitorSignalFallback(candidate);
				} catch (fallbackError) {
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
						notes: [
							error instanceof Error ? error.message : String(error),
							fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
						],
					};
				}
			}
		})
	);

	const analyzedCount = competitors.filter((competitor) => competitor.status === "analyzed").length;
	if (!analyzedCount) return null;

	return summarizeNorms(identified.industry ?? inferIndustry(profile), buildTargetCompetitorSignal(profile), competitors);
}
