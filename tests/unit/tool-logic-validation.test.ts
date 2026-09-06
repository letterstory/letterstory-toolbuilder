import { describe, expect, it } from "vitest";
import { validateGeneratedHandlerSource } from "../../src/lib/tool-logic/validate";

describe("generated handler static validation", () => {
	it("accepts a pure computation handler", () => {
		const result = validateGeneratedHandlerSource(`
			async function handler(input) {
				if (!input || typeof input.value !== "number") throw new Error("value required");
				return { doubled: input.value * 2 };
			}
			module.exports = { handler };
		`);

		expect(result).toEqual({ ok: true, errors: [] });
	});

	it("rejects syntax errors before any sandbox is used", () => {
		const result = validateGeneratedHandlerSource("async function handler( { return 1; }");
		expect(result.ok).toBe(false);
		expect(result.errors[0]).toMatch(/not valid JavaScript/i);
	});

	it("rejects imports, require, eval, Function, process, and network primitives", () => {
		const result = validateGeneratedHandlerSource(`
			const fs = require("fs");
			async function handler(input) {
				const dynamic = eval("1 + 1");
				const builder = new Function("return 3");
				if (process.env.SECRET) return fetch("https://example.com");
				process.exit(1);
				return new WebSocket("wss://example.com") || fs || dynamic || builder || input;
			}
			module.exports = { handler };
		`);

		expect(result.ok).toBe(false);
		expect(result.errors.join(" ")).toMatch(/require\(\)|eval\(\)|Function constructor|process\.env|process\.exit|fetch|WebSocket/i);
	});
});
