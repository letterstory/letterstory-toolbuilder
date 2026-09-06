import { z } from "zod";

const baseFieldSpecSchema = z.object({
	description: z.string().trim().min(1).max(400).optional(),
	nullable: z.boolean().optional(),
	optional: z.boolean().optional(),
});

const stringFieldSpecSchema = baseFieldSpecSchema.extend({
	type: z.literal("string"),
	enum: z.array(z.string().min(1)).min(1).max(20).optional(),
	minLength: z.number().int().nonnegative().optional(),
	maxLength: z.number().int().positive().optional(),
	pattern: z.string().min(1).max(200).optional(),
});

const numberFieldSpecSchema = baseFieldSpecSchema.extend({
	type: z.literal("number"),
	minimum: z.number().finite().optional(),
	maximum: z.number().finite().optional(),
	exclusiveMinimum: z.number().finite().optional(),
	exclusiveMaximum: z.number().finite().optional(),
	multipleOf: z.number().finite().positive().optional(),
});

const integerFieldSpecSchema = baseFieldSpecSchema.extend({
	type: z.literal("integer"),
	minimum: z.number().int().optional(),
	maximum: z.number().int().optional(),
	exclusiveMinimum: z.number().int().optional(),
	exclusiveMaximum: z.number().int().optional(),
	multipleOf: z.number().int().positive().optional(),
});

const booleanFieldSpecSchema = baseFieldSpecSchema.extend({
	type: z.literal("boolean"),
});

export type ToolLogicValueSpec =
	| z.infer<typeof stringFieldSpecSchema>
	| z.infer<typeof numberFieldSpecSchema>
	| z.infer<typeof integerFieldSpecSchema>
	| z.infer<typeof booleanFieldSpecSchema>
	| ToolLogicArraySpec
	| ToolLogicObjectSpec;

export interface ToolLogicArraySpec extends z.infer<typeof baseFieldSpecSchema> {
	type: "array";
	items: ToolLogicValueSpec;
	minItems?: number;
	maxItems?: number;
}

export interface ToolLogicObjectSpec extends z.infer<typeof baseFieldSpecSchema> {
	type: "object";
	fields: Record<string, ToolLogicValueSpec>;
}

export const toolLogicValueSpecSchema: z.ZodType<ToolLogicValueSpec> = z.lazy(() =>
	z.union([
		stringFieldSpecSchema,
		numberFieldSpecSchema,
		integerFieldSpecSchema,
		booleanFieldSpecSchema,
		baseFieldSpecSchema.extend({
			type: z.literal("array"),
			items: toolLogicValueSpecSchema,
			minItems: z.number().int().nonnegative().optional(),
			maxItems: z.number().int().positive().optional(),
		}),
		baseFieldSpecSchema.extend({
			type: z.literal("object"),
			fields: z.record(z.string().min(1), toolLogicValueSpecSchema),
		}),
	])
);

export const toolLogicContractSchema = z.object({
	input: toolLogicValueSpecSchema,
	output: toolLogicValueSpecSchema,
});

export type ToolLogicContract = z.infer<typeof toolLogicContractSchema>;

export function createZodSchemaFromSpec(spec: ToolLogicValueSpec): z.ZodTypeAny {
	let schema: z.ZodTypeAny;

	switch (spec.type) {
		case "string": {
			let stringSchema = z.string();
			if (spec.enum?.length) {
				const values = new Set(spec.enum);
				stringSchema = stringSchema.refine((value) => values.has(value), {
					message: `Expected one of: ${spec.enum.join(", ")}` ,
				});
			}
			if (spec.minLength !== undefined) stringSchema = stringSchema.min(spec.minLength);
			if (spec.maxLength !== undefined) stringSchema = stringSchema.max(spec.maxLength);
			if (spec.pattern) stringSchema = stringSchema.regex(new RegExp(spec.pattern));
			schema = stringSchema;
			break;
		}
		case "number": {
			let numberSchema = z.number().finite();
			if (spec.minimum !== undefined) numberSchema = numberSchema.min(spec.minimum);
			if (spec.maximum !== undefined) numberSchema = numberSchema.max(spec.maximum);
			if (spec.exclusiveMinimum !== undefined) numberSchema = numberSchema.gt(spec.exclusiveMinimum);
			if (spec.exclusiveMaximum !== undefined) numberSchema = numberSchema.lt(spec.exclusiveMaximum);
			if (spec.multipleOf !== undefined) numberSchema = numberSchema.multipleOf(spec.multipleOf);
			schema = numberSchema;
			break;
		}
		case "integer": {
			let integerSchema = z.number().int();
			if (spec.minimum !== undefined) integerSchema = integerSchema.min(spec.minimum);
			if (spec.maximum !== undefined) integerSchema = integerSchema.max(spec.maximum);
			if (spec.exclusiveMinimum !== undefined) integerSchema = integerSchema.gt(spec.exclusiveMinimum);
			if (spec.exclusiveMaximum !== undefined) integerSchema = integerSchema.lt(spec.exclusiveMaximum);
			if (spec.multipleOf !== undefined) integerSchema = integerSchema.multipleOf(spec.multipleOf);
			schema = integerSchema;
			break;
		}
		case "boolean":
			schema = z.boolean();
			break;
		case "array": {
			let arraySchema = z.array(createZodSchemaFromSpec(spec.items));
			if (spec.minItems !== undefined) arraySchema = arraySchema.min(spec.minItems);
			if (spec.maxItems !== undefined) arraySchema = arraySchema.max(spec.maxItems);
			schema = arraySchema;
			break;
		}
		case "object": {
			const shape = Object.fromEntries(
				Object.entries(spec.fields).map(([key, value]) => [key, createZodSchemaFromSpec(value)])
			);
			schema = z.object(shape);
			break;
		}
	}

	if (spec.nullable) schema = schema.nullable();
	if (spec.optional) schema = schema.optional();
	return schema;
}

