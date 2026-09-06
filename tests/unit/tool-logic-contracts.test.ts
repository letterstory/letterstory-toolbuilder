import { describe, expect, it } from "vitest";
import {
	buildRepresentativeInputs,
	createZodSchemaFromSpec,
	type ToolLogicContract,
} from "../../src/lib/tool-logic/spec";

const taxContract: ToolLogicContract = {
	input: {
		type: "object",
		fields: {
			filingStatus: {
				type: "string",
				enum: ["single", "married_jointly"],
			},
			taxableIncome: { type: "number", minimum: 0 },
			qualifyingChildren: { type: "integer", minimum: 0, optional: true },
		},
	},
	output: {
		type: "object",
		fields: {
			estimatedTax: { type: "number", minimum: 0 },
			effectiveRatePercent: { type: "number", minimum: 0, maximum: 100 },
			brackets: {
				type: "array",
				minItems: 1,
				items: {
					type: "object",
					fields: {
						ratePercent: { type: "number", minimum: 0 },
						taxableAmount: { type: "number", minimum: 0 },
						taxOwed: { type: "number", minimum: 0 },
					},
				},
			},
		},
	},
};

describe("tool logic contract mapping", () => {
	it("builds nested Zod schemas from the generated contract spec", () => {
		const inputSchema = createZodSchemaFromSpec(taxContract.input);
		const outputSchema = createZodSchemaFromSpec(taxContract.output);

		expect(
			inputSchema.parse({
				filingStatus: "single",
				taxableIncome: 90000,
			})
		).toMatchObject({ filingStatus: "single", taxableIncome: 90000 });

		expect(() =>
			inputSchema.parse({ filingStatus: "head_of_household", taxableIncome: 90000 })
		).toThrow(/Expected one of/);
		expect(() => outputSchema.parse({ estimatedTax: -1, effectiveRatePercent: 12, brackets: [] })).toThrow();
	});

	it("derives representative smoke-test inputs that satisfy the contract", () => {
		const inputSchema = createZodSchemaFromSpec(taxContract.input);
		const samples = buildRepresentativeInputs(taxContract);

		expect(samples.length).toBeGreaterThanOrEqual(2);
		expect(samples.length).toBeLessThanOrEqual(3);
		for (const sample of samples) {
			expect(() => inputSchema.parse(sample)).not.toThrow();
		}
	});
});
