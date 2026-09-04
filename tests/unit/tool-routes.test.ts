import { beforeEach, describe, expect, it, vi } from "vitest";

const generateToolMock = vi.hoisted(() => vi.fn());
const getGeneratedToolMock = vi.hoisted(() => vi.fn());
const listGeneratedToolsMock = vi.hoisted(() => vi.fn());
const rollbackGeneratedToolMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const getClientIpMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/generation", () => ({
	generateTool: generateToolMock,
}));

vi.mock("@/lib/security/rate-limit", () => ({
	checkRateLimit: checkRateLimitMock,
	getClientIp: getClientIpMock,
}));

vi.mock("@/lib/generation/store", () => ({
	getGeneratedTool: getGeneratedToolMock,
	listGeneratedTools: listGeneratedToolsMock,
	rollbackGeneratedTool: rollbackGeneratedToolMock,
}));

import { POST as generatePost } from "../../src/app/api/tools/generate/route";
import { GET as toolsListGet } from "../../src/app/api/tools/route";
import { GET as toolDetailGet } from "../../src/app/api/tools/[id]/route";
import { POST as toolRollbackPost } from "../../src/app/api/tools/[id]/rollback/route";
import { GET as toolGet } from "../../src/app/t/[id]/route";

beforeEach(() => {
	checkRateLimitMock.mockReset();
	getClientIpMock.mockReset();
	generateToolMock.mockReset();
	getGeneratedToolMock.mockReset();
	listGeneratedToolsMock.mockReset();
	rollbackGeneratedToolMock.mockReset();

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
		const response = await generatePost(
			new Request("http://localhost/api/tools/generate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ prompt: "   " }),
			})
		);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({ status: "error" });
		expect(generateToolMock).not.toHaveBeenCalled();
	});

	it("returns 429 with Retry-After when the caller is rate limited", async () => {
		checkRateLimitMock.mockResolvedValueOnce({
			allowed: false,
			limit: 10,
			remaining: 0,
			retryAfterSeconds: 42,
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
		expect(checkRateLimitMock).toHaveBeenCalledWith("203.0.113.10", {
			bucket: "tools.generate",
			max: 10,
			windowSeconds: 600,
		});
		expect(response.status).toBe(429);
		expect(response.headers.get("Retry-After")).toBe("42");
		await expect(response.json()).resolves.toMatchObject({
			status: "error",
			message: expect.stringMatching(/too many tool generation requests/i),
		});
		expect(generateToolMock).not.toHaveBeenCalled();
	});

	it("returns 400 for an unparseable body", async () => {
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
		generateToolMock.mockResolvedValueOnce({
			status: "not_configured",
			message: "Set ANTHROPIC_API_KEY before generating tools.",
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

	it("proxies generateTool including an optional toolId, and returns 200 on success", async () => {
		generateToolMock.mockResolvedValueOnce({
			status: "success",
			tool: { id: "abc", projectName: "Calc" },
			diagnostics: {
				totalMs: 1234,
				brandContextMs: 56,
				buildMs: 1100,
				advisoryMs: 78,
				advisorySkipped: false,
				htmlAttempts: [{ attempt: 1, timeoutMs: 210000, durationMs: 1100, outcome: "success" }],
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

		expect(generateToolMock).toHaveBeenCalledWith({
			projectName: "Calc",
			siteUrl: "https://stripe.com",
			prompt: "a calculator",
			toolId: "abc",
		});
		expect(response.status).toBe(200);
		expect(response.headers.get("server-timing")).toContain("total;dur=1234");
		expect(response.headers.get("server-timing")).toContain("brand;dur=56");
		expect(response.headers.get("x-tool-generation-attempts")).toBe("1:success:1100/210000");
		await expect(response.json()).resolves.toMatchObject({ status: "success" });
	});

	it("omits toolId when not provided (fresh generation, not a revision)", async () => {
		generateToolMock.mockResolvedValueOnce({
			status: "success",
			tool: { id: "abc", projectName: "Calc" },
		});

		await generatePost(
			new Request("http://localhost/api/tools/generate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ projectName: "Calc", siteUrl: "https://stripe.com", prompt: "a calculator" }),
			})
		);

		expect(generateToolMock).toHaveBeenCalledWith({
			projectName: "Calc",
			siteUrl: "https://stripe.com",
			prompt: "a calculator",
			toolId: undefined,
		});
	});

	it("returns 400 when generateTool reports an error", async () => {
		generateToolMock.mockResolvedValueOnce({ status: "error", message: "boom" });

		const response = await generatePost(
			new Request("http://localhost/api/tools/generate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ prompt: "a calculator" }),
			})
		);

		expect(response.status).toBe(400);
	});

	it("returns a JSON 500 when generateTool throws unexpectedly", async () => {
		generateToolMock.mockRejectedValueOnce(new Error("database offline"));

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
		listGeneratedToolsMock.mockResolvedValueOnce([
			{
				id: "abc",
				projectName: "Calc",
				prompt: "a calculator",
				siteUrl: null,
				brandSnapshot: null,
				html: "<!doctype html>should not be exposed here</html>",
				copy: { headline: "Test headline", supportingCopy: "Test copy." },
				brandFidelity: { verdict: "pass", notes: "" },
				model: "claude-sonnet-4-6",
				warnings: [],
				createdAt: "2024-01-01T00:00:00.000Z",
				updatedAt: "2024-01-02T00:00:00.000Z",
				version: 2,
				history: [{ version: 1, createdAt: "2024-01-01T00:00:00.000Z" }],
			},
		]);

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
		getGeneratedToolMock.mockResolvedValueOnce(null);

		const response = await toolDetailGet(new Request("http://localhost/api/tools/missing"), {
			params: Promise.resolve({ id: "missing" }),
		});

		expect(response.status).toBe(404);
	});

	it("returns tool detail with html stripped from the record and every history entry", async () => {
		getGeneratedToolMock.mockResolvedValueOnce({
			id: "abc",
			projectName: "Calc",
			prompt: "a calculator",
			siteUrl: null,
			brandSnapshot: null,
			html: "<!doctype html>current</html>",
			copy: null,
			brandFidelity: null,
			model: "claude-sonnet-4-6",
			warnings: [],
			createdAt: "2024-01-01T00:00:00.000Z",
			updatedAt: "2024-01-02T00:00:00.000Z",
			version: 2,
			history: [
				{
					version: 1,
					createdAt: "2024-01-01T00:00:00.000Z",
					projectName: "Calc",
					prompt: "a calculator",
					siteUrl: null,
					brandSnapshot: null,
					html: "<!doctype html>old</html>",
					copy: null,
					brandFidelity: null,
					model: "claude-sonnet-4-6",
					warnings: [],
				},
			],
		});

		const response = await toolDetailGet(new Request("http://localhost/api/tools/abc"), {
			params: Promise.resolve({ id: "abc" }),
		});
		const body = (await response.json()) as { status: string; tool: Record<string, unknown> };

		expect(response.status).toBe(200);
		expect(body.tool).not.toHaveProperty("html");
		expect(body.tool.id).toBe("abc");
		expect(body.tool.version).toBe(2);
		const history = body.tool.history as Array<Record<string, unknown>>;
		expect(history).toHaveLength(1);
		expect(history[0]).not.toHaveProperty("html");
		expect(history[0]).toMatchObject({ version: 1 });
	});
});

describe("POST /api/tools/[id]/rollback", () => {
	it("returns 400 when version is missing or not a number", async () => {
		const response = await toolRollbackPost(
			new Request("http://localhost/api/tools/abc/rollback", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			}),
			{ params: Promise.resolve({ id: "abc" }) }
		);

		expect(response.status).toBe(400);
		expect(rollbackGeneratedToolMock).not.toHaveBeenCalled();
	});

	it("returns 404 when rollbackGeneratedTool can't find the tool/version", async () => {
		rollbackGeneratedToolMock.mockResolvedValueOnce(null);

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
		rollbackGeneratedToolMock.mockResolvedValueOnce({ id: "abc", version: 3 });

		const response = await toolRollbackPost(
			new Request("http://localhost/api/tools/abc/rollback", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ version: 1 }),
			}),
			{ params: Promise.resolve({ id: "abc" }) }
		);

		expect(rollbackGeneratedToolMock).toHaveBeenCalledWith("abc", 1);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({ status: "success", tool: { id: "abc", version: 3 } });
	});
});
