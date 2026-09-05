import { describe, expect, it } from "vitest";

import { enforceBrandPresentation } from "../../src/lib/generation/brand-enforcement";
import type { GeneratedToolBrandSnapshot } from "../../src/lib/generation/store.types";

function extractEnforcementStyle(html: string): string {
	const match = html.match(
		/<style\s+data-letterstory-brand-enforcement="true">([\s\S]*?)<\/style>/i
	);
	return match?.[1] ?? "";
}

function extractManagedScript(html: string, marker: string): string {
	const match = html.match(new RegExp(`<script\\s+${marker}="true">([\\s\\S]*?)<\\/script>`, "i"));
	return match?.[1] ?? "";
}

function normalizeHexColor(value: string): string {
	const trimmed = value.trim();
	const shortHex = trimmed.match(/^#([0-9a-f]{3})$/i);
	if (shortHex) {
		const [r, g, b] = shortHex[1].split("");
		return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
	}
	const longHex = trimmed.match(/^#([0-9a-f]{6})$/i);
	if (!longHex) throw new Error(`Expected hex color, got: ${value}`);
	return `#${longHex[1].toUpperCase()}`;
}

function relativeLuminance(hex: string): number {
	const normalized = normalizeHexColor(hex);
	const toLinear = (channelHex: string) => {
		const srgb = Number.parseInt(channelHex, 16) / 255;
		return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
	};
	const r = toLinear(normalized.slice(1, 3));
	const g = toLinear(normalized.slice(3, 5));
	const b = toLinear(normalized.slice(5, 7));
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(left: string, right: string): number {
	const lighter = Math.max(relativeLuminance(left), relativeLuminance(right));
	const darker = Math.min(relativeLuminance(left), relativeLuminance(right));
	return (lighter + 0.05) / (darker + 0.05);
}

function makeBrandSnapshot(
	overrides: Partial<GeneratedToolBrandSnapshot>
): GeneratedToolBrandSnapshot {
	return {
		brandName: "Brand",
		colors: {
			primary: "#123456",
			secondary: "#654321",
			background: "#FFFFFF",
			text: "#111111",
		},
		fonts: [],
		logoPolicy: "text_only",
		logoDataUri: null,
		...overrides,
	};
}

describe("enforceBrandPresentation", () => {
	it("always emits a dedicated exact-asset lockup surface rule even when model css conflicts", async () => {
		const html = [
			"<!doctype html>",
			"<html><head>",
			"<style>",
			".ls-brand-lockup--exact_asset { background: transparent; padding: 0; border: 0; box-shadow: none; }",
			"header { background: #042B93; }",
			"</style>",
			"</head><body><header><div>Original</div></header><main></main></body></html>",
		].join("");
		const brandSnapshot = makeBrandSnapshot({
			brandName: "PayPal",
			colors: {
				primary: "#042B93",
				secondary: "#60CDFF",
				accent: "#012169",
				background: "#FFFFFF",
				text: "#000000",
			},
			logoPolicy: "exact_asset",
			logoDataUri: "data:image/png;base64,abc",
		});

		const result = await enforceBrandPresentation({
			html,
			projectName: "Invoice Late Fee Calculator",
			brandSnapshot,
		});

		const finalHtml = result.sanitized.html;
		const style = extractEnforcementStyle(finalHtml);
		expect(finalHtml).toContain('class="ls-brand-lockup ls-brand-lockup--exact_asset"');
		expect(finalHtml).toContain('src="data:image/png;base64,abc"');
		expect(style).toContain(
			".ls-brand-lockup--exact_asset,\n.ls-brand-lockup--text_only,\n.ls-brand-verified-copy {"
		);
		expect(style).toContain("background: #FFFFFF;");
		expect(finalHtml.indexOf('data-letterstory-brand-enforcement="true"')).toBeGreaterThan(
			finalHtml.indexOf(".ls-brand-lockup--exact_asset { background: transparent;")
		);
	});

	it("gives text-only wordmarks a deterministic contrast-safe surface and text color", async () => {
		const html =
			"<!doctype html><html><head><style>header { background: #ED943B; }</style></head><body><header><h1>Original</h1></header><main></main></body></html>";
		const brandSnapshot = makeBrandSnapshot({
			brandName: "Google",
			colors: {
				primary: "#ED943B",
				background: "#FFFFFF",
				text: "#ED943B",
			},
			logoPolicy: "text_only",
		});

		const result = await enforceBrandPresentation({
			html,
			projectName: "Search Spend Calculator",
			brandSnapshot,
		});

		const style = extractEnforcementStyle(result.sanitized.html);
		const sharedLockupBlock = style.match(
			/\.ls-brand-lockup--exact_asset,\s*\.ls-brand-lockup--text_only,\s*\.ls-brand-verified-copy\s*\{([\s\S]*?)\}/i
		)?.[1];
		const surfaceColor = sharedLockupBlock?.match(/background:\s*([^;]+);/i)?.[1]?.trim() ?? null;
		const wordmarkColor =
			style.match(/\.ls-brand-lockup__wordmark\s*\{[\s\S]*?color:\s*([^;]+);/i)?.[1]?.trim() ??
			null;

		expect(result.sanitized.html).toContain('class="ls-brand-lockup ls-brand-lockup--text_only"');
		expect(surfaceColor).toBe("#FFFFFF");
		expect(wordmarkColor).not.toBeNull();
		expect(contrastRatio(wordmarkColor!, surfaceColor!)).toBeGreaterThanOrEqual(4.5);
		expect(normalizeHexColor(wordmarkColor!)).not.toBe("#ED943B");
	});

	it("gives verified tool titles a deterministic contrast-safe surface inside dark headers", async () => {
		const html = [
			"<!doctype html>",
			"<html><head>",
			"<style>",
			"header { background: #000000; color: #FFFFFF; }",
			"</style>",
			"</head><body><header><h1>Original</h1></header><main></main></body></html>",
		].join("");
		const brandSnapshot = makeBrandSnapshot({
			brandName: "Gymshark",
			colors: {
				primary: "#7A7A7A",
				accent: "#4A4A4A",
				background: "#FFFFFF",
				text: "#000000",
			},
			logoPolicy: "text_only",
		});

		const result = await enforceBrandPresentation({
			html,
			projectName: "BMI Calculator Test",
			brandSnapshot,
		});

		const style = extractEnforcementStyle(result.sanitized.html);
		const verifiedCopyBlock = style.match(/\.ls-brand-verified-copy\s*\{([\s\S]*?)\}/i)?.[1] ?? "";
		const titleColor =
			style.match(/\.ls-brand-verified-copy h1\s*\{[\s\S]*?color:\s*([^;]+);/i)?.[1]?.trim() ??
			null;
		const surfaceColor = verifiedCopyBlock.match(/background:\s*([^;]+);/i)?.[1]?.trim() ?? null;

		expect(result.sanitized.html).toContain('class="ls-brand-verified-copy"');
		expect(result.sanitized.html).toContain("<h1>BMI Calculator Test</h1>");
		expect(surfaceColor).toBe("#FFFFFF");
		expect(titleColor).toBe("#000000");
		expect(contrastRatio(titleColor!, surfaceColor!)).toBeGreaterThanOrEqual(4.5);
		expect(verifiedCopyBlock).toContain("padding: 0.5rem 0.75rem;");
		expect(verifiedCopyBlock).toContain("border-radius: 0.75rem;");
	});

	it("injects CTA ordering helpers when generated markup opts into brand CTA markers", async () => {
		const html = [
			"<!doctype html>",
			"<html><head><style></style></head><body>",
			'<section data-letterstory-brand-cta="true"><a href="#">Explore product</a></section>',
			'<main><div data-letterstory-tool="true"><form><div data-letterstory-result="true">$362.50</div></form></div></main>',
			"</body></html>",
		].join("");

		const result = await enforceBrandPresentation({
			html,
			projectName: "Mileage Calculator",
			brandSnapshot: null,
		});

		const finalHtml = result.sanitized.html;
		const ctaStyle =
			finalHtml.match(
				/<style\s+data-letterstory-cta-order-style="true">([\s\S]*?)<\/style>/i
			)?.[1] ?? "";
		const ctaScript = extractManagedScript(finalHtml, "data-letterstory-cta-order");

		expect(ctaStyle).toContain('[data-letterstory-brand-cta="true"], [data-role="brand-cta"]');
		expect(ctaStyle).toContain("display: none;");
		expect(ctaScript).toContain('data-letterstory-result="true"');
		expect(ctaScript).toContain('data-letterstory-brand-cta="true"');
		expect(ctaScript).toContain("new MutationObserver(sync).observe(result");
		expect(ctaScript).toContain("cta.style.display = resultVisible ? 'block' : 'none';");
	});

	it("treats Robinhood's Martina Plantijn heading as serif when self-hosting is unavailable", async () => {
		const html =
			'<!doctype html><html><head><style>body{font-family:"Capsule Sans Text",serif;}h1{font-family:"Martina Plantijn",sans-serif;}</style></head><body><header><div>Original</div></header><main><h1>Hello</h1></main></body></html>';
		const brandSnapshot = makeBrandSnapshot({
			brandName: "Robinhood",
			colors: {
				primary: "#CCFF00",
				background: "#000000",
				text: "#FFFFFF",
			},
			headingFont: "Martina Plantijn",
			bodyFont: "Capsule Sans Text",
			logoPolicy: "exact_asset",
			logoDataUri: "data:image/png;base64,abc",
		});

		const result = await enforceBrandPresentation({
			html,
			projectName: "Compound Returns Estimator",
			brandSnapshot,
		});

		const style = extractEnforcementStyle(result.sanitized.html);
		expect(style).toContain(
			'body, input, button, select, textarea {\n  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;'
		);
		expect(style).toContain(
			'h1, h2, h3, h4, h5, h6, .ls-brand-lockup__wordmark {\n  font-family: "Iowan Old Style", Georgia, Cambria, "Times New Roman", Times, serif !important;'
		);
	});
});
