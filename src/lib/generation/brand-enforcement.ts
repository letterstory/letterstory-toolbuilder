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
const SYSTEM_SERIF_STACK = '"Iowan Old Style", Georgia, Cambria, "Times New Roman", Times, serif';
const BRAND_LOCKUP_SURFACE = "#FFFFFF";
const MIN_LOCKUP_TEXT_CONTRAST = 4.5;
const BRAND_ENFORCEMENT_STYLE_TAG = "data-letterstory-brand-enforcement";
const CTA_ORDER_STYLE_TAG = "data-letterstory-cta-order-style";
const CTA_ORDER_SCRIPT_TAG = "data-letterstory-cta-order";
const CTA_RESULT_MARKER =
	/data-letterstory-result\s*=\s*["']true["']|data-role\s*=\s*["']tool-result["']/i;
const CTA_BRAND_MARKER =
	/data-letterstory-brand-cta\s*=\s*["']true["']|data-role\s*=\s*["']brand-cta["']/i;

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
	warnings: string[];
}

type FontFallbackClassification = "serif" | "sans-serif" | "unknown";

const KNOWN_SERIF_FAMILY_TOKENS = [
	"times new roman",
	"times",
	"georgia",
	"garamond",
	"cambria",
	"iowan old style",
	"baskerville",
	"didot",
	"bodoni",
	"caslon",
	"palatino",
	"book antiqua",
	"playfair",
	"merriweather",
	"lora",
	"pt serif",
	"noto serif",
	"libre baskerville",
	"eb garamond",
	"crimson",
	"martina plantijn",
];

const KNOWN_SANS_FAMILY_TOKENS = [
	"sans-serif",
	"open sans",
	"franklin",
	"graphik",
	"helvetica",
	"arial",
	"roboto",
	"inter",
	"avenir",
	"proxima nova",
	"gotham",
	"sohne",
	"avant garde",
	"tt norms",
	"ttnorms",
	"dd norms",
	"circular",
	"akzidenz",
	"univers",
	"din",
	"grotesk",
	"grotesque",
	"neue haas",
];

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

function decodeHtmlEntities(value: string): string {
	return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, token: string) => {
		const normalized = token.toLowerCase();
		switch (normalized) {
			case "amp":
				return "&";
			case "lt":
				return "<";
			case "gt":
				return ">";
			case "quot":
				return '"';
			case "apos":
			case "#39":
				return "'";
			case "nbsp":
				return " ";
			default:
				break;
		}

		if (normalized.startsWith("#x")) {
			const codePoint = Number.parseInt(normalized.slice(2), 16);
			return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
		}

		if (normalized.startsWith("#")) {
			const codePoint = Number.parseInt(normalized.slice(1), 10);
			return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
		}

		return entity;
	});
}

function extractTextContent(htmlFragment: string): string {
	return decodeHtmlEntities(htmlFragment.replace(/<[^>]+>/g, " "));
}

