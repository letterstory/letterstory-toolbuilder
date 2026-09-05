import { envServer } from "@/lib/config/env.server";
import { resolveCanonicalLogo, type CanonicalLogoResult } from "@/lib/brand/logo";
import {
	contextRetrieveBrand,
	contextScrapeFonts,
	contextScrapeMarkdown,
	contextScrapeStyleguide,
	type ContextBrandLogo,
	type ContextFontLinks,
	type ContextBrandResponse,
	type ContextComponentStyle as ContextDevComponentStyle,
	type ContextFontsResponse,
	type ContextMarkdownResponse,
	type ContextStyleguideResponse,
} from "@/lib/brand/context-dev-client";
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
export type BrandLogoMode = "light" | "dark" | "has_opaque_background";

export interface BrandFontFace {
	family: string;
	google: boolean;
	category: string | null;
	files: Record<string, string>;
	fallbacks: string[];
}

export interface BrandTypographyProfile {
	primaryFont: string | null;
	secondaryFont: string | null;
	headingFont: string | null;
	bodyFont: string | null;
	fontFamilies: string[];
	fontFaces: BrandFontFace[];
	headingFontFace: BrandFontFace | null;
	bodyFontFace: BrandFontFace | null;
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
	mode: BrandLogoMode | null;
	type: "icon" | "logo" | null;
	width: number | null;
	height: number | null;
	colors: string[];
	alt: string | null;
	href: string | null;
	selectionReasoning: string | null;
	selectionConfidence: number | null;
	/** Normalized PNG data URI resolved independently of Context.dev's pick, or null. */
	canonicalDataUri: string | null;
	/** Which candidate URL the canonical asset was resolved from, or null. */
	canonicalSourceUrl: string | null;
	canonicalWarnings: string[];
}

export interface BrandLogoVariant {
	url: string;
	kind: "url" | "data-uri" | "unknown";
	mode: BrandLogoMode;
	type: "icon" | "logo";
	width: number;
	height: number;
	colors: string[];
}

export interface BrandImagesProfile {
	logo: BrandLogoAsset;
	logoVariants: BrandLogoVariant[];
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
	notableSignals: string[];
}

export interface BrandDesignSystemProfile {
	framework: string | null;
	componentLibrary: string | null;
	implementationStyle: "custom" | "framework-based" | "hybrid" | null;
	notes: string[];
}

export interface BrandProfile {
	url: string;
	source: "context.dev";
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

export type BrandIngestionResult = BrandIngestionSuccessResult | BrandIngestionFailureResult;

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
	referenceUrl: string;
	model: string;
	enrichedProfile: BrandProfile;
}

export interface BrandFidelityValidationFailureResult {
	status: "not_configured" | "error";
	code:
		| "context_dev_not_configured"
		| "anthropic_not_configured"
		| "reference_unavailable"
		| "context_dev_error"
		| "anthropic_error";
	requestedUrl: string;
	message: string;
}

export type BrandFidelityValidationResult =
	BrandFidelityValidationSuccessResult | BrandFidelityValidationFailureResult;

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

const ANTHROPIC_TIMEOUT_MS = 45_000;
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";
const MAX_MARKDOWN_CHARS_FOR_VALIDATION = 6_000;
const MIN_BRAND_SATURATION = 0.15;
const MIN_SWATCH_DISTANCE = 40;

export function isBrandIngestionConfigured(): boolean {
	return Boolean(envServer.CONTEXT_DEV_API_KEY);
}

export function isBrandValidationConfigured(): boolean {
	return Boolean(envServer.CONTEXT_DEV_API_KEY && envServer.ANTHROPIC_API_KEY);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
	const seen = new Set<string>();

	for (const value of values) {
		if (!value) continue;
		seen.add(value);
	}

	return [...seen];
}

