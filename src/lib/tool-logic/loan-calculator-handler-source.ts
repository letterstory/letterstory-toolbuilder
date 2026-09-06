export const LOAN_CALCULATOR_HANDLER_PATH = "/handler.js";

export function getLoanCalculatorHandlerSource(): string {
	return String.raw`#!/usr/bin/env node
function roundCurrency(value) {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

function validateInput(input) {
	if (!input || typeof input !== "object") {
		throw new Error("Expected a JSON object input.");
	}

	const { principal, annualRatePercent, termMonths } = input;
	if (!Number.isFinite(principal) || principal <= 0) {
		throw new Error("principal must be a positive number.");
	}
	if (!Number.isFinite(annualRatePercent) || annualRatePercent < 0 || annualRatePercent > 100) {
		throw new Error("annualRatePercent must be between 0 and 100.");
	}
	if (!Number.isInteger(termMonths) || termMonths <= 0 || termMonths > 600) {
		throw new Error("termMonths must be a positive integer up to 600.");
	}

	return { principal, annualRatePercent, termMonths };
}

function calculateLoanAmortization(input) {
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
	const amortizationSchedule = [];

	for (let paymentNumber = 1; paymentNumber <= input.termMonths; paymentNumber += 1) {
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
		amortizationSchedule.push({
			paymentNumber,
			paymentAmount,
			principalPaid,
			interestPaid,
			remainingBalance,
		});
	}

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

async function main() {
	let raw = "";
	for await (const chunk of process.stdin) {
		raw += chunk;
	}
	const input = validateInput(JSON.parse(raw || "null"));
	const output = calculateLoanAmortization(input);
	process.stdout.write(JSON.stringify(output));
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	process.stderr.write(message + "\n");
	process.exit(1);
});
`;
}