function normalizeHeadingText(value: string): string {
	return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeFontFamilyKey(family: string): string {
	return family
		.trim()
		.replace(/^['"]+|['"]+$/g, "")
		.replace(/\s+/g, " ")
		.toLowerCase();
}

function matchesFontToken(value: string, tokens: string[]): boolean {
	return tokens.some((token) => value.includes(token));
}

function isKnownSerifFamily(family: string | null | undefined): boolean {
	if (!family) return false;
	const normalized = normalizeFontFamilyKey(family);
	if (normalized.includes("sans-serif")) return false;
	return matchesFontToken(normalized, KNOWN_SERIF_FAMILY_TOKENS) || normalized.includes("serif");
}

function isKnownSansFamily(family: string | null | undefined): boolean {
	if (!family) return false;
	const normalized = normalizeFontFamilyKey(family);
	if (matchesFontToken(normalized, KNOWN_SANS_FAMILY_TOKENS)) return true;
	return /\bsans\b/.test(normalized);
}

function classifyFontFallback(
	face: GeneratedToolBrandFontFace | null | undefined,
	family: string | null | undefined
): FontFallbackClassification {
	const preferredFamilies = dedupeStrings([family, face?.family]);
	for (const candidate of preferredFamilies) {
		if (isKnownSansFamily(candidate)) return "sans-serif";
		if (isKnownSerifFamily(candidate)) return "serif";
	}

	const fallbackFamilies = dedupeStrings(face?.fallbacks ?? []);
	for (const candidate of fallbackFamilies) {
		if (isKnownSansFamily(candidate)) return "sans-serif";
	}

	if ((face?.category ?? "").toLowerCase() === "sans-serif") return "sans-serif";
	return "unknown";
}

function inferSystemStack(
	face: GeneratedToolBrandFontFace | null | undefined,
	family: string | null | undefined
) {
	return classifyFontFallback(face, family) === "serif" ? SYSTEM_SERIF_STACK : SYSTEM_SANS_STACK;
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

function normalizeHexColor(value: string | null | undefined): string | null {
	if (!value) return null;
	const trimmed = value.trim();
	const shortHexMatch = trimmed.match(/^#([0-9a-f]{3})$/i);
	if (shortHexMatch) {
		const [r, g, b] = shortHexMatch[1].split("");
		return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
	}
	const longHexMatch = trimmed.match(/^#([0-9a-f]{6})$/i);
	return longHexMatch ? `#${longHexMatch[1].toUpperCase()}` : null;
}

function hexChannelToLinear(channelHex: string): number {
	const srgb = Number.parseInt(channelHex, 16) / 255;
	if (srgb <= 0.04045) return srgb / 12.92;
	return ((srgb + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
	const normalized = normalizeHexColor(hex);
	if (!normalized) return 0;
	const r = hexChannelToLinear(normalized.slice(1, 3));
	const g = hexChannelToLinear(normalized.slice(3, 5));
	const b = hexChannelToLinear(normalized.slice(5, 7));
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(left: string, right: string): number {
	const lighter = Math.max(relativeLuminance(left), relativeLuminance(right));
	const darker = Math.min(relativeLuminance(left), relativeLuminance(right));
	return (lighter + 0.05) / (darker + 0.05);
}

function selectWordmarkColor(brandSnapshot: GeneratedToolBrandSnapshot): string {
	const candidates = dedupeStrings([
		brandSnapshot.colors.text,
		brandSnapshot.colors.primary,
		brandSnapshot.colors.secondary,
		brandSnapshot.colors.accent,
		"#111111",
		"#000000",
	]).map((value) => normalizeHexColor(value));
	const normalizedCandidates = candidates.filter((value): value is string => Boolean(value));
	if (!normalizedCandidates.length) return "#111111";

	const accessible = normalizedCandidates.find(
		(candidate) => contrastRatio(candidate, BRAND_LOCKUP_SURFACE) >= MIN_LOCKUP_TEXT_CONTRAST
	);
	if (accessible) return accessible;

	return normalizedCandidates.reduce((best, candidate) =>
		contrastRatio(candidate, BRAND_LOCKUP_SURFACE) > contrastRatio(best, BRAND_LOCKUP_SURFACE)
			? candidate
			: best
	);
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

function selectFontEntries(
	face: GeneratedToolBrandFontFace,
	role: "body" | "heading"
): Array<[string, string]> {
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
	embeddedFamilies: Set<string>,
	fontFamilyMode: GeneratedToolBrandSnapshot["fontFamilyMode"] = "embedded_only"
): FontRolePlan {
	const systemStack = inferSystemStack(face, family);
	const normalizedFamily = family?.trim() ? family.trim() : null;
	if (normalizedFamily && embeddedFamilies.has(normalizedFamily)) {
		return {
			embeddedFamily: normalizedFamily,
			stack: `${quoteFontFamily(normalizedFamily)}, ${systemStack}`,
		};
	}
	if (normalizedFamily && fontFamilyMode === "named_with_fallback") {
		return {
			embeddedFamily: null,
			stack: `${quoteFontFamily(normalizedFamily)}, ${systemStack}`,
		};
	}
	return { embeddedFamily: null, stack: systemStack };
}

function buildBrandFontPlan(
	brandSnapshot: GeneratedToolBrandSnapshot,
	embeddedFaces: EmbeddedFontFace[],
	warnings: string[]
): BrandFontPlan {
	const embeddedFamilies = new Set(embeddedFaces.map((face) => face.family));
	const body = buildRolePlan(
		brandSnapshot.bodyFontFace,
		brandSnapshot.bodyFont,
		embeddedFamilies,
		brandSnapshot.fontFamilyMode
	);
	const heading = buildRolePlan(
		brandSnapshot.headingFontFace ?? brandSnapshot.bodyFontFace,
		brandSnapshot.headingFont ?? brandSnapshot.bodyFont,
		embeddedFamilies,
		brandSnapshot.fontFamilyMode
	);
	return {
		css: embeddedFaces.map(buildFontFaceCss).join("\n"),
		body,
		heading,
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

function upsertManagedHeadTag(
	html: string,
	tagName: "style" | "script",
	marker: string,
	content: string
): string {
	const tag = `<${tagName} ${marker}="true">\n${content}\n</${tagName}>`;
	const existingTag = new RegExp(
		`<${tagName}\\b[^>]*\\b${marker}=["']true["'][^>]*>[\\s\\S]*?<\\/${tagName}>\\s*`,
		"gi"
	);
	const withoutExisting = html.replace(existingTag, "");
	if (/<\/head>/i.test(withoutExisting)) {
		return withoutExisting.replace(/<\/head>/i, `${tag}\n</head>`);
	}
	if (/<body([^>]*)>/i.test(withoutExisting)) {
		return withoutExisting.replace(/<body([^>]*)>/i, `${tag}\n<body$1>`);
	}
	return `${tag}\n${withoutExisting}`;
}

function upsertBrandEnforcementStyleTag(html: string, css: string): string {
	return upsertManagedHeadTag(html, "style", BRAND_ENFORCEMENT_STYLE_TAG, css);
}

function upsertManagedBodyScriptTag(html: string, marker: string, script: string): string {
	const tag = `<script ${marker}="true">\n${script}\n</script>`;
	const existingTag = new RegExp(
		`<script\\b[^>]*\\b${marker}=["']true["'][^>]*>[\\s\\S]*?<\\/script>\\s*`,
		"gi"
	);
	const withoutExisting = html.replace(existingTag, "");
	if (/<\/body>/i.test(withoutExisting)) {
		return withoutExisting.replace(/<\/body>/i, `${tag}\n</body>`);
	}
	return `${withoutExisting}\n${tag}`;
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

function removeDuplicateProjectHeading(html: string, projectName: string): string {
	const normalizedProjectName = normalizeHeadingText(projectName);
	if (!normalizedProjectName) return html;

	return html.replace(
		/(<main\b[^>]*>)([\s\S]*?)(<\/main>)/i,
		(mainHtml, openingTag, content, closingTag) => {
			let removed = false;
			const updatedContent = content.replace(
				/<h([1-6])\b[^>]*>[\s\S]*?<\/h\1>/gi,
				(headingHtml: string) => {
					if (removed) return headingHtml;
					const headingText = normalizeHeadingText(extractTextContent(headingHtml));
					if (headingText !== normalizedProjectName) return headingHtml;
					removed = true;
					return "";
				}
			);

			return removed ? `${openingTag}${updatedContent}${closingTag}` : mainHtml;
		}
	);
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
	return html.replace(/font-family\s*:\s*([^;}{]+)([;}]?)/gi, (match, value, suffix, offset) => {
		const window = html
			.slice(Math.max(0, offset - 80), Math.min(html.length, offset + 40))
			.toLowerCase();
		const likelyHeading = /(h1|h2|h3|header|title|brand|wordmark)/.test(window);
		const nextValue = likelyHeading ? headingStack : bodyStack;
		return `font-family: ${nextValue}${suffix}`;
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
	const secondaryColor =
		brandSnapshot.colors.secondary ?? brandSnapshot.colors.accent ?? brandColor;
	const accentColor = brandSnapshot.colors.accent ?? brandSnapshot.colors.secondary ?? brandColor;
	const backgroundColor = brandSnapshot.colors.background ?? "#FFFFFF";
	const textColor = brandSnapshot.colors.text ?? "#111111";
	const wordmarkColor = selectWordmarkColor(brandSnapshot);

	return [
		plan.css,
		":root {",
		`  --ls-brand-color-primary: ${brandColor};`,
		`  --ls-brand-color-secondary: ${secondaryColor};`,
		`  --ls-brand-color-accent: ${accentColor};`,
		`  --ls-brand-color-background: ${backgroundColor};`,
		`  --ls-brand-color-text: ${textColor};`,
		"}",
		"body {",
		"  color: var(--ls-brand-color-text) !important;",
		"}",
		"input, button, select, textarea {",
		"  color: inherit;",
		"}",
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
		".ls-brand-lockup--exact_asset,",
		".ls-brand-lockup--text_only,",
		".ls-brand-verified-copy {",
		`  background: ${BRAND_LOCKUP_SURFACE};`,
		"  padding: 0.5rem 0.75rem;",
		"  border-radius: 0.75rem;",
		"  border: 1px solid rgba(17, 17, 17, 0.08);",
		"  box-shadow: 0 1px 2px rgba(17, 17, 17, 0.08);",
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
		`  color: ${wordmarkColor};`,
		"  font-size: clamp(1.15rem, 2vw, 1.5rem);",
		"  font-weight: 700;",
		"  letter-spacing: -0.02em;",
		"  line-height: 1;",
		"}",
		".ls-brand-verified-copy {",
		"  display: inline-flex;",
		"  align-items: center;",
		"  min-width: 0;",
		"  max-width: 100%;",
		"}",
		".ls-brand-verified-copy h1 {",
		"  margin: 0;",
		`  color: ${textColor};`,
		"}",
	]
		.filter(Boolean)
		.join("\n");
}

async function resolveBrandFontPlan(
	brandSnapshot: GeneratedToolBrandSnapshot
): Promise<BrandFontPlan> {
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

function buildCtaOrderEnforcementStyle(): string {
	return [
		'[data-letterstory-brand-cta="true"], [data-role="brand-cta"] {',
		"  display: none;",
		"  margin-top: 1.5rem;",
		"}",
	].join("\n");
}

function buildCtaOrderEnforcementScript(): string {
	return [
		"(() => {",
		"  const pick = (selectors) => selectors.map((selector) => document.querySelector(selector)).find(Boolean);",
		"  const result = pick(['[data-letterstory-result=\"true\"]', '[data-role=\"tool-result\"]']);",
		"  const cta = pick(['[data-letterstory-brand-cta=\"true\"]', '[data-role=\"brand-cta\"]']);",
		"  if (!(result instanceof HTMLElement) || !(cta instanceof HTMLElement)) return;",
		"  const anchor = result;",
		"  const desiredParent = anchor.parentElement ?? result.parentElement;",
		"  if (!desiredParent) return;",
		"  const sync = () => {",
		"    const relation = anchor.compareDocumentPosition(cta);",
		"    const isAlreadyAfter = Boolean(relation & Node.DOCUMENT_POSITION_FOLLOWING) && cta.parentElement === desiredParent;",
		"    if (!isAlreadyAfter) desiredParent.insertBefore(cta, anchor.nextSibling);",
		"    const computed = window.getComputedStyle(result);",
		"    const resultVisible = !result.hidden && computed.display !== 'none' && computed.visibility !== 'hidden';",
		"    cta.style.display = resultVisible ? 'block' : 'none';",
		"    cta.setAttribute('data-letterstory-cta-ordered', resultVisible ? 'visible' : 'waiting');",
		"  };",
		"  sync();",
		"  new MutationObserver(sync).observe(result, {",
		"    attributes: true,",
		"    childList: true,",
		"    subtree: true,",
		"    attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'],",
		"  });",
		"})();",
	].join("\n");
}

function enforceCtaOrdering(html: string): string {
	if (!CTA_BRAND_MARKER.test(html) || !CTA_RESULT_MARKER.test(html)) return html;
	const withStyle = upsertManagedHeadTag(
		html,
		"style",
		CTA_ORDER_STYLE_TAG,
		buildCtaOrderEnforcementStyle()
	);
	return upsertManagedBodyScriptTag(
		withStyle,
		CTA_ORDER_SCRIPT_TAG,
		buildCtaOrderEnforcementScript()
	);
}

export async function enforceBrandPresentation(opts: {
	html: string;
	projectName: string;
	brandSnapshot: GeneratedToolBrandSnapshot | null;
}): Promise<{ sanitized: SanitizedHtml; warnings: string[] }> {
	if (!opts.brandSnapshot) {
		return { sanitized: sanitizeGeneratedHtml(enforceCtaOrdering(opts.html)), warnings: [] };
	}

	const plan = await resolveBrandFontPlan(opts.brandSnapshot);
	let html = opts.html;
	html = stripHeaderBrandGraphics(html);
	html = rewriteHeader(html, buildDeterministicHeaderHtml(opts.projectName, opts.brandSnapshot));
	html = removeDuplicateProjectHeading(html, opts.projectName);
	html = rewriteFontFamilies(html, plan);
	html = upsertBrandEnforcementStyleTag(html, buildEnforcementCss(opts.brandSnapshot, plan));
	html = enforceCtaOrdering(html);

	return {
		sanitized: sanitizeGeneratedHtml(html),
		warnings: plan.warnings,
	};
}
