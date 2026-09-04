import { beforeEach, describe, expect, it, vi } from "vitest";

const pullBrandProfileMock = vi.hoisted(() => vi.fn());
const isBrandIngestionConfiguredMock = vi.hoisted(() => vi.fn());
const saveGeneratedToolMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/brand", () => ({
	pullBrandProfile: pullBrandProfileMock,
	isBrandIngestionConfigured: isBrandIngestionConfiguredMock,
}));

vi.mock("@/lib/generation/store", () => ({
	saveGeneratedTool: saveGeneratedToolMock,
}));

import { generateTool, isToolGenerationConfigured } from "../../src/lib/generation/orchestrator";

const originalFetch = global.fetch;
const originalEnv = {
	ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
	ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
};

function mockAnthropicSuccess(mainText: string) {
	global.fetch = vi.fn().mockImplementation(async (_url, init) => {
		const parsedBody = JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}")) as { system?: string };
		const system = parsedBody.system ?? "";
		if (system.includes("VERDICT:")) {
			return new Response(JSON.stringify({ content: [{ type: "text", text: "VERDICT: pass\nNOTES:" }] }), {
				status: 200,
			});
		}
		if (system.includes("HEADLINE:")) {
			return new Response(
				JSON.stringify({ content: [{ type: "text", text: "HEADLINE: Test headline\nCOPY: Test copy." }] }),
				{ status: 200 }
			);
		}
		return new Response(JSON.stringify({ content: [{ type: "text", text: mainText }] }), { status: 200 });
	}) as unknown as typeof fetch;
}

/** Fallback response used for the advisory (copy/fidelity) calls in tests that hand-sequence the main generation call(s). */
const advisoryFallbackResponse = () =>
	new Response(JSON.stringify({ content: [{ type: "text", text: "HEADLINE: Test headline\nCOPY: Test copy." }] }), {
		status: 200,
	});

describe("generateTool", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		pullBrandProfileMock.mockReset();
		isBrandIngestionConfiguredMock.mockReset();
		saveGeneratedToolMock.mockReset();
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
		}));
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

	it("pulls brand context and includes a snapshot when siteUrl is given", async () => {
		isBrandIngestionConfiguredMock.mockReturnValue(true);
		pullBrandProfileMock.mockResolvedValue({
			brandName: "Stripe",
			colors: { primary: "#635bff" },
			fonts: ["Inter"],
			images: { logo: { canonicalDataUri: "data:image/png;base64,abc" } },
		});
		mockAnthropicSuccess("<!doctype html><html><body>hi</body></html>");

		const result = await generateTool({
			projectName: "Calc",
			siteUrl: "https://stripe.com",
			prompt: "a calculator",
		});

		expect(pullBrandProfileMock).toHaveBeenCalledWith("https://stripe.com");
		expect(result.status).toBe("success");
		if (result.status === "success") {
			expect(result.tool.brandSnapshot).toEqual({
				brandName: "Stripe",
				colors: { primary: "#635bff" },
				fonts: ["Inter"],
				logoDataUri: "data:image/png;base64,abc",
			});
			expect(result.tool.brandFidelity).toEqual({ verdict: "pass", notes: "" });
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
			const parsedBody = JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}")) as { system?: string };
			if ((parsedBody.system ?? "").includes("HEADLINE:")) {
				return new Response(JSON.stringify({ content: [{ type: "text", text: "I refuse to answer." }] }), {
					status: 200,
				});
			}
			return new Response(
				JSON.stringify({ content: [{ type: "text", text: "<!doctype html><html><body>hi</body></html>" }] }),
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
			images: { logo: { canonicalDataUri: null } },
		});
		global.fetch = vi.fn().mockImplementation(async (_url, init) => {
			const parsedBody = JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}")) as { system?: string };
			const system = parsedBody.system ?? "";
			if (system.includes("VERDICT:")) {
				return new Response(
					JSON.stringify({ content: [{ type: "text", text: "VERDICT: fail\nNOTES: uses a different color palette" }] }),
					{ status: 200 }
				);
			}
			if (system.includes("HEADLINE:")) {
				return new Response(
					JSON.stringify({ content: [{ type: "text", text: "HEADLINE: Test headline\nCOPY: Test copy." }] }),
					{ status: 200 }
				);
			}
			return new Response(
				JSON.stringify({ content: [{ type: "text", text: "<!doctype html><html><body>hi</body></html>" }] }),
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
			expect(result.tool.brandFidelity).toEqual({ verdict: "fail", notes: "uses a different color palette" });
			expect(result.tool.warnings.some((w) => w.includes("Brand fidelity check (fail)"))).toBe(true);
		}
	});

	it("continues without brand context (with a warning) when Firecrawl isn't configured", async () => {
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
			expect(result.tool.warnings.some((w) => w.includes("Firecrawl isn't configured"))).toBe(true);
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
				async () => new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429 })
			) as unknown as typeof fetch;

		const result = await generateTool({ projectName: "Calc", siteUrl: "", prompt: "a calculator" });

		expect(result.status).toBe("error");
		if (result.status === "error") {
			expect(result.message).toContain("rate limited");
		}
		expect(saveGeneratedToolMock).not.toHaveBeenCalled();
	});

	it("retries once and succeeds when the first Anthropic call times out/errors", async () => {
		const fetchMock = vi
			.fn()
			.mockRejectedValueOnce(new Error("The operation was aborted due to timeout"))
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

		// 2 attempts for the main HTML generation + 1 advisory supporting-copy call.
		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(result.status).toBe("success");
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
				new Response(JSON.stringify({ content: [{ type: "text", text: "Sorry, I can't help with that." }] }), {
					status: 200,
				})
		);
		global.fetch = fetchMock as unknown as typeof fetch;

		const result = await generateTool({ projectName: "Calc", siteUrl: "", prompt: "a calculator" });

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(result.status).toBe("error");
		expect(saveGeneratedToolMock).not.toHaveBeenCalled();
	});
});
