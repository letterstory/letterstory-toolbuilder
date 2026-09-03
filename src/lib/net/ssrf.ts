import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export function isBlockedIp(ip: string): boolean {
	const version = isIP(ip);

	if (version === 4) {
		const [a, b] = ip.split(".").map(Number);
		if (a === 10) return true;
		if (a === 127) return true;
		if (a === 0) return true;
		if (a === 169 && b === 254) return true;
		if (a === 172 && b >= 16 && b <= 31) return true;
		if (a === 192 && b === 168) return true;
		if (a === 100 && b >= 64 && b <= 127) return true;
		if (a >= 224) return true;
		return false;
	}

	if (version === 6) {
		const lower = ip.toLowerCase();
		if (lower === "::1" || lower === "::") return true;
		if (lower.startsWith("fe80:") || lower.startsWith("fe80::")) return true;
		if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
		if (lower.startsWith("ff")) return true;

		const mapped = lower.match(/^::ffff:([0-9.]+)$/);
		if (mapped && isIP(mapped[1]) === 4) return isBlockedIp(mapped[1]);

		return false;
	}

	return true;
}

export async function isSafeHttpsUrl(
	raw: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
	let url: URL;

	try {
		url = new URL(raw);
	} catch {
		return { ok: false, reason: "invalid url" };
	}

	if (url.protocol !== "https:") return { ok: false, reason: "must be https" };
	if (!url.hostname) return { ok: false, reason: "missing host" };

	if (isIP(url.hostname)) {
		if (isBlockedIp(url.hostname)) return { ok: false, reason: "blocked ip" };
		return { ok: true };
	}

	const host = url.hostname.toLowerCase();
	if (
		host === "localhost" ||
		host.endsWith(".localhost") ||
		host.endsWith(".local") ||
		host.endsWith(".internal")
	) {
		return { ok: false, reason: "blocked host" };
	}

	try {
		const addresses = await lookup(url.hostname, { all: true });
		if (!addresses.length) return { ok: false, reason: "dns failed" };

		for (const address of addresses) {
			if (isBlockedIp(address.address)) {
				return { ok: false, reason: "resolves to blocked ip" };
			}
		}

		return { ok: true };
	} catch {
		return { ok: false, reason: "dns failed" };
	}
}
