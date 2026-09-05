import { z } from "zod";

export const generatedToolBrandSnapshotSchema = z.object({
	brandName: z.string().nullable(),
	colors: z.record(z.string(), z.string()),
	fonts: z.array(z.string()),
	headingFont: z.string().nullable().optional(),
	bodyFont: z.string().nullable().optional(),
	logoDataUri: z.string().nullable(),
	competitorContext: z
		.object({
			industry: z.string().nullable(),
			signal: z.enum(["matches", "mixed", "diverges", "suspicious_match", "limited"]),
			summary: z.string(),
			target: z.object({
				primaryColor: z.string().nullable(),
				primaryColorFamily: z.enum(["cool", "warm", "neutral", "unknown"]),
				fontFamily: z.string().nullable(),
				fontCategory: z.enum(["sans-serif", "serif", "monospace", "display", "unknown"]),
				logoStyle: z.enum(["wordmark", "logo-mark", "combination", "unknown"]),
			}),
			industryNorms: z.object({
				sampleSize: z.number().int().nonnegative(),
				primaryColorFamily: z.enum(["cool", "warm", "neutral", "unknown"]),
				fontCategory: z.enum(["sans-serif", "serif", "monospace", "display", "unknown"]),
				logoStyle: z.enum(["wordmark", "logo-mark", "combination", "unknown"]),
			}),
			competitors: z.array(
				z.object({
					companyName: z.string(),
					domain: z.string(),
					status: z.enum(["analyzed", "unavailable"]),
					brandName: z.string().nullable(),
					primaryColor: z.string().nullable(),
					primaryColorFamily: z.enum(["cool", "warm", "neutral", "unknown"]),
					fontFamily: z.string().nullable(),
					fontCategory: z.enum(["sans-serif", "serif", "monospace", "display", "unknown"]),
					logoStyle: z.enum(["wordmark", "logo-mark", "combination", "unknown"]),
					notes: z.array(z.string()),
				})
			),
			notes: z.array(z.string()),
		})
		.nullable()
		.optional(),
});

export const generatedToolCopySchema = z.object({
	headline: z.string(),
	supportingCopy: z.string(),
});

export const generatedToolBrandFidelitySchema = z.object({
	verdict: z.enum(["pass", "warn", "fail"]),
	notes: z.string(),
});

export const generatedToolVisualCongruenceSchema = z.object({
	status: z.enum(["pending", "completed", "failed"]),
	congruenceScore: z.number().nullable(),
	verdict: z.enum(["pass", "warn", "fail"]).nullable(),
	notes: z.string(),
	risks: z.array(z.string()),
	referenceUrl: z.string().nullable(),
	analyzedAt: z.string().nullable(),
});

export const generatedToolHistoryEntrySchema = z.object({
	projectName: z.string(),
	prompt: z.string(),
	siteUrl: z.string().nullable(),
	brandSnapshot: generatedToolBrandSnapshotSchema.nullable(),
	html: z.string(),
	copy: generatedToolCopySchema.nullable(),
	brandFidelity: generatedToolBrandFidelitySchema.nullable(),
	visualCongruence: generatedToolVisualCongruenceSchema.nullable(),
	model: z.string(),
	warnings: z.array(z.string()),
	version: z.number().int(),
	createdAt: z.string(),
});

export const generatedToolRecordSchema = z.object({
	id: z.string(),
	projectName: z.string(),
	prompt: z.string(),
	siteUrl: z.string().nullable(),
	brandSnapshot: generatedToolBrandSnapshotSchema.nullable(),
	html: z.string(),
	copy: generatedToolCopySchema.nullable(),
	brandFidelity: generatedToolBrandFidelitySchema.nullable(),
	visualCongruence: generatedToolVisualCongruenceSchema.nullable(),
	model: z.string(),
	warnings: z.array(z.string()),
	createdAt: z.string(),
	version: z.number().int(),
	updatedAt: z.string(),
	history: z.array(generatedToolHistoryEntrySchema),
});

export const generatedToolWithEmbedSchema = generatedToolRecordSchema.extend({
	embedSnippet: z.string(),
});

export const listGeneratedToolsInputSchema = z.object({});

export const generatedToolSummarySchema = generatedToolRecordSchema.omit({
	html: true,
	history: true,
}).extend({
	previousVersionCount: z.number().int().nonnegative(),
});

export const listGeneratedToolsOutputSchema = z.object({
	status: z.literal("success"),
	tools: z.array(generatedToolSummarySchema),
});

export const getGeneratedToolInputSchema = z.object({
	id: z.string(),
});

export const generatedToolDetailSchema = generatedToolWithEmbedSchema.omit({
	html: true,
	history: true,
}).extend({
	history: z.array(
		generatedToolHistoryEntrySchema.omit({
			html: true,
		})
	),
});

export const getGeneratedToolOutputSchema = z.union([
	z.object({
		status: z.literal("success"),
		tool: generatedToolDetailSchema,
	}),
	z.object({
		status: z.literal("error"),
		message: z.string(),
	}),
]);

export const generateToolInputSchema = z.object({
	projectName: z.string().optional(),
	siteUrl: z.string().optional(),
	prompt: z.string(),
	toolId: z.string().optional(),
});

export const suggestToolsInputSchema = z.object({
	siteUrl: z.string(),
});

export const toolSuggestionSchema = z.object({
	title: z.string(),
	description: z.string(),
	prompt: z.string(),
});

export const suggestToolsOutputSchema = z.union([
	z.object({
		status: z.literal("success"),
		requestedUrl: z.string(),
		brand: z.object({
			siteUrl: z.string(),
			brandName: z.string().nullable(),
			industry: z.string(),
			businessSummary: z.string(),
		}),
		suggestions: z.array(toolSuggestionSchema).min(3).max(5),
		model: z.string(),
	}),
	z.object({
		status: z.enum(["not_configured", "error"]),
		requestedUrl: z.string(),
		message: z.string(),
	}),
]);

export const generateToolOutputSchema = z.union([
	z.object({
		status: z.literal("success"),
		tool: generatedToolWithEmbedSchema,
	}),
	z.object({
		status: z.enum(["not_configured", "error"]),
		message: z.string(),
	}),
]);

export const rollbackGeneratedToolInputSchema = z.object({
	id: z.string(),
	version: z.number().int(),
});

export const rollbackGeneratedToolOutputSchema = z.union([
	z.object({
		status: z.literal("success"),
		tool: generatedToolRecordSchema,
	}),
	z.object({
		status: z.literal("error"),
		message: z.string(),
	}),
]);
