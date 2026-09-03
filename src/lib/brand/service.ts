import { envServer } from "@/lib/config/env.server";
import { isSafeHttpsUrl } from "@/lib/net/ssrf";

export interface BrandIngestionRequest {
	siteUrl: string;
	includeSubpages?: boolean;
}

export type BrandToneEnergy = "low" | "medium" | "high";
export type BrandTypographyHierarchy = "display-led" | "balanced" | "compact";
export type BrandSpacingRhythm = "tight" | "balanced" | "airy";
export type BrandValidationStatus = "pass" | "warn" | "fail";
export type BrandValidationConfidence = "low" | "medium" | "high";
export type BrandValidationGapSeverity = "low" | "medium" | "high";
export type BrandDistinctivenessStatus = "distinct" | "adjacent" | "overlapping";

export interface BrandTypographyProfile {
	primaryFont: string | null;
	secondaryFont: string | null;
	headingFont: string | null;
	bodyFont: string | null;
	fontFamilies: string[];
	fontStacks: Partial<Record<"heading" | "body" | "paragraph", string[]>>;
	scale: Partial<Record<"h1" | "h2" | "h3" | "body" | "small", string>>;
	hierarchy: BrandTypographyHierarchy | null;
}

export interface BrandSpacingProfile {
	baseUnit: number | null;
	borderRadius: string | null;
	radiusScale: string[];
	rhythm: BrandSpacingRhythm | null;
}

export interface BrandComponentStyle {
	background: string | null;
	textColor: string | null;
	borderColor: string | null;
	borderRadius: string | null;
	shadow: string | null;
}

export interface BrandComponentsProfile {
	primaryButton: BrandComponentStyle | null;
	secondaryButton: BrandComponentStyle | null;
	input: BrandComponentStyle | null;
	additional: Record<string, BrandComponentStyle>;
}

export interface BrandLogoAsset {
	url: string | null;
	kind: "url" | "data-uri" | "unknown" | null;
	alt: string | null;
	href: string | null;
	selectionReasoning: string | null;
	selectionConfidence: number | null;
}

export interface BrandImagesProfile {
	logo: BrandLogoAsset;
	faviconUrl: string | null;
	ogImageUrl: string | null;
	gallery: string[];
	imageryStyle: string | null;
	notes: string[];
}

export interface BrandPersonalityProfile {
	tone: string | null;
	toneOfVoice: string | null;
	energy: BrandToneEnergy | null;
	targetAudience: string | null;
	descriptors: string[];
}

export interface BrandDesignSystemProfile {
	framework: string | null;
	componentLibrary: string | null;
	implementationStyle: "custom" | "framework-based" | "hybrid" | null;
	notes: string[];
}

export interface BrandProfile {
	url: string;
	source: "firecrawl";
	brandName: string | null;
	colorScheme: "light" | "dark" | null;
	confidence: number | null;
	primaryLogoUrl: string | null;
	logoUrls: string[];
	colors: Record<string, string>;
	fonts: string[];
	typography: BrandTypographyProfile;
	spacing: BrandSpacingProfile;
	components: BrandComponentsProfile;
	images: BrandImagesProfile;
	personality: BrandPersonalityProfile;
	designSystem: BrandDesignSystemProfile;
	metadata: Record<string, unknown>;
	raw: Record<string, unknown>;
}

export interface BrandIngestionSuccessResult {
	status: "success";
	requestedUrl: string;
	profile: BrandProfile;
}

export interface BrandIngestionFailureResult {
	status: "not_configured" | "error";
	requestedUrl: string;
	message: string;
}

export type BrandIngestionResult =
	| BrandIngestionSuccessResult
	| BrandIngestionFailureResult;

export interface BrandFidelityGap {
	field:
		| "logo"
		| "colors"
		| "typography"
		| "spacing"
		| "components"
		| "images"
		| "personality"
		| "designSystem";
	severity: BrandValidationGapSeverity;
	issue: string;
	evidence: string;
	recommendation: string;
}

export interface BrandDerivedSignals {
	toneOfVoice: string | null;
	imageryStyle: string | null;
	typeHierarchy: BrandTypographyHierarchy | null;
	spacingRhythm: BrandSpacingRhythm | null;
	distinctiveTraits: string[];
}

export interface BrandFidelityAssessment {
	status: BrandValidationStatus;
	similarityScore: number;
	confidence: BrandValidationConfidence;
	summary: string;
	confirmedSignals: string[];
	gaps: BrandFidelityGap[];
	derivedSignals: BrandDerivedSignals;
}

export interface BrandFidelityValidationSuccessResult {
	status: "success";
	requestedUrl: string;
	assessment: BrandFidelityAssessment;
	screenshotUrl: string;
	model: string;
	enrichedProfile: BrandProfile;
}

export interface BrandFidelityValidationFailureResult {
	status: "not_configured" | "error";
	code:
		| "firecrawl_not_configured"
		| "anthropic_not_configured"
		| "screenshot_unavailable"
		| "firecrawl_error"
		| "anthropic_error";
	requestedUrl: string;
	message: string;
}

export type BrandFidelityValidationResult =
	| BrandFidelityValidationSuccessResult
	| BrandFidelityValidationFailureResult;

export interface BrandCompetitorComparisonRequest {
	primarySiteUrl: string;
	competitorUrls: string[];
	primaryProfile?: BrandProfile;
}

