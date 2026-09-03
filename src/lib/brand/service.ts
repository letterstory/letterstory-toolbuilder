import { envServer } from "@/lib/config/env.server";

export interface BrandIngestionRequest {
	siteUrl: string;
	includeSubpages?: boolean;
}

export interface BrandIngestionResult {
	status: "not_configured" | "not_implemented";
	requestedUrl: string;
	message: string;
}

export function isBrandIngestionConfigured(): boolean {
	return Boolean(envServer.FIRECRAWL_API_KEY);
}

export async function ingestBrandContext(
	request: BrandIngestionRequest
): Promise<BrandIngestionResult> {
	if (!isBrandIngestionConfigured()) {
		return {
			status: "not_configured",
			requestedUrl: request.siteUrl,
			message:
				"Set FIRECRAWL_API_KEY before enabling brand ingestion for this repository.",
		};
	}

	return {
		status: "not_implemented",
		requestedUrl: request.siteUrl,
		message:
			"Firecrawl-backed brand ingestion is scaffolded but not implemented in this initial pass.",
	};
}
