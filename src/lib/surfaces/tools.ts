import { envServer } from "@/lib/config/env.server";
import { generateTool } from "@/lib/generation";
import { getGeneratedTool, listGeneratedTools, rollbackGeneratedTool } from "@/lib/generation/store";
import { suggestToolsForBrand } from "@/lib/tools/suggestions";
import { buildEmbedSnippet } from "@/lib/embed/contract";
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
	suggestToolsInputSchema,
	suggestToolsOutputSchema,
} from "@/lib/contracts/tools";
import type { GeneratedToolRecord } from "@/lib/generation/store";
import type { SurfaceHttpResult } from "./brand";

interface ToolSurfaceContext {
	request?: Request;
}

function toToolSummary(tool: GeneratedToolRecord) {
	return generatedToolSummarySchema.parse({
		id: tool.id,
		projectName: tool.projectName,
		prompt: tool.prompt,
		siteUrl: tool.siteUrl,
		brandSnapshot: tool.brandSnapshot,
		copy: tool.copy,
		brandFidelity: tool.brandFidelity,
		visualCongruence: tool.visualCongruence,
		model: tool.model,
		warnings: tool.warnings,
		createdAt: tool.createdAt,
		updatedAt: tool.updatedAt,
		version: tool.version,
		previousVersionCount: tool.history.length,
	});
}

function toToolDetail(tool: GeneratedToolRecord, request?: Request) {
	return generatedToolDetailSchema.parse({
		id: tool.id,
		projectName: tool.projectName,
		prompt: tool.prompt,
		siteUrl: tool.siteUrl,
		brandSnapshot: tool.brandSnapshot,
		copy: tool.copy,
		brandFidelity: tool.brandFidelity,
		visualCongruence: tool.visualCongruence,
		model: tool.model,
		warnings: tool.warnings,
		createdAt: tool.createdAt,
		updatedAt: tool.updatedAt,
		version: tool.version,
		embedSnippet: buildServerEmbedSnippet(tool, request),
		history: tool.history.map((entry) => ({
			version: entry.version,
			createdAt: entry.createdAt,
			projectName: entry.projectName,
			prompt: entry.prompt,
			siteUrl: entry.siteUrl,
			brandSnapshot: entry.brandSnapshot,
			copy: entry.copy,
			brandFidelity: entry.brandFidelity,
			visualCongruence: entry.visualCongruence,
			model: entry.model,
			warnings: entry.warnings,
		})),
	});
}

function buildServerEmbedSnippet(tool: Pick<GeneratedToolRecord, "id" | "projectName">, request?: Request) {
	return buildEmbedSnippet({
		origin: deriveToolbuilderOrigin(request),
		toolId: tool.id,
		projectName: tool.projectName,
	});
}

function toGeneratedToolWithEmbed(tool: GeneratedToolRecord, request?: Request) {
	return {
		...tool,
		embedSnippet: buildServerEmbedSnippet(tool, request),
	};
}

function firstHeaderValue(value: string | null): string | null {
	if (!value) return null;
	const first = value.split(",")[0]?.trim();
	return first || null;
}

function parseForwardedHeader(header: string | null): { proto: string | null; host: string | null } {
	const firstEntry = firstHeaderValue(header);
	if (!firstEntry) return { proto: null, host: null };
	const protoMatch = firstEntry.match(/proto=([^;,\s]+)/i);
	const hostMatch = firstEntry.match(/host=([^;,\s]+)/i);
	const unquote = (value: string | undefined) => value?.replace(/^"|"$/g, "") ?? null;
	return {
		proto: unquote(protoMatch?.[1]),
		host: unquote(hostMatch?.[1]),
	};
}

function withForwardedPort(host: string, port: string | null, protocol: string): string {
	if (!port || host.includes(":")) return host;
	if ((protocol === "https" && port === "443") || (protocol === "http" && port === "80")) return host;
	return `${host}:${port}`;
}

function deriveToolbuilderOrigin(request?: Request): string {
	if (request) {
		const forwarded = parseForwardedHeader(request.headers.get("forwarded"));
		const protocolFromUrl = new URL(request.url).protocol.replace(/:$/, "") || "http";
		const protocol = firstHeaderValue(request.headers.get("x-forwarded-proto")) ?? forwarded.proto ?? protocolFromUrl;
		const forwardedHost =
			firstHeaderValue(request.headers.get("x-forwarded-host")) ??
			forwarded.host ??
			firstHeaderValue(request.headers.get("host"));
		const host = withForwardedPort(
			forwardedHost ?? new URL(request.url).host,
			firstHeaderValue(request.headers.get("x-forwarded-port")),
			protocol
		);
		if (host) return `${protocol}://${host}`;
		return new URL(request.url).origin;
	}

	return envServer.TOOLBUILDER_BASE_URL || "http://localhost:3000";
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
	input: unknown,
	context: ToolSurfaceContext = {}
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
		body: getGeneratedToolOutputSchema.parse({
			status: "success",
			tool: toToolDetail(tool, context.request),
		}),
	};
}

export async function generateToolSurface(
	body: unknown,
	context: ToolSurfaceContext = {}
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
	if (!parsed.data.projectName?.trim()) {
		return {
			statusCode: 400,
			body: generateToolOutputSchema.parse({
				status: "error",
				message: "Enter a tool name before generating this tool.",
			}),
		};
	}

	const result = await generateTool({
		projectName: parsed.data.projectName,
		siteUrl: typeof parsed.data.siteUrl === "string" ? parsed.data.siteUrl : "",
		prompt: parsed.data.prompt,
		toolId:
			typeof parsed.data.toolId === "string" && parsed.data.toolId.trim()
				? parsed.data.toolId.trim()
				: undefined,
	});
	const { diagnostics, ...responseBody } = result;
	const parsedBody =
		result.status === "success"
			? generateToolOutputSchema.parse({
					status: "success",
					tool: toGeneratedToolWithEmbed(result.tool, context.request),
				})
			: generateToolOutputSchema.parse(responseBody);

	return {
		statusCode: result.status === "success" ? 200 : 400,
		body: parsedBody,
		headers: diagnostics ? diagnosticsHeaders(diagnostics) : undefined,
	};
}

export async function suggestToolsSurface(
	body: unknown
): Promise<SurfaceHttpResult<ReturnType<typeof suggestToolsOutputSchema.parse>>> {
	const parsed = suggestToolsInputSchema.safeParse(body);
	if (!parsed.success || !parsed.data.siteUrl.trim()) {
		return {
			statusCode: 400,
			body: suggestToolsOutputSchema.parse({
				status: "error",
				requestedUrl: "",
				message: "Provide a siteUrl string.",
			}),
		};
	}

	const result = await suggestToolsForBrand(parsed.data.siteUrl);
	return {
		statusCode: result.status === "success" ? 200 : 400,
		body: suggestToolsOutputSchema.parse(result),
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

export function suggestToolsRateLimited(retryAfterSeconds: number) {
	return {
		statusCode: 429,
		body: suggestToolsOutputSchema.parse({
			status: "error",
			requestedUrl: "",
			message: "Too many suggestion requests — please wait a bit and try again.",
		}),
		headers: { "Retry-After": String(retryAfterSeconds) },
	} satisfies SurfaceHttpResult<ReturnType<typeof suggestToolsOutputSchema.parse>>;
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
