import { beforeEach, describe, expect, it, vi } from "vitest";

const generateToolMock = vi.hoisted(() => vi.fn());
const getGeneratedToolMock = vi.hoisted(() => vi.fn());
const listGeneratedToolsMock = vi.hoisted(() => vi.fn());
const rollbackGeneratedToolMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/generation", () => ({
	generateTool: generateToolMock,
}));

vi.mock("@/lib/generation/store", () => ({
	getGeneratedTool: getGeneratedToolMock,
	listGeneratedTools: listGeneratedToolsMock,
	rollbackGeneratedTool: rollbackGeneratedToolMock,
}));

import { buildEmbedSnippet } from "../../src/lib/embed/contract";
import { generateToolSurface, getGeneratedToolSurface, listGeneratedToolsSurface } from "../../src/lib/surfaces/tools";

const originalEnv = {
	TOOLBUILDER_BASE_URL: process.env.TOOLBUILDER_BASE_URL,
};

const baseTool = {
	id: "tool-123",
	projectName: "BMI Calculator",
	prompt: "Build a BMI calculator",
	siteUrl: "https://stripe.com",
	brandSnapshot: null,
	html: "<!doctype html><html><body>tool</body></html>",
	copy: { headline: "BMI", supportingCopy: "Try it." },
	brandFidelity: { verdict: "pass" as const, notes: "" },
	model: "claude-sonnet-4-6",
	warnings: [],
	createdAt: "2024-01-01T00:00:00.000Z",
	updatedAt: "2024-01-02T00:00:00.000Z",
	version: 2,
	history: [
		{
			version: 1,
			createdAt: "2024-01-01T00:00:00.000Z",
			projectName: "BMI Calculator",
			prompt: "v1",
			siteUrl: "https://stripe.com",
			brandSnapshot: null,
			html: "<!doctype html><html><body>old</body></html>",
			copy: { headline: "Old", supportingCopy: "Old copy." },
			brandFidelity: null,
			model: "claude-sonnet-4-6",
			warnings: [],
		},
	],
};

describe("tool surfaces embed snippet parity", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		if (originalEnv.TOOLBUILDER_BASE_URL === undefined) delete process.env.TOOLBUILDER_BASE_URL;
		else process.env.TOOLBUILDER_BASE_URL = originalEnv.TOOLBUILDER_BASE_URL;
	});

	it("derives get-generated-tool embedSnippet from forwarded request headers", async () => {
		getGeneratedToolMock.mockResolvedValue(baseTool);

		const response = await getGeneratedToolSurface(
			{ id: "tool-123" },
			{
				request: new Request("http://internal:3000/api/tools/tool-123", {
					headers: {
						"x-forwarded-proto": "https",
						"x-forwarded-host": "tools.example.com",
					},
				}),
			}
		);

		expect(response.statusCode).toBe(200);
		expect(response.body).toMatchObject({
			status: "success",
			tool: {
				id: "tool-123",
				embedSnippet: buildEmbedSnippet({
					origin: "https://tools.example.com",
					toolId: "tool-123",
					projectName: "BMI Calculator",
				}),
			},
		});
		if (response.body.status === "success") {
			expect(response.body.tool).not.toHaveProperty("html");
			expect(response.body.tool.history[0]).not.toHaveProperty("html");
		}
	});

	it("derives generate-tool embedSnippet from TOOLBUILDER_BASE_URL when no request is available", async () => {
		process.env.TOOLBUILDER_BASE_URL = "https://env.example.com";
		generateToolMock.mockResolvedValue({
			status: "success",
			tool: baseTool,
			diagnostics: {
				totalMs: 100,
				brandContextMs: 0,
				buildMs: 80,
				advisoryMs: 20,
				advisorySkipped: false,
				htmlAttempts: [{ attempt: 1, timeoutMs: 210000, durationMs: 80, outcome: "success" }],
			},
		});

		const response = await generateToolSurface({
			projectName: "BMI Calculator",
			siteUrl: "https://stripe.com",
			prompt: "Build a BMI calculator",
		});

		expect(response.statusCode).toBe(200);
		expect(response.body).toMatchObject({
			status: "success",
			tool: {
				id: "tool-123",
				embedSnippet: buildEmbedSnippet({
					origin: "https://env.example.com",
					toolId: "tool-123",
					projectName: "BMI Calculator",
				}),
			},
		});
	});

	it("rejects blank project names before calling generateTool", async () => {
		const response = await generateToolSurface({
			projectName: "   ",
			siteUrl: "https://stripe.com",
			prompt: "Build a BMI calculator",
		});

		expect(response.statusCode).toBe(400);
		expect(response.body).toMatchObject({
			status: "error",
			message: "Enter a tool name before generating this tool.",
		});
		expect(generateToolMock).not.toHaveBeenCalled();
	});

	it("keeps list-generated-tools summaries free of embedSnippet", async () => {
		listGeneratedToolsMock.mockResolvedValue([baseTool]);

		const response = await listGeneratedToolsSurface();

		expect(response.statusCode).toBe(200);
		expect(response.body.tools[0]).not.toHaveProperty("embedSnippet");
	});
});
