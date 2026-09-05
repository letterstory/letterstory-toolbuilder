import { generateTool } from "@/lib/generation";
import { getGeneratedTool, listGeneratedTools, rollbackGeneratedTool } from "@/lib/generation/store";
import {
	generateToolInputSchema,
	generateToolOutputSchema,
	generatedToolDetailSchema,
	generatedToolSummarySchema,
	getGeneratedToolInputSchema,
	getGeneratedToolOutputSchema,
	listGeneratedToolsOutputSchema,
	rollbackGeneratedToolInputSchema,
	rollbackGeneratedToolOutputSchema,
} from "@/lib/contracts/tools";
import type { GeneratedToolRecord } from "@/lib/generation/store";
import type { SurfaceHttpResult } from "./brand";

function toToolSummary(tool: GeneratedToolRecord) {
	return generatedToolSummarySchema.parse({
		id: tool.id,
		projectName: tool.projectName,
		prompt: tool.prompt,
		siteUrl: tool.siteUrl,
		brandSnapshot: tool.brandSnapshot,
		copy: tool.copy,
		brandFidelity: tool.brandFidelity,
		model: tool.model,
		warnings: tool.warnings,
		createdAt: tool.createdAt,
		updatedAt: tool.updatedAt,
		version: tool.version,
		previousVersionCount: tool.history.length,
	});
}

function toToolDetail(tool: GeneratedToolRecord) {
	return generatedToolDetailSchema.parse({
		id: tool.id,
		projectName: tool.projectName,
		prompt: tool.prompt,
		siteUrl: tool.siteUrl,
		brandSnapshot: tool.brandSnapshot,
		copy: tool.copy,
		brandFidelity: tool.brandFidelity,
		model: tool.model,
		warnings: tool.warnings,
		createdAt: tool.createdAt,
		updatedAt: tool.updatedAt,
		version: tool.version,
		history: tool.history.map((entry) => ({
			version: entry.version,
			createdAt: entry.createdAt,
			projectName: entry.projectName,
			prompt: entry.prompt,
			siteUrl: entry.siteUrl,
			brandSnapshot: entry.brandSnapshot,
			copy: entry.copy,
			brandFidelity: entry.brandFidelity,
			model: entry.model,
			warnings: entry.warnings,
		})),
	});
}

function diagnosticsHeaders(diagnostics: {
	totalMs: number;
	brandContextMs: number;
	buildMs: number;
	advisoryMs: number;
	htmlAttempts: Array<{ attempt: number; outcome: string; durationMs: number; timeoutMs: number }>;
}) {
	return {
		"Server-Timing": [
			`total;dur=${diagnostics.totalMs}`,
			`brand;dur=${diagnostics.brandContextMs}`,
			`build;dur=${diagnostics.buildMs}`,
			`advisory;dur=${diagnostics.advisoryMs}`,
		].join(", "),
		"X-Tool-Generation-Attempts": diagnostics.htmlAttempts
			.map((attempt) => `${attempt.attempt}:${attempt.outcome}:${attempt.durationMs}/${attempt.timeoutMs}`)
			.join("|"),
	};
}

export async function listGeneratedToolsSurface(): Promise<
	SurfaceHttpResult<ReturnType<typeof listGeneratedToolsOutputSchema.parse>>
> {
	const tools = await listGeneratedTools();
	return {
		statusCode: 200,
		body: listGeneratedToolsOutputSchema.parse({
			status: "success",
			tools: tools.map(toToolSummary),
		}),
	};
}

export async function getGeneratedToolSurface(
	input: unknown
): Promise<SurfaceHttpResult<ReturnType<typeof getGeneratedToolOutputSchema.parse>>> {
	const parsed = getGeneratedToolInputSchema.safeParse(input);
	if (!parsed.success || !parsed.data.id.trim()) {
		return {
			statusCode: 404,
			body: getGeneratedToolOutputSchema.parse({ status: "error", message: "Tool not found." }),
		};
	}

	const tool = await getGeneratedTool(parsed.data.id);
	if (!tool) {
		return {
			statusCode: 404,
			body: getGeneratedToolOutputSchema.parse({ status: "error", message: "Tool not found." }),
		};
	}

	return {
		statusCode: 200,
		body: getGeneratedToolOutputSchema.parse({ status: "success", tool: toToolDetail(tool) }),
	};
}

export async function generateToolSurface(
	body: unknown
): Promise<SurfaceHttpResult<ReturnType<typeof generateToolOutputSchema.parse>>> {
	const parsed = generateToolInputSchema.safeParse(body);
	if (!parsed.success || !parsed.data.prompt.trim()) {
		return {
			statusCode: 400,
			body: generateToolOutputSchema.parse({
				status: "error",
				message: "Describe the tool you want generated.",
			}),
		};
	}

	const result = await generateTool({
		projectName: typeof parsed.data.projectName === "string" ? parsed.data.projectName : "",
		siteUrl: typeof parsed.data.siteUrl === "string" ? parsed.data.siteUrl : "",
		prompt: parsed.data.prompt,
		toolId:
			typeof parsed.data.toolId === "string" && parsed.data.toolId.trim()
				? parsed.data.toolId.trim()
				: undefined,
	});
	const { diagnostics, ...responseBody } = result;

	return {
		statusCode: result.status === "success" ? 200 : 400,
		body: generateToolOutputSchema.parse(responseBody),
		headers: diagnostics ? diagnosticsHeaders(diagnostics) : undefined,
	};
}

export function generateToolRateLimited(retryAfterSeconds: number) {
	return {
		statusCode: 429,
		body: generateToolOutputSchema.parse({
			status: "error",
			message: "Too many tool generation requests — please wait a bit and try again.",
		}),
		headers: { "Retry-After": String(retryAfterSeconds) },
	} satisfies SurfaceHttpResult<ReturnType<typeof generateToolOutputSchema.parse>>;
}

export async function rollbackGeneratedToolSurface(
	input: unknown
): Promise<SurfaceHttpResult<ReturnType<typeof rollbackGeneratedToolOutputSchema.parse>>> {
	const parsed = rollbackGeneratedToolInputSchema.safeParse(input);
	if (!parsed.success) {
		return {
			statusCode: 400,
			body: rollbackGeneratedToolOutputSchema.parse({
				status: "error",
				message: "Provide the numeric version to restore.",
			}),
		};
	}

	const tool = await rollbackGeneratedTool(parsed.data.id, parsed.data.version);
	if (!tool) {
		return {
			statusCode: 404,
			body: rollbackGeneratedToolOutputSchema.parse({
				status: "error",
				message: "Could not find that tool/version to restore.",
			}),
		};
	}

	return {
		statusCode: 200,
		body: rollbackGeneratedToolOutputSchema.parse({ status: "success", tool }),
	};
}
