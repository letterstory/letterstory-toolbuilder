import { afterEach, describe, expect, it, vi } from "vitest";

import { ToolbuilderClient, commandFailed, parseArgv } from "../../cli/client.mjs";
import { runCliMain } from "../../cli/toolbuilder.mjs";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("cli client helpers", () => {
	it("parses space-separated option values", () => {
		expect(parseArgv(["generate", "--prompt", "BMI calculator"])).toEqual({
			positionals: ["generate"],
			options: { prompt: "BMI calculator" },
		});
	});

	it("parses equals-style option values", () => {
		expect(parseArgv(["generate", "--prompt=BMI calculator"])).toEqual({
			positionals: ["generate"],
			options: { prompt: "BMI calculator" },
		});
	});

	it("preserves subcommand flags when parsing top-level global options", () => {
		expect(
			parseArgv(["--url", "https://example.com", "brand", "ingest", "--site-url", "https://stripe.com"], {
				stopAtFirstPositional: true,
			})
		).toEqual({
			positionals: ["brand", "ingest", "--site-url", "https://stripe.com"],
			options: { url: "https://example.com" },
		});
	});

	it("does not treat the health payload's nested status object as a failure", () => {
		expect(
			commandFailed({
				ok: true,
				service: "letterstory-toolbuilder",
				status: { modules: [] },
			})
		).toBe(false);
	});

	it("treats non-success string statuses as failures", () => {
		expect(commandFailed({ status: "error", message: "nope" })).toBe(true);
	});

	it("prints a clear error and exits non-zero when the server returns non-JSON", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response("<html><body>503 Service Unavailable</body></html>", {
					status: 503,
					headers: { "Content-Type": "text/html; charset=utf-8" },
				})
			)
		);

		const errorLog = vi.fn();

		await expect(
			new ToolbuilderClient({ baseUrl: "https://toolbuilder.example.com" }).callTool("get_health", {})
		).rejects.toThrow(
			"Server returned a non-JSON response (HTTP 503). This can happen during deploys/cold starts — wait a moment and retry. (Content-Type: text/html; charset=utf-8)"
		);

		await expect(runCliMain(["health"], { logError: errorLog })).resolves.toBe(1);
		expect(errorLog).toHaveBeenCalledWith(
			"Server returned a non-JSON response (HTTP 503). This can happen during deploys/cold starts — wait a moment and retry. (Content-Type: text/html; charset=utf-8)"
		);
		expect(errorLog).not.toHaveBeenCalledWith(expect.stringContaining("Unexpected token"));
	});
});
