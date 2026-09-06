import { beforeEach, describe, expect, it, vi } from "vitest";

const getGeneratedToolMock = vi.hoisted(() => vi.fn());
const invokeToolLogicInSandboxMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/generation/store", () => ({
	getGeneratedTool: getGeneratedToolMock,
}));

vi.mock("@/lib/tool-logic/runtime", () => ({
	invokeToolLogicInSandbox: invokeToolLogicInSandboxMock,
}));

import { invokeGeneratedToolLogicSurface } from "../../src/lib/surfaces/tool-logic";

const logicRecord = {
	invokePath: "/api/tools/tool-123/logic/invoke",
	toolTag: "generated-tool-logic-tool-123-v1",
	snapshotId: "snapshot-123",
	warmSandboxName: "warm-tool-123",
	handlerModulePath: "/handler.js",
	contract: {
		input: {
			type: "object",
			fields: {
				filingStatus: { type: "string", enum: ["single", "married_jointly"] },
				taxableIncome: { type: "number", minimum: 0 },
			},
		},
		output: {
			type: "object",
			fields: {
				estimatedTax: { type: "number", minimum: 0 },
			},
		},
	},
	generatedAt: "2026-09-06T00:00:00.000Z",
	generationModel: "claude-sonnet-4-6",
	classificationReason: "Marginal tax math should stay server-side.",
	handlerSource: "async function handler(){} module.exports = { handler };",
	validation: {
		staticAnalysisPassedAt: "2026-09-06T00:00:00.000Z",
		smokeTestPassedAt: "2026-09-06T00:00:01.000Z",
		smokeTestInputCount: 3,
		rulesVersion: "v1-pure-compute",
	},
};

describe("invokeGeneratedToolLogicSurface", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 404 when the tool has no stored logic metadata", async () => {
		getGeneratedToolMock.mockResolvedValueOnce(null);

		const response = await invokeGeneratedToolLogicSurface("tool-123", { taxableIncome: 90000 });

		expect(response.statusCode).toBe(404);
		expect(response.body).toMatchObject({ status: "error" });
	});

	it("validates the request body against the generated input contract", async () => {
		getGeneratedToolMock.mockResolvedValueOnce({ id: "tool-123", logic: logicRecord });

		const response = await invokeGeneratedToolLogicSurface("tool-123", {
			filingStatus: "single",
			taxableIncome: -10,
		});

		expect(response.statusCode).toBe(400);
		expect(response.body).toMatchObject({ status: "error" });
		expect(invokeToolLogicInSandboxMock).not.toHaveBeenCalled();
	});

	it("invokes the correct warm sandbox on success", async () => {
		getGeneratedToolMock.mockResolvedValueOnce({ id: "tool-123", logic: logicRecord });
		invokeToolLogicInSandboxMock.mockResolvedValueOnce({
			output: { estimatedTax: 15036 },
			sandboxName: "warm-tool-123",
			snapshotId: "snapshot-123",
		});

		const response = await invokeGeneratedToolLogicSurface("tool-123", {
			filingStatus: "single",
			taxableIncome: 90000,
		});

		expect(response.statusCode).toBe(200);
		expect(invokeToolLogicInSandboxMock).toHaveBeenCalledWith(
			logicRecord,
			expect.objectContaining({ filingStatus: "single", taxableIncome: 90000 })
		);
		expect(response.body).toMatchObject({
			status: "success",
			output: { estimatedTax: 15036 },
			sandbox: { snapshotId: "snapshot-123" },
		});
	});
});
