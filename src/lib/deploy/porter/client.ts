import { envServer } from "@/lib/config/env.server";

export interface PorterDeploymentRequest {
	projectName: string;
	artifactRef: string;
}

export interface PorterDeploymentResult {
	status: "not_configured" | "not_implemented";
	message: string;
	environment: string;
}

export function isPorterConfigured(): boolean {
	return Boolean(envServer.PORTER_API_TOKEN);
}

export async function requestPorterDeployment(
	request: PorterDeploymentRequest
): Promise<PorterDeploymentResult> {
	const target = `${request.projectName}:${request.artifactRef}`;

	if (!isPorterConfigured()) {
		return {
			status: "not_configured",
			message: `Set PORTER_API_TOKEN before enabling Porter deployments for ${target}.`,
			environment: envServer.PORTER_ENVIRONMENT,
		};
	}

	return {
		status: "not_implemented",
		message: `Porter deployment orchestration for ${target} is scaffolded but deferred until account setup is complete.`,
		environment: envServer.PORTER_ENVIRONMENT,
	};
}
