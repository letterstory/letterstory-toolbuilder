import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	buildPendingCompetitorContext,
	buildCompetitorContextForBrand,
	extractCompetitorSignalFromBrandProfile,
	finalizeCompetitorContextForTool,
	parseCompetitorResponse,
	type CompetitorCandidate,
} from "../../src/lib/brand/competitor-context";
import type { BrandProfile } from "../../src/lib/brand";
import type { GeneratedToolRecord } from "../../src/lib/generation/store";

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

	it("resolves pending competitor context asynchronously and persists the completed analysis", async () => {
		const tool: GeneratedToolRecord = {
			id: "tool-123",
			projectName: "Calc",
			prompt: "a calculator",
			siteUrl: "https://example.com",
			brandSnapshot: {
				brandName: "Example",
				colors: { primary: "#6B46FF" },
				fonts: ["Inter"],
				logoDataUri: null,
				competitorContext: buildPendingCompetitorContext("https://example.com"),
			},
			html: "<!doctype html><html><body>tool</body></html>",
			copy: null,
			brandFidelity: null,
			visualCongruence: null,
			model: "claude-sonnet-4-6",
			warnings: [],
			createdAt: "2024-01-01T00:00:00.000Z",
			updatedAt: "2024-01-01T00:00:00.000Z",
			version: 1,
			history: [],
		};
		const getTool = vi.fn().mockResolvedValue(tool);
		const loadBrandProfile = vi.fn().mockResolvedValue(makeProfile());
		const completedContext = {
			status: "completed",
			industry: "food delivery",
			signal: "matches",
			summary: "Competitor read for food delivery: warm palette. Extracted target broadly matches that pattern.",
			target: {
				primaryColor: "#6B46FF",
				primaryColorFamily: "cool",
				fontFamily: "Merriweather",
				fontCategory: "serif",
				logoStyle: "wordmark",
			},
			industryNorms: {
				sampleSize: 2,
				primaryColorFamily: "warm",
				fontCategory: "sans-serif",
				logoStyle: "wordmark",
			},
			competitors: [
				{
					companyName: "Uber Eats",
					domain: "ubereats.com",
					status: "analyzed",
					brandName: "Uber Eats",
					primaryColor: "#06C167",
					primaryColorFamily: "cool",
					fontFamily: "Uber Move",
					fontCategory: "sans-serif",
					logoStyle: "wordmark",
					notes: [],
				},
			],
			notes: [],
			analyzedAt: "2024-01-01T00:00:01.000Z",
		} as const;
		const buildContext = vi.fn().mockResolvedValue(completedContext);
		const saveContext = vi.fn().mockResolvedValue({
			...tool,
			brandSnapshot: {
				...tool.brandSnapshot!,
				competitorContext: completedContext,
			},
		});

		expect(tool.brandSnapshot?.competitorContext?.status).toBe("pending");

		await finalizeCompetitorContextForTool(
			{ toolId: "tool-123", expectedVersion: 1 },
			{ getTool, loadBrandProfile, buildContext, saveContext }
		);

		expect(loadBrandProfile).toHaveBeenCalledWith("https://example.com");
		expect(buildContext).toHaveBeenCalledTimes(1);
		expect(saveContext).toHaveBeenCalledWith(
			"tool-123",
			1,
			expect.objectContaining({
				status: "completed",
				signal: "matches",
				industry: "food delivery",
				competitors: [expect.objectContaining({ domain: "ubereats.com" })],
			})
		);
	});
});
