import { describe, expect, it, vi } from "vitest";

const dispatchToolCallMock = vi.hoisted(() => vi.fn());
const listMcpToolsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/mcp/dispatch", async () => {
	const actual = await vi.importActual<typeof import("@/lib/mcp/dispatch")>("@/lib/mcp/dispatch");
	return {
		...actual,
		dispatchToolCall: dispatchToolCallMock,
	};
});

vi.mock("@/lib/mcp/registry", () => ({
	listMcpTools: listMcpToolsMock,
}));

import { GET, POST } from "../../src/app/api/mcp/route";
import { McpDispatchError } from "../../src/lib/mcp/dispatch";

describe("/api/mcp", () => {
	it("GET returns the discovery document", async () => {
		listMcpToolsMock.mockReturnValueOnce([{ name: "get_health", description: "health" }]);

		const response = GET(new Request("http://localhost:3000/api/mcp"));
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			name: "letterstory-toolbuilder",
			endpoint: "http://localhost:3000/api/mcp",
			tools: [{ name: "get_health" }],
		});
	});

	it("POST initialize returns server capabilities", async () => {
		const response = await POST(
			new Request("http://localhost:3000/api/mcp", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
			})
		);
		await expect(response.json()).resolves.toMatchObject({
			jsonrpc: "2.0",
			id: 1,
			result: {
				serverInfo: { name: "letterstory-toolbuilder" },
				capabilities: { tools: { listChanged: false } },
			},
		});
	});

	it("POST tools/list returns registry data", async () => {
		listMcpToolsMock.mockReturnValueOnce([{ name: "get_health" }]);

		const response = await POST(
			new Request("http://localhost:3000/api/mcp", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
			})
		);
		await expect(response.json()).resolves.toMatchObject({
			jsonrpc: "2.0",
			id: 2,
			result: { tools: [{ name: "get_health" }] },
		});
	});

	it("POST tools/call dispatches through the central dispatcher", async () => {
		dispatchToolCallMock.mockResolvedValueOnce({
			name: "get_health",
			output: { ok: true },
			meta: { httpStatus: 200 },
		});

		const response = await POST(
			new Request("http://localhost:3000/api/mcp", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 3,
					method: "tools/call",
					params: { name: "get_health", arguments: {} },
				}),
			})
		);
		expect(dispatchToolCallMock).toHaveBeenCalledWith({
			name: "get_health",
			arguments: {},
			request: expect.any(Request),
		});
		await expect(response.json()).resolves.toMatchObject({
			jsonrpc: "2.0",
			id: 3,
			result: { name: "get_health", output: { ok: true } },
		});
	});

	it("POST tools/call surfaces dispatch errors as JSON-RPC errors", async () => {
		dispatchToolCallMock.mockRejectedValueOnce(new McpDispatchError(-32602, "Invalid arguments", { issues: [] }));

		const response = await POST(
			new Request("http://localhost:3000/api/mcp", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 4,
					method: "tools/call",
					params: { name: "get_health", arguments: { bad: true } },
				}),
			})
		);
		await expect(response.json()).resolves.toMatchObject({
			jsonrpc: "2.0",
			id: 4,
			error: { code: -32602, message: "Invalid arguments", data: { issues: [] } },
		});
	});
});
