import { requestAnthropicText } from "@/lib/anthropic/messages";
import { TOOL_GENERATION_TARGET_BUDGET_MS } from "@/lib/generation/budgets";
import {
	buildPromotedToolLogicRuntime,
	type ToolLogicRuntimeMetadata,
} from "@/lib/tool-logic/runtime";
import {
	buildRepresentativeInputs,
	summarizeContractForPrompt,
	toolLogicContractSchema,
	type ToolLogicContract,
} from "@/lib/tool-logic/spec";
import { validateGeneratedHandlerSource } from "@/lib/tool-logic/validate";
import { z } from "zod";

export const LOGIC_CLASSIFIER_MAX_TOKENS = 120;
export const LOGIC_CLASSIFIER_TIMEOUT_MS = 8_000;
export const LOGIC_CODEGEN_MAX_TOKENS = 2_400;
export const LOGIC_CODEGEN_TIMEOUT_MS = 25_000;
export const LOGIC_SANDBOX_PROMOTION_TIMEOUT_MS = 40_000;
export const MIN_HTML_BUDGET_AFTER_LOGIC_MS = 180_000;

const classifierResponseSchema = z.object({
	needsServerLogic: z.boolean(),
	reason: z.string().trim().min(1).max(400),
});

const codegenResponseSchema = z.object({
	contract: toolLogicContractSchema,
	handlerSource: z.string().trim().min(1),
});

export interface ToolLogicClassification {
	needsServerLogic: boolean;
	reason: string;
}

export interface ToolLogicPromptContext {
	invokePath: string;
	contract: ToolLogicContract;
	requestExample: unknown;
	responseEnvelopeExample: {
		status: "success";
		output: unknown;
	};
}

export type PrepareToolLogicResult =
	| {
			status: "not_needed";
			classification: ToolLogicClassification;
	  }
	| {
			status: "ready";
			classification: ToolLogicClassification;
			metadata: ToolLogicRuntimeMetadata;
			promptContext: ToolLogicPromptContext;
	  }
	| {
			status: "fallback";
			classification: ToolLogicClassification;
			warning: string;
	  };

function buildInvocationPath(toolId: string): string {
	return `/api/tools/${toolId}/logic/invoke`;
}

export function buildToolLogicTag(toolId: string, version: number): string {
	return `generated-tool-logic-${toolId}-v${version}`;
}

function buildClassificationUserContent(opts: {
	projectName: string;
	prompt: string;
	existingPrompt?: string;
	existingHasServerLogic?: boolean;
}): string {
	return [
		`Tool name: ${opts.projectName || "Untitled tool"}`,
		opts.existingPrompt ? `Existing tool brief: ${opts.existingPrompt}` : null,
		opts.existingPrompt ? `Revision instructions: ${opts.prompt}` : `Requested tool brief: ${opts.prompt}`,
		`Existing server logic: ${opts.existingHasServerLogic ? "yes" : "no"}`,
	].filter(Boolean).join("\n");
}

function extractFirstJsonObject(text: string): string {
	const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const candidate = fencedMatch?.[1]?.trim() || text.trim();
	const start = candidate.indexOf("{");
	if (start < 0) throw new Error("No JSON object found in model response.");
	let depth = 0;
	let inString = false;
	let escape = false;
	for (let index = start; index < candidate.length; index += 1) {
		const char = candidate[index];
		if (inString) {
			if (escape) {
				escape = false;
				continue;
			}
			if (char === "\\") {
				escape = true;
				continue;
			}
			if (char === '"') inString = false;
			continue;
		}
		if (char === '"') {
			inString = true;
			continue;
		}
		if (char === "{") depth += 1;
		if (char === "}") {
			depth -= 1;
			if (depth === 0) return candidate.slice(start, index + 1);
		}
	}
	throw new Error("Incomplete JSON object in model response.");
}

function parseJsonResponse<T>(text: string, schema: z.ZodSchema<T>): T {
	return schema.parse(JSON.parse(extractFirstJsonObject(text)));
}

