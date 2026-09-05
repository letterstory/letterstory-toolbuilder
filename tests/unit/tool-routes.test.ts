import { beforeEach, describe, expect, it, vi } from "vitest";

const generateToolSurfaceMock = vi.hoisted(() => vi.fn());
const generateToolRateLimitedMock = vi.hoisted(() => vi.fn());
const getGeneratedToolSurfaceMock = vi.hoisted(() => vi.fn());
const listGeneratedToolsSurfaceMock = vi.hoisted(() => vi.fn());
const rollbackGeneratedToolSurfaceMock = vi.hoisted(() => vi.fn());
const getGeneratedToolMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const getClientIpMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/security/rate-limit", () => ({
	checkRateLimit: checkRateLimitMock,
	getClientIp: getClientIpMock,
}));

vi.mock("@/lib/surfaces/tools", () => ({
	generateToolSurface: generateToolSurfaceMock,
	generateToolRateLimited: generateToolRateLimitedMock,
	getGeneratedToolSurface: getGeneratedToolSurfaceMock,
	listGeneratedToolsSurface: listGeneratedToolsSurfaceMock,
	rollbackGeneratedToolSurface: rollbackGeneratedToolSurfaceMock,
}));

vi.mock("@/lib/generation/store", () => ({
	getGeneratedTool: getGeneratedToolMock,
}));

import { POST as generatePost } from "../../src/app/api/tools/generate/route";
import { GET as toolsListGet } from "../../src/app/api/tools/route";
import { GET as toolDetailGet } from "../../src/app/api/tools/[id]/route";
import { POST as toolRollbackPost } from "../../src/app/api/tools/[id]/rollback/route";
import { GET as toolGet } from "../../src/app/t/[id]/route";

beforeEach(() => {
	checkRateLimitMock.mockReset();
	getClientIpMock.mockReset();
	generateToolSurfaceMock.mockReset();
	generateToolRateLimitedMock.mockReset();
	getGeneratedToolSurfaceMock.mockReset();
	listGeneratedToolsSurfaceMock.mockReset();
	rollbackGeneratedToolSurfaceMock.mockReset();
	getGeneratedToolMock.mockReset();

	getClientIpMock.mockReturnValue("203.0.113.10");
	checkRateLimitMock.mockResolvedValue({
		allowed: true,
		limit: 10,
		remaining: 9,
		retryAfterSeconds: 0,
	});
});

