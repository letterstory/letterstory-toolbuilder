import { beforeEach, describe, expect, it, vi } from "vitest";

const pullBrandProfileMock = vi.hoisted(() => vi.fn());
const isBrandIngestionConfiguredMock = vi.hoisted(() => vi.fn());
const buildCompetitorContextForBrandMock = vi.hoisted(() => vi.fn());
const saveGeneratedToolMock = vi.hoisted(() => vi.fn());
const getGeneratedToolMock = vi.hoisted(() => vi.fn());
const updateGeneratedToolMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/brand", () => ({
	pullBrandProfile: pullBrandProfileMock,
	isBrandIngestionConfigured: isBrandIngestionConfiguredMock,
}));

vi.mock("@/lib/brand/competitor-context", () => ({
	buildCompetitorContextForBrand: buildCompetitorContextForBrandMock,
}));

vi.mock("@/lib/generation/store", () => ({
	saveGeneratedTool: saveGeneratedToolMock,
	getGeneratedTool: getGeneratedToolMock,
	updateGeneratedTool: updateGeneratedToolMock,
}));

import {
	generateTool,
	isToolGenerationConfigured,
	MAX_ANTHROPIC_PIPELINE_WORST_CASE_MS,
	MAX_REVISION_ANTHROPIC_PIPELINE_WORST_CASE_MS,
	NGINX_GENERATION_ROUTE_BUDGET_MS,
	TOOL_GENERATION_TARGET_BUDGET_MS,
} from "../../src/lib/generation/orchestrator";

const originalFetch = global.fetch;
const originalEnv = {
	ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
	ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
};

function mockAnthropicSuccess(mainText: string) {
	global.fetch = vi.fn().mockImplementation(async (_url, init) => {
		const parsedBody = JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}")) as {
			system?: string;
		};
		const system = parsedBody.system ?? "";
		if (system.includes("VERDICT:")) {
			return new Response(
				JSON.stringify({ content: [{ type: "text", text: "VERDICT: pass\nNOTES:" }] }),
				{
					status: 200,
				}
			);
		}
		if (system.includes("HEADLINE:")) {
			return new Response(
				JSON.stringify({
					content: [{ type: "text", text: "HEADLINE: Test headline\nCOPY: Test copy." }],
				}),
				{ status: 200 }
			);
		}
		return new Response(JSON.stringify({ content: [{ type: "text", text: mainText }] }), {
			status: 200,
		});
	}) as unknown as typeof fetch;
}

/** Fallback response used for the advisory (copy/fidelity) calls in tests that hand-sequence the main generation call(s). */
const advisoryFallbackResponse = () =>
	new Response(
		JSON.stringify({
			content: [{ type: "text", text: "HEADLINE: Test headline\nCOPY: Test copy." }],
		}),
		{
			status: 200,
		}
	);