export async function classifyToolLogicRequirement(opts: {
	projectName: string;
	prompt: string;
	existingPrompt?: string;
	existingHasServerLogic?: boolean;
}): Promise<ToolLogicClassification> {
	const response = await requestAnthropicText({
		system: [
			"You are a strict classifier for whether a generated embedded web tool needs server-side logic.",
			"Return JSON only: {\"needsServerLogic\": boolean, \"reason\": string}.",
			"Answer true only when the resulting tool should keep logic off the client: accurate financial/scientific/business-rule computation, tax calculations, amortization or pricing logic, multi-step conditional rules, logic that should not be inspectable or tamperable in client-side JS, or other server-only execution needs.",
			"Important policy: if the prompt asks for non-trivial financial, scientific, or rule-heavy computation, answer true even when the math could technically run in browser JavaScript.",
			"Answer false only for simple presentational widgets, static forms, content widgets, trivial client-side interactions, or tools whose behavior is mostly UI state with no meaningful protected business logic.",
			"Keep the reason under 25 words.",
		].join("\n"),
		userContent: buildClassificationUserContent(opts),
		maxTokens: LOGIC_CLASSIFIER_MAX_TOKENS,
		timeoutMs: LOGIC_CLASSIFIER_TIMEOUT_MS,
	});
	return parseJsonResponse(response.text, classifierResponseSchema);
}

export async function generateToolLogicCandidate(opts: {
	projectName: string;
	prompt: string;
	invokePath: string;
	existingPrompt?: string;
	existingLogic?: Pick<ToolLogicRuntimeMetadata, "contract" | "handlerSource"> | null;
}): Promise<{ contract: ToolLogicContract; handlerSource: string; model: string }> {
	const response = await requestAnthropicText({
		system: [
			"You generate pure server-side computation modules for embedded tools.",
			"Return JSON only with keys contract and handlerSource.",
			"contract must be { input: <spec>, output: <spec> } where each spec uses only these recursive forms:",
			'{ "type":"object","fields": { ... } }',
			'{ "type":"array","items": <spec>, "minItems"?: number, "maxItems"?: number }',
			'{ "type":"string","enum"?: string[], "minLength"?: number, "maxLength"?: number, "optional"?: boolean, "nullable"?: boolean }',
			'{ "type":"number"|"integer","minimum"?: number,"maximum"?: number,"exclusiveMinimum"?: number,"exclusiveMaximum"?: number,"multipleOf"?: number,"optional"?: boolean,"nullable"?: boolean }',
			'{ "type":"boolean","optional"?: boolean,"nullable"?: boolean }',
			"handlerSource must be a CommonJS module that exports exactly async function handler(input) via module.exports = { handler }.",
			"The handler must be pure computation only: no import, no require, no fetch, no XMLHttpRequest, no WebSocket, no fs, no child_process, no process.env, no process.exit, no eval, no Function constructor.",
			"Validate input inside the handler and throw plain Error messages when invalid.",
			"The returned output must exactly match the output contract.",
			"Use compact, deterministic JavaScript. No comments. No markdown fences.",
		].join("\n"),
		userContent: [
			`Tool name: ${opts.projectName || "Untitled tool"}`,
			opts.existingPrompt ? `Existing tool brief: ${opts.existingPrompt}` : null,
			opts.existingLogic ? `Existing contract: ${summarizeContractForPrompt(opts.existingLogic.contract)}` : null,
			opts.existingLogic ? `Existing handler source:\n${opts.existingLogic.handlerSource}` : null,
			opts.existingPrompt ? `Revision instructions: ${opts.prompt}` : `Requested tool brief: ${opts.prompt}`,
			`Invoke path reserved for the frontend: ${opts.invokePath}`,
			"Design the contract so a browser form can post JSON to that endpoint and render the result without exposing the business logic client-side.",
		].filter(Boolean).join("\n\n"),
		maxTokens: LOGIC_CODEGEN_MAX_TOKENS,
		timeoutMs: LOGIC_CODEGEN_TIMEOUT_MS,
	});
	const parsed = parseJsonResponse(response.text, codegenResponseSchema);
	return { ...parsed, model: response.model };
}

