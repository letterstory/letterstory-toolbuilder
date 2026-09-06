import { describe, expect, it } from "vitest";
import {
	buildGenerationRun,
	buildMessageActionSummary,
	buildSuccessReply,
	estimateActivitySteps,
	estimateProgress,
	formatThoughtDuration,
	parseGenerationTelemetry,
} from "@/components/tools/builder-activity";
import type { ToolSummary } from "@/components/tools/builder-types";

function responseWithHeaders(headers: Record<string, string>) {
	return new Response(JSON.stringify({ status: "success" }), { headers });
}

function createToolSummary(overrides: Partial<ToolSummary> = {}): ToolSummary {
	return {
		id: "tool-123",
		projectName: "BMI calculator",
		prompt: "Build a BMI calculator",
		siteUrl: "https://acme.test",
		brandSnapshot: {
			brandName: "Acme",
			colors: {},
			fonts: [],
			logoDataUri: null,
		},
		copy: {
			headline: "BMI calculator",
			supportingCopy:
				"Enter your height and weight to see your BMI, category, and where you land on the health scale.",
		},
		brandFidelity: null,
		visualCongruence: null,
		model: "gpt-6-astra",
		warnings: [],
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		version: 1,
		previousVersionCount: 0,
		...overrides,
	};
}

describe("builder activity helpers", () => {
	it("includes brand-ingestion steps when building from a new site", () => {
		const run = buildGenerationRun({
			projectName: "Stripe pricing estimator",
			siteUrl: "https://stripe.com",
			reusesExistingBrand: false,
		});

		expect(run.phases.map((phase) => phase.key)).toEqual([
			"brand-profile",
			"logo",
			"colors",
			"fonts",
			"copy-layout",
			"html",
		]);
	});

	it("skips brand-ingestion steps for revisions that reuse the same brand context", () => {
		const run = buildGenerationRun({
			projectName: "Stripe pricing estimator",
			siteUrl: "https://stripe.com",
			reusesExistingBrand: true,
			toolId: "tool-123",
		});

		expect(run.phases.map((phase) => phase.key)).toEqual(["brief", "copy-layout", "html"]);
	});

	it("marks current step active during an in-flight run", () => {
		const run = buildGenerationRun({
			projectName: "Tool",
			siteUrl: "https://stripe.com",
			reusesExistingBrand: false,
		});
		run.startedAt = 0;

		const steps = estimateActivitySteps(run, 12_000);

		expect(steps[0]?.status).toBe("complete");
		expect(steps[1]?.status).toBe("active");
		expect(steps.at(-1)?.status).toBe("pending");
		expect(estimateProgress(run, 12_000)).toBeGreaterThan(0);
	});

	it("parses server timing headers into telemetry", () => {
		const telemetry = parseGenerationTelemetry(
			responseWithHeaders({
				"server-timing": "total;dur=84900, brand;dur=21000, build;dur=59000, advisory;dur=4900",
				"x-tool-generation-attempts": "1:success:59000/210000",
			})
		);

		expect(telemetry.totalMs).toBe(84_900);
		expect(telemetry.brandMs).toBe(21_000);
		expect(telemetry.buildMs).toBe(59_000);
		expect(telemetry.attemptsSummary).toContain("Attempt 1 success");
	});

	it("builds a warm success reply with tool summary, brand context, and next-step prompt", () => {
		const reply = buildSuccessReply(
			createToolSummary({
				warnings: ["Contrast is slightly low."],
			}),
			false
		);

		expect(reply.role).toBe("assistant");
		expect(reply.meta).toBe("Generated");
		expect(reply.resultVersion).toBe(1);
		expect(reply.actionSummary).toBe("Wrote BMI calculator · Build a BMI calculator");
		expect(reply.content).toContain("BMI calculator is ready.");
		expect(reply.content).toContain(
			"Enter your height and weight to see your BMI, category, and where you land on the health scale."
		);
		expect(reply.content).toContain("I used Acme's brand context from https://acme.test.");
		expect(reply.content).toContain("There is 1 generation note in the dashboard tab.");
		expect(reply.content).toContain("Want to tweak anything else, or add another feature?");
	});

	it("keeps update replies factual when no linked brand site was used", () => {
		const reply = buildSuccessReply(
			createToolSummary({
				projectName: "Pricing estimator",
				siteUrl: null,
				brandSnapshot: null,
				copy: null,
				version: 3,
			}),
			true
		);

		expect(reply.meta).toBe("Updated · v3");
		expect(reply.resultVersion).toBe(3);
		expect(reply.actionSummary).toBe("Edited Pricing estimator · Build a BMI calculator");
		expect(reply.content).toContain("Version 3 of Pricing estimator is ready.");
		expect(reply.content).toContain("Your latest changes are live in the preview.");
		expect(reply.content).toContain(
			"I built this without a linked brand site, so styling comes from the prompt alone."
		);
		expect(reply.content).toContain("Want to tweak anything else, or add another feature?");
	});

	it("formats a truthful disclosure label from the real request prompt", () => {
		expect(
			buildMessageActionSummary(
				"Stripe estimator",
				"Add a dark mode toggle and tighten the spacing around the pricing cards.",
				true
			)
		).toBe(
			"Edited Stripe estimator · Add a dark mode toggle and tighten the spacing around the pricing cards."
		);
	});

	it("formats telemetry as a Base44-style thought disclosure", () => {
		expect(formatThoughtDuration(84_900)).toBe("Thought for 85s");
		expect(formatThoughtDuration(null)).toBeNull();
	});
});