export interface BrandCompetitorDelta {
	competitorUrl: string;
	competitorBrandName: string | null;
	sharedColorFamilies: string[];
	primaryOnlyColorFamilies: string[];
	competitorOnlyColorFamilies: string[];
	sharedFonts: string[];
	primaryOnlyFonts: string[];
	competitorOnlyFonts: string[];
	sharedToneDescriptors: string[];
	distinctivenessScore: number;
	status: BrandDistinctivenessStatus;
	rationale: string;
}

export interface BrandCompetitorComparisonSuccessResult {
	status: "success";
	requestedUrl: string;
	primaryProfile: BrandProfile;
	competitors: Array<{
		profile: BrandProfile;
		comparison: BrandCompetitorDelta;
	}>;
	overallDistinctiveness: {
		score: number;
		status: BrandDistinctivenessStatus;
		summary: string;
	};
}

export interface BrandCompetitorComparisonFailureResult {
	status: "not_configured" | "error";
	code: "firecrawl_not_configured" | "firecrawl_error" | "invalid_input";
	requestedUrl: string;
	message: string;
}

export type BrandCompetitorComparisonResult =
	| BrandCompetitorComparisonSuccessResult
	| BrandCompetitorComparisonFailureResult;

interface FirecrawlScrapeResponse {
	success?: boolean;
	error?: string;
	data?: {
		branding?: unknown;
		metadata?: unknown;
		markdown?: unknown;
		screenshot?: unknown;
	};
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

const FIRECRAWL_TIMEOUT_MS = 45_000;
const ANTHROPIC_TIMEOUT_MS = 45_000;
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";
const MAX_MARKDOWN_CHARS_FOR_VALIDATION = 6_000;

export function isBrandIngestionConfigured(): boolean {
	return Boolean(envServer.FIRECRAWL_API_KEY);
}

export function isBrandValidationConfigured(): boolean {
	return Boolean(envServer.FIRECRAWL_API_KEY && envServer.ANTHROPIC_API_KEY);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStringList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];

	return value
		.map((entry) => readString(entry))
		.filter((entry): entry is string => Boolean(entry));
}

function readNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readConfidence(value: unknown): number | null {
	if (typeof value === "number") return value;
	if (isRecord(value)) return readNumber(value.overall);
	return null;
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

function readFontFamily(value: unknown): string | null {
	if (typeof value === "string") return readString(value);
	if (!isRecord(value)) return null;
	return readString(value.family) ?? readString(value.name) ?? null;
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
	const seen = new Set<string>();

	for (const value of values) {
		if (!value) continue;
		seen.add(value);
	}

	return [...seen];
}

function normalizeBrandMap(value: unknown): Record<string, string> {
	if (!isRecord(value)) return {};

	return Object.fromEntries(
		Object.entries(value).flatMap(([key, candidate]) => {
			const normalized = readString(candidate);
			return normalized ? [[key, normalized]] : [];
		})
	);
}

function normalizeFontStacks(
	value: unknown
): Partial<Record<"heading" | "body" | "paragraph", string[]>> {
	if (!isRecord(value)) return {};

	const normalized: Partial<Record<"heading" | "body" | "paragraph", string[]>> = {};
	for (const key of ["heading", "body", "paragraph"] as const) {
		const stack = Array.isArray(value[key])
			? value[key]
					.map((entry) => readString(entry))
					.filter((entry): entry is string => Boolean(entry))
			: [];
		if (stack.length) normalized[key] = stack;
	}

	return normalized;
}

function normalizeTypeScale(
	value: unknown
): Partial<Record<"h1" | "h2" | "h3" | "body" | "small", string>> {
	if (!isRecord(value)) return {};

	const normalized: Partial<Record<"h1" | "h2" | "h3" | "body" | "small", string>> = {};
	for (const key of ["h1", "h2", "h3", "body", "small"] as const) {
		const token = readString(value[key]);
		if (token) normalized[key] = token;
	}

	return normalized;
}

function parsePixelValue(value: string | null): number | null {
	if (!value) return null;
	const match = value.match(/-?\d+(?:\.\d+)?/);
	if (!match) return null;
	const parsed = Number(match[0]);
	return Number.isFinite(parsed) ? parsed : null;
}

function deriveTypographyHierarchy(
	scale: Partial<Record<"h1" | "h2" | "h3" | "body" | "small", string>>
): BrandTypographyHierarchy | null {
	const h1 = parsePixelValue(scale.h1 ?? null);
	const body = parsePixelValue(scale.body ?? null);
	if (!h1 || !body || body <= 0) return null;

	const ratio = h1 / body;
	if (ratio >= 2.6) return "display-led";
	if (ratio <= 1.8) return "compact";
	return "balanced";
}

function deriveSpacingRhythm(baseUnit: number | null): BrandSpacingRhythm | null {
	if (baseUnit === null) return null;
	if (baseUnit <= 4) return "tight";
	if (baseUnit >= 10) return "airy";
	return "balanced";
}

function normalizeComponentStyle(value: unknown): BrandComponentStyle | null {
	if (!isRecord(value)) return null;

	const style: BrandComponentStyle = {
		background: readString(value.background) ?? readString(value.bgColor),
		textColor: readString(value.textColor) ?? readString(value.color),
		borderColor: readString(value.borderColor),
		borderRadius: readString(value.borderRadius),
		shadow: readString(value.shadow),
	};

	return Object.values(style).some(Boolean) ? style : null;
}

function inferLogoKind(url: string | null): BrandLogoAsset["kind"] {
	if (!url) return null;
	if (url.startsWith("data:")) return "data-uri";
	if (url.startsWith("https://") || url.startsWith("http://")) return "url";
	return "unknown";
}

function collectImageUrls(value: unknown): string[] {
	if (!isRecord(value)) return [];

	return dedupeStrings(
		Object.entries(value).flatMap(([key, candidate]) => {
			if (key === "logoAlt" || key === "logoHref") return [];
			if (typeof candidate === "string") return [candidate];
			return readNestedLogoUrl(candidate);
		})
	);
}

function deriveImageNotes(logo: BrandLogoAsset): string[] {
	const notes: string[] = [];
	if (logo.kind === "data-uri") {
		notes.push("Firecrawl selected an inline data-URI logo, which may be less reusable than a durable asset URL.");
	}
	if (logo.url?.includes("apple-touch-icon") || logo.url?.includes("app-icon")) {
		notes.push("Selected logo appears to be an app-icon-style asset rather than a primary wordmark.");
	}
	return notes;
}

function normalizeToneEnergy(value: unknown): BrandToneEnergy | null {
	return value === "low" || value === "medium" || value === "high" ? value : null;
}

const MAX_DESCRIPTOR_LENGTH = 24;
const MAX_DESCRIPTOR_WORDS = 3;

function looksLikeShortDescriptor(value: string): boolean {
	if (value.length > MAX_DESCRIPTOR_LENGTH) return false;
	if (value.trim().split(/\s+/).length > MAX_DESCRIPTOR_WORDS) return false;
	if (/[.!?]$/.test(value.trim())) return false;
	return true;
}

function splitDescriptors(...values: Array<string | null | undefined>): string[] {
	return dedupeStrings(
		values.flatMap((value) =>
			value
				? value
						.split(/[;,]|\band\b/gi)
						.map((entry) => readString(entry))
						.filter((entry): entry is string => Boolean(entry))
						.filter(looksLikeShortDescriptor)
				: []
		)
	);
}

function inferImplementationStyle(
	framework: string | null,
	componentLibrary: string | null
): BrandDesignSystemProfile["implementationStyle"] {
	if (!framework && !componentLibrary) return null;
	if ((framework ?? "").toLowerCase() === "custom" && !componentLibrary) return "custom";
	if ((framework ?? "").toLowerCase() === "custom" && componentLibrary) return "hybrid";
	return componentLibrary ? "framework-based" : "hybrid";
}

function clampScore(value: unknown): number {
	const numeric = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(numeric)) return 0;
	return Math.max(0, Math.min(100, Math.round(numeric)));
}

