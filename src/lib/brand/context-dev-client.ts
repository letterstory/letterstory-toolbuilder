import { envServer } from "@/lib/config/env.server";

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3;
const RETRY_AFTER_MS = [1_000, 4_000];

export function isContextDevConfigured(): boolean {
	return Boolean(envServer.CONTEXT_DEV_API_KEY);
}

function isRetryable(status: number): boolean {
	return status === 408 || status === 429 || status >= 500;
}

function query(params: Record<string, string | number | undefined>): string {
	const search = new URLSearchParams();

	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined && value !== null && value !== "") {
			search.set(key, String(value));
		}
	}

	const serialized = search.toString();
	return serialized ? `?${serialized}` : "";
}

async function request<T>(
	path: string,
	init: { method: "GET" | "POST"; body?: Record<string, unknown> }
): Promise<T> {
	const apiKey = envServer.CONTEXT_DEV_API_KEY;
	if (!apiKey) {
		throw new Error("Context.dev is not configured (CONTEXT_DEV_API_KEY is unset)");
	}

	const baseUrl = envServer.CONTEXT_DEV_BASE_URL.replace(/\/$/, "");
	let lastError = "unknown error";

	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
		try {
			const response = await fetch(`${baseUrl}${path}`, {
				method: init.method,
				headers: {
					Authorization: `Bearer ${apiKey}`,
					...(init.body ? { "Content-Type": "application/json" } : {}),
				},
				body: init.body ? JSON.stringify(init.body) : undefined,
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			});

			if (response.ok) {
				return (await response.json()) as T;
			}

			const detail = await response.text().catch(() => "");
			lastError = `${response.status}: ${detail.slice(0, 200) || response.statusText || "unknown error"}`;
			if (isRetryable(response.status) && attempt < MAX_ATTEMPTS - 1) {
				await new Promise((resolve) =>
					setTimeout(resolve, RETRY_AFTER_MS[attempt] ?? RETRY_AFTER_MS.at(-1) ?? 4_000)
				);
				continue;
			}

			throw new Error(`Context.dev ${path} failed (${lastError})`);
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
			if (attempt < MAX_ATTEMPTS - 1) {
				await new Promise((resolve) =>
					setTimeout(resolve, RETRY_AFTER_MS[attempt] ?? RETRY_AFTER_MS.at(-1) ?? 4_000)
				);
				continue;
			}
		}
	}

	throw new Error(`Context.dev ${path} failed after ${MAX_ATTEMPTS} attempts (${lastError})`);
}

export interface ContextBrandColor {
	hex?: string;
	name?: string;
	source?: "site" | "logo";
}

export interface ContextBrandLogo {
	url?: string;
	mode?: string;
	type?: string;
	colors?: Array<{ hex?: string }>;
	resolution?: {
		width?: number;
		height?: number;
		aspect_ratio?: number;
	};
}

export interface ContextBrandResponse {
	brand?: {
		domain?: string;
		title?: string;
		description?: string;
		slogan?: string;
		colors?: ContextBrandColor[];
		logos?: ContextBrandLogo[];
		socials?: Array<{ type?: string; url?: string }>;
		links?: Record<string, string | null>;
		industries?: { eic?: Array<{ industry?: string; subindustry?: string }> };
		primary_language?: string | null;
	};
}

export interface ContextTypographyStyle {
	fontFamily?: string;
	fontFallbacks?: string[];
	fontSize?: string;
	fontWeight?: number;
	lineHeight?: string;
	letterSpacing?: string;
}

export interface ContextComponentStyle {
	backgroundColor?: string;
	color?: string;
	borderColor?: string;
	borderRadius?: string;
	borderWidth?: string;
	padding?: string;
	fontFamily?: string;
	fontSize?: string;
	fontWeight?: number;
	boxShadow?: string;
	css?: string;
}

export interface ContextStyleguideResponse {
	domain?: string;
	styleguide?: {
		mode?: "light" | "dark";
		colors?: { accent?: string; background?: string; text?: string };
		typography?: {
			headings?: Record<string, ContextTypographyStyle>;
			p?: ContextTypographyStyle;
		};
		elementSpacing?: Record<string, string>;
		shadows?: Record<string, string>;
		fontLinks?: Record<string, unknown>;
		components?: {
			button?: Record<string, ContextComponentStyle>;
			card?: ContextComponentStyle;
			input?: ContextComponentStyle;
		};
	};
}

export interface ContextFontsResponse {
	domain?: string;
	fonts?: Array<{
		font?: string;
		fallbacks?: string[];
		percent_words?: number;
		percent_elements?: number;
	}>;
	fontLinks?: Record<string, unknown>;
}

export interface ContextMarkdownResponse {
	markdown?: string;
	url?: string;
	metadata?: {
		title?: string;
		description?: string;
	};
}

export async function contextRetrieveBrand(
	domain: string,
	options: { maxAgeMs?: number } = {}
): Promise<ContextBrandResponse> {
	const body: Record<string, unknown> = { type: "by_domain", domain };
	if (options.maxAgeMs !== undefined) {
		body.maxAgeMs = options.maxAgeMs;
	}

	return request<ContextBrandResponse>("/brand/retrieve", { method: "POST", body });
}

export async function contextScrapeStyleguide(
	domain: string,
	options: { maxAgeMs?: number; colorScheme?: "light" | "dark" } = {}
): Promise<ContextStyleguideResponse> {
	return request<ContextStyleguideResponse>(
		`/web/styleguide${query({
			domain,
			maxAgeMs: options.maxAgeMs,
			colorScheme: options.colorScheme,
		})}`,
		{ method: "GET" }
	);
}

export async function contextScrapeFonts(
	domain: string,
	options: { maxAgeMs?: number } = {}
): Promise<ContextFontsResponse> {
	return request<ContextFontsResponse>(
		`/web/fonts${query({
			domain,
			maxAgeMs: options.maxAgeMs,
		})}`,
		{ method: "GET" }
	);
}

export async function contextScrapeMarkdown(
	url: string,
	options: { maxAgeMs?: number; mainContentOnly?: boolean } = {}
): Promise<ContextMarkdownResponse> {
	return request<ContextMarkdownResponse>(
		`/web/scrape/markdown${query({
			url,
			maxAgeMs: options.maxAgeMs,
			useMainContentOnly: options.mainContentOnly === false ? undefined : "true",
		})}`,
		{ method: "GET" }
	);
}