describe("POST /api/tools/generate", () => {
	it("returns 400 when prompt is missing or blank", async () => {
		generateToolSurfaceMock.mockResolvedValueOnce({
			statusCode: 400,
			body: { status: "error", message: "Describe the tool you want generated." },
		});

		const response = await generatePost(
			new Request("http://localhost/api/tools/generate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ prompt: "   " }),
			})
		);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({ status: "error" });
	});

	it("returns 429 with Retry-After when the caller is rate limited", async () => {
		checkRateLimitMock.mockResolvedValueOnce({
			allowed: false,
			limit: 10,
			remaining: 0,
			retryAfterSeconds: 42,
		});
		generateToolRateLimitedMock.mockReturnValueOnce({
			statusCode: 429,
			headers: { "Retry-After": "42" },
			body: { status: "error", message: "Too many tool generation requests — please wait a bit and try again." },
		});

		const response = await generatePost(
			new Request("http://localhost/api/tools/generate", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-forwarded-for": "198.51.100.20",
				},
				body: JSON.stringify({ prompt: "a calculator" }),
			})
		);

		expect(getClientIpMock).toHaveBeenCalled();
		expect(response.status).toBe(429);
		expect(response.headers.get("Retry-After")).toBe("42");
		await expect(response.json()).resolves.toMatchObject({
			status: "error",
			message: expect.stringMatching(/too many tool generation requests/i),
		});
		expect(generateToolSurfaceMock).not.toHaveBeenCalled();
	});

	it("returns 400 for an unparseable body", async () => {
		generateToolSurfaceMock.mockResolvedValueOnce({
			statusCode: 400,
			body: { status: "error", message: "Describe the tool you want generated." },
		});

		const response = await generatePost(
			new Request("http://localhost/api/tools/generate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "not json",
			})
		);

		expect(response.status).toBe(400);
	});

	it("returns 400 with the orchestrator error shape when generation is not configured", async () => {
		generateToolSurfaceMock.mockResolvedValueOnce({
			statusCode: 400,
			body: {
				status: "not_configured",
				message: "Set ANTHROPIC_API_KEY before generating tools.",
			},
		});

		const response = await generatePost(
			new Request("http://localhost/api/tools/generate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ prompt: "a calculator" }),
			})
		);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			status: "not_configured",
			message: "Set ANTHROPIC_API_KEY before generating tools.",
		});
	});

	it("proxies generate surface output including headers on success", async () => {
		generateToolSurfaceMock.mockResolvedValueOnce({
			statusCode: 200,
			body: {
				status: "success",
				tool: {
					id: "abc",
					projectName: "Calc",
					embedSnippet: "<iframe src=\"https://example.com/t/abc\"></iframe>",
				},
			},
			headers: {
				"Server-Timing": "total;dur=1234, brand;dur=56, build;dur=1100, advisory;dur=78",
				"X-Tool-Generation-Attempts": "1:success:1100/210000",
			},
		});

		const response = await generatePost(
			new Request("http://localhost/api/tools/generate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					projectName: "Calc",
					siteUrl: "https://stripe.com",
					prompt: "a calculator",
					toolId: "abc",
				}),
			})
		);

		expect(generateToolSurfaceMock).toHaveBeenCalledWith({
			projectName: "Calc",
			siteUrl: "https://stripe.com",
			prompt: "a calculator",
			toolId: "abc",
		}, { request: expect.any(Request) });
		expect(response.status).toBe(200);
		expect(response.headers.get("server-timing")).toContain("total;dur=1234");
		expect(response.headers.get("x-tool-generation-attempts")).toBe("1:success:1100/210000");
		await expect(response.json()).resolves.toMatchObject({
			status: "success",
			tool: { embedSnippet: expect.stringContaining("/t/abc") },
		});
	});

	it("returns a JSON 500 when generateToolSurface throws unexpectedly", async () => {
		generateToolSurfaceMock.mockRejectedValueOnce(new Error("database offline"));

		const response = await generatePost(
			new Request("http://localhost/api/tools/generate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ prompt: "a calculator" }),
			})
		);

		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toMatchObject({
			status: "error",
			message: expect.stringContaining("database offline"),
		});
	});
});

