// Resolves a brand's logo candidates (raw URLs pulled from Context.dev) into a
// single normalized, self-contained PNG data URI.
//
// Why: Context.dev's logo pick is often an app-icon, a favicon ICO, a wide
// og:image banner, or an SVG that renders inconsistently depending on the
// consumer. This mirrors the canonical-logo logic already proven out in the
// main Letterstory app's rehost-logo.ts, minus the storage-bucket upload step
// (toolbuilder has no asset bucket yet) — candidates are normalized in-memory
// and returned as a data URI instead.

import sharp from "sharp";
import { Resvg } from "@resvg/resvg-js";
import { isSafeHttpsUrl } from "@/lib/net/ssrf";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_LOGO_BYTES = 4_000_000;
// Logos render small; 512px on the long edge is plenty and keeps the data
// URI from ballooning.
const MAX_LOGO_EDGE_PX = 512;
const MIN_LOGO_EDGE_PX = 32;

const RASTER_LOGO_MIMES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);

/**
 * A large, wide raster is an og:image/marketing banner that slipped into the
 * logo candidates, not a mark — stamping it on a graphic looks broken.
 * (Wide-but-small wordmarks pass: they're wide, not large.)
 */
export function looksLikeBannerNotLogo(width: number, height: number): boolean {
	return width >= 1000 && width / Math.max(1, height) >= 1.5;
}

export interface CanonicalLogoResult {
	/** data:image/png;base64,... — or null if no candidate could be normalized. */
	dataUri: string | null;
	/** Which candidate source produced the result, or null. */
	sourceUrl: string | null;
	warnings: string[];
}

/**
 * Try each candidate in order (caller's preference first) and normalize the
 * first one that decodes as a usable logo. Fail-soft: returns dataUri null
 * with warnings rather than throwing, so ingestion still succeeds without a
 * canonical logo.
 */
export async function resolveCanonicalLogo(
	candidates: Array<string | null | undefined>
): Promise<CanonicalLogoResult> {
	const warnings: string[] = [];
	const seen = new Set<string>();

	for (const candidate of candidates) {
		if (!candidate || seen.has(candidate)) continue;
		seen.add(candidate);

		const png = await downloadAsLogoPng(candidate, warnings);
		if (!png) continue;

		return {
			dataUri: `data:image/png;base64,${Buffer.from(png).toString("base64")}`,
			sourceUrl: summarizeLogoCandidateSource(candidate),
			warnings,
		};
	}

	warnings.push(
		"No logo candidate could be normalized into a canonical asset; falling back to the raw Context.dev selection."
	);
	return { dataUri: null, sourceUrl: null, warnings };
}

/**
 * Download one candidate and normalize it to PNG bytes, or null if unusable.
 * Exported for unit testing; product code goes through resolveCanonicalLogo.
 */
export async function downloadAsLogoPng(
	url: string,
	warnings: string[]
): Promise<Uint8Array | null> {
	try {
		const resolved = url.startsWith("data:")
			? decodeLogoDataUri(url)
			: await fetchLogoBytes(url);
		if (!resolved) return null;
		const { mime, buffer } = resolved;
		if (buffer.byteLength === 0 || buffer.byteLength > MAX_LOGO_BYTES) return null;

		if (mime === "image/svg+xml" || /\.svg(\?|$)/i.test(url)) {
			// Vector mark → crisp raster at a bounded width, transparency kept.
			const rendered = new Resvg(buffer.toString("utf8"), {
				fitTo: { mode: "width", value: MAX_LOGO_EDGE_PX },
			}).render();
			return rendered.asPng();
		}

		// Favicon ICOs: sharp can't decode the container, but the frames inside
		// are PNGs or plain 32bpp BMPs — pull the largest one so favicon-only
		// sites still get a mark.
		const isIco =
			mime === "image/x-icon" || mime === "image/vnd.microsoft.icon" || /\.ico(\?|$)/i.test(url);
		const decodable = isIco
			? await decodeIcoToPng(buffer)
			: RASTER_LOGO_MIMES.has(mime)
				? buffer
				: null;
		if (!decodable) return null;

		const image = sharp(decodable);
		const meta = await image.metadata();
		const width = meta.width ?? 0;
		const height = meta.height ?? 0;
		if (width < MIN_LOGO_EDGE_PX || height < MIN_LOGO_EDGE_PX) return null;
		if (looksLikeBannerNotLogo(width, height)) {
			warnings.push(
				"A wide banner image was skipped as the logo: it looked like a social/og image."
			);
			return null;
		}

		return new Uint8Array(
			await image
				.resize({
					width: MAX_LOGO_EDGE_PX,
					height: MAX_LOGO_EDGE_PX,
					fit: "inside",
					withoutEnlargement: true,
				})
				.png()
				.toBuffer()
		);
	} catch {
		return null;
	}
}