function pickFirstRecordString(
	record: Record<string, string | null> | undefined,
	keys: string[]
): string | null {
	if (!record) return null;

	for (const key of keys) {
		const value = readString(record[key]);
		if (value) return value;
	}

	const lowered = Object.fromEntries(
		Object.entries(record).map(([key, value]) => [key.toLowerCase(), value])
	) as Record<string, string | null>;

	for (const key of keys) {
		const value = readString(lowered[key.toLowerCase()]);
		if (value) return value;
	}

	return null;
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

function inferLogoKind(url: string | null): BrandLogoAsset["kind"] {
	if (!url) return null;
	if (url.startsWith("data:")) return "data-uri";
	if (url.startsWith("https://") || url.startsWith("http://")) return "url";
	return "unknown";
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
		? raw.gaps.filter(isRecord).map((gap) => ({
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

function mergeFidelitySignals(
	profile: BrandProfile,
	assessment: BrandFidelityAssessment
): BrandProfile {
	// Distinctive traits from validation are often full-sentence descriptions
	// (e.g. "Multicolor purple-pink-orange gradient wave as hero signature").
	// Keep them out of `descriptors` (rendered as compact badge pills) and
	// route them to `notableSignals` (rendered as a wrapped list) instead.
	const notableSignals = dedupeStrings([
		...profile.personality.notableSignals,
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
			notableSignals,
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
			fontFaces: profile.typography.fontFaces,
			headingFontFace: profile.typography.headingFontFace,
			bodyFontFace: profile.typography.bodyFontFace,
			scale: profile.typography.scale,
			hierarchy: profile.typography.hierarchy,
		},
		spacing: profile.spacing,
		components: profile.components,
		images: {
			logo: {
				url: summarizeAssetUrl(profile.images.logo.url),
				kind: profile.images.logo.kind,
				mode: profile.images.logo.mode,
				type: profile.images.logo.type,
				width: profile.images.logo.width,
				height: profile.images.logo.height,
				colors: profile.images.logo.colors,
				alt: profile.images.logo.alt,
				href: profile.images.logo.href,
				selectionReasoning: profile.images.logo.selectionReasoning,
			},
			logoVariants: profile.images.logoVariants.map((variant) => ({
				...variant,
				url: summarizeAssetUrl(variant.url),
			})),
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

export function normalizeContextDevFontFamily(raw: string): string {
	const generated = raw.trim().match(/^__(.+?)(?:_Fallback)?_[0-9a-f]{4,}$/);
	if (!generated) return raw.trim();
	return generated[1]
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/_+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function readContextFontFamily(value: unknown): string | null {
	const raw = readString(value);
	return raw ? normalizeContextDevFontFamily(raw) : null;
}

function normalizeFontFiles(value: unknown): Record<string, string> {
	if (!isRecord(value)) return {};

	return Object.fromEntries(
		Object.entries(value).flatMap(([weight, url]) => {
			const normalized = readString(url);
			return normalized ? [[weight, normalized]] : [];
		})
	);
}

function findContextFontLink(raw: string, fontLinks: ContextFontLinks) {
	return (
		fontLinks[raw] ??
		Object.entries(fontLinks).find(([family]) => normalizeContextDevFontFamily(family) === raw)?.[1] ??
		Object.entries(fontLinks).find(
			([family]) => normalizeContextDevFontFamily(family) === normalizeContextDevFontFamily(raw)
		)?.[1] ??
		null
	);
}

function resolveContextFontFace(
	family: unknown,
	fallbacks: unknown,
	fontLinks: ContextFontLinks
): BrandFontFace | null {
	const raw = readString(family);
	if (!raw) return null;

	const link = findContextFontLink(raw, fontLinks);
	const normalizedFamily = normalizeContextDevFontFamily(raw);
	const files = normalizeFontFiles(link?.files);
	const normalizedFallbacks = Array.isArray(fallbacks)
		? dedupeStrings(
				fallbacks.map((entry) => readContextFontFamily(entry)).filter((entry): entry is string => Boolean(entry))
			)
		: [];

	return {
		family: normalizedFamily,
		google:
			link?.type === "google" || Object.values(files).some((url) => url.includes("fonts.gstatic.com")),
		category: readString(link?.category),
		files,
		fallbacks: normalizedFallbacks,
	};
}

function dedupeFontFaces(faces: Array<BrandFontFace | null | undefined>): BrandFontFace[] {
	const deduped = new Map<string, BrandFontFace>();

	for (const face of faces) {
		if (!face) continue;
		const existing = deduped.get(face.family);
		if (
			!existing ||
			Object.keys(face.files).length > Object.keys(existing.files).length ||
			(face.google && !existing.google)
		) {
			deduped.set(face.family, face);
		}
	}

	return [...deduped.values()];
}

function buildFallbackFontFace(family: string, fontLinks: ContextFontLinks): BrandFontFace {
	const link = findContextFontLink(family, fontLinks);
	const files = normalizeFontFiles(link?.files);

	return {
		family,
		google:
			link?.type === "google" || Object.values(files).some((url) => url.includes("fonts.gstatic.com")),
		category: readString(link?.category),
		files,
		fallbacks: [],
	};
}

type ContextStyleguideComponents = NonNullable<
	NonNullable<ContextStyleguideResponse["styleguide"]>["components"]
>;

function collectComponentFontFamilies(components: ContextStyleguideComponents | undefined): string[] {
	if (!components) return [];

	return dedupeStrings([
		readContextFontFamily(components.button?.primary?.fontFamily),
		readContextFontFamily(components.button?.secondary?.fontFamily),
		readContextFontFamily(components.card?.fontFamily),
		readContextFontFamily(components.input?.fontFamily),
	]);
}

function normalizeLogoMode(value: unknown): BrandLogoMode {
	return value === "dark" || value === "has_opaque_background" ? value : "light";
}

function mapLogoVariants(logos: ContextBrandLogo[]): BrandLogoVariant[] {
	const variants: BrandLogoVariant[] = [];

	for (const logo of logos) {
		const url = readString(logo.url);
		if (!url) continue;

		variants.push({
			url,
			kind: inferLogoKind(url) ?? "unknown",
			mode: normalizeLogoMode(logo.mode),
			type: logo.type === "icon" ? "icon" : "logo",
			width: readNumber(logo.resolution?.width) ?? 0,
			height: readNumber(logo.resolution?.height) ?? 0,
			colors: dedupeStrings(
				(logo.colors ?? []).map((color) => normalizeColorHex(color.hex ?? "") ?? readString(color.hex))
			),
		});
	}

	return variants.sort((left, right) => {
		const typeScore = (left.type === "logo" ? 0 : 1) - (right.type === "logo" ? 0 : 1);
		if (typeScore !== 0) return typeScore;

		const opaqueScore =
			(left.mode === "has_opaque_background" ? 1 : 0) -
			(right.mode === "has_opaque_background" ? 1 : 0);
		if (opaqueScore !== 0) return opaqueScore;

		return 0;
	});
}

export function selectBrandLogoVariant(
	logos: BrandLogoVariant[],
	activeMode: "light" | "dark" | null
): BrandLogoVariant | null {
	if (!logos.length) return null;

	const usable = logos.filter((logo) => logo.mode !== "has_opaque_background");
	if (activeMode) {
		return usable.find((logo) => logo.mode === activeMode) ?? usable[0] ?? logos[0] ?? null;
	}

	return usable[0] ?? logos[0] ?? null;
}

function describeLogoSelection(
	logo: BrandLogoVariant | null,
	activeMode: "light" | "dark" | null,
	logoCount: number
): string | null {
	if (!logo) return null;
	if (logo.mode === "has_opaque_background") {
		return "Only logo candidates with built-in opaque backgrounds were available, so the best full-logo asset was kept.";
	}
	if (activeMode && logo.mode === activeMode) {
		return `Selected the ${activeMode}-mode ${logo.type} asset returned by Context.dev.`;
	}
	if (activeMode) {
		return `No ${activeMode}-mode logo was available, so the best alternate ${logo.type} asset was used.`;
	}
	if (logoCount > 1) {
		return "Selected the best full-logo asset while keeping all provider logo variants for later mode-aware resolution.";
	}
	return `Selected the only ${logo.type} asset returned by Context.dev.`;
}

function toRgb(hex: string): { r: number; g: number; b: number } | null {
	const normalized = normalizeColorHex(hex);
	if (!normalized) return null;
	return {
		r: Number.parseInt(normalized.slice(1, 3), 16),
		g: Number.parseInt(normalized.slice(3, 5), 16),
		b: Number.parseInt(normalized.slice(5, 7), 16),
	};
}

function colorDistance(left: string, right: string): number {
	const a = toRgb(left);
	const b = toRgb(right);
	if (!a || !b) return Number.POSITIVE_INFINITY;
	return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function colorSaturation(hex: string): number {
	const rgb = toRgb(hex);
	if (!rgb) return 0;
	const r = rgb.r / 255;
	const g = rgb.g / 255;
	const b = rgb.b / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	if (max === min) return 0;
	const l = (max + min) / 2;
	return (max - min) / (1 - Math.abs(2 * l - 1));
}

interface RankedColorCandidate {
	hex: string;
	weight: number;
}

function rankBrandColors(
	candidates: RankedColorCandidate[],
	background: string | null,
	text: string | null
): string[] {
	const usable = candidates
		.map((candidate) => ({
			hex: normalizeColorHex(candidate.hex),
			weight: candidate.weight,
		}))
		.filter((candidate): candidate is RankedColorCandidate => Boolean(candidate.hex))
		.filter(
			(candidate) => !background || colorDistance(candidate.hex, background) >= MIN_SWATCH_DISTANCE
		)
		.filter((candidate) => !text || colorDistance(candidate.hex, text) >= MIN_SWATCH_DISTANCE);

	const clusters: Array<{ hex: string; weight: number; votes: number; saturation: number }> = [];
	for (const candidate of usable) {
		const hit = clusters.find(
			(cluster) => colorDistance(cluster.hex, candidate.hex) < MIN_SWATCH_DISTANCE
		);
		if (hit) {
			hit.votes += 1;
			if (candidate.weight > hit.weight) {
				hit.hex = candidate.hex;
				hit.weight = candidate.weight;
				hit.saturation = colorSaturation(candidate.hex);
			}
			continue;
		}

		clusters.push({
			hex: candidate.hex,
			weight: candidate.weight,
			votes: 1,
			saturation: colorSaturation(candidate.hex),
		});
	}

	const sortByConfidence = (left: (typeof clusters)[number], right: (typeof clusters)[number]) =>
		right.votes - left.votes || right.weight - left.weight || right.saturation - left.saturation;

	const vivid = clusters
		.filter((candidate) => candidate.saturation >= MIN_BRAND_SATURATION)
		.sort(sortByConfidence);
	const neutral = clusters
		.filter((candidate) => candidate.saturation < MIN_BRAND_SATURATION)
		.sort(sortByConfidence);

	return [...vivid, ...neutral].slice(0, 3).map((candidate) => candidate.hex);
}

function mapContextComponentStyle(
	value: ContextDevComponentStyle | undefined
): BrandComponentStyle | null {
	if (!value) return null;

	const style: BrandComponentStyle = {
		background: normalizeColorHex(value.backgroundColor ?? "") ?? readString(value.backgroundColor),
		textColor: normalizeColorHex(value.color ?? "") ?? readString(value.color),
		borderColor: normalizeColorHex(value.borderColor ?? "") ?? readString(value.borderColor),
		borderRadius: readString(value.borderRadius),
		shadow: readString(value.boxShadow),
	};

	return Object.values(style).some(Boolean) ? style : null;
}

function buildContextImageNotes(logo: BrandLogoAsset, variants: BrandLogoVariant[]): string[] {
	const notes: string[] = [];
	if (logo.kind === "data-uri") {
		notes.push(
			"Context.dev selected an inline data-URI logo, which may be less reusable than a durable asset URL."
		);
	}
	if (
		logo.type === "icon" ||
		logo.url?.includes("apple-touch-icon") ||
		logo.url?.includes("app-icon")
	) {
		notes.push(
			"Selected logo appears to be an app-icon-style asset rather than a primary wordmark."
		);
	}
	if (
		variants.some((variant) => variant.mode === "has_opaque_background") &&
		logo.mode !== "has_opaque_background"
	) {
		notes.push(
			"Opaque-background logo variants were preserved but skipped for the active selection when a transparent alternative was available."
		);
	}
	return notes;
}

function collectSpacingCandidates(values: Array<string | null | undefined>): number[] {
	return values
		.map((value) => parsePixelValue(value ?? null))
		.filter((value): value is number => typeof value === "number" && value > 0);
}

function resolveBaseSpacingUnit(
	elementSpacing: Record<string, string> | undefined,
	components: BrandComponentsProfile
): number | null {
	const values = collectSpacingCandidates([
		...Object.values(elementSpacing ?? {}),
		components.primaryButton?.borderRadius,
		components.secondaryButton?.borderRadius,
		components.input?.borderRadius,
	]);
	if (!values.length) return null;
	return Math.min(...values);
}

function buildColorMap(
	brand: NonNullable<ContextBrandResponse["brand"]>,
	styleguide: ContextStyleguideResponse["styleguide"] | undefined
): Record<string, string> {
	const background = normalizeColorHex(styleguide?.colors?.background ?? "");
	const text = normalizeColorHex(styleguide?.colors?.text ?? "");
	const accent = normalizeColorHex(styleguide?.colors?.accent ?? "");
	const primaryButton = normalizeColorHex(
		styleguide?.components?.button?.primary?.backgroundColor ?? ""
	);
	const secondaryButton = normalizeColorHex(
		styleguide?.components?.button?.secondary?.backgroundColor ?? ""
	);
	const ranked = rankBrandColors(
		[
			...(accent ? [{ hex: accent, weight: 5 }] : []),
			...(primaryButton ? [{ hex: primaryButton, weight: 4 }] : []),
			...(secondaryButton ? [{ hex: secondaryButton, weight: 4 }] : []),
			...(brand.colors ?? []).flatMap((color) => {
				const hex = normalizeColorHex(color.hex ?? "");
				if (!hex) return [];
				return [{ hex, weight: color.source === "logo" ? 2 : 4 }];
			}),
			...(brand.logos ?? []).flatMap((logo) =>
				(logo.colors ?? []).flatMap((color) => {
					const hex = normalizeColorHex(color.hex ?? "");
					return hex ? [{ hex, weight: 2 }] : [];
				})
			),
		],
		background,
		text
	);

	const cardBackground = normalizeColorHex(styleguide?.components?.card?.backgroundColor ?? "");
	const colors: Record<string, string> = {};
	if (ranked[0]) colors.primary = ranked[0];
	if (ranked[1]) colors.secondary = ranked[1];
	if (ranked[2]) colors.accent = ranked[2];
	if (accent && !Object.values(colors).includes(accent)) colors.accent ??= accent;
	if (background) colors.background = background;
	if (text) colors.text = text;
	if (cardBackground && !Object.values(colors).includes(cardBackground))
		colors.surface = cardBackground;
	return colors;
}

export function parseContextDevBranding(payload: {
	brandResponse: ContextBrandResponse;
	styleguideResponse?: ContextStyleguideResponse | null;
	fontsResponse?: ContextFontsResponse | null;
	markdownResponse?: ContextMarkdownResponse | null;
}): Omit<BrandProfile, "url" | "source"> {
	const brand = payload.brandResponse.brand ?? {};
	const styleguide = payload.styleguideResponse?.styleguide;
	const headings = styleguide?.typography?.headings ?? {};
	const paragraph = styleguide?.typography?.p;
	const componentFonts = collectComponentFontFamilies(styleguide?.components);
	const rawLogos = Array.isArray(brand.logos) ? brand.logos : [];
	const logoVariants = mapLogoVariants(rawLogos);
	const activeMode =
		styleguide?.mode === "light" || styleguide?.mode === "dark" ? styleguide.mode : null;
	const preferredLogo = selectBrandLogoVariant(logoVariants, activeMode);
	const logoUrls = dedupeStrings(logoVariants.map((logo) => logo.url));
	const colors = buildColorMap(brand, styleguide);
	const fontLinks: ContextFontLinks = {
		...(payload.fontsResponse?.fontLinks ?? {}),
		...(styleguide?.fontLinks ?? {}),
	};
	const fontRanked = [...(payload.fontsResponse?.fonts ?? [])].sort(
		(left, right) =>
			(right.percent_words ?? right.percent_elements ?? 0) -
			(left.percent_words ?? left.percent_elements ?? 0)
	);
	const bodyFontFace =
		resolveContextFontFace(paragraph?.fontFamily, paragraph?.fontFallbacks, fontLinks) ??
		resolveContextFontFace(
			styleguide?.components?.input?.fontFamily,
			undefined,
			fontLinks
		) ??
		resolveContextFontFace(
			styleguide?.components?.button?.primary?.fontFamily,
			undefined,
			fontLinks
		);
	const headingFontFace =
		resolveContextFontFace(headings.h1?.fontFamily, headings.h1?.fontFallbacks, fontLinks) ??
		resolveContextFontFace(headings.h2?.fontFamily, headings.h2?.fontFallbacks, fontLinks) ??
		resolveContextFontFace(headings.h3?.fontFamily, headings.h3?.fontFallbacks, fontLinks);
	const bodyFont =
		bodyFontFace?.family ??
		componentFonts[0] ??
		null;
	const headingFont =
		headingFontFace?.family ??
		componentFonts.find((font) => font !== bodyFont) ??
		componentFonts[0] ??
		null;
	const rankedFonts = fontRanked
		.map((font) => readContextFontFamily(font.font))
		.filter((font): font is string => Boolean(font));
	const fonts = dedupeStrings([...rankedFonts, headingFont, bodyFont, ...componentFonts]);
	const rankedFontFaces = dedupeStrings(
		fontRanked.map((font) => readContextFontFamily(font.font))
	).map((font) => resolveContextFontFace(font, undefined, fontLinks) ?? buildFallbackFontFace(font, fontLinks));
	const fontFaces = dedupeFontFaces([
		headingFontFace,
		bodyFontFace,
		...rankedFontFaces,
		...fonts.map((font) => resolveContextFontFace(font, undefined, fontLinks) ?? buildFallbackFontFace(font, fontLinks)),
	]);
	const secondaryFont =
		fonts.find((font) => font !== (headingFont ?? bodyFont ?? fonts[0] ?? null)) ?? null;
	const typeScale = normalizeTypeScale({
		h1: readString(headings.h1?.fontSize),
		h2: readString(headings.h2?.fontSize),
		h3: readString(headings.h3?.fontSize),
		body: readString(paragraph?.fontSize),
		small: readString(headings.h6?.fontSize),
	});
	const components: BrandComponentsProfile = {
		primaryButton: mapContextComponentStyle(styleguide?.components?.button?.primary),
		secondaryButton: mapContextComponentStyle(styleguide?.components?.button?.secondary),
		input: mapContextComponentStyle(styleguide?.components?.input),
		additional: Object.fromEntries(
			Object.entries({ card: mapContextComponentStyle(styleguide?.components?.card) }).filter(
				([, value]) => Boolean(value)
			)
		) as Record<string, BrandComponentStyle>,
	};
	const logoUrl = readString(preferredLogo?.url) ?? null;
	const faviconUrl = pickFirstRecordString(brand.links, [
		"favicon",
		"icon",
		"shortcut icon",
		"apple-touch-icon",
		"apple-touch-icon-precomposed",
	]);
	const ogImageUrl = pickFirstRecordString(brand.links, [
		"og:image",
		"ogImage",
		"image_src",
		"image",
	]);
	const logo: BrandLogoAsset = {
		url: preferredLogo?.url ?? null,
		kind: preferredLogo?.kind ?? inferLogoKind(logoUrl),
		mode: preferredLogo?.mode ?? null,
		type: preferredLogo?.type ?? null,
		width: preferredLogo?.width ?? null,
		height: preferredLogo?.height ?? null,
		colors: preferredLogo?.colors ?? [],
		alt: brand.title?.trim() ? `${brand.title.trim()} logo` : null,
		href: null,
		selectionReasoning: describeLogoSelection(preferredLogo, activeMode, logoVariants.length),
		selectionConfidence: null,
		canonicalDataUri: null,
		canonicalSourceUrl: null,
		canonicalWarnings: [],
	};
	const baseUnit = resolveBaseSpacingUnit(styleguide?.elementSpacing, components);
	const borderRadius =
		readString(styleguide?.components?.button?.primary?.borderRadius) ??
		readString(styleguide?.components?.button?.secondary?.borderRadius) ??
		readString(styleguide?.components?.card?.borderRadius) ??
		null;
	const designSystemFramework = null;

	return {
		brandName: readString(brand.title),
		colorScheme: activeMode,
		confidence: null,
		primaryLogoUrl: logoUrl,
		logoUrls,
		colors,
		fonts,
		typography: {
			primaryFont: headingFont ?? bodyFont ?? fonts[0] ?? null,
			secondaryFont,
			headingFont: headingFont ?? fonts[0] ?? null,
			bodyFont: bodyFont ?? fonts[0] ?? null,
			fontFamilies: fonts,
			fontFaces,
			headingFontFace,
			bodyFontFace,
			fontStacks: {
				heading: dedupeStrings([
					headingFont,
					...(headings.h1?.fontFallbacks ?? []).map((font) => readContextFontFamily(font)),
				]),
				body: dedupeStrings([
					bodyFont,
					...(paragraph?.fontFallbacks ?? []).map((font) => readContextFontFamily(font)),
				]),
				paragraph: dedupeStrings([
					bodyFont,
					...(paragraph?.fontFallbacks ?? []).map((font) => readContextFontFamily(font)),
				]),
			},
			scale: typeScale,
			hierarchy: deriveTypographyHierarchy(typeScale),
		},
		spacing: {
			baseUnit,
			borderRadius,
			radiusScale: dedupeStrings([
				components.primaryButton?.borderRadius,
				components.secondaryButton?.borderRadius,
				components.input?.borderRadius,
				borderRadius,
			]),
			rhythm: deriveSpacingRhythm(baseUnit),
		},
		components,
		images: {
			logo,
			logoVariants,
			faviconUrl,
			ogImageUrl,
			gallery: logoUrls,
			imageryStyle: null,
			notes: buildContextImageNotes(logo, logoVariants),
		},
		personality: {
			tone: readString(brand.slogan),
			toneOfVoice: readString(brand.slogan),
			energy: null,
			targetAudience: null,
			descriptors: splitDescriptors(readString(brand.slogan), readString(brand.description)),
			notableSignals: [],
		},
		designSystem: {
			framework: designSystemFramework,
			componentLibrary: null,
			implementationStyle: inferImplementationStyle(designSystemFramework, null),
			notes: dedupeStrings([
				styleguide?.mode ? `Context.dev detected ${styleguide.mode} mode.` : null,
				payload.markdownResponse?.metadata?.title
					? `Reference page: ${payload.markdownResponse.metadata.title}`
					: null,
			]),
		},
		metadata: normalizeBrandMap({
			title: readString(payload.markdownResponse?.metadata?.title) ?? readString(brand.title),
			description:
				readString(payload.markdownResponse?.metadata?.description) ??
				readString(brand.description),
		}),
		raw: {
			contextBrand: payload.brandResponse,
			contextStyleguide: payload.styleguideResponse ?? null,
			contextFonts: payload.fontsResponse ?? null,
			contextMarkdown: payload.markdownResponse ?? null,
		},
	};
}

async function fetchContextDevBranding(url: string): Promise<Omit<BrandProfile, "url" | "source">> {
	const domain = new URL(url).hostname;
	const [brandResponse, styleguideResponse, fontsResponse, markdownResponse] = await Promise.all([
		contextRetrieveBrand(domain),
		contextScrapeStyleguide(domain).catch(() => null),
		contextScrapeFonts(domain).catch(() => null),
		contextScrapeMarkdown(url).catch(() => null),
	]);

	return parseContextDevBranding({
		brandResponse,
		styleguideResponse,
		fontsResponse,
		markdownResponse,
	});
}

async function fetchSiteReference(
	url: string
): Promise<{ referenceUrl: string; markdown: string | null }> {
	const body = await contextScrapeMarkdown(url);
	return {
		referenceUrl: readString(body.url) ?? url,
		markdown: readString(body.markdown),
	};
}

async function requestAnthropicAssessment(
	profile: BrandProfile,
	siteUrl: string,
	referenceMarkdown: string
): Promise<BrandFidelityAssessment> {
	const apiKey = envServer.ANTHROPIC_API_KEY;
	if (!apiKey) {
		throw new Error("Brand validation requires Anthropic (ANTHROPIC_API_KEY is unset)");
	}

	const model = envServer.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;
	const instructions = [
		"You are validating whether a structured brand profile captures what makes a website visually feel like itself.",
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
						field:
							"logo | colors | typography | spacing | components | images | personality | designSystem",
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
		"You are working from Context.dev extraction and rendered homepage markdown, not a screenshot, so call out missing cues conservatively.",
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
						`Site URL: ${siteUrl}`,
						`Structured brand profile: ${JSON.stringify(createValidationPromptProfile(profile), null, 2)}`,
						`Homepage markdown excerpt: ${referenceMarkdown.slice(0, MAX_MARKDOWN_CHARS_FOR_VALIDATION)}`,
					].join("\n\n"),
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

export async function pullBrandProfile(siteUrlOrDomain: string): Promise<BrandProfile> {
	if (!isBrandIngestionConfigured()) {
		throw new Error("Brand extraction requires Context.dev (CONTEXT_DEV_API_KEY is unset)");
	}

	const url = normalizeBrandSiteUrl(siteUrlOrDomain);
	if (!url) throw new Error(`Not a usable site URL: "${siteUrlOrDomain}"`);

	const safety = await isSafeHttpsUrl(url);
	if (!safety.ok) throw new Error(`Refusing to pull an unsafe URL: ${safety.reason}`);

	const branding = await fetchContextDevBranding(url);
	const canonicalLogo = await resolveCanonicalLogoForBranding(branding);

	return {
		url,
		source: "context.dev",
		...branding,
		images: {
			...branding.images,
			logo: {
				...branding.images.logo,
				canonicalDataUri: canonicalLogo.dataUri,
				canonicalSourceUrl: canonicalLogo.sourceUrl,
				canonicalWarnings: canonicalLogo.warnings,
			},
		},
	};
}

/**
 * Resolve a canonical logo asset from every candidate URL we know about,
 * preferred pick first. Fail-soft: any error here must not fail ingestion —
 * the raw Context.dev logo selection remains usable either way.
 */
async function resolveCanonicalLogoForBranding(
	branding: Omit<BrandProfile, "url" | "source">
): Promise<CanonicalLogoResult> {
	try {
		return await resolveCanonicalLogo([
			branding.primaryLogoUrl,
			...branding.images.logoVariants.map((variant) => variant.url),
			...branding.logoUrls,
			branding.images.faviconUrl,
		]);
	} catch {
		return {
			dataUri: null,
			sourceUrl: null,
			warnings: [
				"Canonical logo resolution failed unexpectedly; using the raw Context.dev selection.",
			],
		};
	}
}

export async function validateBrandFidelity(
	profile: BrandProfile,
	siteUrl: string
): Promise<BrandFidelityValidationResult> {
	if (!envServer.CONTEXT_DEV_API_KEY) {
		return {
			status: "not_configured",
			code: "context_dev_not_configured",
			requestedUrl: siteUrl,
			message: "Set CONTEXT_DEV_API_KEY before running brand fidelity validation.",
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
			code: "context_dev_error",
			requestedUrl: siteUrl,
			message: `Not a usable site URL: "${siteUrl}"`,
		};
	}

	try {
		const safety = await isSafeHttpsUrl(normalizedUrl);
		if (!safety.ok) {
			return {
				status: "error",
				code: "context_dev_error",
				requestedUrl: siteUrl,
				message: `Refusing to validate an unsafe URL: ${safety.reason}`,
			};
		}

		const reference = await fetchSiteReference(normalizedUrl);
		const fallbackReferenceText = dedupeStrings([
			readString(profile.metadata.title),
			readString(profile.metadata.description),
		]).join("\n\n");
		const referenceMarkdown = reference.markdown ?? fallbackReferenceText;
		if (!referenceMarkdown) {
			return {
				status: "error",
				code: "reference_unavailable",
				requestedUrl: siteUrl,
				message: "Context.dev did not return enough rendered page content for validation.",
			};
		}

		const assessment = await requestAnthropicAssessment(profile, normalizedUrl, referenceMarkdown);
		return {
			status: "success",
			requestedUrl: siteUrl,
			assessment,
			referenceUrl: reference.referenceUrl,
			model: envServer.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL,
			enrichedProfile: mergeFidelitySignals(profile, assessment),
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			status: "error",
			code: message.includes("Anthropic") ? "anthropic_error" : "context_dev_error",
			requestedUrl: siteUrl,
			message,
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
			message: "Set CONTEXT_DEV_API_KEY before enabling brand ingestion for this repository.",
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
