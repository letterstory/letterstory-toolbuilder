import { envServer } from "@/lib/config/env.server";

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";
const ANTHROPIC_NETWORK_RETRY_ATTEMPTS = 2;
const ANTHROPIC_NETWORK_RETRY_MIN_DELAY_MS = 200;
const ANTHROPIC_NETWORK_RETRY_MAX_DELAY_MS = 400;

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

function isAbortError(error: unknown): boolean {
	return error instanceof DOMException
		? error.name === "AbortError"
		: error instanceof Error && error.name === "AbortError";
}

function getAnthropicNetworkRetryDelayMs(): number {
	return (
		ANTHROPIC_NETWORK_RETRY_MIN_DELAY_MS +
		Math.floor(
			Math.random() *
				(ANTHROPIC_NETWORK_RETRY_MAX_DELAY_MS - ANTHROPIC_NETWORK_RETRY_MIN_DELAY_MS + 1)
		)
	);
}

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

export async function requestAnthropicText(
	request: AnthropicTextRequest
): Promise<AnthropicTextResponse> {
	const apiKey = envServer.ANTHROPIC_API_KEY;
	if (!apiKey) {
		throw new Error("Anthropic is not configured (ANTHROPIC_API_KEY is unset)");
	}

	const model = envServer.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;
	let response: Response | undefined;
	for (let attempt = 1; attempt <= ANTHROPIC_NETWORK_RETRY_ATTEMPTS; attempt += 1) {
		try {
			response = await fetch("https://api.anthropic.com/v1/messages", {
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
			break;
		} catch (error) {
			if (attempt >= ANTHROPIC_NETWORK_RETRY_ATTEMPTS || isAbortError(error)) {
				throw error;
			}
			await wait(getAnthropicNetworkRetryDelayMs());
		}
	}
	if (!response) {
		throw new Error("Anthropic request failed before receiving a response.");
	}

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
