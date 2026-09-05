import { envServer } from "@/lib/config/env.server";

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";

interface AnthropicMessageBlock {
	type: string;
	text?: string;
}

interface AnthropicMessagesResponse {
	content?: AnthropicMessageBlock[];
	error?: { message?: string };
}

export interface AnthropicTextRequest {
	system: string;
	userContent: string;
	maxTokens: number;
	timeoutMs: number;
}

export interface AnthropicTextResponse {
	text: string;
	model: string;
}

export async function requestAnthropicText(
	request: AnthropicTextRequest
): Promise<AnthropicTextResponse> {
	const apiKey = envServer.ANTHROPIC_API_KEY;
	if (!apiKey) {
		throw new Error("Anthropic is not configured (ANTHROPIC_API_KEY is unset)");
	}

	const model = envServer.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;
	const response = await fetch("https://api.anthropic.com/v1/messages", {
		method: "POST",
		headers: {
			"x-api-key": apiKey,
			"anthropic-version": "2023-06-01",
			"content-type": "application/json",
		},
		body: JSON.stringify({
			model,
			max_tokens: request.maxTokens,
			system: request.system,
			messages: [{ role: "user", content: request.userContent }],
		}),
		signal: AbortSignal.timeout(request.timeoutMs),
	});

	const body = (await response.json().catch(() => ({}))) as AnthropicMessagesResponse;
	if (!response.ok) {
		throw new Error(
			`Anthropic request failed (${response.status}): ${body.error?.message ?? "unknown error"}`
		);
	}

	const text = body.content
		?.filter((block) => block.type === "text")
		.map((block) => block.text ?? "")
		.join("\n")
		.trim();

	if (!text) {
		throw new Error("Anthropic returned no text response.");
	}

	return { text, model };
}
