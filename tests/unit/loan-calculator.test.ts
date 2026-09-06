import { describe, expect, it } from "vitest";
import { calculateLoanAmortization } from "../../src/lib/tool-logic/loan-calculator";

describe("calculateLoanAmortization", () => {
	it("matches a standard 30-year fixed amortization schedule", () => {
		const result = calculateLoanAmortization({
			principal: 100_000,
			annualRatePercent: 6,
			termMonths: 360,
		});

		expect(result.scheduledMonthlyPayment).toBe(599.55);
		expect(result.finalPayment).toBe(600);
		expect(result.totalPaid).toBe(215_838.45);
		expect(result.totalInterest).toBe(115_838.45);
		expect(result.amortizationSchedule[0]).toEqual({
			paymentNumber: 1,
			paymentAmount: 599.55,
			principalPaid: 99.55,
			interestPaid: 500,
			remainingBalance: 99_900.45,
		});
		expect(result.amortizationSchedule.at(-1)).toEqual({
			paymentNumber: 360,
			paymentAmount: 600,
			principalPaid: 597.01,
			interestPaid: 2.99,
			remainingBalance: 0,
		});
	});

	it("handles zero-interest loans cleanly", () => {
		const result = calculateLoanAmortization({
			principal: 12_000,
			annualRatePercent: 0,
			termMonths: 24,
		});

		expect(result.scheduledMonthlyPayment).toBe(500);
		expect(result.finalPayment).toBe(500);
		expect(result.totalPaid).toBe(12_000);
		expect(result.totalInterest).toBe(0);
		expect(result.amortizationSchedule[0]).toEqual({
			paymentNumber: 1,
			paymentAmount: 500,
			principalPaid: 500,
			interestPaid: 0,
			remainingBalance: 11_500,
		});
		expect(result.amortizationSchedule).toHaveLength(24);
	});
});
