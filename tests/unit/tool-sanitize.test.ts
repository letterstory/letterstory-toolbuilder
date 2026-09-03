import { describe, expect, it } from "vitest";
import { looksLikeHtmlDocument, sanitizeGeneratedHtml } from "../../src/lib/generation/sanitize";

describe("sanitizeGeneratedHtml", () => {
	it("passes through a well-formed self-contained document unchanged (besides trimming)", () => {
		const html = "<!doctype html>\n<html><head><style>body{}</style></head><body>hi</body></html>";
		const result = sanitizeGeneratedHtml(html);
		expect(result.html).toBe(html);
		expect(result.warnings).toEqual([]);
	});

	it("adds a missing doctype and warns", () => {
		const result = sanitizeGeneratedHtml("<html><body>hi</body></html>");
		expect(result.html.startsWith("<!doctype html>\n")).toBe(true);
		expect(result.warnings).toContain("Generated document was missing a doctype; one was added.");
	});

	it("strips remote <script src> includes and warns", () => {
		const html =
			"<!doctype html><html><head><script src=\"https://evil.example.com/x.js\"></script></head><body></body></html>";
		const result = sanitizeGeneratedHtml(html);
		expect(result.html).not.toContain("evil.example.com");
		expect(result.html).toContain("removed: remote script include");
		expect(result.warnings.some((w) => w.includes("remote <script src>"))).toBe(true);
	});

	it("strips remote stylesheet <link> includes regardless of attribute order", () => {
		const forward =
			"<!doctype html><html><head><link rel=\"stylesheet\" href=\"https://fonts.example.com/a.css\"></head><body></body></html>";
		const reversed =
			"<!doctype html><html><head><link href=\"https://fonts.example.com/a.css\" rel=\"stylesheet\"></head><body></body></html>";

		for (const html of [forward, reversed]) {
			const result = sanitizeGeneratedHtml(html);
			expect(result.html).not.toContain("fonts.example.com");
			expect(result.warnings.some((w) => w.includes("remote stylesheet"))).toBe(true);
		}
	});

	it("strips multiple remote script includes, not just the first", () => {
		const html = [
			"<!doctype html><html><head>",
			"<script src=\"https://a.example.com/1.js\"></script>",
			"<script src=\"https://b.example.com/2.js\"></script>",
			"</head><body></body></html>",
		].join("");
		const result = sanitizeGeneratedHtml(html);
		expect(result.html).not.toContain("a.example.com");
		expect(result.html).not.toContain("b.example.com");
	});

	it("strips a leading markdown code fence", () => {
		const html = "```html\n<!doctype html><html><body>hi</body></html>\n```";
		const result = sanitizeGeneratedHtml(html);
		expect(result.html.startsWith("<!doctype html>")).toBe(true);
		expect(result.html).not.toContain("```");
	});

	it("leaves inline scripts and local styles untouched", () => {
		const html =
			"<!doctype html><html><head><style>body{color:red}</style></head><body><script>console.log(1)</script></body></html>";
		const result = sanitizeGeneratedHtml(html);
		expect(result.html).toContain("<script>console.log(1)</script>");
		expect(result.html).toContain("<style>body{color:red}</style>");
	});
});

describe("looksLikeHtmlDocument", () => {
	it("accepts complete documents starting with a doctype or <html> and ending with </html>", () => {
		expect(looksLikeHtmlDocument("<!doctype html><html></html>")).toBe(true);
		expect(looksLikeHtmlDocument("  <HTML><body></body></HTML>")).toBe(true);
	});

	it("rejects non-HTML output", () => {
		expect(looksLikeHtmlDocument("Sorry, I can't help with that.")).toBe(false);
		expect(looksLikeHtmlDocument("")).toBe(false);
	});

	it("rejects truncated documents missing a closing </html>", () => {
		expect(looksLikeHtmlDocument("<!doctype html><html><body>cut off mid-sent")).toBe(false);
	});
});
