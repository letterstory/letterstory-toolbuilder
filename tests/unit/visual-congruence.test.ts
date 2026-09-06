import { describe, expect, it, vi } from "vitest";

import {
	analyzeVisualCongruence,
	finalizeVisualCongruenceForTool,
	mergeVisualCongruenceWarnings,
	parseVisualCongruenceResponse,
} from "../../src/lib/generation/visual-congruence";

function buildPendingTool(overrides: Record<string, unknown> = {}) {
	return {
		id: "tool-123",
		version: 4,
		projectName: "Calc",
		prompt: "Build a calculator",
		siteUrl: "stripe.com",
		brandSnapshot: { brandName: "Stripe", colors: {}, fonts: [], logoDataUri: null },
		html: "<!doctype html><html><body>hi</body></html>",
		copy: null,
		brandFidelity: null,
		visualCongruence: {
			status: "pending",
			congruenceScore: null,
			verdict: null,
			notes: "Analyzing…",
			risks: [],
			referenceUrl: null,
			analyzedAt: null,
		},
		model: "claude-sonnet-4-6",
		warnings: ["Existing warning"],
		createdAt: "2026-09-06T00:00:00.000Z",
		updatedAt: "2026-09-06T00:00:00.000Z",
		history: [],
		...overrides,
	};
}

describe("parseVisualCongruenceResponse", () => {
	it("normalizes fenced JSON responses from Claude vision", () => {
		const parsed = parseVisualCongruenceResponse(
			[
				"```json",
				"{",
				'  "congruenceScore": 4.2,',
				'  "verdict": "warn",',
				'  "notes": "The tool uses the right palette but feels denser and heavier than the reference site.",',
				'  "risks": ["Card chrome is too heavy", "Spacing rhythm is tighter than the reference"]',
				"}",
				"```",
			].join("\n")
		);

		expect(parsed).toEqual({
			congruenceScore: 4,
			verdict: "warn",
			notes: "The tool uses the right palette but feels denser and heavier than the reference site.",
			risks: ["Card chrome is too heavy", "Spacing rhythm is tighter than the reference"],
		});
	});

	it("repairs trailing commas and clamps invalid score ranges", () => {
		const parsed = parseVisualCongruenceResponse(`{
  "congruenceScore": 9,
  "verdict": "fail",
  "notes": "This looks like a different design system.",
  "risks": ["Corner-radius language diverges",],
}`);

		expect(parsed).toEqual({
			congruenceScore: 5,
			verdict: "fail",
			notes: "This looks like a different design system.",
			risks: ["Corner-radius language diverges"],
		});
	});
});

describe("mergeVisualCongruenceWarnings", () => {
	it("replaces stale visual warnings with the latest non-pass verdict", () => {
		const warnings = mergeVisualCongruenceWarnings(
			[
				"Brand fidelity check (warn): typography drifts.",
				"Visual brand match (warn): old note.",
			],
			{
				status: "completed",
				congruenceScore: 2,
				verdict: "fail",
				notes: "Spacing density and component weight still feel off-brand.",
				risks: ["Dense layout"],
				referenceUrl: "https://stripe.com",
				analyzedAt: "2026-09-05T00:00:00.000Z",
			}
		);

		expect(warnings).toEqual([
			"Brand fidelity check (warn): typography drifts.",
			"Visual brand match (fail): Spacing density and component weight still feel off-brand.",
		]);
	});
});

