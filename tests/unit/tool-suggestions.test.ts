import { beforeEach, describe, expect, it, vi } from "vitest";

const pullBrandProfileMock = vi.hoisted(() => vi.fn());
const requestAnthropicTextMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/brand", () => ({
	isBrandIngestionConfigured: vi.fn(() => true),
	pullBrandProfile: pullBrandProfileMock,
}));

vi.mock("@/lib/anthropic/messages", () => ({
	requestAnthropicText: requestAnthropicTextMock,
}));

import { suggestToolsForBrand } from "../../src/lib/tools/suggestions";

describe("tool suggestions service", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		process.env.ANTHROPIC_API_KEY = "test-key";
		pullBrandProfileMock.mockResolvedValue({
			url: "https://stripe.com",
			brandName: "Stripe",
			colors: { primary: "#635BFF" },
			fonts: ["Inter"],
			personality: {
				tone: "Developer-first",
				toneOfVoice: "Developer-first",
				energy: null,
				targetAudience: "Internet businesses",
				descriptors: ["payments", "finance"],
				notableSignals: [],
			},
			designSystem: {
				framework: null,
				componentLibrary: null,
				implementationStyle: "custom",
				notes: [],
			},
			images: {
				imageryStyle: "Minimal product UI",
				notes: [],
			},
			metadata: {
				title: "Stripe | Financial infrastructure to grow your revenue",
				description: "Payments, billing, and revenue automation for internet businesses.",
			},
			raw: {
				contextMarkdown: {
					markdown:
						"Stripe helps internet businesses accept payments, manage subscriptions, automate invoicing, and reduce fraud.",
				},
			},
		});
	});

	it("returns normalized brand-aware tool suggestions", async () => {
		requestAnthropicTextMock.mockResolvedValue({
			model: "claude-sonnet-4-6",
			text: JSON.stringify({
				industry: "Fintech / payments infrastructure",
				businessSummary:
					"Stripe sells payments, billing, invoicing, and revenue operations software for internet businesses.",
				suggestions: [
					{
						title: "Payment Fee Calculator",
						description: "Estimate processing costs across order volume, card mix, and international payments.",
						prompt:
							"Build a payment fee calculator for a fintech payments brand. Let users enter monthly transaction volume, average order value, card-present vs card-not-present mix, domestic vs international share, and refund rate. Show estimated processing fees, effective take rate, and plain-language optimization tips in a responsive single-screen tool.",
					},
					{
						title: "Subscription Revenue Forecaster",
						description: "Project MRR based on pricing, customer growth, churn, and expansion assumptions.",
						prompt:
							"Build a subscription revenue forecaster for a billing platform. Include inputs for starting customers, monthly new customers, average plan price, churn rate, annual plan share, and expansion revenue. Show projected MRR, ARR, retained revenue, and break-even milestones with clear numeric summaries and a compact chart-free results panel.",
					},
					{
						title: "Invoice Terms Cost Estimator",
						description: "Compare the cash-flow impact of different invoice due dates and payment delays.",
						prompt:
							"Build an invoice terms cost estimator for a revenue operations brand. Let the visitor compare net-15, net-30, and custom payment terms using invoice amount, expected payment delay, cost of capital, and monthly invoice count. Show days sales outstanding impact, estimated carrying cost, and a recommendation summary.",
					},
				],
			}),
		});

		const result = await suggestToolsForBrand("https://stripe.com");

		expect(result).toMatchObject({
			status: "success",
			requestedUrl: "https://stripe.com",
			brand: {
				siteUrl: "https://stripe.com",
				brandName: "Stripe",
				industry: "Fintech / payments infrastructure",
			},
			model: "claude-sonnet-4-6",
		});
		if (result.status === "success") {
			expect(result.suggestions).toHaveLength(3);
			expect(result.suggestions[0]).toMatchObject({
				title: "Payment Fee Calculator",
				description: expect.stringContaining("processing costs"),
				prompt: expect.stringContaining("monthly transaction volume"),
			});
		}
	});

	it("returns an error when Anthropic returns malformed JSON", async () => {
		requestAnthropicTextMock.mockResolvedValue({
			model: "claude-sonnet-4-6",
			text: "not-json",
		});

		const result = await suggestToolsForBrand("https://stripe.com");

		expect(result).toMatchObject({
			status: "error",
			requestedUrl: "https://stripe.com",
			message: "Anthropic suggestions returned a non-JSON response.",
		});
	});

	it("accepts JSON wrapped in markdown fences", async () => {
		requestAnthropicTextMock.mockResolvedValue({
			model: "claude-sonnet-4-6",
			text: [
				"```json",
				JSON.stringify({
					industry: "Fintech / payments infrastructure",
					businessSummary:
						"Stripe sells payments, billing, invoicing, and revenue operations software for internet businesses.",
					suggestions: [
						{
							title: "Payment Fee Calculator",
							description: "Estimate processing costs across order volume and payment mix.",
							prompt: "Build a payment fee calculator.",
						},
						{
							title: "Subscription Revenue Forecaster",
							description: "Project recurring revenue across growth and churn scenarios.",
							prompt: "Build a subscription revenue forecaster.",
						},
						{
							title: "Invoice Terms Cost Estimator",
							description: "Compare the cash-flow impact of payment-term options.",
							prompt: "Build an invoice terms cost estimator.",
						},
					],
				}),
				"```",
			].join("\n"),
		});

		const result = await suggestToolsForBrand("https://stripe.com");

		expect(result).toMatchObject({
			status: "success",
			requestedUrl: "https://stripe.com",
		});
	});
});
