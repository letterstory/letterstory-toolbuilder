import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	buildCompetitorContextForBrand,
	extractCompetitorSignalFromBrandProfile,
	parseCompetitorResponse,
	type CompetitorCandidate,
} from "../../src/lib/brand/competitor-context";
import type { BrandProfile } from "../../src/lib/brand";

function makeProfile(overrides: Partial<BrandProfile> = {}): BrandProfile {
	return {
		url: "https://example.com",
		source: "context.dev",
		brandName: "Example",
		colorScheme: "light",
		confidence: 0.9,
		primaryLogoUrl: "https://cdn.example.com/logo.svg",
		logoUrls: ["https://cdn.example.com/logo.svg"],
		colors: { primary: "#6B46FF", text: "#111827", background: "#FFFFFF" },
		fonts: ["Merriweather", "Inter"],
		typography: {
			primaryFont: "Merriweather",
			secondaryFont: "Inter",
			headingFont: "Merriweather",
			bodyFont: "Merriweather",
			fontFamilies: ["Merriweather", "Inter"],
			fontStacks: { body: ["Merriweather", "serif"] },
			scale: { h1: "48px", body: "16px" },
			hierarchy: "display-led",
			headingFontFace: null,
			bodyFontFace: {
				family: "Merriweather",
				google: true,
				category: "serif",
				files: {},
				fallbacks: ["serif"],
			},
			fontFaces: [],
		},
		spacing: {
			baseUnit: 8,
			borderRadius: "12px",
			radiusScale: ["12px"],
			rhythm: "balanced",
		},
		components: {
			primaryButton: null,
			secondaryButton: null,
			input: null,
			additional: {},
		},
		images: {
			logo: {
				url: "https://cdn.example.com/logo.svg",
				kind: "url",
				mode: "light",
				type: "logo",
				width: 280,
				height: 72,
				colors: ["#6B46FF"],
				alt: "Example logo",
				href: null,
				selectionReasoning: "Selected the full wordmark logo.",
				selectionConfidence: 0.9,
				canonicalDataUri: null,
				canonicalSourceUrl: "https://cdn.example.com/logo.svg",
				canonicalWarnings: [],
			},
			logoVariants: [],
			faviconUrl: null,
			ogImageUrl: null,
			gallery: [],
			imageryStyle: null,
			notes: [],
		},
		personality: {
			tone: "friendly",
			toneOfVoice: "friendly",
			energy: "medium",
			targetAudience: "restaurants",
			descriptors: [],
			notableSignals: [],
		},
		designSystem: {
			framework: null,
			componentLibrary: null,
			implementationStyle: "custom",
			notes: [],
		},
		metadata: {
			title: "Example",
			description: "Restaurant delivery platform",
		},
		raw: {},
		...overrides,
	};
}

