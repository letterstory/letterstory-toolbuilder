import { beforeEach, describe, expect, it, vi } from "vitest";

const isSafeHttpsUrlMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/net/ssrf", () => ({
	isSafeHttpsUrl: isSafeHttpsUrlMock,
}));

import {
	captureFirecrawlScreenshotUrl,
	isFirecrawlScreenshotConfigured,
} from "../../src/lib/brand/firecrawl-screenshot";

const originalFetch = global.fetch;
const originalEnv = {
	FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY,
};

describe("firecrawl screenshot client", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		isSafeHttpsUrlMock.mockReset();
		isSafeHttpsUrlMock.mockResolvedValue({ ok: true });
		global.fetch = originalFetch;

		for (const [key, value] of Object.entries(originalEnv)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});

	it("is disabled when FIRECRAWL_API_KEY is unset", async () => {
		delete process.env.FIRECRAWL_API_KEY;

		expect(isFirecrawlScreenshotConfigured()).toBe(false);
		await expect(captureFirecrawlScreenshotUrl("https://google.com")).resolves.toBeNull();
	});

	it("requests a full-page screenshot first", async () => {
		process.env.FIRECRAWL_API_KEY = "configured-key";
		global.fetch = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					data: {
						"screenshot@fullPage": "https://cdn.firecrawl.dev/google-full.png",
					},
				}),
				{ status: 200 }
			)
		) as typeof fetch;

		const result = await captureFirecrawlScreenshotUrl("https://google.com");

		expect(result).toBe("https://cdn.firecrawl.dev/google-full.png");
		expect(global.fetch).toHaveBeenCalledWith(
			"https://api.firecrawl.dev/v1/scrape",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({
					Authorization: "Bearer configured-key",
				}),
			})
		);
		const body = JSON.parse(
			String((vi.mocked(global.fetch).mock.calls[0]?.[1] as RequestInit | undefined)?.body ?? "{}")
		) as {
			formats?: string[];
		};
		expect(body.formats).toEqual(["screenshot@fullPage"]);
	});

	it("falls back to viewport screenshot when full-page capture does not return a URL", async () => {
		process.env.FIRECRAWL_API_KEY = "configured-key";
		global.fetch = vi
			.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({ data: {} }), { status: 200 }))
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						data: {
							screenshot: "https://cdn.firecrawl.dev/google-viewport.png",
						},
					}),
					{ status: 200 }
				)
			) as typeof fetch;

		const result = await captureFirecrawlScreenshotUrl("https://google.com");

		expect(result).toBe("https://cdn.firecrawl.dev/google-viewport.png");
		expect(vi.mocked(global.fetch).mock.calls).toHaveLength(2);
	});
});
