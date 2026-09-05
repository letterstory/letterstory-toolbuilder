import { describe, expect, it, vi } from "vitest";

import {
	analyzeVisualCongruence,
	mergeVisualCongruenceWarnings,
	parseVisualCongruenceResponse,
} from "../../src/lib/generation/visual-congruence";

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
			siteUrl: "https://stripe.com",
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
