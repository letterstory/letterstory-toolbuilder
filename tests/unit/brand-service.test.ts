import { beforeEach, describe, expect, it, vi } from "vitest";

const isSafeHttpsUrlMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/net/ssrf", () => ({
	isSafeHttpsUrl: isSafeHttpsUrlMock,
}));

import {
	compareBrandAgainstCompetitors,
	isBrandIngestionConfigured,
	normalizeBrandSiteUrl,
	parseFirecrawlBranding,
	pullBrandProfile,
	validateBrandFidelity,
} from "../../src/lib/brand";

const originalFetch = global.fetch;
const originalEnv = {
	ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
	ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
	FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY,
	FIRECRAWL_BASE_URL: process.env.FIRECRAWL_BASE_URL,
};

describe("brand service", () => {
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

	it("parses branding payloads into a normalized schema with meaningful subfields", () => {
		const parsed = parseFirecrawlBranding(
			{
				brandName: "Example",
				colorScheme: "dark",
				confidence: { overall: 0.91 },
				logoUrl: "https://cdn.example.com/logo.svg",
				logos: [
					"https://cdn.example.com/logo.svg",
					{ url: "https://cdn.example.com/logo-mark.svg" },
				],
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
						heading: "Sohne",
					},
					fontStacks: {
						heading: ["Sohne", "sans-serif"],
						body: ["Inter", "sans-serif"],
					},
					fontSizes: {
						h1: "48px",
						body: "16px",
					},
				},
				spacing: {
					baseUnit: 8,
					borderRadius: "12px",
				},
				components: {
					buttonPrimary: {
						background: "#635BFF",
						textColor: "#FFFFFF",
						borderRadius: "12px",
					},
					card: {
						background: "#0A2540",
						shadow: "0 1px 2px rgba(0,0,0,.1)",
					},
				},
				images: {
					favicon: "https://cdn.example.com/favicon.ico",
					ogImage: "https://cdn.example.com/og.png",
					logoAlt: "Example logo",
					logoHref: "/",
				},
				personality: {
					tone: "precise",
					energy: "medium",
					targetAudience: "engineering teams",
				},
				designSystem: {
					framework: "custom",
					componentLibrary: "",
				},
				__llm_logo_reasoning: {
					reasoning: "Selected the header wordmark.",
					confidence: 0.88,
				},
			},
			{
				title: "Example",
				description: "A calm, highly technical product site.",
				statusCode: 200,
			}
		);

		expect(parsed.brandName).toBe("Example");
		expect(parsed.confidence).toBe(0.91);
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
			primaryFont: "Inter",
			secondaryFont: "Sohne",
			headingFont: "Sohne",
			bodyFont: "Inter",
			hierarchy: "display-led",
			scale: {
				h1: "48px",
				body: "16px",
			},
		});
		expect(parsed.spacing).toEqual({
			baseUnit: 8,
			borderRadius: "12px",
			radiusScale: ["12px"],
			rhythm: "balanced",
		});
		expect(parsed.components.primaryButton).toMatchObject({
			background: "#635BFF",
			textColor: "#FFFFFF",
			borderRadius: "12px",
		});
		expect(parsed.components.additional.card).toMatchObject({
			background: "#0A2540",
			shadow: "0 1px 2px rgba(0,0,0,.1)",
		});
		expect(parsed.images).toMatchObject({
			faviconUrl: "https://cdn.example.com/favicon.ico",
			ogImageUrl: "https://cdn.example.com/og.png",
			logo: {
				alt: "Example logo",
				href: "/",
				selectionReasoning: "Selected the header wordmark.",
				selectionConfidence: 0.88,
			},
		});
		expect(parsed.personality).toMatchObject({
			tone: "precise",
			toneOfVoice: "precise",
			energy: "medium",
			targetAudience: "engineering teams",
		});
		expect(parsed.personality.descriptors).toContain("precise");
		expect(parsed.designSystem).toMatchObject({
			framework: "custom",
			componentLibrary: null,
			implementationStyle: "custom",
		});
		expect(parsed.metadata).toEqual({
			title: "Example",
			description: "A calm, highly technical product site.",
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
						confidence: { overall: 0.93 },
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
							framework: "custom",
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
		const [requestUrl, requestOptions] = vi.mocked(global.fetch).mock.calls[0] ?? [];
		expect(requestUrl).toBe("https://api.firecrawl.dev/v2/scrape");
		expect(requestOptions?.method).toBe("POST");
		expect(
			(requestOptions as { headers?: Record<string, string> } | undefined)?.headers?.Authorization
		).toContain("configured-key");
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
				toneOfVoice: "precise",
			},
			designSystem: {
				framework: "custom",
			},
			metadata: {
				title: "Stripe | Financial Infrastructure",
				statusCode: 200,
			},
		});
	});

	it("validates brand fidelity with Firecrawl screenshots and Anthropic", async () => {
		process.env.FIRECRAWL_API_KEY = "configured-key";
		process.env.ANTHROPIC_API_KEY = "configured-key";
		process.env.ANTHROPIC_MODEL = "claude-sonnet-4-6";

		const profile = {
			...(await pullProfileFixture()),
			url: "https://stripe.com",
		};
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						screenshot: "https://firecrawl.dev/screenshot.png",
						markdown: "# Stripe\n\nPayments infrastructure for the internet.",
					},
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					content: [
						{
							type: "text",
							text: JSON.stringify({
								status: "warn",
								similarityScore: 71,
								confidence: "high",
								summary:
									"The extracted profile captures Stripe's palette and typography, but misses some hero gradients and the primary wordmark treatment.",
								confirmedSignals: ["Sohne-led typography", "periwinkle primary CTA"],
								gaps: [
									{
										field: "logo",
										severity: "high",
										issue: "Selected logo is a data URI rather than a durable wordmark asset.",
										evidence: "Header screenshot shows a navy wordmark, but the extracted asset is inline SVG.",
										recommendation: "Resolve and store a reusable canonical logo URL or vector asset.",
									},
								],
								derivedSignals: {
									toneOfVoice: "confident, infrastructure-first",
									imageryStyle: "soft product gradients with crisp dashboard illustrations",
									typeHierarchy: "display-led",
									spacingRhythm: "balanced",
									distinctiveTraits: ["gradient hero backdrops", "navy-on-lilac contrast"],
								},
							}),
						},
					],
				}),
			});
		global.fetch = fetchMock as typeof fetch;

		const result = await validateBrandFidelity(profile, "stripe.com");

		expect(result.status).toBe("success");
		if (result.status !== "success") return;
		expect(result.assessment).toMatchObject({
			status: "warn",
			similarityScore: 71,
			confidence: "high",
			derivedSignals: {
				toneOfVoice: "confident, infrastructure-first",
				imageryStyle: "soft product gradients with crisp dashboard illustrations",
			},
		});
		expect(result.enrichedProfile.personality.toneOfVoice).toBe(
			"confident, infrastructure-first"
		);
		expect(result.enrichedProfile.images.imageryStyle).toBe(
			"soft product gradients with crisp dashboard illustrations"
		);
		expect(result.enrichedProfile.designSystem.notes.at(-1)).toContain("Validation status warn");
		expect(fetchMock).toHaveBeenNthCalledWith(
			2,
			"https://api.anthropic.com/v1/messages",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({
					"anthropic-version": "2023-06-01",
				}),
			})
		);
	});

	it("returns a screenshot_unavailable error when Firecrawl has no visual output", async () => {
		process.env.FIRECRAWL_API_KEY = "configured-key";
		process.env.ANTHROPIC_API_KEY = "configured-key";
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				success: true,
				data: { markdown: "# Example" },
			}),
		}) as typeof fetch;

		const result = await validateBrandFidelity(await pullProfileFixture(), "https://example.com");

		expect(result).toMatchObject({
			status: "error",
			code: "screenshot_unavailable",
		});
	});

	it("compares a primary brand against explicit competitors", async () => {
		process.env.FIRECRAWL_API_KEY = "configured-key";
		const primaryProfile = parseFirecrawlBranding(
			{
				brandName: "Stripe",
				colors: { primary: "#635BFF", background: "#FFFFFF", textPrimary: "#0A2540" },
				fonts: ["Sohne"],
				personality: { tone: "professional", targetAudience: "developers" },
				typography: { fontSizes: { h1: "48px", body: "16px" } },
				spacing: { baseUnit: 8 },
			},
			{}
		);
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						branding: {
							brandName: "Adyen",
							colors: { primary: "#0ABF53", background: "#FFFFFF", textPrimary: "#00112C" },
							fonts: ["Inter"],
							personality: { tone: "professional", targetAudience: "enterprises" },
							typography: { fontSizes: { h1: "52px", body: "18px" } },
							spacing: { baseUnit: 8 },
						},
						metadata: {},
					},
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					success: true,
					data: {
						branding: {
							brandName: "PayPal",
							colors: { primary: "#003087", accent: "#009CDE", background: "#FFFFFF" },
							fonts: ["PayPalOpen", "Helvetica Neue"],
							personality: { tone: "trustworthy", targetAudience: "consumers and merchants" },
							typography: { fontSizes: { h1: "44px", body: "16px" } },
							spacing: { baseUnit: 6 },
						},
						metadata: {},
					},
				}),
			});
		global.fetch = fetchMock as typeof fetch;

		const result = await compareBrandAgainstCompetitors({
			primarySiteUrl: "stripe.com",
			primaryProfile: {
				...primaryProfile,
				url: "https://stripe.com",
				source: "firecrawl",
			},
			competitorUrls: ["adyen.com", "paypal.com"],
		});

		expect(result.status).toBe("success");
		if (result.status !== "success") return;
		expect(result.competitors).toHaveLength(2);
		expect(result.competitors[0]?.comparison).toMatchObject({
			competitorBrandName: "Adyen",
			status: expect.stringMatching(/distinct|adjacent|overlapping/),
		});
		expect(result.overallDistinctiveness.score).toBeGreaterThanOrEqual(0);
		expect(result.overallDistinctiveness.score).toBeLessThanOrEqual(100);
	});
});

async function pullProfileFixture() {
	return {
		url: "https://example.com",
		source: "firecrawl" as const,
		...parseFirecrawlBranding(
			{
				brandName: "Example",
				logo: "data:image/svg+xml;base64,PHN2Zz4=",
				colors: { primary: "#635BFF", background: "#FFFFFF", textPrimary: "#0A2540" },
				fonts: ["Sohne"],
				personality: { tone: "professional", energy: "medium", targetAudience: "developers" },
				typography: { fontSizes: { h1: "48px", body: "16px" } },
				spacing: { baseUnit: 8 },
			},
			{ description: "Payments infrastructure for software companies." }
		),
	};
}