function clampNumber(value: number, minimum?: number, maximum?: number): number {
	let next = value;
	if (minimum !== undefined && next < minimum) next = minimum;
	if (maximum !== undefined && next > maximum) next = maximum;
	return next;
}

function sampleScalar(spec: ToolLogicValueSpec, variant: number, fieldName = "value"): unknown {
	switch (spec.type) {
		case "string": {
			if (spec.enum?.length) return spec.enum[Math.min(variant, spec.enum.length - 1)];
			const seed = fieldName === "email" ? "user@example.com" : `${fieldName}-${variant + 1}`;
			const minLength = spec.minLength ?? 1;
			const repeated = seed.length >= minLength ? seed : seed.padEnd(minLength, "x");
			return spec.maxLength ? repeated.slice(0, spec.maxLength) : repeated;
		}
		case "number": {
			const lowerBound = spec.exclusiveMinimum !== undefined ? spec.exclusiveMinimum + 1 : spec.minimum ?? 1;
			const lower = lowerBound <= 0 && (spec.maximum === undefined || spec.maximum >= 1) ? 1 : lowerBound;
			const upper = spec.exclusiveMaximum !== undefined ? spec.exclusiveMaximum - 1 : spec.maximum;
			const base = variant === 0 ? lower : variant === 1 ? lower * 2 : (upper ?? lower + 10);
			return clampNumber(base, spec.minimum, spec.maximum);
		}
		case "integer": {
			const lowerBound =
				spec.exclusiveMinimum !== undefined ? spec.exclusiveMinimum + 1 : spec.minimum ?? 1;
			const lower = lowerBound <= 0 && (spec.maximum === undefined || spec.maximum >= 1) ? 1 : lowerBound;
			const upper = spec.exclusiveMaximum !== undefined ? spec.exclusiveMaximum - 1 : spec.maximum;
			const base = variant === 0 ? lower : variant === 1 ? lower + 1 : (upper ?? lower + 5);
			return Math.trunc(clampNumber(base, spec.minimum, spec.maximum));
		}
		case "boolean":
			return variant % 2 === 0;
		default:
			return null;
	}
}

function sampleValue(spec: ToolLogicValueSpec, variant: number, fieldName = "value"): unknown {
	if (spec.nullable && variant === 2) return null;

	switch (spec.type) {
		case "array": {
			const minItems = spec.minItems ?? 1;
			const desiredLength = Math.min(spec.maxItems ?? Math.max(minItems, 2), Math.max(minItems, variant + 1));
			return Array.from({ length: desiredLength }, (_, index) =>
				sampleValue(spec.items, Math.min(variant + index, 2), `${fieldName}Item`)
			);
		}
		case "object": {
			const entries = Object.entries(spec.fields)
				.filter(([, value]) => !(variant === 2 && value.optional))
				.map(([key, value]) => [key, sampleValue(value, variant, key)]);
			return Object.fromEntries(entries);
		}
		default:
			return sampleScalar(spec, variant, fieldName);
	}
}

export function buildRepresentativeInputs(contract: ToolLogicContract): unknown[] {
	const inputSchema = createZodSchemaFromSpec(contract.input);
	const unique = new Map<string, unknown>();
	for (const variant of [0, 1, 2]) {
		const candidate = sampleValue(contract.input, variant, "input");
		const parsed = inputSchema.safeParse(candidate);
		if (!parsed.success) continue;
		const key = JSON.stringify(parsed.data);
		if (!unique.has(key)) unique.set(key, parsed.data);
	}
	return [...unique.values()].slice(0, 3);
}

export function summarizeContractForPrompt(contract: ToolLogicContract): string {
	return JSON.stringify(contract, null, 2);
}
