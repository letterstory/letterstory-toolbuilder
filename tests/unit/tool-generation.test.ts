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

function mockAnthropicSuccess(text: string) {
	global.fetch = vi.fn().mockResolvedValue(
		new Response(JSON.stringify({ content: [{ type: "text", text }] }), {
			status: 200,
			headers: { "content-type": "application/json" },
		})
	) as unknown as typeof fetch;
}

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
		global.fetch = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429 })
		) as unknown as typeof fetch;

		const result = await generateTool({ projectName: "Calc", siteUrl: "", prompt: "a calculator" });

		expect(result.status).toBe("error");
		if (result.status === "error") {
			expect(result.message).toContain("rate limited");
		}
		expect(saveGeneratedToolMock).not.toHaveBeenCalled();
	});

	it("returns an error result when Anthropic returns no text content at all", async () => {
		mockAnthropicSuccess("");

		const result = await generateTool({ projectName: "Calc", siteUrl: "", prompt: "a calculator" });

		expect(result.status).toBe("error");
		expect(saveGeneratedToolMock).not.toHaveBeenCalled();
	});
});