describe("analyzeVisualCongruence", () => {
	it("uses injected screenshot + vision clients and returns a completed verdict", async () => {
		const captureReferenceScreenshot = vi.fn().mockResolvedValue({
			base64: "reference-image",
			referenceUrl: "https://stripe.com/",
		});
		const renderGeneratedScreenshot = vi.fn().mockResolvedValue("generated-image");
		const requestAssessment = vi.fn().mockResolvedValue({
			congruenceScore: 5,
			verdict: "pass",
			notes: "The generated tool matches Stripe's airy spacing and polished neutral surfaces.",
			risks: [],
		});

		const result = await analyzeVisualCongruence({
			html: "<!doctype html><html><body><main>Stripe tool</main></body></html>",
			siteUrl: "stripe.com",
			brandName: "Stripe",
			captureReferenceScreenshot,
			renderGeneratedScreenshot,
			requestAssessment,
		});

		expect(captureReferenceScreenshot).toHaveBeenCalledWith("https://stripe.com");
		expect(renderGeneratedScreenshot).toHaveBeenCalled();
		expect(requestAssessment).toHaveBeenCalledWith({
			brandName: "Stripe",
			siteUrl: "https://stripe.com/",
			referenceImageBase64: "reference-image",
			generatedImageBase64: "generated-image",
		});
		expect(result.status).toBe("completed");
		expect(result.verdict).toBe("pass");
		expect(result.congruenceScore).toBe(5);
		expect(result.referenceUrl).toBe("https://stripe.com/");
		expect(result.analyzedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});
});

describe("finalizeVisualCongruenceForTool", () => {
	it("persists a failed status when analysis throws", async () => {
		const getTool = vi.fn().mockResolvedValue(buildPendingTool());
		const analyze = vi.fn().mockRejectedValue(new Error("invalid url"));
		const save = vi.fn().mockResolvedValue({
			id: "tool-123",
		});

		await finalizeVisualCongruenceForTool(
			{ toolId: "tool-123", expectedVersion: 4 },
			{ getTool, analyze, save }
		);

		expect(analyze).toHaveBeenCalledWith({
			html: "<!doctype html><html><body>hi</body></html>",
			siteUrl: "stripe.com",
			brandName: "Stripe",
		});
		expect(save).toHaveBeenCalledWith(
			"tool-123",
			4,
			expect.objectContaining({
				status: "failed",
				notes: "invalid url",
				referenceUrl: "stripe.com",
			}),
			[
				"Existing warning",
				"Visual brand match could not be completed: invalid url",
			]
		);
	});

	it.each(["pass", "warn"] as const)("does not attempt repair when verdict is %s", async (verdict) => {
		const getTool = vi.fn().mockResolvedValue(buildPendingTool());
		const analyze = vi.fn().mockResolvedValue({
			status: "completed",
			congruenceScore: verdict === "pass" ? 5 : 3,
			verdict,
			notes: "Advisory result",
			risks: [],
			referenceUrl: "https://stripe.com",
			analyzedAt: "2026-09-06T00:00:05.000Z",
		});
		const save = vi.fn().mockResolvedValue({ id: "tool-123" });
		const requestHtml = vi.fn();
		const saveRepairedTool = vi.fn();

		await finalizeVisualCongruenceForTool(
			{ toolId: "tool-123", expectedVersion: 4 },
			{ getTool, analyze, save, requestHtml, htmlGenerationMaxTokens: 12_000, saveRepairedTool }
		);

		expect(requestHtml).not.toHaveBeenCalled();
		expect(saveRepairedTool).not.toHaveBeenCalled();
		expect(save).toHaveBeenCalledWith(
			"tool-123",
			4,
			expect.objectContaining({ verdict }),
			expect.any(Array)
		);
	});

	it("falls back gracefully when the repair attempt fails", async () => {
		const tool = buildPendingTool();
		const getTool = vi.fn().mockResolvedValue(tool);
		const analyze = vi.fn().mockResolvedValue({
			status: "completed",
			congruenceScore: 1,
			verdict: "fail",
			notes: "Layout density feels off-brand.",
			risks: ["Card styling is too heavy"],
			referenceUrl: "https://stripe.com",
			analyzedAt: "2026-09-06T00:00:05.000Z",
		});
		const save = vi.fn().mockResolvedValue({ id: "tool-123" });
		const requestHtml = vi.fn().mockRejectedValue(new Error("repair timeout"));
		const saveRepairedTool = vi.fn();

		await finalizeVisualCongruenceForTool(
			{ toolId: "tool-123", expectedVersion: 4 },
			{ getTool, analyze, save, requestHtml, htmlGenerationMaxTokens: 12_000, saveRepairedTool }
		);

		expect(requestHtml).toHaveBeenCalledTimes(1);
		expect(saveRepairedTool).not.toHaveBeenCalled();
		expect(save).toHaveBeenCalledWith(
			"tool-123",
			4,
			expect.objectContaining({ verdict: "fail", congruenceScore: 1 }),
			expect.arrayContaining([
				"Existing warning",
				"Visual brand match (fail): Layout density feels off-brand.",
				"Visual congruence auto-repair failed: repair timeout",
			])
		);
	});

	it("re-analyzes a successful repair and persists the repaired HTML as a new version", async () => {
		const tool = buildPendingTool();
		const getTool = vi.fn().mockResolvedValue(tool);
		const analyze = vi
			.fn()
			.mockResolvedValueOnce({
				status: "completed",
				congruenceScore: 1,
				verdict: "fail",
				notes: "This looks like the wrong design system.",
				risks: ["Spacing is too dense"],
				referenceUrl: "https://stripe.com",
				analyzedAt: "2026-09-06T00:00:05.000Z",
			})
			.mockResolvedValueOnce({
				status: "completed",
				congruenceScore: 4,
				verdict: "warn",
				notes: "Much closer after the layout changes.",
				risks: [],
				referenceUrl: "https://stripe.com",
				analyzedAt: "2026-09-06T00:00:10.000Z",
			});
		const save = vi.fn();
		const requestHtml = vi
			.fn()
			.mockResolvedValue("<!doctype html><html><body><main>repaired</main></body></html>");
		const saveRepairedTool = vi.fn().mockResolvedValue({
			...tool,
			html: "<!doctype html><html><body><main>repaired</main></body></html>",
			version: 5,
			history: [{ version: 4, prompt: "Build a calculator" }],
		});

		await finalizeVisualCongruenceForTool(
			{ toolId: "tool-123", expectedVersion: 4 },
			{ getTool, analyze, save, requestHtml, htmlGenerationMaxTokens: 12_000, saveRepairedTool }
		);

		expect(requestHtml).toHaveBeenCalledTimes(1);
		expect(analyze).toHaveBeenCalledTimes(2);
		expect(analyze).toHaveBeenNthCalledWith(2, {
			html: "<!doctype html><html><body><main>repaired</main></body></html>",
			siteUrl: "stripe.com",
			brandName: "Stripe",
		});
		expect(save).not.toHaveBeenCalled();
		expect(saveRepairedTool).toHaveBeenCalledWith(
			"tool-123",
			4,
			expect.objectContaining({
				html: "<!doctype html><html><body><main>repaired</main></body></html>",
				visualCongruence: expect.objectContaining({ verdict: "warn", congruenceScore: 4 }),
				warnings: ["Existing warning", "Visual brand match (warn): Much closer after the layout changes."],
			})
		);
	});

	it("skips repair when the analyzed version is stale before the repair starts", async () => {
		const getTool = vi
			.fn()
			.mockResolvedValueOnce(buildPendingTool())
			.mockResolvedValueOnce(buildPendingTool({ version: 5 }));
		const analyze = vi.fn().mockResolvedValue({
			status: "completed",
			congruenceScore: 1,
			verdict: "fail",
			notes: "Off-brand layout.",
			risks: [],
			referenceUrl: "https://stripe.com",
			analyzedAt: "2026-09-06T00:00:05.000Z",
		});
		const save = vi.fn();
		const requestHtml = vi.fn();
		const saveRepairedTool = vi.fn();

		await finalizeVisualCongruenceForTool(
			{ toolId: "tool-123", expectedVersion: 4 },
			{ getTool, analyze, save, requestHtml, htmlGenerationMaxTokens: 12_000, saveRepairedTool }
		);

		expect(requestHtml).not.toHaveBeenCalled();
		expect(save).not.toHaveBeenCalled();
		expect(saveRepairedTool).not.toHaveBeenCalled();
	});

	it("attempts at most one repair even if the re-analysis still fails", async () => {
		const tool = buildPendingTool();
		const getTool = vi.fn().mockResolvedValue(tool);
		const analyze = vi
			.fn()
			.mockResolvedValueOnce({
				status: "completed",
				congruenceScore: 1,
				verdict: "fail",
				notes: "Still off-brand.",
				risks: ["Wrong card rhythm"],
				referenceUrl: "https://stripe.com",
				analyzedAt: "2026-09-06T00:00:05.000Z",
			})
			.mockResolvedValueOnce({
				status: "completed",
				congruenceScore: 2,
				verdict: "fail",
				notes: "Improved, but still clearly off-brand.",
				risks: ["Buttons still feel too heavy"],
				referenceUrl: "https://stripe.com",
				analyzedAt: "2026-09-06T00:00:10.000Z",
			});
		const save = vi.fn();
		const requestHtml = vi
			.fn()
			.mockResolvedValue("<!doctype html><html><body><main>repaired once</main></body></html>");
		const saveRepairedTool = vi.fn().mockResolvedValue({
			...tool,
			html: "<!doctype html><html><body><main>repaired once</main></body></html>",
			version: 5,
			history: [{ version: 4, prompt: "Build a calculator" }],
		});

		await finalizeVisualCongruenceForTool(
			{ toolId: "tool-123", expectedVersion: 4 },
			{ getTool, analyze, save, requestHtml, htmlGenerationMaxTokens: 12_000, saveRepairedTool }
		);

		expect(requestHtml).toHaveBeenCalledTimes(1);
		expect(analyze).toHaveBeenCalledTimes(2);
		expect(save).not.toHaveBeenCalled();
		expect(saveRepairedTool).toHaveBeenCalledTimes(1);
		expect(saveRepairedTool).toHaveBeenCalledWith(
			"tool-123",
			4,
			expect.objectContaining({
				visualCongruence: expect.objectContaining({ verdict: "fail", congruenceScore: 2 }),
			})
		);
	});
});
