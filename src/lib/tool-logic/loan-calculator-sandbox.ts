import type { LoanCalculatorInput, LoanCalculatorOutput } from "@/lib/contracts/tool-logic";
import {
	buildPromotedToolLogicRuntime,
	ensureWarmToolLogicSandbox,
	invokeToolLogicInSandbox,
	type ToolLogicRuntimeMetadata,
} from "@/lib/tool-logic/runtime";
import type { ToolLogicContract } from "@/lib/tool-logic/spec";
import { getLoanCalculatorHandlerSource } from "./loan-calculator-handler-source";

const LOAN_CALCULATOR_TOOL_TAG = "loan-calculator-demo";

export interface LoanCalculatorSandboxInvocation {
	output: LoanCalculatorOutput;
	sandboxName: string;
	snapshotId: string;
}

const loanCalculatorContract: ToolLogicContract = {
	input: {
		type: "object",
		fields: {
			principal: { type: "number", exclusiveMinimum: 0 },
			annualRatePercent: { type: "number", minimum: 0, maximum: 100 },
			termMonths: { type: "integer", minimum: 1, maximum: 600 },
		},
	},
	output: {
		type: "object",
		fields: {
			principal: { type: "number", minimum: 0 },
			annualRatePercent: { type: "number", minimum: 0, maximum: 100 },
			termMonths: { type: "integer", minimum: 1 },
			monthlyRatePercent: { type: "number", minimum: 0 },
			scheduledMonthlyPayment: { type: "number", minimum: 0 },
			finalPayment: { type: "number", minimum: 0 },
			totalPaid: { type: "number", minimum: 0 },
			totalInterest: { type: "number", minimum: 0 },
			amortizationSchedule: {
				type: "array",
				items: {
					type: "object",
					fields: {
						paymentNumber: { type: "integer", minimum: 1 },
						paymentAmount: { type: "number", minimum: 0 },
						principalPaid: { type: "number", minimum: 0 },
						interestPaid: { type: "number", minimum: 0 },
						remainingBalance: { type: "number", minimum: 0 },
					},
				},
				minItems: 1,
			},
		},
	},
};

let runtimePromise: Promise<ToolLogicRuntimeMetadata> | null = null;

async function ensureLoanCalculatorRuntime(): Promise<ToolLogicRuntimeMetadata> {
	if (!runtimePromise) {
		runtimePromise = buildPromotedToolLogicRuntime({
			invokePath: "/api/tools/logic-demo/invoke",
			toolTag: LOAN_CALCULATOR_TOOL_TAG,
			contract: loanCalculatorContract,
			handlerSource: getLoanCalculatorHandlerSource(),
			generationModel: "hand-authored-demo",
			classificationReason: "Prototype sandbox demo for fixed loan-amortization logic.",
			staticAnalysisPassedAt: new Date().toISOString(),
			smokeTestInputs: [
				{ principal: 100000, annualRatePercent: 6, termMonths: 360 },
				{ principal: 25000, annualRatePercent: 0, termMonths: 60 },
				{ principal: 420000, annualRatePercent: 4.5, termMonths: 180 },
			],
		});
		runtimePromise.catch(() => {
			runtimePromise = null;
		});
	}
	return runtimePromise;
}

export async function ensureLoanCalculatorSnapshot(): Promise<string> {
	return (await ensureLoanCalculatorRuntime()).snapshotId;
}

export async function ensureWarmLoanCalculatorSandbox(): Promise<{
	sandboxName: string;
	snapshotId: string;
}> {
	return ensureWarmToolLogicSandbox(await ensureLoanCalculatorRuntime());
}

export async function invokeLoanCalculatorInSandbox(
	input: LoanCalculatorInput
): Promise<LoanCalculatorSandboxInvocation> {
	const runtime = await ensureLoanCalculatorRuntime();
	const result = await invokeToolLogicInSandbox(runtime, input);
	return {
		output: result.output as LoanCalculatorOutput,
		sandboxName: result.sandboxName,
		snapshotId: result.snapshotId,
	};
}
