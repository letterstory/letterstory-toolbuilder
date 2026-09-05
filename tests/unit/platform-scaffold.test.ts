import { beforeEach, describe, expect, it } from "vitest";
import { ingestBrandContext, isBrandIngestionConfigured } from "../../src/lib/brand";
import { requestPorterDeployment, isPorterConfigured } from "../../src/lib/deploy/porter";

const originalEnv = {
	CONTEXT_DEV_API_KEY: process.env.CONTEXT_DEV_API_KEY,
	PORTER_API_TOKEN: process.env.PORTER_API_TOKEN,
};

describe("platform scaffold gates", () => {
	beforeEach(() => {
		if (originalEnv.CONTEXT_DEV_API_KEY === undefined) delete process.env.CONTEXT_DEV_API_KEY;
		else process.env.CONTEXT_DEV_API_KEY = originalEnv.CONTEXT_DEV_API_KEY;

		if (originalEnv.PORTER_API_TOKEN === undefined) delete process.env.PORTER_API_TOKEN;
		else process.env.PORTER_API_TOKEN = originalEnv.PORTER_API_TOKEN;
	});

	it("reports brand ingestion as not configured without a Context.dev key", async () => {
		delete process.env.CONTEXT_DEV_API_KEY;

		expect(isBrandIngestionConfigured()).toBe(false);
		await expect(ingestBrandContext({ siteUrl: "https://example.com" })).resolves.toMatchObject({
			status: "not_configured",
		});
	});

	it("reports Porter deployment as not configured without a token", async () => {
		delete process.env.PORTER_API_TOKEN;

		expect(isPorterConfigured()).toBe(false);
		await expect(
			requestPorterDeployment({ projectName: "demo", artifactRef: "artifact-1" })
		).resolves.toMatchObject({ status: "not_configured" });
	});
});
