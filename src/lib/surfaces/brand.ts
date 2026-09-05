import { ingestBrandContext, validateBrandFidelity } from "@/lib/brand";
import {
	ingestBrandContextFailureSchema,
	ingestBrandContextInputSchema,
	ingestBrandContextOutputSchema,
	validateBrandFidelityFailureSchema,
	validateBrandFidelityInputSchema,
	validateBrandFidelityOutputSchema,
} from "@/lib/contracts/brand";

export interface SurfaceHttpResult<T> {
	statusCode: number;
	body: T;
	headers?: HeadersInit;
}

export async function ingestBrandContextSurface(
	body: unknown
): Promise<SurfaceHttpResult<ReturnType<typeof ingestBrandContextOutputSchema.parse>>> {
	const parsed = ingestBrandContextInputSchema.safeParse(body);
	if (!parsed.success || !parsed.data.siteUrl.trim()) {
		return {
			statusCode: 400,
			body: ingestBrandContextFailureSchema.parse({
				status: "error",
				requestedUrl: "",
				message: "Provide a siteUrl string.",
			}),
		};
	}

	const result = await ingestBrandContext({ siteUrl: parsed.data.siteUrl });
	return {
		statusCode: result.status === "error" ? 400 : 200,
		body: ingestBrandContextOutputSchema.parse(result),
	};
}

export function ingestBrandContextRateLimited(retryAfterSeconds: number) {
	return {
		statusCode: 429,
		body: ingestBrandContextFailureSchema.parse({
			status: "error",
			requestedUrl: "",
			message: "Too many brand ingestion requests — please wait a bit and try again.",
		}),
		headers: { "Retry-After": String(retryAfterSeconds) },
	} satisfies SurfaceHttpResult<ReturnType<typeof ingestBrandContextFailureSchema.parse>>;
}

export async function validateBrandFidelitySurface(
	body: unknown
): Promise<SurfaceHttpResult<ReturnType<typeof validateBrandFidelityOutputSchema.parse>>> {
	const parsed = validateBrandFidelityInputSchema.safeParse(body);
	if (!parsed.success || !parsed.data.siteUrl.trim()) {
		return {
			statusCode: 400,
			body: validateBrandFidelityFailureSchema.parse({
				status: "error",
				requestedUrl: "",
				message: "Provide both siteUrl and profile.",
			}),
		};
	}

	const result = await validateBrandFidelity(parsed.data.profile, parsed.data.siteUrl);
	return {
		statusCode: result.status === "error" ? 400 : 200,
		body: validateBrandFidelityOutputSchema.parse(result),
	};
}

export function validateBrandFidelityRateLimited(retryAfterSeconds: number) {
	return {
		statusCode: 429,
		body: validateBrandFidelityFailureSchema.parse({
			status: "error",
			requestedUrl: "",
			message: "Too many validation requests — please wait a bit and try again.",
		}),
		headers: { "Retry-After": String(retryAfterSeconds) },
	} satisfies SurfaceHttpResult<ReturnType<typeof validateBrandFidelityFailureSchema.parse>>;
}