function summarizeLogoCandidateSource(candidate: string): string {
	if (!candidate.startsWith("data:")) return candidate;
	const match = candidate.match(/^data:([^;,]+)[;,]/i);
	return match?.[1] ? `inline:${match[1].toLowerCase()}` : "inline:data-uri";
}

function decodeLogoDataUri(candidate: string): { mime: string; buffer: Buffer } | null {
	const match = candidate.match(/^data:([^;,]+)((?:;[^,]+)*?),(.*)$/i);
	if (!match) return null;
	const [, rawMime, rawParams, rawPayload] = match;
	const mime = rawMime.trim().toLowerCase();
	const isBase64 = /;base64/i.test(rawParams);
	const payload = rawPayload.trim();

	try {
		const buffer = isBase64
			? Buffer.from(payload, "base64")
			: Buffer.from(decodeURIComponent(payload), "utf8");
		return { mime, buffer };
	} catch {
		return null;
	}
}

async function fetchLogoBytes(url: string): Promise<{ mime: string; buffer: Buffer } | null> {
	const safety = await isSafeHttpsUrl(url);
	if (!safety.ok) return null;

	const res = await fetch(url, {
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		redirect: "follow",
	});
	if (!res.ok) return null;
	const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
	const buffer = Buffer.from(await res.arrayBuffer());
	return { mime, buffer };
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const BITMAPINFOHEADER_SIZE = 40;

/**
 * Decode the largest frame of an ICO container to PNG bytes. Handles the two
 * frame encodings in the wild: embedded PNG (returned as-is) and 32bpp BGRA
 * BMP (decoded manually — sharp/libvips reads neither ICO nor headerless BMP).
 */
async function decodeIcoToPng(ico: Buffer): Promise<Buffer | null> {
	try {
		if (ico.byteLength < 6 || ico.readUInt16LE(0) !== 0 || ico.readUInt16LE(2) !== 1) return null;
		const count = ico.readUInt16LE(4);

		const frames: Array<{ edge: number; frame: Buffer }> = [];
		for (let i = 0; i < count; i++) {
			const entry = 6 + i * 16;
			if (entry + 16 > ico.byteLength) break;
			// Width byte 0 means 256 — the "size" we rank by.
			const edge = ico.readUInt8(entry) || 256;
			const bytes = ico.readUInt32LE(entry + 8);
			const offset = ico.readUInt32LE(entry + 12);
			if (offset + bytes > ico.byteLength) continue;
			frames.push({ edge, frame: ico.subarray(offset, offset + bytes) });
		}
		frames.sort((a, b) => b.edge - a.edge);

		for (const { frame } of frames) {
			if (frame.subarray(0, 4).equals(PNG_MAGIC)) return Buffer.from(frame);

			// BMP frame: BITMAPINFOHEADER with doubled height (XOR pixels + AND mask).
			if (
				frame.byteLength < BITMAPINFOHEADER_SIZE ||
				frame.readUInt32LE(0) !== BITMAPINFOHEADER_SIZE
			)
				continue;
			const width = frame.readInt32LE(4);
			const height = frame.readInt32LE(8) / 2;
			const bitCount = frame.readUInt16LE(14);
			if (bitCount !== 32 || width <= 0 || height <= 0 || width > 1024 || height > 1024) continue;
			const pixelBytes = width * height * 4;
			if (BITMAPINFOHEADER_SIZE + pixelBytes > frame.byteLength) continue;

			// Bottom-up BGRA → top-down RGBA.
			const rgba = Buffer.allocUnsafe(pixelBytes);
			for (let y = 0; y < height; y++) {
				const srcRow = BITMAPINFOHEADER_SIZE + (height - 1 - y) * width * 4;
				const dstRow = y * width * 4;
				for (let x = 0; x < width; x++) {
					rgba[dstRow + x * 4] = frame[srcRow + x * 4 + 2];
					rgba[dstRow + x * 4 + 1] = frame[srcRow + x * 4 + 1];
					rgba[dstRow + x * 4 + 2] = frame[srcRow + x * 4];
					rgba[dstRow + x * 4 + 3] = frame[srcRow + x * 4 + 3];
				}
			}
			return await sharp(rgba, { raw: { width, height, channels: 4 } })
				.png()
				.toBuffer();
		}
		return null;
	} catch {
		return null;
	}
}
