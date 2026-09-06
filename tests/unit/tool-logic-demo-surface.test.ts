import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeLoanCalculatorInSandboxMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tool-logic/loan-calculator-sandbox", () => ({
	invokeLoanCalculatorInSandbox: invokeLoanCalculatorInSandboxMock,
}));

import { invokeLoanCalculatorDemoSurface } from "../../src/lib/surfaces/tool-logic-demo";

beforeEach(() => {
	invokeLoanCalculatorInSandboxMock.mockReset();
});

describe("invokeLoanCalculatorDemoSurface", () => {
	it("rejects invalid payloads before invoking Porter", async () => {
		const response = await invokeLoanCalculatorDemoSurface({
			principal: "100000",
			annualRatePercent: 6,
			termMonths: 360,
		});

		expect(response.statusCode).toBe(400);
		expect(response.body).toMatchObject({
			status: "error",
			message: "Provide numeric principal, annualRatePercent, and termMonths values.",
		});
		expect(invokeLoanCalculatorInSandboxMock).not.toHaveBeenCalled();
	});

	it("returns sandbox-backed amortization results", async () => {
		invokeLoanCalculatorInSandboxMock.mockResolvedValue({
			output: {
				principal: 25_000,
				annualRatePercent: 4.5,
				termMonths: 60,
				monthlyRatePercent: 0.38,
				scheduledMonthlyPayment: 466.08,
				finalPayment: 465.74,
				totalPaid: 27_964.46,
				totalInterest: 2_964.46,
				amortizationSchedule: [
					{
						paymentNumber: 1,
						paymentAmount: 466.08,
						principalPaid: 372.33,
						interestPaid: 93.75,
						remainingBalance: 24_627.67,
					},
				],
			},
			sandboxName: "loan-calculator-demo-warm",
			snapshotId: "snapshot-123",
		});

		const response = await invokeLoanCalculatorDemoSurface({
			principal: 25_000,
			annualRatePercent: 4.5,
			termMonths: 60,
		});

		expect(response.statusCode).toBe(200);
		expect(invokeLoanCalculatorInSandboxMock).toHaveBeenCalledWith({
			principal: 25_000,
			annualRatePercent: 4.5,
			termMonths: 60,
		});
		expect(response.body).toMatchObject({
			status: "success",
			sandbox: {
				sandboxName: "loan-calculator-demo-warm",
				snapshotId: "snapshot-123",
			},
			output: {
				scheduledMonthlyPayment: 466.08,
				totalInterest: 2_964.46,
			},
		});
	});

	it("normalizes sandbox failures into a JSON 500 response", async () => {
		invokeLoanCalculatorInSandboxMock.mockRejectedValue(new Error("no running task found"));

		const response = await invokeLoanCalculatorDemoSurface({
			principal: 25_000,
			annualRatePercent: 4.5,
			termMonths: 60,
		});

		expect(response.statusCode).toBe(500);
		expect(response.body).toMatchObject({
			status: "error",
			message: expect.stringContaining("no running task found"),
		});
	});
});
