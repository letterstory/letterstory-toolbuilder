## 2026-09-04 — Context.dev cutover details for toolbuilder

- Toolbuilder now talks directly to Context.dev with `CONTEXT_DEV_API_KEY` and optional `CONTEXT_DEV_BASE_URL` (default `https://api.context.dev/v1`); Firecrawl env vars were removed.
- `pullBrandProfile()` remains the compatibility seam: it now maps Context.dev's `brand/retrieve`, `web/styleguide`, `web/fonts`, and `web/scrape/markdown` responses back into the existing `BrandProfile` shape so generation and the brand workspace keep the same downstream contract.
- Visual-similarity scoring in `/api/brand/compare` is temporarily unavailable after the cutover because the agreed Context.dev endpoint set does not include a screenshot source. The route still returns token-based distinctiveness and the UI now states that limitation explicitly instead of implying Anthropic-only gating.
- `/api/brand/validate` now uses Context.dev rendered markdown plus Anthropic text review instead of Firecrawl screenshots. The success payload exposes `referenceUrl` instead of `screenshotUrl` so the UI reflects the new evidence source honestly.
