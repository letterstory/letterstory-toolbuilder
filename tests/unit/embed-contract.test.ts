import { describe, expect, it } from "vitest";
import {
	IFRAME_SANDBOX,
	TOOL_RESIZE_MESSAGE_SOURCE,
	buildEmbedIframeTag,
	buildEmbedListenerScript,
	buildEmbedSnippet,
	injectResizeReporter,
} from "@/lib/embed/contract";

describe("injectResizeReporter", () => {
	it("injects the reporter script before </body> when present", () => {
		const html = "<html><head></head><body><p>hi</p></body></html>";
		const result = injectResizeReporter(html, "tool-1");

		expect(result.indexOf("<script>")).toBeLessThan(result.indexOf("</body>"));
		expect(result).toContain('"tool-1"');
		expect(result).toContain(TOOL_RESIZE_MESSAGE_SOURCE);
	});

	it("falls back to injecting before </html> when </body> is missing", () => {
		const html = "<html><head></head><p>hi</p></html>";
		const result = injectResizeReporter(html, "tool-2");

		expect(result.indexOf("<script>")).toBeLessThan(result.indexOf("</html>"));
	});

	it("appends the script when neither </body> nor </html> are present", () => {
		const html = "<p>no wrapper tags here</p>";
		const result = injectResizeReporter(html, "tool-3");

		expect(result.startsWith(html)).toBe(true);
		expect(result).toContain("<script>");
	});

	it("is idempotent-safe per call: only one script block is added per invocation", () => {
		const html = "<html><body></body></html>";
		const result = injectResizeReporter(html, "tool-4");
		const scriptCount = result.split("<script>").length - 1;
		expect(scriptCount).toBe(1);
	});
});

describe("buildEmbedIframeTag", () => {
	it("includes the sandbox attribute, origin-based src, and tool id", () => {
		const tag = buildEmbedIframeTag({ origin: "https://example.com", toolId: "abc123", projectName: "My Tool" });

		expect(tag).toContain('src="https://example.com/t/abc123"');
		expect(tag).toContain('loading="lazy"');
		expect(tag).toContain(`sandbox="${IFRAME_SANDBOX}"`);
		expect(tag).toContain('id="letterstory-tool-abc123"');
		expect(tag).toContain('title="My Tool"');
	});

	it("escapes HTML-sensitive characters in the project name", () => {
		const tag = buildEmbedIframeTag({ origin: "https://example.com", toolId: "abc123", projectName: '<script>"&"</script>' });
		expect(tag).not.toContain("<script>\"&\"</script>");
		expect(tag).toContain("&lt;script&gt;");
	});

	it("does not set a fixed height, only a min-height fallback", () => {
		const tag = buildEmbedIframeTag({ origin: "https://example.com", toolId: "abc123", projectName: "My Tool" });
		expect(tag).toMatch(/min-height:\d+px/);
		expect(tag).toContain("display:block");
		expect(tag).not.toMatch(/[^-]height:\d+px/);
	});

	it("keeps the iframe sandbox isolated from same-origin access", () => {
		expect(IFRAME_SANDBOX).not.toContain("allow-same-origin");
		const tag = buildEmbedIframeTag({ origin: "https://example.com", toolId: "abc123", projectName: "My Tool" });
		expect(tag).toContain(`sandbox="${IFRAME_SANDBOX}"`);
	});
});

describe("buildEmbedListenerScript", () => {
	it("matches on source, toolId, and the iframe's own origin", () => {
		const script = buildEmbedListenerScript("abc123");
		expect(script).toContain('"letterstory-tool-abc123"');
		expect(script).toContain('"letterstory-tool-abc123-status"');
		expect(script).toContain(TOOL_RESIZE_MESSAGE_SOURCE);
		expect(script).toContain("event.origin");
		expect(script).toContain("data.version !== 1");
		expect(script).toContain('"abc123"');
	});

	it("resizes the iframe only when the message payload matches the contract", () => {
		const script = buildEmbedListenerScript("abc123");
		expect(script).toContain("frame.style.height = Math.ceil(data.height) + \"px\"");
		expect(script).toContain(`data.source !== ${JSON.stringify(TOOL_RESIZE_MESSAGE_SOURCE)}`);
		expect(script).toContain("IntersectionObserver");
		expect(script).toContain("showStatus");
	});
});

describe("buildEmbedSnippet", () => {
	it("combines the iframe tag, graceful fallback, and listener script", () => {
		const snippet = buildEmbedSnippet({ origin: "https://example.com", toolId: "abc123", projectName: "My Tool" });
		expect(snippet).toContain('<div id="letterstory-tool-abc123-shell">');
		expect(snippet).toContain("<iframe");
		expect(snippet).toContain("<noscript>");
		expect(snippet).toContain("Open it in a new tab.");
		expect(snippet).toContain("<script>");
		expect(snippet).toContain("letterstory-tool-abc123");
	});
});
