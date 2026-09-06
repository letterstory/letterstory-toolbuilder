import { describe, expect, it } from "vitest";
import {
	applyBrandUpdateToSummary,
	BRAND_FONT_OPTIONS,
	buildBrandFontsStylesheetHref,
	composeBrandUpdatePrompt,
	filterBrandFontOptions,
	isKnownBrandFont,
	isValidHexColor,
	normalizeHexColor,
} from "@/components/tools/builder-brand-update";

describe("builder brand update helpers", () => {
	it("composes a revision prompt using only the changed brand fields", () => {
		expect(
			composeBrandUpdatePrompt({
				colors: {
					primary: "#1a2b3c",
					backgroundColor: "ffffff",
				},
				fontFamily: "Poppins",
			})
		).toBe(
			"Update the color palette to use primary #1A2B3C and background color #FFFFFF. Change the primary heading and body font throughout the tool to Poppins, and apply that font family in the CSS for headings, body copy, inputs, and buttons. Keep all functionality and layout exactly the same."
		);
	});

	it("normalizes and validates six-digit hex colors", () => {
		expect(normalizeHexColor("abc123")).toBe("#ABC123");
		expect(isValidHexColor("#ABC123")).toBe(true);
		expect(isValidHexColor("#FFF")).toBe(false);
	});

	it("exposes a curated searchable font catalog with system-ui kept local", () => {
		expect(BRAND_FONT_OPTIONS).toHaveLength(84);
		expect(isKnownBrandFont("Inter")).toBe(true);
		expect(isKnownBrandFont("system-ui")).toBe(true);
		expect(isKnownBrandFont("Made Up Font")).toBe(false);
		expect(
			filterBrandFontOptions({
				search: "source",
				category: "all",
			}).map((font) => font.name)
		).toEqual(["Source Code Pro", "Source Sans 3", "Source Serif 4"]);
		expect(
			filterBrandFontOptions({
				search: "",
				category: "handwriting",
			}).map((font) => font.name)
		).toContain("Pacifico");
		expect(buildBrandFontsStylesheetHref()).toContain("family=Playfair+Display");
		expect(buildBrandFontsStylesheetHref()).not.toContain("family=system-ui");
	});

	it("applies edited colors and fonts onto the visible brand snapshot", () => {
		expect(
			applyBrandUpdateToSummary(
				{
					brandSnapshot: {
						colors: { primary: "#533AFD", background: "#FFFFFF" },
						fonts: ["sohne-var", "system-ui"],
						headingFont: "sohne-var",
						bodyFont: "sohne-var",
					},
				},
				{
					colors: { primary: "#1A2B3C" },
					fontFamily: "Poppins",
				}
			)
		).toEqual({
			brandSnapshot: {
				colors: { primary: "#1A2B3C", background: "#FFFFFF" },
				fonts: ["Poppins", "sohne-var", "system-ui"],
				headingFont: "Poppins",
				bodyFont: "Poppins",
			},
		});
	});
});
