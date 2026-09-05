import { isSafeHttpsUrl } from "@/lib/net/ssrf";
import { sanitizeGeneratedHtml, type SanitizedHtml } from "@/lib/generation/sanitize";
import type {
	GeneratedToolBrandFontFace,
	GeneratedToolBrandSnapshot,
} from "@/lib/generation/store.types";

const FONT_FETCH_TIMEOUT_MS = 15_000;
const MAX_FONT_EMBED_BYTES = 2_500_000;
const SYSTEM_SANS_STACK =
	'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const SYSTEM_SERIF_STACK =
	'"Iowan Old Style", Georgia, Cambria, "Times New Roman", Times, serif';

interface EmbeddedFontSource {
	url: string;
	dataUri: string;
	format: "woff2" | "woff" | "truetype" | "opentype";
	fontWeight: string;
}

interface EmbeddedFontFace {
	family: string;
	sources: EmbeddedFontSource[];
}

interface FontRolePlan {
	stack: string;
	embeddedFamily: string | null;
}

interface BrandFontPlan {
	css: string;
	body: FontRolePlan;
	heading: FontRolePlan;
	brandPrefersSansFallback: boolean;
	embeddedFamilies: Set<string>;
	unloadableFamilies: string[];
	warnings: string[];
}

function quoteFontFamily(family: string): string {
	if (/^[a-z0-9-]+$/i.test(family)) return family;
	return `"${family.replace(/"/g, '\\"')}"`;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeFontFamilyKey(family: string): string {
	return family
		.trim()
		.replace(/^['"]+|['"]+$/g, "")
		.replace(/\s+/g, " ")
		.toLowerCase();
}

function looksSerif(value: string | null | undefined): boolean {
	if (!value) return false;
	return /\b(serif|times|georgia|garamond|baskerville|cambria|didot)\b/i.test(value);
}

function inferSystemStack(face: GeneratedToolBrandFontFace | null | undefined, family: string | null | undefined) {
	if (face?.category === "serif") return SYSTEM_SERIF_STACK;
	if (face?.category === "sans-serif") return SYSTEM_SANS_STACK;
	if (face?.fallbacks.some((fallback) => normalizeFontFamilyKey(fallback) === "serif")) {
		return SYSTEM_SERIF_STACK;
	}
	if (looksSerif(face?.family) || looksSerif(family)) return SYSTEM_SERIF_STACK;
	return SYSTEM_SANS_STACK;
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
	const seen = new Set<string>();
	for (const value of values) {
		if (!value) continue;
		if (seen.has(value)) continue;
		seen.add(value);
	}
	return [...seen];
}

function isGoogleSelfHostable(face: GeneratedToolBrandFontFace | null | undefined): boolean {
	if (!face?.google) return false;
	return Object.values(face.files).some((url) => /^https:\/\//i.test(url));
}

function normalizeFontWeight(token: string): string {
	const trimmed = token.trim().toLowerCase();
	if (!trimmed) return "400";
	if (trimmed === "regular" || trimmed === "normal") return "400";
	if (trimmed === "bold") return "700";
	const rangeMatch = trimmed.match(/^(\d{3})\D+(\d{3})$/);
	if (rangeMatch) return `${rangeMatch[1]} ${rangeMatch[2]}`;
	const exact = trimmed.match(/\d{3}/g);
	if (exact?.length === 1) return exact[0];
	if (exact && exact.length >= 2) return `${exact[0]} ${exact.at(-1)}`;
	return "400";
}

function rankFontWeightKey(key: string, target: number): number {
	const normalized = normalizeFontWeight(key);
	const numbers = normalized.match(/\d{3}/g)?.map((value) => Number(value)) ?? [400];
	const distance = Math.min(...numbers.map((value) => Math.abs(value - target)));
	return distance;
}

function selectFontEntries(face: GeneratedToolBrandFontFace, role: "body" | "heading"): Array<[string, string]> {
	const entries = Object.entries(face.files).filter(([, url]) => /^https:\/\//i.test(url));
	if (!entries.length) return [];
	const primaryTarget = role === "heading" ? 700 : 400;
	const secondaryTarget = role === "heading" ? 400 : 700;
	const sorted = [...entries].sort(
		(left, right) =>
			rankFontWeightKey(left[0], primaryTarget) - rankFontWeightKey(right[0], primaryTarget) ||
			rankFontWeightKey(left[0], secondaryTarget) - rankFontWeightKey(right[0], secondaryTarget) ||
			left[0].localeCompare(right[0])
	);
	const chosen: Array<[string, string]> = [];
	const seenUrls = new Set<string>();
	for (const entry of sorted) {
		if (seenUrls.has(entry[1])) continue;
		chosen.push(entry);
		seenUrls.add(entry[1]);
		if (chosen.length >= 2) break;
	}
	return chosen;
}

function inferFontFormat(url: string, mime: string): EmbeddedFontSource["format"] | null {
	const loweredMime = mime.toLowerCase();
	if (loweredMime.includes("woff2")) return "woff2";
	if (loweredMime.includes("woff")) return "woff";
	if (loweredMime.includes("ttf") || loweredMime.includes("truetype")) return "truetype";
	if (loweredMime.includes("otf") || loweredMime.includes("opentype")) return "opentype";
	const pathname = new URL(url).pathname.toLowerCase();
	if (pathname.endsWith(".woff2")) return "woff2";
	if (pathname.endsWith(".woff")) return "woff";
	if (pathname.endsWith(".ttf")) return "truetype";
	if (pathname.endsWith(".otf")) return "opentype";
	return null;
}

function mimeForFontFormat(format: EmbeddedFontSource["format"]): string {
	switch (format) {
		case "woff2":
			return "font/woff2";
		case "woff":
			return "font/woff";
		case "truetype":
			return "font/ttf";
		case "opentype":
			return "font/otf";
	}
}

async function fetchEmbeddedFontSource(
	url: string,
	fontWeight: string
): Promise<EmbeddedFontSource | null> {
	const safety = await isSafeHttpsUrl(url);
	if (!safety.ok) return null;

	const response = await fetch(url, {
		redirect: "follow",
		signal: AbortSignal.timeout(FONT_FETCH_TIMEOUT_MS),
	});
	if (!response.ok) return null;
	const mime = (response.headers.get("content-type") ?? "").split(";")[0].trim();
	const buffer = Buffer.from(await response.arrayBuffer());
	if (!buffer.byteLength || buffer.byteLength > MAX_FONT_EMBED_BYTES) return null;
	const format = inferFontFormat(url, mime);
	if (!format) return null;
	return {
		url,
		dataUri: `data:${mimeForFontFormat(format)};base64,${buffer.toString("base64")}`,
		format,
		fontWeight,
	};
}

async function embedFontFace(
	face: GeneratedToolBrandFontFace,
	role: "body" | "heading"
): Promise<EmbeddedFontFace | null> {
	if (!isGoogleSelfHostable(face)) return null;
	const entries = selectFontEntries(face, role);
	if (!entries.length) return null;
	const fetched = await Promise.all(
		entries.map(async ([weight, url]) => fetchEmbeddedFontSource(url, normalizeFontWeight(weight)))
	);
	const sources = fetched.filter((source): source is EmbeddedFontSource => Boolean(source));
	if (!sources.length) return null;
	return { family: face.family, sources };
}

function buildFontFaceCss(face: EmbeddedFontFace): string {
	return face.sources
		.map(
			(source) =>
				`@font-face {\n  font-family: ${quoteFontFamily(face.family)};\n  src: url("${source.dataUri}") format("${source.format}");\n  font-style: normal;\n  font-weight: ${source.fontWeight};\n  font-display: swap;\n}`
		)
		.join("\n");
}

function buildRolePlan(
	face: GeneratedToolBrandFontFace | null | undefined,
	family: string | null | undefined,
	embeddedFamilies: Set<string>
): FontRolePlan {
	const systemStack = inferSystemStack(face, family);
	const normalizedFamily = family?.trim() ? family.trim() : null;
	if (normalizedFamily && embeddedFamilies.has(normalizedFamily)) {
		return {
			embeddedFamily: normalizedFamily,
			stack: `${quoteFontFamily(normalizedFamily)}, ${systemStack}`,
		};
	}
	return { embeddedFamily: null, stack: systemStack };
}

function detectSansFallbackPreference(brandSnapshot: GeneratedToolBrandSnapshot): boolean {
	const bodyCategory = brandSnapshot.bodyFontFace?.category?.toLowerCase() ?? null;
	if (bodyCategory === "serif") return false;
	if (bodyCategory === "sans-serif") return true;

	const bodyFallbacks = brandSnapshot.bodyFontFace?.fallbacks ?? [];
	if (bodyFallbacks.some((fallback) => normalizeFontFamilyKey(fallback) === "serif")) return false;
	if (bodyFallbacks.some((fallback) => normalizeFontFamilyKey(fallback) === "sans-serif")) return true;

	const headingCategory = brandSnapshot.headingFontFace?.category?.toLowerCase() ?? null;
	if (headingCategory === "sans-serif") return true;

	return !looksSerif(brandSnapshot.bodyFont ?? brandSnapshot.headingFont);
}

function buildBrandFontPlan(
	brandSnapshot: GeneratedToolBrandSnapshot,
	embeddedFaces: EmbeddedFontFace[],
	warnings: string[]
): BrandFontPlan {
	const embeddedFamilies = new Set(embeddedFaces.map((face) => face.family));
	const brandPrefersSansFallback = detectSansFallbackPreference(brandSnapshot);
	const body = buildRolePlan(
		brandSnapshot.bodyFontFace,
		brandSnapshot.bodyFont,
		embeddedFamilies
	);
	const heading = buildRolePlan(
		brandSnapshot.headingFontFace ?? brandSnapshot.bodyFontFace,
		brandSnapshot.headingFont ?? brandSnapshot.bodyFont,
		embeddedFamilies
	);
	const normalizedHeading =
		heading.embeddedFamily || !brandPrefersSansFallback || heading.stack !== SYSTEM_SERIF_STACK
			? heading
			: { ...heading, stack: SYSTEM_SANS_STACK };
	const unloadableFamilies = dedupeStrings(
		[brandSnapshot.bodyFont, brandSnapshot.headingFont, ...brandSnapshot.fonts].filter(
			(family) => Boolean(family) && !embeddedFamilies.has(family as string)
		)
	);
	return {
		css: embeddedFaces.map(buildFontFaceCss).join("\n"),
		body,
		heading: normalizedHeading,
		brandPrefersSansFallback,
		embeddedFamilies,
		unloadableFamilies,
		warnings,
	};
}

function buildDeterministicHeaderHtml(
	projectName: string,
	brandSnapshot: GeneratedToolBrandSnapshot
): string {
	const safeProjectName = escapeHtml(projectName.trim() || "Untitled tool");
	const safeBrandName = escapeHtml(brandSnapshot.brandName ?? "Brand");
	const logoMarkup =
		brandSnapshot.logoPolicy === "exact_asset" && brandSnapshot.logoDataUri
			? `<img class="ls-brand-lockup__logo" src="${brandSnapshot.logoDataUri}" alt="${safeBrandName} logo" />`
			: `<span class="ls-brand-lockup__wordmark">${safeBrandName}</span>`;

	return [
		'<header class="ls-brand-verified-header">',
		`  <div class="ls-brand-lockup ls-brand-lockup--${brandSnapshot.logoPolicy ?? "text_only"}">`,
		`    ${logoMarkup}`,
		"  </div>",
		'  <div class="ls-brand-verified-copy">',
		`    <h1>${safeProjectName}</h1>`,
		"  </div>",
		"</header>",
	].join("\n");
}

function appendCss(html: string, css: string): string {
	if (/<\/style>/i.test(html)) {
		return html.replace(/<\/style>/i, `${css}\n</style>`);
	}
	if (/<\/head>/i.test(html)) {
		return html.replace(/<\/head>/i, `<style>${css}</style></head>`);
	}
	return html;
}

function rewriteHeader(html: string, headerHtml: string): string {
	if (/<header\b[\s\S]*?<\/header>/i.test(html)) {
		return html.replace(/<header\b[\s\S]*?<\/header>/i, headerHtml);
	}
	if (/<main\b/i.test(html)) {
		return html.replace(/<main\b/i, `${headerHtml}\n<main`);
	}
	if (/<body([^>]*)>/i.test(html)) {
		return html.replace(/<body([^>]*)>/i, `<body$1>\n${headerHtml}`);
	}
	return html;
}

function stripHeaderBrandGraphics(html: string): string {
	return html.replace(
		/(<header\b[\s\S]*?)(<(?:svg|canvas)\b[\s\S]*?<\/(?:svg|canvas)>)([\s\S]*?<\/header>)/gi,
		(_match, start, _graphic, end) => `${start}${end}`
	);
}

function rewriteFontFamilies(html: string, plan: BrandFontPlan): string {
	const bodyStack = plan.body.stack;
	const headingStack = plan.heading.stack;
	let rewritten = html.replace(/font-family\s*:\s*([^;}{]+)([;}]?)/gi, (match, value, suffix, offset) => {
		const window = html.slice(Math.max(0, offset - 80), Math.min(html.length, offset + 40)).toLowerCase();
		const likelyHeading = /(h1|h2|h3|header|title|brand|wordmark)/.test(window);
		const nextValue = likelyHeading ? headingStack : bodyStack;
		return `font-family: ${nextValue}${suffix}`;
	});

	for (const family of plan.unloadableFamilies) {
		const patterns = [
			new RegExp(`(["'])${escapeRegex(family)}\\1`, "g"),
			new RegExp(`\\b${escapeRegex(family)}\\b`, "g"),
		];
		for (const pattern of patterns) {
			rewritten = rewritten.replace(pattern, bodyStack);
		}
	}

	return rewritten;
}

function scrubMismatchedSerifFallbacks(html: string, plan: BrandFontPlan): string {
	if (!plan.brandPrefersSansFallback) return html;

	return html.replace(/font-family\s*:\s*([^;}{]+)([;}]?)/gi, (match, value, suffix, offset) => {
		const normalizedValue = value.toLowerCase();
		if (!/\bserif\b/.test(normalizedValue) || /\bsans-serif\b/.test(normalizedValue)) {
			return match;
		}

		const window = html.slice(Math.max(0, offset - 80), Math.min(html.length, offset + 40)).toLowerCase();
		const likelyHeading = /(h1|h2|h3|h4|h5|h6|header|title|brand|wordmark)/.test(window);
		const replacement = likelyHeading ? plan.heading.stack : plan.body.stack;
		if (!replacement.includes("sans-serif")) return match;
		return `font-family: ${replacement}${suffix}`;
	});
}

function buildEnforcementCss(
	brandSnapshot: GeneratedToolBrandSnapshot,
	plan: BrandFontPlan
): string {
	const brandColor =
		brandSnapshot.colors.primary ??
		brandSnapshot.colors.text ??
		brandSnapshot.colors.accent ??
		"#111111";
	const textColor = brandSnapshot.colors.text ?? "#111111";

	return [
		plan.css,
		"body, input, button, select, textarea {",
		`  font-family: ${plan.body.stack} !important;`,
		"}",
		"h1, h2, h3, h4, h5, h6, .ls-brand-lockup__wordmark {",
		`  font-family: ${plan.heading.stack} !important;`,
		"}",
		".ls-brand-verified-header {",
		"  display: flex;",
		"  flex-wrap: wrap;",
		"  align-items: center;",
		"  gap: 1rem;",
		"  margin-bottom: 1.5rem;",
		"}",
		".ls-brand-lockup {",
		"  display: inline-flex;",
		"  align-items: center;",
		"  gap: 0.75rem;",
		"  min-width: 0;",
		"}",
		".ls-brand-lockup__logo {",
		"  display: block;",
		"  width: auto;",
		"  max-width: min(240px, 100%);",
		"  max-height: 3.5rem;",
		"  object-fit: contain;",
		"}",
		".ls-brand-lockup__wordmark {",
		"  display: inline-block;",
		`  color: ${brandColor};`,
		"  font-size: clamp(1.15rem, 2vw, 1.5rem);",
		"  font-weight: 700;",
		"  letter-spacing: -0.02em;",
		"  line-height: 1;",
		"}",
		".ls-brand-verified-copy {",
		"  min-width: 0;",
		"}",
		".ls-brand-verified-copy h1 {",
		"  margin: 0;",
		`  color: ${textColor};`,
		"}",
	]
		.filter(Boolean)
		.join("\n");
}

async function resolveBrandFontPlan(brandSnapshot: GeneratedToolBrandSnapshot): Promise<BrandFontPlan> {
	const warnings: string[] = [];
	const roleFaces: Array<{ face: GeneratedToolBrandFontFace; role: "body" | "heading" }> = [];
	if (brandSnapshot.bodyFontFace) {
		roleFaces.push({ face: brandSnapshot.bodyFontFace, role: "body" });
	}
	if (
		brandSnapshot.headingFontFace &&
		normalizeFontFamilyKey(brandSnapshot.headingFontFace.family) !==
			normalizeFontFamilyKey(brandSnapshot.bodyFontFace?.family ?? "")
	) {
		roleFaces.push({ face: brandSnapshot.headingFontFace, role: "heading" });
	}
	if (!roleFaces.length && brandSnapshot.headingFontFace) {
		roleFaces.push({ face: brandSnapshot.headingFontFace, role: "heading" });
	}

	const embeddedFaceMap = new Map<string, EmbeddedFontFace>();
	for (const candidate of roleFaces) {
		if (!isGoogleSelfHostable(candidate.face)) {
			warnings.push(
				`Brand font "${candidate.face.family}" is not Google-loadable from Context.dev metadata; using a system fallback stack instead.`
			);
			continue;
		}
		const embedded = await embedFontFace(candidate.face, candidate.role);
		if (!embedded) {
			warnings.push(
				`Could not self-host Google-loadable font "${candidate.face.family}"; using a system fallback stack instead.`
			);
			continue;
		}
		const existing = embeddedFaceMap.get(embedded.family);
		if (!existing || embedded.sources.length > existing.sources.length) {
			embeddedFaceMap.set(embedded.family, embedded);
		}
	}

	return buildBrandFontPlan(brandSnapshot, [...embeddedFaceMap.values()], warnings);
}

export async function enforceBrandPresentation(opts: {
	html: string;
	projectName: string;
	brandSnapshot: GeneratedToolBrandSnapshot | null;
}): Promise<{ sanitized: SanitizedHtml; warnings: string[] }> {
	if (!opts.brandSnapshot) {
		return { sanitized: sanitizeGeneratedHtml(opts.html), warnings: [] };
	}

	const plan = await resolveBrandFontPlan(opts.brandSnapshot);
	let html = opts.html;
	html = stripHeaderBrandGraphics(html);
	html = rewriteHeader(html, buildDeterministicHeaderHtml(opts.projectName, opts.brandSnapshot));
	html = rewriteFontFamilies(html, plan);
	html = appendCss(html, `\n${buildEnforcementCss(opts.brandSnapshot, plan)}\n`);
	html = scrubMismatchedSerifFallbacks(html, plan);

	return {
		sanitized: sanitizeGeneratedHtml(html),
		warnings: plan.warnings,
	};
}
