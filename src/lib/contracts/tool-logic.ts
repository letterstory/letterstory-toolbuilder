import { z } from "zod";

const moneySchema = z.number().finite().nonnegative();

export const loanCalculatorInputSchema = z.object({
	principal: z.number().finite().positive(),
	annualRatePercent: z.number().finite().min(0).max(100),
	termMonths: z.number().int().positive().max(600),
});

export const loanCalculatorPaymentSchema = z.object({
	paymentNumber: z.number().int().positive(),
	paymentAmount: moneySchema,
	principalPaid: moneySchema,
	interestPaid: moneySchema,
	remainingBalance: moneySchema,
});

export const loanCalculatorOutputSchema = z.object({
	principal: moneySchema,
	annualRatePercent: z.number().finite().min(0).max(100),
	termMonths: z.number().int().positive(),
	monthlyRatePercent: moneySchema,
	scheduledMonthlyPayment: moneySchema,
	finalPayment: moneySchema,
	totalPaid: moneySchema,
	totalInterest: moneySchema,
	amortizationSchedule: z.array(loanCalculatorPaymentSchema),
});

export const loanCalculatorInvokeResponseSchema = z.union([
	z.object({
		status: z.literal("success"),
		output: loanCalculatorOutputSchema,
		sandbox: z.object({
			sandboxName: z.string().min(1),
			snapshotId: z.string().min(1),
		}),
	}),
	z.object({
		status: z.literal("error"),
		message: z.string(),
	}),
]);

export type LoanCalculatorInput = z.infer<typeof loanCalculatorInputSchema>;
export type LoanCalculatorOutput = z.infer<typeof loanCalculatorOutputSchema>;
