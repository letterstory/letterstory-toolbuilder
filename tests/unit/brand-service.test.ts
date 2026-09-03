import { beforeEach, describe, expect, it, vi } from "vitest";

const isSafeHttpsUrlMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/net/ssrf", () => ({
	isSafeHttpsUrl: isSafeHttpsUrlMock,
}));

import {
	isBrandIngestionConfigured,
	normalizeBrandSiteUrl,
	parseFirecrawlBranding,
	pullBrandProfile,
} from "../../src/lib/brand";

const originalFetch = global.fetch;
const originalEnv = {
	FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY,
	FIRECRAWL_BASE_URL: process.env.FIRECRAWL_BASE_URL,
};

describe("brand service", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		isSafeHttpsUrlMock.mockReset();
		isSafeHttpsUrlMock.mockResolvedValue({ ok: true });
		global.fetch = originalFetch;

		if (originalEnv.FIRECRAWL_API_KEY === undefined) delete process.env.FIRECRAWL_API_KEY;
		else process.env.FIRECRAWL_API_KEY = originalEnv.FIRECRAWL_API_KEY;

		if (originalEnv.FIRECRAWL_BASE_URL === undefined) delete process.env.FIRECRAWL_BASE_URL;
		else process.env.FIRECRAWL_BASE_URL = originalEnv.FIRECRAWL_BASE_URL;
	});

	it("normalizes domains and strips deep paths to an https root", () => {
		expect(normalizeBrandSiteUrl("stripe.com")).toBe("https://stripe.com");
		expect(normalizeBrandSiteUrl("http://www.ramp.com/pricing?plan=plus")).toBe(
			"https://www.ramp.com"
		);
		expect(normalizeBrandSiteUrl("https://sub.example.co.uk/a/b")).toBe(
			"https://sub.example.co.uk"
		);
		expect(normalizeBrandSiteUrl("")).toBeNull();
		expect(normalizeBrandSiteUrl("localhost")).toBeNull();
		expect(normalizeBrandSiteUrl("not a url")).toBeNull();
	});

	it("parses branding payloads into the app-facing profile shape", () => {
		const parsed = parseFirecrawlBranding(
			{
				colorScheme: "dark",
				logoUrl: "https://cdn.example.com/logo.svg",
				logos: ["https://cdn.example.com/logo.svg", { url: "https://cdn.example.com/logo-mark.svg" }],
				colors: {
					primary: "#635BFF",
					background: "#0A2540",
					ignored: 42,
				},
				fonts: ["Inter", "Sohne", "Inter"],
				typography: {
					primaryFont: "Inter",
					secondaryFont: "Sohne",
					fontFamilies: {
						body: "Inter",
						headings: "Sohne",
					},
					fontSizes: {
						h1: "48px",
					},
				},
				spacing: {
					base: "8px",
				},
				components: {
					button: {
						bgColor: "#635BFF",
					},
				},
				images: {
					favicon: "https://cdn.example.com/favicon.ico",
				},
			},
			{
				title: "Example",
				statusCode: 200,
			}
		);

		expect(parsed.colorScheme).toBe("dark");
		expect(parsed.brandName).toBeNull();
		expect(parsed.confidence).toBeNull();
		expect(parsed.primaryLogoUrl).toBe("https://cdn.example.com/logo.svg");
		expect(parsed.logoUrls).toEqual([
			"https://cdn.example.com/logo.svg",
			"https://cdn.example.com/logo-mark.svg",
		]);
		expect(parsed.colors).toEqual({
			primary: "#635BFF",
			background: "#0A2540",
		});
		expect(parsed.fonts).toEqual(["Inter", "Sohne"]);
		expect(parsed.typography).toMatchObject({
			fontSizes: {
				h1: "48px",
			},
		});
		expect(parsed.spacing).toEqual({ base: "8px" });
		expect(parsed.components).toMatchObject({
			button: {
				bgColor: "#635BFF",
			},
		});
		expect(parsed.images).toEqual({
			favicon: "https://cdn.example.com/favicon.ico",
		});
		expect(parsed.personality).toEqual({});
		expect(parsed.designSystem).toEqual({});
		expect(parsed.metadata).toEqual({
			title: "Example",
			statusCode: 200,
		});
	});

	it("rejects unsafe urls before calling Firecrawl", async () => {
		process.env.FIRECRAWL_API_KEY = "configured-key";
		isSafeHttpsUrlMock.mockResolvedValue({ ok: false, reason: "blocked ip" });
		const fetchSpy = vi.fn();
		global.fetch = fetchSpy as typeof fetch;

		await expect(pullBrandProfile("https://127.0.0.1/admin")).rejects.toThrow(
			"Refusing to pull an unsafe URL: blocked ip"
		);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("gates live extraction on config presence", async () => {
		delete process.env.FIRECRAWL_API_KEY;

		expect(isBrandIngestionConfigured()).toBe(false);
		await expect(pullBrandProfile("https://example.com")).rejects.toThrow(
			"Brand extraction requires Firecrawl (FIRECRAWL_API_KEY is unset)"
		);
	});

	it("pulls and parses brand profiles from Firecrawl", async () => {
		process.env.FIRECRAWL_API_KEY = "configured-key";
		process.env.FIRECRAWL_BASE_URL = "https://api.firecrawl.dev";
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				success: true,
				data: {
					branding: {
						brandName: "Stripe",
						confidence: 0.93,
						logo: "https://cdn.stripe.com/logo.svg",
						colors: {
							primary: "#635BFF",
							secondary: "#0A2540",
						},
						fonts: [{ family: "Inter", role: "body" }],
						personality: {
							tone: "precise",
						},
						designSystem: {
							layout: "grid",
						},
						typography: {
							fontSizes: {
								body: "16px",
							},
						},
					},
					metadata: {
						title: "Stripe | Financial Infrastructure",
						statusCode: 200,
					},
				},
			}),
		}) as typeof fetch;

		const profile = await pullBrandProfile("stripe.com");

		expect(isSafeHttpsUrlMock).toHaveBeenCalledWith("https://stripe.com");
		expect(global.fetch).toHaveBeenCalledWith(
			"https://api.firecrawl.dev/v2/scrape",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({
					Authorization: "Bearer configured-key",
				}),
			})
		);
		expect(profile).toMatchObject({
			url: "https://stripe.com",
			source: "firecrawl",
			brandName: "Stripe",
			confidence: 0.93,
			primaryLogoUrl: "https://cdn.stripe.com/logo.svg",
			colors: {
				primary: "#635BFF",
				secondary: "#0A2540",
			},
			fonts: ["Inter"],
			personality: {
				tone: "precise",
			},
			designSystem: {
				layout: "grid",
			},
			metadata: {
				title: "Stripe | Financial Infrastructure",
				statusCode: 200,
			},
		});
	});
});
