export interface ToolGenerationRequest {
	projectName: string;
	siteUrl: string;
	prompt: string;
}

export interface ToolGenerationJob {
	status: "queued" | "not_implemented";
	message: string;
	request: ToolGenerationRequest;
}

export async function enqueueToolGeneration(
	request: ToolGenerationRequest
): Promise<ToolGenerationJob> {
	return {
		status: "not_implemented",
		message:
			"Coding-agent orchestration is intentionally left as a follow-up integration.",
		request,
	};
}