describe("generateTool", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		vi.spyOn(console, "info").mockImplementation(() => {});
		pullBrandProfileMock.mockReset();
		isBrandIngestionConfiguredMock.mockReset();
		buildCompetitorContextForBrandMock.mockReset();
		saveGeneratedToolMock.mockReset();
		getGeneratedToolMock.mockReset();
		updateGeneratedToolMock.mockReset();
		global.fetch = originalFetch;

		for (const [key, value] of Object.entries(originalEnv)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
		process.env.ANTHROPIC_API_KEY = "test-key";
		delete process.env.ANTHROPIC_MODEL;

		saveGeneratedToolMock.mockImplementation(async (input) => ({
			...input,
			id: "tool-123",
			createdAt: "2024-01-01T00:00:00.000Z",
			updatedAt: "2024-01-01T00:00:00.000Z",
			version: 1,
			history: [],
		}));
		updateGeneratedToolMock.mockImplementation(async (id, updates) => ({
			...updates,
			id,
			createdAt: "2024-01-01T00:00:00.000Z",
			updatedAt: "2024-01-02T00:00:00.000Z",
			version: 2,
			history: [],
		}));
		buildCompetitorContextForBrandMock.mockResolvedValue(null);
	});

	it("keeps the Anthropic pipeline budget under both the target and nginx caps", () => {
		expect(MAX_ANTHROPIC_PIPELINE_WORST_CASE_MS).toBeLessThanOrEqual(
			TOOL_GENERATION_TARGET_BUDGET_MS
		);
		expect(MAX_REVISION_ANTHROPIC_PIPELINE_WORST_CASE_MS).toBeLessThanOrEqual(
			TOOL_GENERATION_TARGET_BUDGET_MS
		);
		expect(MAX_ANTHROPIC_PIPELINE_WORST_CASE_MS).toBeLessThan(NGINX_GENERATION_ROUTE_BUDGET_MS);
		expect(MAX_REVISION_ANTHROPIC_PIPELINE_WORST_CASE_MS).toBeLessThan(
			NGINX_GENERATION_ROUTE_BUDGET_MS
		);
	});

	it("reports not_configured when ANTHROPIC_API_KEY is unset", async () => {
		delete process.env.ANTHROPIC_API_KEY;

		const result = await generateTool({ projectName: "Calc", siteUrl: "", prompt: "a calculator" });

		expect(result.status).toBe("not_configured");
		expect(isToolGenerationConfigured()).toBe(false);
	});

	it("rejects an empty prompt without calling Anthropic", async () => {
		const result = await generateTool({ projectName: "Calc", siteUrl: "", prompt: "   " });

		expect(result.status).toBe("error");
		if (result.status === "error") {
			expect(result.message).toMatch(/describe the tool/i);
		}
	});

	it("rejects an empty project name without calling Anthropic", async () => {
		const result = await generateTool({ projectName: "   ", siteUrl: "", prompt: "a calculator" });

		expect(result.status).toBe("error");
		if (result.status === "error") {
			expect(result.message).toMatch(/enter a tool name/i);
		}
		expect(global.fetch).toBe(originalFetch);
	});

	it("generates successfully without brand context when no siteUrl is given", async () => {
		mockAnthropicSuccess("<!doctype html><html><body>hi</body></html>");

		const result = await generateTool({ projectName: "Calc", siteUrl: "", prompt: "a calculator" });

		expect(pullBrandProfileMock).not.toHaveBeenCalled();
		expect(result.status).toBe("success");
		if (result.status === "success") {
			expect(result.tool.brandSnapshot).toBeNull();
			expect(result.tool.html).toContain("<!doctype html>");
			expect(result.tool.warnings).toEqual([]);
		}
	});

	it("pulls brand context without blocking generation on competitor analysis", async () => {
		isBrandIngestionConfiguredMock.mockReturnValue(true);
		pullBrandProfileMock.mockResolvedValue({
			brandName: "Stripe",
			colors: { primary: "#635bff" },
			fonts: ["Inter"],
			typography: { headingFont: "Inter", bodyFont: "Inter" },
			images: { logo: { canonicalDataUri: "data:image/png;base64,abc" } },
		});
		mockAnthropicSuccess("<!doctype html><html><body>hi</body></html>");

		const result = await generateTool({
			projectName: "Calc",
			siteUrl: "https://stripe.com",
			prompt: "a calculator",
		});

		expect(pullBrandProfileMock).toHaveBeenCalledWith("https://stripe.com");
		expect(buildCompetitorContextForBrandMock).not.toHaveBeenCalled();
		expect(result.status).toBe("success");
		if (result.status === "success") {
			expect(result.tool.brandSnapshot).toMatchObject({
				brandName: "Stripe",
				colors: { primary: "#635bff" },
				fonts: ["Inter"],
				headingFont: "Inter",
				bodyFont: "Inter",
				logoPolicy: "exact_asset",
				logoDataUri: "data:image/png;base64,abc",
			});
			expect(result.tool.brandSnapshot?.competitorContext ?? null).toBeNull();
			expect(result.tool.brandFidelity).toEqual({ verdict: "pass", notes: "" });
		}
	});

	it("encodes the Ramp UX rules into the main generation system prompt", async () => {
		mockAnthropicSuccess("<!doctype html><html><body>hi</body></html>");

		const result = await generateTool({
			projectName: "Invoice Late Fee Calculator",
			siteUrl: "",
			prompt: "estimate late fees for overdue invoices",
		});

		expect(result.status).toBe("success");
		const htmlCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(([, init]) => {
			const parsed = JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}")) as {
				system?: string;
			};
			return (
				!(parsed.system ?? "").includes("VERDICT:") && !(parsed.system ?? "").includes("HEADLINE:")
			);
		});
		const htmlCallBody = JSON.parse(
			String((htmlCall?.[1] as RequestInit | undefined)?.body ?? "{}")
		) as {
			system?: string;
		};

		expect(htmlCallBody.system).toContain(
			"Ramp UX rule 1 — contextualized results, never naked numbers"
		);
		expect(htmlCallBody.system).toContain("Total Deduction: $362.50");
		expect(htmlCallBody.system).toContain("100% business miles reimbursed");
		expect(htmlCallBody.system).toContain("formula note/disclaimer does NOT count");
		expect(htmlCallBody.system).toContain("data-letterstory-tool='true'");
		expect(htmlCallBody.system).toContain(
			"See how [Brand] [automates/handles/simplifies] [topic] for [X] [customers/businesses]"
		);
		expect(htmlCallBody.system).toContain("Business miles driven ($0.725 / mile)");
		expect(htmlCallBody.system).toContain(
			"Do NOT output a standalone helper line like `Typical range: 1%–3% per month`"
		);
		expect(htmlCallBody.system).toContain(
			"fixed-formula calculators must use exactly two action buttons in this order"
		);
		expect(htmlCallBody.system).toContain("Never replace `Clear` with a lone `Reset` button.");
		expect(htmlCallBody.system).toContain("Copy mission` + `Try again");
	});

	it("describes programmatic exact-logo injection in the main generation prompt", async () => {
		isBrandIngestionConfiguredMock.mockReturnValue(true);
		pullBrandProfileMock.mockResolvedValue({
			brandName: "Airbnb",
			colors: { primary: "#008489", accent: "#914669" },
			fonts: ["Airbnb Cereal VF", "Circular"],
			typography: { headingFont: "Circular", bodyFont: "Airbnb Cereal VF" },
			images: { logo: { canonicalDataUri: "data:image/png;base64,abc" } },
		});
		mockAnthropicSuccess("<!doctype html><html><body>hi</body></html>");

		const result = await generateTool({
			projectName: "Trip Cost Splitter",
			siteUrl: "https://airbnb.com",
			prompt: "split travel costs",
		});

		expect(result.status).toBe("success");
		const htmlCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(([, init]) => {
			const parsed = JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}")) as {
				system?: string;
			};
			return (
				!(parsed.system ?? "").includes("VERDICT:") && !(parsed.system ?? "").includes("HEADLINE:")
			);
		});
		const htmlCallBody = JSON.parse(
			String((htmlCall?.[1] as RequestInit | undefined)?.body ?? "{}")
		) as {
			system?: string;
			messages?: Array<{ content: string }>;
		};
		expect(htmlCallBody.system).toContain("treat them as authoritative");
		expect(htmlCallBody.system).toContain(
			"render that asset instead of typing a substitute wordmark"
		);
		expect(htmlCallBody.messages?.[0]?.content).toContain(
			"Use the supplied colors as the header, CTA, and highlight anchors. Ignore any conflicting legacy palette."
		);
		expect(htmlCallBody.messages?.[0]?.content).toContain(
			"Typography usage: Use Airbnb Cereal VF for the brand name text treatment, labels, inputs, buttons, and the main product UI."
		);
		expect(htmlCallBody.messages?.[0]?.content).toContain(
			"Optional display font: Circular. Use it sparingly for large editorial-style headings only"
		);
		expect(htmlCallBody.messages?.[0]?.content).toContain(
			"A real logo asset exists and will be injected into the header programmatically after generation."
		);
		expect(htmlCallBody.messages?.[0]?.content).not.toContain("data:image/png;base64,abc");
	});

	it("does not inline raw logo data uris into the main prompt when canonical normalization is unavailable", async () => {
		isBrandIngestionConfiguredMock.mockReturnValue(true);
		pullBrandProfileMock.mockResolvedValue({
			brandName: "Mailchimp",
			colors: { primary: "#FFE01B", accent: "#692340" },
			fonts: ["Graphik Web", "Means Web"],
			typography: { headingFont: "Means Web", bodyFont: "Graphik Web" },
			images: {
				logo: {
					canonicalDataUri: null,
					url: "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http://www.w3.org/2000/svg%22%3E%3C/svg%3E",
				},
			},
		});
		mockAnthropicSuccess("<!doctype html><html><body>hi</body></html>");

		const result = await generateTool({
			projectName: "Email Open Rate Calculator",
			siteUrl: "https://mailchimp.com",
			prompt: "an email open rate calculator",
		});

		expect(result.status).toBe("success");
		const htmlCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(([, init]) => {
			const parsed = JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}")) as {
				system?: string;
			};
			return (
				!(parsed.system ?? "").includes("VERDICT:") && !(parsed.system ?? "").includes("HEADLINE:")
			);
		});
		const htmlCallBody = JSON.parse(
			String((htmlCall?.[1] as RequestInit | undefined)?.body ?? "{}")
		) as {
			messages?: Array<{ content: string }>;
		};
		expect(htmlCallBody.messages?.[0]?.content).toContain(
			"A real logo asset exists and will be injected into the header programmatically after generation."
		);
		expect(htmlCallBody.messages?.[0]?.content).not.toContain("data:image/svg+xml;utf8,");
	});

	it("keeps large canonical logos out of the prompt because header injection is deterministic", async () => {
		isBrandIngestionConfiguredMock.mockReturnValue(true);
		pullBrandProfileMock.mockResolvedValue({
			brandName: "Mailchimp",
			colors: { primary: "#FFE01B", accent: "#692340" },
			fonts: ["Graphik Web", "Means Web"],
			typography: { headingFont: "Means Web", bodyFont: "Graphik Web" },
			images: {
				logo: {
					canonicalDataUri: `data:image/png;base64,${"a".repeat(25000)}`,
					url: null,
				},
			},
		});
		mockAnthropicSuccess("<!doctype html><html><body>hi</body></html>");

		const result = await generateTool({
			projectName: "Email Open Rate Calculator",
			siteUrl: "https://mailchimp.com",
			prompt: "an email open rate calculator",
		});

		expect(result.status).toBe("success");
		const htmlCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(([, init]) => {
			const parsed = JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}")) as {
				system?: string;
			};
			return (
				!(parsed.system ?? "").includes("VERDICT:") && !(parsed.system ?? "").includes("HEADLINE:")
			);
		});
		const htmlCallBody = JSON.parse(
			String((htmlCall?.[1] as RequestInit | undefined)?.body ?? "{}")
		) as {
			messages?: Array<{ content: string }>;
		};
		expect(htmlCallBody.messages?.[0]?.content).toContain(
			"A real logo asset exists and will be injected into the header programmatically after generation."
		);
		expect(htmlCallBody.messages?.[0]?.content).not.toContain(
			`data:image/png;base64,${"a".repeat(25000)}`
		);
	});

	it("keeps oversized inline logos out of the main HTML generation prompt", async () => {
		isBrandIngestionConfiguredMock.mockReturnValue(true);
		pullBrandProfileMock.mockResolvedValue({
			brandName: "Gymshark",
			colors: { primary: "#111111", accent: "#ffffff" },
			fonts: ["Inter", "Arial"],
			typography: { headingFont: "Inter", bodyFont: "Inter" },
			images: { logo: { canonicalDataUri: `data:image/png;base64,${"a".repeat(50000)}` } },
		});
		mockAnthropicSuccess("<!doctype html><html><body>hi</body></html>");

		const result = await generateTool({
			projectName: "BMI Calculator",
			siteUrl: "https://gymshark.com",
			prompt: "a calculator",
		});

		expect(result.status).toBe("success");
		const htmlCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(([, init]) => {
			const parsed = JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}")) as {
				system?: string;
			};
			return (
				!(parsed.system ?? "").includes("VERDICT:") && !(parsed.system ?? "").includes("HEADLINE:")
			);
		});
		const htmlCallBody = JSON.parse(
			String((htmlCall?.[1] as RequestInit | undefined)?.body ?? "{}")
		) as {
			messages?: Array<{ content: string }>;
		};
		expect(htmlCallBody.messages?.[0]?.content).toContain(
			"A real logo asset exists and will be injected into the header programmatically after generation."
		);
		expect(htmlCallBody.messages?.[0]?.content).not.toContain(
			`data:image/png;base64,${"a".repeat(50000)}`
		);
		expect(htmlCallBody.messages?.[0]?.content).toContain("do not invent, redraw, trace, or type");
	});

	it("falls back to text-only branding when only icon assets are available", async () => {
		isBrandIngestionConfiguredMock.mockReturnValue(true);
		pullBrandProfileMock.mockResolvedValue({
			brandName: "DoorDash",
			colors: { primary: "#EB1700", text: "#000000" },
			fonts: ["DD Norms", "TTNormsProCond-Blk"],
			typography: { headingFont: "TTNormsProCond-Blk", bodyFont: "DD Norms" },
			images: {
				logo: {
					type: "icon",
					canonicalDataUri: "data:image/png;base64,icon-asset",
					url: null,
				},
				logoVariants: [],
			},
		});
		mockAnthropicSuccess("<!doctype html><html><body>hi</body></html>");

		const result = await generateTool({
			projectName: "Delivery Fee Calculator",
			siteUrl: "https://doordash.com",
			prompt: "a calculator",
		});

		expect(result.status).toBe("success");
		if (result.status === "success") {
			expect(result.tool.brandSnapshot).toMatchObject({
				logoPolicy: "text_only",
				logoDataUri: null,
			});
		}

		const htmlCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(([, init]) => {
			const parsed = JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}")) as {
				system?: string;
			};
			return (
				!(parsed.system ?? "").includes("VERDICT:") && !(parsed.system ?? "").includes("HEADLINE:")
			);
		});
		const htmlCallBody = JSON.parse(
			String((htmlCall?.[1] as RequestInit | undefined)?.body ?? "{}")
		) as {
			messages?: Array<{ content: string }>;
		};
		expect(htmlCallBody.messages?.[0]?.content).not.toContain("icon-asset");
		expect(htmlCallBody.messages?.[0]?.content).toContain("clean text-only brand-name treatment");
	});

	it("repairs invented branding when a supplied logo asset is ignored", async () => {
		isBrandIngestionConfiguredMock.mockReturnValue(true);
		pullBrandProfileMock.mockResolvedValue({
			brandName: "Mailchimp",
			colors: { primary: "#FFE01B", text: "#000000" },
			fonts: ["Graphik Web", "Means Web"],
			typography: { headingFont: "Means Web", bodyFont: "Graphik Web" },
			images: {
				logo: {
					type: "logo",
					canonicalDataUri: "data:image/png;base64,abc",
					url: null,
				},
				logoVariants: [],
			},
		});
		global.fetch = vi.fn().mockImplementation(async (_url, init) => {
			const parsedBody = JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}")) as {
				system?: string;
				messages?: Array<{ content: string }>;
			};
			const system = parsedBody.system ?? "";
			const content = parsedBody.messages?.[0]?.content ?? "";
			if (system.includes("VERDICT:")) {
				return new Response(
					JSON.stringify({ content: [{ type: "text", text: "VERDICT: pass\nNOTES:" }] }),
					{ status: 200 }
				);
			}
			if (system.includes("HEADLINE:")) {
				return new Response(
					JSON.stringify({
						content: [{ type: "text", text: "HEADLINE: Test headline\nCOPY: Test copy." }],
					}),
					{ status: 200 }
				);
			}
			if (content.includes("Brand fidelity correction only.")) {
				return new Response(
					JSON.stringify({
						content: [
							{
								type: "text",
								text: '<!doctype html><html><head><style>body{font-family:"Graphik Web",Arial,sans-serif;}</style></head><body><header><img alt="Mailchimp logo" src="data:image/png;base64,abc"></header></body></html>',
							},
						],
					}),
					{ status: 200 }
				);
			}
			return new Response(
				JSON.stringify({
					content: [
						{
							type: "text",
							text: '<!doctype html><html><body><header><div class="brand-mark"><svg></svg></div><div>Mailchimp</div></header></body></html>',
						},
					],
				}),
				{ status: 200 }
			);
		}) as unknown as typeof fetch;

		const result = await generateTool({
			projectName: "Email Open Rate Calculator",
			siteUrl: "https://mailchimp.com",
			prompt: "a calculator",
		});

		expect(result.status).toBe("success");
		if (result.status === "success") {
			expect(result.tool.html).toContain('src="data:image/png;base64,abc"');
			expect(result.tool.warnings).toEqual([]);
		}
		expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(4);
	});

	it("applies deterministic exact-logo corrections when the repair pass fails", async () => {
		isBrandIngestionConfiguredMock.mockReturnValue(true);
		pullBrandProfileMock.mockResolvedValue({
			brandName: "Mailchimp",
			colors: { primary: "#FFE01B", text: "#000000" },
			fonts: ["Graphik Web", "Means Web"],
			typography: { headingFont: "Means Web", bodyFont: "Graphik Web" },
			images: {
				logo: {
					type: "logo",
					canonicalDataUri: "data:image/png;base64,abc",
					url: null,
				},
				logoVariants: [],
			},
		});
		global.fetch = vi.fn().mockImplementation(async (_url, init) => {
			const parsedBody = JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}")) as {
				system?: string;
				messages?: Array<{ content: string }>;
			};
			const system = parsedBody.system ?? "";
			const content = parsedBody.messages?.[0]?.content ?? "";
			if (system.includes("VERDICT:")) {
				return new Response(
					JSON.stringify({ content: [{ type: "text", text: "VERDICT: pass\nNOTES:" }] }),
					{ status: 200 }
				);
			}
			if (system.includes("HEADLINE:")) {
				return advisoryFallbackResponse();
			}
			if (content.includes("Brand fidelity correction only.")) {
				return new Response(JSON.stringify({ content: [{ type: "text", text: "<html>bad" }] }), {
					status: 200,
				});
			}
			return new Response(
				JSON.stringify({
					content: [
						{
							type: "text",
							text: '<!doctype html><html><head><style>body{color:#111;}header{background:#040404;color:#fff;}</style></head><body><header><div class="brand-mark"><svg></svg></div><div>Mailchimp</div></header><main></main></body></html>',
						},
					],
				}),
				{ status: 200 }
			);
		}) as unknown as typeof fetch;

		const result = await generateTool({
			projectName: "Email Open Rate Calculator",
			siteUrl: "https://mailchimp.com",
			prompt: "a calculator",
		});

		expect(result.status).toBe("success");
		if (result.status === "success") {
			expect(result.tool.html).toContain('class="ls-brand-verified-header"');
			expect(result.tool.html).toContain("header{background:#040404;color:#fff;}");
			expect(result.tool.html).toContain('src="data:image/png;base64,abc"');
			expect(result.tool.html).toContain(
				".ls-brand-lockup--exact_asset,\n.ls-brand-lockup--text_only,\n.ls-brand-verified-copy {\n  background: #FFFFFF;\n  padding: 0.5rem 0.75rem;\n  border-radius: 0.75rem;"
			);
			expect(result.tool.html).not.toContain("Graphik Web");
			expect(result.tool.html).not.toContain("Iowan Old Style");
			expect(result.tool.html).not.toContain("Times New Roman");
			expect(result.tool.html).toContain(
				'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
			);
			expect(
				result.tool.warnings.some((warning) =>
					warning.includes("Brand repair returned invalid HTML")
				)
			).toBe(true);
		}
	});

	it("applies deterministic text-only branding and body-font overrides for icon-only brands", async () => {
		isBrandIngestionConfiguredMock.mockReturnValue(true);
		pullBrandProfileMock.mockResolvedValue({
			brandName: "DoorDash",
			colors: { primary: "#EB1700", secondary: "#EC9C84", text: "#000000" },
			fonts: ["DD Norms", "TTNormsProCond-Blk", "Arial"],
			typography: { headingFont: "TTNormsProCond-Blk", bodyFont: "DD Norms" },
			images: {
				logo: {
					type: "icon",
					canonicalDataUri: "data:image/png;base64,icon-asset",
					url: null,
				},
				logoVariants: [],
			},
		});
		global.fetch = vi.fn().mockImplementation(async (_url, init) => {
			const parsedBody = JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}")) as {
				system?: string;
			};
			const system = parsedBody.system ?? "";
			if (system.includes("VERDICT:")) {
				return new Response(
					JSON.stringify({ content: [{ type: "text", text: "VERDICT: pass\nNOTES:" }] }),
					{ status: 200 }
				);
			}
			if (system.includes("HEADLINE:")) {
				return advisoryFallbackResponse();
			}
			return new Response(
				JSON.stringify({
					content: [
						{
							type: "text",
							text: '<!doctype html><html><head><style>body{font-family:"Times New Roman",serif;}</style></head><body><header><div class="brand-mark"><svg></svg></div><h1>DoorDash</h1></header><main></main></body></html>',
						},
					],
				}),
				{ status: 200 }
			);
		}) as unknown as typeof fetch;

		const result = await generateTool({
			projectName: "Delivery Fee Calculator",
			siteUrl: "https://doordash.com",
			prompt: "a calculator",
		});

		expect(result.status).toBe("success");
		if (result.status === "success") {
			expect(result.tool.brandSnapshot).toMatchObject({
				logoPolicy: "text_only",
				bodyFont: "DD Norms",
			});
			expect(result.tool.html).toContain('class="ls-brand-lockup__wordmark"');
			expect(result.tool.html).toContain("DoorDash");
			expect(result.tool.html).not.toContain("brand-mark");
			expect(result.tool.html).not.toContain("DD Norms");
			expect(result.tool.html).not.toContain("Times New Roman");
			expect(result.tool.html).toContain("--ls-brand-color-secondary: #EC9C84;");
			expect(result.tool.html).toContain(
				'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
			);
		}
	});

	it("embeds google-loadable brand fonts and removes orphaned custom names from final html", async () => {
		isBrandIngestionConfiguredMock.mockReturnValue(true);
		pullBrandProfileMock.mockResolvedValue({
			brandName: "Spotify",
			colors: { primary: "#1DB954", text: "#191414" },
			fonts: ["Inter", "Spotify Mix"],
			typography: {
				headingFont: "Inter",
				bodyFont: "Inter",
				headingFontFace: {
					family: "Inter",
					google: true,
					category: "sans-serif",
					files: { "400": "https://fonts.gstatic.com/s/inter/v20/inter-400.woff2" },
					fallbacks: ["sans-serif"],
				},
				bodyFontFace: {
					family: "Inter",
					google: true,
					category: "sans-serif",
					files: { "400": "https://fonts.gstatic.com/s/inter/v20/inter-400.woff2" },
					fallbacks: ["sans-serif"],
				},
			},
			images: {
				logo: {
					type: "logo",
					canonicalDataUri: "data:image/png;base64,spotify-logo",
					url: null,
				},
			},
		});
		global.fetch = vi.fn().mockImplementation(async (url, init) => {
			if (typeof url === "string" && url.includes("fonts.gstatic.com")) {
				return new Response(Buffer.from("fake-font"), {
					status: 200,
					headers: { "content-type": "font/woff2" },
				});
			}

			const parsedBody = JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}")) as {
				system?: string;
			};
			const system = parsedBody.system ?? "";
			if (system.includes("VERDICT:")) {
				return new Response(
					JSON.stringify({ content: [{ type: "text", text: "VERDICT: pass\nNOTES:" }] }),
					{ status: 200 }
				);
			}
			if (system.includes("HEADLINE:")) {
				return advisoryFallbackResponse();
			}
			return new Response(
				JSON.stringify({
					content: [
						{
							type: "text",
							text: '<!doctype html><html><head><style>body{font-family:"Spotify Mix","Times New Roman",serif;}h1{font-family:"Spotify Mix",serif;}</style></head><body><header><div class="brand-mark"><svg></svg></div><h1>Spotify</h1></header><main></main></body></html>',
						},
					],
				}),
				{ status: 200 }
			);
		}) as unknown as typeof fetch;

		const result = await generateTool({
			projectName: "Playlist ROI Calculator",
			siteUrl: "https://spotify.com",
			prompt: "a calculator",
		});

		expect(result.status).toBe("success");
		if (result.status === "success") {
			expect(result.tool.html).toContain("@font-face");
			expect(result.tool.html).toContain("font-family: Inter");
			expect(result.tool.html).toContain("data:font/woff2;base64");
			expect(result.tool.html).not.toContain("Spotify Mix");
			expect(result.tool.html).not.toContain("Times New Roman");
			expect(result.tool.html).toContain('src="data:image/png;base64,spotify-logo"');
		}
	});

	it("replaces non-embedded serif heading fallbacks with sans-serif for non-serif brands", async () => {
		isBrandIngestionConfiguredMock.mockReturnValue(true);
		pullBrandProfileMock.mockResolvedValue({
			brandName: "Mailchimp",
			colors: { primary: "#FFE01B", text: "#000000" },
			fonts: ["Graphik Web", "Means Web"],
			typography: {
				headingFont: "Means Web",
				bodyFont: "Graphik Web",
				headingFontFace: {
					family: "Means Web",
					google: false,
					category: "serif",
					files: {},
					fallbacks: ["serif"],
				},
				bodyFontFace: {
					family: "Graphik Web",
					google: false,
					category: "sans-serif",
					files: {},
					fallbacks: ["sans-serif"],
				},
			},
			images: {
				logo: {
					type: "logo",
					canonicalDataUri: "data:image/png;base64,abc",
					url: null,
				},
				logoVariants: [],
			},
		});
		global.fetch = vi.fn().mockImplementation(async (_url, init) => {
			const parsedBody = JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}")) as {
				system?: string;
			};
			const system = parsedBody.system ?? "";
			if (system.includes("VERDICT:")) {
				return new Response(
					JSON.stringify({ content: [{ type: "text", text: "VERDICT: pass\nNOTES:" }] }),
					{ status: 200 }
				);
			}
			if (system.includes("HEADLINE:")) {
				return advisoryFallbackResponse();
			}
			return new Response(
				JSON.stringify({
					content: [
						{
							type: "text",
							text: '<!doctype html><html><head><style>.brand-label{font-family:"Iowan Old Style", Georgia, Cambria, "Times New Roman", Times, serif;}h1{font-family:"Iowan Old Style", Georgia, Cambria, "Times New Roman", Times, serif !important;}body{font-family:"Graphik Web", Arial, sans-serif;}</style></head><body><header><div>Mailchimp</div></header><main><h1>Hello</h1></main></body></html>',
						},
					],
				}),
				{ status: 200 }
			);
		}) as unknown as typeof fetch;

		const result = await generateTool({
			projectName: "Email ROI Calculator",
			siteUrl: "https://mailchimp.com",
			prompt: "a calculator",
		});

		expect(result.status).toBe("success");
		if (result.status === "success") {
			expect(result.tool.html).not.toContain("Iowan Old Style");
			expect(result.tool.html).not.toContain("Times New Roman");
			expect(result.tool.html).toContain(
				'h1, h2, h3, h4, h5, h6, .ls-brand-lockup__wordmark {\n  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;'
			);
		}
	});

	it("keeps serif-safe heading fallbacks for editorial brands while leaving body ui sans-serif", async () => {
		isBrandIngestionConfiguredMock.mockReturnValue(true);
		pullBrandProfileMock.mockResolvedValue({
			brandName: "The New York Times",
			colors: { primary: "#567B95", text: "#363636" },
			fonts: ["Times New Roman", "nyt-franklin"],
			typography: {
				headingFont: "Times New Roman",
				bodyFont: "nyt-franklin",
				headingFontFace: {
					family: "Times New Roman",
					google: false,
					category: "serif",
					files: {},
					fallbacks: ["Times New Roman", "serif"],
				},
				bodyFontFace: {
					family: "nyt-franklin",
					google: false,
					category: "sans-serif",
					files: {},
					fallbacks: ["Arial", "sans-serif"],
				},
			},
			images: {
				logo: {
					type: "logo",
					canonicalDataUri: "data:image/png;base64,nyt",
					url: null,
				},
				logoVariants: [],
			},
		});
		global.fetch = vi.fn().mockImplementation(async (_url, init) => {
			const parsedBody = JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}")) as {
				system?: string;
			};
			const system = parsedBody.system ?? "";
			if (system.includes("VERDICT:")) {
				return new Response(
					JSON.stringify({ content: [{ type: "text", text: "VERDICT: pass\nNOTES:" }] }),
					{ status: 200 }
				);
			}
			if (system.includes("HEADLINE:")) {
				return advisoryFallbackResponse();
			}
			return new Response(
				JSON.stringify({
					content: [
						{
							type: "text",
							text: '<!doctype html><html><head><style>body{font-family:"nyt-franklin",Arial,sans-serif;}h1{font-family:"Times New Roman",serif;}</style></head><body><header><div>The New York Times</div></header><main><h1>Hello</h1></main></body></html>',
						},
					],
				}),
				{ status: 200 }
			);
		}) as unknown as typeof fetch;

		const result = await generateTool({
			projectName: "Subscription Lift Calculator",
			siteUrl: "https://nytimes.com",
			prompt: "a calculator",
		});

		expect(result.status).toBe("success");
		if (result.status === "success") {
			expect(result.tool.html).not.toContain("nyt-franklin");
			expect(result.tool.html).toContain(
				'body, input, button, select, textarea {\n  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;'
			);
			expect(result.tool.html).toContain(
				'h1, h2, h3, h4, h5, h6, .ls-brand-lockup__wordmark {\n  font-family: "Iowan Old Style", Georgia, Cambria, "Times New Roman", Times, serif !important;'
			);
		}
	});

	it("defaults ambiguous unknown brand fonts to sans-serif fallbacks", async () => {
		isBrandIngestionConfiguredMock.mockReturnValue(true);
		pullBrandProfileMock.mockResolvedValue({
			brandName: "Acme",
			colors: { primary: "#222222", text: "#111111" },
			fonts: ["Acme Display", "Acme Text"],
			typography: {
				headingFont: "Acme Display",
				bodyFont: "Acme Text",
				headingFontFace: {
					family: "Acme Display",
					google: false,
					category: null,
					files: {},
					fallbacks: [],
				},
				bodyFontFace: {
					family: "Acme Text",
					google: false,
					category: null,
					files: {},
					fallbacks: [],
				},
			},
			images: {
				logo: {
					type: "text",
					canonicalDataUri: null,
					url: null,
				},
				logoVariants: [],
			},
		});
		global.fetch = vi.fn().mockImplementation(async (_url, init) => {
			const parsedBody = JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}")) as {
				system?: string;
			};
			const system = parsedBody.system ?? "";
			if (system.includes("VERDICT:")) {
				return new Response(
					JSON.stringify({ content: [{ type: "text", text: "VERDICT: pass\nNOTES:" }] }),
					{ status: 200 }
				);
			}
			if (system.includes("HEADLINE:")) {
				return advisoryFallbackResponse();
			}
			return new Response(
				JSON.stringify({
					content: [
						{
							type: "text",
							text: '<!doctype html><html><head><style>body{font-family:"Acme Text",serif;}h1{font-family:"Acme Display",serif;}</style></head><body><header><div>Acme</div></header><main><h1>Hello</h1></main></body></html>',
						},
					],
				}),
				{ status: 200 }
			);
		}) as unknown as typeof fetch;

		const result = await generateTool({
			projectName: "Acme Tool",
			siteUrl: "https://example.com",
			prompt: "a calculator",
		});

		expect(result.status).toBe("success");
		if (result.status === "success") {
			expect(result.tool.html).not.toContain("Acme Text");
			expect(result.tool.html).not.toContain("Acme Display");
			expect(result.tool.html).toContain(
				'body, input, button, select, textarea {\n  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;'
			);
			expect(result.tool.html).toContain(
				'h1, h2, h3, h4, h5, h6, .ls-brand-lockup__wordmark {\n  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;'
			);
		}
	});

	it("generates supporting headline/copy alongside the tool", async () => {
		mockAnthropicSuccess("<!doctype html><html><body>hi</body></html>");

		const result = await generateTool({ projectName: "Calc", siteUrl: "", prompt: "a calculator" });

		expect(result.status).toBe("success");
		if (result.status === "success") {
			expect(result.tool.copy).toEqual({ headline: "Test headline", supportingCopy: "Test copy." });
			expect(result.tool.brandFidelity).toBeNull();
		}
	});

	it("adds a warning but still succeeds when supporting-copy generation is unparseable", async () => {
		global.fetch = vi.fn().mockImplementation(async (_url, init) => {
			const parsedBody = JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}")) as {
				system?: string;
			};
			if ((parsedBody.system ?? "").includes("HEADLINE:")) {
				return new Response(
					JSON.stringify({ content: [{ type: "text", text: "I refuse to answer." }] }),
					{
						status: 200,
					}
				);
			}
			return new Response(
				JSON.stringify({
					content: [{ type: "text", text: "<!doctype html><html><body>hi</body></html>" }],
				}),
				{ status: 200 }
			);
		}) as unknown as typeof fetch;

		const result = await generateTool({ projectName: "Calc", siteUrl: "", prompt: "a calculator" });

		expect(result.status).toBe("success");
		if (result.status === "success") {
			expect(result.tool.copy).toBeNull();
			expect(result.tool.warnings.some((w) => w.includes("supporting headline/copy"))).toBe(true);
		}
	});

	it("adds a warning when the brand fidelity check returns a warn/fail verdict", async () => {
		isBrandIngestionConfiguredMock.mockReturnValue(true);
		pullBrandProfileMock.mockResolvedValue({
			brandName: "Stripe",
			colors: { primary: "#635bff" },
			fonts: ["Inter"],
			typography: { headingFont: "Inter", bodyFont: "Inter" },
			images: { logo: { canonicalDataUri: null } },
		});
		global.fetch = vi.fn().mockImplementation(async (_url, init) => {
			const parsedBody = JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}")) as {
				system?: string;
			};
			const system = parsedBody.system ?? "";
			if (system.includes("VERDICT:")) {
				return new Response(
					JSON.stringify({
						content: [
							{ type: "text", text: "VERDICT: fail\nNOTES: uses a different color palette" },
						],
					}),
					{ status: 200 }
				);
			}
			if (system.includes("HEADLINE:")) {
				return new Response(
					JSON.stringify({
						content: [{ type: "text", text: "HEADLINE: Test headline\nCOPY: Test copy." }],
					}),
					{ status: 200 }
				);
			}
			return new Response(
				JSON.stringify({
					content: [{ type: "text", text: "<!doctype html><html><body>hi</body></html>" }],
				}),
				{ status: 200 }
			);
		}) as unknown as typeof fetch;

		const result = await generateTool({
			projectName: "Calc",
			siteUrl: "https://stripe.com",
			prompt: "a calculator",
		});

		expect(result.status).toBe("success");
		if (result.status === "success") {
			expect(result.tool.brandFidelity).toEqual({
				verdict: "fail",
				notes: "uses a different color palette",
			});
			expect(result.tool.warnings.some((w) => w.includes("Brand fidelity check (fail)"))).toBe(
				true
			);
		}
	});

	it("continues without brand context (with a warning) when Context.dev isn't configured", async () => {
		isBrandIngestionConfiguredMock.mockReturnValue(false);
		mockAnthropicSuccess("<!doctype html><html><body>hi</body></html>");

		const result = await generateTool({
			projectName: "Calc",
			siteUrl: "https://stripe.com",
			prompt: "a calculator",
		});

		expect(pullBrandProfileMock).not.toHaveBeenCalled();
		expect(result.status).toBe("success");
		if (result.status === "success") {
			expect(result.tool.brandSnapshot).toBeNull();
			expect(result.tool.warnings.some((w) => w.includes("Context.dev isn't configured"))).toBe(
				true
			);
		}
	});

	it("continues without brand context (with a warning) when brand ingestion throws", async () => {
		isBrandIngestionConfiguredMock.mockReturnValue(true);
		pullBrandProfileMock.mockRejectedValue(new Error("timeout"));
		mockAnthropicSuccess("<!doctype html><html><body>hi</body></html>");

		const result = await generateTool({
			projectName: "Calc",
			siteUrl: "https://stripe.com",
			prompt: "a calculator",
		});

		expect(result.status).toBe("success");
		if (result.status === "success") {
			expect(result.tool.warnings.some((w) => w.includes("Brand ingestion failed"))).toBe(true);
		}
	});

	it("returns an error result when Anthropic responds with a non-ok status", async () => {
		global.fetch = vi
			.fn()
			.mockImplementation(
				async () =>
					new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429 })
			) as unknown as typeof fetch;

		const result = await generateTool({ projectName: "Calc", siteUrl: "", prompt: "a calculator" });

		expect(result.status).toBe("error");
		if (result.status === "error") {
			expect(result.message).toContain("rate limited");
		}
		expect(saveGeneratedToolMock).not.toHaveBeenCalled();
	});

	it("returns a friendlier timeout message without retrying a second full HTML build", async () => {
		const fetchMock = vi
			.fn()
			.mockRejectedValueOnce(new Error("The operation was aborted due to timeout"));
		global.fetch = fetchMock as unknown as typeof fetch;

		const result = await generateTool({ projectName: "Calc", siteUrl: "", prompt: "a calculator" });

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(result.status).toBe("error");
		if (result.status === "error") {
			expect(result.message).toMatch(/took too long/i);
		}
	});

	it("retries once and succeeds when the first Anthropic call gets a transient 5xx", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ error: { message: "overloaded" } }), { status: 529 })
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						content: [{ type: "text", text: "<!doctype html><html><body>ok</body></html>" }],
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValue(advisoryFallbackResponse());
		global.fetch = fetchMock as unknown as typeof fetch;

		const result = await generateTool({ projectName: "Calc", siteUrl: "", prompt: "a calculator" });

		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(result.status).toBe("success");
	});

	it("uses the expected timeout budgets for the main and advisory Claude calls", async () => {
		const timeoutSpy = vi
			.spyOn(AbortSignal, "timeout")
			.mockImplementation(
				((ms: number) =>
					({ timeoutMs: ms }) as unknown as AbortSignal) as typeof AbortSignal.timeout
			);
		mockAnthropicSuccess("<!doctype html><html><body>hi</body></html>");

		const result = await generateTool({ projectName: "Calc", siteUrl: "", prompt: "a calculator" });

		expect(result.status).toBe("success");
		expect(timeoutSpy).toHaveBeenNthCalledWith(1, 210000);
		expect(timeoutSpy).toHaveBeenNthCalledWith(2, 15000);
		expect(timeoutSpy).toHaveBeenCalledTimes(2);
	});

	it("returns an error result when Anthropic returns no text content at all", async () => {
		mockAnthropicSuccess("");

		const result = await generateTool({ projectName: "Calc", siteUrl: "", prompt: "a calculator" });

		expect(result.status).toBe("error");
		expect(saveGeneratedToolMock).not.toHaveBeenCalled();
	});

	it("retries once and succeeds when the first attempt returns truncated HTML", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						content: [{ type: "text", text: "<!doctype html><html><body>truncated mid-" }],
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						content: [{ type: "text", text: "<!doctype html><html><body>complete</body></html>" }],
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValue(advisoryFallbackResponse());
		global.fetch = fetchMock as unknown as typeof fetch;

		const result = await generateTool({ projectName: "Calc", siteUrl: "", prompt: "a calculator" });

		// 2 attempts for the main HTML generation + 1 advisory supporting-copy call.
		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(result.status).toBe("success");
		if (result.status === "success") {
			expect(result.tool.html).toContain("complete</body></html>");
		}
	});

	it("gives up and returns an error after the retry also produces invalid HTML", async () => {
		const fetchMock = vi.fn().mockImplementation(
			async () =>
				new Response(
					JSON.stringify({ content: [{ type: "text", text: "Sorry, I can't help with that." }] }),
					{
						status: 200,
					}
				)
		);
		global.fetch = fetchMock as unknown as typeof fetch;

		const result = await generateTool({ projectName: "Calc", siteUrl: "", prompt: "a calculator" });

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(result.status).toBe("error");
		expect(saveGeneratedToolMock).not.toHaveBeenCalled();
	});
});

