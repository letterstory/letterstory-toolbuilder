import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const isSafeHttpsUrlMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/net/ssrf", () => ({
	isSafeHttpsUrl: isSafeHttpsUrlMock,
}));

import {
	compareBrandAgainstCompetitors,
	isBrandIngestionConfigured,
	normalizeBrandSiteUrl,
	parseContextDevBranding,
	pullBrandProfile,
	validateBrandFidelity,
} from "../../src/lib/brand";

const originalFetch = global.fetch;
const originalEnv = {
	ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
	ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
	CONTEXT_DEV_API_KEY: process.env.CONTEXT_DEV_API_KEY,
	CONTEXT_DEV_BASE_URL: process.env.CONTEXT_DEV_BASE_URL,
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
						{ url: "https://cdn.example.com/icon.svg", type: "icon" },
						{ url: "https://cdn.example.com/logo.svg", type: "logo" },
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
		expect(parsed.primaryLogoUrl).toBe("https://cdn.example.com/logo.svg");
		expect(parsed.logoUrls).toEqual([
			"https://cdn.example.com/icon.svg",
			"https://cdn.example.com/logo.svg",
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
			url: "https://cdn.example.com/logo.svg",
			selectionReasoning: "Selected the first full logo asset returned by Context.dev.",
		});
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

		expect(parsed.fonts).toEqual(["Means Web", "Graphik Web"]);
		expect(parsed.typography.headingFont).toBe("Means Web");
		expect(parsed.typography.bodyFont).toBe("Graphik Web");
		expect(parsed.images.faviconUrl).toBe("https://mailchimp.com/favicon.ico");
		expect(parsed.images.ogImageUrl).toBe("https://mailchimp.com/og.png");
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

	it("compares a primary brand against explicit competitors", async () => {
		process.env.CONTEXT_DEV_API_KEY = "configured-key";
		const primaryProfile = parseContextDevBranding({
			brandResponse: {
				brand: {
					title: "Stripe",
					colors: [
						{ hex: "#635BFF", source: "site" },
						{ hex: "#0A2540", source: "site" },
					],
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
		});
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						brand: {
							title: "Adyen",
							colors: [
								{ hex: "#0ABF53", source: "site" },
								{ hex: "#00112C", source: "site" },
							],
						},
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						styleguide: {
							colors: { accent: "#0ABF53", background: "#FFFFFF", text: "#00112C" },
							typography: {
								headings: { h1: { fontFamily: "Inter", fontSize: "52px" } },
								p: { fontFamily: "Inter", fontSize: "18px" },
							},
							elementSpacing: { stack: "8px" },
						},
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ fonts: [{ font: "Inter", percent_words: 1 }] }), {
					status: 200,
				})
			)
			.mockResolvedValueOnce(new Response(JSON.stringify({ metadata: {} }), { status: 200 }))
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						brand: {
							title: "PayPal",
							colors: [
								{ hex: "#003087", source: "site" },
								{ hex: "#009CDE", source: "site" },
							],
						},
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						styleguide: {
							colors: { accent: "#003087", background: "#FFFFFF", text: "#1F2937" },
							typography: {
								headings: { h1: { fontFamily: "PayPalOpen", fontSize: "44px" } },
								p: { fontFamily: "Helvetica Neue", fontSize: "16px" },
							},
							elementSpacing: { stack: "6px" },
						},
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ fonts: [{ font: "PayPalOpen", percent_words: 0.7 }] }), {
					status: 200,
				})
			)
			.mockResolvedValueOnce(new Response(JSON.stringify({ metadata: {} }), { status: 200 }));
		global.fetch = fetchMock as typeof fetch;

		const result = await compareBrandAgainstCompetitors({
			primarySiteUrl: "stripe.com",
			primaryProfile: {
				...primaryProfile,
				url: "https://stripe.com",
				source: "context.dev",
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
		expect(result.overallVisualDistinctiveness).toBeNull();
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
					logos: [{ url: "data:image/svg+xml;base64,PHN2Zz4=", type: "logo" }],
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
