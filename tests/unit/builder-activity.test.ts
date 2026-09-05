import { describe, expect, it } from "vitest";
import {
	buildGenerationRun,
	estimateActivitySteps,
	estimateProgress,
	parseGenerationTelemetry,
} from "@/components/tools/builder-activity";

function responseWithHeaders(headers: Record<string, string>) {
	return new Response(JSON.stringify({ status: "success" }), { headers });
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
});
