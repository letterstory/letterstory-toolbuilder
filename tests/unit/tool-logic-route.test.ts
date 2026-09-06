import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeGeneratedToolLogicSurfaceMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/surfaces/tool-logic", () => ({
	invokeGeneratedToolLogicSurface: invokeGeneratedToolLogicSurfaceMock,
}));

import { POST as invokePost } from "../../src/app/api/tools/[id]/logic/invoke/route";

beforeEach(() => {
	invokeGeneratedToolLogicSurfaceMock.mockReset();
});

describe("POST /api/tools/[toolId]/logic/invoke", () => {
	it("returns 400 on invalid JSON bodies", async () => {
		invokeGeneratedToolLogicSurfaceMock.mockResolvedValueOnce({
			statusCode: 400,
			body: {
				status: "error",
				message: "Request body does not match this tool's logic contract.",
			},
		});

		const response = await invokePost(
			new Request("http://localhost/api/tools/tool-123/logic/invoke", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "not json",
			}),
			{ params: Promise.resolve({ id: "tool-123" }) }
		);

		expect(invokeGeneratedToolLogicSurfaceMock).toHaveBeenCalledWith("tool-123", null);
		expect(response.status).toBe(400);
	});

	it("proxies successful sandbox responses", async () => {
		invokeGeneratedToolLogicSurfaceMock.mockResolvedValueOnce({
			statusCode: 200,
			body: {
				status: "success",
				output: { estimatedTax: 15036 },
				sandbox: { sandboxName: "warm-tool-123", snapshotId: "snapshot-123" },
			},
		});

		const requestBody = { filingStatus: "single", taxableIncome: 90000 };
		const response = await invokePost(
			new Request("http://localhost/api/tools/tool-123/logic/invoke", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(requestBody),
			}),
			{ params: Promise.resolve({ id: "tool-123" }) }
		);

		expect(invokeGeneratedToolLogicSurfaceMock).toHaveBeenCalledWith("tool-123", requestBody);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			status: "success",
			output: { estimatedTax: 15036 },
		});
	});
});
