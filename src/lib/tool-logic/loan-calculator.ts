import type { LoanCalculatorInput, LoanCalculatorOutput } from "@/lib/contracts/tool-logic";

function roundCurrency(value: number): number {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateLoanAmortization(input: LoanCalculatorInput): LoanCalculatorOutput {
	const monthlyRate = input.annualRatePercent / 100 / 12;
	const scheduledMonthlyPayment = roundCurrency(
		monthlyRate === 0
			? input.principal / input.termMonths
			: (input.principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -input.termMonths))
	);

	let remainingBalance = roundCurrency(input.principal);
	let totalPaid = 0;
	let totalInterest = 0;
	let finalPayment = scheduledMonthlyPayment;

	const amortizationSchedule = Array.from({ length: input.termMonths }, (_, index) => {
		const paymentNumber = index + 1;
		const interestPaid = roundCurrency(remainingBalance * monthlyRate);
		const principalPaid =
			paymentNumber === input.termMonths
				? roundCurrency(remainingBalance)
				: roundCurrency(Math.min(remainingBalance, scheduledMonthlyPayment - interestPaid));
		const paymentAmount = roundCurrency(interestPaid + principalPaid);
		remainingBalance = roundCurrency(Math.max(0, remainingBalance - principalPaid));
		totalPaid = roundCurrency(totalPaid + paymentAmount);
		totalInterest = roundCurrency(totalInterest + interestPaid);
		finalPayment = paymentAmount;

		return {
			paymentNumber,
			paymentAmount,
			principalPaid,
			interestPaid,
			remainingBalance,
		};
	});

	return {
		principal: roundCurrency(input.principal),
		annualRatePercent: input.annualRatePercent,
		termMonths: input.termMonths,
		monthlyRatePercent: roundCurrency(input.annualRatePercent / 12),
		scheduledMonthlyPayment,
		finalPayment,
		totalPaid,
		totalInterest,
		amortizationSchedule,
	};
}
