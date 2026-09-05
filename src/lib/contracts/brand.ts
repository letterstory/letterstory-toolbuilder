import { z } from "zod";

const brandToneEnergySchema = z.enum(["low", "medium", "high"]);
const brandTypographyHierarchySchema = z.enum(["display-led", "balanced", "compact"]);
const brandSpacingRhythmSchema = z.enum(["tight", "balanced", "airy"]);
const brandValidationStatusSchema = z.enum(["pass", "warn", "fail"]);
const brandValidationConfidenceSchema = z.enum(["low", "medium", "high"]);
const brandValidationGapSeveritySchema = z.enum(["low", "medium", "high"]);
const brandLogoModeSchema = z.enum(["light", "dark", "has_opaque_background"]);

export const brandFontFaceSchema = z.object({
	family: z.string(),
	google: z.boolean(),
	category: z.string().nullable(),
	files: z.record(z.string(), z.string()),
	fallbacks: z.array(z.string()),
});

export const brandTypographyProfileSchema = z.object({
	primaryFont: z.string().nullable(),
	secondaryFont: z.string().nullable(),
	headingFont: z.string().nullable(),
	bodyFont: z.string().nullable(),
	fontFamilies: z.array(z.string()),
	fontFaces: z.array(brandFontFaceSchema),
	headingFontFace: brandFontFaceSchema.nullable(),
	bodyFontFace: brandFontFaceSchema.nullable(),
	fontStacks: z.object({
		heading: z.array(z.string()).optional(),
		body: z.array(z.string()).optional(),
		paragraph: z.array(z.string()).optional(),
	}),
	scale: z.object({
		h1: z.string().optional(),
		h2: z.string().optional(),
		h3: z.string().optional(),
		body: z.string().optional(),
		small: z.string().optional(),
	}),
	hierarchy: brandTypographyHierarchySchema.nullable(),
});

export const brandSpacingProfileSchema = z.object({
	baseUnit: z.number().nullable(),
	borderRadius: z.string().nullable(),
	radiusScale: z.array(z.string()),
	rhythm: brandSpacingRhythmSchema.nullable(),
});

export const brandComponentStyleSchema = z.object({
	background: z.string().nullable(),
	textColor: z.string().nullable(),
	borderColor: z.string().nullable(),
	borderRadius: z.string().nullable(),
	shadow: z.string().nullable(),
});

export const brandComponentsProfileSchema = z.object({
	primaryButton: brandComponentStyleSchema.nullable(),
	secondaryButton: brandComponentStyleSchema.nullable(),
	input: brandComponentStyleSchema.nullable(),
	additional: z.record(z.string(), brandComponentStyleSchema),
});

export const brandLogoAssetSchema = z.object({
	url: z.string().nullable(),
	kind: z.enum(["url", "data-uri", "unknown"]).nullable(),
	mode: brandLogoModeSchema.nullable(),
	type: z.enum(["icon", "logo"]).nullable(),
	width: z.number().nullable(),
	height: z.number().nullable(),
	colors: z.array(z.string()),
	alt: z.string().nullable(),
	href: z.string().nullable(),
	selectionReasoning: z.string().nullable(),
	selectionConfidence: z.number().nullable(),
	canonicalDataUri: z.string().nullable(),
	canonicalSourceUrl: z.string().nullable(),
	canonicalWarnings: z.array(z.string()),
});

export const brandLogoVariantSchema = z.object({
	url: z.string(),
	kind: z.enum(["url", "data-uri", "unknown"]),
	mode: brandLogoModeSchema,
	type: z.enum(["icon", "logo"]),
	width: z.number(),
	height: z.number(),
	colors: z.array(z.string()),
});

export const brandImagesProfileSchema = z.object({
	logo: brandLogoAssetSchema,
	logoVariants: z.array(brandLogoVariantSchema),
	faviconUrl: z.string().nullable(),
	ogImageUrl: z.string().nullable(),
	gallery: z.array(z.string()),
	imageryStyle: z.string().nullable(),
	notes: z.array(z.string()),
});

