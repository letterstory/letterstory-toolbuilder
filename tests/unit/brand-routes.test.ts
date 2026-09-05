import { beforeEach, describe, expect, it, vi } from "vitest";

const checkRateLimitMock = vi.hoisted(() => vi.fn());
const getClientIpMock = vi.hoisted(() => vi.fn());
const ingestBrandContextSurfaceMock = vi.hoisted(() => vi.fn());
const ingestBrandContextRateLimitedMock = vi.hoisted(() => vi.fn());
const validateBrandFidelitySurfaceMock = vi.hoisted(() => vi.fn());
const validateBrandFidelityRateLimitedMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/security/rate-limit", () => ({
	checkRateLimit: checkRateLimitMock,
	getClientIp: getClientIpMock,
}));

vi.mock("@/lib/surfaces/brand", () => ({
	ingestBrandContextSurface: ingestBrandContextSurfaceMock,
	ingestBrandContextRateLimited: ingestBrandContextRateLimitedMock,
	validateBrandFidelitySurface: validateBrandFidelitySurfaceMock,
	validateBrandFidelityRateLimited: validateBrandFidelityRateLimitedMock,
}));

import { POST as ingestPost } from "../../src/app/api/brand/ingest/route";
import { POST as validatePost } from "../../src/app/api/brand/validate/route";

beforeEach(() => {
	checkRateLimitMock.mockReset();
	getClientIpMock.mockReset();
	ingestBrandContextSurfaceMock.mockReset();
	ingestBrandContextRateLimitedMock.mockReset();
	validateBrandFidelitySurfaceMock.mockReset();
	validateBrandFidelityRateLimitedMock.mockReset();

	getClientIpMock.mockReturnValue("203.0.113.10");
	checkRateLimitMock.mockResolvedValue({
		allowed: true,
		limit: 20,
		remaining: 19,
		retryAfterSeconds: 0,
	});
});

describe("brand API routes", () => {
	it("returns 400 for an invalid ingest payload", async () => {
		ingestBrandContextSurfaceMock.mockResolvedValueOnce({
			statusCode: 400,
			body: { status: "error", requestedUrl: "", message: "Provide a siteUrl string." },
		});

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

	it("proxies brand ingest surface responses", async () => {
		ingestBrandContextSurfaceMock.mockResolvedValueOnce({
			statusCode: 200,
			body: {
				status: "success",
				requestedUrl: "https://stripe.com",
				profile: { brandName: "Stripe" },
			},
		});

		const response = await ingestPost(
			new Request("http://localhost/api/brand/ingest", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ siteUrl: "https://stripe.com" }),
			})
		);

		expect(ingestBrandContextSurfaceMock).toHaveBeenCalledWith({ siteUrl: "https://stripe.com" });
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			status: "success",
			requestedUrl: "https://stripe.com",
		});
	});

	it("returns 429 for a rate-limited ingest caller", async () => {
		checkRateLimitMock.mockResolvedValueOnce({
			allowed: false,
			limit: 15,
			remaining: 0,
			retryAfterSeconds: 30,
		});
		ingestBrandContextRateLimitedMock.mockReturnValueOnce({
			statusCode: 429,
			headers: { "Retry-After": "30" },
			body: { status: "error", requestedUrl: "", message: "Too many brand ingestion requests — please wait a bit and try again." },
		});

		const response = await ingestPost(
			new Request("http://localhost/api/brand/ingest", { method: "POST", body: JSON.stringify({ siteUrl: "https://stripe.com" }) })
		);

		expect(response.status).toBe(429);
		expect(response.headers.get("Retry-After")).toBe("30");
		expect(ingestBrandContextSurfaceMock).not.toHaveBeenCalled();
	});

	it("returns 400 for an invalid validation payload", async () => {
		validateBrandFidelitySurfaceMock.mockResolvedValueOnce({
			statusCode: 400,
			body: { status: "error", requestedUrl: "", code: "context_dev_error", message: "Provide both siteUrl and profile." },
		});

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

	it("proxies validation surface responses", async () => {
		const profile = { brandName: "Stripe", url: "https://stripe.com" };
		validateBrandFidelitySurfaceMock.mockResolvedValueOnce({
			statusCode: 200,
			body: {
				status: "success",
				requestedUrl: "https://stripe.com",
				assessment: { status: "warn", similarityScore: 72, confidence: "high" },
				referenceUrl: "https://stripe.com",
				model: "claude-sonnet-4-6",
				enrichedProfile: profile,
			},
		});

		const response = await validatePost(
			new Request("http://localhost/api/brand/validate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ siteUrl: "https://stripe.com", profile }),
			})
		);

		expect(validateBrandFidelitySurfaceMock).toHaveBeenCalledWith({ siteUrl: "https://stripe.com", profile });
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			status: "success",
			requestedUrl: "https://stripe.com",
			model: "claude-sonnet-4-6",
		});
	});
});
