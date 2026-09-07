import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requestAnthropicText } from "../../src/lib/anthropic/messages";

const originalFetch = global.fetch;
const originalEnv = {
	ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
	ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
};

describe("requestAnthropicText", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
		process.env.ANTHROPIC_API_KEY = "test-key";
		process.env.ANTHROPIC_MODEL = "claude-sonnet-4-6";
		global.fetch = originalFetch;
	});

	afterEach(() => {
		vi.useRealTimers();
		global.fetch = originalFetch;
		for (const [key, value] of Object.entries(originalEnv)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});

	it("retries once when fetch fails before receiving a response", async () => {
		vi.useFakeTimers();
		vi.spyOn(Math, "random").mockReturnValue(0);
		global.fetch = vi
			.fn()
			.mockRejectedValueOnce(new TypeError("fetch failed"))
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						content: [{ type: "text", text: "ok" }],
					}),
					{ status: 200 }
				)
			) as typeof fetch;

		const responsePromise = requestAnthropicText({
			system: "system",
			userContent: "user",
			maxTokens: 32,
			timeoutMs: 1_000,
		});

		await vi.advanceTimersByTimeAsync(200);

		await expect(responsePromise).resolves.toEqual({
			text: "ok",
			model: "claude-sonnet-4-6",
		});
		expect(global.fetch).toHaveBeenCalledTimes(2);
	});

	it("does not retry abort errors from the request timeout", async () => {
		const abortError = new DOMException("The operation was aborted.", "AbortError");
		global.fetch = vi.fn().mockRejectedValue(abortError) as typeof fetch;

		await expect(
			requestAnthropicText({
				system: "system",
				userContent: "user",
				maxTokens: 32,
				timeoutMs: 1_000,
			})
		).rejects.toThrow(/aborted/i);
		expect(global.fetch).toHaveBeenCalledTimes(1);
	});
});