function normalizeValidationStatus(value: unknown): BrandValidationStatus {
	return value === "pass" || value === "warn" || value === "fail" ? value : "warn";
}

function normalizeValidationConfidence(value: unknown): BrandValidationConfidence {
	return value === "low" || value === "medium" || value === "high" ? value : "medium";
}

function normalizeGapField(value: unknown): BrandFidelityGap["field"] {
	return value === "logo" ||
		value === "colors" ||
		value === "typography" ||
		value === "spacing" ||
		value === "components" ||
		value === "images" ||
		value === "personality" ||
		value === "designSystem"
		? value
		: "designSystem";
}

function normalizeGapSeverity(value: unknown): BrandValidationGapSeverity {
	return value === "low" || value === "medium" || value === "high" ? value : "medium";
}

function normalizeDistinctivenessStatus(value: number): BrandDistinctivenessStatus {
	if (value >= 70) return "distinct";
	if (value >= 45) return "adjacent";
	return "overlapping";
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
	if (!candidate) {
		throw new Error("Anthropic validation returned a non-JSON response.");
	}

	try {
		return JSON.parse(candidate) as T;
	} catch {
		const repaired = candidate.replace(/,\s*([}\]])/g, "$1");
		return JSON.parse(repaired) as T;
	}
}

function normalizeAssessment(value: unknown): BrandFidelityAssessment {
	const raw = isRecord(value) ? value : {};
	const gaps = Array.isArray(raw.gaps)
		? raw.gaps
				.filter(isRecord)
				.map((gap) => ({
					field: normalizeGapField(gap.field),
					severity: normalizeGapSeverity(gap.severity),
					issue: readString(gap.issue) ?? "Missing detail",
					evidence: readString(gap.evidence) ?? "No evidence supplied.",
					recommendation: readString(gap.recommendation) ?? "Review the source site manually.",
				}))
		: [];
	const derivedSignals = isRecord(raw.derivedSignals) ? raw.derivedSignals : {};

	return {
		status: normalizeValidationStatus(raw.status),
		similarityScore: clampScore(raw.similarityScore),
		confidence: normalizeValidationConfidence(raw.confidence),
		summary: readString(raw.summary) ?? "Claude did not provide a summary.",
		confirmedSignals: Array.isArray(raw.confirmedSignals)
			? raw.confirmedSignals
					.map((entry) => readString(entry))
					.filter((entry): entry is string => Boolean(entry))
			: [],
		gaps,
		derivedSignals: {
			toneOfVoice: readString(derivedSignals.toneOfVoice),
			imageryStyle: readString(derivedSignals.imageryStyle),
			typeHierarchy:
				derivedSignals.typeHierarchy === "display-led" ||
				derivedSignals.typeHierarchy === "balanced" ||
				derivedSignals.typeHierarchy === "compact"
					? derivedSignals.typeHierarchy
					: null,
			spacingRhythm:
				derivedSignals.spacingRhythm === "tight" ||
				derivedSignals.spacingRhythm === "balanced" ||
				derivedSignals.spacingRhythm === "airy"
					? derivedSignals.spacingRhythm
					: null,
			distinctiveTraits: Array.isArray(derivedSignals.distinctiveTraits)
				? derivedSignals.distinctiveTraits
						.map((entry) => readString(entry))
						.filter((entry): entry is string => Boolean(entry))
				: [],
		},
	};
}

