import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const isSafeHttpsUrlMock = vi.hoisted(() => vi.fn());
const captureFirecrawlScreenshotUrlMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/net/ssrf", () => ({
	isSafeHttpsUrl: isSafeHttpsUrlMock,
}));

vi.mock("@/lib/brand/firecrawl-screenshot", () => ({
	captureFirecrawlScreenshotUrl: captureFirecrawlScreenshotUrlMock,
}));

import {
	isBrandIngestionConfigured,
	normalizeBrandSiteUrl,
	parseContextDevBranding,
	pullBrandProfile,
	selectBrandLogoVariant,
	validateBrandFidelity,
} from "../../src/lib/brand";

const originalFetch = global.fetch;
const originalEnv = {
	ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
	ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
	CONTEXT_DEV_API_KEY: process.env.CONTEXT_DEV_API_KEY,
	CONTEXT_DEV_BASE_URL: process.env.CONTEXT_DEV_BASE_URL,
	FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY,
};

describe("brand service", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		isSafeHttpsUrlMock.mockReset();
		isSafeHttpsUrlMock.mockResolvedValue({ ok: true });
		captureFirecrawlScreenshotUrlMock.mockReset();
		captureFirecrawlScreenshotUrlMock.mockResolvedValue(null);
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

	it("parses Context.dev payloads into the existing BrandProfile shape", () => {
		const parsed = parseContextDevBranding({
			brandResponse: {
				brand: {
					title: "Example",
					description: "Payments infrastructure for software companies.",
					slogan: "Reliable, developer-first",
					colors: [
						{ hex: "#635BFF", source: "site" },
						{ hex: "#0A2540", source: "site" },
						{ hex: "#00D4FF", source: "logo" },
					],
					logos: [
						{
							url: "https://cdn.example.com/logo-light.svg",
							type: "logo",
							mode: "light",
							colors: [{ hex: "#635BFF" }],
							resolution: { width: 280, height: 72 },
						},
						{
							url: "https://cdn.example.com/logo-dark.svg",
							type: "logo",
							mode: "dark",
							colors: [{ hex: "#FFFFFF" }],
							resolution: { width: 280, height: 72 },
						},
						{
							url: "https://cdn.example.com/logo-opaque.svg",
							type: "logo",
							mode: "has_opaque_background",
							colors: [{ hex: "#0A2540" }],
							resolution: { width: 280, height: 72 },
						},
						{ url: "https://cdn.example.com/icon.svg", type: "icon", mode: "dark" },
					],
				},
			},
			styleguideResponse: {
				styleguide: {
					mode: "dark",
					colors: {
						accent: "#635BFF",
						background: "#0A2540",
						text: "#FFFFFF",
					},
					typography: {
						headings: {
							h1: { fontFamily: "__Sohne_123abc", fontSize: "48px", fontFallbacks: ["sans-serif"] },
						},
						p: { fontFamily: "__Inter_456def", fontSize: "16px", fontFallbacks: ["system-ui"] },
					},
					fontLinks: {
						__Sohne_123abc: {
							type: "custom",
							files: { "400": "https://cdn.example.com/fonts/sohne-400.woff2" },
						},
					},
					elementSpacing: {
						stack: "8px",
						section: "24px",
					},
					components: {
						button: {
							primary: {
								backgroundColor: "#635BFF",
								color: "#FFFFFF",
								borderRadius: "12px",
								boxShadow: "0 2px 8px rgba(0,0,0,.2)",
							},
							secondary: {
								backgroundColor: "#00D4FF",
								color: "#0A2540",
								borderRadius: "999px",
							},
						},
						card: {
							backgroundColor: "#102A4C",
							borderRadius: "16px",
						},
					},
				},
			},
			fontsResponse: {
				fonts: [
					{ font: "__Inter_456def", percent_words: 0.82 },
					{ font: "__Sohne_123abc", percent_words: 0.18 },
				],
				fontLinks: {
					__Inter_456def: {
						type: "google",
						category: "sans-serif",
						files: { "400": "https://fonts.gstatic.com/s/inter/v20/inter-400.woff2" },
					},
				},
			},
			markdownResponse: {
				url: "https://example.com",
				metadata: {
					title: "Example",
					description: "A calm, highly technical product site.",
				},
			},
		});

		expect(parsed.brandName).toBe("Example");
		expect(parsed.colorScheme).toBe("dark");
		expect(parsed.primaryLogoUrl).toBe("https://cdn.example.com/logo-dark.svg");
		expect(parsed.logoUrls).toEqual([
			"https://cdn.example.com/logo-light.svg",
			"https://cdn.example.com/logo-dark.svg",
			"https://cdn.example.com/logo-opaque.svg",
			"https://cdn.example.com/icon.svg",
		]);
		expect(parsed.colors).toMatchObject({
			primary: "#635BFF",
			background: "#0A2540",
			text: "#FFFFFF",
		});
		expect(parsed.fonts).toEqual(["Inter", "Sohne"]);
		expect(parsed.typography).toMatchObject({
			primaryFont: "Sohne",
			secondaryFont: "Inter",
			headingFont: "Sohne",
			bodyFont: "Inter",
			hierarchy: "display-led",
			scale: {
				h1: "48px",
				body: "16px",
			},
		});
		expect(parsed.typography.headingFontFace).toMatchObject({
			family: "Sohne",
			google: false,
			files: { "400": "https://cdn.example.com/fonts/sohne-400.woff2" },
			fallbacks: ["sans-serif"],
		});
		expect(parsed.typography.bodyFontFace).toMatchObject({
			family: "Inter",
			google: true,
			category: "sans-serif",
			files: { "400": "https://fonts.gstatic.com/s/inter/v20/inter-400.woff2" },
			fallbacks: ["system-ui"],
		});
		expect(parsed.typography.fontFaces).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ family: "Sohne" }),
				expect.objectContaining({ family: "Inter" }),
			])
		);
		expect(parsed.spacing).toEqual({
			baseUnit: 8,
			borderRadius: "12px",
			radiusScale: ["12px", "999px"],
			rhythm: "balanced",
		});
		expect(parsed.components.primaryButton).toMatchObject({
			background: "#635BFF",
			textColor: "#FFFFFF",
			borderRadius: "12px",
		});
		expect(parsed.components.additional.card).toMatchObject({
			background: "#102A4C",
			borderRadius: "16px",
		});
		expect(parsed.images.logo).toMatchObject({
			url: "https://cdn.example.com/logo-dark.svg",
			mode: "dark",
			type: "logo",
			width: 280,
			height: 72,
			colors: ["#FFFFFF"],
			selectionReasoning: "Selected the dark-mode logo asset returned by Context.dev.",
		});
		expect(parsed.images.logoVariants).toEqual([
			expect.objectContaining({
				url: "https://cdn.example.com/logo-light.svg",
				mode: "light",
				type: "logo",
			}),
			expect.objectContaining({
				url: "https://cdn.example.com/logo-dark.svg",
				mode: "dark",
				type: "logo",
			}),
			expect.objectContaining({
				url: "https://cdn.example.com/logo-opaque.svg",
				mode: "has_opaque_background",
				type: "logo",
			}),
			expect.objectContaining({
				url: "https://cdn.example.com/icon.svg",
				mode: "dark",
				type: "icon",
			}),
		]);
		expect(parsed.images.notes).toContain(
			"Opaque-background logo variants were preserved but skipped for the active selection when a transparent alternative was available."
		);
		expect(parsed.personality).toMatchObject({
			tone: "Reliable, developer-first",
			toneOfVoice: "Reliable, developer-first",
		});
		expect(parsed.metadata).toEqual({
			title: "Example",
			description: "A calm, highly technical product site.",
		});
		expect(parsed.raw).toMatchObject({
			contextBrand: expect.any(Object),
			contextStyleguide: expect.any(Object),
			contextFonts: expect.any(Object),
			contextMarkdown: expect.any(Object),
		});
	});

	it("keeps image links and component-level font families when top-level typography is sparse", () => {
		const parsed = parseContextDevBranding({
			brandResponse: {
				brand: {
					title: "Mailchimp",
					logos: [
						{
							url: "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http://www.w3.org/2000/svg%22%3E%3C/svg%3E",
							type: "logo",
						},
					],
					links: {
						favicon: "https://mailchimp.com/favicon.ico",
						"og:image": "https://mailchimp.com/og.png",
					},
				},
			},
			styleguideResponse: {
				styleguide: {
					components: {
						button: {
							primary: { fontFamily: "__GraphikWeb_123abc", backgroundColor: "#FFE01B" },
						},
						card: { fontFamily: "__MeansWeb_456def" },
						input: { fontFamily: "__GraphikWeb_123abc" },
					},
				},
			},
			fontsResponse: { fonts: [] },
			markdownResponse: null,
		});

		expect(parsed.fonts).toEqual(["Graphik Web", "Means Web"]);
		expect(parsed.typography.headingFont).toBe("Means Web");
		expect(parsed.typography.bodyFont).toBe("Graphik Web");
		expect(parsed.typography.fontFaces).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ family: "Means Web", google: false }),
				expect.objectContaining({ family: "Graphik Web", google: false }),
			])
		);
		expect(parsed.images.faviconUrl).toBe("https://mailchimp.com/favicon.ico");
		expect(parsed.images.ogImageUrl).toBe("https://mailchimp.com/og.png");
	});

	it("prefers a branded custom UI font over a generic paragraph fallback", () => {
		const parsed = parseContextDevBranding({
			brandResponse: {
				brand: {
					title: "DoorDash",
					colors: [{ hex: "#EB1700", source: "site" }],
				},
			},
			styleguideResponse: {
				styleguide: {
					typography: {
						headings: {
							h1: {
								fontFamily: "TTNormsProCond-Blk",
								fontFallbacks: ["Arial", "sans-serif"],
							},
						},
						p: {
							fontFamily: "Times New Roman",
							fontFallbacks: ["Times New Roman"],
						},
					},
					components: {
						button: {
							primary: {
								fontFamily: "DD Norms",
								fontFallbacks: ["Arial", "sans-serif"],
							},
						},
					},
					fontLinks: {
						"DD Norms": {
							type: "custom",
							files: { "400": "https://cdn.example.com/dd-norms.woff2" },
						},
						"TTNormsProCond-Blk": {
							type: "custom",
							files: { "900": "https://cdn.example.com/ttnorms.woff2" },
						},
					},
				},
			},
			fontsResponse: {
				fonts: [
					{
						font: "Times New Roman",
						fallbacks: ["Times New Roman"],
						percent_words: 99,
						percent_elements: 35,
					},
					{
						font: "DD Norms",
						fallbacks: ["Arial", "sans-serif"],
						percent_words: 1,
						percent_elements: 62,
					},
				],
			},
			markdownResponse: null,
		});

		expect(parsed.typography.bodyFont).toBe("DD Norms");
		expect(parsed.typography.bodyFontFace).toMatchObject({
			family: "DD Norms",
			files: { "400": "https://cdn.example.com/dd-norms.woff2" },
			fallbacks: ["Arial", "sans-serif"],
		});
		expect(parsed.fonts.slice(0, 2)).toEqual(["DD Norms", "TTNormsProCond-Blk"]);
		expect(parsed.typography.fontStacks.body).toEqual(["DD Norms", "Arial", "sans-serif"]);
	});

	it("prefers mode-matched transparent logos before opaque-background fallbacks", () => {
		expect(
			selectBrandLogoVariant(
				[
					{
						url: "https://cdn.example.com/logo-opaque.svg",
						kind: "url",
						mode: "has_opaque_background",
						type: "logo",
						width: 200,
						height: 80,
						colors: ["#111111"],
					},
					{
						url: "https://cdn.example.com/logo-dark.svg",
						kind: "url",
						mode: "dark",
						type: "logo",
						width: 200,
						height: 80,
						colors: ["#FFFFFF"],
					},
				],
				"dark"
			)?.url
		).toBe("https://cdn.example.com/logo-dark.svg");
	});

	it("rejects unsafe urls before calling Context.dev", async () => {
		process.env.CONTEXT_DEV_API_KEY = "configured-key";
		isSafeHttpsUrlMock.mockResolvedValue({ ok: false, reason: "blocked ip" });
		const fetchSpy = vi.fn();
		global.fetch = fetchSpy as typeof fetch;

		await expect(pullBrandProfile("https://127.0.0.1/admin")).rejects.toThrow(
			"Refusing to pull an unsafe URL: blocked ip"
		);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("gates live extraction on config presence", async () => {
		delete process.env.CONTEXT_DEV_API_KEY;

		expect(isBrandIngestionConfigured()).toBe(false);
		await expect(pullBrandProfile("https://example.com")).rejects.toThrow(
			"Brand extraction requires Context.dev (CONTEXT_DEV_API_KEY is unset)"
		);
	});

	it("pulls and parses brand profiles from Context.dev", async () => {
		process.env.CONTEXT_DEV_API_KEY = "configured-key";
		process.env.CONTEXT_DEV_BASE_URL = "https://api.context.dev/v1";
		global.fetch = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						brand: {
							title: "Stripe",
							description: "Financial infrastructure for the internet.",
							colors: [
								{ hex: "#635BFF", source: "site" },
								{ hex: "#0A2540", source: "site" },
							],
							logos: [{ url: "https://cdn.stripe.com/logo.svg", type: "logo" }],
						},
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						styleguide: {
							mode: "light",
							colors: { accent: "#635BFF", background: "#FFFFFF", text: "#0A2540" },
							typography: {
								headings: { h1: { fontFamily: "Sohne", fontSize: "48px" } },
								p: { fontFamily: "Inter", fontSize: "16px" },
							},
							elementSpacing: { stack: "8px" },
						},
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ fonts: [{ font: "Inter", percent_words: 0.8 }] }), {
					status: 200,
				})
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						url: "https://stripe.com",
						metadata: {
							title: "Stripe | Financial Infrastructure",
							description: "Financial infrastructure for the internet.",
						},
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(
				new Response(
					"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'><rect width='10' height='10' fill='#635BFF'/></svg>",
					{
						status: 200,
						headers: { "Content-Type": "image/svg+xml" },
					}
				)
			) as typeof fetch;

		const profile = await pullBrandProfile("stripe.com");

		expect(isSafeHttpsUrlMock).toHaveBeenCalledWith("https://stripe.com");
		const calls = vi.mocked(global.fetch).mock.calls;
		expect(String(calls[0]?.[0])).toBe("https://api.context.dev/v1/brand/retrieve");
		expect(String(calls[1]?.[0])).toContain("/web/styleguide?domain=stripe.com");
		expect(String(calls[2]?.[0])).toContain("/web/fonts?domain=stripe.com");
		expect(String(calls[3]?.[0])).toContain("/web/scrape/markdown?url=https%3A%2F%2Fstripe.com");
		expect(profile).toMatchObject({
			url: "https://stripe.com",
			source: "context.dev",
			brandName: "Stripe",
			primaryLogoUrl: "https://cdn.stripe.com/logo.svg",
			colors: {
				primary: "#635BFF",
				background: "#FFFFFF",
				text: "#0A2540",
			},
			fonts: ["Inter", "Sohne"],
			metadata: {
				title: "Stripe | Financial Infrastructure",
				description: "Financial infrastructure for the internet.",
			},
		});
		expect(profile.images.logo.canonicalDataUri).toMatch(/^data:image\/png;base64,/);
		expect(profile.images.logo.canonicalSourceUrl).toBe("https://cdn.stripe.com/logo.svg");
	});

	it("resolves a canonical normalized logo alongside the raw Context.dev pick", async () => {
		process.env.CONTEXT_DEV_API_KEY = "configured-key";
		process.env.CONTEXT_DEV_BASE_URL = "https://api.context.dev/v1";

		const logoPng = await sharp({
			create: {
				width: 256,
				height: 256,
				channels: 4,
				background: { r: 10, g: 20, b: 200, alpha: 1 },
			},
		})
			.png()
			.toBuffer();

		global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url === "https://cdn.stripe.com/logo.png") {
				return new Response(logoPng, {
					status: 200,
					headers: { "Content-Type": "image/png" },
				});
			}
			if (url.includes("/brand/retrieve")) {
				return new Response(
					JSON.stringify({
						brand: {
							title: "Stripe",
							colors: [{ hex: "#635BFF", source: "site" }],
							logos: [{ url: "https://cdn.stripe.com/logo.png", type: "logo" }],
						},
					}),
					{ status: 200 }
				);
			}
			if (url.includes("/web/styleguide")) {
				return new Response(JSON.stringify({ styleguide: { colors: { accent: "#635BFF" } } }), {
					status: 200,
				});
			}
			if (url.includes("/web/fonts")) {
				return new Response(JSON.stringify({ fonts: [{ font: "Inter", percent_words: 1 }] }), {
					status: 200,
				});
			}
			return new Response(JSON.stringify({ metadata: { title: "Stripe" } }), { status: 200 });
		}) as typeof fetch;

		const profile = await pullBrandProfile("stripe.com");

		expect(profile.images.logo.canonicalSourceUrl).toBe("https://cdn.stripe.com/logo.png");
		expect(profile.images.logo.canonicalDataUri).toMatch(/^data:image\/png;base64,/);
		expect(profile.images.logo.canonicalWarnings).toEqual([]);
		expect(profile.images.logo.url).toBe("https://cdn.stripe.com/logo.png");
	});

	it("validates brand fidelity with Context.dev markdown and Anthropic", async () => {
		process.env.CONTEXT_DEV_API_KEY = "configured-key";
		process.env.ANTHROPIC_API_KEY = "configured-key";
		process.env.ANTHROPIC_MODEL = "claude-sonnet-4-6";

		const profile = {
			...(await pullProfileFixture()),
			url: "https://stripe.com",
		};
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						url: "https://stripe.com",
						markdown: "# Stripe\n\nPayments infrastructure for the internet.",
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
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
											issue: "Selected logo is missing the primary wordmark treatment.",
											evidence:
												"Homepage copy references Stripe branding but the stored logo is too generic.",
											recommendation:
												"Prefer the full wordmark asset when multiple logos are available.",
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
					{ status: 200 }
				)
			);
		global.fetch = fetchMock as typeof fetch;

		const result = await validateBrandFidelity(profile, "stripe.com");

		expect(result.status).toBe("success");
		if (result.status !== "success") return;
		expect(result.referenceUrl).toBe("https://stripe.com");
		expect(result.assessment).toMatchObject({
			status: "warn",
			similarityScore: 71,
			confidence: "high",
			derivedSignals: {
				toneOfVoice: "confident, infrastructure-first",
				imageryStyle: "soft product gradients with crisp dashboard illustrations",
			},
		});
		expect(result.enrichedProfile.personality.toneOfVoice).toBe("confident, infrastructure-first");
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

	it("adds a screenshot-backed color gap when Firecrawl and vision disagree with Context.dev colors", async () => {
		process.env.CONTEXT_DEV_API_KEY = "configured-key";
		process.env.ANTHROPIC_API_KEY = "configured-key";
		process.env.FIRECRAWL_API_KEY = "configured-key";
		captureFirecrawlScreenshotUrlMock.mockResolvedValue("https://cdn.firecrawl.dev/google.png");

		const profile = {
			...(await pullProfileFixture()),
			url: "https://google.com",
			colors: {
				primary: "#ED943B",
				secondary: "#26A1B1",
				background: "#FFFFFF",
				text: "#1F1F1F",
			},
		};
		const screenshotBytes = await sharp({
			create: {
				width: 1200,
				height: 900,
				channels: 4,
				background: { r: 66, g: 133, b: 244, alpha: 1 },
			},
		})
			.png()
			.toBuffer();

		global.fetch = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						url: "https://google.com",
						markdown: "# Google\n\nSearch for anything.",
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(
				new Response(screenshotBytes, {
					status: 200,
					headers: { "Content-Type": "image/png" },
				})
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						content: [
							{
								type: "text",
								text: JSON.stringify({
									status: "pass",
									similarityScore: 88,
									confidence: "high",
									summary: "The extracted profile generally matches the site.",
									confirmedSignals: ["clean search-first layout"],
									gaps: [],
									derivedSignals: {
										toneOfVoice: "simple and helpful",
										imageryStyle: "minimal UI with product accents",
										typeHierarchy: "balanced",
										spacingRhythm: "airy",
										distinctiveTraits: ["wide white space"],
									},
									screenshotColorCheck: {
										observedColors: ["#4285F4", "#EA4335", "#FBBC05", "#34A853"],
										confidence: "high",
										summary: "The visible brand accents are Google's blue, red, yellow, and green.",
									},
								}),
							},
						],
					}),
					{ status: 200 }
				)
			) as typeof fetch;

		const result = await validateBrandFidelity(profile, "google.com");

		expect(result.status).toBe("success");
		if (result.status !== "success") return;
		expect(result.assessment.status).toBe("warn");
		expect(result.assessment.similarityScore).toBe(73);
		expect(result.assessment.summary).toContain("Screenshot color cross-check");
		expect(result.assessment.gaps).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					field: "colors",
					severity: "high",
					issue: expect.stringContaining("Screenshot cross-check"),
					evidence: expect.stringContaining("Context.dev colors: primary=#ED943B, secondary=#26A1B1"),
				}),
			])
		);

		const anthropicCall = vi.mocked(global.fetch).mock.calls[2];
		const anthropicBody = JSON.parse(
			String((anthropicCall?.[1] as RequestInit | undefined)?.body ?? "{}")
		) as {
			messages?: Array<{
				content?: Array<{ type?: string; source?: { type?: string; media_type?: string; data?: string } }>;
			}>;
		};
		expect(anthropicBody.messages?.[0]?.content?.[1]).toMatchObject({
			type: "image",
			source: {
				type: "base64",
				media_type: "image/png",
			},
		});
	});

	it("returns a reference_unavailable error when Context.dev has no usable page content", async () => {
		process.env.CONTEXT_DEV_API_KEY = "configured-key";
		process.env.ANTHROPIC_API_KEY = "configured-key";
		global.fetch = vi
			.fn()
			.mockResolvedValue(
				new Response(JSON.stringify({ url: "https://example.com", metadata: {} }), { status: 200 })
			) as typeof fetch;

		const result = await validateBrandFidelity(
			{
				...(await pullProfileFixture()),
				metadata: {},
			},
			"https://example.com"
		);

		expect(result).toMatchObject({
			status: "error",
			code: "reference_unavailable",
		});
	});

});

async function pullProfileFixture() {
	return {
		url: "https://example.com",
		source: "context.dev" as const,
		...parseContextDevBranding({
			brandResponse: {
				brand: {
					title: "Example",
					description: "Payments infrastructure for software companies.",
					slogan: "Professional",
					colors: [
						{ hex: "#635BFF", source: "site" },
						{ hex: "#FFFFFF", source: "site" },
						{ hex: "#0A2540", source: "site" },
					],
					logos: [{ url: "data:image/svg+xml;base64,PHN2Zz4=", type: "logo", mode: "light" }],
				},
			},
			styleguideResponse: {
				styleguide: {
					colors: { accent: "#635BFF", background: "#FFFFFF", text: "#0A2540" },
					typography: {
						headings: { h1: { fontFamily: "Sohne", fontSize: "48px" } },
						p: { fontFamily: "Inter", fontSize: "16px" },
					},
					elementSpacing: { stack: "8px" },
				},
			},
			fontsResponse: { fonts: [{ font: "Sohne", percent_words: 0.7 }] },
			markdownResponse: {
				metadata: { description: "Payments infrastructure for software companies." },
			},
		}),
	};
}
