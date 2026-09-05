import { envServer } from "@/lib/config/env.server";

const FIRECRAWL_TIMEOUT_MS = 20_000;

interface FirecrawlScrapeResponse {
	success?: boolean;
	error?: string;
	data?: {
		branding?: unknown;
		metadata?: unknown;
	};
}

export interface FirecrawlBrandingPayload {
	branding: unknown;
	metadata: unknown;
}

export function isFirecrawlConfigured(): boolean {
	return Boolean(envServer.FIRECRAWL_BASE_URL);
}

export async function firecrawlScrapeBranding(url: string): Promise<FirecrawlBrandingPayload> {
	const response = await fetch(`${envServer.FIRECRAWL_BASE_URL.replace(/\/$/, "")}/v2/scrape`, {
		method: "POST",
		headers: {
			...(envServer.FIRECRAWL_API_KEY
				? {
						Authorization: `Bearer ${envServer.FIRECRAWL_API_KEY}`,
				  }
				: {}),
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

	return {
		branding: body.data?.branding ?? {},
		metadata: body.data?.metadata ?? {},
	};
}
