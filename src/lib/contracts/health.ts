import { z } from "zod";

export const scaffoldStatusModuleSchema = z.object({
	name: z.string(),
	state: z.enum(["configured", "pending-config", "stubbed"]),
	summary: z.string(),
	nextSteps: z.array(z.string()),
});

export const platformScaffoldStatusSchema = z.object({
	modules: z.array(scaffoldStatusModuleSchema),
});

export const getHealthInputSchema = z.object({});

export const getHealthOutputSchema = z.object({
	ok: z.literal(true),
	service: z.literal("letterstory-toolbuilder"),
	status: platformScaffoldStatusSchema,
});
