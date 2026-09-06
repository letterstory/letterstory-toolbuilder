import { envServer } from "@/lib/config/env.server";
import { isSafeHttpsUrl } from "@/lib/net/ssrf";

const FIRECRAWL_BASE_URL = "https://api.firecrawl.dev/v1";
const FIRECRAWL_TIMEOUT_MS = 25_000;

type FirecrawlScreenshotFormat = "screenshot@fullPage" | "screenshot";

interface FirecrawlScrapeResponse {
	data?: Record<string, unknown>;
	screenshot?: unknown;
	"screenshot@fullPage"?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function extractScreenshotUrl(
	body: unknown,
	format: FirecrawlScreenshotFormat
): string | null {
	const record = isRecord(body) ? body : {};
	const data = isRecord(record.data) ? record.data : {};

	return readString(data[format]) ?? readString(record[format]) ?? null;
}

export function isFirecrawlScreenshotConfigured(): boolean {
	return Boolean(envServer.FIRECRAWL_API_KEY);
}

export async function captureFirecrawlScreenshotUrl(siteUrl: string): Promise<string | null> {
	const apiKey = envServer.FIRECRAWL_API_KEY;
	if (!apiKey) return null;

	const safety = await isSafeHttpsUrl(siteUrl);
	if (!safety.ok) return null;

	for (const format of ["screenshot@fullPage", "screenshot"] as const) {
		try {
			const response = await fetch(`${FIRECRAWL_BASE_URL}/scrape`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					url: siteUrl,
					formats: [format],
				}),
				signal: AbortSignal.timeout(FIRECRAWL_TIMEOUT_MS),
			});
			if (!response.ok) continue;

			const body = (await response.json().catch(() => null)) as FirecrawlScrapeResponse | null;
			const screenshotUrl = extractScreenshotUrl(body, format);
			if (!screenshotUrl) continue;

			const screenshotSafety = await isSafeHttpsUrl(screenshotUrl);
			if (!screenshotSafety.ok) continue;

			return screenshotUrl;
		} catch {
			continue;
		}
	}

	return null;
}
