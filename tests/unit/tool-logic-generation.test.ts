import { beforeEach, describe, expect, it, vi } from "vitest";

const requestAnthropicTextMock = vi.hoisted(() => vi.fn());
const buildPromotedToolLogicRuntimeMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/anthropic/messages", () => ({
	requestAnthropicText: requestAnthropicTextMock,
}));

vi.mock("@/lib/tool-logic/runtime", () => ({
	buildPromotedToolLogicRuntime: buildPromotedToolLogicRuntimeMock,
}));

import {
	classifyToolLogicRequirement,
	LOGIC_CLASSIFIER_MAX_TOKENS,
	LOGIC_CLASSIFIER_TIMEOUT_MS,
	prepareToolLogic,
} from "../../src/lib/tool-logic/generation";

describe("tool logic generation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		requestAnthropicTextMock.mockResolvedValue({
			text: JSON.stringify({ needsServerLogic: false, reason: "Simple browser-side interaction." }),
			model: "claude-sonnet-4-6",
		});
		buildPromotedToolLogicRuntimeMock.mockResolvedValue({
			invokePath: "/api/tools/tool-123/logic/invoke",
			toolTag: "generated-tool-logic-tool-123-v1",
			snapshotId: "snapshot-123",
			warmSandboxName: "warm-tool-123",
			handlerModulePath: "/handler.js",
			contract: {
				input: { type: "object", fields: { taxableIncome: { type: "number", minimum: 0 } } },
				output: { type: "object", fields: { estimatedTax: { type: "number", minimum: 0 } } },
			},
			generatedAt: "2026-09-06T00:00:00.000Z",
			generationModel: "claude-sonnet-4-6",
			classificationReason: "Marginal tax rules should stay server-side.",
			handlerSource: "async function handler(input){return {estimatedTax: input.taxableIncome * 0.2};} module.exports = { handler };",
			validation: {
				staticAnalysisPassedAt: "2026-09-06T00:00:00.000Z",
				smokeTestPassedAt: "2026-09-06T00:00:01.000Z",
				smokeTestInputCount: 3,
				rulesVersion: "v1-pure-compute",
			},
		});
	});

	it("classifies simple prompts with a small fast Anthropic call", async () => {
		await classifyToolLogicRequirement({
			projectName: "Color Picker",
			prompt: "Add a color picker with live preview.",
		});

		expect(requestAnthropicTextMock).toHaveBeenCalledWith(
			expect.objectContaining({
				maxTokens: LOGIC_CLASSIFIER_MAX_TOKENS,
				timeoutMs: LOGIC_CLASSIFIER_TIMEOUT_MS,
			})
		);
	});

	it("returns not_needed for simple browser-only tools", async () => {
		requestAnthropicTextMock.mockResolvedValueOnce({
			text: JSON.stringify({
				needsServerLogic: false,
				reason: "A color picker is ordinary client-side UI.",
			}),
			model: "claude-sonnet-4-6",
		});

		const result = await prepareToolLogic({
			projectName: "Color Picker",
			prompt: "Add a color picker with live preview.",
			toolId: "tool-123",
			version: 1,
			requestStartedAt: Date.now(),
		});

		expect(result).toMatchObject({
			status: "not_needed",
			classification: { needsServerLogic: false },
		});
		expect(buildPromotedToolLogicRuntimeMock).not.toHaveBeenCalled();
	});

	it("falls back when server-side logic classification fails", async () => {
		requestAnthropicTextMock.mockRejectedValueOnce(new TypeError("fetch failed"));

		const result = await prepareToolLogic({
			projectName: "Color Picker",
			prompt: "Add a color picker with live preview.",
			toolId: "tool-123",
			version: 1,
			requestStartedAt: Date.now(),
		});

		expect(result).toMatchObject({
			status: "fallback",
			classification: {
				needsServerLogic: false,
			},
		});
		if (result.status === "fallback") {
			expect(result.warning).toMatch(/classification failed/i);
			expect(result.warning).toMatch(/fetch failed/i);
		}
		expect(buildPromotedToolLogicRuntimeMock).not.toHaveBeenCalled();
	});

	it("prepares ready server-side logic for a tax estimator prompt", async () => {
		requestAnthropicTextMock
			.mockResolvedValueOnce({
				text: JSON.stringify({
					needsServerLogic: true,
					reason: "Marginal tax bracket logic should stay server-side.",
				}),
				model: "claude-sonnet-4-6",
			})
			.mockResolvedValueOnce({
				text: JSON.stringify({
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
								effectiveRatePercent: { type: "number", minimum: 0, maximum: 100 },
							},
						},
					},
					handlerSource:
						'async function handler(input){ if(!input || !Number.isFinite(input.taxableIncome)) throw new Error("taxableIncome required"); return { estimatedTax: input.taxableIncome * 0.2, effectiveRatePercent: 20 }; } module.exports = { handler };',
				}),
				model: "claude-sonnet-4-6",
			});

		const result = await prepareToolLogic({
			projectName: "Tax Estimator",
			prompt: "Build a US federal tax bracket estimator for salaried employees.",
			toolId: "tool-123",
			version: 1,
			requestStartedAt: Date.now(),
		});

		expect(result.status).toBe("ready");
		if (result.status === "ready") {
			expect(result.promptContext.invokePath).toBe("/api/tools/tool-123/logic/invoke");
			expect(result.metadata.snapshotId).toBe("snapshot-123");
		}
		expect(buildPromotedToolLogicRuntimeMock).toHaveBeenCalledWith(
			expect.objectContaining({
				invokePath: "/api/tools/tool-123/logic/invoke",
				toolTag: "generated-tool-logic-tool-123-v1",
			})
		);
	});

	it("falls back when static validation rejects the generated handler", async () => {
		requestAnthropicTextMock
			.mockResolvedValueOnce({
				text: JSON.stringify({
					needsServerLogic: true,
					reason: "Financial logic should stay server-side.",
				}),
				model: "claude-sonnet-4-6",
			})
			.mockResolvedValueOnce({
				text: JSON.stringify({
					contract: {
						input: { type: "object", fields: { amount: { type: "number", minimum: 0 } } },
						output: { type: "object", fields: { doubled: { type: "number", minimum: 0 } } },
					},
					handlerSource:
						'const fs = require("fs"); async function handler(input){ return { doubled: input.amount * 2, fsLoaded: !!fs }; } module.exports = { handler };',
				}),
				model: "claude-sonnet-4-6",
			});

		const result = await prepareToolLogic({
			projectName: "Unsafe Demo",
			prompt: "Build a sensitive finance calculator.",
			toolId: "tool-123",
			version: 1,
			requestStartedAt: Date.now(),
		});

		expect(result.status).toBe("fallback");
		if (result.status === "fallback") {
			expect(result.warning).toMatch(/fell back to client-side HTML only/i);
			expect(result.warning).toMatch(/require\(\)/i);
		}
		expect(buildPromotedToolLogicRuntimeMock).not.toHaveBeenCalled();
	});
});