describe("generateTool — revisions (toolId set)", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		vi.spyOn(console, "info").mockImplementation(() => {});
		pullBrandProfileMock.mockReset();
		isBrandIngestionConfiguredMock.mockReset();
		saveGeneratedToolMock.mockReset();
		getGeneratedToolMock.mockReset();
		updateGeneratedToolMock.mockReset();
		global.fetch = originalFetch;
		process.env.ANTHROPIC_API_KEY = "test-key";
		delete process.env.ANTHROPIC_MODEL;

		updateGeneratedToolMock.mockImplementation(async (id, updates) => ({
			...updates,
			id,
			createdAt: "2024-01-01T00:00:00.000Z",
			updatedAt: "2024-01-02T00:00:00.000Z",
			version: 2,
			history: [],
		}));
	});

	const existingTool = {
		id: "tool-123",
		projectName: "Mileage Calculator",
		prompt: "original prompt",
		siteUrl: null,
		brandSnapshot: null,
		html: "<!doctype html><html><body>original</body></html>",
		copy: { headline: "Old headline", supportingCopy: "Old copy." },
		brandFidelity: null,
		model: "claude-sonnet-4-6",
		warnings: [],
		createdAt: "2024-01-01T00:00:00.000Z",
		updatedAt: "2024-01-01T00:00:00.000Z",
		version: 1,
		history: [],
	};

	it("errors when the tool to revise can't be found", async () => {
		getGeneratedToolMock.mockResolvedValue(null);

		const result = await generateTool({
			projectName: "Mileage Calculator",
			siteUrl: "",
			prompt: "add a dark mode toggle",
			toolId: "missing-id",
		});

		expect(result.status).toBe("error");
		if (result.status === "error") {
			expect(result.message).toMatch(/could not find the tool/i);
		}
		expect(updateGeneratedToolMock).not.toHaveBeenCalled();
	});

	it("passes the existing HTML back to Claude and revises in place, keeping the same id", async () => {
		getGeneratedToolMock.mockResolvedValue(existingTool);
		mockAnthropicSuccess("<!doctype html><html><body>revised</body></html>");

		const result = await generateTool({
			projectName: "Mileage Calculator",
			siteUrl: "",
			prompt: "add a dark mode toggle",
			toolId: "tool-123",
		});

		expect(result.status).toBe("success");
		if (result.status === "success") {
			expect(result.tool.id).toBe("tool-123");
			expect(result.tool.version).toBe(2);
			expect(result.tool.html).toContain("revised");
		}

		// The main-HTML call should have included the existing document + the
		// new prompt as revision instructions, not a from-scratch brief.
		const htmlCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(([, init]) => {
			const parsed = JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}")) as {
				system?: string;
			};
			return (
				!(parsed.system ?? "").includes("VERDICT:") && !(parsed.system ?? "").includes("HEADLINE:")
			);
		});
		const htmlCallBody = JSON.parse(
			String((htmlCall?.[1] as RequestInit | undefined)?.body ?? "{}")
		) as {
			system?: string;
			messages?: Array<{ content: string }>;
		};
		expect(htmlCallBody.system).toMatch(/REVISING an existing tool/i);
		expect(htmlCallBody.messages?.[0]?.content).toContain("original</body>");
		expect(htmlCallBody.messages?.[0]?.content).toContain("add a dark mode toggle");

		expect(updateGeneratedToolMock).toHaveBeenCalledWith(
			"tool-123",
			expect.objectContaining({ html: expect.stringContaining("revised") })
		);
	});

	it("does not re-pull brand context on a revision when the site url is unchanged", async () => {
		getGeneratedToolMock.mockResolvedValue({
			...existingTool,
			siteUrl: "https://stripe.com",
			brandSnapshot: {
				brandName: "Stripe",
				colors: { primary: "#635bff" },
				fonts: ["Inter"],
				logoDataUri: null,
			},
		});
		mockAnthropicSuccess("<!doctype html><html><body>revised</body></html>");

		const result = await generateTool({
			projectName: "Mileage Calculator",
			siteUrl: "https://stripe.com",
			prompt: "add a dark mode toggle",
			toolId: "tool-123",
		});

		expect(pullBrandProfileMock).not.toHaveBeenCalled();
		expect(result.status).toBe("success");
	});

	it("re-pulls brand context on a revision when the site url changes", async () => {
		getGeneratedToolMock.mockResolvedValue(existingTool);
		isBrandIngestionConfiguredMock.mockReturnValue(true);
		pullBrandProfileMock.mockResolvedValue({
			brandName: "Linear",
			colors: { primary: "#5e6ad2" },
			fonts: ["Inter"],
			typography: { headingFont: "Inter", bodyFont: "Inter" },
			images: { logo: { canonicalDataUri: null } },
		});
		mockAnthropicSuccess("<!doctype html><html><body>revised</body></html>");

		const result = await generateTool({
			projectName: "Mileage Calculator",
			siteUrl: "https://linear.app",
			prompt: "match Linear's branding",
			toolId: "tool-123",
		});

		expect(pullBrandProfileMock).toHaveBeenCalledWith("https://linear.app");
		expect(result.status).toBe("success");
	});

	it("keeps the previous copy when the revision's copy generation is unparseable", async () => {
		getGeneratedToolMock.mockResolvedValue(existingTool);
		global.fetch = vi.fn().mockImplementation(async (_url, init) => {
			const parsedBody = JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}")) as {
				system?: string;
			};
			if ((parsedBody.system ?? "").includes("HEADLINE:")) {
				return new Response(JSON.stringify({ content: [{ type: "text", text: "nope" }] }), {
					status: 200,
				});
			}
			return new Response(
				JSON.stringify({
					content: [{ type: "text", text: "<!doctype html><html><body>revised</body></html>" }],
				}),
				{ status: 200 }
			);
		}) as unknown as typeof fetch;

		const result = await generateTool({
			projectName: "Mileage Calculator",
			siteUrl: "",
			prompt: "add a dark mode toggle",
			toolId: "tool-123",
		});

		expect(result.status).toBe("success");
		expect(updateGeneratedToolMock).toHaveBeenCalledWith(
			"tool-123",
			expect.objectContaining({ copy: existingTool.copy })
		);
	});

	it("gives revisions a longer retry budget after an invalid first HTML response", async () => {
		getGeneratedToolMock.mockResolvedValue(existingTool);
		const timeoutSpy = vi
			.spyOn(AbortSignal, "timeout")
			.mockImplementation(
				((ms: number) =>
					({ timeoutMs: ms }) as unknown as AbortSignal) as typeof AbortSignal.timeout
			);
		global.fetch = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						content: [{ type: "text", text: "<!doctype html><html><body>cut off" }],
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						content: [{ type: "text", text: "<!doctype html><html><body>revised</body></html>" }],
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(advisoryFallbackResponse()) as unknown as typeof fetch;

		const result = await generateTool({
			projectName: "Mileage Calculator",
			siteUrl: "",
			prompt: "add a dark mode toggle",
			toolId: "tool-123",
		});

		expect(result.status).toBe("success");
		expect(timeoutSpy).toHaveBeenNthCalledWith(1, 210000);
		expect(timeoutSpy).toHaveBeenNthCalledWith(2, 70000);
		expect(timeoutSpy).toHaveBeenNthCalledWith(3, 15000);
		expect(timeoutSpy).toHaveBeenCalledTimes(3);
		expect(updateGeneratedToolMock).toHaveBeenCalledWith(
			"tool-123",
			expect.objectContaining({ html: expect.stringContaining("revised") })
		);
	});
});
