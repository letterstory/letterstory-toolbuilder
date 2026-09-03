import { envServer } from "@/lib/config/env.server";
import { isSafeHttpsUrl } from "@/lib/net/ssrf";

export interface BrandIngestionRequest {
	siteUrl: string;
	includeSubpages?: boolean;
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
	typography: Record<string, unknown>;
	spacing: Record<string, unknown>;
	components: Record<string, unknown>;
	images: Record<string, unknown>;
	personality: Record<string, unknown>;
	designSystem: Record<string, unknown>;
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

interface FirecrawlScrapeResponse {
	success?: boolean;
	error?: string;
	data?: {
		branding?: unknown;
		metadata?: unknown;
	};
}

const FIRECRAWL_TIMEOUT_MS = 45_000;

export function isBrandIngestionConfigured(): boolean {
	return Boolean(envServer.FIRECRAWL_API_KEY);
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
	const typography = isRecord(raw.typography) ? raw.typography : {};
	const spacing = isRecord(raw.spacing) ? raw.spacing : {};
	const components = isRecord(raw.components) ? raw.components : {};
	const images = isRecord(raw.images) ? raw.images : {};
	const personality = isRecord(raw.personality) ? raw.personality : {};
	const designSystem = isRecord(raw.designSystem) ? raw.designSystem : {};
	const colors = normalizeBrandMap(raw.colors);
	const fontFamilies = isRecord(typography.fontFamilies)
		? Object.values(typography.fontFamilies).map((candidate) => readString(candidate))
		: [];
	const directFontFamilies = Array.isArray(raw.fonts)
		? raw.fonts.map((entry) => readFontFamily(entry))
		: [];
	const logoUrls = dedupeStrings([
		readString(raw.logo),
		readString(raw.logoUrl),
		readNestedLogoUrl(images.logo),
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
		readString(typography.primaryFont),
		readString(typography.secondaryFont),
		...fontFamilies,
	]);
	const colorScheme = readString(raw.colorScheme);
	const confidence = typeof raw.confidence === "number" ? raw.confidence : null;
	const brandName = readString(raw.brandName);

	return {
		brandName,
		colorScheme: colorScheme === "light" || colorScheme === "dark" ? colorScheme : null,
		confidence,
		primaryLogoUrl: preferredLogoUrl,
		logoUrls,
		colors,
		fonts,
		typography,
		spacing,
		components,
		images,
		personality,
		designSystem,
		metadata,
		raw,
	};
}

async function fetchFirecrawlBranding(url: string): Promise<Omit<BrandProfile, "url" | "source">> {
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
			formats: ["branding"],
			timeout: FIRECRAWL_TIMEOUT_MS - 5_000,
		}),
		signal: AbortSignal.timeout(FIRECRAWL_TIMEOUT_MS),
	});
	const body = (await response.json().catch(() => ({}))) as FirecrawlScrapeResponse;

	if (!response.ok || body.success === false) {
		throw new Error(
			`Firecrawl branding scrape failed (${response.status}): ${body.error ?? "unknown error"}`
		);
	}

	return parseFirecrawlBranding(body.data?.branding, body.data?.metadata);
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
