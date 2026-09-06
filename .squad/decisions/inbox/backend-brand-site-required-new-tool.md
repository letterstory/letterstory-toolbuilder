### 2026-09-06: New-tool generation now requires brand site, not tool name
**By:** Backend
**What:** Shared generation validation now requires `siteUrl` only for brand-new tool creation, allows empty `projectName` to flow downstream as `""`, and preserves revision behavior when `toolId` is present.
**Why:** Mir flipped the required fields for new tool generation so REST, MCP, and CLI all enforce brand-site-first creation while continuing to rely on existing downstream `Untitled tool` fallbacks and revision defaults.