export const brandPersonalityProfileSchema = z.object({
	tone: z.string().nullable(),
	toneOfVoice: z.string().nullable(),
	energy: brandToneEnergySchema.nullable(),
	targetAudience: z.string().nullable(),
	descriptors: z.array(z.string()),
	notableSignals: z.array(z.string()),
});

export const brandDesignSystemProfileSchema = z.object({
	framework: z.string().nullable(),
	componentLibrary: z.string().nullable(),
	implementationStyle: z.enum(["custom", "framework-based", "hybrid"]).nullable(),
	notes: z.array(z.string()),
});

export const brandProfileSchema = z.object({
	url: z.string(),
	source: z.literal("context.dev"),
	brandName: z.string().nullable(),
	colorScheme: z.enum(["light", "dark"]).nullable(),
	confidence: z.number().nullable(),
	primaryLogoUrl: z.string().nullable(),
	logoUrls: z.array(z.string()),
	colors: z.record(z.string(), z.string()),
	fonts: z.array(z.string()),
	typography: brandTypographyProfileSchema,
	spacing: brandSpacingProfileSchema,
	components: brandComponentsProfileSchema,
	images: brandImagesProfileSchema,
	personality: brandPersonalityProfileSchema,
	designSystem: brandDesignSystemProfileSchema,
	metadata: z.record(z.string(), z.unknown()),
	raw: z.record(z.string(), z.unknown()),
});

export const ingestBrandContextInputSchema = z.object({
	siteUrl: z.string(),
});

export const ingestBrandContextSuccessSchema = z.object({
	status: z.literal("success"),
	requestedUrl: z.string(),
	profile: brandProfileSchema,
});

export const ingestBrandContextFailureSchema = z.object({
	status: z.enum(["not_configured", "error"]),
	requestedUrl: z.string(),
	message: z.string(),
});

export const ingestBrandContextOutputSchema = z.union([
	ingestBrandContextSuccessSchema,
	ingestBrandContextFailureSchema,
]);

export const brandFidelityGapSchema = z.object({
	field: z.enum([
		"logo",
		"colors",
		"typography",
		"spacing",
		"components",
		"images",
		"personality",
		"designSystem",
	]),
	severity: brandValidationGapSeveritySchema,
	issue: z.string(),
	evidence: z.string(),
	recommendation: z.string(),
});

export const brandDerivedSignalsSchema = z.object({
	toneOfVoice: z.string().nullable(),
	imageryStyle: z.string().nullable(),
	typeHierarchy: brandTypographyHierarchySchema.nullable(),
	spacingRhythm: brandSpacingRhythmSchema.nullable(),
	distinctiveTraits: z.array(z.string()),
});

export const brandFidelityAssessmentSchema = z.object({
	status: brandValidationStatusSchema,
	similarityScore: z.number(),
	confidence: brandValidationConfidenceSchema,
	summary: z.string(),
	confirmedSignals: z.array(z.string()),
	gaps: z.array(brandFidelityGapSchema),
	derivedSignals: brandDerivedSignalsSchema,
});

export const validateBrandFidelityInputSchema = z.object({
	siteUrl: z.string(),
	profile: brandProfileSchema,
});

export const validateBrandFidelitySuccessSchema = z.object({
	status: z.literal("success"),
	requestedUrl: z.string(),
	assessment: brandFidelityAssessmentSchema,
	referenceUrl: z.string(),
	model: z.string(),
	enrichedProfile: brandProfileSchema,
});

export const validateBrandFidelityFailureSchema = z.object({
	status: z.enum(["not_configured", "error"]),
	code: z
		.enum([
			"context_dev_not_configured",
			"anthropic_not_configured",
			"reference_unavailable",
			"context_dev_error",
			"anthropic_error",
		])
		.optional(),
	requestedUrl: z.string(),
	message: z.string(),
});

export const validateBrandFidelityOutputSchema = z.union([
	validateBrandFidelitySuccessSchema,
	validateBrandFidelityFailureSchema,
]);
