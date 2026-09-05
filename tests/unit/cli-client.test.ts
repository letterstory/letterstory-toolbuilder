import { describe, expect, it } from "vitest";

import { commandFailed, parseArgv } from "../../cli/client.mjs";

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
});
