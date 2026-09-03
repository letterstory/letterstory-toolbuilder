import { describe, expect, it, vi } from "vitest";

const ingestBrandContextMock = vi.hoisted(() => vi.fn());
const validateBrandFidelityMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/brand", () => ({
	ingestBrandContext: ingestBrandContextMock,
	validateBrandFidelity: validateBrandFidelityMock,
}));

import { POST as ingestPost } from "../../src/app/api/brand/ingest/route";
import { POST as validatePost } from "../../src/app/api/brand/validate/route";

describe("brand API routes", () => {
	it("returns 400 for an invalid ingest payload", async () => {
		const response = await ingestPost(
			new Request("http://localhost/api/brand/ingest", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ siteUrl: "" }),
			})
		);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			status: "error",
			message: "Provide a siteUrl string.",
		});
	});

	it("proxies ingestBrandContext responses", async () => {
		ingestBrandContextMock.mockResolvedValueOnce({
			status: "success",
			requestedUrl: "https://stripe.com",
			profile: { brandName: "Stripe" },
		});

		const response = await ingestPost(
			new Request("http://localhost/api/brand/ingest", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ siteUrl: "https://stripe.com" }),
			})
		);

		expect(ingestBrandContextMock).toHaveBeenCalledWith({ siteUrl: "https://stripe.com" });
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			status: "success",
			requestedUrl: "https://stripe.com",
		});
	});

	it("returns 400 for an invalid validation payload", async () => {
		const response = await validatePost(
			new Request("http://localhost/api/brand/validate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ siteUrl: "https://stripe.com" }),
			})
		);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			status: "error",
			message: "Provide both siteUrl and profile.",
		});
	});

	it("proxies validateBrandFidelity responses", async () => {
		const profile = { brandName: "Stripe", url: "https://stripe.com" };
		validateBrandFidelityMock.mockResolvedValueOnce({
			status: "success",
			requestedUrl: "https://stripe.com",
			assessment: { status: "warn", similarityScore: 72, confidence: "high" },
			screenshotUrl: "https://example.com/screenshot.png",
			model: "claude-sonnet-4-6",
			enrichedProfile: profile,
		});

		const response = await validatePost(
			new Request("http://localhost/api/brand/validate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ siteUrl: "https://stripe.com", profile }),
			})
		);

		expect(validateBrandFidelityMock).toHaveBeenCalledWith(profile, "https://stripe.com");
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			status: "success",
			requestedUrl: "https://stripe.com",
			model: "claude-sonnet-4-6",
		});
	});
});
