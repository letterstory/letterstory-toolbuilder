// Shared iframe embed contract for generated tools — the auto-resizing
// behavior, sandbox flags, and postMessage shape used both when serving a
// tool (/t/[id], server side) and when building the copy-paste embed
// snippet shown in the Build workspace (client side). Centralized here
// (rather than duplicated in each place) so the two sides can never drift
// out of sync — the resize reporter injected into every served tool and the
// listener in the embed snippet always speak the same message shape.
//
// Versioned so the contract can change later without breaking tools
// generated under an older version: bump CONTRACT_VERSION and branch on it
// in the listener if a future change isn't backward compatible. Both sides
// currently only exist at version 1.

export const TOOL_RESIZE_MESSAGE_SOURCE = "letterstory-tool";
export const TOOL_RESIZE_CONTRACT_VERSION = 1;

// No allow-same-origin: the generated document can run its own interactive
// JS and postMessage to the parent, but can't read this origin's cookies/
// storage or reach into the parent page — the isolation boundary for v1
// shared-server tool hosting. Auto-resize works fine without
// allow-same-origin since postMessage is inherently cross-origin.
export const IFRAME_SANDBOX = "allow-scripts allow-forms allow-popups allow-modals";

function domIdFor(toolId: string): string {
	return `letterstory-tool-${toolId}`;
}

/**
 * Injects a small, deterministic resize-reporter script into a generated
 * tool's HTML right before serving it. Done at serve time (not baked in at
 * generation time) so: (1) a brand-new tool doesn't need to know its own id
 * before it has one, and (2) the contract can be upgraded for every
 * previously-generated tool retroactively just by changing this function —
 * no regeneration required.
 */
export function injectResizeReporter(html: string, toolId: string): string {
	const script = `<script>(function(){
  var toolId = ${JSON.stringify(toolId)};
  var lastHeight = 0;
  function postHeight(){
    var height = Math.ceil(document.documentElement.getBoundingClientRect().height);
    if (height === lastHeight) return;
    lastHeight = height;
    window.parent.postMessage({ source: ${JSON.stringify(TOOL_RESIZE_MESSAGE_SOURCE)}, version: ${TOOL_RESIZE_CONTRACT_VERSION}, toolId: toolId, height: height }, "*");
  }
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(postHeight).observe(document.documentElement);
  } else {
    window.addEventListener("resize", postHeight);
  }
  window.addEventListener("load", postHeight);
  postHeight();
})();</script>`;

	if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${script}\n</body>`);
	if (/<\/html>/i.test(html)) return html.replace(/<\/html>/i, `${script}\n</html>`);
	return `${html}\n${script}`;
}

/**
 * Builds the <iframe> tag customers paste into their CMS. Deliberately has
 * no fixed height: the paired listener script (see buildEmbedListenerScript)
 * resizes it in response to the tool's own postMessage reports, so tools of
 * wildly different content heights all fit without the customer having to
 * guess a pixel value up front. `min-height` is only a pre-resize fallback
 * to avoid a zero-height flash before the first message arrives.
 */
export function buildEmbedIframeTag(opts: { origin: string; toolId: string; projectName: string }): string {
	const src = `${opts.origin}/t/${opts.toolId}`;
	return `<iframe id="${domIdFor(opts.toolId)}" src="${src}" sandbox="${IFRAME_SANDBOX}" style="width:100%;min-height:200px;border:0" title="${escapeHtmlAttribute(opts.projectName)}"></iframe>`;
}

/**
 * The parent-page listener script paired with the iframe tag above. Matches
 * incoming postMessages on three things before acting — `source` string,
 * `toolId`, and the sending frame's own origin (derived from the iframe's
 * `src` at runtime, not hardcoded, so this snippet works unmodified whether
 * the tool is served from a dev/staging/prod domain) — so it won't
 * misinterpret unrelated postMessage traffic elsewhere on the customer's
 * page, and won't let some other frame spoof a resize for this tool.
 */
export function buildEmbedListenerScript(toolId: string): string {
	const domId = domIdFor(toolId);
	return `<script>(function(){
  var frame = document.getElementById(${JSON.stringify(domId)});
  if (!frame) return;
  var expectedOrigin = null;
  try { expectedOrigin = new URL(frame.src, window.location.href).origin; } catch (e) {}
  window.addEventListener("message", function(event){
    if (expectedOrigin && event.origin !== expectedOrigin) return;
    var data = event.data;
    if (!data || data.source !== ${JSON.stringify(TOOL_RESIZE_MESSAGE_SOURCE)} || data.toolId !== ${JSON.stringify(toolId)}) return;
    if (typeof data.height === "number" && data.height > 0) {
      frame.style.height = data.height + "px";
    }
  });
})();</script>`;
}

/** Full embed snippet: iframe + its paired resize listener, ready to paste as-is. */
export function buildEmbedSnippet(opts: { origin: string; toolId: string; projectName: string }): string {
	return [buildEmbedIframeTag(opts), buildEmbedListenerScript(opts.toolId)].join("\n");
}

function escapeHtmlAttribute(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}
