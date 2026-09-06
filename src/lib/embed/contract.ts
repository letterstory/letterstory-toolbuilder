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
const EMBED_MIN_HEIGHT_PX = 240;
const EMBED_FAILURE_TIMEOUT_MS = 8_000;

// No allow-same-origin: the generated document can run its own interactive
// JS and postMessage to the parent, but can't read this origin's cookies/
// storage or reach into the parent page — the isolation boundary for v1
// shared-server tool hosting. Auto-resize works fine without
// allow-same-origin since postMessage is inherently cross-origin.
export const IFRAME_SANDBOX = "allow-scripts allow-forms allow-popups allow-modals";

function domIdFor(toolId: string): string {
	return `letterstory-tool-${toolId}`;
}

function shellIdFor(toolId: string): string {
	return `${domIdFor(toolId)}-shell`;
}

function statusIdFor(toolId: string): string {
	return `${domIdFor(toolId)}-status`;
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
  function measureHeight(){
    var body = document.body;
    var doc = document.documentElement;
    return Math.max(
      Math.ceil(doc.getBoundingClientRect().height),
      doc.scrollHeight,
      doc.offsetHeight,
      body ? body.scrollHeight : 0,
      body ? body.offsetHeight : 0
    );
  }
  function postHeight(){
    var height = measureHeight();
    if (height === lastHeight) return;
    lastHeight = height;
    window.parent.postMessage({ source: ${JSON.stringify(TOOL_RESIZE_MESSAGE_SOURCE)}, version: ${TOOL_RESIZE_CONTRACT_VERSION}, toolId: toolId, height: height }, "*");
  }
  if (typeof ResizeObserver !== "undefined") {
    var observer = new ResizeObserver(postHeight);
    observer.observe(document.documentElement);
    if (document.body) observer.observe(document.body);
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
	return `<iframe id="${domIdFor(opts.toolId)}" src="${src}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" sandbox="${IFRAME_SANDBOX}" style="width:100%;min-height:${EMBED_MIN_HEIGHT_PX}px;border:0;display:block" title="${escapeHtmlAttribute(opts.projectName)}"></iframe>`;
}

/**
 * The parent-page listener script paired with the iframe tag above. Matches
 * incoming postMessages on four things before acting — the sending frame's
 * own window handle (`event.source === frame.contentWindow`), `source`
 * string, `version`, and `toolId` — so it won't misinterpret unrelated
 * postMessage traffic elsewhere on the customer's page. We intentionally do
 * not rely on `event.origin` here because the sandboxed iframe runs with an
 * opaque origin (`"null"`) unless we add `allow-same-origin`, which we do
 * not want for isolation.
 */
export function buildEmbedListenerScript(toolId: string): string {
	const domId = domIdFor(toolId);
	const statusId = statusIdFor(toolId);
	return `<script>(function(){
  var frame = document.getElementById(${JSON.stringify(domId)});
  var status = document.getElementById(${JSON.stringify(statusId)});
  if (!frame) return;
  var receivedResize = false;
  var fallbackTimer = null;
  function showStatus() {
    if (status) status.hidden = false;
  }
  function hideStatus() {
    if (status) status.hidden = true;
  }
  function clearFallbackTimer() {
    if (fallbackTimer !== null) {
      window.clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
  }
  function armFallbackTimer() {
    if (fallbackTimer !== null || receivedResize) return;
    fallbackTimer = window.setTimeout(function(){
      if (!receivedResize) showStatus();
    }, ${EMBED_FAILURE_TIMEOUT_MS});
  }
  function watchViewport() {
    if (typeof IntersectionObserver === "undefined") {
      armFallbackTimer();
      return;
    }
    try {
      var observer = new IntersectionObserver(function(entries){
        for (var i = 0; i < entries.length; i += 1) {
          if (entries[i] && entries[i].isIntersecting) {
            armFallbackTimer();
            observer.disconnect();
            return;
          }
        }
      }, { rootMargin: "300px 0px" });
      observer.observe(frame);
    } catch (e) {
      armFallbackTimer();
    }
  }
  frame.addEventListener("load", armFallbackTimer);
  frame.addEventListener("error", showStatus);
  window.addEventListener("message", function(event){
    if (frame.contentWindow && event.source !== frame.contentWindow) return;
    var data = event.data;
    if (!data || data.source !== ${JSON.stringify(TOOL_RESIZE_MESSAGE_SOURCE)} || data.version !== ${TOOL_RESIZE_CONTRACT_VERSION} || data.toolId !== ${JSON.stringify(toolId)}) return;
    if (typeof data.height === "number" && data.height > 0) {
      receivedResize = true;
      clearFallbackTimer();
      hideStatus();
      frame.style.height = Math.ceil(data.height) + "px";
    }
  });
  watchViewport();
})();</script>`;
}

/** Full embed snippet: iframe + its paired resize listener, ready to paste as-is. */
export function buildEmbedSnippet(opts: { origin: string; toolId: string; projectName: string }): string {
	const src = `${opts.origin}/t/${opts.toolId}`;
	const statusMarkup = `<p id="${statusIdFor(opts.toolId)}" hidden style="margin:12px 0 0;font:14px/1.5 system-ui,-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,sans-serif;color:#475569">The interactive tool is taking longer than expected. <a href="${escapeHtmlAttribute(src)}" target="_blank" rel="noreferrer" style="color:inherit;text-decoration:underline">Open it in a new tab.</a></p>`;
	const noscriptMarkup = `<noscript><p style="margin:12px 0 0;font:14px/1.5 system-ui,-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,sans-serif;color:#475569">JavaScript is required to auto-size this tool. <a href="${escapeHtmlAttribute(src)}" target="_blank" rel="noreferrer" style="color:inherit;text-decoration:underline">Open it in a new tab.</a></p></noscript>`;
	return [
		`<div id="${shellIdFor(opts.toolId)}">`,
		buildEmbedIframeTag(opts),
		statusMarkup,
		noscriptMarkup,
		`</div>`,
		buildEmbedListenerScript(opts.toolId),
	].join("\n");
}

function escapeHtmlAttribute(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}
