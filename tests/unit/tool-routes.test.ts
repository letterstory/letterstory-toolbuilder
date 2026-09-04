import { describe, expect, it, vi } from "vitest";

const generateToolMock = vi.hoisted(() => vi.fn());
const getGeneratedToolMock = vi.hoisted(() => vi.fn());
const listGeneratedToolsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/generation", () => ({
	generateTool: generateToolMock,
}));

vi.mock("@/lib/generation/store", () => ({
	getGeneratedTool: getGeneratedToolMock,
	listGeneratedTools: listGeneratedToolsMock,
}));

import { POST as generatePost } from "../../src/app/api/tools/generate/route";
import { GET as toolsListGet } from "../../src/app/api/tools/route";
import { GET as toolGet } from "../../src/app/t/[id]/route";

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

	it("proxies generateTool and returns 200 on success", async () => {
		generateToolMock.mockResolvedValueOnce({
			status: "success",
			tool: { id: "abc", projectName: "Calc" },
		});

		const response = await generatePost(
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
		});
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({ status: "success" });
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
			},
		]);

		const response = await toolsListGet();
		const body = (await response.json()) as { status: string; tools: Array<Record<string, unknown>> };

		expect(response.status).toBe(200);
		expect(body.status).toBe("success");
		expect(body.tools).toHaveLength(1);
		expect(body.tools[0]).not.toHaveProperty("html");
		expect(body.tools[0]).toMatchObject({
			id: "abc",
			projectName: "Calc",
			copy: { headline: "Test headline", supportingCopy: "Test copy." },
			brandFidelity: { verdict: "pass", notes: "" },
		});
	});
});
