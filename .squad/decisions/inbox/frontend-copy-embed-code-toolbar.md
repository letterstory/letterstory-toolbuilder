### 2026-09-06: Preview toolbar now exposes copyable embed snippets
**By:** Frontend
**What:** Wired `buildEmbedSnippet()` into `BuilderPreviewCanvas` and added a new ghost icon "Copy embed code" button beside the existing preview URL copy control. The button copies the full iframe + listener-script snippet for the active tool using `window.location.origin`, `activeTool.id`, and `activeTool.projectName`, and mirrors the existing copy-success checkmark/reset behavior.
**Why:** The embed contract already existed but was dead code in the UI, leaving users without any way to retrieve the designed iframe snippet from the builder preview surface where they expect publish/share actions to live.
