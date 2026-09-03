import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const isSafeHttpsUrlMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/net/ssrf", () => ({
	isSafeHttpsUrl: isSafeHttpsUrlMock,
}));

import { downloadAsLogoPng, looksLikeBannerNotLogo, resolveCanonicalLogo } from "../../src/lib/brand/logo";

const originalFetch = global.fetch;

function mockFetchOnce(options: { ok?: boolean; contentType: string; body: Buffer | string }) {
	const body = typeof options.body === "string" ? Buffer.from(options.body, "utf8") : options.body;
	global.fetch = vi.fn().mockResolvedValue({
		ok: options.ok ?? true,
		headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? options.contentType : null) },
		arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
	});
}

async function makePng(width: number, height: number): Promise<Buffer> {
	return sharp({
		create: { width, height, channels: 4, background: { r: 10, g: 20, b: 200, alpha: 1 } },
	})
		.png()
		.toBuffer();
}

function wrapPngAsIco(png: Buffer): Buffer {
	const header = Buffer.alloc(6);
	header.writeUInt16LE(0, 0); // reserved
	header.writeUInt16LE(1, 2); // type: icon
	header.writeUInt16LE(1, 4); // count

	const entry = Buffer.alloc(16);
	entry.writeUInt8(64, 0); // width
	entry.writeUInt8(64, 1); // height
	entry.writeUInt8(0, 2); // color count
	entry.writeUInt8(0, 3); // reserved
	entry.writeUInt16LE(1, 4); // planes
	entry.writeUInt16LE(32, 6); // bit count
	entry.writeUInt32LE(png.byteLength, 8); // bytes in resource
	entry.writeUInt32LE(header.byteLength + entry.byteLength, 12); // offset

	return Buffer.concat([header, entry, png]);
}

describe("resolveCanonicalLogo / downloadAsLogoPng", () => {
	beforeEach(() => {
		isSafeHttpsUrlMock.mockReset();
		isSafeHttpsUrlMock.mockResolvedValue({ ok: true });
		global.fetch = originalFetch;
	});

	it("flags large wide rasters as banners, not logos", () => {
		expect(looksLikeBannerNotLogo(1200, 600)).toBe(true);
		expect(looksLikeBannerNotLogo(1200, 900)).toBe(false); // not wide enough
		expect(looksLikeBannerNotLogo(400, 100)).toBe(false); // wide but small — a wordmark
	});

	it("rasterizes an SVG candidate to a normalized PNG data URI", async () => {
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><rect width="200" height="80" fill="#123456"/></svg>`;
		mockFetchOnce({ contentType: "image/svg+xml", body: svg });

		const result = await resolveCanonicalLogo(["https://cdn.example.com/logo.svg"]);

		expect(result.sourceUrl).toBe("https://cdn.example.com/logo.svg");
		expect(result.dataUri).toMatch(/^data:image\/png;base64,/);
		expect(result.warnings).toEqual([]);
	});

	it("passes through a well-sized raster logo", async () => {
		const png = await makePng(256, 256);
		mockFetchOnce({ contentType: "image/png", body: png });

		const warnings: string[] = [];
		const bytes = await downloadAsLogoPng("https://cdn.example.com/logo.png", warnings);

		expect(bytes).not.toBeNull();
		expect(warnings).toEqual([]);
	});

	it("rejects a large wide raster as a banner rather than a logo", async () => {
		const png = await makePng(1200, 400);
		mockFetchOnce({ contentType: "image/png", body: png });

		const warnings: string[] = [];
		const bytes = await downloadAsLogoPng("https://cdn.example.com/og-image.png", warnings);

		expect(bytes).toBeNull();
		expect(warnings.some((warning) => warning.includes("wide banner image"))).toBe(true);
	});

	it("rejects a raster below the minimum usable edge size", async () => {
		const png = await makePng(8, 8);
		mockFetchOnce({ contentType: "image/png", body: png });

		const warnings: string[] = [];
		const bytes = await downloadAsLogoPng("https://cdn.example.com/tiny.png", warnings);

		expect(bytes).toBeNull();
	});

	it("decodes an embedded-PNG ICO frame into a usable logo", async () => {
		const png = await makePng(64, 64);
		const ico = wrapPngAsIco(png);
		mockFetchOnce({ contentType: "image/x-icon", body: ico });

		const result = await resolveCanonicalLogo(["https://example.com/favicon.ico"]);

		expect(result.dataUri).toMatch(/^data:image\/png;base64,/);
		expect(result.sourceUrl).toBe("https://example.com/favicon.ico");
	});

	it("skips data-URI candidates and falls back to null when nothing else is usable", async () => {
		const result = await resolveCanonicalLogo(["data:image/png;base64,abc123"]);

		expect(result.dataUri).toBeNull();
		expect(result.sourceUrl).toBeNull();
		expect(result.warnings.length).toBeGreaterThan(0);
	});

	it("skips candidates blocked by the SSRF guard", async () => {
		isSafeHttpsUrlMock.mockResolvedValue({ ok: false, reason: "blocked ip" });
		const fetchSpy = vi.fn();
		global.fetch = fetchSpy;

		const result = await resolveCanonicalLogo(["https://169.254.169.254/logo.png"]);

		expect(result.dataUri).toBeNull();
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("tries later candidates when an earlier one fails to decode", async () => {
		isSafeHttpsUrlMock.mockResolvedValue({ ok: true });
		const goodPng = await makePng(200, 200);
		let call = 0;
		global.fetch = vi.fn().mockImplementation(async () => {
			call += 1;
			if (call === 1) {
				return { ok: false, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) };
			}
			return {
				ok: true,
				headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "image/png" : null) },
				arrayBuffer: async () => goodPng.buffer.slice(goodPng.byteOffset, goodPng.byteOffset + goodPng.byteLength),
			};
		});

		const result = await resolveCanonicalLogo([
			"https://cdn.example.com/broken.png",
			"https://cdn.example.com/fallback.png",
		]);

		expect(result.sourceUrl).toBe("https://cdn.example.com/fallback.png");
		expect(result.dataUri).toMatch(/^data:image\/png;base64,/);
	});
});
