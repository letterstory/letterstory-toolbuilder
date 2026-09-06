export function getLoanCalculatorHandlerSource(): string {
	return String.raw`function roundCurrency(value) {
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

async function handler(input) {
	const validated = validateInput(input);
	const monthlyRate = validated.annualRatePercent / 100 / 12;
	const scheduledMonthlyPayment = roundCurrency(
		monthlyRate === 0
			? validated.principal / validated.termMonths
			: (validated.principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -validated.termMonths))
	);

	let remainingBalance = roundCurrency(validated.principal);
	let totalPaid = 0;
	let totalInterest = 0;
	let finalPayment = scheduledMonthlyPayment;
	const amortizationSchedule = [];

	for (let paymentNumber = 1; paymentNumber <= validated.termMonths; paymentNumber += 1) {
		const interestPaid = roundCurrency(remainingBalance * monthlyRate);
		const principalPaid =
			paymentNumber === validated.termMonths
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
		principal: roundCurrency(validated.principal),
		annualRatePercent: validated.annualRatePercent,
		termMonths: validated.termMonths,
		monthlyRatePercent: roundCurrency(validated.annualRatePercent / 12),
		scheduledMonthlyPayment,
		finalPayment,
		totalPaid,
		totalInterest,
		amortizationSchedule,
	};
}

module.exports = { handler };
`;
}
