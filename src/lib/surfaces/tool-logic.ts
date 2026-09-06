import { ZodError } from "zod";
import { getGeneratedTool } from "@/lib/generation/store";
import { invokeToolLogicInSandbox } from "@/lib/tool-logic/runtime";
import { createZodSchemaFromSpec } from "@/lib/tool-logic/spec";

export interface SurfaceHttpResult<T> {
	statusCode: number;
	body: T;
	headers?: Record<string, string>;
}

export async function invokeGeneratedToolLogicSurface(
	toolId: string,
	body: unknown
): Promise<
	SurfaceHttpResult<
		| {
				status: "success";
				output: unknown;
				sandbox: { sandboxName: string; snapshotId: string };
		  }
		| { status: "error"; message: string }
	>
> {
	const tool = await getGeneratedTool(toolId);
	if (!tool?.logic) {
		return {
			statusCode: 404,
			body: {
				status: "error",
				message: "Tool logic not found for that tool.",
			},
		};
	}

	const inputSchema = createZodSchemaFromSpec(tool.logic.contract.input);
	const parsed = inputSchema.safeParse(body);
	if (!parsed.success) {
		return {
			statusCode: 400,
			body: {
				status: "error",
				message: parsed.error.issues[0]?.message || "Request body does not match this tool's logic contract.",
			},
		};
	}

	try {
		const result = await invokeToolLogicInSandbox(tool.logic, parsed.data);
		return {
			statusCode: 200,
			body: {
				status: "success",
				output: result.output,
				sandbox: {
					sandboxName: result.sandboxName,
					snapshotId: result.snapshotId,
				},
			},
		};
	} catch (error) {
		const message =
			error instanceof ZodError
				? `Sandbox output did not match the generated contract: ${error.issues[0]?.message ?? error.message}`
				: error instanceof Error
					? error.message
					: String(error);
		console.error("[tool-logic-surface]", message);
		return {
			statusCode: 500,
			body: {
				status: "error",
				message: `Tool logic invocation failed: ${message}`,
			},
		};
	}
}
