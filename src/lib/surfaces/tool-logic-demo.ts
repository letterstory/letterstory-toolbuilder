import {
	loanCalculatorInputSchema,
	loanCalculatorInvokeResponseSchema,
} from "@/lib/contracts/tool-logic";
import { invokeLoanCalculatorInSandbox } from "@/lib/tool-logic/loan-calculator-sandbox";

export interface SurfaceHttpResult<T> {
	statusCode: number;
	body: T;
	headers?: Record<string, string>;
}

export async function invokeLoanCalculatorDemoSurface(
	body: unknown
): Promise<SurfaceHttpResult<ReturnType<typeof loanCalculatorInvokeResponseSchema.parse>>> {
	const parsed = loanCalculatorInputSchema.safeParse(body);
	if (!parsed.success) {
		return {
			statusCode: 400,
			body: loanCalculatorInvokeResponseSchema.parse({
				status: "error",
				message: "Provide numeric principal, annualRatePercent, and termMonths values.",
			}),
		};
	}

	try {
		const result = await invokeLoanCalculatorInSandbox(parsed.data);
		return {
			statusCode: 200,
			body: loanCalculatorInvokeResponseSchema.parse({
				status: "success",
				output: result.output,
				sandbox: {
					sandboxName: result.sandboxName,
					snapshotId: result.snapshotId,
				},
			}),
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error("[loan-calculator-demo-surface]", message);
		return {
			statusCode: 500,
			body: loanCalculatorInvokeResponseSchema.parse({
				status: "error",
				message: `Loan calculator sandbox invocation failed: ${message}`,
			}),
		};
	}
}