function mergeFidelitySignals(profile: BrandProfile, assessment: BrandFidelityAssessment): BrandProfile {
	const personalityDescriptors = dedupeStrings([
		...profile.personality.descriptors,
		...assessment.derivedSignals.distinctiveTraits,
	]);
	const designNotes = dedupeStrings([
		...profile.designSystem.notes,
		...(assessment.gaps.length
			? [
				`Validation status ${assessment.status} (${assessment.similarityScore}/100): ${assessment.summary}`,
			]
			: []),
	]);
	const imageNotes = dedupeStrings([
		...profile.images.notes,
		...assessment.gaps
			.filter((gap) => gap.field === "logo" || gap.field === "images")
			.map((gap) => `${gap.issue} — ${gap.recommendation}`),
	]);

	return {
		...profile,
		typography: {
			...profile.typography,
			hierarchy: assessment.derivedSignals.typeHierarchy ?? profile.typography.hierarchy,
		},
		spacing: {
			...profile.spacing,
			rhythm: assessment.derivedSignals.spacingRhythm ?? profile.spacing.rhythm,
		},
		images: {
			...profile.images,
			imageryStyle: assessment.derivedSignals.imageryStyle ?? profile.images.imageryStyle,
			notes: imageNotes,
		},
		personality: {
			...profile.personality,
			toneOfVoice: assessment.derivedSignals.toneOfVoice ?? profile.personality.toneOfVoice,
			descriptors: personalityDescriptors,
		},
		designSystem: {
			...profile.designSystem,
			notes: designNotes,
		},
	};
}

function summarizeAssetUrl(url: string | null): string | null {
	if (!url) return null;
	if (url.startsWith("data:")) {
		const [prefix] = url.split(",", 1);
		return `${prefix},…`;
	}
	return url;
}

function createValidationPromptProfile(profile: BrandProfile): Record<string, unknown> {
	return {
		url: profile.url,
		brandName: profile.brandName,
		colorScheme: profile.colorScheme,
		confidence: profile.confidence,
		colors: profile.colors,
		fonts: profile.fonts,
		typography: {
			primaryFont: profile.typography.primaryFont,
			secondaryFont: profile.typography.secondaryFont,
			headingFont: profile.typography.headingFont,
			bodyFont: profile.typography.bodyFont,
			scale: profile.typography.scale,
			hierarchy: profile.typography.hierarchy,
		},
		spacing: profile.spacing,
		components: profile.components,
		images: {
			logo: {
				url: summarizeAssetUrl(profile.images.logo.url),
				kind: profile.images.logo.kind,
				alt: profile.images.logo.alt,
				href: profile.images.logo.href,
				selectionReasoning: profile.images.logo.selectionReasoning,
			},
			faviconUrl: profile.images.faviconUrl,
			ogImageUrl: profile.images.ogImageUrl,
			imageryStyle: profile.images.imageryStyle,
			notes: profile.images.notes,
		},
		personality: profile.personality,
		designSystem: profile.designSystem,
		metadata: {
			title: readString(profile.metadata.title),
			description: readString(profile.metadata.description),
			statusCode: readNumber(profile.metadata.statusCode),
		},
	};
}

export function normalizeBrandSiteUrl(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed) return null;

	const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

	try {
		const url = new URL(withScheme);
		if (!url.hostname.includes(".")) return null;
		return `https://${url.hostname}`;
	} catch {
		return null;
	}
}

