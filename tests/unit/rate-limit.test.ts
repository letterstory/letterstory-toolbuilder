import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("checkRateLimit (in-memory fallback)", () => {
	beforeEach(() => {
		vi.resetModules();
		delete process.env.SUPABASE_URL;
		delete process.env.SUPABASE_SERVICE_ROLE_KEY;
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("allows requests up to the configured max, then blocks with a Retry-After", async () => {
		const { checkRateLimit } = await import("@/lib/security/rate-limit");
		const rule = { bucket: `test.bucket.${Math.random()}`, max: 3, windowSeconds: 60 };

		const first = await checkRateLimit("1.2.3.4", rule);
		const second = await checkRateLimit("1.2.3.4", rule);
		const third = await checkRateLimit("1.2.3.4", rule);
		const fourth = await checkRateLimit("1.2.3.4", rule);

		expect(first.allowed).toBe(true);
		expect(second.allowed).toBe(true);
		expect(third.allowed).toBe(true);
		expect(fourth.allowed).toBe(false);
		expect(fourth.retryAfterSeconds).toBeGreaterThan(0);
	});

	it("keeps counters independent per identifier", async () => {
		const { checkRateLimit } = await import("@/lib/security/rate-limit");
		const rule = { bucket: `test.bucket.${Math.random()}`, max: 1, windowSeconds: 60 };

		const first = await checkRateLimit("1.1.1.1", rule);
		const second = await checkRateLimit("2.2.2.2", rule);

		expect(first.allowed).toBe(true);
		expect(second.allowed).toBe(true);
	});

	it("keeps counters independent per bucket for the same identifier", async () => {
		const { checkRateLimit } = await import("@/lib/security/rate-limit");
		const ruleA = { bucket: `test.bucket.a.${Math.random()}`, max: 1, windowSeconds: 60 };
		const ruleB = { bucket: `test.bucket.b.${Math.random()}`, max: 1, windowSeconds: 60 };

		const first = await checkRateLimit("9.9.9.9", ruleA);
		const second = await checkRateLimit("9.9.9.9", ruleB);

		expect(first.allowed).toBe(true);
		expect(second.allowed).toBe(true);
	});

	it("resets the window after it expires", async () => {
		vi.useFakeTimers();
		const { checkRateLimit } = await import("@/lib/security/rate-limit");
		const rule = { bucket: `test.bucket.${Math.random()}`, max: 1, windowSeconds: 1 };

		const first = await checkRateLimit("5.5.5.5", rule);
		const blocked = await checkRateLimit("5.5.5.5", rule);
		vi.advanceTimersByTime(1100);
		const afterWindow = await checkRateLimit("5.5.5.5", rule);

		expect(first.allowed).toBe(true);
		expect(blocked.allowed).toBe(false);
		expect(afterWindow.allowed).toBe(true);
	});
});

describe("getClientIp", () => {
	it("prefers the first entry in x-forwarded-for", async () => {
		const { getClientIp } = await import("@/lib/security/rate-limit");
		const request = new Request("http://localhost/api/tools/generate", {
			headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" },
		});
		expect(getClientIp(request)).toBe("203.0.113.5");
	});

	it("falls back to x-real-ip when x-forwarded-for is absent", async () => {
		const { getClientIp } = await import("@/lib/security/rate-limit");
		const request = new Request("http://localhost/api/tools/generate", {
			headers: { "x-real-ip": "198.51.100.9" },
		});
		expect(getClientIp(request)).toBe("198.51.100.9");
	});

	it("falls back to 'unknown' when no IP headers are present", async () => {
		const { getClientIp } = await import("@/lib/security/rate-limit");
		const request = new Request("http://localhost/api/tools/generate");
		expect(getClientIp(request)).toBe("unknown");
	});
});