export async function prepareToolLogic(opts: {
	projectName: string;
	prompt: string;
	toolId: string;
	version: number;
	requestStartedAt: number;
	existingPrompt?: string;
	existingLogic?: ToolLogicRuntimeMetadata | null;
}): Promise<PrepareToolLogicResult> {
	let classification;
	try {
		classification = await classifyToolLogicRequirement({
			projectName: opts.projectName,
			prompt: opts.prompt,
			existingPrompt: opts.existingPrompt,
			existingHasServerLogic: Boolean(opts.existingLogic),
		});
	} catch (error) {
		return {
			status: "fallback",
			classification: {
				needsServerLogic: false,
				reason: "Server-side logic classification failed before generation.",
			},
			warning: `Server-side logic classification failed, so this tool generated without server-side logic: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
	if (!classification.needsServerLogic) {
		return { status: "not_needed", classification };
	}

	const invokePath = buildInvocationPath(opts.toolId);
	let candidate;
	try {
		candidate = await generateToolLogicCandidate({
			projectName: opts.projectName,
			prompt: opts.prompt,
			invokePath,
			existingPrompt: opts.existingPrompt,
			existingLogic: opts.existingLogic,
		});
	} catch (error) {
		return {
			status: "fallback",
			classification,
			warning: `Server-side logic generation failed, so this tool fell back to client-side HTML only: ${error instanceof Error ? error.message : String(error)}`,
		};
	}

	const staticValidation = validateGeneratedHandlerSource(candidate.handlerSource);
	if (!staticValidation.ok) {
		return {
			status: "fallback",
			classification,
			warning: `Server-side logic validation rejected the generated handler, so this tool fell back to client-side HTML only: ${staticValidation.errors.join(" ")}`,
		};
	}

	const smokeTestInputs = buildRepresentativeInputs(candidate.contract);
	if (!smokeTestInputs.length) {
		return {
			status: "fallback",
			classification,
			warning:
				"Server-side logic validation could not derive representative smoke-test inputs, so this tool fell back to client-side HTML only.",
		};
	}

	const remainingBudgetMs = TOOL_GENERATION_TARGET_BUDGET_MS - (Date.now() - opts.requestStartedAt);
	const promotionBudgetMs = Math.min(
		LOGIC_SANDBOX_PROMOTION_TIMEOUT_MS,
		remainingBudgetMs - MIN_HTML_BUDGET_AFTER_LOGIC_MS
	);
	if (promotionBudgetMs < 8_000) {
		return {
			status: "fallback",
			classification,
			warning:
				"Server-side logic generation was skipped to preserve enough budget for HTML generation, so this tool fell back to client-side HTML only.",
		};
	}

	try {
		const metadata = await buildPromotedToolLogicRuntime({
			invokePath,
			toolTag: buildToolLogicTag(opts.toolId, opts.version),
			contract: candidate.contract,
			handlerSource: candidate.handlerSource,
			generationModel: candidate.model,
			classificationReason: classification.reason,
			staticAnalysisPassedAt: new Date().toISOString(),
			smokeTestInputs,
			buildTimeoutMs: promotionBudgetMs,
			execTimeoutMs: 10_000,
		});
		return {
			status: "ready",
			classification,
			metadata,
			promptContext: {
				invokePath,
				contract: candidate.contract,
				requestExample: smokeTestInputs[0],
				responseEnvelopeExample: {
					status: "success",
					output: buildRepresentativeInputs({ input: candidate.contract.output, output: candidate.contract.output })[0],
				},
			},
		};
	} catch (error) {
		return {
			status: "fallback",
			classification,
			warning: `Server-side logic sandbox smoke-test/promotion failed, so this tool fell back to client-side HTML only: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

export { summarizeContractForPrompt } from "./spec";