export function parseFirecrawlBranding(
	brandingPayload: unknown,
	metadataPayload: unknown = {}
): Omit<BrandProfile, "url" | "source"> {
	const raw = isRecord(brandingPayload) ? brandingPayload : {};
	const metadata = isRecord(metadataPayload) ? metadataPayload : {};
	const rawTypography = isRecord(raw.typography) ? raw.typography : {};
	const rawSpacing = isRecord(raw.spacing) ? raw.spacing : {};
	const rawComponents = isRecord(raw.components) ? raw.components : {};
	const rawImages = isRecord(raw.images) ? raw.images : {};
	const rawPersonality = isRecord(raw.personality) ? raw.personality : {};
	const rawDesignSystem = isRecord(raw.designSystem) ? raw.designSystem : {};
	const rawLlmMetadata = isRecord(raw.__llm_metadata) ? raw.__llm_metadata : {};
	const rawLlmLogoSelection = isRecord(rawLlmMetadata.logoSelection)
		? rawLlmMetadata.logoSelection
		: {};
	const rawLlmButtonReasoning = isRecord(raw.__llm_button_reasoning)
		? raw.__llm_button_reasoning
		: {};
	const rawLlmPrimaryButtonReasoning = isRecord(rawLlmButtonReasoning.primary)
		? rawLlmButtonReasoning.primary
		: {};
	const colors = normalizeBrandMap(raw.colors);
	const fontFamilies = isRecord(rawTypography.fontFamilies)
		? Object.values(rawTypography.fontFamilies).map((candidate) => readString(candidate))
		: [];
	const directFontFamilies = Array.isArray(raw.fonts)
		? raw.fonts.map((entry) => readFontFamily(entry))
		: [];
	const logoUrls = dedupeStrings([
		readString(raw.logo),
		readString(raw.logoUrl),
		readNestedLogoUrl(rawImages.logo),
		...readStringList(raw.logos),
		...(Array.isArray(raw.logos)
			? raw.logos.map((entry) => (typeof entry === "string" ? entry : readNestedLogoUrl(entry)))
			: []),
		readNestedLogoUrl(raw.assets),
	]);
	const preferredLogoUrl =
		logoUrls.find((candidate) => candidate.startsWith("https://")) ?? logoUrls[0] ?? null;
	const fonts = dedupeStrings([
		...directFontFamilies,
		readString(rawTypography.primaryFont),
		readString(rawTypography.secondaryFont),
		readString(isRecord(rawTypography.fontFamilies) ? rawTypography.fontFamilies.primary : null),
		readString(isRecord(rawTypography.fontFamilies) ? rawTypography.fontFamilies.heading : null),
		...fontFamilies,
	]);
	const colorScheme = readString(raw.colorScheme);
	const confidence = readConfidence(raw.confidence);
	const brandName = readString(raw.brandName);
	const typeScale = normalizeTypeScale(rawTypography.fontSizes);
	const baseUnit = readNumber(rawSpacing.baseUnit);
	const logoReasoning = isRecord(raw.__llm_logo_reasoning) ? raw.__llm_logo_reasoning : {};
	const componentEntries = Object.entries(rawComponents)
		.map(([key, candidate]) => [key, normalizeComponentStyle(candidate)] as const)
		.filter((entry): entry is readonly [string, BrandComponentStyle] => Boolean(entry[1]));
	const additionalComponents = Object.fromEntries(
		componentEntries.filter(([key]) => !["buttonPrimary", "buttonSecondary", "input"].includes(key))
	);
	const logo: BrandLogoAsset = {
		url: preferredLogoUrl,
		kind: inferLogoKind(preferredLogoUrl),
		alt: readString(rawImages.logoAlt),
		href: readString(rawImages.logoHref),
		selectionReasoning: readString(logoReasoning.reasoning),
		selectionConfidence: readNumber(logoReasoning.confidence),
	};
	const imageGallery = collectImageUrls(rawImages);
	const tone = readString(rawPersonality.tone);
	const toneOfVoice = readString(rawPersonality.toneOfVoice) ?? tone;
	const descriptors = splitDescriptors(
		tone,
		toneOfVoice,
		readString(rawPersonality.targetAudience)
	);
	const designSystemFramework = readString(rawDesignSystem.framework);
	const designSystemLibrary = readString(rawDesignSystem.componentLibrary);

	return {
		brandName,
		colorScheme: colorScheme === "light" || colorScheme === "dark" ? colorScheme : null,
		confidence,
		primaryLogoUrl: preferredLogoUrl,
		logoUrls,
		colors,
		fonts,
		typography: {
			primaryFont:
				readString(rawTypography.primaryFont) ??
				readString(isRecord(rawTypography.fontFamilies) ? rawTypography.fontFamilies.primary : null) ??
				fonts[0] ??
				null,
			secondaryFont: readString(rawTypography.secondaryFont),
			headingFont:
				readString(isRecord(rawTypography.fontFamilies) ? rawTypography.fontFamilies.heading : null) ??
				fonts[0] ??
				null,
			bodyFont:
				readString(isRecord(rawTypography.fontFamilies) ? rawTypography.fontFamilies.body : null) ??
				readString(isRecord(rawTypography.fontFamilies) ? rawTypography.fontFamilies.primary : null) ??
				fonts[0] ??
				null,
			fontFamilies: fonts,
			fontStacks: normalizeFontStacks(rawTypography.fontStacks),
			scale: typeScale,
			hierarchy: deriveTypographyHierarchy(typeScale),
		},
		spacing: {
			baseUnit,
			borderRadius: readString(rawSpacing.borderRadius),
			radiusScale: dedupeStrings(
				componentEntries.map(([, component]) => component.borderRadius)
			),
			rhythm: deriveSpacingRhythm(baseUnit),
		},
		components: {
			primaryButton: normalizeComponentStyle(rawComponents.buttonPrimary),
			secondaryButton: normalizeComponentStyle(rawComponents.buttonSecondary),
			input: normalizeComponentStyle(rawComponents.input),
			additional: additionalComponents,
		},
		images: {
			logo,
			faviconUrl: readString(rawImages.favicon),
			ogImageUrl: readString(rawImages.ogImage),
			gallery: imageGallery,
			imageryStyle: readString(rawImages.imageryStyle),
			notes: deriveImageNotes(logo),
		},
		personality: {
			tone,
			toneOfVoice,
			energy: normalizeToneEnergy(rawPersonality.energy),
			targetAudience: readString(rawPersonality.targetAudience),
			descriptors,
		},
		designSystem: {
			framework: designSystemFramework,
			componentLibrary: designSystemLibrary,
			implementationStyle: inferImplementationStyle(
				designSystemFramework,
				designSystemLibrary
			),
			notes: dedupeStrings([
				readString(rawLlmLogoSelection.finalSource),
				readString(rawLlmPrimaryButtonReasoning.reasoning),
			]),
		},
		metadata,
		raw,
	};
}

