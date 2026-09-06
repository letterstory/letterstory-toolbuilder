"use client";

import type { BuilderBrandUpdateInput } from "@/components/tools/builder-types";

export type BrandFontCategory =
	| "sans-serif"
	| "serif"
	| "display"
	| "handwriting"
	| "monospace"
	| "system";

export type BrandFontOption = {
	name: string;
	category: BrandFontCategory;
};

export const BRAND_FONT_OPTIONS: readonly BrandFontOption[] = [
	{ name: "Abel", category: "sans-serif" },
	{ name: "Abril Fatface", category: "display" },
	{ name: "Alegreya", category: "serif" },
	{ name: "Alegreya Sans", category: "sans-serif" },
	{ name: "Alfa Slab One", category: "display" },
	{ name: "Anonymous Pro", category: "monospace" },
	{ name: "Anton", category: "display" },
	{ name: "Archivo", category: "sans-serif" },
	{ name: "Archivo Black", category: "display" },
	{ name: "Assistant", category: "sans-serif" },
	{ name: "Barlow", category: "sans-serif" },
	{ name: "Bebas Neue", category: "display" },
	{ name: "Bitter", category: "serif" },
	{ name: "Bungee", category: "display" },
	{ name: "Cabin", category: "sans-serif" },
	{ name: "Cardo", category: "serif" },
	{ name: "Caveat", category: "handwriting" },
	{ name: "Cinzel", category: "display" },
	{ name: "Cormorant Garamond", category: "serif" },
	{ name: "Courier Prime", category: "monospace" },
	{ name: "Crimson Text", category: "serif" },
	{ name: "Dancing Script", category: "handwriting" },
	{ name: "DM Sans", category: "sans-serif" },
	{ name: "Domine", category: "serif" },
	{ name: "EB Garamond", category: "serif" },
	{ name: "Figtree", category: "sans-serif" },
	{ name: "Fira Code", category: "monospace" },
	{ name: "Fraunces", category: "serif" },
	{ name: "Fredoka", category: "display" },
	{ name: "Gloria Hallelujah", category: "handwriting" },
	{ name: "Great Vibes", category: "handwriting" },
	{ name: "Hind", category: "sans-serif" },
	{ name: "IBM Plex Mono", category: "monospace" },
	{ name: "IBM Plex Sans", category: "sans-serif" },
	{ name: "Inconsolata", category: "monospace" },
	{ name: "Indie Flower", category: "handwriting" },
	{ name: "Instrument Sans", category: "sans-serif" },
	{ name: "Inter", category: "sans-serif" },
	{ name: "JetBrains Mono", category: "monospace" },
	{ name: "Jost", category: "sans-serif" },
	{ name: "Kalam", category: "handwriting" },
	{ name: "Kanit", category: "sans-serif" },
	{ name: "Karla", category: "sans-serif" },
	{ name: "Lato", category: "sans-serif" },
	{ name: "Lexend", category: "sans-serif" },
	{ name: "Libre Baskerville", category: "serif" },
	{ name: "Libre Franklin", category: "sans-serif" },
	{ name: "Lora", category: "serif" },
	{ name: "Manrope", category: "sans-serif" },
	{ name: "Merriweather", category: "serif" },
	{ name: "Montserrat", category: "sans-serif" },
	{ name: "Mulish", category: "sans-serif" },
	{ name: "Newsreader", category: "serif" },
	{ name: "Noto Serif", category: "serif" },
	{ name: "Nunito", category: "sans-serif" },
	{ name: "Open Sans", category: "sans-serif" },
	{ name: "Orbitron", category: "display" },
	{ name: "Oswald", category: "display" },
	{ name: "Outfit", category: "sans-serif" },
	{ name: "Pacifico", category: "handwriting" },
	{ name: "Patrick Hand", category: "handwriting" },
	{ name: "Playfair Display", category: "serif" },
	{ name: "Poppins", category: "sans-serif" },
	{ name: "PT Mono", category: "monospace" },
	{ name: "PT Serif", category: "serif" },
	{ name: "Public Sans", category: "sans-serif" },
	{ name: "Righteous", category: "display" },
	{ name: "Roboto", category: "sans-serif" },
	{ name: "Roboto Mono", category: "monospace" },
	{ name: "Rubik", category: "sans-serif" },
	{ name: "Sacramento", category: "handwriting" },
	{ name: "Satisfy", category: "handwriting" },
	{ name: "Shadows Into Light", category: "handwriting" },
	{ name: "Source Code Pro", category: "monospace" },
	{ name: "Source Sans 3", category: "sans-serif" },
	{ name: "Source Serif 4", category: "serif" },
	{ name: "Space Grotesk", category: "sans-serif" },
	{ name: "Space Mono", category: "monospace" },
	{ name: "Spectral", category: "serif" },
	{ name: "Staatliches", category: "display" },
	{ name: "system-ui", category: "system" },
	{ name: "Urbanist", category: "sans-serif" },
	{ name: "Vollkorn", category: "serif" },
	{ name: "Work Sans", category: "sans-serif" },
] as const;