describe("GET /t/[id]", () => {
	it("serves the stored HTML with no-store caching", async () => {
		getGeneratedToolMock.mockResolvedValueOnce({
			id: "abc",
			html: "<!doctype html><html><body>hi</body></html>",
		});

		const response = await toolGet(new Request("http://localhost/t/abc"), {
			params: Promise.resolve({ id: "abc" }),
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/html");
		expect(response.headers.get("cache-control")).toBe("no-store");
		await expect(response.text()).resolves.toContain("hi");
	});

	it("returns a 404 HTML fallback when the tool doesn't exist", async () => {
		getGeneratedToolMock.mockResolvedValueOnce(null);

		const response = await toolGet(new Request("http://localhost/t/missing"), {
			params: Promise.resolve({ id: "missing" }),
		});

		expect(response.status).toBe(404);
		await expect(response.text()).resolves.toContain("Tool not found");
	});
});

describe("GET /api/tools", () => {
	it("returns tool summaries without the html body", async () => {
		listGeneratedToolsSurfaceMock.mockResolvedValueOnce({
			statusCode: 200,
			body: {
				status: "success",
				tools: [
					{
						id: "abc",
						projectName: "Calc",
						prompt: "a calculator",
						siteUrl: null,
						brandSnapshot: null,
						copy: { headline: "Test headline", supportingCopy: "Test copy." },
						brandFidelity: { verdict: "pass", notes: "" },
						model: "claude-sonnet-4-6",
						warnings: [],
						createdAt: "2024-01-01T00:00:00.000Z",
						updatedAt: "2024-01-02T00:00:00.000Z",
						version: 2,
						previousVersionCount: 1,
					},
				],
			},
		});

		const response = await toolsListGet();
		const body = (await response.json()) as { status: string; tools: Array<Record<string, unknown>> };

		expect(response.status).toBe(200);
		expect(body.status).toBe("success");
		expect(body.tools).toHaveLength(1);
		expect(body.tools[0]).not.toHaveProperty("html");
		expect(body.tools[0]).not.toHaveProperty("history");
		expect(body.tools[0]).toMatchObject({
			id: "abc",
			projectName: "Calc",
			copy: { headline: "Test headline", supportingCopy: "Test copy." },
			brandFidelity: { verdict: "pass", notes: "" },
			updatedAt: "2024-01-02T00:00:00.000Z",
			version: 2,
			previousVersionCount: 1,
		});
	});
});

describe("GET /api/tools/[id]", () => {
	it("returns 404 when the tool doesn't exist", async () => {
		getGeneratedToolSurfaceMock.mockResolvedValueOnce({
			statusCode: 404,
			body: { status: "error", message: "Tool not found." },
		});

		const response = await toolDetailGet(new Request("http://localhost/api/tools/missing"), {
			params: Promise.resolve({ id: "missing" }),
		});

		expect(response.status).toBe(404);
	});

	it("returns tool detail with html stripped from the record and every history entry", async () => {
		getGeneratedToolSurfaceMock.mockResolvedValueOnce({
			statusCode: 200,
			body: {
				status: "success",
				tool: {
					id: "abc",
					projectName: "Calc",
					prompt: "a calculator",
					siteUrl: null,
					brandSnapshot: null,
					copy: null,
					brandFidelity: null,
					model: "claude-sonnet-4-6",
					warnings: [],
					createdAt: "2024-01-01T00:00:00.000Z",
					updatedAt: "2024-01-02T00:00:00.000Z",
					version: 2,
					embedSnippet:
						"<iframe id=\"letterstory-tool-abc\" src=\"https://example.com/t/abc\"></iframe>",
					history: [
						{
							version: 1,
							createdAt: "2024-01-01T00:00:00.000Z",
							projectName: "Calc",
							prompt: "a calculator",
							siteUrl: null,
							brandSnapshot: null,
							copy: null,
							brandFidelity: null,
							model: "claude-sonnet-4-6",
							warnings: [],
						},
					],
				},
			},
		});

		const response = await toolDetailGet(new Request("http://localhost/api/tools/abc"), {
			params: Promise.resolve({ id: "abc" }),
		});
		const body = (await response.json()) as { status: string; tool: Record<string, unknown> };

		expect(getGeneratedToolSurfaceMock).toHaveBeenCalledWith(
			{ id: "abc" },
			{ request: expect.any(Request) }
		);
		expect(response.status).toBe(200);
		expect(body.tool).not.toHaveProperty("html");
		expect(body.tool.id).toBe("abc");
		expect(body.tool.version).toBe(2);
		expect(body.tool.embedSnippet).toContain("/t/abc");
		const history = body.tool.history as Array<Record<string, unknown>>;
		expect(history).toHaveLength(1);
		expect(history[0]).not.toHaveProperty("html");
		expect(history[0]).toMatchObject({ version: 1 });
	});
});

describe("POST /api/tools/[id]/rollback", () => {
	it("returns 400 when version is missing or not a number", async () => {
		rollbackGeneratedToolSurfaceMock.mockResolvedValueOnce({
			statusCode: 400,
			body: { status: "error", message: "Provide the numeric version to restore." },
		});

		const response = await toolRollbackPost(
			new Request("http://localhost/api/tools/abc/rollback", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			}),
			{ params: Promise.resolve({ id: "abc" }) }
		);

		expect(response.status).toBe(400);
	});

	it("returns 404 when rollbackGeneratedTool can't find the tool/version", async () => {
		rollbackGeneratedToolSurfaceMock.mockResolvedValueOnce({
			statusCode: 404,
			body: { status: "error", message: "Could not find that tool/version to restore." },
		});

		const response = await toolRollbackPost(
			new Request("http://localhost/api/tools/abc/rollback", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ version: 1 }),
			}),
			{ params: Promise.resolve({ id: "abc" }) }
		);

		expect(response.status).toBe(404);
	});

	it("rolls back and returns the restored tool on success", async () => {
		rollbackGeneratedToolSurfaceMock.mockResolvedValueOnce({
			statusCode: 200,
			body: { status: "success", tool: { id: "abc", version: 3 } },
		});

		const response = await toolRollbackPost(
			new Request("http://localhost/api/tools/abc/rollback", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ version: 1 }),
			}),
			{ params: Promise.resolve({ id: "abc" }) }
		);

		expect(rollbackGeneratedToolSurfaceMock).toHaveBeenCalledWith({ id: "abc", version: 1 });
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({ status: "success", tool: { id: "abc", version: 3 } });
	});
});
