import { z } from "zod";
import {
	ingestBrandContextInputSchema,
	ingestBrandContextOutputSchema,
	validateBrandFidelityInputSchema,
	validateBrandFidelityOutputSchema,
} from "@/lib/contracts/brand";
import { getHealthInputSchema, getHealthOutputSchema } from "@/lib/contracts/health";
import {
	generateToolInputSchema,
	generateToolOutputSchema,
	getGeneratedToolInputSchema,
	getGeneratedToolOutputSchema,
	listGeneratedToolsInputSchema,
	listGeneratedToolsOutputSchema,
	rollbackGeneratedToolInputSchema,
	rollbackGeneratedToolOutputSchema,
} from "@/lib/contracts/tools";
import { MCP_RATE_LIMIT_RULES, type McpRateLimitedToolName } from "@/lib/rate-limit/rules";
import { ingestBrandContextSurface, validateBrandFidelitySurface } from "@/lib/surfaces/brand";
import { getHealthPayload } from "@/lib/surfaces/health";
import {
	generateToolSurface,
	getGeneratedToolSurface,
	listGeneratedToolsSurface,
	rollbackGeneratedToolSurface,
} from "@/lib/surfaces/tools";

type McpSchema = z.ZodTypeAny;

export interface McpRegistryEntry<TInput extends McpSchema = McpSchema, TOutput extends McpSchema = McpSchema> {
	name: string;
	description: string;
	capability: string;
	inputSchema: TInput;
	outputSchema: TOutput;
	rateLimitTag?: McpRateLimitedToolName;
	handler: (input: z.infer<TInput>) => Promise<z.infer<TOutput>>;
}

export const MCP_TOOL_REGISTRY = [
	{
		name: "get_health",
		description: "Return the current toolbuilder health and platform scaffold status payload.",
		capability: "health.read",
		inputSchema: getHealthInputSchema,
		outputSchema: getHealthOutputSchema,
		handler: async () => getHealthPayload(),
	},
	{
		name: "ingest_brand_context",
		description: "Ingest Context.dev brand context for a customer site URL.",
		capability: "brand.ingest",
		inputSchema: ingestBrandContextInputSchema,
		outputSchema: ingestBrandContextOutputSchema,
		rateLimitTag: "ingest_brand_context",
		handler: async (input) => (await ingestBrandContextSurface(input)).body,
	},
	{
		name: "validate_brand_fidelity",
		description: "Validate a captured brand profile against the live site reference content.",
		capability: "brand.validate",
		inputSchema: validateBrandFidelityInputSchema,
		outputSchema: validateBrandFidelityOutputSchema,
		rateLimitTag: "validate_brand_fidelity",
		handler: async (input) => (await validateBrandFidelitySurface(input)).body,
	},
	{
		name: "list_generated_tools",
		description: "List generated tools using the existing summary payload that omits HTML bodies.",
		capability: "tools.list",
		inputSchema: listGeneratedToolsInputSchema,
		outputSchema: listGeneratedToolsOutputSchema,
		handler: async () => (await listGeneratedToolsSurface()).body,
	},
	{
		name: "get_generated_tool",
		description: "Get one generated tool detail payload with HTML stripped from the current record and history.",
		capability: "tools.get",
		inputSchema: getGeneratedToolInputSchema,
		outputSchema: getGeneratedToolOutputSchema,
		handler: async (input) => (await getGeneratedToolSurface(input)).body,
	},
	{
		name: "generate_tool",
		description: "Generate or revise a branded tool using the existing orchestration pipeline.",
		capability: "tools.generate",
		inputSchema: generateToolInputSchema,
		outputSchema: generateToolOutputSchema,
		rateLimitTag: "generate_tool",
		handler: async (input) => (await generateToolSurface(input)).body,
	},
	{
		name: "rollback_generated_tool",
		description: "Restore a generated tool to a previous saved version.",
		capability: "tools.rollback",
		inputSchema: rollbackGeneratedToolInputSchema,
		outputSchema: rollbackGeneratedToolOutputSchema,
		handler: async (input) => (await rollbackGeneratedToolSurface(input)).body,
	},
] satisfies McpRegistryEntry[];

export const MCP_TOOLS_BY_NAME = new Map(MCP_TOOL_REGISTRY.map((tool) => [tool.name, tool]));

export function listMcpTools() {
	return MCP_TOOL_REGISTRY.map((tool) => ({
		name: tool.name,
		description: tool.description,
		capability: tool.capability,
		rateLimit: tool.rateLimitTag ? MCP_RATE_LIMIT_RULES[tool.rateLimitTag] : null,
		inputSchema: z.toJSONSchema(tool.inputSchema),
		outputSchema: z.toJSONSchema(tool.outputSchema),
	}));
}
