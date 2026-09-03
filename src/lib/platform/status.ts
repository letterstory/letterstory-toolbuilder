import { isBrandIngestionConfigured } from "@/lib/brand";
import { isPorterConfigured } from "@/lib/deploy/porter";

export interface ScaffoldStatusModule {
	name: string;
	state: "configured" | "pending-config" | "stubbed";
	summary: string;
	nextSteps: string[];
}

export interface PlatformScaffoldStatus {
	modules: ScaffoldStatusModule[];
}

export function getPlatformScaffoldStatus(): PlatformScaffoldStatus {
	return {
		modules: [
			{
				name: "Brand ingestion",
				state: isBrandIngestionConfigured() ? "stubbed" : "pending-config",
				summary:
					"Firecrawl-facing contracts exist, but real extraction is gated behind env configuration.",
				nextSteps: [
					"Receive FIRECRAWL_API_KEY for this repository.",
					"Implement site snapshot + brand profile ingestion.",
					"Add validation stages once the ingestion contract is locked.",
				],
			},
			{
				name: "Tool generation",
				state: "stubbed",
				summary:
					"The orchestration boundary is in place for prompt-driven tool builds, without any live agent wiring yet.",
				nextSteps: [
					"Define the generation job contract.",
					"Attach coding-agent execution flow.",
					"Store manifests and preview metadata.",
				],
			},
			{
				name: "Porter deployment",
				state: isPorterConfigured() ? "stubbed" : "pending-config",
				summary:
					"Deployment hooks are organized under a Porter-specific module, waiting on credentials and topology decisions.",
				nextSteps: [
					"Confirm Porter account owner and invite timeline.",
					"Fill in provider credentials.",
					"Implement deploy status + runtime handoff once the embed contract is defined.",
				],
			},
		],
	};
}
