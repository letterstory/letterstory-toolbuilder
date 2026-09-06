import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeLoanCalculatorDemoSurfaceMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/surfaces/tool-logic-demo", () => ({
	invokeLoanCalculatorDemoSurface: invokeLoanCalculatorDemoSurfaceMock,
}));

import { POST as invokePost } from "../../src/app/api/tools/logic-demo/invoke/route";

beforeEach(() => {
	invokeLoanCalculatorDemoSurfaceMock.mockReset();
});

describe("POST /api/tools/logic-demo/invoke", () => {
	it("returns 400 on invalid JSON bodies", async () => {
		invokeLoanCalculatorDemoSurfaceMock.mockResolvedValueOnce({
			statusCode: 400,
			body: {
				status: "error",
				message: "Provide numeric principal, annualRatePercent, and termMonths values.",
			},
		});

		const response = await invokePost(
			new Request("http://localhost/api/tools/logic-demo/invoke", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "not json",
			})
		);

		expect(invokeLoanCalculatorDemoSurfaceMock).toHaveBeenCalledWith(null);
		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({ status: "error" });
	});

	it("proxies successful sandbox responses", async () => {
		invokeLoanCalculatorDemoSurfaceMock.mockResolvedValueOnce({
			statusCode: 200,
			body: {
				status: "success",
				sandbox: {
					sandboxName: "loan-calculator-demo-warm",
					snapshotId: "snapshot-123",
				},
				output: {
					principal: 100000,
					annualRatePercent: 6,
					termMonths: 360,
					monthlyRatePercent: 0.5,
					scheduledMonthlyPayment: 599.55,
					finalPayment: 600,
					totalPaid: 215838.45,
					totalInterest: 115838.45,
					amortizationSchedule: [],
				},
			},
		});

		const requestBody = {
			principal: 100000,
			annualRatePercent: 6,
			termMonths: 360,
		};
		const response = await invokePost(
			new Request("http://localhost/api/tools/logic-demo/invoke", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(requestBody),
			})
		);

		expect(invokeLoanCalculatorDemoSurfaceMock).toHaveBeenCalledWith(requestBody);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			status: "success",
			sandbox: { sandboxName: "loan-calculator-demo-warm" },
			output: { scheduledMonthlyPayment: 599.55 },
		});
	});
});
