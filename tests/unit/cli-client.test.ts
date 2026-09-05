import { describe, expect, it } from "vitest";

import { commandFailed } from "../../cli/client.mjs";

describe("cli client helpers", () => {
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
