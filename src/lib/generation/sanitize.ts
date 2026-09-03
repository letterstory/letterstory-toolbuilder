// Guards on LLM-generated tool HTML before it's stored and served to a live
// iframe embed.
//
// The generation prompt already instructs the model to produce a single
// self-contained document (no external network calls), but prompts are not a
// security boundary — this is a defense-in-depth pass that strips the most
// dangerous residual surface (remote script/stylesheet includes, which would
// let a compromised or misbehaving generation smuggle in arbitrary third-party
// code) before anything is persisted or rendered.
//
// This intentionally does NOT attempt full HTML sanitization (e.g. stripping
// all inline <script>) — inline script is the entire point of a functional
// generated tool. The remaining safety boundary is the iframe's sandbox
// attribute (no allow-same-origin), which keeps any residual script isolated
// from the parent page and our own origin's cookies/storage.

const REMOTE_SCRIPT_SRC = /<script\b[^>]*\bsrc\s*=\s*["']https?:\/\/[^"']*["'][^>]*>\s*<\/script>/gi;
const REMOTE_STYLESHEET_LINK = /<link\b[^>]*\brel\s*=\s*["']stylesheet["'][^>]*\bhref\s*=\s*["']https?:\/\/[^"']*["'][^>]*>/gi;
const REMOTE_STYLESHEET_LINK_REVERSED = /<link\b[^>]*\bhref\s*=\s*["']https?:\/\/[^"']*["'][^>]*\brel\s*=\s*["']stylesheet["'][^>]*>/gi;

export interface SanitizedHtml {
	html: string;
	warnings: string[];
}

export function sanitizeGeneratedHtml(rawHtml: string): SanitizedHtml {
	const warnings: string[] = [];
	let html = stripMarkdownFences(rawHtml).trim();

	if (!/^<!doctype html>/i.test(html)) {
		html = `<!doctype html>\n${html}`;
		warnings.push("Generated document was missing a doctype; one was added.");
	}

	const beforeScriptStrip = html;
	html = html.replace(REMOTE_SCRIPT_SRC, "<!-- removed: remote script include -->");
	if (html !== beforeScriptStrip) {
		warnings.push("Removed one or more remote <script src> includes — tools must be fully self-contained.");
	}

	const beforeStylesheetStrip = html;
	html = html
		.replace(REMOTE_STYLESHEET_LINK, "<!-- removed: remote stylesheet include -->")
		.replace(REMOTE_STYLESHEET_LINK_REVERSED, "<!-- removed: remote stylesheet include -->");
	if (html !== beforeStylesheetStrip) {
		warnings.push("Removed one or more remote stylesheet includes — tools must be fully self-contained.");
	}

	return { html, warnings };
}

export function looksLikeHtmlDocument(html: string): boolean {
	const trimmed = html.trim().toLowerCase();
	const hasOpeningHtml = trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html");
	// Also require a closing </html> so truncated generations (e.g. cut off by
	// max_tokens mid-document) are caught. sanitizeGeneratedHtml() always
	// prepends a doctype to whatever it's given, so checking the opening tag
	// alone would make this check pass unconditionally after sanitization.
	const hasClosingHtml = trimmed.endsWith("</html>");
	return hasOpeningHtml && hasClosingHtml;
}

function stripMarkdownFences(text: string): string {
	const trimmed = text.trim();
	const fenced = trimmed.match(/^```(?:html)?\s*\n([\s\S]*?)\n```$/i);
	return fenced ? fenced[1] : trimmed;
}