describe("competitor context", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		process.env.ANTHROPIC_API_KEY = "test-key";
		process.env.CONTEXT_DEV_API_KEY = "context-test-key";
	});

	it("aggregates competitor norms and flags divergence without blocking unavailable competitors", async () => {
		const identifyCompetitors = vi.fn().mockResolvedValue({
			industry: "food delivery",
			competitors: [
				{ companyName: "Uber Eats", domain: "ubereats.com" },
				{ companyName: "Grubhub", domain: "grubhub.com" },
				{ companyName: "Postmates", domain: "postmates.com" },
			] satisfies CompetitorCandidate[],
		});
		const fetchCompetitorSignal = vi.fn(async (candidate: CompetitorCandidate) => {
			if (candidate.domain === "postmates.com") {
				throw new Error("timeout");
			}
			return {
				companyName: candidate.companyName,
				domain: candidate.domain,
				status: "analyzed" as const,
				brandName: candidate.companyName,
				primaryColor: candidate.domain === "grubhub.com" ? "#F63440" : "#06C167",
				primaryColorFamily: "warm" as const,
				fontFamily: "Inter",
				fontCategory: "sans-serif" as const,
				logoStyle: "wordmark" as const,
				notes: [],
			};
		});

		const context = await buildCompetitorContextForBrand(makeProfile(), {
			identifyCompetitors,
			fetchCompetitorSignal,
		});

		expect(context).toMatchObject({
			industry: "food delivery",
			signal: "diverges",
			industryNorms: {
				sampleSize: 2,
				primaryColorFamily: "warm",
				fontCategory: "sans-serif",
				logoStyle: "wordmark",
			},
		});
		expect(context?.notes).toEqual(
			expect.arrayContaining([
				expect.stringContaining("Target differs from competitor norms"),
				expect.stringContaining("Could not analyze Postmates"),
			])
		);
		expect(context?.competitors.find((competitor) => competitor.domain === "postmates.com")?.notes).toContain(
			"timeout"
		);
		expect(identifyCompetitors).toHaveBeenCalledTimes(1);
		expect(fetchCompetitorSignal).toHaveBeenCalledTimes(3);
	});

	it("flags suspicious competitor overlap when the target mirrors a competitor too closely", async () => {
		const profile = makeProfile({
			colors: { primary: "#FF5A5F" },
			fonts: ["Inter"],
			typography: {
				...makeProfile().typography,
				primaryFont: "Inter",
				bodyFont: "Inter",
				headingFont: "Inter",
				fontStacks: { body: ["Inter", "sans-serif"] },
				bodyFontFace: {
					family: "Inter",
					google: true,
					category: "sans-serif",
					files: {},
					fallbacks: ["sans-serif"],
				},
			},
		});

		const context = await buildCompetitorContextForBrand(profile, {
			identifyCompetitors: async () => ({
				industry: "travel marketplaces",
				competitors: [
					{ companyName: "Airbnb", domain: "airbnb.com" },
					{ companyName: "Vrbo", domain: "vrbo.com" },
				],
			}),
			fetchCompetitorSignal: async (candidate) => ({
				companyName: candidate.companyName,
				domain: candidate.domain,
				status: "analyzed",
				brandName: candidate.companyName,
				primaryColor: candidate.domain === "airbnb.com" ? "#FF5A5F" : "#0055AA",
				primaryColorFamily: candidate.domain === "airbnb.com" ? "warm" : "cool",
				fontFamily: "Inter",
				fontCategory: "sans-serif",
				logoStyle: "wordmark",
				notes: [],
			}),
		});

		expect(context).toMatchObject({
			signal: "suspicious_match",
		});
		expect(context?.notes.join(" ")).toContain("Airbnb");
	});

	it("extracts a lightweight brand signal from a Context.dev brand profile", () => {
		const signal = extractCompetitorSignalFromBrandProfile(
			{ companyName: "Uber Eats", domain: "ubereats.com" },
			makeProfile({
				brandName: "Uber Eats",
				colors: {
					primary: "#06C167",
					text: "#111111",
					background: "#FFFFFF",
				},
				fonts: ["Uber Move", "Arial"],
				typography: {
					...makeProfile().typography,
					primaryFont: "Uber Move",
					bodyFont: "Uber Move",
					fontStacks: { body: ["Uber Move", "Arial", "sans-serif"] },
					bodyFontFace: {
						family: "Uber Move",
						google: false,
						category: "sans-serif",
						files: {},
						fallbacks: ["Arial", "sans-serif"],
					},
				},
				images: {
					...makeProfile().images,
					logo: {
						...makeProfile().images.logo,
						alt: "Uber Eats wordmark",
						type: "logo",
						width: 260,
						height: 64,
					},
				},
			})
		);

		expect(signal).toMatchObject({
			brandName: "Uber Eats",
			primaryColor: "#06C167",
			primaryColorFamily: "cool",
			fontFamily: "Uber Move",
			fontCategory: "sans-serif",
			logoStyle: "wordmark",
		});
	});

	it("parses competitor JSON wrapped in markdown fences", () => {
		const parsed = parseCompetitorResponse(`\`\`\`json
{"industry":"food delivery","competitors":[{"companyName":"Uber Eats","domain":"ubereats.com"}]}
\`\`\``);

		expect(parsed).toEqual({
			industry: "food delivery",
			competitors: [{ companyName: "Uber Eats", domain: "ubereats.com" }],
		});
	});
});