async function fetchFirecrawlScrape(
	url: string,
	formats: Array<string | Record<string, unknown>>
): Promise<FirecrawlScrapeResponse> {
	const apiKey = envServer.FIRECRAWL_API_KEY;
	if (!apiKey) {
		throw new Error("Brand extraction requires Firecrawl (FIRECRAWL_API_KEY is unset)");
	}

	const baseUrl = envServer.FIRECRAWL_BASE_URL.replace(/\/$/, "");
	const response = await fetch(`${baseUrl}/v2/scrape`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			url,
			formats,
			onlyMainContent: false,
			timeout: FIRECRAWL_TIMEOUT_MS - 5_000,
		}),
		signal: AbortSignal.timeout(FIRECRAWL_TIMEOUT_MS),
	});
	const body = (await response.json().catch(() => ({}))) as FirecrawlScrapeResponse;

	if (!response.ok || body.success === false) {
		throw new Error(
			`Firecrawl scrape failed (${response.status}): ${body.error ?? "unknown error"}`
		);
	}

	return body;
}

async function fetchFirecrawlBranding(url: string): Promise<Omit<BrandProfile, "url" | "source">> {
	const body = await fetchFirecrawlScrape(url, ["branding"]);
	return parseFirecrawlBranding(body.data?.branding, body.data?.metadata);
}

async function fetchSiteVisualReference(url: string): Promise<{ screenshotUrl: string | null; markdown: string | null }> {
	const body = await fetchFirecrawlScrape(url, [
		"markdown",
		{
			type: "screenshot",
			fullPage: false,
			quality: 80,
			viewport: {
				width: 1440,
				height: 1200,
			},
		},
	]);

	return {
		screenshotUrl: readString(body.data?.screenshot),
		markdown: readString(body.data?.markdown),
	};
}

async function requestAnthropicAssessment(
	profile: BrandProfile,
	siteUrl: string,
	screenshotUrl: string,
	markdown: string | null
): Promise<BrandFidelityAssessment> {
	const apiKey = envServer.ANTHROPIC_API_KEY;
	if (!apiKey) {
		throw new Error("Brand validation requires Anthropic (ANTHROPIC_API_KEY is unset)");
	}

	const model = envServer.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;
	const instructions = [
		"You are validating whether a structured brand profile actually captures what makes a website visually feel like itself.",
		"Return JSON only. No markdown fences.",
		"Use this schema exactly:",
		JSON.stringify(
			{
				status: "pass | warn | fail",
				similarityScore: 0,
				confidence: "low | medium | high",
				summary: "short string",
				confirmedSignals: ["array of strings"],
				gaps: [
					{
						field: "logo | colors | typography | spacing | components | images | personality | designSystem",
						severity: "low | medium | high",
						issue: "string",
						evidence: "string",
						recommendation: "string",
					},
				],
				derivedSignals: {
					toneOfVoice: "string or null",
					imageryStyle: "string or null",
					typeHierarchy: "display-led | balanced | compact | null",
					spacingRhythm: "tight | balanced | airy | null",
					distinctiveTraits: ["array of strings"],
				},
			},
			null,
			2
		),
		"Judge whether the extracted profile is good enough to guide a generated page so it would still feel like the same brand.",
		"Call out missing visual signals like gradients, illustration style, logo variant problems, spacing rhythm, type hierarchy, or tone mismatches.",
		"Keep the response concise: no more than 4 gaps, short evidence strings, and short recommendations.",
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
			max_tokens: 1_200,
			system: instructions,
			messages: [
				{
					role: "user",
					content: [
						{
							type: "text",
							text: [
								`Site URL: ${siteUrl}`,
								`Structured brand profile: ${JSON.stringify(createValidationPromptProfile(profile), null, 2)}`,
								`Homepage markdown excerpt: ${
									markdown
										? markdown.slice(0, MAX_MARKDOWN_CHARS_FOR_VALIDATION)
										: "Not available"
								}`,
							].join("\n\n"),
						},
						{
							type: "image",
							source: {
								type: "url",
								url: screenshotUrl,
							},
						},
					],
				},
			],
		}),
		signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS),
	});
	const body = (await response.json().catch(() => ({}))) as AnthropicMessagesResponse;

	if (!response.ok) {
		throw new Error(
			`Anthropic validation failed (${response.status}): ${body.error?.message ?? "unknown error"}`
		);
	}

	const text = body.content
		?.filter((block) => block.type === "text")
		.map((block) => block.text ?? "")
		.join("\n")
		.trim();
	if (!text) {
		throw new Error("Anthropic validation returned no text response.");
	}

	return normalizeAssessment(parseJsonObject(text));
}

