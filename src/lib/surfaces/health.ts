import { getHealthOutputSchema } from "@/lib/contracts/health";
import { getPlatformScaffoldStatus } from "@/lib/platform/status";

export function getHealthPayload() {
	return getHealthOutputSchema.parse({
		ok: true,
		service: "letterstory-toolbuilder",
		status: getPlatformScaffoldStatus(),
	});
}