export const BRAND_FONT_CATEGORY_LABELS: Record<BrandFontCategory, string> = {
	"sans-serif": "Sans Serif",
	serif: "Serif",
	display: "Display",
	handwriting: "Handwriting",
	monospace: "Monospace",
	system: "System",
};

const GOOGLE_FONT_OPTIONS = BRAND_FONT_OPTIONS.filter((font) => font.category !== "system");
const KNOWN_BRAND_FONTS = new Set(BRAND_FONT_OPTIONS.map((font) => font.name));

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function isValidHexColor(value: string): boolean {
	return HEX_COLOR_PATTERN.test(value.trim());
}

export function normalizeHexColor(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return "";
	const prefixed = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
	return prefixed.toUpperCase();
}

export function isKnownBrandFont(fontFamily: string | null | undefined): boolean {
	return Boolean(fontFamily && KNOWN_BRAND_FONTS.has(fontFamily.trim()));
}

export function filterBrandFontOptions({
	search,
	category,
}: {
	search: string;
	category: BrandFontCategory | "all";
}): BrandFontOption[] {
	const normalizedSearch = search.trim().toLowerCase();
	return BRAND_FONT_OPTIONS.filter((font) => {
		if (category !== "all" && font.category !== category) return false;
		if (!normalizedSearch) return true;
		return font.name.toLowerCase().includes(normalizedSearch);
	});
}

export function buildBrandFontsStylesheetHref(): string {
	const families = GOOGLE_FONT_OPTIONS.map((font) =>
		encodeURIComponent(font.name).replace(/%20/g, "+")
	);
	return `https://fonts.googleapis.com/css2?${families
		.map((family) => `family=${family}`)
		.join("&")}&display=swap`;
}

export function composeBrandUpdatePrompt(input: BuilderBrandUpdateInput): string {
	const instructions: string[] = [];
	const colorEntries = Object.entries(input.colors);

	if (colorEntries.length) {
		instructions.push(
			`Update the color palette to use ${joinWithAnd(
				colorEntries.map(([name, value]) => `${formatBrandFieldName(name)} ${normalizeHexColor(value)}`)
			)}.`
		);
	}

	if (input.fontFamily?.trim()) {
		instructions.push(
			`Change the primary heading and body font throughout the tool to ${input.fontFamily.trim()}, and apply that font family in the CSS for headings, body copy, inputs, and buttons.`
		);
	}

	instructions.push("Keep all functionality and layout exactly the same.");
	return instructions.join(" ");
}

export function applyBrandUpdateToSummary<T extends BuilderBrandUpdateSummaryTarget>(
	summary: T,
	input: BuilderBrandUpdateInput
): T {
	if (!summary.brandSnapshot) return summary;
	const nextFont = input.fontFamily?.trim();
	const existingFonts = summary.brandSnapshot.fonts ?? [];
	return {
		...summary,
		brandSnapshot: {
			...summary.brandSnapshot,
			colors: {
				...summary.brandSnapshot.colors,
				...Object.fromEntries(
					Object.entries(input.colors).map(([name, value]) => [name, normalizeHexColor(value)])
				),
			},
			fonts: nextFont
				? [nextFont, ...existingFonts.filter((font) => font !== nextFont)]
				: existingFonts,
			headingFont: nextFont ?? summary.brandSnapshot.headingFont,
			bodyFont: nextFont ?? summary.brandSnapshot.bodyFont,
		},
	};
}

type BuilderBrandUpdateSummaryTarget = {
	brandSnapshot: {
		colors: Record<string, string>;
		fonts: string[];
		headingFont?: string | null;
		bodyFont?: string | null;
	} | null;
};

function formatBrandFieldName(name: string): string {
	return name
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[_-]+/g, " ")
		.toLowerCase();
}

function joinWithAnd(items: string[]): string {
	if (items.length <= 1) return items[0] ?? "";
	if (items.length === 2) return `${items[0]} and ${items[1]}`;
	return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}