function normalizeColorHex(value: string): string | null {
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

function rgbToHsl(hex: string): { h: number; s: number; l: number } {
	const normalized = normalizeColorHex(hex) ?? "#000000";
	const r = parseInt(normalized.slice(1, 3), 16) / 255;
	const g = parseInt(normalized.slice(3, 5), 16) / 255;
	const b = parseInt(normalized.slice(5, 7), 16) / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	let h = 0;
	let s = 0;
	const l = (max + min) / 2;
	const delta = max - min;

	if (delta !== 0) {
		s = delta / (1 - Math.abs(2 * l - 1));
		switch (max) {
			case r:
				h = 60 * (((g - b) / delta) % 6);
				break;
			case g:
				h = 60 * ((b - r) / delta + 2);
				break;
			default:
				h = 60 * ((r - g) / delta + 4);
		}
	}

	return { h: h < 0 ? h + 360 : h, s, l };
}

function colorFamilyFromHex(hex: string): string | null {
	const normalized = normalizeColorHex(hex);
	if (!normalized) return null;
	const { h, s, l } = rgbToHsl(normalized);
	if (s < 0.1 && l >= 0.92) return "white";
	if (s < 0.1 && l <= 0.12) return "black";
	if (s < 0.12) return "gray";
	if (h < 15 || h >= 345) return "red";
	if (h < 45) return "orange";
	if (h < 70) return "yellow";
	if (h < 165) return "green";
	if (h < 200) return "teal";
	if (h < 255) return "blue";
	if (h < 300) return "purple";
	return "pink";
}

function normalizeFontName(font: string): string {
	return font.trim().toLowerCase().replace(/["']/g, "");
}

function tokenSet(values: string[]): Set<string> {
	return new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean));
}

function setIntersection(left: Set<string>, right: Set<string>): string[] {
	return [...left].filter((value) => right.has(value)).sort();
}

function setDifference(left: Set<string>, right: Set<string>): string[] {
	return [...left].filter((value) => !right.has(value)).sort();
}

function jaccard(left: Set<string>, right: Set<string>): number | null {
	const union = new Set([...left, ...right]);
	if (!union.size) return null;
	const intersection = setIntersection(left, right).length;
	return intersection / union.size;
}

function collectColorFamilies(profile: BrandProfile): Set<string> {
	return tokenSet(
		Object.values(profile.colors)
			.map((value) => colorFamilyFromHex(value))
			.filter((entry): entry is string => Boolean(entry))
	);
}

function collectToneDescriptors(profile: BrandProfile): Set<string> {
	return tokenSet([
		profile.personality.tone ?? "",
		profile.personality.toneOfVoice ?? "",
		...profile.personality.descriptors,
		profile.personality.targetAudience ?? "",
	]);
}

function compareBrandProfiles(primary: BrandProfile, competitor: BrandProfile): BrandCompetitorDelta {
	const primaryColorFamilies = collectColorFamilies(primary);
	const competitorColorFamilies = collectColorFamilies(competitor);
	const primaryFonts = tokenSet(primary.fonts.map(normalizeFontName));
	const competitorFonts = tokenSet(competitor.fonts.map(normalizeFontName));
	const primaryTone = collectToneDescriptors(primary);
	const competitorTone = collectToneDescriptors(competitor);
	const overlaps = [
		jaccard(primaryColorFamilies, competitorColorFamilies),
		jaccard(primaryFonts, competitorFonts),
		jaccard(primaryTone, competitorTone),
	].filter((value): value is number => value !== null);
	const averageOverlap = overlaps.length
		? overlaps.reduce((sum, value) => sum + value, 0) / overlaps.length
		: 0;
	const distinctivenessScore = clampScore((1 - averageOverlap) * 100);
	const status = normalizeDistinctivenessStatus(distinctivenessScore);
	const sharedColorFamilies = setIntersection(primaryColorFamilies, competitorColorFamilies);
	const sharedFonts = setIntersection(primaryFonts, competitorFonts);
	const sharedToneDescriptors = setIntersection(primaryTone, competitorTone);
	const rationaleParts = [
		sharedColorFamilies.length
			? `shared color families: ${sharedColorFamilies.join(", ")}`
			: "minimal color-family overlap",
		sharedFonts.length ? `shared fonts: ${sharedFonts.join(", ")}` : "different font stack",
		sharedToneDescriptors.length
			? `shared tone descriptors: ${sharedToneDescriptors.slice(0, 3).join(", ")}`
			: "copy/tone cues differ",
	];

	return {
		competitorUrl: competitor.url,
		competitorBrandName: competitor.brandName,
		sharedColorFamilies,
		primaryOnlyColorFamilies: setDifference(primaryColorFamilies, competitorColorFamilies),
		competitorOnlyColorFamilies: setDifference(competitorColorFamilies, primaryColorFamilies),
		sharedFonts,
		primaryOnlyFonts: setDifference(primaryFonts, competitorFonts),
		competitorOnlyFonts: setDifference(competitorFonts, primaryFonts),
		sharedToneDescriptors,
		distinctivenessScore,
		status,
		rationale: rationaleParts.join("; "),
	};
}

export async function pullBrandProfile(siteUrlOrDomain: string): Promise<BrandProfile> {
	if (!isBrandIngestionConfigured()) {
		throw new Error("Brand extraction requires Firecrawl (FIRECRAWL_API_KEY is unset)");
	}

	const url = normalizeBrandSiteUrl(siteUrlOrDomain);
	if (!url) throw new Error(`Not a usable site URL: "${siteUrlOrDomain}"`);

	const safety = await isSafeHttpsUrl(url);
	if (!safety.ok) throw new Error(`Refusing to pull an unsafe URL: ${safety.reason}`);

	const branding = await fetchFirecrawlBranding(url);
	return {
		url,
		source: "firecrawl",
		...branding,
	};
}

export async function validateBrandFidelity(
	profile: BrandProfile,
	siteUrl: string
): Promise<BrandFidelityValidationResult> {
	if (!envServer.FIRECRAWL_API_KEY) {
		return {
			status: "not_configured",
			code: "firecrawl_not_configured",
			requestedUrl: siteUrl,
			message: "Set FIRECRAWL_API_KEY before running brand fidelity validation.",
		};
	}
	if (!envServer.ANTHROPIC_API_KEY) {
		return {
			status: "not_configured",
			code: "anthropic_not_configured",
			requestedUrl: siteUrl,
			message: "Set ANTHROPIC_API_KEY before running brand fidelity validation.",
		};
	}

	const normalizedUrl = normalizeBrandSiteUrl(siteUrl);
	if (!normalizedUrl) {
		return {
			status: "error",
			code: "firecrawl_error",
			requestedUrl: siteUrl,
			message: `Not a usable site URL: "${siteUrl}"`,
		};
	}

	try {
		const safety = await isSafeHttpsUrl(normalizedUrl);
		if (!safety.ok) {
			return {
				status: "error",
				code: "firecrawl_error",
				requestedUrl: siteUrl,
				message: `Refusing to validate an unsafe URL: ${safety.reason}`,
			};
		}

		const visualReference = await fetchSiteVisualReference(normalizedUrl);
		if (!visualReference.screenshotUrl) {
			return {
				status: "error",
				code: "screenshot_unavailable",
				requestedUrl: siteUrl,
				message: "Firecrawl did not return a screenshot for this site.",
			};
		}

		const assessment = await requestAnthropicAssessment(
			profile,
			normalizedUrl,
			visualReference.screenshotUrl,
			visualReference.markdown
		);
		return {
			status: "success",
			requestedUrl: siteUrl,
			assessment,
			screenshotUrl: visualReference.screenshotUrl,
			model: envServer.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL,
			enrichedProfile: mergeFidelitySignals(profile, assessment),
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			status: "error",
			code: message.includes("Anthropic") ? "anthropic_error" : "firecrawl_error",
			requestedUrl: siteUrl,
			message,
		};
	}
}

export async function compareBrandAgainstCompetitors(
	request: BrandCompetitorComparisonRequest
): Promise<BrandCompetitorComparisonResult> {
	if (!isBrandIngestionConfigured()) {
		return {
			status: "not_configured",
			code: "firecrawl_not_configured",
			requestedUrl: request.primarySiteUrl,
			message: "Set FIRECRAWL_API_KEY before running competitor brand comparisons.",
		};
	}

	const competitorUrls = dedupeStrings(request.competitorUrls)
		.map((url) => normalizeBrandSiteUrl(url))
		.filter((url): url is string => Boolean(url));
	if (!competitorUrls.length) {
		return {
			status: "error",
			code: "invalid_input",
			requestedUrl: request.primarySiteUrl,
			message: "Provide at least one valid competitor URL.",
		};
	}

	try {
		const primaryProfile = request.primaryProfile ?? (await pullBrandProfile(request.primarySiteUrl));
		const competitorProfiles = await Promise.all(competitorUrls.map((url) => pullBrandProfile(url)));
		const competitors = competitorProfiles.map((profile) => ({
			profile,
			comparison: compareBrandProfiles(primaryProfile, profile),
		}));
		const overallScore = Math.round(
			competitors.reduce((sum, competitor) => sum + competitor.comparison.distinctivenessScore, 0) /
				competitors.length
		);
		const overallStatus = normalizeDistinctivenessStatus(overallScore);
		return {
			status: "success",
			requestedUrl: request.primarySiteUrl,
			primaryProfile,
			competitors,
			overallDistinctiveness: {
				score: overallScore,
				status: overallStatus,
				summary:
					overallStatus === "distinct"
						? "Primary brand remains visually distinct from the supplied competitors on extracted tokens."
						: overallStatus === "adjacent"
							? "Primary brand shares some palette/type/tone cues with the supplied competitors."
							: "Primary brand overlaps heavily with the supplied competitors on extracted tokens.",
			},
		};
	} catch (error) {
		return {
			status: "error",
			code: "firecrawl_error",
			requestedUrl: request.primarySiteUrl,
			message: error instanceof Error ? error.message : String(error),
		};
	}
}

export async function ingestBrandContext(
	request: BrandIngestionRequest
): Promise<BrandIngestionResult> {
	if (!isBrandIngestionConfigured()) {
		return {
			status: "not_configured",
			requestedUrl: request.siteUrl,
			message:
				"Set FIRECRAWL_API_KEY before enabling brand ingestion for this repository.",
		};
	}

	try {
		return {
			status: "success",
			requestedUrl: request.siteUrl,
			profile: await pullBrandProfile(request.siteUrl),
		};
	} catch (error) {
		return {
			status: "error",
			requestedUrl: request.siteUrl,
			message: error instanceof Error ? error.message : String(error),
		};
	}
}
